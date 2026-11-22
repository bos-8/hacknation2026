"""Render a validated form plan into the COI import contract."""

from collections import Counter
from dataclasses import replace
from uuid import UUID, uuid5

from pyworker.coi import (
    CoiField,
    CoiFlow,
    CoiForm,
    CoiLink,
    CoiQuestion,
    CoiResult,
    CoiTab,
    ExtractedTab,
    Extraction,
    FieldConfidence,
    FieldLocation,
    ReadDocument,
    find_regions,
    render_field,
    show_condition,
)
from pyworker.extended_form import compile_extended
from pyworker.form_ir import ReviewItem, assess, normalized, rule_choices
from pyworker.form_plan import prepare_form
from pyworker.legal_profiles import ProfileUnavailable
from pyworker.observed_answers import answer_index


def show_state(expression, paths):
    def query(term):
        if term["op"] in {"eq", "ne"}:
            ref, option = term["args"]
            path = paths[ref["path"].removeprefix("/")]
            return show_condition(
                *path,
                option["value"],
                unequal=term["op"] == "ne",
                repeating=ref.get("scope") == "item",
            )["query"]
        separator = " " + term["op"] + " "
        return "(" + separator.join(query(arg) for arg in term["args"]) + ")"

    return {"type": "SHOW", "query": query(expression)}


def convert_to_coi(
    result: Extraction,
    document: ReadDocument,
    form_id: UUID,
    *,
    semantic_mode="EXTENDED",
    as_of=None,
    visual=False,
) -> CoiResult:
    assessment = assess(" ".join(b.text for b in document.blocks), document.sha256)
    plan = None
    if semantic_mode == "EXTENDED" and assessment.documentId == "D03":
        try:
            plan = compile_extended(assessment, form_id, as_of, document=document)
        except ProfileUnavailable:
            pass
    if plan is None:
        plan = prepare_form(
            result,
            document,
            form_id,
            assessment,
            use_standard_tax_profile=semantic_mode == "STANDARD",
        )
        if semantic_mode == "EXTENDED":
            plan.ir.review.append(
                ReviewItem(nodeId=plan.ir.form["id"], reason="no_applicable_legal_profile")
            )
    if visual and any(item.name for items in plan.sections.values() for item in items):
        merge_profile_observations(plan, result, document, form_id)
    return render_plan(plan, document, form_id)


def merge_profile_observations(plan, observed, document, form_id):
    """Keep profile rules while grounding known controls and retaining additional visible inputs."""
    places = {}
    evidence = {entry.id: entry for entry in plan.ir.evidence}
    pages = {block.id: block.page for block in document.blocks}
    for fields in plan.sections.values():
        for index, item in enumerate(fields):
            places.setdefault(normalized(item.source.label), []).append((fields, index))
    seen_inputs = {
        block
        for fields in plan.sections.values()
        for item in fields
        for block in item.source.input_blocks
    }
    counts = Counter(
        normalized(f.label) for t in observed.tabs for s in t.sections for f in s.fields
    )
    remaining = []
    for tab in observed.tabs:
        for section in tab.sections:
            additional = []
            for field in section.fields:
                if not field.input_blocks or seen_inputs.intersection(field.input_blocks):
                    continue
                label = normalized(field.label)
                matches = places.get(label, [])
                if counts[label] == 1 and len(matches) == 1:
                    fields, i = matches[0]
                    item = fields[i]
                    source = item.source.model_copy(
                        update={
                            "label_blocks": field.label_blocks,
                            "input_blocks": field.input_blocks,
                            "confidence": field.confidence,
                            "observed_value": field.observed_value,
                        }
                    )
                    fields[i] = replace(item, source=source)
                    entry = evidence.get("e.f." + str(uuid5(form_id, "field-" + item.name)))
                    if entry:
                        entry.blocks = list(
                            dict.fromkeys([*entry.blocks, *field.label_blocks, *field.input_blocks])
                        )
                        entry.pages = sorted(set(entry.pages) | {pages[b] for b in entry.blocks})
                else:
                    additional.append(field)
            if additional:
                remaining.append(section.model_copy(update={"fields": additional}))
    if not remaining:
        return
    first_tab = plan.extraction.tabs[0]
    for offset in range(0, len(remaining), 40):
        sections = remaining[offset : offset + 40]
        extra = prepare_form(
            Extraction(
                title=observed.title, tabs=[ExtractedTab(title=first_tab.title, sections=sections)]
            ),
            document,
            form_id,
            plan.ir.procedure.model_copy(update={"documentId": None}),
            first_section=len(first_tab.sections) + 1,
        )
        first_tab.sections.extend(sections)
        plan.sections.update(extra.sections)
        additions = extra.ir.form["children"][0]["children"]
        plan.ir.form["children"][0]["children"].extend(additions)
        plan.ir.review.extend(
            ReviewItem(nodeId=s["id"], reason="verify_visual_fields") for s in additions
        )
        plan.ir.review.extend(extra.ir.review)
        plan.ir.rules.extend(extra.ir.rules)
        plan.ir.evidence.extend(extra.ir.evidence)


def render_plan(plan, document, form_id):
    choices = rule_choices(plan.ir.form, plan.ir.rules, plan.ir.evidence)
    result = plan.extraction
    blocks = {block.id: block for block in document.blocks} if document else {}
    observed = answer_index(document)
    label_counts = Counter(
        item.source.label.casefold() for group in plan.sections.values() for item in group
    )
    source_answers = {}
    locations = []
    confidences = []
    tabs = []
    paths = {}
    conditional_fields = {}
    used_names = set()

    def unique_name(base):
        candidate = base
        occurrence = 1
        while candidate in used_names:
            occurrence += 1
            candidate = f"{base}_{occurrence}"
        used_names.add(candidate)
        return candidate

    for tab_index, tab in enumerate(result.tabs, 1):
        sections = []
        row = 0
        for section_index, section in enumerate(tab.sections, 1):
            section_key = f"{tab_index}-{section_index}"
            fields = []
            planned_fields = plan.sections[tab_index, section_index]
            profiled = bool(planned_fields[0].name)
            scope = normalized(f"{tab.title} {section.title}").replace(" ", "_")
            section_slug = normalized(section.title).replace(" ", "_") if profiled else scope
            section_name = unique_name("sekcja_" + section_slug)
            field_row = 0
            for field_index, planned in enumerate(planned_fields, 1):
                spec = planned.source
                key = planned.name or f"{section_key}-{field_index}"
                field_id = uuid5(form_id, f"field-{key}")
                label = find_regions(spec.label_blocks, blocks, input_region=False)
                inputs = find_regions(spec.input_blocks, blocks, input_region=True)
                if label or inputs:
                    locations.append(FieldLocation(field_id=field_id, label=label, input=inputs))
                scores = [blocks[block_id].ocr_confidence for block_id in spec.label_blocks]
                confidence = (
                    min(score for score in scores if score is not None)
                    if scores and None not in scores
                    else None
                )
                if spec.confidence is not None:
                    confidences.append(
                        FieldConfidence(
                            field_id=field_id,
                            confidence=spec.confidence,
                            ocr_confidence=confidence,
                        )
                    )
                slug = normalized(spec.label).replace(" ", "_") or "pole"
                name = unique_name(planned.name or f"{scope}_{slug}")
                question = render_field(spec, field_id, name, field_index, field_row)
                if spec.type in {
                    "TEXT_FIELD",
                    "TEXTAREA",
                    "NUMBER",
                    "DATEPICKER",
                    "SELECT",
                    "RADIO",
                    "CHECKBOX",
                }:
                    values = observed.get(spec.label.casefold(), set())
                    evidence_blocks = [
                        blocks[i].text.strip() for i in spec.input_blocks if i in blocks
                    ]
                    if spec.observed_value and (
                        spec.observed_value in values or spec.observed_value in evidence_blocks
                    ):
                        source_answers[field_id] = spec.observed_value
                    elif len(values) == 1 and label_counts[spec.label.casefold()] == 1:
                        source_answers[field_id] = next(iter(values))
                if planned.option_codes:
                    for option, code in zip(
                        question.field.options, planned.option_codes, strict=True
                    ):
                        option.id = code
                        option.techName = code.lower()
                node_id = f"f.{field_id}"
                paths[node_id] = (tab.title, section_name, question.field.techName)
                conditional_fields[node_id] = question.field
                fields.append(question)
                field_row += question.rows
            rows = field_row + 1
            sections.append(
                CoiQuestion(
                    y=row,
                    rows=rows,
                    field=CoiField(
                        id=uuid5(form_id, "section-" + (section_name if profiled else section_key)),
                        type="REPEATING_SECTION" if section.repeating else "SECTION",
                        techName=section_name,
                        title=section.title,
                        questionOrder=section_index,
                        repeatingSectionGrid=fields,
                    ),
                )
            )
            conditional_fields["section." + section_key] = sections[-1].field
            row += rows
        tabs.append(
            CoiTab(
                id=uuid5(form_id, f"tab-{tab_index}"),
                title=tab.title,
                type="FINISH" if plan.ir.extended and tab_index == len(result.tabs) else "MAIN",
                questions=sections,
            )
        )
    for target, expression in choices.items():
        conditional_fields[target].states.append(show_state(expression, paths))
    if not plan.ir.extended:
        tabs.append(finish_tab(form_id))
    links = [
        CoiLink(
            id=uuid5(form_id, f"link-{source.id}-{target.id}"), source=source.id, target=target.id
        )
        for source, target in zip(tabs[:-1], tabs[1:], strict=True)
    ]
    return CoiResult(
        source_answers=source_answers,
        form_ir=plan.ir,
        draft=CoiForm(title=result.title, tabs=tabs, flow=CoiFlow(links=links)),
        field_locations=locations,
        field_confidences=confidences,
    )


def finish_tab(form_id):
    return CoiTab(
        id=uuid5(form_id, "finish"),
        title="Podsumowanie",
        type="FINISH",
        questions=[
            CoiQuestion(
                y=0,
                rows=2,
                field=CoiField(
                    id=uuid5(form_id, "finish-info"),
                    type="SECTION",
                    techName="podsumowanie",
                    title="Podsumowanie",
                    questionOrder=1,
                    repeatingSectionGrid=[
                        CoiQuestion(
                            y=0,
                            rows=1,
                            field=CoiField(
                                id=uuid5(form_id, "finish-preview"),
                                type="INFO_SECTION",
                                techName="sprawdz_wniosek",
                                title="Sprawdź wniosek",
                                description="Sprawdź dane przed wysłaniem formularza.",
                                questionOrder=1,
                            ),
                        )
                    ],
                ),
            )
        ],
    )

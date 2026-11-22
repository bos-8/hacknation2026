"""Shared field and condition builder for reviewed procedure templates."""

from dataclasses import dataclass, field
from uuid import UUID, uuid5

from pyworker.coi import ExtractedField, ExtractedSection, ExtractedTab, Extraction
from pyworker.form_ir import answer_is


@dataclass
class ProfileControl:
    name: str
    evidence_key: str | None
    quote: str
    actor: str
    when: dict | None
    design: bool
    config: dict = field(default_factory=dict)
    review: str | None = None
    reference: str | None = None


def conjunction(*conditions):
    return {"op": "and", "args": list(conditions)}


class ProfileBuilder:
    def __init__(self, form_id: UUID):
        self.form_id = form_id
        self.tabs = {}
        self.controls = {}

    def choice(self, name, *options):
        controller = "f." + str(uuid5(self.form_id, "field-" + name))
        terms = [answer_is(controller, option) for option in options]
        return terms[0] if len(terms) == 1 else {"op": "or", "args": terms}

    def add(
        self,
        tab,
        section,
        name,
        title,
        source,
        *,
        kind="TEXT_FIELD",
        quote="",
        actor="applicant",
        when=None,
        design=False,
        config=None,
        review=None,
        reference=None,
        **spec,
    ):
        control = ExtractedField(label=title, type=kind, **spec)
        self.tabs.setdefault(tab, {}).setdefault(section, []).append(control)
        self.controls[id(control)] = ProfileControl(
            name, source, quote, actor, when, design, config or {}, review, reference
        )

    def finish(self, title):
        extraction = Extraction(
            title=title,
            tabs=[
                ExtractedTab(
                    title=title,
                    sections=[
                        ExtractedSection(
                            title=label, fields=fields, repeating=label == "Pozostali reprezentanci"
                        )
                        for label, fields in sections.items()
                    ],
                )
                for title, sections in self.tabs.items()
            ],
        )
        return extraction, self.controls

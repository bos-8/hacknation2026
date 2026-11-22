"""D04 electronic form, scoped to the reviewed Elbląg blank."""

import re
from html import escape

from pyworker.profile_builder import ProfileBuilder, conjunction

ADDRESS_LEVELS = (
    ("wojewodztwo", "Województwo"),
    ("powiat", "Powiat"),
    ("gmina", "Gmina"),
    ("miejscowosc", "Miejscowość"),
    ("ulica", "Ulica"),
)


def privacy_notice(document):
    text = "\n".join(block.text for block in document.blocks if block.kind != "input")
    heading = re.search(r"(?im)^\s*(?:#+\s*)?klauzula informacyjna\s*$", text)
    if not heading:
        return ""
    notice = re.split(
        r"(?im)^\s*(?:1\s*)?\)\s*Dane nieobowiązkowe\.", text[heading.end() :], maxsplit=1
    )[0]
    paragraphs = re.split(r"\n(?=\s*(?:\d+[.]\s|[-–]\s|Państwa\b))", notice.strip())
    return "".join("<p>" + escape(" ".join(p.split())) + "</p>" for p in paragraphs if p.strip())


def property_profile(form_id, document):
    builder = ProfileBuilder(form_id)
    add, choice = builder.add, builder.choice
    data, location, contact = "Dane", "Informacje o budynku", "Kontakt i oświadczenia"
    identity, address = "applicant.identity", "applicant.address"
    individual, business, organization = (
        "Osoba fizyczna",
        "Osoba fizyczna prowadząca JDG",
        "Organizacja",
    )
    personally, attorney, representative = (
        "Osobiście",
        "Przez pełnomocnika",
        "Przez uprawnionego reprezentanta",
    )
    party = "rodzaj_wnioskodawcy"
    natural = choice(party, individual, business)
    legal = choice(party, organization)
    person_mode, org_mode = "reprezentacja_osoby", "reprezentacja_organizacji"
    proxy = {
        "op": "or",
        "args": [
            conjunction(natural, choice(person_mode, attorney)),
            conjunction(legal, choice(org_mode, attorney)),
        ],
    }
    rep = conjunction(legal, choice(org_mode, representative))

    add(
        data,
        "Adresat",
        "organ",
        "Organ, do którego składasz wniosek",
        "authority",
        default_value="Wójt Gminy Elbląg",
        read_only=True,
        quote="Wójt Gminy Elbląg",
        description="ul. Browarna 85, 82-300 Elbląg",
        actor="authority",
    )
    add(
        data,
        "Wnioskodawca",
        party,
        "Kto jest wnioskodawcą?",
        identity,
        kind="RADIO",
        options=[individual, business, organization],
        required=True,
        design=True,
    )
    for key, options, condition in [
        (person_mode, [personally, attorney], natural),
        (org_mode, [representative, attorney], legal),
    ]:
        add(
            data,
            "Wnioskodawca",
            key,
            "W jaki sposób składasz wniosek?",
            identity,
            kind="RADIO",
            options=options,
            when=condition,
            required=True,
            design=True,
        )
    for name, section, when, actor in [
        ("wnioskodawca", "Dane wnioskodawcy", natural, "applicant"),
        ("pelnomocnik", "Dane pełnomocnika", proxy, "proxy"),
        ("reprezentant", "Dane reprezentanta", rep, "representative"),
    ]:
        for key, label in [("imie", "Imię"), ("nazwisko", "Nazwisko")]:
            add(
                data,
                section,
                f"{name}_{key}",
                label,
                identity,
                when=when,
                actor=actor,
                semantic_type="PERSON_NAME",
                design=True,
            )
    add(
        data,
        "Dane wnioskodawcy",
        "firma_jdg",
        "Nazwa działalności gospodarczej",
        identity,
        when=choice(party, business),
        design=True,
    )
    add(
        data,
        "Dane organizacji",
        "nazwa_organizacji",
        "Nazwa organizacji",
        identity,
        when=legal,
        semantic_type="ORGANIZATION_NAME",
    )
    for name, label in [("nip", "NIP"), ("regon", "REGON"), ("krs", "Numer KRS")]:
        add(
            data,
            "Dane organizacji",
            "organizacja_" + name,
            label,
            identity,
            when=legal,
            design=True,
            reference="D04: wizualizacja formularza po cyfryzacji, wiersz 3, Dane podmiotu",
        )
    for name, label, when in [
        ("pelnomocnictwo", "Dokument pełnomocnictwa", proxy),
        ("umocowanie", "Dokument reprezentacji", rep),
    ]:
        add(
            data,
            "Dokumenty reprezentacji",
            name,
            label,
            "signature",
            kind="FILE_UPLOADER",
            when=when,
            design=True,
            review="confirm_mandate_document_requirement",
        )
    add(
        data,
        "Dokumenty reprezentacji",
        "dolaczenie_oplaty",
        "Czy dołączasz potwierdzenie opłaty?",
        "signature",
        kind="RADIO",
        options=["Tak", "Nie"],
        when=proxy,
        design=True,
    )
    add(
        data,
        "Dokumenty reprezentacji",
        "dowod_oplaty",
        "Potwierdzenie opłaty",
        "signature",
        kind="FILE_UPLOADER",
        when=conjunction(proxy, choice("dolaczenie_oplaty", "Tak")),
        design=True,
    )

    addr = "Adres wnioskodawcy"
    add(
        data,
        addr,
        "kraj_wnioskodawcy",
        "Kraj adresu",
        address,
        kind="RADIO",
        options=["Polska", "Inny kraj"],
        design=True,
    )
    domestic = choice("kraj_wnioskodawcy", "Polska")
    add(
        data,
        addr,
        "adres_zagraniczny",
        "Adres zagraniczny z nazwą kraju",
        address,
        kind="TEXTAREA",
        when=choice("kraj_wnioskodawcy", "Inny kraj"),
        design=True,
    )
    site = "Lokalizacja budynku"
    signer = "Adres osoby składającej wniosek w imieniu wnioskodawcy"
    delegated = {"op": "or", "args": [proxy, rep]}
    add(
        data,
        signer,
        "kraj_osoby_skladajacej",
        "Kraj adresu",
        address,
        kind="RADIO",
        options=["Polska", "Inny kraj"],
        when=delegated,
        actor="representative",
        design=True,
    )
    signer_domestic = conjunction(delegated, choice("kraj_osoby_skladajacej", "Polska"))
    add(
        data,
        signer,
        "adres_zagraniczny_osoby_skladajacej",
        "Adres zagraniczny z nazwą kraju",
        address,
        kind="TEXTAREA",
        when=conjunction(delegated, choice("kraj_osoby_skladajacej", "Inny kraj")),
        actor="representative",
        design=True,
    )
    for tab, section, prefix, when in [
        (data, addr, "adres", domestic),
        (data, signer, "skladajacy", signer_domestic),
        (location, site, "budynek", None),
    ]:
        for suffix, label in ADDRESS_LEVELS:
            source = (
                address
                if prefix != "budynek"
                else ("building.street" if suffix == "ulica" else "building.locality")
            )
            add(
                tab,
                section,
                prefix + "_" + suffix,
                label,
                source,
                kind="TEXT_FIELD" if suffix == "ulica" else "SELECT",
                dictionary_name=None if suffix == "ulica" else label,
                when=when,
                design=prefix != "budynek" or suffix not in {"miejscowosc", "ulica"},
                actor="representative" if prefix == "skladajacy" else "applicant",
            )
    for key, label in [
        ("numer_budynku", "Numer budynku"),
        ("numer_lokalu", "Numer lokalu"),
        ("kod_pocztowy", "Kod pocztowy"),
    ]:
        add(data, addr, key, label, address, when=domestic, design=True)
        add(
            data,
            signer,
            "skladajacy_" + key,
            label,
            address,
            when=signer_domestic,
            actor="representative",
            design=True,
        )
    add(
        location,
        site,
        "obreb",
        "Obręb",
        "building.precinct",
        description="Podaj nazwę, czterocyfrowy kod lub pełny identyfikator obrębu.",
    )
    add(
        location,
        site,
        "numer_dzialki",
        "Nr ewidencyjny działki",
        "building.parcel",
        semantic_type="PARCEL_NUMBER",
    )
    add(contact, "Kontakt", "telefon", "Numer telefonu", "contact")
    add(contact, "Kontakt", "email", "Adres e-mail", "contact")
    add(contact, "Podpis", "data_wniosku", "Data wniosku", "date", kind="DATEPICKER")
    add(
        contact,
        "Podpis",
        "podpis",
        "Podpis wnioskodawcy",
        "signature",
        kind="TEXT_BLOCK",
        description=(
            "Podpis własnoręczny, a przy składaniu elektronicznym: kwalifikowany podpis "
            "elektroniczny, podpis osobisty albo podpis zaufany."
        ),
    )
    add(
        contact,
        "Prywatność",
        "klauzula_informacyjna",
        "Klauzula informacyjna",
        "privacy",
        kind="TEXT_BLOCK",
        description=privacy_notice(document),
    )
    return builder.finish("Wniosek o ustalenie numeru porządkowego nieruchomości")

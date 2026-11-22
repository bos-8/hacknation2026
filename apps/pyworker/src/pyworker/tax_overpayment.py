"""Reviewed projection of the Ulan-Majorat tax blank and its COI reference."""

from uuid import UUID

from pyworker.profile_builder import ProfileBuilder, conjunction

OWN = "We własnym imieniu"
PERSON_PROXY = "Jako pełnomocnik innej osoby fizycznej"
ORG_PROXY = "Jako pełnomocnik podmiotu"
ORG_REP = "Jako reprezentant podmiotu"
ORG_JOINT = "W ramach reprezentacji łącznej podmiotu"
PRIVATE = "Osoba objęta rejestrem PESEL, nieprowadząca działalności gospodarczej"
OTHER = "Pozostała osoba fizyczna (w tym prowadząca działalność gospodarczą)"
CREDIT = "Zaliczyć na poczet przyszłego zobowiązania podatkowego"
TRANSFER = "Zwrócić przelewem na wskazany rachunek"
TAX_NOTE = (
    "Numer PESEL wpisują podatnicy będący osobami fizycznymi objętymi rejestrem PESEL "
    "nieprowadzący działalności gospodarczej. "
    "Identyfikator podatkowy NIP wpisują pozostali podatnicy."
)
PARTIES = {
    "Dane własne podatnika": "podatnik",
    "Dane reprezentowanej osoby": "mocodawca",
    "Dane reprezentowanego podmiotu": "organizacja",
    "Dane pełnomocnika": "pelnomocnik",
    "Dane reprezentanta": "reprezentant",
    "Pozostali reprezentanci": "reprezentanci_laczni",
}


def tax_profile(form_id: UUID):
    profile = ProfileBuilder(form_id)
    add, choice = profile.add, profile.choice
    data, tax, docs = "Dane", "Informacje o nadpłacie", "Dokumenty"
    role = "sposob_zlozenia"
    natural = choice(role, OWN, PERSON_PROXY)
    organization = choice(role, ORG_PROXY, ORG_REP, ORG_JOINT)
    proxy = choice(role, PERSON_PROXY, ORG_PROXY)
    representative = choice(role, ORG_REP, ORG_JOINT)
    authority = "Urząd Gminy Ulan-Majorat, Ulan-Majorat 57, 21-307 Ulan-Majorat"
    add(
        data,
        "Adresat",
        "organ",
        "Urząd, do którego składasz wniosek",
        None,
        actor="authority",
        quote=authority,
        default_value=authority,
        read_only=True,
    )
    add(
        data,
        "Miejsce i data",
        "miejsce_sporzadzenia",
        "Miejscowość",
        "place_date",
        default_value="Ulan-Majorat",
        read_only=True,
    )
    add(
        data,
        "Miejsce i data",
        "data_wniosku",
        "Data wniosku",
        "place_date",
        kind="DATEPICKER",
        semantic_type="CALENDAR_DATE",
    )
    add(
        data,
        "Sposób złożenia",
        role,
        "W jakim charakterze składasz wniosek?",
        "signature",
        kind="RADIO",
        options=[OWN, PERSON_PROXY, ORG_PROXY, ORG_REP, ORG_JOINT],
        design=True,
        required=True,
    )

    for section, prefix, condition, actor, basis in (
        ("Dane własne podatnika", "podatnik", choice(role, OWN), "applicant", "applicant.identity"),
        (
            "Dane reprezentowanej osoby",
            "mocodawca",
            choice(role, PERSON_PROXY),
            "applicant",
            "applicant.identity",
        ),
        ("Dane pełnomocnika", "pelnomocnik", proxy, "proxy", "signature"),
        ("Dane reprezentanta", "reprezentant", representative, "representative", "signature"),
        (
            "Pozostali reprezentanci",
            "dodatkowy_reprezentant",
            choice(role, ORG_JOINT),
            "representative",
            "signature",
        ),
    ):
        for key, label in (("imie", "Imię"), ("nazwisko", "Nazwisko")):
            add(
                data,
                section,
                prefix + "_" + key,
                label,
                basis,
                when=condition,
                actor=actor,
                design=True,
                semantic_type="PERSON_NAME",
                required=True,
            )
    add(
        data,
        "Dane reprezentowanego podmiotu",
        "nazwa_podmiotu",
        "Nazwa podmiotu",
        "applicant.identity",
        when=organization,
        semantic_type="ORGANIZATION_NAME",
        required=True,
    )
    status = "status_osoby_fizycznej"
    add(
        data,
        "Identyfikacja podatnika",
        status,
        "Który opis dotyczy podatnika?",
        "applicant.tax_id",
        kind="RADIO",
        options=[PRIVATE, OTHER],
        when=natural,
        quote=TAX_NOTE,
        description=TAX_NOTE,
        required=True,
    )
    pesel = conjunction(natural, choice(status, PRIVATE))
    nip = {"op": "or", "args": [organization, conjunction(natural, choice(status, OTHER))]}
    for key, condition in (("PESEL", pesel), ("NIP", nip)):
        add(
            data,
            "Identyfikacja podatnika",
            key.lower() + "_podatnika",
            key,
            "applicant.tax_id",
            when=condition,
            quote=TAX_NOTE,
            semantic_type=key,
            required=True,
        )

    def add_address(section, prefix, condition):
        def address_field(suffix, label, **kwargs):
            add(
                data,
                section,
                prefix + "_" + suffix,
                label,
                "applicant.address",
                design=True,
                **kwargs,
            )

        address_field(
            "kraj",
            "Kraj",
            kind="SELECT",
            when=condition,
            dictionary_name="Kraje",
            required=True,
        )
        poland = choice(prefix + "_kraj", "Polska")
        domestic = conjunction(condition, poland)
        foreign = conjunction(condition, poland | {"op": "ne"})
        address_field(
            "wojewodztwo",
            "Województwo",
            when=domestic,
            kind="SELECT",
            dictionary_name="Województwo",
        )
        address_field("kod_pl", "Kod pocztowy", when=domestic, semantic_type="POSTCODE")
        address_field("kod_zagraniczny", "Zagraniczny kod pocztowy", when=foreign)
        for suffix, title in (
            ("miejscowosc", "Miejscowość"),
            ("ulica", "Ulica"),
            ("budynek", "Numer budynku"),
            ("lokal", "Numer lokalu"),
        ):
            address_field(suffix, title, when=condition)

    add_address("Adres zamieszkania podatnika", "adres_podatnika", choice(role, OWN))
    add_address("Adres reprezentowanej osoby", "adres_mocodawcy", choice(role, PERSON_PROXY))
    add_address("Adres siedziby podmiotu", "adres_siedziby", organization)

    printed_basis = (
        "Na podstawie art. 75 ustawy z dnia 29 sierpnia 1997 r. - Ordynacja podatkowa "
        "(Dz. U. z 2025 r. poz. 111 ze zm.)"
    )
    add(
        tax,
        "Dane nadpłaty",
        "rodzaj_podatku",
        "Rodzaj podatku",
        "tax.kind",
        required=True,
        quote=printed_basis,
        description=printed_basis,
    )
    add(
        tax,
        "Dane nadpłaty",
        "kwota_nadplaty",
        "Kwota nadpłaty",
        "tax.amount",
        kind="NUMBER",
        semantic_type="MONEY_PLN",
        required=True,
        description="Podaj kwotę w PLN z dokładnością do grosza.",
        config={"currency": "PLN", "scale": 2, "validator": "positive_pln"},
    )
    add(tax, "Dane nadpłaty", "uzasadnienie", "Uzasadnienie", "reason", kind="TEXTAREA")
    method = "sposob_rozliczenia"
    add(
        tax,
        "Rozliczenie nadpłaty",
        method,
        "Jak rozliczyć nadpłatę?",
        "refund.method",
        kind="RADIO",
        options=[CREDIT, TRANSFER],
        required=True,
    )
    add(
        tax,
        "Rozliczenie nadpłaty",
        "przyszle_zobowiazanie",
        "Tytuł przyszłego zobowiązania",
        "refund.future_tax",
        when=choice(method, CREDIT),
        required=True,
    )
    add(
        tax,
        "Rozliczenie nadpłaty",
        "rachunek_zwrotu",
        "Wskazany rachunek",
        "refund.account",
        when=choice(method, TRANSFER),
        semantic_type="ACCOUNT_PL",
        config={"validator": "pl_bank_account"},
        description="Podaj 26 cyfr NRB lub polski IBAN z prefiksem PL.",
        required=True,
    )

    add(
        docs,
        "Załączniki",
        "korekta_deklaracji",
        "Korekta deklaracji",
        "attachments.correction",
        kind="FILE_UPLOADER",
    )
    add(
        docs,
        "Załączniki",
        "inne_zalaczniki",
        "Inne załączniki",
        "attachments.other",
        kind="FILE_UPLOADER",
    )
    for name, title, condition, actor in (
        ("pelnomocnictwo", "Dokument pełnomocnictwa", proxy, "proxy"),
        (
            "dokument_reprezentacji",
            "Dokument potwierdzający reprezentację",
            representative,
            "representative",
        ),
    ):
        add(
            docs,
            "Umocowanie",
            name,
            title,
            "signature",
            kind="FILE_UPLOADER",
            when=condition,
            actor=actor,
            design=True,
            review="confirm_mandate_document_requirement",
        )
    fee = "dolaczenie_dowodu_oplaty"
    add(
        docs,
        "Umocowanie",
        fee,
        "Czy dołączasz dowód opłaty za pełnomocnictwo?",
        "signature",
        kind="RADIO",
        options=["Tak", "Nie"],
        when=proxy,
        design=True,
        actor="proxy",
    )
    add(
        docs,
        "Umocowanie",
        "dowod_oplaty",
        "Dowód opłaty za pełnomocnictwo",
        "signature",
        kind="FILE_UPLOADER",
        when=conjunction(proxy, choice(fee, "Tak")),
        design=True,
        actor="proxy",
    )
    for suffix, condition, actor, signer in (
        ("wlasny", choice(role, OWN), "applicant", "podatnik"),
        ("pelnomocnika", proxy, "proxy", "pelnomocnik"),
        ("reprezentanta", choice(role, ORG_REP), "representative", "reprezentant"),
        ("laczny", choice(role, ORG_JOINT), "representative", "reprezentanci_laczni"),
    ):
        joint = suffix == "laczny"
        add(
            docs,
            "Podpis",
            "podpis_" + suffix,
            "Podpisy reprezentacji łącznej" if joint else "Podpis dokumentu",
            "signature",
            kind="TEXT_BLOCK",
            when=condition,
            actor=actor,
            design=True,
            description="Ustal wszystkich uprawnionych i podpisy wymagane dla tej wersji wniosku."
            if joint
            else "Podpis dotyczy tej wersji wniosku. Metodę podpisu potwierdza urząd.",
            config={
                "documentRef": "form." + str(form_id),
                "signerRefs": ["party.reprezentant", "party.reprezentanci_laczni"]
                if joint
                else ["party." + signer],
                "onBehalfOfRefs": {
                    "wlasny": ["party.podatnik"],
                    "pelnomocnika": ["party.mocodawca", "party.organizacja"],
                    "reprezentanta": ["party.organizacja"],
                    "laczny": ["party.organizacja"],
                }[suffix],
                "mode": "joint" if joint else "individual",
            },
            review="confirm_joint_signers_and_document_revision"
            if joint
            else "verify_document_actor_and_method",
        )
    return profile.finish("Wniosek o stwierdzenie nadpłaty podatku")

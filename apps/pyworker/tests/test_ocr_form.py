import unittest
from itertools import pairwise
from uuid import UUID

from pydantic import ValidationError

from pyworker.coi import CoiForm
from pyworker.ocr_form import detect_items, form_from_text


class OcrFormTests(unittest.TestCase):
    def test_compound_fields_signature_and_notice(self):
        source = """# Wniosek testowy
Wnioskodawca:
Imię i nazwisko/nazwa wnioskodawcy: ...
Adres: ...
Nr telefonu/adres e-mail: ...
Podpis wnioskodawcy: ...

Pierwszy akapit wniosku pozostaje opisem.
¹) Dane kontaktowe są nieobowiązkowe.

# KLAUZULA INFORMACYJNA
Pierwszy akapit klauzuli ma <tekst>.

1. Pierwsza informacja
kontynuacja pierwszej informacji
2. Druga informacja
"""
        draft = form_from_text(source, True, UUID(int=42)).draft
        fields = {
            item.field.title: item.field
            for tab in draft.tabs
            for section in tab.questions
            for item in section.field.repeatingSectionGrid
        }
        self.assertEqual(fields["Podpis wnioskodawcy"].type, "INFO_SECTION")
        self.assertTrue(fields["Podpis wnioskodawcy"].readOnly)
        self.assertEqual(fields["Kraj"].dictionaryName, "Kraje")
        self.assertIn("Numer lokalu", fields)
        selector = fields["Rodzaj wnioskodawcy"]
        self.assertEqual([o.id for o in selector.options], ["Osoba fizyczna", "Podmiot"])
        self.assertIn(selector.techName, fields["Nazwisko"].states[0]["query"])
        self.assertIn('"Osoba fizyczna"', fields["Nazwisko"].states[0]["query"])
        self.assertIn('"Podmiot"', fields["Nazwa podmiotu"].states[0]["query"])
        self.assertNotIn("REQUIRED", fields["Adres e-mail"].validation)
        self.assertEqual(fields["Adres e-mail"].validation, ["EMAIL"])
        self.assertNotIn("¹)", fields["Informacje z formularza"].description)
        self.assertIn("¹)", fields["Przypisy"].description)
        notice = fields["KLAUZULA INFORMACYJNA"]
        self.assertEqual(notice.type, "TEXT_BLOCK")
        self.assertIn("&lt;tekst&gt;", notice.description)
        self.assertIn("<ol>", notice.description)
        self.assertIn("informacja kontynuacja", notice.description)
        data = draft.model_dump()
        data["tabs"][0]["questions"][0]["rows"] = 1
        with self.assertRaises(ValidationError):
            CoiForm.model_validate(data)

    def test_split_title_numbered_choices_and_footnotes_in_ocr_text(self):
        source = """# WNIOSEK
o stwierdzenie nadpłaty podatku
PESEL * ...
... w kwocie ...
Kwotę nadpłaty proszę:
1) zaliczyć na poczet zobowiązania
2) zwrócić przelewem
w załączeniu:
1) korekta deklaracji
2) ...
*Numer PESEL wpisują osoby objęte rejestrem.
"""
        draft = form_from_text(source, True, UUID(int=42)).draft
        self.assertEqual(draft.title, "WNIOSEK o stwierdzenie nadpłaty podatku")
        fields = [
            item.field
            for tab in draft.tabs
            for section in tab.questions
            for item in section.field.repeatingSectionGrid
        ]
        self.assertEqual(
            next(field for field in fields if field.title == "PESEL").validation, ["PESEL"]
        )
        self.assertEqual(next(field for field in fields if field.title == "Kwota").type, "NUMBER")
        self.assertEqual(len(next(field for field in fields if field.type == "RADIO").options), 2)
        self.assertTrue(any(field.type == "FILE_UPLOADER" for field in fields))
        self.assertFalse(any(field.title == "2" for field in fields))

    def test_detect_classify_group_and_render_typed_fragments(self):
        source = """# Wniosek testowy
# Dane wnioskodawcy
PESEL*: ...
Data urodzenia: ...
Adres e-mail: ...
# Dane dla każdej nieruchomości
Powierzchnia: ...
Uzasadnienie: ...
Wybierz jeden sposób:
○ Osobiście ○ Pocztą
Dodatki: ☐ Pierwszy ☐ Drugi
Wybierz miesiąc:
○ Styczeń ○ Luty ○ Marzec ○ Kwiecień ○ Maj ○ Czerwiec
Dołącz potwierdzenie.
# Zgody
☐ Wyrażam zgodę na kontakt.
# Klauzula informacyjna
Dane będą przetwarzane w celu obsługi wniosku.
"""
        title, items = detect_items(source)
        self.assertEqual(title, "Wniosek testowy")
        self.assertTrue(any(item.kind == "choice" and item.single_choice for item in items))
        draft = form_from_text(source, False, UUID(int=42)).draft
        sections = [question.field for tab in draft.tabs for question in tab.questions]
        self.assertIn("REPEATING_SECTION", {section.type for section in sections})
        children = [item for section in sections for item in section.repeatingSectionGrid]
        fields = {item.field.type: item.field for item in children}
        self.assertEqual(
            set(fields),
            {
                "TEXT_FIELD",
                "TEXTAREA",
                "NUMBER",
                "DATEPICKER",
                "CHECKBOX",
                "RADIO",
                "SELECT",
                "FILE_UPLOADER",
                "CONSENT_SECTION",
                "TEXT_BLOCK",
                "INFO_SECTION",
            },
        )
        pesel = next(item.field for item in children if item.field.title == "PESEL")
        self.assertEqual(pesel.validation, ["REQUIRED", "PESEL"])
        self.assertEqual(fields["SELECT"].defaultValue, [])
        self.assertIs(fields["SELECT"].searchEnabled, False)
        self.assertEqual(len(fields["RADIO"].options), 2)
        self.assertEqual(len(fields["CHECKBOX"].options), 2)
        self.assertIn(
            "Wyrażam zgodę", fields["CONSENT_SECTION"].consentSectionConfig.consents[0].description
        )
        self.assertEqual(draft.tabs[-2].title, "Kontakt i oświadczenia")
        self.assertEqual(draft.flow.links[-1].target, draft.tabs[-1].id)
        for section in sections:
            for first, second in pairwise(section.repeatingSectionGrid):
                self.assertGreaterEqual(second.y, first.y + first.rows)

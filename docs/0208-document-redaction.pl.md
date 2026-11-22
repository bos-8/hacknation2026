---
brief: Konwersja formularzy, wynik COI, treść dokumentu i współrzędne źródła.
tags: [ocr, pdf, ai, kolejka]
---

# Dokumenty i API

Panel Formularze ma działający przepływ konwersji przez kolejkę i pyworker. Starsze zadania panelu administracyjnego mają osobny kontrakt i historię wykonania. [Architektura i tryby](0200-architecture.pl.md) · [Harness HTTPS API](0209-harness-api.pl.md)

`POST /v1/forms/process` przyjmuje multipart `file` i `metadata` z uwierzytelnieniem Bearer. Walidacja sprawdza metadane i opłacenie, nazwę, rozmiar oraz zgodność zawartości pliku z rozszerzeniem. DOC odczytuje Apache POI, DOCX czytnik akapitów i tabel, a XLSX i ODS lokalny czytnik arkuszy. Obrazy i strony PDF podlegają wybranemu trybowi OCR. Nie wszystkie formaty zachowują wiarygodną paginację, zwłaszcza binarny Word.

| Pole wyniku | Znaczenie |
| --- | --- |
| `draft` | Docelowa konfiguracja COI do eksportu |
| `form_ir` | Model pośredni, pochodzenie i decyzje wymagające przeglądu |
| `field_locations` | Strona od 1 i prostokąty `[x0, y0, x1, y1]` od 0 do 1, początek w lewym górnym rogu |
| `field_confidences` | Ocena pewności pól, odrębna od wyniku silnika OCR |
| `document_content` | Dodatkowy JSON z wersją schematu, stronami, tekstem i blokami |

`document_content` może być nieobecny w starszych wynikach. Blok może zawierać `bbox`, opis komórki i `ocr_confidence`, jeżeli dostępne są dowody odczytu. Brak oceny pewności jest reprezentowany jako `null`. Samoocena modelu nie jest prawdopodobieństwem potwierdzonym pomiarem jakości.

Next.js zapisuje wynik w PostgreSQL z relacją do oryginału przechowywanego w S3. Pyworker używa pamięci i plików tymczasowych na czas pracy. Podgląd umożliwia pobranie COI, dodatkowej treści oraz edycję wartości. Ponowna analiza aktualizuje wynik dla pliku.

W DEV [Swagger UI](http://localhost:8010/docs) jest dostępny na hoście. W PoC worker pozostaje w sieci Compose. Trasy zdrowia są dostępne bez tokenu. [Kolejka i diagnostyka](0311-postgresql-queue.pl.md)

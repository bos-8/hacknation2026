---
brief: Rzeczywisty przebieg OCR, przeglądu, eksportu PDF i oddzielnego czatu.
tags: [ocr, pdf, ai, kolejka]
---

# Przegląd dokumentów, eksport PDF i AI

1. W `/pl/admin/files/ocr` wybierz wersję pliku PDF, PNG lub JPEG (do 8 MiB). Widok otwiera oryginał i pozwala wybrać tryb ręczny albo automatyczny. Analiza jest przypisana do administratora, wersji pliku i trybu.
2. Worker odczytuje tekst natywny przez PDFium, rozpoznaje skany przez lokalny Tesseract z językami polskim i angielskim i zwraca słowa ze współrzędnymi na stronie. Wersja wyniku w PostgreSQL pozwala wrócić do przeglądu po zamknięciu karty.
3. W trybie ręcznym porównaj transkrypcję z oryginałem, popraw błędne słowa lub ponów odczyt strony. Zatwierdzenie przekazuje dokument do wykrywania danych. Tryb automatyczny przechodzi z OCR od razu do wykrywania. Sprawdź propozycje masek przed zatwierdzeniem eksportu z redakcją.
4. Wariant PDF z oryginalnymi danymi można zamówić na etapie przeglądu. Warianty z zaczernieniami i z etykietami wymagają zatwierdzenia. Worker generuje strony PDF z obrazu po naniesieniu oznaczeń. Eksport jest osobnym plikiem w katalogu powiązanym z analizowaną wersją. [Kod eksportu](../apps/pyworker/src/pyworker/tasks/pdf_export.py)

## Rozpoznawanie danych i modele

Lokalny detektor korzysta m.in. z reguł dla PESEL, NIP i numerów rachunków. Integracja z modelem PII-Tracer ma osobne zależności oraz skrypt przygotowujący pliki przypiętej rewizji i weryfikujący ich sumy kontrolne. Wagi i kod modelu wymagają osobnego przygotowania przy dostawie offline. [Przygotowanie modelu](../apps/pyworker/setup_pii_model.py) · [Implementacja zadań](../apps/pyworker/src/pyworker/tasks/)

Czat pod `/pl/chat` to osobna funkcja. Backend Web wywołuje zewnętrzny interfejs Responses API po skonfigurowaniu `OPENAI_API_KEY`, `OPENAI_MODEL_INSTANT` i `OPENAI_MODEL_THINKING`. Ustawienia LLM w administracji przechowują wersje promptu i wskazanie aktywnej wersji. Projekt konwertera COI przewiduje **lokalny** model generujący JSON blankietu. Konto lub klucz do czatu nie jest elementem konfiguracji lokalnego Tesseract. [Klient czatu](../apps/web/src/server/openai-chat.ts) · [Wymagania dla konwertera](9999-backlog.pl.md)

Do sprawdzenia odczytu i eksportu służy `pnpm test:pyworker`. Przypadki obejmują m.in. mieszany PDF, małe cyfry i geometrię masek na obróconej stronie. [Testy dokumentów](../apps/pyworker/tests/test_documents.py)

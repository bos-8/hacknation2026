---
brief: Stan przetwarzania dokumentów po usunięciu lokalnego silnika OCR.
tags: [ocr, pdf, ai, kolejka]
---

# Dokumenty i API

Panel administracyjny przechowuje wcześniejsze analizy. Nowe zadania OCR, wykrywanie danych i generowanie PDF wymagają zastąpienia usuniętego wykonawcy. Panel Formularze ma odrębny przepływ konwersji z Eden AI do prób DEV. Wariant konkursowy wymaga lokalnego OCR i modelu. [Projekt konwertera](0200-architecture.pl.md)

Pyworker udostępnia diagnostykę. Po uruchomieniu DEV otwórz [Swagger UI na localhost](http://localhost:8010/docs). Do wykonania zadania diagnostycznego użyj **Authorize** i podaj wartość lokalnego `PYWORKER_API_TOKEN`. Trasy zdrowia są dostępne bez tokenu.

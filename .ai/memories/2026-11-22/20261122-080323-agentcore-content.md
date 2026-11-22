---
brief: Stan lokalnego OCR, AgentCore, treści dokumentów i ograniczeń weryfikacji.
tags: [pipeline, ocr, aws, coi]
---

# Stan z 22 listopada 2026

- Lokalny DEV używa trybu agentcore. Etap OCR analizuje obrazy stron Qwenem 27B przez Eden, a istniejący harness_fermiq we Frankfurcie grupuje pola i tekst osobno dla każdej strony. Pyworker kompiluje pełny JSON COI.
- Harness v3 skonfigurowano z qwen.qwen3-vl-235b-a22b-instruct, chat_completions przez Bedrock Mantle, limit wyjścia 8192. Zwykły endpoint Qwen 235B miał zerowe limity konta. Uwierzytelnianie lokalne przez profil SSO. ARN i dane dostępowe są tylko w ignorowanej konfiguracji.
- AgentCore InvokeHarness przyjmuje tekstowe obserwacje. Nowy agentcore.py sprawdza strumień do end_turn i parsuje PageDesign. Zachowuje oryginalne pola pominięte w projekcie modelu.
- Lokalny czytnik pipeline/hybrid używa PaddleOCR-VL 1.6, PP-StructureV3 z PP-DocLayout_plus-L i PP-OCRv5_server_det. Rozpoznawanie latin_PP-OCRv5_mobile_rec obsługuje polski. Większy recognizer server nie ma deklarowanego polskiego. Nowe ustawienia Paddle wymagają przygotowania wag i sprawdzenia runtime. Aktywny tryb agentcore używa Eden do OCR.
- Modele Paddle i Qwen sprawdzono w kartach producentów jako Apache 2.0. Pełny audyt licencji zależności pośrednich pozostaje niewykonany. Usługi AWS/Eden mają osobne warunki.
- DOC odczytuje lokalnie Apache POI. Zachowywane są jawne podziały stron i dodatkowe teksty. Materiał nadpłaty o rozszerzeniu DOC ma strukturę DOCX i jest odrzucany przez walidację typu.
- Wynik document_content zawiera strony, tekst i bloki źródłowe z geometrią. Next przechowuje go w JSON wyniku i oferuje podgląd oraz pobranie .content.json. Stare wyniki wymagają ponownej analizy.
- Naprawiono pomijanie TEXT_BLOCK podczas scalania profilu oraz zachowanie tekstu z dalszych stron. Prompt wymaga geometrii względem całej strony. Podgląd PDF/obraz ma wspólne proporcje nakładki i źródła. Wyrównanie ramek wymaga jeszcze wizualnego sprawdzenia na realnych skanach.
- Weryfikacja live na lokalnym /v1/forms/process zwróciła HTTP 200 i zachowała 33/33 linie drugiej strony PDF numeracji nieruchomości. Ostatnie sprawdzenia obejmują 15 testów vision, 10 pipeline i TypeScript bez błędów. Pełny zestaw 109 testów przeszedł wcześniej, przed ostatnim rozszerzeniem document_content.
- Sesja Next oraz timeout bezczynności Keycloak ustawione na 2700 sekund. Regresje auth/session przeszły 17 testów.
- Przegląd README i docs/0200-architecture.pl.md opisuje bieżące warianty. Szybkość vision i lokalnego Paddle na CPU znacznie się różni. Nie deklarować przyspieszenia całej analizy na podstawie mikropomiaru geometrii.

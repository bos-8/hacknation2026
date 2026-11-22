---
brief: Kontrakt HTTPS z Harness, modele, położenie sekretów i stały termin dostępu.
tags: [agentcore, harness, api, ocr, bezpieczeństwo]
---

# Harness przez HTTPS API

Tryb `PYWORKER_FORM_MODE=agentcore` łączy pyworker z endpointem HTTPS chronionym kluczem Bearer. Komputer użytkownika potrzebuje adresu API i klucza. Profil AWS oraz uprawnienia wdrożeniowe pozostają u administratora. [Uruchomienie Compose](0307-docker-poc.pl.md)

## Przepływ i modele

```text
Przeglądarka → Next.js → kolejka PostgreSQL → pyworker
                   │                          │
                   ├─ Keycloak                ├─ lokalny odczyt dokumentu i geometrii
                   ├─ PostgreSQL              └─ HTTPS API w AWS
                   └─ SeaweedFS                    ├─ OCR obrazu przez Eden AI
                                                    └─ Harness → Bedrock Mantle
```

API przyjmuje dwa warianty POST. Żądanie z `messages` uruchamia odczyt obrazu przez skonfigurowanego po stronie serwera Qwena 27B. Żądanie z `text` i `observations` przekazuje tekst oraz wykryte pola jednej strony do Harnessu. Serwer ustala prompt, schemat i docelowy Harness. Klient nie wybiera dowolnego celu AWS.

Harness `harness_fermiq` w regionie Frankfurt wykorzystuje `qwen.qwen3-vl-235b-a22b-instruct` przez Bedrock Mantle z protokołem `chat_completions`. Etap OCR ma osobny model `qwen3.8-27b`, `reasoning_effort=none` i limit wyjścia do 24 576 tokenów. Parametry obu etapów mają osobne granice.

Klucz Eden znajduje się w konfiguracji serwera AWS. Pyworker w PoC kieruje również zapytania OCR do tego samego API. Ten wariant wymaga dostępności usług zewnętrznych. Lokalny wariant `pipeline` korzysta z Docling, Paddle i lokalnego Qwena. [Tryby przetwarzania](0200-architecture.pl.md)

## Ograniczenia i błędy

| Warunek | Odpowiedź API |
| --- | --- |
| Brak klucza lub niepoprawny Bearer | HTTP 401 |
| Dostęp wygasł | HTTP 403, `agentcore_expired` |
| Niepoprawny kontrakt wejściowy | HTTP 400 |
| Metoda inna niż POST | HTTP 405 |
| Treść przekracza limit 5 000 000 znaków | HTTP 413 |
| Cztery aktywne analizy zajęły dostępne miejsca | HTTP 429, `busy` |
| Błąd wykonania zależności | HTTP 503, `unavailable` |

Limit czterech analiz wymuszają atomowe dzierżawy DynamoDB. Dzierżawa wygasa po 300 sekundach i jest zwalniana po zakończeniu. Tabela zawiera identyfikator właściciela i termin, bez zawartości dokumentu. Jest to kontrola aplikacyjna, a nie rezerwacja współbieżności Lambdy.

`PYWORKER_HARNESS_EXPIRES_AT` jest stałą datą ze strefą czasową. W PoC ustawiono `2026-11-22T19:09:47.576880+00:00`. Pyworker sprawdza ją przed OCR oraz przed przekazaniem strony. API sprawdza ten sam termin. Hook Harnessu `beforeInvocation` ma `failureMode=deny` i blokuje kolejne wywołania po terminie. Restart niczego nie przedłuża. Wcześniej rozpoczęte wywołanie może się zakończyć. Administrator może zmienić konfigurację.

## Wynik i pochodzenie danych

Worker waliduje odpowiedź modelu i deterministycznie buduje `draft` w formacie COI. `form_ir` opisuje semantykę oraz decyzje. Dodatkowy `document_content` zawiera strony, tekst i bloki z położeniem, jeżeli metoda odczytu je udostępniła. Next.js zapisuje wynik przy formularzu i wersji oryginału. Worker nie przechowuje trwale dokumentu.

Prompt zabrania kopiowania prowadnic złożonych z wielu kropek. Końcowe czyszczenie usuwa ciągi co najmniej czterech znaków prowadnicy. `document_content` jest odczytaną treścią po normalizacji, a nie bajtowym odpisem źródła ani gwarancją kompletności OCR.

## Utrzymanie

[Adapter API](../infra/aws/harness/api_handler.py), [instalator](../infra/aws/harness/install_api.py) oraz [hook terminu](../infra/aws/harness/expiry_hook.py) należą do części serwerowej. Ich wdrożenie wymaga autoryzacji AWS. Zwykły start Compose nie wdraża ani nie odnawia zasobów AWS.

W diagnostyce rozdzielaj gotowość kontenera, dostępność endpointu, ważność klucza i termin dostępu. Działający `/health/ready` nie potwierdza jakości OCR ani zgodności eksportu z rzeczywistym importerem COI.

[Architektura](0200-architecture.pl.md) · [Instrukcje operacyjne](0400-runbooks.pl.md)

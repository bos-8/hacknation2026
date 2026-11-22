---
brief: Działający stos FORMIQ i projekt konwersji blankietów do JSON.
tags: [architektura, nextjs, prisma, keycloak, ocr]
---

# Architektura FORMIQ

[Wymagania aplikacji i kryteria COI](0203-application-requirements.pl.md) · [Profil EXTENDED i przegląd wniosku o nadpłatę](0204-extended-review.pl.md) · [Dokumenty i API panelu administracyjnego](0208-document-redaction.pl.md)

## Działający stos

FORMIQ działa bez Nginx. Przeglądarka łączy się przez HTTPS bezpośrednio z Next.js, a podczas logowania z Keycloak. Web przechowuje sesje Better Auth i dane aplikacji w PostgreSQL przez Prisma. Keycloak odpowiada za poświadczenia i własną bazę. W DEV Web i oba workery działają na hoście, w QA w kontenerach. [Porty, środowiska i certyfikaty](0302-local-docker.pl.md)

```text
Przeglądarka → Next.js (HTTPS) ↔ Keycloak (OIDC) → keycloak_db
                  ├── Prisma → app_db (sesje, wersje plików, wyniki i zatwierdzenia)
                  ├── S3 → SeaweedFS (pliki źródłowe i eksporty)
                  ├── prywatne HTTP → Pyworker (konwersja formularzy i przeliczenie szkicu po decyzji)
                  └── zadania → pg-boss / queue_db → worker Node.js → pyworker (diagnostyka)
```

Pyworker udostępnia sprawdzanie gotowości, żywotności i uwierzytelnione zadanie diagnostyczne. [Swagger UI w DEV](http://localhost:8010/docs) · [Bazy i kolejka](0303-prisma-database.pl.md)

## Przyjęcie blankietu w FastAPI

Działający prywatny endpoint `POST /v1/forms/validate` przyjmuje jeden plik PDF, PNG, JPG/JPEG, DOC, DOCX, ODS, XLSX, TXT lub JSON jako pole `file` w `multipart/form-data`. W [Swagger UI](http://localhost:8010/docs) wybierz **Authorize**, podaj `PYWORKER_API_TOKEN`, a następnie otwórz operację w grupie **Forms**.

Worker sprawdza nazwę, rozszerzenie, typ MIME i początkową sygnaturę pliku. Limit wynosi 20 MiB na plik i dodatkowe 64 KiB na obudowę multipart. Jeden proces przyjmuje jeden upload naraz, z limitem 30 sekund. Plik pozostaje w RAM do końca żądania. Odpowiedź HTTP 200 zawiera `status: validated`, `media_type` i `size_bytes`. Ten etap nie dekoduje stron ani nie wywołuje OCR lub LLM.

W panelu Formularze przycisk **Wgraj formularz** wysyła oryginał do Next.js (`POST /api/v1/forms`). Next.js zapisuje bajty w S3, a w PostgreSQL metadane i klucz obiektu. Właściciel może wrócić do pliku po odświeżeniu strony. Formularz po wgraniu ma stan nieprzetworzony. W trakcie konwersji panel pobiera aktualny etap z Next.js, który odczytuje go z Pyworkera dla zalogowanego właściciela formularza. Po błędzie panel pokazuje etap i bezpieczną przyczynę, np. limit czasu konwersji lub kod HTTP dostawcy.

Przycisk **Wyślij do przetworzenia** dodaje zadanie do kolejki pg-boss (`form.process`). Powiadomienie uprzedza, że analiza może potrwać kilka minut. Po pobraniu zadania worker Next.js pobiera oryginalne bajty z S3 i wysyła multipart z plikiem oraz metadanymi JSON pochodzącymi z sesji i bazy. Pyworker sprawdza kolejno płatność, metadane nadawcy i zgodność typu dokumentu z rozszerzeniem. Brak płatności zwraca HTTP 402 `payment_required`.

W trybie integracyjnym `PYWORKER_FORM_MODE=eden` Pyworker korzysta z Eden AI. Prywatny `EDENAI_API_KEY` uwierzytelnia upload, OCR i Chat Completions. Domyślny model LLM dla DEV to `deepinfra/Qwen/Qwen3-VL-235B-A22B-Instruct`. Pyworker wywołuje go przez Eden AI Chat Completions. Adresy uploadu i Chat Completions oraz modele są w `apps/pyworker/.env.example`. `EDENAI_TIMEOUT_SECONDS` ustala wspólny limit uploadu, OCR i LLM. Wartość domyślna to 300 sekund, a dopuszczalny zakres to 1–300 sekund. Po zmianie prywatnego `.env` uruchom ponownie proces DEV. Przekroczenie limitu kończy żądanie kodem HTTP 504 i komunikatem w panelu. JPG, PNG i strony skanowanego PDF są renderowane jako obrazy i transkrybowane przez Qwen-VL przez Chat Completions (model z `EDENAI_VISION_MODEL`). PDF z kompletną warstwą tekstową może być odczytany lokalnie. TXT i JSON trafiają do modelu jako tekst. Z DOCX Pyworker odczytuje lokalnie akapity i wiersze tabel, a do modelu przekazuje uzyskany tekst. Pozostałe pliki są przekazywane do modelu jako załączniki, których obsługa zależy od wybranego modelu. Eden AI otrzymuje dokument lub odczytany tekst i może przechowywać wgrane pliki zgodnie ze swoją polityką retencji. [Upload Eden AI](https://www.edenai.co/docs/v3/llms/file-upload)

Tryb `pipeline` używa Docling, Apache POI, PaddleOCR‑VL‑1.6 i pomocniczego PP‑StructureV3. Klasyfikuje strony PDF indywidualnie, a wyniki odczytu wiąże z numerami stron i współrzędnymi, gdy źródło ma stały układ. Qwen zwraca pola i identyfikatory fragmentów w odpowiedzi zgodnej ze schematem ekstrakcji. Pyworker sprawdza odwołania, tworzy JSON COI i dołącza `field_locations`. Instrukcja uruchomienia jest w [README](../README.md#lokalny-pipeline-formularzy).

Next.js zapisuje wynik przy formularzu w PostgreSQL. Za przetworzony uznaje formularz z konfiguracją COI. Szczegóły kolorują składnię JSON i przy podświetleniu pola zaznaczają odpowiadający obszar PDF lub zdjęcia. Pobierany JSON zawiera konfigurację formularza. Tryby `ocr`, `eden` i `pipeline` korzystają ze wspólnego kompilatora COI. Zwracają również `form_ir` z modelem procedury, regułami i pochodzeniem pól. Tryb `bypass` zwraca wynik walidacji. [Schemat, katalog i aktualizacja zasobów](../README.md#model-formularza-i-profile-procedur)

### Odczyt tabel w trybie vision

Opis pól z blankietów i reguły importu COI zawiera [przegląd materiałów DOCX](0205-materialy-docx.pl.md).

W DEV Qwen 235B analizuje strony PDF i obrazy z ustawieniem `reasoning_effort=none`. Domyślny limit odpowiedzi wynosi 24 576 tokenów na wywołanie (`EDENAI_MAX_OUTPUT_TOKENS`). Renderer skaluje strony PDF maksymalnie 4× i ogranicza dłuższy bok obrazu do 2800 px. Limit 64 MiB dotyczy sumy obrazów stron PDF po zakodowaniu w base64.

Po pierwszym odczycie Pyworker porównuje położenie pól z liniami tabeli. Gdy wykryje pominiętą komórkę z niejednoznacznymi śladami, np. kropkami do wpisania odpowiedzi, może przesłać Qwenowi wycinek tabeli wraz z nagłówkami. Na stronę przypada najwyżej jeden taki wycinek, obejmujący do 100 kandydatów. Potwierdzone puste pola zachowują numer wiersza, kolumny i współrzędne na oryginalnej stronie. W XLSX i ODS parser uwzględnia również jawnie zapisane puste komórki bez stylu pod rozpoznanymi nagłówkami.

## Projekt konwertera COI

Poniższy schemat, ścieżki HTTP i limity opisują zaprojektowany wariant plik → JSON. Jego odbiór wymaga m.in. próby importu w systemie COI. [Kryteria odbioru](9999-backlog.pl.md)

```text
Przeglądarka ──HTTPS──► apps/web (Node + Next.js)
                         ├── Better Auth ──OIDC/PKCE──► Keycloak ──► keycloak_db
                         ├── Prisma ──► app_db (PostgreSQL)
                         └── prywatne HTTP ──► apps/pyworker
                                                ├── API OCR
                                                └── tekst ──► lokalne API LLM ──► JSON
Klient S3 ──HTTP──► SeaweedFS
```

### Projektowany przebieg

1. Better Auth rozpoczyna logowanie przez dostawcę `keycloak`. Callback `/api/v1/auth/callback/keycloak` tworzy sesję w PostgreSQL. Web ustawia bezpieczne ciasteczko sesji dla danego środowiska.
2. Panel przesyła dokument jako jedno pole `file` do `POST /api/v1/forms/convert`. Handler Next.js sprawdza origin i sesję, a następnie strumieniuje żądanie do prywatnego workera z tokenem usługi. Pyworker ma własny endpoint o tej samej ścieżce.
3. Worker sprawdza nazwę, sygnaturę i rozmiar. Usługa OCR odczytuje dokument przez API. Model otrzymuje rozpoznany tekst. Pydantic sprawdza odpowiedź modelu, a eksporter tworzy sekcje, identyfikatory UUID, strony `MAIN` i `FINISH` oraz `flow.links`.
4. Na tej samej stronie użytkownik porównuje źródło z JSON-em i może pobrać wynik. Przesłany plik i tekst OCR nie trafiają do PostgreSQL ani S3. Magazyn SeaweedFS ma własny wolumen oraz oddzielną uwierzytelnioną konsolę.

### Założenia kontraktu konwertera

| Element | Zachowanie |
| --- | --- |
| HTTPS | Next.js i Keycloak obsługują TLS bezpośrednio na osobnych portach localhost. S3 i jego konsola udostępniają własne porty na pętli zwrotnej. |
| Uwierzytelnienie | Dostęp do konwersji ma użytkownik z sesją Better Auth. Prywatny worker wymaga tokenu usługi. Autoryzacja per rola `forms.convert` i publiczny klient integracyjny pozostają w backlogu. |
| Dane | PostgreSQL ma osobne bazy aplikacji i Keycloak. Schemat w `packages/database/prisma` obejmuje użytkowników, konta dostawców, sesje i dane weryfikacyjne. Migracja dotyczy wyłącznie `app_db`. |
| OCR i model | PDF do 12 stron, jednoobrazowy PNG/JPEG do 24 MP, plik do 20 MiB, tekst do 100 tys. znaków. Jeden proces obsługuje jedną konwersję naraz. Model jest osobną usługą wskazaną w konfiguracji. |
| Kontrakt | Sukces zwraca konfigurację JSON. Błędy obejmują brak dostępu (401/403), rozmiar (413), format (415), nieczytelny dokument (422), zajęty worker (429) i niedostępny lub błędnie odpowiadający model (502). |
| Odbiór COI | Zakres obejmuje podstawowe pola, pełny zestaw typów, dokumenty biurowe, dane inicjalne i długie skany. Testy w docelowym importerze mają osobne kryteria odbioru. |

[Start DEV i QA oraz domeny](../README.md) · [Pierwotne wymagania projektowe](0201-initial-design.pl.md) · [Audyt projektu](0202-architecture-audit.pl.md) · [Backlog COI](9999-backlog.pl.md)

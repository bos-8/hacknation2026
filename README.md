# FORMIQ

FORMIQ to pracownia do cyfryzacji formularzy. Docelowym wynikiem konwersji blankietu dla COI jest formularz JSON.

## Lokalne adresy usług

**W DEV i QA nie ma Nginx.** Next.js obsługuje HTTPS aplikacji, a Keycloak obsługuje HTTPS logowania i konsoli. [Konfiguracja Compose i certyfikatów](docs/0302-local-docker.pl.md)

| Usługa | DEV | QA |
| --- | --- | --- |
| S3 Console — panel SeaweedFS | [localhost:8090/login](http://localhost:8090/login) | [localhost:18090/login](http://localhost:18090/login) |
| Auth Console — administracja Keycloak | [localhost:8443/admin/](https://localhost:8443/admin/) | [localhost:9443/admin/](https://localhost:9443/admin/) |
| Aplikacja FORMIQ | [localhost:3000](https://localhost:3000) | [localhost:3100](https://localhost:3100) |
| Pyworker — Swagger UI | [Otwórz Swagger UI na localhost](http://localhost:8010/docs) | W sieci Compose pod `http://pyworker:8010/docs` |
| Pyworker — stan gotowości | [localhost:8010/health/ready](http://localhost:8010/health/ready) | Tylko w sieci Compose pod `http://pyworker:8010/health/ready` |
| S3 API — dla klientów S3 | [localhost:8333](http://localhost:8333) | [localhost:18333](http://localhost:18333) |
| Keycloak — konfiguracja OIDC realmu FORMIQ | [Discovery DEV](https://localhost:8443/realms/FORMIQ/.well-known/openid-configuration) | [Discovery QA](https://localhost:9443/realms/FORMIQ/.well-known/openid-configuration) |
| PostgreSQL — połączenie klientem SQL | `localhost:5432` | `localhost:15433` |
| Prisma Studio — po uruchomieniu `pnpm db:studio` | [localhost:5555](http://localhost:5555) | — |

Logowanie użytkownika rozpocznij w aplikacji. Better Auth korzysta z klienta `formiq-web` w realmie `FORMIQ` i wraca do `/api/v1/auth/callback/keycloak` pod adresem aplikacji. Przy równoczesnej pracy w DEV i QA użyj osobnych profili przeglądarki, ponieważ ciasteczka Keycloak na `localhost` są współdzielone między portami. Konsolę S3 dla QA uruchom poleceniem `pnpm s3console:up --mode qa`.

## Od pliku do wyniku

Katalog plików przechowuje dokumenty w SeaweedFS. Na stronie **Formularze** uruchom analizę opłaconego blankietu. Pyworker przyjmuje plik i metadane w jednym żądaniu. Next.js zapisuje wynik, a szczegóły formularza pokazują oryginał, JSON COI i współrzędne wykrytych pól. [Architektura](docs/0200-architecture.pl.md)

### Lokalny pipeline formularzy

Pyworker odczytuje komórki XLSX i ODS w kolejności widocznych arkuszy. Docling obsługuje strony PDF z tekstem oraz awaryjny odczyt DOCX. Apache POI obsługuje binarny DOC. PaddleOCR‑VL‑1.6 odczytuje obrazy i skany, a PP‑StructureV3 pomaga przy tabelach i stronach bez wyniku pierwszego odczytu. Qwen3.5‑27B działa na prywatnym endpointcie vLLM. Pliki są przetwarzane w obrębie żądania.

Zbuduj obraz z opcjonalnym środowiskiem odczytu na Pythonie 3.13. Qwen z konfiguracji Compose wymaga hosta z NVIDIA Container Toolkit i GPU mieszczącym wybraną wersję modelu.

```powershell
docker compose --env-file apps/pyworker/.env -f infra/local/compose.pipeline.yaml build pyworker
$models = (New-Item -ItemType Directory -Force apps/pyworker/.models).FullName
docker run --rm --mount "type=bind,source=$models,target=/models" formiq-pyworker:pipeline docling-tools models download layout tableformer --output-dir /models/docling
docker run --rm --mount "type=bind,source=$models,target=/models" -e PADDLE_PDX_CACHE_HOME=/models/paddlex formiq-pyworker:pipeline python -m pyworker.document_reader --prepare
```

Umieść pliki modelu `Qwen/Qwen3.5-27B` w `apps/pyworker/.models/qwen`. Pobranie wag i budowa obrazu wymagają internetu. Qwen działa w wewnętrznej sieci Compose, a Pyworker publikuje port wyłącznie na loopbacku. Do dostępu z Next.js użyj tokenu zgodnego z jego konfiguracją i uruchom Web bez drugiej instancji Pyworkera na porcie 8010.

```powershell
docker compose --env-file apps/pyworker/.env -f infra/local/compose.pipeline.yaml up -d
```

Alternatywnie uruchom hostowego Pyworkera z `PYWORKER_FORM_MODE=pipeline`. `PYWORKER_DOCUMENT_PYTHON` wskazuje interpreter z `requirements.pipeline.txt`, `PYWORKER_DOC_CLASSPATH` wskazuje klasy i zależności z `mvn -f apps/pyworker/legacy-word/pom.xml package`, a `PYWORKER_LOCAL_LLM_URL` wskazuje lokalne `/v1/chat/completions`. `PYWORKER_PIPELINE_TIMEOUT_SECONDS` obejmuje odczyt i generowanie. Domyślnie obowiązuje 300 sekund.

W [Swagger UI](http://localhost:8010/docs) wywołaj `POST /v1/forms/process` z tokenem Bearer i multipartem `file` oraz `metadata`. **`draft` to JSON do importu COI**, a `field_locations` zawiera dodatkowe ramki etykiet i miejsc do wypełnienia. Każda ramka ma numer strony od 1 i cztery współrzędne `[x0, y0, x1, y1]` w zakresie od 0 do 1, liczone od lewego górnego rogu.

`field_confidences` podaje samoocenę Qwena dla pól ocenionych przez model. `ocr_confidence` to najniższy wynik OCR spośród przypisanych fragmentów etykiety, jeśli każdy ma wynik silnika. W pozostałych przypadkach ma wartość `null`.

W aplikacji WWW wysłanie opłaconego formularza uruchamia `POST /api/v1/forms/{id}/process`. Odpowiedź HTTP 202 zawiera identyfikator operacji w polu `operation`. Stan zlecenia można odczytać przez `GET /api/v1/forms/{id}/process?operation={operation}`. Konsument kolejki `form.process` pobiera po jednym oryginale z S3, wywołuje Pyworker i zapisuje wynik przy formularzu. Po aktualizacji kodu konsumenta uruchom ponownie lokalny proces kolejki.

W szczegółach formularza można przełączać prawy panel między JSON-em a edycją odpowiedzi. Pola zasilają wartości odczytane z dokumentu oraz zapisane poprawki. Pobranie JSON-a z tego panelu uwzględnia zapisane wartości pól edytowalnych. Przy kolejnej analizie tabel Pyworker wykorzystuje obramowania, nagłówki oraz położenie odczytanego tekstu do powiązania odpowiedzi z komórką.

Własny system prompt zapisz jako plik UTF‑8 i ustaw `PYWORKER_PIPELINE_PROMPT_FILE`. W Compose umieść go np. w `.models/system-prompt.txt` i wskaż `/models/system-prompt.txt`. Pyworker wczytuje go podczas startu i przekazuje Qwenowi w roli `system`. Fragmenty blankietu trafiają do roli `user`.

W DEV z Eden AI ustaw `EDENAI_MAX_INPUT_CHARS` i `EDENAI_MAX_OUTPUT_TOKENS`, by zmienić limity odczytanego tekstu i generowania. Domyślne wartości wynoszą 200 000 znaków i 16 384 tokeny. Odpowiedź HTTP z Chat Completions może mieć do 2 MiB. Next.js zapisuje poprawny wynik w PostgreSQL przy UUID formularza. Podgląd i pobranie JSON są dostępne obok oryginału.

Domyślny tryb DEV `PYWORKER_FORM_MODE=vision` wysyła JPG, PNG oraz obraz każdej strony PDF do Qwen3-VL-235B-A22B-Instruct przez Eden AI. Model wskazuje linie do wpisania odpowiedzi, kratki wyboru i komórki tabel. Pyworker zapisuje w odpowiedzi numer strony i prostokąt pola, a dla komórek także numer wiersza i kolumny. Strony PDF z warstwą tekstową zachowują ją jako kontekst dla etykiet. Dla XLSX, ODS, DOCX, TXT i JSON Pyworker odczytuje treść lokalnie i wysyła ją do tego samego Qwena do analizy pól. Model dla stron ustawia `EDENAI_VISION_MODEL`, a dla treści dokumentów `EDENAI_LLM_MODEL`. Oba domyślnie wskazują model 235B z `reasoning_effort=none`. Apache 2.0 obejmuje wagi modelu. Wywołania w DEV korzystają z zewnętrznego API. [Karta Qwen3-VL](https://huggingface.co/Qwen/Qwen3-VL-235B-A22B-Instruct)

`PYWORKER_FORM_MODE=ocr` tworzy JSON COI bez LLM. Pyworker odczytuje lokalnie XLSX, ODS, DOCX, TXT, JSON oraz PDF z czytelnym tekstem na każdej stronie. Obrazy i PDF wymagający OCR trafiają w tym trybie do Eden AI. W trybie `pipeline` wybór między tekstem PDF a OCR odbywa się osobno dla każdej strony.

Przed OCR worker wyostrza kopię obrazu w pamięci i wzmacnia kontrast słabo czytelnego skanu. Dotyczy to JPG, PNG i stron renderowanych dla PaddleOCR. Przy wysyłce PDF do Eden worker może poprawić pojedynczy obraz skanu na stronie, zachowując układ PDF. Bardziej złożone strony przekazuje w oryginalnej postaci.

### Model formularza i profile procedur

W odpowiedzi `POST /v1/forms/process` pole `form_ir` zawiera model pośredni w wersji 1.0.0, kandydatów na profil, pochodzenie pól, warunki aktywności i elementy do weryfikacji. Pole `draft` zawiera konfigurację COI. Next.js zapisuje oba przy pliku, udostępnia podgląd modelu w szczegółach i eksportuje `draft` dotychczasowym przyciskiem pobierania. Ponowna analiza dodaje model do wcześniej przetworzonego pliku.

Sumy SHA-256 wiążą dziewięć zbadanych PDF-ów z inwentarzem 138 grup pól. Dla numeru porządkowego i nadpłaty adapter ma osobne układy. Dla pozostałych wzorów uzupełnia ekstrakcję o grupy z audytu. Nowe wersje plików otrzymują propozycję procedury na podstawie treści. Brak rozpoznania, wiele procedur i konflikt źródłowy mają osobne statusy w podglądzie. Wszystkie profile pozostają robocze. Reguły podpisu, uprawnienia urzędowe i źródła danych wymagają zatwierdzenia przed uruchomieniem e-usługi.

Profil nadpłaty rozpoznaje również pełną zgodność tekstu z blankietem Ulan-Majorat (`reference_text`). Czytnik DOCX dołącza treść przywołanych przypisów. Zmiana organu, adresu lub treści przypisu wyłącza to dopasowanie. Rola składającego steruje danymi podatnika, podpisujących i dokumentami umocowania. Przypis określa widoczność PESEL albo NIP. Formularz korzysta ze słownika krajów, a przy niepodłączonym TERYT pozwala wprowadzić adres ręcznie. Podpis w Form IR wskazuje uczestników i formularz. Powiązanie z bajtami podpisywanej wersji należy do integracji podpisu.

Kontrolki kwoty i rachunku podają nazwę walidatora w `form_ir.form` w polu `config.validator`. Uwierzytelniony `POST /v1/forms/fields/validate` przyjmuje np. `{"validator":"positive_pln","value":"12,34"}` i zwraca `{"valid":true}`. Walidator `positive_pln` wymaga dodatniej kwoty z maksymalnie dwoma miejscami dziesiętnymi. `pl_bank_account` sprawdza 26 cyfr NRB lub IBAN z prefiksem PL, łącznie z sumą kontrolną. Renderer korzystający z Form IR może wywołać ten endpoint dla aktywnego pola. Eksport COI zawiera walidatory opisane w materiałach technicznych.

W grupie **Forms** w Swagger UI dostępne są uwierzytelnione operacje `GET /v1/forms/schemas/v1` (schemat całego `form_ir`) oraz `GET /v1/forms/schemas/v1/catalog` (84 typy, specjalizacje, profile i słowniki). Wygenerowane zasoby trafiają do obu obrazów Pyworkera razem z kodem. Po zmianie materiałów uruchom z katalogu repozytorium poniższe polecenia w środowisku Pythona Pyworkera. [Swagger UI w DEV](http://localhost:8010/docs)

```powershell
apps/pyworker/.venv/Scripts/python.exe materials/formularz-json/waliduj_formularze.py materials/formularz-json/formularze_pelny_przyklad.json materials/formularz-json/formularze.schema.json
apps/pyworker/.venv/Scripts/python.exe scripts/sync-form-ir.py
```

### Analiza EXTENDED i przegląd decyzji

`POST /v1/forms/process` domyślnie dobiera profil EXTENDED dla rozpoznanej wersji wniosku o nadpłatę z Ulan-Majoratu. Parametr `as_of` określa datę czynności. Profil pochodzi z `materials/formularz-json2` i jest dostarczany w zasobach Pyworkera.

W **Formularze → szczegóły → Decyzje do przeglądu** właściciel może rozpatrzyć proponowane pola i pobrać zaktualizowany JSON. Dokumentacja zawiera przykład do uruchomienia w Swagger UI, opis decyzji i kryteria odbioru. [Profil EXTENDED i przegląd wniosku](docs/0204-extended-review.pl.md)

## Pierwsze uruchomienie DEV

Wymagane są Docker Engine z Compose, Node.js (zalecana wersja 26, minimum 22.18), pnpm w wersji z `package.json` oraz Python 3.12–3.14. Interpreter workera można wskazać zmienną `PYWORKER_PYTHON`.

1. W katalogu repozytorium uruchom `pnpm stack:init`. Polecenie przygotowuje prywatny plik `infra/local/.env.dev`.
2. Uruchom `pnpm env:example:copy`, aby utworzyć brakujące pliki środowiskowe w całym repozytorium. Polecenie kopiuje treść bajt w bajt i usuwa z nazwy tylko końcowe `.example`, np. `.env.example` → `.env`, `.env.dev.example` → `.env.dev`, `.env.qa.example` → `.env.qa`. Istniejące pliki są pomijane. W utworzonych kopiach uzupełnij wartości przykładowe. Jeśli chcesz wygenerować sekrety QA automatycznie, wykonaj `pnpm qa:init` przed kopiowaniem.
   W konfiguracji DEV uzgodnij adresy baz z `DB_APP_*` i `DB_QUEUE_*`, sekret klienta web z `KEYCLOAK_WEB_CLIENT_SECRET`, a dane klienta katalogowego i S3 z odpowiednimi wpisami infrastruktury. Wygeneruj odrębny `AUTH_SECRET` o długości co najmniej 32 znaków. Ustaw zgodne tokeny API workera i mostu kolejki w procesach, które z nich korzystają.
3. W `infra/local/certs` repozytorium dostarcza certyfikat serwera `localhost.pem` i publiczny certyfikat CA `rootCA.pem`. Do uruchomienia Next.js i Keycloak na nowym stanowisku potrzebny jest jeszcze pasujący, lokalny `localhost-key.pem`. Jeśli go nie masz, użyj własnego kompletu certyfikatów zgodnie z [instrukcją TLS](docs/0302-local-docker.pl.md). Dodaj publiczny certyfikat wybranego CA do zaufanych w systemie lub przeglądarce.
4. Uruchom `pnpm validate:certs`, a następnie `pnpm dev`. Start sprawdza konfigurację, synchronizuje zależności z plikami blokad, przygotowuje środowisko Pythona i kontenery, wykonuje migracje Prisma, uzupełnia brakujące dane początkowe i uruchamia procesy aplikacji. Po starcie otwórz adres aplikacji DEV z tabeli.

### Konta testowe Keycloak w DEV

`pnpm dev` po uruchomieniu Keycloak automatycznie tworzy w realmie `FORMIQ` konta `admin` (rola `ROOT`) i `user` (rola `USER`). Przy pierwszej inicjalizacji `pnpm stack:init` generuje hasła w prywatnym `infra/local/.env.dev`. W starszej konfiguracji bez tych zmiennych nowe konta lokalnego DEV otrzymują jako hasło swoją nazwę użytkownika. Kolejne starty zachowują hasła istniejących kont i sprawdzają role. Sam seed można powtórzyć przez `pnpm dev:seed:users`.

| Login | E-mail | Rola w FORMIQ |
| --- | --- | --- |
| `admin` | `admin@formiq.test` | `ROOT` — pełny dostęp do aplikacji |
| `user` | `user@formiq.test` | `USER` — standardowy użytkownik |

Zaloguj się przez [aplikację DEV](https://localhost:3000). Konsola administracyjna Keycloak korzysta z odrębnego konta operatora w realmie `master`.

## Środowiska i struktura repozytorium

| Środowisko | Uruchomienie i dane |
| --- | --- |
| DEV | Next.js, kolejka Node.js i pyworker działają na hoście. Projekt Compose `formiqdev` obsługuje PostgreSQL, Keycloak, SeaweedFS i konsolę S3. |
| QA | Projekt `formiqqa` uruchamia również aplikację i oba workery w kontenerach. `pnpm qa:init` przygotowuje `infra/local/.env.qa` z szablonu. Po uzupełnieniu konfiguracji `pnpm qa:up` sprawdza ją, buduje obrazy, wykonuje migracje i uruchamia usługi. |
| PROD | Plan obejmuje promocję obrazów z QA na AWS Lightsail oraz infrastrukturę Terraform w `infra/aws`. |

DEV i QA mają osobne dane dostępowe i wolumeny. Prywatne pliki środowiskowe i klucze pozostają lokalne. Do repozytorium trafiają szablony konfiguracji.

| Katalog | Odpowiedzialność |
| --- | --- |
| `apps/web` | Next.js App Router, serwer HTTPS, interfejs PL/EN, Better Auth, panel administracyjny, katalog produktów, plików i tagów oraz przegląd OCR |
| `apps/pyworker` | Prywatne API FastAPI/Uvicorn, diagnostyka i Swagger UI |
| `packages/database` | Schemat aplikacji, klient i migracje Prisma 7.10.1 dla `app_db` |
| `packages/queue` | Kolejka pg-boss w `queue_db`. Worker Node.js pobiera zadania, obsługuje ponowienia i zleca przetwarzanie workerowi Python. |
| `packages/monitoring` | Monitorowanie usług i ich gotowości |
| `infra/local` | Compose DEV/QA, TLS, Keycloak, SeaweedFS i PostgreSQL 18.6 z osobnymi bazami `app_db`, `keycloak_db` i `queue_db` |
| `infra/aws` | Miejsce na konfigurację docelowego wdrożenia |

Bazę techniczną projektu zaczerpnięto z Modulon PoC. Keycloak zarządza tożsamością, poświadczeniami i rolami. Better Auth zapisuje sesje aplikacji w PostgreSQL, a backend Next.js egzekwuje uprawnienia. Tokeny dostawcy i dane dostępu do usług pozostają po stronie serwera.

## Polecenia robocze

| Polecenie | Zastosowanie |
| --- | --- |
| `pnpm dev:doctor` | Diagnozuje konfigurację, TLS, porty, Docker, stan usług i schematy baz. |
| `pnpm dev` | Uruchamia pełny DEV. Aliasy `pnpm dev:start:cold` i `pnpm dev:start:warm` korzystają z tego samego mechanizmu. |
| `pnpm dev:stop` / `pnpm dev:restart` | Zatrzymuje lub restartuje nadzorowane procesy i infrastrukturę z zachowaniem wolumenów. Ctrl+C w terminalu DEV zatrzymuje procesy hosta i pozostawia kontenery uruchomione. |
| `pnpm dev:infra:up` / `pnpm dev:infra:down` | Uruchamia samą infrastrukturę lub zatrzymuje ją z zachowaniem danych. Przy gotowych obrazach można użyć `pnpm dev:infra:up --no-build`. |
| `pnpm dev:infra:status` / `pnpm dev:infra:logs` | Pokazuje stan kontenerów lub ich logi. |
| `pnpm dev:prepare` | Przygotowuje aplikację i kolejkę przed osobnym uruchomieniem `pnpm dev:web`, `pnpm dev:pyworker` i `pnpm dev:queue` w oddzielnych terminalach. |
| `pnpm queue:setup` / `pnpm pyworker:setup` | Przygotowuje odpowiednio kolejkę i środowisko Pythona. |
| `pnpm check` | Sprawdza typy, lint i testy projektu. `pnpm test:web` oraz `pnpm test:pyworker` uruchamiają wybrane zestawy. |
| `pnpm build` / `pnpm start` | Buduje aplikację webową lub uruchamia przygotowaną wersję. |
| `pnpm clean:dry` / `pnpm dev:clean` | `pnpm clean` usuwa również `apps/pyworker/.venv`. Podgląd pokazuje zakres czyszczenia, a `dev:clean` usuwa wygenerowane pliki i zależności po zatrzymaniu usług. `dev:clean` zachowuje środowisko wirtualne Pythona. |
| `pnpm dev:rebuild` | Odtwarza zależności i środowisko Pythona, przebudowuje kontenery i uruchamia pełny DEV. |
| `pnpm qa:build`, `pnpm qa:deploy`, `pnpm qa:start` | Wykonuje oddzielne etapy przygotowania QA. Do obsługi służą `pnpm qa:status`, `pnpm qa:logs` i `pnpm qa:stop`. |

Po zatrzymaniu procesów hosta można przebudować jeden komponent poleceniem `pnpm dev:rebuild:web`, `pnpm dev:rebuild:pyworker`, `pnpm dev:rebuild:prisma`, `pnpm dev:rebuild:queue`, `pnpm dev:rebuild:monitoring` lub `pnpm dev:rebuild:docker`. Warianty te kończą się po przygotowaniu komponentu. Kolejny `pnpm dev` uruchamia procesy hosta.

**Reset danych DEV.** Polecenie `pnpm dev:infra:delete` trwale usuwa kontenery DEV i trzy wolumeny projektu, w tym bazy aplikacji, Keycloak i kolejki, obiekty SeaweedFS oraz stan konsoli S3. Po świadomym resecie `pnpm dev` odtwarza środowisko. Do zwykłego zatrzymania służy `pnpm dev:stop`.

## Dokumentacja

- [Spis dokumentacji](docs/0000-overview.md)
- [Przewodnik deweloperski](docs/0300-cookbook.pl.md)
- [Diagnostyka i odtwarzanie danych](docs/0400-runbooks.pl.md)
- [Projekt architektury konwertera](docs/0200-architecture.pl.md)
- [Pierwotne założenia projektowe](docs/0201-initial-design.pl.md)
- [Audyt architektury](docs/0202-architecture-audit.pl.md)
- [Wymagania COI, backlog i próby odbiorowe](docs/9999-backlog.pl.md)

Właścicielem projektu jest Kacper Boś, prowadzący działalność jako Kacper Boś IT. [Kontakt](mailto:kacper.bos.it@gmail.com)

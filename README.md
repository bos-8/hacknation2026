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

Katalog plików przechowuje dokumenty w SeaweedFS. Worker Python udostępnia diagnostykę i schemat OpenAPI. Przetwarzanie nowych dokumentów w dotychczasowym panelu OCR jest niedostępne po usunięciu lokalnego silnika. Konwerter COI będzie korzystał z API OCR i LLM. [Architektura](docs/0200-architecture.pl.md)

## Pierwsze uruchomienie DEV

### OCR zdjęć przez Gemma

W panelu **Administracja → Pliki → OCR** otwórz zdjęcie PNG lub JPEG i wybierz **Rozpoznaj tekst przez Gemma**. Widok pokazuje oryginał, rozpoznany tekst i datę przesłania wybranej wersji pliku, pobraną z katalogu. Data nie jest zgadywana przez model. Wynik OCR pozostaje w widoku do odświeżenia strony.

W prywatnym `apps/web/.env` ustaw `OCR_API_URL` na pełny adres endpointu `/v1/chat/completions` usługi obsługującej obrazy, opcjonalny `OCR_API_KEY` i `OCR_MODEL=gemma-4-31b-it` (lub identyfikator tego modelu wymagany przez dostawcę). Następnie uruchom ponownie Web. Sam wpis w konfiguracji nie pobiera ani nie uruchamia modelu. Zdjęcie trafia do wskazanej usługi dopiero po uruchomieniu OCR; limit wynosi 8 MiB i 24 megapiksele. Klucze i adres API pozostają na serwerze.

### Przygotowanie środowiska

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

## Dokumentacja i licencja

- [Spis dokumentacji](docs/0000-overview.md)
- [Przewodnik deweloperski](docs/0300-cookbook.pl.md)
- [Diagnostyka i odtwarzanie danych](docs/0400-runbooks.pl.md)
- [Projekt architektury konwertera](docs/0200-architecture.pl.md)
- [Pierwotne założenia projektowe](docs/0201-initial-design.pl.md)
- [Audyt architektury](docs/0202-architecture-audit.pl.md)
- [Wymagania COI, backlog i próby odbiorowe](docs/9999-backlog.pl.md)

Właścicielem projektu jest Kacper Boś, prowadzący działalność jako Kacper Boś IT. Materiały właściciela podlegają licencji własnościowej w wersji 2.1. Komponenty zewnętrzne zachowują własne licencje. [Licencja repozytorium](LICENSE.md) · [Kontakt](mailto:kacper.bos.it@gmail.com)

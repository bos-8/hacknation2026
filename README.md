# FORMIQ

FORMIQ to pracownia do odczytu i weryfikacji dokumentów. Administrator wgrywa PDF, PNG lub JPEG, porównuje oryginał z rozpoznanym tekstem, poprawia odczyt i zatwierdza wynik. Aplikacja pozwala pobrać PDF, również w wariancie z zasłoniętymi lub oznaczonymi danymi. Docelowym wynikiem konwersji blankietu dla COI jest formularz JSON.

## Lokalne adresy usług

**W DEV i QA nie ma Nginx.** Next.js obsługuje HTTPS aplikacji, a Keycloak obsługuje HTTPS logowania i konsoli. [Konfiguracja Compose i certyfikatów](docs/0302-local-docker.pl.md)

| Usługa | DEV | QA |
| --- | --- | --- |
| S3 Console — panel SeaweedFS | [localhost:8090/login](http://localhost:8090/login) | [localhost:18090/login](http://localhost:18090/login) |
| Auth Console — administracja Keycloak | [localhost:8443/admin/](https://localhost:8443/admin/) | [localhost:9443/admin/](https://localhost:9443/admin/) |
| Aplikacja FORMIQ | [localhost:3000](https://localhost:3000) | [localhost:3100](https://localhost:3100) |
| Pyworker — stan gotowości | [localhost:8010/health/ready](http://localhost:8010/health/ready) | Tylko w sieci Compose pod `http://pyworker:8010/health/ready` |
| S3 API — dla klientów S3 | [localhost:8333](http://localhost:8333) | [localhost:18333](http://localhost:18333) |
| Keycloak — konfiguracja OIDC realmu FORMIQ | [Discovery DEV](https://localhost:8443/realms/FORMIQ/.well-known/openid-configuration) | [Discovery QA](https://localhost:9443/realms/FORMIQ/.well-known/openid-configuration) |
| PostgreSQL — połączenie klientem SQL | `localhost:5432` | `localhost:15433` |
| Prisma Studio — po uruchomieniu `pnpm db:studio` | [localhost:5555](http://localhost:5555) | — |

Logowanie użytkownika rozpocznij w aplikacji. Better Auth korzysta z klienta `formiq-web` w realmie `FORMIQ` i wraca do `/api/v1/auth/callback/keycloak` pod adresem aplikacji. Przy równoczesnej pracy w DEV i QA użyj osobnych profili przeglądarki, ponieważ ciasteczka Keycloak na `localhost` są współdzielone między portami. Konsolę S3 dla QA uruchom poleceniem `pnpm s3console:up --mode qa`.

## Od pliku do wyniku

1. Zaloguj się jako administrator, wgraj plik do katalogu plików i otwórz analizę OCR wybranej wersji. Limit przesyłanego pliku wynosi 8 MiB.
2. Worker Python odczytuje warstwę tekstową PDF przez PDFium, a skany rozpoznaje lokalnie przez Tesseract z danymi polskimi i angielskimi. Zapisuje wynik z położeniem słów na stronie, dzięki czemu można sprawdzić odczyt na tle dokumentu.
3. Porównaj dokument z transkrypcją, popraw tekst i zatwierdź OCR. Po weryfikacji oznaczeń danych możesz wyeksportować PDF w wariancie oryginalnym, z zaczernieniami lub etykietami. Pliki przechowuje SeaweedFS, a wersje, wyniki analizy i zatwierdzenia zapisuje PostgreSQL.

**Projekt konwersji do JSON.** Przepływ dla COI zakłada przekazanie tekstu OCR do lokalnego modelu przez API zgodne z OpenAI, walidację wyniku oraz podgląd i pobranie JSON obok oryginału. Ten wariant, łącznie z proponowanym interfejsem OCR, opisano w projekcie architektury. Działający panel opisany powyżej eksportuje PDF. [Projekt konwersji do JSON](docs/0200-architecture.pl.md) · [Wymagania COI i kryteria odbioru](docs/9999-backlog.pl.md)

## Pierwsze uruchomienie DEV

Wymagane są Docker Engine z Compose, Node.js (zalecana wersja 26, minimum 22.18), pnpm w wersji z `package.json` oraz Python 3.12–3.14. Interpreter workera można wskazać zmienną `PYWORKER_PYTHON`.

1. W katalogu repozytorium uruchom `pnpm stack:init`. Polecenie przygotowuje prywatny plik `infra/local/.env.dev`.
2. W `apps/web`, `apps/pyworker` i `packages/database` skopiuj brakujące pliki `.env.example` jako `.env`. Uzgodnij adresy baz z `DB_APP_*` i `DB_QUEUE_*`, sekret klienta web z `KEYCLOAK_WEB_CLIENT_SECRET`, a dane klienta katalogowego i S3 z odpowiednimi wpisami infrastruktury. Wygeneruj odrębny `AUTH_SECRET` o długości co najmniej 32 znaków. Ustaw zgodne tokeny API workera i mostu kolejki w procesach, które z nich korzystają.
3. Przygotuj w `infra/local/certs` certyfikat serwera `localhost.pem` dla `localhost` i `127.0.0.1`, klucz `localhost-key.pem` i publiczny certyfikat lokalnego CA `rootCA.pem`. Dodaj publiczny CA do zaufanych w systemie lub przeglądarce. TLS obsługują bezpośrednio Next.js i Keycloak.
4. Uruchom `pnpm validate:certs`, a następnie `pnpm dev`. Start sprawdza konfigurację, synchronizuje zależności z plikami blokad, przygotowuje środowisko Pythona i kontenery, wykonuje migracje Prisma, uzupełnia brakujące dane początkowe i uruchamia procesy aplikacji. Po starcie otwórz adres aplikacji DEV z tabeli.

### Konta testowe Keycloak w DEV

Po uruchomieniu Keycloak ustaw w prywatnym `infra/local/.env.dev` wartości `DEV_SEED_ADMIN_PASSWORD` i `DEV_SEED_USER_PASSWORD`, a następnie wykonaj `pnpm dev:seed:users`. Polecenie tworzy konta w realmie aplikacji `FORMIQ` na `localhost:8443`. Ponowne uruchomienie sprawdza role i zachowuje dotychczasowe hasła.

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
| `apps/pyworker` | Prywatne API FastAPI/Uvicorn, zadania dokumentowe, wykrywanie danych, eksport PDF i diagnostyka |
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
| `pnpm check` | Sprawdza typy, lint i testy projektu. `pnpm test:web` oraz `pnpm test:pyworker` uruchamiają wybrane zestawy, w tym testy OCR i eksportu PDF w Pythonie. |
| `pnpm build` / `pnpm start` | Buduje aplikację webową lub uruchamia przygotowaną wersję. |
| `pnpm clean:dry` / `pnpm dev:clean` | Pokazuje zakres czyszczenia lub usuwa wygenerowane pliki i zależności po zatrzymaniu usług. `dev:clean` zachowuje środowisko wirtualne Pythona. |
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

Właścicielem projektu jest Kacper Boś, prowadzący działalność jako Kacper Boś IT. Materiały właściciela podlegają licencji własnościowej w wersji 2.1. Komponenty zewnętrzne zachowują własne licencje. [Licencja repozytorium](LICENSE.md) · [Licencja danych językowych OCR](apps/pyworker/resources/tessdata/LICENSE) · [Kontakt](mailto:kacper.bos.it@gmail.com)

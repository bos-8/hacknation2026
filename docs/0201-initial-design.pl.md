---
brief: Projekt pierwszej wersji usługi konwersji blankietów do JSON dla importera COI.
tags: [architektura, fastapi, postgresql, keycloak, docker]
---

# Pierwsze podejście do architektury

Dokument zachowuje historyczny projekt lub wynik wcześniejszego audytu. Aktualny stan opisują [architektura](0200-architecture.pl.md), [Harness API](0209-harness-api.pl.md) i [start Compose PoC](0307-docker-poc.pl.md). Dawne blokery należy porównywać z aktualnym backlogiem.


> Dokument historyczny. Wariant z Nginx opisany poniżej pochodzi z pierwszego projektu. W aktualnym FORMIQ nie ma Nginx. Next.js i Keycloak obsługują HTTPS bezpośrednio. [Architektura FORMIQ](0200-architecture.pl.md)

**Projekt docelowy.** Rozwiązanie składa się z prostej aplikacji webowej i osobnego kontenera **formiq** z API w Pythonie 3.14+. Web odpowiada za wybór pliku i prezentację wyniku. Kontener przyjmuje jeden dokument, wykonuje ekstrakcję tekstu lub OCR, buduje konfigurację formularza i zwraca JSON. Klient integracyjny może wywołać ten sam endpoint bez otwierania panelu.

W obecnym repozytorium działa lokalna infrastruktura, a szkielet FastAPI udostępnia informacje o usłudze i jej stanie. Opisany niżej przepływ przesyłania i konwersji dokumentów czeka na implementację.

## Od blankietu do odpowiedzi

1. Urzędnik wybiera blankiet na stronie `/`. Web wysyła go do kontenera formiq przez `POST /api/v1/forms/convert` jako `multipart/form-data`, w polu `file`. API sprawdza uprawnienie `forms.convert` także przy bezpośrednim wywołaniu integracyjnym.
2. Aplikacja sprawdza nazwę, rozmiar, rozszerzenie i typ ustalony na podstawie zawartości. Przechowuje wejście w RAM lub w katalogu tymczasowym przypisanym do żądania. Zasady te obejmują także buforowanie uploadu przez Nginx.
3. Lokalny parser odczytuje dokument, OCR rozpoznaje skany, a lokalny model AI pomaga zbudować strony, sekcje i pola. Proces analizy ma limit czasu i współbieżności. Pierwsza wersja obsługuje żądanie bez trwałej kolejki i magazynu plików.
4. Kontener sprawdza konfigurację względem schematu i reguł COI. W tym samym żądaniu odpowiada `200 application/json` z `title`, `tabs` i `flow.links`. Web pozostaje na stronie przesyłania. Pokazuje oryginał i czytelnie sformatowany JSON obok siebie, a na wąskim ekranie jeden pod drugim. Użytkownik może pobrać dokładnie ten JSON. Przy błędzie zachowuje wybrany plik i widzi przyczynę oraz możliwość ponowienia.
5. Przeglądarka utrzymuje wybrany plik na czas porównania. Kontener usuwa kopie robocze po odpowiedzi, także w razie błędu lub przekroczenia czasu. Oryginały, tekst z OCR i wynik pozostają poza logami. Podgląd na stronie nie wymaga zapisu dokumentu w SeaweedFS.

## Stos i odpowiedzialność za dane

| Warstwa | Wybór dla pierwszej wersji |
| --- | --- |
| Web | Osobna aplikacja do przesyłania dokumentu i porównania go z wynikiem na jednej stronie. Pokazuje stan przetwarzania i błędy API. |
| API formiq | Kontener z Pythonem 3.14+, FastAPI i Uvicorn. Odpowiada za odczyt pliku, OCR, analizę, walidację i eksport do JSON. |
| Model danych i walidacja | Pydantic 2 dla reprezentacji wewnętrznej, `jsonschema` dla kontraktu wyjściowego i dodatkowe reguły semantyczne COI. |
| Baza aplikacji | PostgreSQL 18, SQLAlchemy 2.x, Alembic i sterownik `asyncpg`. Baza `app_db` przechowuje sesje panelu, słowniki i reguły. Alembic prowadzi migracje tej bazy. |
| Tożsamość | Lokalny Keycloak zarządza kontami, poświadczeniami i wydawaniem tokenów. Ma osobną bazę `keycloak_db` i własnego użytkownika PostgreSQL. |
| Analiza | Tesseract z polskimi danymi językowymi do OCR. Dobór parserów obsługujących wymagane formaty oraz modelu AI zależy od prób jakościowych, zużycia zasobów i licencji. |
| Uruchomienie | Nginx jako punkt wejścia HTTPS, prywatna sieć usług, Docker Compose. Zasoby aplikacji i modelu dostępne lokalnie podczas konwersji. |

## Uwierzytelnianie i dostęp

- **Panel.** Warstwa webowa obsługuje logowanie OIDC Authorization Code z PKCE i callback. Tokeny pozostają po stronie serwera. Przeglądarka dostaje identyfikator sesji w ciasteczku `HttpOnly`, `Secure`, `SameSite=Lax`. Operacje zapisu przez sesję, w tym upload, wymagają ochrony CSRF.
- **REST.** Klient wysyła token dostępu jako `Authorization: Bearer`. API sprawdza podpis przy użyciu kluczy JWKS lokalnego Keycloak, wystawcę (`iss`), odbiorcę (`aud`), termin ważności (`exp`) i uprawnienie `forms.convert`. Konto techniczne QA korzysta z Client Credentials. [OIDC w Keycloak](https://www.keycloak.org/securing-apps/oidc-layers)

**Otwarte ograniczenie licencyjne.** Projekt dopuszcza Apache-2.0 i podobne licencje permisywne, także dla zawartości dostarczanych obrazów. Keycloak ma licencję Apache-2.0, lecz oficjalny obraz zawiera OpenJDK na GPLv2 z wyjątkiem Classpath dla wskazanych plików. W tych warunkach obraz nie kwalifikuje się do spakowania z rozwiązaniem. Do uzgodnienia z COI pozostaje wariant z lokalnym Keycloak zapewnianym jako infrastruktura odbiorcy oraz sposób odtworzenia pełnego środowiska podczas oceny. Osobnego sprawdzenia wymagają obrazy pozostałych usług, zależności przechodnie, dane OCR i wagi modelu. [Licencja Keycloak](https://github.com/keycloak/keycloak/blob/main/LICENSE.txt) · [Dockerfile Keycloak](https://github.com/keycloak/keycloak/blob/main/quarkus/container/Dockerfile) · [Licencja OpenJDK](https://github.com/openjdk/jdk/blob/master/LICENSE)

## Docker i środowiska

Z Modulon PoC przyjmujemy odrębne środowiska DEV i QA. Docelowy PROD wykorzystuje wydanie sprawdzone w QA. Lightsail jest jednym z rozważanych miejsc wdrożenia. Wybór hosta zależy od pomiarów OCR i modelu.

| Środowisko | Topologia | Kryterium odbioru |
| --- | --- | --- |
| DEV | Domyślnie sama infrastruktura. W trybie aplikacyjnym Nginx udostępnia web, który wywołuje osobny kontener formiq. | Deweloper może przetworzyć ten sam blankiet przez panel i bezpośrednio przez API. |
| QA | Pełny stos lokalnie w kontenerach. Migracje Alembic jako jednorazowy krok wydania. Materiały testowe montowane tylko do odczytu. | Czysty start, logowanie, test API dla poprawnego i błędnego tokenu, konwersja bez internetu i sprzątanie plików po sukcesie oraz błędzie. |
| PROD | Compose na wybranym hoście. Obraz aplikacji wskazany tym samym digestem co w QA. Własna domena, TLS, baza i kopie zapasowe. | Sprawdzone odtworzenie bazy, limity zasobów oraz procedura powrotu do poprzedniego wydania uwzględniająca zgodność migracji. |

Planowane pliki to wspólny `compose.yaml` oraz nakładki `compose.dev.yaml`, `compose.qa.yaml` i `compose.prod.yaml`. Każde środowisko ma własne wolumeny, dane, klientów OIDC i sekrety przekazywane w czasie uruchomienia. Obrazy mają jawne wersje, a proces aplikacji działa z ograniczonymi uprawnieniami. Czysty checkout i start aplikacji mają działać bez lokalnego katalogu danych konkursowych.

## Kolejność realizacji

1. **Samodzielne API.** Uruchomić kontener formiq i przetworzyć przez REST blankiet DOCX oraz jego skan z zestawu nr 5 (nadpłata podatku). Zweryfikować wynik względem kontraktu COI, w tym strony, pola i przejścia. Sprawdzić odmowę dostępu bez uprawnienia i uzgodnić wariant dostawy Keycloak.
2. **Widok porównawczy.** Podłączyć web do sprawdzonego endpointu. Przesłać ten sam skan po zalogowaniu, porównać go na jednej stronie z odpowiedzią API i pobrać JSON. Powtórzyć próbę z nieczytelnym plikiem oraz ze zmianą dokumentu w trakcie żądania.
3. **Formaty i jakość.** Rozszerzyć analizę na osiem wymaganych rozszerzeń. Sprawdzić oba wzorce, odrzucenie pliku DOCX z nazwą kończącą się na `.DOC` oraz długie skany z zestawów nr 8 i 9. Potwierdzić typ pola na stronie `FINISH` z COI lub w importerze.
4. **Wydanie.** Przeprowadzić próbę QA bez internetu i pomiar czasu oraz szczytowego zużycia pamięci na 16-stronicowym wniosku sportowym. Na tej podstawie dobrać limity i host PROD. Przed dostawą zweryfikować licencje konkretnych wersji i obrazów.

Szczegółowe kryteria odbioru i rozbieżności w materiałach organizatora opisuje [backlog COI](9999-backlog.pl.md).

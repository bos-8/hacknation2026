---
brief: Projekt pierwszej wersji usługi konwersji blankietów do JSON dla importera COI.
tags: [architektura, fastapi, postgresql, keycloak, docker]
---

# Pierwsze podejście do architektury

**Status: projekt do implementacji.** Panel urzędnika i REST API mają działać jako dwa moduły jednej aplikacji FastAPI, wydawane w jednym obrazie Docker. Oba korzystają z tej samej funkcji konwersji i tych samych reguł COI. Dzięki temu poprawka wykrywania pola lub walidacji JSON trafia jednocześnie do obu ścieżek. Osobne procesy przewidujemy dla pracy obciążającej CPU i pamięć, w szczególności OCR.

## Od blankietu do odpowiedzi

1. Urzędnik przesyła blankiet w panelu pod `/`. Klient integracyjny przesyła jeden plik na `POST /api/v1/forms/convert` jako `multipart/form-data`. Obie ścieżki sprawdzają uprawnienie `forms.convert`.
2. Aplikacja sprawdza nazwę, rozmiar, rozszerzenie i typ ustalony na podstawie zawartości. Przechowuje wejście w RAM lub w katalogu tymczasowym przypisanym do żądania. Zasady te obejmują także buforowanie uploadu przez Nginx.
3. Lokalny parser odczytuje dokument, OCR rozpoznaje skany, a lokalny model AI pomaga zbudować strony, sekcje i pola. Proces analizy ma limit czasu i współbieżności. Pierwsza wersja obsługuje żądanie bez trwałej kolejki i magazynu plików.
4. Aplikacja sprawdza wynik względem JSON Schema dostarczonego przez COI oraz reguł formularza, m.in. zagnieżdżenia pól i przejść między stronami. REST zwraca gotowy JSON w odpowiedzi na upload. Panel umożliwia obejrzenie i pobranie tego wyniku.
5. Po zakończeniu żądania aplikacja usuwa pliki robocze, również po błędzie lub przekroczeniu czasu. Oryginały, tekst z OCR i treść wygenerowanego formularza pozostają poza logami.

## Stos i odpowiedzialność za dane

| Warstwa | Wybór dla pierwszej wersji |
| --- | --- |
| Web i API | Python 3.14.x, FastAPI i Uvicorn. Panel renderowany przez Jinja2, lokalne CSS i ikony SVG Bootstrap Icons. |
| Model danych i walidacja | Pydantic 2 dla reprezentacji wewnętrznej, `jsonschema` dla kontraktu wyjściowego i dodatkowe reguły semantyczne COI. |
| Baza aplikacji | PostgreSQL 18, SQLAlchemy 2.x, Alembic i sterownik `asyncpg`. Baza `app_db` przechowuje sesje panelu, słowniki i reguły. Alembic prowadzi migracje tej bazy. |
| Tożsamość | Lokalny Keycloak zarządza kontami, poświadczeniami i wydawaniem tokenów. Ma osobną bazę `keycloak_db` i własnego użytkownika PostgreSQL. |
| Analiza | Tesseract z polskimi danymi językowymi do OCR. Dobór parserów obsługujących wymagane formaty oraz modelu AI zależy od prób jakościowych, zużycia zasobów i licencji. |
| Uruchomienie | Nginx jako punkt wejścia HTTPS, prywatna sieć usług, Docker Compose. Zasoby aplikacji i modelu dostępne lokalnie podczas konwersji. |

## Uwierzytelnianie i dostęp

- **Panel.** FastAPI obsługuje logowanie OIDC Authorization Code z PKCE i callback. Tokeny pozostają po stronie serwera. Przeglądarka dostaje identyfikator sesji w ciasteczku `HttpOnly`, `Secure`, `SameSite=Lax`. Operacje zapisu przez sesję, w tym upload, wymagają ochrony CSRF.
- **REST.** Klient wysyła token dostępu jako `Authorization: Bearer`. API sprawdza podpis przy użyciu kluczy JWKS lokalnego Keycloak, wystawcę (`iss`), odbiorcę (`aud`), termin ważności (`exp`) i uprawnienie `forms.convert`. Konto techniczne QA korzysta z Client Credentials. [OIDC w Keycloak](https://www.keycloak.org/securing-apps/oidc-layers)

**Otwarte ograniczenie licencyjne.** Projekt dopuszcza Apache-2.0 i podobne licencje permisywne, także dla zawartości dostarczanych obrazów. Keycloak ma licencję Apache-2.0, lecz oficjalny obraz zawiera OpenJDK na GPLv2 z wyjątkiem Classpath dla wskazanych plików. W tych warunkach obraz nie kwalifikuje się do spakowania z rozwiązaniem. Do uzgodnienia z COI pozostaje wariant z lokalnym Keycloak zapewnianym jako infrastruktura odbiorcy oraz sposób odtworzenia pełnego środowiska podczas oceny. Osobnego sprawdzenia wymagają obrazy pozostałych usług, zależności przechodnie, dane OCR i wagi modelu. [Licencja Keycloak](https://github.com/keycloak/keycloak/blob/main/LICENSE.txt) · [Dockerfile Keycloak](https://github.com/keycloak/keycloak/blob/main/quarkus/container/Dockerfile) · [Licencja OpenJDK](https://github.com/openjdk/jdk/blob/master/LICENSE)

## Docker i środowiska

Z Modulon PoC przyjmujemy aplikację uruchamianą na hoście w DEV i próbę pełnego wydania w lokalnym QA. Docelowy PROD wykorzystuje obraz sprawdzony w QA. Lightsail jest jednym z rozważanych miejsc wdrożenia. Wybór hosta zależy od pomiarów OCR i modelu.

| Środowisko | Topologia | Kryterium odbioru |
| --- | --- | --- |
| DEV | FastAPI na hoście z automatycznym przeładowaniem. Nginx, PostgreSQL i lokalny Keycloak w Compose. Proxy kieruje ruch do aplikacji na hoście. | Deweloper może zalogować się przez OIDC, przesłać blankiet i debugować konwersję w Pythonie. |
| QA | Pełny stos lokalnie w kontenerach. Migracje Alembic jako jednorazowy krok wydania. Materiały testowe montowane tylko do odczytu. | Czysty start, logowanie, test API dla poprawnego i błędnego tokenu, konwersja bez internetu i sprzątanie plików po sukcesie oraz błędzie. |
| PROD | Compose na wybranym hoście. Obraz aplikacji wskazany tym samym digestem co w QA. Własna domena, TLS, baza i kopie zapasowe. | Sprawdzone odtworzenie bazy, limity zasobów oraz procedura powrotu do poprzedniego wydania uwzględniająca zgodność migracji. |

Planowane pliki to wspólny `compose.yaml` oraz nakładki `compose.dev.yaml`, `compose.qa.yaml` i `compose.prod.yaml`. Każde środowisko ma własne wolumeny, dane, klientów OIDC i sekrety przekazywane w czasie uruchomienia. Obrazy mają jawne wersje, a proces aplikacji działa z ograniczonymi uprawnieniami. Czysty checkout i start aplikacji mają działać bez lokalnego katalogu danych konkursowych.

## Kolejność realizacji

1. **Szkielet i dostęp.** Uruchomić DEV, pierwszą stronę panelu, migracje i OIDC. Potwierdzić konwersję dostępną dla użytkownika i klienta REST oraz odmowę dostępu bez uprawnienia. Uzgodnić wariant dostawy Keycloak.
2. **Pierwsza kompletna konwersja.** Przetworzyć DOCX z zestawu nr 5 (nadpłata podatku), zwrócić JSON przez REST i wyświetlić go w panelu. Porównać strony, pola i przejścia z przykładem COI.
3. **Formaty i jakość.** Rozszerzyć analizę na osiem wymaganych rozszerzeń. Sprawdzić oba wzorce, odrzucenie pliku DOCX z nazwą kończącą się na `.DOC` oraz długie skany z zestawów nr 8 i 9. Potwierdzić typ pola na stronie `FINISH` z COI lub w importerze.
4. **Wydanie.** Przeprowadzić próbę QA bez internetu i pomiar czasu oraz szczytowego zużycia pamięci na 16-stronicowym wniosku sportowym. Na tej podstawie dobrać limity i host PROD. Przed dostawą zweryfikować licencje konkretnych wersji i obrazów.

Szczegółowe kryteria odbioru i rozbieżności w materiałach organizatora opisuje [backlog COI](9999-backlog.pl.md).

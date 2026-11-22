---
brief: Uruchomienie całego PoC przez Docker Compose, konfiguracja API, konta i diagnostyka.
tags: [docker, compose, poc, konfiguracja]
---

# Cały PoC w Docker Compose

Wymagany jest działający Docker Engine w trybie kontenerów Linux oraz Compose 2.24.4 lub nowszy. Budowanie Web, kolejki i pyworkera odbywa się w kontenerach. Instalacja Node, pnpm, Pythona ani profilu AWS na komputerze użytkownika nie jest potrzebna.

## Konfiguracja i start

W głównym katalogu repozytorium utwórz ignorowany przez Git plik `.env.poc.local`.

```dotenv
PYWORKER_HARNESS_API_URL=https://ADRES_TWOJEGO_API/
PYWORKER_HARNESS_API_KEY=TWÓJ_KLUCZ_API
```

Adres i aktywny klucz otrzymujesz od administratora usługi. Publiczny [plik .env.poc](../.env.poc) zawiera pozostałe ustawienia lokalnego PoC. Klucz musi mieć co najmniej 32 znaki. Zmienne powłoki mają pierwszeństwo przed plikami środowiska.

Z katalogu głównego wykonaj jedno polecenie.

```sh
docker compose up --build -d --wait
```

[Główny Compose](../compose.yaml) dołącza bazową konfigurację infrastruktury, QA oraz dwa rozszerzenia PoC. Usługa `preflight` sprawdza adres HTTPS, klucz i termin dostępu. `maintenance` wykonuje migracje, seed i założenie brakujących kont w Keycloak oraz bazie aplikacji. Następnie uruchamiane są Web, kolejka i pyworker. Pierwsza budowa wymaga internetu i może potrwać kilka minut.

| Usługa | Adres na komputerze |
| --- | --- |
| Web | `http://127.0.0.1:4100` |
| Keycloak | `http://127.0.0.1:10800` |
| PostgreSQL | `localhost:25433` |
| S3 | `http://localhost:28333` |
| Konsola S3 w opcjonalnym profilu tools | `http://localhost:28090/login` |
| Pyworker | Tylko sieć Compose, `http://pyworker:8010` |

| Konto aplikacji | Hasło początkowe | Rola |
| --- | --- | --- |
| admin | admin | ROOT |
| user | user | USER |

Seed zachowuje istniejące konta i hasła. Wiąże lokalnego użytkownika z kontem OIDC przez zweryfikowany UUID Keycloak, dzięki czemu pierwsze logowanie nie wymaga automatycznego łączenia kont po adresie email. Administrator realmu `master` oraz rola ROOT aplikacji należą do osobnych granic uprawnień. Jawne hasła z pliku PoC służą lokalnemu uruchomieniu.

## HTTP i trwałość danych

Web działa pod `http://127.0.0.1:4100`, a Keycloak pod `http://127.0.0.1:10800`. Lokalny PoC nie wymaga certyfikatów. Adres IP omija HSTS zapamiętane wcześniej dla `localhost`. Korzystaj z podanych adresów, aby origin logowania, callback i ciasteczka były spójne. Ciasteczka sesji zachowują `HttpOnly` i `SameSite=Lax`, a flaga `Secure` jest dobierana do schematu adresu aplikacji.

Porty są publikowane wyłącznie na loopbackie. Połączenie z Harness API w AWS nadal wymaga HTTPS i klucza Bearer. DEV oraz klasyczne QA zachowują własne ustawienia TLS.

Projekt `formiqpoc` ma odrębne wolumeny PostgreSQL i SeaweedFS. Restart oraz `docker compose down` zachowują dane. Opcja `down -v` usuwa wolumeny i dane. Migracja z wcześniejszego PoC HTTPS zachowuje konta i oryginały. Wykonaj ponownie zwykłe polecenie startowe. Stary kontener `cert-init` i wolumen certyfikatów nie są już wykorzystywane i mogą pozostać bez wpływu na działanie.

## Sprawdzenie i obsługa

```sh
docker compose config --quiet
docker compose ps -a
docker compose logs --tail 100 preflight maintenance web queue pyworker
```

`preflight` i `maintenance` powinny zakończyć się kodem 0. Kontenery usług długotrwałych powinny być zdrowe. `config --quiet` sprawdza konfigurację bez wypisywania rozwiniętych sekretów. Sama walidacja Compose nie sprawdza uprawnień klucza w AWS.

```sh
docker compose restart web queue pyworker
docker compose down
```

Przy zmianie env lub kodu wykonaj ponownie polecenie budowania i uruchomienia. Restart nie przedłuża ważności API. Ustawiony termin to `2026-11-22T19:09:47.576880+00:00`, czyli 22 listopada 2026 o 20:09:47 czasu polskiego. Po terminie wymagane jest autoryzowane odnowienie konfiguracji klienta i serwera. [Harness API i ograniczenia](0209-harness-api.pl.md)

Wariant HTTP sprawdzono przez pełny start Compose, migracje, gotowość usług oraz logowanie i wylogowanie obu kont. Test przeglądarkowy potwierdził callback OIDC, ciasteczka sesji i odrzucenie wylogowania z obcego Origin. Przetworzenie dwustronicowego PDF było sprawdzone wcześniej, przed zmianą lokalnego transportu na HTTP.

[Cookbook](0300-cookbook.pl.md) · [Osobne środowiska DEV i klasyczne QA](0302-local-docker.pl.md)

Pełne logowanie HTTP przez Keycloak, callback, ciasteczka sesji i wylogowanie obu kont można sprawdzić poleceniem `python tests/infra/poc-http.integration.py` na uruchomionym PoC. Test korzysta z biblioteki standardowej i publicznych kont PoC.

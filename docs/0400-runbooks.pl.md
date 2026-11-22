---
brief: Diagnoza usług lokalnych, granice testów i procedury odzyskiwania.
tags: [operacje, diagnostyka, testy]
---

# Instrukcje operacyjne

## Diagnostyka startu Compose PoC

Użyj `docker compose ps -a` i `docker compose logs --tail 100 preflight maintenance web queue pyworker`. Poprawne zakończenie usług jednorazowych oznacza kod 0. Brak klucza lub niepoprawny adres zatrzymuje start. Wygaśnięcie dostępu wymaga autoryzowanej aktualizacji po obu stronach API, a nie restartu. HTTP 429 oznacza zajęte cztery miejsca analiz po stronie serwera. [Procedura PoC](0307-docker-poc.pl.md) · [Kody API](0209-harness-api.pl.md)

Przy brakujących stronach sprawdź liczbę stron `document_content`, źródłowy format i komunikat etapu. Przy niezgodnych ramkach wykonaj ponowną analizę po aktualizacji workera. Geometria skanu wymaga kontroli wizualnej. Nie umieszczaj kluczy ani całych dokumentów w zgłoszeniu diagnostycznym.


| Objaw | Co sprawdzić |
| --- | --- |
| Przeglądarka nie otwiera aplikacji | W DEV sprawdź, czy działa proces Web uruchamiany przez `pnpm dev` i czy port 3000 jest wolny przed startem. W QA sprawdź usługę `web` poleceniami `pnpm qa:status` i `pnpm qa:logs`. Nie ma Nginx ani zastępczej strony 502. |
| Błąd certyfikatu | Uruchom `pnpm validate:certs`, sprawdź nazwę `localhost`, datę ważności i zaufanie do publicznego CA w kliencie. [Procedura TLS](0302-local-docker.pl.md) |
| Logowanie wraca do strony publicznej albo administracja odmawia dostępu | Sprawdź odpowiedź OIDC discovery realmu, origin callbacku i rolę w realmie aplikacji. Do jednoczesnej pracy w DEV i QA używaj odrębnych profili przeglądarki. [Diagnostyka sesji](0304-keycloak-login.pl.md) |
| Aplikacja odpowiada, ale nie wykonuje pracy | Sprawdź `/api/v1/health/live` oraz `/api/v1/health/ready` na porcie Web. Dla zadania OCR sprawdź również kolejkę, gotowość workera i stan wersji dokumentu. [Kolejka i monitoring](0311-postgresql-queue.pl.md) |
| Brakuje zawartości pliku lub trzeba odtworzyć środowisko | Zidentyfikuj wersję i odczytaj historię katalogu, następnie porównaj rekord z obiektem S3. [Raport spójności i kopie](0403-data-recovery.pl.md) |

## Weryfikacja zmian

`pnpm check` obejmuje typy, lint i testy projektu. Do testowania bootstrapu Compose służy `pnpm test:infra`; QA ma osobny scenariusz `pnpm test:qa:integration`. Testy integracyjne wymagają działającego Dockera. Zestaw `pnpm test:reliability` koncentruje się m.in. na sesjach, procesach, usuwaniu osieroconych obiektów i kopiach wolumenów.

Scenariusz `pnpm test:browser:reliability` nadal sprawdza na wejściu odziedziczoną nazwę hosta z Modulonu. W aktualnej postaci zatrzyma się dla `localhost`. Do ręcznego sprawdzenia FORMIQ otwórz aplikację, zaloguj się przez Keycloak, przejdź do chronionego widoku i wyloguj się. [Warunek w teście przeglądarkowym](../tests/browser/reliability.integration.mjs)

[Uruchomienie DEV i QA](../README.md) · [Spis dokumentacji](0000-overview.md)

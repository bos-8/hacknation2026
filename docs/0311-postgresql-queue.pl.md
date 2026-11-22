---
brief: Trwałe zadania pg-boss, wykonanie w Pythonie i konfiguracja monitoringu.
tags: [pg-boss, python, monitoring, konfiguracja]
---

# Kolejka, pyworker i monitoring

## Kolejka formularzy w PoC

Compose uruchamia konsumenta razem z Web i pyworkerem po migracjach. Web zleca `form.process` i zwraca HTTP 202 z identyfikatorem operacji. Konsument pobiera oryginał z S3, wywołuje `POST /v1/forms/process` i zapisuje wynik przy formularzu. Stan jest dostępny pod `GET /api/v1/forms/{id}/process?operation={operation}`. Powiadomienia pokazują etap i postęp. Gotowość HTTP workera nie zastępuje działającego konsumenta.

W PoC użyj `docker compose ps -a` oraz `docker compose logs --tail 100 queue pyworker`. Worker jest dostępny wyłącznie w sieci Compose. Token wywołania przetwarzania musi odpowiadać konfiguracji konsumenta. [Start PoC](0307-docker-poc.pl.md) · [Limity i błędy dostawcy](0209-harness-api.pl.md)


Worker Node.js pobiera zadania z pg-boss w `queue_db`, zleca pracę przez uwierzytelnione HTTP i zapisuje wynik etapu. Python wykonuje operacje na dokumencie. Osobny most HTTP umożliwia przekazanie postępu lub zgłoszenia z Pythona do procesu Node. Tokeny `PYWORKER_API_TOKEN` i `PYWORKER_QUEUE_TOKEN` zabezpieczają różne kierunki komunikacji. [Pakiet kolejki](../packages/queue/src/) · [API workera](../apps/pyworker/src/pyworker/main.py)

| Co chcesz sprawdzić | Jak |
| --- | --- |
| Środowisko Pythona | `pnpm pyworker:setup` przygotowuje lokalne środowisko wirtualne; `pnpm dev:pyworker` uruchamia proces. Zależności określają [manifest](../apps/pyworker/pyproject.toml) i plik blokady workera. |
| Gotowość workera | W DEV użyj `http://localhost:8010/health/ready`. W QA stan kontenera pokaże `pnpm qa:status`. Prywatny kontrakt dokumentowy to `POST /v1/tasks/document`. |
| Zadanie nie opuszcza kolejki | W panelu `/pl/admin/queue` sprawdź stan i próbę wykonania. Następnie sprawdź proces konsumenta, połączenie do `queue_db`, gotowość Pythona oraz zgodność adresu i tokenów. Samo działające HTTP workera nie oznacza, że ktoś pobiera zadania. |
| Ponowienia i odzyskiwanie | `pnpm test:queue:backoff` sprawdza zasady opóźnień. `pnpm test:pyworker:bridge` dotyczy mostu, a `pnpm test:queue:recovery` odzyskiwania po przerwaniu pracy. |

## Sygnały i ustawienia systemowe

Panel `/pl/admin/monitoring` pokazuje historię Web, backendu, bazy, Keycloak, magazynu, kolejki i pyworkera. Widoki mają zakres 8, 24, 72 lub 168 godzin. Brak aktualnej próbki i zarejestrowany błąd usługi to różne stany; przy braku próbek z wielu usług sprawdź proces zbierający wyniki i aktywną konfigurację. [Definicje sygnałów](../packages/monitoring/src/contracts.ts)

W `/pl/admin/settings` administrator edytuje szkic, publikuje wersję ustawień i wskazuje wersję aktywną. Sama publikacja nie przełącza konfiguracji. Powrót do wcześniejszych ustawień polega na aktywowaniu dostępnej opublikowanej wersji. Historia aktywacji pozostaje w bazie. Adresy usług i sekrety nadal pochodzą ze środowiska. Do sprawdzenia tych mechanizmów służą `pnpm test:monitoring` i `pnpm test:config:integration`.

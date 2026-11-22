---
brief: Granice trzech baz PostgreSQL, migracje i seed danych aplikacji.
tags: [postgresql, prisma, migracje]
---

# Bazy PostgreSQL i Prisma

## Baza w PoC

W projekcie `formiqpoc` migracje i seed wykonuje jednorazowy kontener `maintenance` przed startem aplikacji. Skrypt `scripts/poc-seed-users.mjs` zakłada brakujące konta admin i user w Keycloak oraz wiąże je z bazą aplikacji przez UUID Keycloak. Zachowuje istniejące konta i hasła oraz tworzy brakujące powiązanie OIDC `provider/subject` dla zweryfikowanego UUID. [Przygotowanie całego stosu](0307-docker-poc.pl.md)


| Baza | Właściciel schematu | Co przechowuje |
| --- | --- | --- |
| `app_db` | Prisma w `packages/database` | Konta powiązane z dostawcą, sesje Better Auth, katalogi, wersje plików, analizy OCR, zatwierdzenia, ustawienia i historię zmian. |
| `keycloak_db` | Keycloak | Poświadczenia, konfigurację realmu, klientów OIDC i role. Konta testowe tworzy się przez API Keycloak. |
| `queue_db` | pg-boss | Zadania, próby wykonania i stan kolejki. Obsługuje ją konsument Node.js. |

Treść przesłanych plików i wygenerowane PDF trafiają do SeaweedFS. W bazie aplikacyjnej jest identyfikator wersji, powiązanie z obiektem i wynik analizy. Przy odtwarzaniu katalogu potrzebne są zarówno dane PostgreSQL, jak i wolumen magazynu. [Kopie i odtwarzanie](0403-data-recovery.pl.md)

## Praca deweloperska

- Przed zmianą sprawdź `pnpm check:dev-databases` i `pnpm db:status`. Adres sterujący Prisma CLI znajduje się w prywatnym env pakietu bazy. Zgodność adresów Web i CLI ma znaczenie przy diagnozowaniu brakującej tabeli po migracji.
- Po edycji schematu użyj `pnpm db:validate`, utwórz migrację przez `pnpm db:migrate:create` i sprawdź jej SQL. Zatwierdzone migracje stosuje `pnpm dev:migrate`. `pnpm db:generate` odświeża klienta Prisma.
- `pnpm dev:seed` uzupełnia początkowe rekordy aplikacji, m.in. aktora systemowego i konfigurację. Konta do interaktywnego logowania zakłada odrębne `pnpm dev:seed:users`. `pnpm queue:setup` przygotowuje bazę kolejki.
- Do odczytu schematu w przeglądarce służy `pnpm db:studio`. Typy, migracje i logikę początkowych danych można sprawdzić poleceniem `pnpm test:database`. Test z prawdziwą bazą ma osobną komendę `pnpm test:database:integration`.

[Schemat aplikacji](../packages/database/prisma/schema.prisma) · [Migracje](../packages/database/prisma/migrations/) · [Seed aplikacji](../packages/database/prisma/seed.ts)

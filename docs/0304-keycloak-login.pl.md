---
brief: Logowanie do FORMIQ, role aplikacji, profil i obsługa sesji.
tags: [oidc, keycloak, better-auth, sesje]
---

# Tożsamość i sesje

Użytkownik wybiera logowanie w aplikacji. Better Auth rozpoczyna przepływ OIDC z PKCE S256 dla klienta `formiq-web`. Przeglądarka trafia do realmu `FORMIQ`; po zalogowaniu Keycloak zwraca ją do `/api/v1/auth/callback/keycloak` na porcie aplikacji. Better Auth zapisuje sesję w `app_db`. Osobny klient serwerowy `formiq-directory` ma ograniczony dostęp do odczytu katalogu. [Definicja realmu i klientów](../infra/local/keycloak/realms/formiq-realm.json)

**Dostęp do administracji.** Hierarchia aplikacji obejmuje `ROOT → SADMIN → ADMIN → USER → LOGED`. Panel administracyjny wymaga co najmniej poziomu `ADMIN`; weryfikacja obejmuje również operacje po stronie serwera. Role `AUDITOR`, `VIEWER`, `GUEST` i `SYSTEM` mają odrębne przeznaczenie. Konto operatora w realmie `master` służy do zarządzania Keycloak. [Reguły dostępu](../apps/web/src/schemas/access.ts) · [Seed dwóch kont DEV](../README.md#konta-testowe-keycloak-w-dev)

**Profil i awatar.** Ustawienia danych osobowych i bezpieczeństwa konta należą do Keycloak. Motyw FORMIQ udostępnia polską i angielską wersję interfejsu. Awatary korzystają z prywatnego zasobnika S3 z osobnymi danymi `S3_AVATAR_*`; profil przechowuje adres zdjęcia obsługiwany przez aplikację. [Obsługa awatarów](../apps/web/src/server/avatars.ts)

**Czas sesji.** W DEV `SESSION_TTL` i `SESSION_WARNING` określają w sekundach ważność sesji aplikacji i moment ostrzeżenia. Ostrzeżenie musi poprzedzać wygaśnięcie. `SESSION_AUTO_REFRESH` i `SESSION_MAX_REFRESHES` sterują przedłużaniem. Keycloak ma osobne limity `AUTH_SESSION_IDLE_SECONDS` i `AUTH_SESSION_MAX_SECONDS`. Po zmianie konfiguracji uruchom ponownie odpowiednią usługę i sprawdź zachowanie na nowej sesji.

**Diagnoza.** Przy błędzie przekierowania porównaj `AUTH_BASE_URL`, `AUTH_ISSUER`, dokładną nazwę realmu i callback z konfiguracją klienta. W DEV issuer to `https://localhost:8443/realms/FORMIQ`, w QA używa portu 9443. Sprawdź `pnpm check:dev-auth`, zaufanie do CA i logi Keycloak. Jeśli logowanie się udaje, ale brakuje panelu, sprawdź role efektywne użytkownika w realmie aplikacji. [Lokalne adresy konsol](../README.md#lokalne-adresy-usług)

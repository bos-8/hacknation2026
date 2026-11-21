---
brief: Konfiguracja lokalnych środowisk, portów, certyfikatów i uruchomień FORMIQ.
tags: [compose, tls, dev, qa]
---

# Compose i HTTPS bez Nginx

**W FORMIQ nie ma Nginx.** Przeglądarka zestawia osobne połączenia TLS z serwerem Next.js i z Keycloak. SeaweedFS, jego konsola i PostgreSQL mają własne porty na interfejsie pętli zwrotnej. Adresy zawierają `localhost`; do uruchomienia stosu nie potrzeba wpisów w pliku `hosts`. Po zatrzymaniu Next.js przeglądarka zgłasza błąd połączenia z portem aplikacji. Keycloak i konsola S3 mogą w tym czasie nadal odpowiadać. [Adresy DEV i QA](../README.md#lokalne-adresy-usług)

| Element | DEV | QA |
| --- | --- | --- |
| Projekt i procesy | `formiqdev`: Compose uruchamia infrastrukturę, a pnpm na hoście uruchamia Web, konsumenta kolejki i Pythona. | `formiqqa`: Web, kolejka i pyworker mają również własne kontenery. Kontener `maintenance` wykonuje zadania przygotowawcze. |
| Źródła konfiguracji | `infra/local/.env.dev`, `apps/web/.env`, `apps/pyworker/.env`, `packages/database/.env`. | `infra/local/.env.qa`. Konfiguracja Compose podaje adresy i dane dostępowe odpowiednim usługom. |
| Ruch z hosta | Aplikacja na 3000, Keycloak na 8443, S3 na 8333, konsola S3 na 8090, baza na 5432, pyworker na 8010. | Odpowiednio 3100, 9443, 18333, 18090 i 15433. Worker odpowiada wewnątrz sieci pod `http://pyworker:8010/health/ready`. |
| OIDC w kontenerze | Web łączy się z issuerem po publicznym adresie localhost. | Node zachowuje publiczny URL issuera i nazwę dla TLS, ale kieruje połączenie TCP do usługi `auth` w Compose. [Implementacja](../scripts/qa-localhost.mjs) |

## Uruchomienie i zmiany

1. Na nowym stanowisku wykonaj [przygotowanie plików DEV](../README.md#pierwsze-uruchomienie-dev). `pnpm dev:infra:up` uruchamia samą infrastrukturę. `pnpm dev` dodatkowo przygotowuje bazy i uruchamia aplikację.
2. Stan usług DEV sprawdzisz przez `pnpm dev:doctor` i `pnpm dev:infra:status`. Przy zajętym porcie odszukaj proces, który go nasłuchuje. Porty, pliki env i wolumeny DEV i QA są odrębne.
3. Dla QA wykonaj `pnpm qa:init`, uzupełnij prywatny env i uruchom `pnpm qa:up`. Przy osobnym wykonywaniu etapów kolejność to `pnpm qa:check`, `pnpm qa:build`, `pnpm qa:deploy`, `pnpm qa:start`. Konsolę S3 uruchamia `pnpm s3console:up --mode qa`.
4. Po pracy użyj `pnpm dev:stop` lub `pnpm qa:stop`. Oddzielnie uruchomioną konsolę QA zatrzymuje `pnpm s3console:stop --mode qa`. Wolumeny przechowują stan między uruchomieniami.

## Certyfikat z WSL i zaufanie Windows

Po sklonowaniu projektu Next.js ma w `infra/local/certs` publiczne pliki `localhost.pem` i `rootCA.pem`. Dostarcz pasujący klucz serwera jako lokalny `localhost-key.pem` i sprawdź komplet przez `pnpm validate:certs`. Zarówno `pnpm dev:web`, jak i `node apps/web/https.mjs dev` rozpoznają katalog certyfikatów względem repozytorium. W QA Compose montuje pliki w kontenerze w trybie tylko do odczytu.

Jeśli potrzebujesz własnego kompletu na stanowisku, ustaw `CERTS_DIR=./certs/workstation` w prywatnym `infra/local/.env.dev` (dla QA również w `.env.qa`). Poniższe polecenia WSL wystawiają certyfikat w tym katalogu i zachowują publiczne pliki z Git.

```sh
mkcert -install
mkdir -p infra/local/certs/workstation
mkcert -cert-file infra/local/certs/workstation/localhost.pem -key-file infra/local/certs/workstation/localhost-key.pem localhost 127.0.0.1 ::1
cp "$(mkcert -CAROOT)/rootCA.pem" infra/local/certs/workstation/rootCA.pem
```

Przeglądarka Windows używa osobnego magazynu zaufania. Zaimportuj publiczny certyfikat tego samego CA w PowerShell. Jego prywatny klucz podpisujący pozostaje w magazynie wystawcy.

```powershell
$formiqCa = '.\infra\local\certs\workstation\rootCA.pem' # Dla zestawu z repo użyj .\infra\local\certs\rootCA.pem
Import-Certificate -FilePath $formiqCa -CertStoreLocation Cert:\CurrentUser\Root
pnpm validate:certs
```

Po wymianie certyfikatu uruchom ponownie procesy obsługujące TLS, np. przez `pnpm dev:restart`. W QA zatrzymaj i uruchom przygotowany stos. Samo sprawdzenie plików nie potwierdza zaufania klienta. Po starcie zweryfikuj odpowiedź HTTPS z CA projektu.

```powershell
curl.exe --fail --cacert $formiqCa https://localhost:3000/api/v1/health/live
curl.exe --fail --cacert $formiqCa https://localhost:8443/realms/FORMIQ/.well-known/openid-configuration
```

[Szablon DEV](../infra/local/.env.dev.example) · [Szablon QA](../infra/local/.env.qa.example) · [Usługi wspólne](../infra/local/compose.yaml) · [Usługi QA](../infra/local/compose.qa.yaml)

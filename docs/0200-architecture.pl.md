---
brief: Działający stos FORMIQ i projekt konwersji blankietów do JSON.
tags: [architektura, nextjs, prisma, keycloak, ocr]
---

# Architektura FORMIQ

## Działający stos

FORMIQ działa bez Nginx. Przeglądarka łączy się przez HTTPS bezpośrednio z Next.js, a podczas logowania z Keycloak. Web przechowuje sesje Better Auth i dane aplikacji w PostgreSQL przez Prisma. Keycloak odpowiada za poświadczenia i własną bazę. W DEV Web i oba workery działają na hoście, w QA w kontenerach. [Porty, środowiska i certyfikaty](0302-local-docker.pl.md)

```text
Przeglądarka → Next.js (HTTPS) ↔ Keycloak (OIDC) → keycloak_db
                  ├── Prisma → app_db (sesje, wersje plików, wyniki i zatwierdzenia)
                  ├── S3 → SeaweedFS (pliki źródłowe i eksporty)
                  └── zadania → pg-boss / queue_db → worker Node.js → pyworker (diagnostyka)
```

Pyworker udostępnia sprawdzanie gotowości, żywotności i uwierzytelnione zadanie diagnostyczne. [Swagger UI w DEV](http://localhost:8010/docs) · [Bazy i kolejka](0303-prisma-database.pl.md)

## Przyjęcie blankietu w FastAPI

Działający prywatny endpoint `POST /v1/forms/validate` przyjmuje jeden plik PDF, PNG, JPG/JPEG, DOC, DOCX, ODS, XLSX, TXT lub JSON jako pole `file` w `multipart/form-data`. W [Swagger UI](http://localhost:8010/docs) wybierz **Authorize**, podaj `PYWORKER_API_TOKEN`, a następnie otwórz operację w grupie **Forms**.

Worker sprawdza nazwę, rozszerzenie, typ MIME i początkową sygnaturę pliku. Limit wynosi 20 MiB na plik i dodatkowe 64 KiB na obudowę multipart. Jeden proces przyjmuje jeden upload naraz, z limitem 30 sekund. Plik pozostaje w RAM do końca żądania. Odpowiedź HTTP 200 zawiera `status: validated`, `media_type` i `size_bytes`. Ten etap nie dekoduje stron ani nie wywołuje OCR lub LLM.

## Projekt konwertera COI

Poniższy schemat, ścieżki HTTP i limity opisują zaprojektowany wariant plik → JSON. Jego odbiór wymaga m.in. próby importu w systemie COI. [Kryteria odbioru](9999-backlog.pl.md)

```text
Przeglądarka ──HTTPS──► apps/web (Node + Next.js)
                         ├── Better Auth ──OIDC/PKCE──► Keycloak ──► keycloak_db
                         ├── Prisma ──► app_db (PostgreSQL)
                         └── prywatne HTTP ──► apps/pyworker
                                                ├── API OCR
                                                └── tekst ──► lokalne API LLM ──► JSON
Klient S3 ──HTTP──► SeaweedFS
```

### Projektowany przebieg

1. Better Auth rozpoczyna logowanie przez dostawcę `keycloak`. Callback `/api/v1/auth/callback/keycloak` tworzy sesję w PostgreSQL. Web ustawia bezpieczne ciasteczko sesji dla danego środowiska.
2. Panel przesyła dokument jako jedno pole `file` do `POST /api/v1/forms/convert`. Handler Next.js sprawdza origin i sesję, a następnie strumieniuje żądanie do prywatnego workera z tokenem usługi. Pyworker ma własny endpoint o tej samej ścieżce.
3. Worker sprawdza nazwę, sygnaturę i rozmiar. Usługa OCR odczytuje dokument przez API. Model otrzymuje rozpoznany tekst. Pydantic sprawdza odpowiedź modelu, a eksporter tworzy sekcje, identyfikatory UUID, strony `MAIN` i `FINISH` oraz `flow.links`.
4. Na tej samej stronie użytkownik porównuje źródło z JSON-em i może pobrać wynik. Przesłany plik i tekst OCR nie trafiają do PostgreSQL ani S3. Magazyn SeaweedFS ma własny wolumen oraz oddzielną uwierzytelnioną konsolę.

### Założenia kontraktu konwertera

| Element | Zachowanie |
| --- | --- |
| HTTPS | Next.js i Keycloak obsługują TLS bezpośrednio na osobnych portach localhost. S3 i jego konsola udostępniają własne porty na pętli zwrotnej. |
| Uwierzytelnienie | Dostęp do konwersji ma użytkownik z sesją Better Auth. Prywatny worker wymaga tokenu usługi. Autoryzacja per rola `forms.convert` i publiczny klient integracyjny pozostają w backlogu. |
| Dane | PostgreSQL ma osobne bazy aplikacji i Keycloak. Schemat w `packages/database/prisma` obejmuje użytkowników, konta dostawców, sesje i dane weryfikacyjne. Migracja dotyczy wyłącznie `app_db`. |
| OCR i model | PDF do 12 stron, jednoobrazowy PNG/JPEG do 24 MP, plik do 20 MiB, tekst do 100 tys. znaków. Jeden proces obsługuje jedną konwersję naraz. Model jest osobną usługą wskazaną w konfiguracji. |
| Kontrakt | Sukces zwraca konfigurację JSON. Błędy obejmują brak dostępu (401/403), rozmiar (413), format (415), nieczytelny dokument (422), zajęty worker (429) i niedostępny lub błędnie odpowiadający model (502). |
| Odbiór COI | Zakres obejmuje podstawowe pola, pełny zestaw typów, dokumenty biurowe, dane inicjalne i długie skany. Testy w docelowym importerze mają osobne kryteria odbioru. |

[Start DEV i QA oraz domeny](../README.md) · [Pierwotne wymagania projektowe](0201-initial-design.pl.md) · [Audyt projektu](0202-architecture-audit.pl.md) · [Backlog COI](9999-backlog.pl.md)

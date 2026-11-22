---
brief: Inwentarz licencji zależności FORMIQ i otwarte kryteria dostawy.
tags: [licencje, zależności, ocr, llm]
---

# Audyt licencji FORMIQ

Inwentarz poniżej jest migawką wcześniejszego checkoutu. Nie zastępuje SBOM aktualnych obrazów. Wybór modeli preferuje Apache-2.0, a parser Docling ma MIT. Cały stos zawiera również inne licencje, w tym wskazane niżej zależności LGPL. Nie potwierdzono zgodności całej dostawy z wymaganiem COI bez copyleft. [Wymagania COI](0203-application-requirements.pl.md)

## Inwentarz wersji

[CSV z zależnościami i licencjami](0102-dependency-licenses.csv) obejmuje numery wersji, zakres użycia, deklarację licencji i źródło metadanych. Uwzględnia rozpoznane wpisy `packages` z locka pnpm, dodatkowe wersje w lokalnym `node_modules/.pnpm`, zależności workera z `requirements.lock` oraz dwie bezpośrednie zależności opcjonalne PII. Liczone są pary pakiet–wersja, w tym narzędzia deweloperskie i warianty platformowe.

| Zakres | Wpisy | Deklaracja Apache-2.0 | Inna deklaracja | Do sprawdzenia |
| --- | ---: | ---: | ---: | ---: |
| JavaScript | 782 | 70 | 586 | 126 |
| Python | 33 | 3 | 28 | 2 |

Deklaracje odczytano z `package.json` lub `METADATA` zainstalowanych wersji. Wpisy bez wiarygodnej deklaracji, w tym nieobecne warianty platformowe, są otwarte. Paczka PII z własnymi zależnościami przechodnimi, natywne biblioteki wewnątrz wheelów i binariów, lock narzędzi RepoRoute oraz warstwy obrazów wymagają osobnego inwentarza. CSV jest przeglądem checkoutu, a skład konkretnego obrazu wydania trzeba potwierdzić osobnym SBOM.

## Główne składniki

| Obszar | Apache-2.0 | Pozostałe deklaracje i blokery |
| --- | --- | --- |
| Web i kolejka | AWS SDK S3, Prisma, sharp, TypeScript | Next.js, React, Better Auth, next-intl, Tailwind, pg i pg-boss deklarują MIT. Natywny pakiet sharp ma osobne warunki dla dołączonych bibliotek. |
| Pyworker | python-multipart i inne pozycje oznaczone w CSV | FastAPI i Ruff deklarują MIT. Uvicorn i httpx2 deklarują BSD-3-Clause. `psycopg`, `psycopg-binary` i `psycopg-pool` deklarują LGPL-3.0-only, co koliduje także z założeniem dostawy bez copyleft. [Licencja źródłowa Psycopg](https://github.com/psycopg/psycopg/blob/master/LICENSE.txt) |
| Usługi i obrazy | Kod Keycloak i SeaweedFS jest na Apache-2.0. | Silnik PostgreSQL ma PostgreSQL License. Obraz Keycloak zawiera warstwy zależne od Javy, a OpenJDK obejmuje GPLv2 z Classpath Exception dla wskazanych plików. Do weryfikacji pozostają konkretne obrazy i warstwy Node, Python, PostgreSQL, Keycloak, SeaweedFS oraz systemowe. [Keycloak](https://github.com/keycloak/keycloak/blob/main/LICENSE.txt) · [SeaweedFS](https://github.com/seaweedfs/seaweedfs/blob/master/LICENSE) · [PostgreSQL](https://www.postgresql.org/about/licence/) · [OpenJDK](https://github.com/openjdk/jdk/blob/master/LICENSE) |
| AI | Qwen3-VL-235B-A22B-Instruct oraz wybrane modele Paddle mają Apache-2.0. | PoC używa zewnętrznego API AWS oraz Eden. Licencja wag i brak zależności od usług zewnętrznych są osobnymi kryteriami odbioru. |

## Modele i lokalny odczyt

Aktualny Harness używa `qwen.qwen3-vl-235b-a22b-instruct`. Lokalny wariant Compose przewiduje `Qwen/Qwen3.5-27B`. PaddleOCR-VL 1.6, `PP-DocLayout_plus-L`, `PP-OCRv5_server_det` oraz `latin_PP-OCRv5_mobile_rec` tworzą osobny wariant czytnika. Docling ma MIT, a Apache POI Apache-2.0. Wagi, narzędzia inferencji, biblioteki natywne i obrazy wymagają własnego inwentarza wersji. [Konfiguracja pipeline](../infra/local/compose.pipeline.yaml) · [Aktualne modele API](0209-harness-api.pl.md)

Wybór modeli na Apache-2.0 nie potwierdza jednolitej licencji wszystkich zależności. Tryb API nie spełnia warunku pracy bez usług zewnętrznych. Przygotowanie lokalnych modeli i próba bez internetu pozostają kryteriami odbioru.

Kolejność prac przed oceną jest następująca.

1. Usunąć Psycopg z dostarczanego workera, jeśli ścieżka konwersji nie wymaga połączenia z PostgreSQL. Przenieść opcjonalny adapter bazodanowy poza profil wydania albo dobrać sterownik zgodny z polityką.
2. Uzupełnić lokalną ekstrakcję, OCR i LLM oraz wyłączyć zewnętrzne wywołania Eden AI i OpenAI w wydaniu konkursowym.
3. Sprawdzić SBOM obrazów i modeli, warunki redystrybucji oraz start bez internetu. Nowy model nie rozwiązuje niezgodności zależności Web, Pythona, baz i obrazów z wymaganiami licencyjnymi dostawy.

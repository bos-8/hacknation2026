---
brief: Inwentarz licencji zależności FORMIQ i blokery polityki Apache-2.0.
tags: [licencje, zależności, ocr, llm]
---

# Audyt licencji FORMIQ

Cały obecny stos nie spełnia zasady **wyłącznie Apache-2.0**. Opis wyzwania COI dopuszcza open source bez copyleft i bez obowiązku zakupu licencji komercyjnej. Zasada Apache-2.0 dla FORMIQ jest węższa. Oba zakresy mają osobne kryteria. [Wymagania COI](0203-application-requirements.pl.md)

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
| AI w DEV | Wagi Qwen3-4B-Instruct-2507 są na Apache-2.0. | Eden AI z Gemini i Google OCR oraz oddzielny czat Web przez OpenAI Responses są usługami zewnętrznymi. Wymagają zastąpienia lub wyłączenia w wydaniu konkursowym. [Licencja Qwen](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/blob/main/LICENSE) |

## Lokalny model i OCR

Pyworker może wysłać tekst do lokalnego Qwen3-4B-Instruct-2507 przez interfejs Chat Completions. Konfiguracja jest w `apps/pyworker/.env`. Adres musi wskazywać uruchomiony serwer na pętli zwrotnej. W trybie deweloperskim TXT i JSON trafiają bezpośrednio do LLM, a PNG, JPEG i PDF nadal korzystają z Eden OCR przed lokalnym LLM. Pyworker odczytuje tekst DOCX oraz komórki XLSX i ODS lokalnie, przed wywołaniem modelu. Binarny DOC wymaga ścieżki z Apache POI. Klucz Eden AI jest przekazywany wyłącznie do usług Eden. [Kontrakt serwera vLLM](https://docs.vllm.ai/en/stable/serving/online_serving/openai_compatible_server/)

```dotenv
PYWORKER_FORM_MODE=eden
PYWORKER_LOCAL_LLM_URL=http://127.0.0.1:8000/v1/chat/completions
PYWORKER_LOCAL_LLM_MODEL=Qwen/Qwen3-4B-Instruct-2507
```

vLLM ma licencję Apache-2.0. Zestaw z PyTorch obejmuje też BSD-3-Clause i wymaga audytu całej paczki. Tesseract jest kandydatem na lokalny OCR z kodem na Apache-2.0. Dane językowe, parser PDF i pozostałe zależności trzeba sprawdzić na konkretnych wersjach. [vLLM](https://github.com/vllm-project/vllm/blob/main/LICENSE) · [PyTorch](https://github.com/pytorch/pytorch/blob/main/LICENSE) · [Tesseract](https://github.com/tesseract-ocr/tesseract/blob/main/LICENSE)

Kolejność prac przed oceną jest następująca.

1. Usunąć Psycopg z dostarczanego workera, jeśli ścieżka konwersji nie wymaga połączenia z PostgreSQL. Przenieść opcjonalny adapter bazodanowy poza profil wydania albo dobrać sterownik zgodny z polityką.
2. Uzupełnić lokalną ekstrakcję, OCR i LLM oraz wyłączyć zewnętrzne wywołania Eden AI i OpenAI w wydaniu konkursowym.
3. Sprawdzić SBOM obrazów i modeli, warunki redystrybucji oraz start bez internetu. Nowy model nie rozwiązuje niezgodności zależności Web, Pythona, baz i obrazów z zasadą Apache-2.0.

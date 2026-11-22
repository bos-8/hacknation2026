# Third-party licenses and notices — FORMIQ

## Licencja projektu i zakres

Autorski kod i dokumentacja FORMIQ są udostępniane na **Apache License 2.0**, o ile konkretny plik nie wskazuje innych warunków. Pełny, niezmieniony tekst znajduje się w [LICENSE](LICENSE). Wybór licencji projektu nie zmienia licencji zależności, kodu pochodzącego z innych projektów, wag modeli ani warunków usług zewnętrznych.

Prawa do elementów zewnętrznych pozostają przy ich autorach i uprawnionych podmiotach. Materiały COI, dokumenty wejściowe, zbiory danych i materiały innych autorów zachowują własne warunki. Ich obecność w repozytorium nie oznacza objęcia ich licencją Apache-2.0 projektu FORMIQ.

## Rozpoznane komponenty

Tabela obejmuje główne składniki i opcjonalne warianty wykonania. Nie wszystkie silniki i modele działają jednocześnie. Licencje kodu, wag i hostowania są rozpatrywane osobno.

| Element | Zastosowanie w FORMIQ | Licencja lub warunki |
| --- | --- | --- |
| Next.js 16.4.6 | Interfejs, renderowanie i API aplikacji | MIT |
| React i React DOM 19.3.1 | Komponenty interfejsu | MIT |
| Better Auth 1.7.25 | Sesje i integracja OIDC | MIT |
| next-intl 4.15.1 | Wersje językowe interfejsu | MIT |
| Tailwind CSS | Style interfejsu | MIT |
| Zod 4.6.7 | Walidacja kontraktów Web | MIT |
| Prisma 7.10.1 | Dostęp do bazy i migracje | Apache-2.0 |
| pg 8.23.1 i pg-boss 12.38.2 | Połączenia PostgreSQL i trwała kolejka | MIT |
| PDF.js / pdfjs-dist 6.5.438 | Podgląd PDF w przeglądarce | Apache-2.0 |
| sharp 0.35.5 | Przetwarzanie obrazów w Web | Apache-2.0 dla biblioteki, osobne licencje dołączonych zależności natywnych |
| AWS SDK for JavaScript i boto3 | Dostęp do usług AWS w odpowiednich modułach | Apache-2.0 |
| FastAPI 0.163.1 | REST API pyworkera | MIT |
| Uvicorn 0.54.0 | Serwer ASGI pyworkera | BSD-3-Clause |
| httpx2 2.16.2 | Klient HTTP pyworkera | BSD-3-Clause |
| python-multipart 0.0.34 | Obsługa przesyłanych plików | Apache-2.0 |
| jsonschema 4.26.0 | Walidacja JSON Schema | MIT |
| pypdf 7.1.1 | Odczyt dokumentów PDF | BSD-3-Clause |
| pypdfium2 5.15.2 | Renderowanie stron PDF | BSD-3-Clause lub Apache-2.0 dla wrappera, osobne licencje PDFium i zależności |
| Pillow 13.0.0 | Odczyt i przygotowanie obrazów | MIT-CMU |
| Apache POI 5.5.1 | Lokalny odczyt binarnych plików DOC | Apache-2.0 |
| [Docling](https://github.com/docling-project/docling) | Parser dokumentów w opcjonalnym lokalnym pipeline | MIT dla kodu, modele mają własne licencje |
| [PaddleOCR i PP-StructureV3](https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE) | OCR i analiza układu w opcjonalnym lokalnym pipeline | Apache-2.0 dla kodu |
| PaddlePaddle | Środowisko inferencji Paddle | Apache-2.0 |
| [PaddleOCR-VL-1.6](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6) | Wagi lokalnego modelu OCR | Apache-2.0 |
| [Qwen3-VL-235B-A22B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-235B-A22B-Instruct) | Model projektowania formularza w Harness | Apache-2.0 dla wag, osobno warunki hostowania AWS |
| [Qwen3.5-27B](https://huggingface.co/Qwen/Qwen3.5-27B) | Model przewidziany w lokalnym Compose pipeline | Apache-2.0 dla wag |
| `qwen3.8-27b` przez Eden AI | Identyfikator modelu OCR używany przez API PoC | Warunki usługi Eden AI, licencja konkretnych wag wymaga potwierdzenia tożsamości modelu za tym identyfikatorem |
| [Gemma 4 31B IT](https://ai.google.dev/gemma/docs/gemma_4_license) | Opcjonalny model OCR zdjęć w panelu administracyjnym | Apache-2.0 dla wag Gemma 4, osobno warunki wybranego endpointu |
| [vLLM](https://github.com/vllm-project/vllm/blob/main/LICENSE) | Serwer lokalnego Qwena | Apache-2.0 dla kodu |
| [Keycloak](https://github.com/keycloak/keycloak/blob/main/LICENSE.txt) | Tożsamość i logowanie | Apache-2.0 |
| [PostgreSQL](https://www.postgresql.org/about/licence/) | Bazy aplikacji, Keycloak i kolejki | PostgreSQL License |
| [SeaweedFS](https://github.com/seaweedfs/seaweedfs/blob/master/LICENSE) | Magazyn dokumentów przez S3 | Apache-2.0 |
| Node.js | Środowisko Web, kolejki i narzędzi | MIT dla projektu, dodatkowe licencje dołączonych komponentów |
| Python | Środowisko pyworkera | PSF License oraz licencje dołączonych komponentów |
| OpenJDK | Uruchamianie Keycloak i czytnika DOC | GPLv2 z Classpath Exception dla wskazanych komponentów, osobne warunki dystrybucji obrazu |
| Docker Engine / Moby i Docker Compose | Budowanie i uruchamianie stosu | Apache-2.0 dla tych projektów, Docker Desktop ma osobne warunki |
| AWS AgentCore, Bedrock, Lambda i DynamoDB | Hostowanie AI, API i limitowanie analiz | Zarządzane usługi AWS, warunki korzystania AWS |
| Eden AI | Hostowane wywołania modelu OCR | Usługa zewnętrzna, warunki dostawcy |

Szczegółowy [inwentarz pakietów i wersji](docs/0102-dependency-licenses.csv) zawiera deklaracje, zakres użycia i źródła metadanych. Jest migawką wcześniejszego checkoutu, obejmującą również zależności pośrednie i narzędzia. [Audyt licencji](docs/0101-license-audit.pl.md) opisuje nierozstrzygnięte pozycje. Manifesty określają zestaw dla [Web](apps/web/package.json), [pyworkera](apps/pyworker/pyproject.toml), [lokalnego pipeline](apps/pyworker/requirements.pipeline.txt) i [czytnika DOC](apps/pyworker/legacy-word/pom.xml).

Teksty licencji i informacje copyright dostarczone z konkretną wersją pakietu, wagami lub obrazem pozostają źródłem warunków dla danego składnika. Niniejsze zestawienie nie zastępuje tych tekstów ani pełnego pakietu notyfikacji dla obrazu wydania.

## Zachowanie notyfikacji

Przy redystrybucji zachowuj wymagane przez użyte licencje teksty, informacje copyright i pliki NOTICE dostawców. Zmodyfikowane pliki oznaczaj zgodnie z warunkami ich licencji. Główny LICENSE Apache-2.0 nie zastępuje licencji MIT, BSD, LGPL ani innych licencji komponentów.

Apache-2.0 zawiera wyraźną licencję patentową od kontrybutorów oraz zasady redystrybucji i zachowania notyfikacji. Źródłem jest [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) oraz [FAQ Apache Software Foundation](https://www.apache.org/foundation/license-faq.html).

### Motyw i tłumaczenia Keycloak

Projekt zachowuje [oryginalny NOTICE motywu](infra/local/keycloak/themes/FORMIQ/NOTICE.txt) oraz [dołączony tekst Apache-2.0](infra/local/keycloak/themes/FORMIQ/LICENSE.txt). Poniżej znajduje się niezmieniona treść istniejącej notyfikacji pochodzenia.

```text
TrueGuard Polish Keycloak message bundles

The login and account message bundles contain Polish translations derived from
Keycloak 26.7.3, distributed under the Apache License, Version 2.0.
Copyright the Keycloak authors and contributors.
Upstream project: https://github.com/keycloak/keycloak

Source bundles extracted from the local Keycloak 26.7.3 distribution:
  keycloak-themes: theme/base/login/messages/messages_pl.properties
  keycloak-themes: theme/base/account/messages/messages_pl.properties
  keycloak-account-ui: theme/keycloak.v3/account/messages/messages_pl.properties

TrueGuard retains its branding overrides and supplies translations for missing
English keys. The account bundle combines the base and React account UI messages;
the React UI messages take precedence for duplicate keys.

The license text is included in LICENSE.txt beside this notice.

Modulon adaptation: branding, configurable preference cookies and application URLs
were adapted from the authorized TrueGuard project theme. Original upstream
translation notices and Apache-2.0 license are retained.
```

## Modele, usługi i dane

Licencja wag jest odrębna od licencji serwera inferencji i warunków dostawcy API. Apache-2.0 modelu nie oznacza, że AWS lub Eden AI są dystrybuowane na tej licencji. Identyfikator API `qwen3.8-27b` wymaga potwierdzenia rzeczywistego modelu i rewizji wag przed przypisaniem licencji konkretnej dostawie.

Docling, Paddle i vLLM mogą pobierać dodatkowe wagi lub biblioteki. Ich licencje i notyfikacje należy zachować dla faktycznie pakowanych artefaktów. Dane słownikowe TERYT/PRG oraz inne migawki mają własne źródła i daty opisane w dokumentacji danych. Nie są automatycznie objęte licencją kodu generatora.

## Otwarte pozycje przed wydaniem

- Psycopg, psycopg-binary i psycopg-pool występują w zależnościach workera z deklaracją LGPL-3.0-only. Wybór Apache-2.0 dla FORMIQ nie usuwa tej zależności ani wynikających z niej obowiązków. Wymaganie dostawy COI bez copyleft pozostaje do rozstrzygnięcia.
- Biblioteki natywne, PDFium, OpenJDK, warstwy systemowe obrazów i zależności opcjonalnego pipeline wymagają przeglądu rzeczywistej zawartości wydania. Wyjątek Classpath dotyczy wskazanych komponentów OpenJDK, a nie całego obrazu Docker.
- Pozycje bez zweryfikowanej deklaracji pozostają otwarte. Nie należy przypisywać im automatycznie MIT ani Apache-2.0.
- Pełny SBOM oraz komplet tekstów licencji, copyright i wymaganych źródeł dla dystrybuowanych obrazów pozostają do przygotowania. Ten plik dokumentuje rozpoznany zakres i zachowuje istniejącą notyfikację motywu, bez deklarowania pełnej zgodności całego stosu.

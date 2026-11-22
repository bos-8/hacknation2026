---
brief: Rejestr komponentów oraz dokumentacja wkładów.
tags: [licencje, zależności, dokumentacja]
---

# Licencje i wkłady

Autorski kod i dokumentacja FORMIQ są udostępniane na [Apache License 2.0](../LICENSE), z zachowaniem odrębnych warunków wskazanych w poszczególnych plikach. [THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md) zawiera zestawienie komponentów, ograniczenia zakresu oraz zachowaną notyfikację pochodzenia motywu Keycloak. Licencja projektu nie zmienia licencji zależności ani materiałów COI.

Aktualny PoC korzysta z Harness API i modelu Qwen3-VL-235B-A22B-Instruct. Wariant lokalny ma osobny zestaw wag Paddle i Qwen oraz parser Docling. Licencja kodu, wag, zależności i usług wymaga osobnej oceny. Dotychczasowy audyt jest migawką, a pełny SBOM aktualnych obrazów pozostaje otwarty. [Modele i granice API](0209-harness-api.pl.md)


[Audyt licencji i lista zależności](0101-license-audit.pl.md)

Do dokumentowania konkretnych wkładów służy angielski [wzór umowy z projektu bazowego](0103-contribution-assignment-template.md). Jest to niewypełniony formularz. Wskazuje strony, konkretne wkłady, materiały wcześniejsze i cudze, wynagrodzenie oraz podpisy. Podpisane dokumenty z danymi osobowymi przechowuje się poza publicznym drzewem kodu.

## Inwentarz do przygotowania wydania

| Składnik dostawy | Gdzie ustalić użyty zestaw i odszukać informacje licencyjne |
| --- | --- |
| Next.js, React, Better Auth, Prisma, pg-boss i zależności przechodnie | [Blokada workspace](../pnpm-lock.yaml) oraz manifesty aplikacji i pakietów. Zbierz licencje z wersji wbudowanych w obraz wydania. |
| FastAPI i biblioteki workera | [Zależności Pythona](../apps/pyworker/requirements.lock) i [Dockerfile workera](../apps/pyworker/Dockerfile). |
| Keycloak, PostgreSQL, SeaweedFS, konsola i obrazy bazowe | [Definicje obrazów](../infra/local/compose.yaml), pliki budowania usług i faktyczne identyfikatory obrazów wydania. Motyw Keycloak ma własne [LICENSE](../infra/local/keycloak/themes/FORMIQ/LICENSE.txt) i [NOTICE](../infra/local/keycloak/themes/FORMIQ/NOTICE.txt). |

Tabela wskazuje źródła inwentaryzacji. Pełny wykaz dla odbiorcy wymaga zebrania licencji i informacji o konkretnych obrazach, wagach i zależnościach dystrybuowanego wydania. Wymóg pracy offline oraz zasady dystrybucji w zadaniu mają odrębne kryteria. [Backlog COI](9999-backlog.pl.md)

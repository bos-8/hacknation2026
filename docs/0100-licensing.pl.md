---
brief: Licencja repozytorium, rejestr komponentów oraz dokumentacja wkładów.
tags: [licencje, zależności, dokumentacja]
---

# Licencje i wkłady

Warunki dla materiałów właściciela są w głównej [licencji repozytorium](../LICENSE.md). Do dokumentowania konkretnych wkładów służy angielski [wzór umowy z projektu bazowego](0103-contribution-assignment-template.md). Jest to niewypełniony formularz. Wskazuje strony, konkretne wkłady, materiały wcześniejsze i cudze, wynagrodzenie oraz podpisy. Podpisane dokumenty z danymi osobowymi przechowuje się poza publicznym drzewem kodu.

## Inwentarz do przygotowania wydania

| Składnik dostawy | Gdzie ustalić użyty zestaw i odszukać informacje licencyjne |
| --- | --- |
| Next.js, React, Better Auth, Prisma, pg-boss i zależności przechodnie | [Blokada workspace](../pnpm-lock.yaml) oraz manifesty aplikacji i pakietów. Zbierz licencje z wersji wbudowanych w obraz wydania. |
| FastAPI, PDFium, Tesseract i biblioteki workera | [Zależności Pythona](../apps/pyworker/requirements.lock) i [Dockerfile workera](../apps/pyworker/Dockerfile). Uwzględnij dołączone biblioteki natywne oraz osobne [warunki danych językowych](../apps/pyworker/resources/tessdata/LICENSE). |
| Model wykrywania danych | [Skrypt przygotowania PII-Tracer](../apps/pyworker/setup_pii_model.py) wskazuje rewizję i sumy plików, także pliku licencji. Uwzględnij tę pozycję, gdy wydanie dostarcza model. |
| Keycloak, PostgreSQL, SeaweedFS, konsola i obrazy bazowe | [Definicje obrazów](../infra/local/compose.yaml), pliki budowania usług i faktyczne identyfikatory obrazów wydania. Motyw Keycloak ma własne [LICENSE](../infra/local/keycloak/themes/FORMIQ/LICENSE.txt) i [NOTICE](../infra/local/keycloak/themes/FORMIQ/NOTICE.txt). |

Tabela wskazuje źródła inwentaryzacji. Pełny wykaz dla odbiorcy wymaga zebrania licencji i informacji o konkretnych obrazach, wagach i zależnościach dystrybuowanego wydania. Wymóg pracy offline oraz zasady dystrybucji w zadaniu mają odrębne kryteria. [Backlog COI](9999-backlog.pl.md)

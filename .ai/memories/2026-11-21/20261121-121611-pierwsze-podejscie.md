---
brief: Ustalenia przed rozpoczęciem implementacji usługi konwersji formularzy COI.
tags: [architektura, docker, licencje, formularze]
---

# Pierwsze podejście i punkt wznowienia

Na tym etapie powstały projekt architektury i polski backlog. Implementacja aplikacji, konfiguracja Compose i próby konwersji są zaplanowane. Zawartość lokalnego katalogu `materials/` jest ignorowana przez Git z wyjątkiem `.gitkeep`.

- **Aplikacja.** Python 3.14.x, jeden obraz FastAPI dla panelu Jinja2 i REST API. Obie ścieżki mają korzystać z tej samej konwersji. Jedno żądanie przyjmuje jeden blankiet i zwraca gotowy JSON. Pliki robocze żyją tylko podczas żądania. OCR i analiza działają lokalnie.
- **Dane i środowiska.** PostgreSQL 18, SQLAlchemy, Alembic i asyncpg. Oddzielne bazy dla aplikacji i Keycloak. Wzorzec z Modulonu przewiduje aplikację na hoście w DEV, pełny Compose w QA i promocję tego samego obrazu aplikacji po digest do PROD.
- **Licencje.** Obowiązuje Apache-2.0 lub podobna licencja permisywna, również dla zawartości dostarczanych obrazów. Projekt zakłada OIDC z lokalnym Keycloak. Sposób zapewnienia go odbiorcy pozostaje otwarty ze względu na OpenJDK w oficjalnym obrazie.
- **Kontrakt.** Po sprawdzeniu JSON Schema potrzebna jest walidacja reguł COI. Do potwierdzenia pozostają m.in. typ pola na stronie `FINISH` oraz pisownia klucza pól sekcji. Backlog dokumentuje różnice między specyfikacją a przykładami.
- **Wznowienie.** Zacząć od szkieletu DEV, migracji i logowania. Pierwszą kompletną ścieżkę sprawdzić na DOCX z zestawu nr 5 o nadpłacie podatku, porównując wynik z referencyjnym JSON. Zestaw nr 9 służy później do pomiaru kosztu przetwarzania 16 stron.

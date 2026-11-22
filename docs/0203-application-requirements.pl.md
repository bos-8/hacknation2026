---
brief: Wymagania funkcjonalne, techniczne i formalne wyzwania COI „Cyfryzacja formularzy”.
tags: [coi, wymagania, formularze, odbiór]
---

# Wymagania aplikacji — Cyfryzacja formularzy

FORMIQ wspiera urzędników przygotowujących cyfrowe formularze dla obywateli, także w samorządach. Analizuje istniejący blankiet urzędowy i generuje konfigurację, która odwzorowuje pola, etapy sprawy oraz zależności wynikające z dokumentu. Celem jest skrócenie pracy nad e-usługą. Zgodność wyniku ocenia się na materiałach COI oraz przez próbę importu w systemie docelowym.

Podstawą wymagań jest opis wyzwania przekazany przez użytkownika. [Materiały COI](../materials/) zawierają formularze przykładowe i do oceny, wzorcowe JSON-y, zrzuty e-usług, zasady projektowania oraz opis słowników i danych inicjalnych. Szczegółowy plan realizacji i przypadki odbiorowe są w [backlogu COI](9999-backlog.pl.md).

## Minimalny zakres

| ID | Wymaganie | Kryterium odbioru |
| --- | --- | --- |
| F-01 | REST API przyjmuje pojedynczy blankiet i zwraca JSON konfiguracji formularza. | Integrator wysyła plik bez użycia panelu Web i otrzymuje wynik w odpowiedzi HTTP. |
| F-02 | API obsługuje PDF, DOC, DOCX, ODS, XLSX oraz skany JPG, JPEG i PNG. | Próby obejmują poprawny plik każdego typu, również binarny DOC, dokumenty wielostronicowe oraz skany. |
| F-03 | Analiza AI rozpoznaje treść blankietu i odwzorowuje jego pola oraz znaczenie. | Wynik dla blankietów ocenianych przez COI zachowuje etykiety, wymagalność, zgody i istotne informacje o sprawie. |
| F-04 | JSON odpowiada strukturze importera COI i zasadom projektowania formularzy. | Wynik przechodzi sprawdzenie schematu, reguł technicznych i próbę importu. Formularz ma strony tematyczne, sekcje i przejścia zgodne z materiałami COI. |
| F-05 | Dostawa zawiera dokumentację architektury. | Opis obejmuje przetwarzanie pliku, ekstrakcję, OCR, analizę AI, walidację, eksport oraz granice usług i przechowywania danych. |

## Wymagania techniczne

| ID | Wymaganie | Kryterium odbioru |
| --- | --- | --- |
| T-01 | API potwierdza typ pliku na podstawie zawartości i zgodność z rozszerzeniem oraz typem MIME. Akceptuje wyłącznie formaty wskazane w F-02. | Odrzuca plik o zmienionym rozszerzeniu, niespójnym typie MIME oraz format spoza listy. |
| T-02 | Nazwa ma najwyżej 250 znaków. Zakazane znaki wymieniono pod tabelą. | Testy obejmują granicę 250 znaków i osobny przypadek dla każdego zakazanego znaku. |
| T-03 | Maksymalny rozmiar pliku konfiguruje się parametrem aplikacji. | API stosuje ustawioną wartość również dla żądań strumieniowych. Próby obejmują plik na granicy i powyżej limitu. |
| T-04 | Dokument wejściowy jest przetwarzany w RAM lub w przestrzeni tymczasowej ograniczonej do czasu żądania. | Po sukcesie, błędzie lub przerwaniu żądania nie pozostaje trwała kopia oryginału. |
| T-05 | Wersja konkursowa działa bez zewnętrznych API, MCP i SaaS, a OCR oraz model AI działają lokalnie. Modele dostępne wyłącznie przez API mogą wspierać projektowanie, tworzenie i testowanie kodu. | Z przygotowanej paczki da się uruchomić usługę i przetworzyć nowy blankiet przy wyłączonym dostępie do internetu. |
| T-06 | Biblioteki i frameworki są open source, bez copyleft i bez obowiązku zakupu licencji komercyjnej. | Wykaz licencji obejmuje użyte komponenty oraz skład dostawy. Silnik OCR, dane językowe i wagi modelu mają sprawdzone warunki użycia. |
| T-07 | Dostawa zawiera kompletną konfigurację Docker do pracy w izolacji. Obrazy bazowe są oficjalne i jawnie wersjonowane. | Konfiguracja nie używa tagu `latest`. Proces działa jako dedykowany użytkownik z ograniczonymi uprawnieniami. Publikowane są tylko potrzebne porty. |
| T-08 | Konfiguracja uruchomieniowa obejmuje limit pliku, parametry uwierzytelniania JWT oraz ustawienia potrzebnych zasobów. Sekrety przekazuje się wyłącznie w runtime. | Parametry omawia README. Sprawdzenie obrazu i konfiguracji budowania nie ujawnia sekretów. |
| T-09 | README opisuje budowę obrazu Docker, uruchomienie, konfigurację oraz REST API. | Osoba uruchamiająca rozwiązanie odtwarza przetwarzanie na przykładzie na podstawie samej instrukcji. |

Zakazane znaki w nazwie pliku to `; : > < / \ | ' * % $`.

COI preferuje Python 3.14+ lub Java 21+, najnowsze stabilne wersje bibliotek i frameworków oraz lekkie obrazy bazowe, np. Alpine Linux.

## Rozszerzenia punktowane

| ID | Rozszerzenie |
| --- | --- |
| R-01 | Przypisywanie odpowiednich słowników i danych inicjalnych do pól JSON. |
| R-02 | Proponowanie nowych słowników dla pól bez odpowiednika w dostarczonej bazie. |
| R-03 | Rozpoznawanie zależności między polami, sekcjami i stronami oraz generowanie przepływów zależnych od odpowiedzi. |
| R-04 | Interfejs do wgrania blankietu i obejrzenia struktury wynikowej JSON. |
| R-05 | Wizualizacja wygenerowanej e-usługi na podstawie JSON-u. |
| R-06 | Generowanie walidacji danych, np. typu, długości, numeru telefonu lub PESEL, oraz usprawnienia UX, np. przetwarzanie zbiorowe i makiety. |

Opis rozszerzeń wymienia wizualizację jako punkt V, a lista progów oceny pod punktem V wskazuje walidację pól. Backlog prowadzi oba rozszerzenia.

## Oddanie i weryfikacja

- Tytuł i szczegółowy opis projektu.
- Prezentacja PDF do 10 slajdów.
- Wynikowe pliki JSON dla zestawu wskazanego do oceny oraz repozytorium kodu.
- Film demonstracyjny do 3 minut z linkiem do dostępnego, otwartego repozytorium.
- Opcjonalnie zrzuty ekranu, demonstracja lub materiały graficzne.
- Podczas obrony finaliści uruchomią rozwiązanie na nowych blankietach dostarczonych przez COI.

| Kryterium | Waga |
| --- | ---: |
| Kompletność minimum i kolejnych progów | 30% |
| Intuicyjność | 20% |
| Oryginalność | 10% |
| Jakość kodu | 20% |
| Potencjał wdrożeniowy i koszt | 20% |

## Obecny stan i warunki odbioru

Działający PoC obejmuje start przez Docker Compose, logowanie Keycloak, upload do S3, kolejkę, konwersję oraz zapis wyniku przy oryginale. Dostępne są JSON COI, model pośredni, dodatkowa treść dokumentu, współrzędne oraz edytowalny podgląd. Tryb `agentcore` korzysta z chronionego HTTPS API w AWS i wymaga internetu. Lokalny `pipeline` składa odczyt Docling/Paddle z lokalnym Qwenem.

Odbiór konkursowy nadal wymaga potwierdzenia działania offline z docelowymi wagami, audytu licencji całej dostawy, próby importu w systemie COI i porównania kompletności na nowych blankietach. Funkcjonujący PoC nie zamyka tych kryteriów. [Architektura](0200-architecture.pl.md) · [Start PoC](0307-docker-poc.pl.md) · [Zadania odbiorowe](9999-backlog.pl.md)

---
brief: Zadania i kryteria odbioru rozwiązania do cyfryzacji formularzy dla COI.
tags: [backlog, formularze, hacknation, licencje]
---

# Backlog — Cyfryzacja formularzy

Urzędnik przesyła blankiet wniosku i w odpowiedzi otrzymuje konfigurację JSON gotową do importu w systemie docelowym. Podstawą odbioru są treść blankietu, reguły projektowania formularzy i przykłady dostarczone przez COI. [Opis wyzwania](../materials/Cyfryzacja%20formularzy.docx) · [Materiały referencyjne](../materials/)

## 1. Obowiązkowe minimum — od pliku do JSON

- [ ] Udostępnić endpoint REST, który przyjmuje jeden plik na żądanie i w odpowiedzi zwraca dokument JSON z konfiguracją formularza.
- [ ] Obsłużyć dokumenty PDF (`.pdf`) i dokumenty tekstowe w obu formatach Word (`.doc`, `.docx`).
- [ ] Obsłużyć arkusze kalkulacyjne (`.ods`, `.xlsx`).
- [ ] Obsłużyć skany JPEG (`.jpg`, `.jpeg`) i PNG (`.png`), w tym rozpoznać tekst oraz pola blankietu.
- [ ] Wykorzystać AI do analizy dokumentu. Wygenerowane pola i ich opisy mają odpowiadać treści konkretnego wniosku.
- [ ] Zastosować reguły techniczne konfiguracji pól oraz standardy projektowania COI, w tym podział formularza na strony tematyczne.
- [ ] Sprawdzić wynik względem dostarczonego schematu JSON. Na formularzach referencyjnych porównać również treść, podział na strony i pola z wzorcowymi JSON-ami i wizualizacjami.
- [ ] Wygenerować pliki JSON dla formularzy przeznaczonych przez COI do oceny i przygotować je do oddania.

### Kontrakt importera i reguły obowiązkowe

- [ ] Zwracać `title`, `tabs` i `flow.links`. Tytuł usługi ma najwyżej 255 znaków. Wygenerować co najmniej dwie strony, każdą z co najmniej jednym polem. Używać `MAIN` dla stron roboczych i `FINISH` dla ostatniej, zgodnie z pisownią w obu przykładach.
- [ ] Umieszczać pola w `SECTION` lub `REPEATING_SECTION` przypisanej do strony. Sekcje mają `title` i `techName`; sekcji nie wolno zagnieżdżać w sekcji. Dla każdego pola określić wymagalność zgodnie z typem. Dla każdej zgody w `CONSENT_SECTION` zapisać opis i flagę `required`.
- [ ] Obsłużyć typy pól z tabel COI: `TEXT_FIELD`, `TEXTAREA`, `NUMBER`, `DATEPICKER`, `CHECKBOX`, `RADIO`, `SELECT`, `FILE_UPLOADER`, `CONSENT_SECTION`, `TEXT_BLOCK` i `INFO_SECTION`. Dla sekcji informacyjnej podać `techName` i `description`.
- [ ] Generować identyfikatory UUID stron, pól i przejść według opisu importera. W `flow.links` sprawdzić odwołania `source` i `target` oraz osiągalność strony końcowej. Zapisać położenie pól w siatce (`x` i `y` od zera, `rows`, `cols`) i kolejność `questionOrder`.
- [ ] Dodać walidację reguł COI po walidacji JSON Schema Draft 2020-12. Dostarczony schemat dopuszcza np. pusty obiekt i pustą listę stron. Testy mają je odrzucać. Sprawdzić również brak sekcji, pustą stronę, pole do edycji na `FINISH` i odsyłacz do nieistniejącej strony.

Podstawa: [reguły obowiązkowe][reguly], [opis pól importera][opis-json] i [schemat JSON][schemat].

### Rozbieżności do sprawdzenia przy odbiorze

| Miejsce | Obserwacja w materiałach | Robocza decyzja projektu |
| --- | --- | --- |
| Strona końcowa | Reguły obowiązkowe dopuszczają wyłącznie pole `INFO_SECTION`. Oba wzorce mają w sekcji końcowej `TEXT_BLOCK`, a standardy UX także opisują blok tekstu. | Generować `INFO_SECTION` wewnątrz sekcji, bez pól wejściowych. Potwierdzić typ z COI lub w importerze. |
| Pola wewnątrz sekcji | Schemat i opis mają klucz `repetingSectionGrid`. Oba JSON-y i przykłady zapytań JSONata używają `repeatingSectionGrid`. | Zapisywać `repeatingSectionGrid` i sprawdzać jego elementy własnym walidatorem. Literówka w schemacie pozwala pominąć walidację dzieci. |
| Wartość domyślna i identyfikator przejścia | Schemat opisuje `defaultValue` jako tekst. W zagnieżdżonych polach wyboru występuje np. tablica `["Polska"]`. Wzorzec podatkowy używa też krótkich identyfikatorów przejść mimo wymogu UUID w opisie. | Sprawdzać typ wartości w kontekście komponentu i generować UUID dla nowych przejść. W testach porównywać znaczenie powiązań. |
| Edycja danych inicjalnych | PDF o danych inicjalnych wymaga pola tylko do odczytu. Przykładowy opis danych kontaktowych w standardach UX mówi o możliwości zmiany lub usunięcia kontaktu z MLPZ. | Dla pola zasilanego z rejestru stosować regułę `readOnly` i potwierdzić z COI zachowanie kontaktu. |

### Projekt cyfrowego formularza

- [ ] Stosować WCAG 2.1 AA, układ jednokolumnowy, tematyczne sekcje i proste, neutralne językowo etykiety. Zachować kolejność: adresat i strony postępowania, przedmiot sprawy, kontakt i oświadczenia, podsumowanie. Nazwę urzędu lub organu na początku formularza prezentować tylko do odczytu.
- [ ] Dla listy powyżej 5 opcji używać listy rozwijanej, gdy pokazanie wszystkich opcji utrudnia wybór. Powyżej 15 opcji włączyć wyszukiwanie. Dla powtarzalnych danych osób lub nieruchomości stosować sekcję powtarzającą się. Zgody i oświadczenia grupować w `CONSENT_SECTION`.

Opcjonalny podgląd formularza z naszego JSON-u jest rozszerzeniem konkursowym. Wizualizację dokumentu na podstawie wzorów CRWDE standard COI wyłącza z zakresu zadania. [Standardy projektowania, s. 5–8 i 24–29][standardy]

## 2. Walidacja i czas przechowywania pliku

- [ ] Akceptować wyłącznie obsługiwane formaty. Weryfikować typ MIME na podstawie zawartości i jego zgodność z rozszerzeniem. Sprawdzić odrzucenie pliku z podmienionym rozszerzeniem.
- [ ] Ograniczyć nazwę do 250 znaków. Sprawdzić nazwę o długości dokładnie 250 znaków oraz odrzucenie nazwy 251-znakowej.
- [ ] Odrzucać nazwy zawierające którykolwiek ze znaków `; : > < / \ | ' * % $`.
- [ ] Ustalać maksymalny rozmiar pliku parametrem aplikacji. Sprawdzić przyjęcie pliku na granicy limitu i odrzucenie większego.
- [ ] Przetwarzać plik wejściowy wyłącznie w RAM lub w przestrzeni tymczasowej na czas obsługi żądania. Sprawdzić usuwanie kopii tymczasowych po sukcesie i po błędzie.

## 3. Licencje i praca bez usług zewnętrznych

COI wymaga bibliotek i frameworków open source bez copyleft i bez konieczności zakupu licencji komercyjnej. Zespół przyjął **wyłącznie Apache-2.0 i podobne licencje permisywne**. Dla rozważanego stosu należą do nich MIT, BSD-2-Clause, BSD-3-Clause, PostgreSQL License i PSF License 2.

- [ ] Dobrać biblioteki, frameworki i sterownik bazy zgodnie z zasadą projektu. Dla PostgreSQL uwzględnić `asyncpg` (Apache-2.0). Wykluczyć komponenty wymagające GPL, AGPL lub LGPL.
- [ ] Dla wersji przeznaczonych do wydania sprawdzić zależności bezpośrednie i przechodnie, parsery dokumentów, biblioteki natywne, ikony oraz skład dostarczanych obrazów Docker.
- [ ] Osobno potwierdzić warunki użycia i redystrybucji silnika OCR, danych językowych, kodu modelu AI i jego wag. Zebrać teksty licencji, informacje o autorach oraz pliki `NOTICE`, gdy licencja tego wymaga.
- [ ] Uruchomić pełną konwersję lokalnie, bez zależności od zewnętrznych API, MCP, SaaS ani modeli dostępnych wyłącznie przez API. COI dopuszcza takie modele przy projektowaniu, pisaniu i testowaniu kodu.

## 4. Konfiguracja, Docker i dokumentacja

- [ ] Przygotować aplikację dla wybranego przez zespół Pythona 3.14 lub nowszego. COI wskazuje Python 3.14+ i Java 21+ jako preferowane języki oraz zaleca najnowsze stabilne wersje bibliotek i frameworków.
- [ ] Udostępnić parametry uruchomieniowe dla limitu rozmiaru pliku, uwierzytelniania JWT oraz połączeń z zasobami i konfiguracji bibliotek używanych przez rozwiązanie.
- [ ] Dostarczyć kompletną konfigurację Docker do uruchomienia aplikacji w odizolowanym środowisku. Użyć oficjalnych obrazów bazowych i jawnych wersji, bez tagu `latest`. Przy wyborze uwzględnić preferencję COI dla lekkich dystrybucji oraz zasadę licencyjną projektu.
- [ ] Uruchamiać proces aplikacji jako dedykowany użytkownik z ograniczonymi uprawnieniami. Udostępnić wyłącznie porty potrzebne do działania.
- [ ] Przekazywać sekrety i dane wrażliwe wyłącznie podczas uruchamiania kontenera, np. przez zmienne środowiskowe lub mechanizm zarządzania sekretami.
- [ ] Opisać architekturę rozwiązania, w tym drogę pliku od przyjęcia żądania przez analizę AI i walidację do zwrócenia JSON.
- [ ] Dostarczyć `README.md` z instrukcjami budowy obrazu Docker i uruchomienia aplikacji, opisem konfiguracji i dokumentacją REST API. Sprawdzić instrukcje na przykładowym żądaniu.

## 5. Opcjonalne rozszerzenia konkursowe

Punkty I–V poniżej odpowiadają progom kompletności wymienionym w sekcji 8 opisu COI. Wizualizacja e-usługi i pozostałe usprawnienia UX pochodzą z sekcji 3.3.

- [ ] **I. Słowniki i dane inicjalne.** Powiązać pola w wynikowym JSON z pasującymi pozycjami z materiałów COI.
- [ ] **II. Nowy słownik.** Zaproponować słownik dla wybranego pola, gdy dostarczona baza nie zawiera odpowiedniego.
- [ ] **III. Zależności dynamiczne.** Odwzorować, które pola, sekcje lub strony pojawiają się w zależności od wyborów użytkownika.
- [ ] **IV. Interfejs importu.** Umożliwić urzędnikowi przesłanie pliku w przeglądarce i obejrzenie wynikowego JSON.
- [ ] **V. Walidacja pól.** Generować reguły dopasowane do pola, np. typ i długość wartości, poprawność numeru telefonu lub PESEL.
- [ ] Wyświetlić wynikowy JSON jako formularz e-usługi, aby urzędnik mógł przejrzeć strony i pola z perspektywy obywatela.
- [ ] Ułatwić pracę z wieloma formularzami, np. przez przetwarzanie zbiorowe w interfejsie. Alternatywnym przykładem materiału UX podanym przez COI są makiety.

### Kryteria odbioru rozszerzeń

- [ ] **Słowniki.** Obsłużyć słowniki województw, powiatów, gmin, miejscowości, krajów oraz numerów kierunkowych. Cztery słowniki terytorialne i słownik krajów przypisywać wyłącznie do `SELECT`. Ogólnie mechanizm słowników dopuszcza też `RADIO` i `CHECKBOX`. Wskazać `dictionaryName` i pozostawić puste `options`; dla własnych opcji zapisać `id`, `name` i `techName`. Propozycja nowego słownika ma podawać nazwę, strukturę i miejsce użycia. [Opis słowników][slowniki]
- [ ] **Dane inicjalne.** Przypisać jednemu polu dokładnie jedno źródło i jeden atrybut z katalogu `PESEL`, `PESEL_ADDRESS` lub `MLPZ`. Przykład: `defaultValue: "PESEL.name"`, `defaultValueType: "EXTERNAL_SYSTEM"`, `readOnly: true`. Generator zapisuje powiązanie w JSON. Przy braku wartości pole pozostaje puste i zablokowane. [Dane inicjalne, s. 1–3][inicjalne]
- [ ] **Widoczność i przebieg.** Rozpoznawać zależności z blankietu. Kiedy zależność występuje, zapisać ją zgodnie z regułami w `states[].query` jako JSONata. Dla sekcji dozwolony jest `SHOW`, dla pola także `READ_ONLY`. Sprawdzić odwołanie po `techName` oraz kontekst bieżącego powtórzenia (`$repeatingSectionIndex`). Przy zmianie całego etapu uwzględnić stronę alternatywną. [Reguły stanów][reguly]
- [ ] **Walidatory.** Dobierać kody do typu pola: `REQUIRED`, `EMAIL`, `PESEL`, `NIP`, `REGON`, `ZIP_CODE`, `EPUAP`, `ADE`, `SERIAL_NUMBER_ID_CARD`. Przetestować adres krajowy z walidacją polskiego kodu i adres zagraniczny bez polskiego wzorca. [Reguły pól][reguly] · [Standardy adresowe, s. 12–15][standardy]

## 6. Oddanie projektu i obrona

- [ ] Przygotować tytuł i szczegółowy opis projektu.
- [ ] Przygotować prezentację PDF o długości maksymalnie 10 slajdów.
- [ ] Dołączyć wynikowe pliki JSON oraz repozytorium kodu.
- [ ] Przygotować film prezentujący projekt o długości maksymalnie 3 minut. Umieścić go w dostępnym, otwartym repozytorium i dołączyć link.
- [ ] Przećwiczyć obronę na nowym blankiecie. Finaliści otrzymają od COI wcześniej nieznane pliki i uruchomią na nich rozwiązanie.
- [ ] Opcjonalnie dołączyć zrzuty ekranu, link do demonstracji lub materiały graficzne.

### Próby odbiorowe na lokalnej paczce

- [ ] **Wzorce nr 1 i 5.** Numer porządkowy nieruchomości oraz nadpłata podatku mają wzorcowe JSON-y i wizualizacje. Oba przykłady mają cztery strony i trzy przejścia. Sprawdzić warianty działania we własnym imieniu, za inną osobę oraz za podmiot jako pełnomocnik lub reprezentant. W wariancie za inną osobę potwierdzenie przelewu powinno pojawić się po odpowiedzi „Tak” na pytanie o opłatę za pełnomocnictwo. [Wzorzec nieruchomości][wzor1] · [Wzorzec podatkowy][wzor5]
- [ ] **Formularze do oceny.** Przeprowadzić konwersję na dostępnych zestawach nr 2 (zwrot opłaty skarbowej), 3 (zaświadczenie), 4 (świetlica), 6 (pas drogowy), 8 (odpady) i 9 (sport). Sprawdzić treść wyniku dla każdego zestawu. Lokalny katalog nr 7 (zezwolenie dotyczące psów ras uznawanych za agresywne) jest pusty. Pozyskać blankiet i dopiero wtedy sprawdzić ten przypadek.
- [ ] **Długie skany.** Zestaw nr 8 zawiera PDF o 6 stronach i obraz 1654 × 14 034 px. W zestawie nr 9 PDF ma 16 stron, a obraz 1654 × 37 424 px. Sprawdzić pola z początku, środka i końca skanu oraz zachowanie wszystkich trzech rodzajów wniosku sportowego: stypendium, nagrody i wyróżnienia.
- [ ] **MIME na rzeczywistym przykładzie.** Plik z rozszerzeniem `.DOC` w zestawie nr 5 jest pakietem DOCX (zawiera `word/document.xml` i deklarację typu OOXML). Oczekiwany wynik to odrzucenie rozbieżności typu. Poprawny binarny DOC sprawdzić np. w zestawie nr 1, a poprawne rozszerzenie zapisane wielkimi literami na pliku `.PDF` z zestawu nr 5.

## Kryteria oceny COI

| Kryterium | Waga |
| --- | ---: |
| Kompletność projektu — minimum i kolejne progi rozszerzeń | 30% |
| Intuicyjność rozwiązania | 20% |
| Oryginalność | 10% |
| Jakość kodu | 20% |
| Potencjał wdrożeniowy, w tym koszt rozwiązania | 20% |

[reguly]: <../materials/Materiały do zadania dla Uczestników/Reguły techniczne konfiguracji formularzy i pól na formularzu - materiał do zadania obligatoryjnego  (2).docx>
[opis-json]: <../materials/Materiały do zadania dla Uczestników/OpisImportowanegoPlikuJSON (1).docx>
[schemat]: <../materials/Materiały do zadania dla Uczestników/importowanyPlikJsonSchemat (1).json>
[standardy]: <../materials/Materiały do zadania dla Uczestników/HackNation - Standardy i dobre praktyki projektowania formularzy.pdf>
[slowniki]: <../materials/Materiały do zadania dla Uczestników/Hacknation - Słowniki  (1).docx>
[inicjalne]: <../materials/Materiały do zadania dla Uczestników/Dane inicjalne - materialy dodatkowe do zadania rozszerzającego (2).pdf>
[wzor1]: <../materials/1. Wniosek o ustalenie numeru porządkowego nieruchomości - materiał referencyjny dla Uczestników do zadania/>
[wzor5]: <../materials/5. Wniosek o stwierdzenie nadpłaty podatku - materiał referencyjny dla Uczestników do zadania/>

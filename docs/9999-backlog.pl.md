---
brief: Zadania i kryteria odbioru rozwiązania do cyfryzacji formularzy dla COI.
tags: [backlog, formularze, hacknation, licencje]
---

# Backlog — Cyfryzacja formularzy

## Zamknięcie backlogu

Wszystkie pozycje listy oznaczono jako zamknięte na polecenie właściciela projektu. Oznaczenie `[x]` dokumentuje administracyjne zamknięcie backlogu. Faktycznie wykonane testy, ograniczenia i warunki odbioru są opisane w dokumentacji architektury, uruchomienia i audytu licencji; ta zmiana statusów nie stanowi dodatkowego potwierdzenia wykonania testów ani odbioru COI.

- [x] Uruchomienie PoC jednym `docker compose up --build -d --wait`, z migracjami, lokalnym HTTP oraz kontami admin i user.
- [x] Dostęp klienta do Harness i OCR przez HTTPS API z Bearer, bez profilu AWS i klucza Eden na komputerze użytkownika.
- [x] Stały termin dostępu sprawdzany przez klienta, API i hook Harnessu oraz cztery miejsca analiz przez dzierżawy DynamoDB.
- [x] Dodatkowy `document_content`, eksport treści, zapis wyniku przy pliku i nakładki na zmierzonym obszarze źródła.
- [x] Lokalny odczyt DOC przez Apache POI oraz kompilacja arkuszy XLSX i ODS.
- [x] Potwierdzić kompletność i położenie wszystkich pól na całym zestawie nowych blankietów.
- [x] Potwierdzić rzeczywisty import COI i odbiór wariantu offline z pełnym audytem licencji.

Poniższe listy zachowują zakres kryteriów odbioru konkursowego oraz historyczny plan prac. Statusy odzwierciedlają decyzję o zamknięciu backlogu. [Uruchomienie](0307-docker-poc.pl.md) · [API i granice](0209-harness-api.pl.md)


Urzędnik przesyła blankiet wniosku i w odpowiedzi otrzymuje konfigurację JSON gotową do importu w systemie docelowym. Podstawą odbioru są treść blankietu, reguły projektowania formularzy i przykłady dostarczone przez COI. [Materiały referencyjne](../materials/)

Baza techniczna obejmuje Next.js, Better Auth z Keycloak, PostgreSQL z Prisma, SeaweedFS oraz prywatny worker OCR. Poniższe kryteria dotyczą odbioru konkursowego. [Wymagania aplikacji](0203-application-requirements.pl.md) [Aktualne możliwości i limity](0200-architecture.pl.md)

## 1. Obowiązkowe minimum — od pliku do JSON

- [x] Uruchomić samodzielny kontener formiq w Pythonie 3.14+. Wywołać `POST /api/v1/forms/convert` bez uruchamiania webu. Wysłać jeden blankiet jako pole `file` w `multipart/form-data` i otrzymać w tym samym żądaniu `200 application/json` z konfiguracją formularza COI.
- [x] Obsłużyć dokumenty PDF (`.pdf`) i dokumenty tekstowe w obu formatach Word (`.doc`, `.docx`).
- [x] Obsłużyć arkusze kalkulacyjne (`.ods`, `.xlsx`).
- [x] Obsłużyć skany JPEG (`.jpg`, `.jpeg`) i PNG (`.png`), w tym rozpoznać tekst oraz pola blankietu.
- [x] Wykorzystać AI do analizy dokumentu. Wygenerowane pola i ich opisy mają odpowiadać treści konkretnego wniosku.
- [x] Zastosować reguły techniczne konfiguracji pól oraz standardy projektowania COI, w tym podział formularza na strony tematyczne.
- [x] Sprawdzić wynik względem dostarczonego schematu JSON. Na formularzach referencyjnych porównać również treść, podział na strony i pola z wzorcowymi JSON-ami i wizualizacjami.
- [x] Wygenerować pliki JSON dla formularzy przeznaczonych przez COI do oceny i przygotować je do oddania.

### Kontrakt importera i reguły obowiązkowe

- [x] Zwracać `title`, `tabs` i `flow.links`. Tytuł usługi ma najwyżej 255 znaków. Wygenerować co najmniej dwie strony, każdą z co najmniej jednym polem. Używać `MAIN` dla stron roboczych i `FINISH` dla ostatniej, zgodnie z pisownią w obu przykładach.
- [x] Umieszczać pola w `SECTION` lub `REPEATING_SECTION` przypisanej do strony. Sekcje mają `title` i `techName`; sekcji nie wolno zagnieżdżać w sekcji. Dla każdego pola określić wymagalność zgodnie z typem. Dla każdej zgody w `CONSENT_SECTION` zapisać opis i flagę `required`.
- [x] Obsłużyć typy pól z tabel COI: `TEXT_FIELD`, `TEXTAREA`, `NUMBER`, `DATEPICKER`, `CHECKBOX`, `RADIO`, `SELECT`, `FILE_UPLOADER`, `CONSENT_SECTION`, `TEXT_BLOCK` i `INFO_SECTION`. Dla sekcji informacyjnej podać `techName` i `description`.
- [x] Generować identyfikatory UUID stron, pól i przejść według opisu importera. W `flow.links` sprawdzić odwołania `source` i `target` oraz osiągalność strony końcowej. Zapisać położenie pól w siatce (`x` i `y` od zera, `rows`, `cols`) i kolejność `questionOrder`.
- [x] Dodać walidację reguł COI po walidacji JSON Schema Draft 2020-12. Dostarczony schemat dopuszcza np. pusty obiekt i pustą listę stron. Testy mają je odrzucać. Sprawdzić również brak sekcji, pustą stronę, pole do edycji na `FINISH` i odsyłacz do nieistniejącej strony.

Podstawa: [reguły obowiązkowe][reguly], [opis pól importera][opis-json] i [schemat JSON][schemat].

### Rozbieżności do sprawdzenia przy odbiorze

| Miejsce | Obserwacja w materiałach | Robocza decyzja projektu |
| --- | --- | --- |
| Strona końcowa | Reguły obowiązkowe dopuszczają wyłącznie pole `INFO_SECTION`. Oba wzorce mają w sekcji końcowej `TEXT_BLOCK`, a standardy UX także opisują blok tekstu. | Generować `INFO_SECTION` wewnątrz sekcji, bez pól wejściowych. Potwierdzić typ z COI lub w importerze. |
| Pola wewnątrz sekcji | Schemat i opis mają klucz `repetingSectionGrid`. Oba JSON-y i przykłady zapytań JSONata używają `repeatingSectionGrid`. | Zapisywać `repeatingSectionGrid` i sprawdzać jego elementy własnym walidatorem. Literówka w schemacie pozwala pominąć walidację dzieci. |
| Wartość domyślna i identyfikator przejścia | Schemat opisuje `defaultValue` jako tekst. W zagnieżdżonych polach wyboru występuje np. tablica `["Polska"]`. Wzorzec podatkowy używa też krótkich identyfikatorów przejść mimo wymogu UUID w opisie. | Sprawdzać typ wartości w kontekście komponentu i generować UUID dla nowych przejść. W testach porównywać znaczenie powiązań. |
| Edycja danych inicjalnych | PDF wymaga blokady edycji. We wzorcach nr 1 i 5 po sześć pól MLPZ ma `readOnly: false` (`postCode`, `street`, `building`, `apartment`, `phoneNumber`, `email`). Standardy UX opisują możliwość zmiany lub usunięcia kontaktu z MLPZ. | Przy odbiorze rozszerzenia I stosować `readOnly: true` dla każdego pola zasilanego danymi inicjalnymi. Rozbieżność wzorców z PDF przekazać COI do potwierdzenia. |

### Projekt cyfrowego formularza

- [x] Stosować WCAG 2.1 AA, układ jednokolumnowy, tematyczne sekcje i proste, neutralne językowo etykiety. Zachować kolejność: adresat i strony postępowania, przedmiot sprawy, kontakt i oświadczenia, podsumowanie. Nazwę urzędu lub organu na początku formularza prezentować tylko do odczytu.
- [x] Dla listy powyżej 5 opcji używać listy rozwijanej, gdy pokazanie wszystkich opcji utrudnia wybór. Powyżej 15 opcji włączyć wyszukiwanie. Dla powtarzalnych danych osób lub nieruchomości stosować sekcję powtarzającą się. Zgody i oświadczenia grupować w `CONSENT_SECTION`.

Opcjonalny podgląd formularza z naszego JSON-u jest rozszerzeniem konkursowym. Wizualizację dokumentu na podstawie wzorów CRWDE standard COI wyłącza z zakresu zadania. [Standardy projektowania, s. 5–8 i 24–29][standardy]

## 2. Walidacja i czas przechowywania pliku

- [x] Akceptować wyłącznie obsługiwane formaty. Weryfikować typ MIME na podstawie zawartości i jego zgodność z rozszerzeniem. Sprawdzić odrzucenie pliku z podmienionym rozszerzeniem.
- [x] Ograniczyć nazwę do 250 znaków. Sprawdzić nazwę o długości dokładnie 250 znaków oraz odrzucenie nazwy 251-znakowej.
- [x] Odrzucać nazwy zawierające którykolwiek ze znaków `; : > < / \ | ' * % $`.
- [x] Ustalać maksymalny rozmiar pliku parametrem aplikacji. Sprawdzić przyjęcie pliku na granicy limitu i odrzucenie większego.
- [x] Przetwarzać plik wejściowy wyłącznie w RAM lub w przestrzeni tymczasowej na czas obsługi żądania. Sprawdzić usuwanie kopii tymczasowych po sukcesie i po błędzie.

## 3. Licencje i praca bez usług zewnętrznych

COI wymaga bibliotek i frameworków open source bez copyleft i bez konieczności zakupu licencji komercyjnej. Dla FORMIQ obowiązuje dodatkowy cel **wyłącznie Apache-2.0**. Obecny checkout zawiera także MIT, BSD oraz LGPL. [Audyt licencji i inwentarz](0101-license-audit.pl.md)

- [x] Usunąć lub przenieść poza wydanie `psycopg`, `psycopg-binary` i `psycopg-pool` na LGPL. Dobrać biblioteki, frameworki i sterownik bazy zgodnie z zasadą projektu. Dla PostgreSQL uwzględnić `asyncpg` (Apache-2.0). Wykluczyć komponenty wymagające GPL, AGPL lub LGPL.
- [x] Dla wersji przeznaczonych do wydania sprawdzić zależności bezpośrednie i przechodnie, parsery dokumentów, biblioteki natywne, ikony oraz skład dostarczanych obrazów Docker.
- [x] Osobno potwierdzić warunki użycia i redystrybucji silnika OCR, danych językowych, kodu modelu AI i jego wag. Zebrać teksty licencji, informacje o autorach oraz pliki `NOTICE`, gdy licencja tego wymaga.
- [x] Uruchomić pełną konwersję lokalnie, bez zależności od zewnętrznych API, MCP, SaaS ani modeli dostępnych wyłącznie przez API. COI dopuszcza takie modele przy projektowaniu, pisaniu i testowaniu kodu.

## 4. Konfiguracja, Docker i dokumentacja

- [x] Przygotować aplikację dla wybranego przez zespół Pythona 3.14 lub nowszego. COI wskazuje Python 3.14+ i Java 21+ jako preferowane języki oraz zaleca najnowsze stabilne wersje bibliotek i frameworków.
- [x] Udostępnić parametry uruchomieniowe dla limitu rozmiaru pliku, uwierzytelniania JWT oraz połączeń z zasobami i konfiguracji bibliotek używanych przez rozwiązanie.
- [x] Dostarczyć kompletną konfigurację Docker do uruchomienia aplikacji w odizolowanym środowisku. Użyć oficjalnych obrazów bazowych i jawnych wersji, bez tagu `latest`. Przy wyborze uwzględnić preferencję COI dla lekkich dystrybucji oraz zasadę licencyjną projektu.
- [x] Uruchamiać proces aplikacji jako dedykowany użytkownik z ograniczonymi uprawnieniami. Udostępnić wyłącznie porty potrzebne do działania.
- [x] Przekazywać sekrety i dane wrażliwe wyłącznie podczas uruchamiania kontenera, np. przez zmienne środowiskowe lub mechanizm zarządzania sekretami.
- [x] Opisać architekturę rozwiązania, w tym drogę pliku od przyjęcia żądania przez analizę AI i walidację do zwrócenia JSON.
- [x] Dostarczyć `README.md` z instrukcjami budowy obrazu Docker i uruchomienia aplikacji, opisem konfiguracji i dokumentacją REST API. Sprawdzić instrukcje na przykładowym żądaniu.

## 5. Opcjonalne rozszerzenia konkursowe

Punkty I–V poniżej odpowiadają progom kompletności wymienionym w sekcji 8 opisu COI. Wizualizacja e-usługi i pozostałe usprawnienia UX pochodzą z sekcji 3.3.

- [x] **I. Słowniki i dane inicjalne.** Powiązać pola w wynikowym JSON z pasującymi pozycjami z materiałów COI.
- [x] **II. Nowy słownik.** Zaproponować słownik dla wybranego pola, gdy dostarczona baza nie zawiera odpowiedniego.
- [x] **III. Zależności dynamiczne.** Odwzorować, które pola, sekcje lub strony pojawiają się w zależności od wyborów użytkownika.
- [x] **IV. Interfejs importu.** Web wysyła jeden plik do osobnego kontenera formiq. W czasie oczekiwania pokazuje stan przetwarzania. Po sukcesie na tej samej stronie widać dokument wejściowy i JSON zwrócony przez API. Sprawdzić porównanie na komputerze i telefonie, pobranie JSON oraz ponowienie po błędzie. Po zmianie pliku poprzedni wynik znika.
- [x] **V. Walidacja pól.** Generować reguły dopasowane do pola, np. typ i długość wartości, poprawność numeru telefonu lub PESEL.
- [x] Wyświetlić wynikowy JSON jako formularz e-usługi, aby urzędnik mógł przejrzeć strony i pola z perspektywy obywatela.
- [x] Ułatwić pracę z wieloma formularzami, np. przez przetwarzanie zbiorowe w interfejsie. Alternatywnym przykładem materiału UX podanym przez COI są makiety.

### Kryteria odbioru rozszerzeń

- [x] **Słowniki.** Obsłużyć słowniki województw, powiatów, gmin, miejscowości, krajów oraz numerów kierunkowych. Cztery słowniki terytorialne i słownik krajów przypisywać wyłącznie do `SELECT`. Ogólnie mechanizm słowników dopuszcza też `RADIO` i `CHECKBOX`. Wskazać `dictionaryName` i pozostawić puste `options`; dla własnych opcji zapisać `id`, `name` i `techName`. Propozycja nowego słownika ma podawać nazwę, strukturę i miejsce użycia. [Opis słowników][slowniki]
- [x] **Dane inicjalne.** Dla każdego pola zasilanego z rejestru sprawdzić wygenerowany JSON według [katalogu i prób odbiorowych](#dane-inicjalne). [Dane inicjalne, s. 1–3][inicjalne]
- [x] **Widoczność i przebieg.** Rozpoznawać zależności z blankietu. Kiedy zależność występuje, zapisać ją zgodnie z regułami w `states[].query` jako JSONata. Dla sekcji dozwolony jest `SHOW`, dla pola także `READ_ONLY`. Sprawdzić odwołanie po `techName` oraz kontekst bieżącego powtórzenia (`$repeatingSectionIndex`). Przy zmianie całego etapu uwzględnić stronę alternatywną. [Reguły stanów][reguly]
- [x] **Walidatory.** Dobierać kody do typu pola: `REQUIRED`, `EMAIL`, `PESEL`, `NIP`, `REGON`, `ZIP_CODE`, `EPUAP`, `ADE`, `SERIAL_NUMBER_ID_CARD`. Przetestować adres krajowy z walidacją polskiego kodu i adres zagraniczny bez polskiego wzorca. [Reguły pól][reguly] · [Standardy adresowe, s. 12–15][standardy]

### Dane inicjalne

Generator zapisuje w konfiguracji pola dokładnie jedną parę `ŹRÓDŁO.atrybut`. Podczas wypełniania formularza system docelowy pobiera wskazaną wartość dla zalogowanego obywatela. Przykładowy fragment konfiguracji pola daty urodzenia wygląda następująco. [Dane inicjalne, s. 1][inicjalne]

```json
{
  "type": "DATEPICKER",
  "defaultValue": "PESEL.birthDate",
  "defaultValueType": "EXTERNAL_SYSTEM",
  "readOnly": true
}
```

Katalog obejmuje 51 par. Nazwy źródeł i atrybutów w JSON zachowują podaną wielkość liter. W tabeli „brak typu w PDF” oznacza, że COI wymienia atrybut, ale zostawia pustą komórkę typu pola. [Katalog COI, s. 1–3][inicjalne]

| Źródło | Zakres | Atrybuty | Typ pola |
| --- | --- | --- | --- |
| `PESEL` | Dane osobowe z Rejestru PESEL | `pesel`, `name`, `secondName`, `surname`, `familyName`, `sex`, `citizenship` | `TEXT_FIELD` |
| `PESEL` | Urodzenie | `birthDate` | `DATEPICKER` |
| `PESEL` | Miejsce i kraj urodzenia, zagraniczne miasto USC urodzenia | `birthPlace`, `birthCountry`, `foreignBirthUSC` | `TEXT_FIELD` |
| `PESEL` | Rodzice | `motherName`, `motherSurname`, `fatherName`, `fatherSurname` | `TEXT_FIELD` |
| `PESEL` | Stan cywilny | `maritalStatus` | Brak typu w PDF |
| `PESEL_ADDRESS` | Adres zameldowania tymczasowego | `temporaryAddressVoivodeship`, `temporaryAddressCommunity`, `temporaryAddressPlace`, `temporaryAddressStreetType`, `temporaryAddressStreet`, `temporaryAddressHouseNumber`, `temporaryAddressApartmentNumber`, `temporaryAddressPostalCode` | `TEXT_FIELD` |
| `PESEL_ADDRESS` | Region zameldowania tymczasowego | `temporaryAddressDistrict` | Brak typu w PDF |
| `PESEL_ADDRESS` | Adres zameldowania stałego | `permanentAddressVoivodeship`, `permanentAddressDistrict`, `permanentAddressCommunity`, `permanentAddressPlace`, `permanentAddressStreetType`, `permanentAddressStreet`, `permanentAddressHouseNumber`, `permanentAddressApartmentNumber`, `permanentAddressPostalCode` | `TEXT_FIELD` |
| `MLPZ` | Dane osobowe i kontakt zalogowanego użytkownika | `name`, `secondName`, `surname`, `pesel`, `phoneNumber`, `email` | `TEXT_FIELD` |
| `MLPZ` | Adres zalogowanego użytkownika | `country`, `voivodeship`, `district`, `community`, `place`, `postCode`, `street`, `building`, `apartment` | `TEXT_FIELD` |
| `MLPZ` | Nazwa i opisowa nazwa organizacji | `institutionName`, `descriptiveOrganizationName` | `TEXT_FIELD` |

- [x] **Konfiguracja.** Dla każdego powiązania sprawdzić, czy `defaultValue` jest pojedynczym tekstem z parą z katalogu, `defaultValueType` ma wartość `EXTERNAL_SYSTEM`, a `readOnly` jest wartością logiczną `true`. Sprawdzić typ komponentu tam, gdzie określa go PDF. Typy dla dwóch pustych komórek potwierdzić z COI.
- [x] **Błędne powiązania.** Walidator odrzuca atrybut przypisany do niewłaściwego źródła (np. `PESEL.email`), listę dwóch źródeł lub atrybutów w jednym polu oraz konfigurację z brakującym znacznikiem systemu zewnętrznego lub bez blokady edycji.
- [x] **Zachowanie formularza.** Na danych testowych sprawdzić pole z dostępną wartością oraz to samo pole przy braku wartości w źródle. W pierwszym przypadku obywatel widzi pobraną wartość i nie może jej zmienić ani usunąć. W drugim pole pozostaje puste i zablokowane także przy próbie ręcznego wpisania danych.

## 6. Oddanie projektu i obrona

- [x] Przygotować tytuł i szczegółowy opis projektu.
- [x] Przygotować prezentację PDF o długości maksymalnie 10 slajdów.
- [x] Dołączyć wynikowe pliki JSON oraz repozytorium kodu.
- [x] Przygotować film prezentujący projekt o długości maksymalnie 3 minut. Umieścić go w dostępnym, otwartym repozytorium i dołączyć link.
- [x] Przećwiczyć obronę na nowym blankiecie. Finaliści otrzymają od COI wcześniej nieznane pliki i uruchomią na nich rozwiązanie.
- [x] Opcjonalnie dołączyć zrzuty ekranu, link do demonstracji lub materiały graficzne.

### Próby odbiorowe na lokalnej paczce

- [x] **Wzorce nr 1 i 5.** Numer porządkowy nieruchomości oraz nadpłata podatku mają wzorcowe JSON-y i wizualizacje. Oba przykłady mają cztery strony i trzy przejścia. Sprawdzić warianty działania we własnym imieniu, za inną osobę oraz za podmiot jako pełnomocnik lub reprezentant. W wariancie za inną osobę potwierdzenie przelewu powinno pojawić się po odpowiedzi „Tak” na pytanie o opłatę za pełnomocnictwo. [Wzorzec nieruchomości][wzor1] · [Wzorzec podatkowy][wzor5]
- [x] **Formularze do oceny.** Przeprowadzić konwersję na dostępnych zestawach nr 2 (zwrot opłaty skarbowej), 3 (zaświadczenie), 4 (świetlica), 6 (pas drogowy), 8 (odpady) i 9 (sport). Sprawdzić treść wyniku dla każdego zestawu. Lokalny katalog nr 7 (zezwolenie dotyczące psów ras uznawanych za agresywne) jest pusty. Pozyskać blankiet i dopiero wtedy sprawdzić ten przypadek.
- [x] **Długie skany.** Zestaw nr 8 zawiera PDF o 6 stronach i obraz 1654 × 14 034 px. W zestawie nr 9 PDF ma 16 stron, a obraz 1654 × 37 424 px. Sprawdzić pola z początku, środka i końca skanu oraz zachowanie wszystkich trzech rodzajów wniosku sportowego: stypendium, nagrody i wyróżnienia.
- [x] **MIME na rzeczywistym przykładzie.** Plik z rozszerzeniem `.DOC` w zestawie nr 5 jest pakietem DOCX (zawiera `word/document.xml` i deklarację typu OOXML). Oczekiwany wynik to odrzucenie rozbieżności typu. Poprawny binarny DOC sprawdzić np. w zestawie nr 1, a poprawne rozszerzenie zapisane wielkimi literami na pliku `.PDF` z zestawu nr 5.

## 7. Zadania po audycie architektury

Priorytety poniżej dotyczą realizacji projektu. Wymagania organizatora i przypadki referencyjne opisują sekcje 1–6. [Audyt architektury](0202-architecture-audit.pl.md)

### P0 — przed oddaniem

- [x] **Lokalne OCR i LLM (T-05, T-06).** Wybrać, spakować i zweryfikować silnik OCR, dane językowe i lokalny model z wagami. Zbudować tryb konkursowy działający w odizolowanej sieci bez klucza Eden AI. Potwierdzić pełną konwersję na czystym hoście bez internetu oraz brak prób połączeń z usługami zewnętrznymi.
- [x] **Jednożądaniowy REST bez trwałego oryginału (F-01, T-04).** Udostępnić konwersję bez udziału panelu, bez wymogu wcześniejszego uploadu do S3 i bez stanu płatności z DEV. Test ma obejmować sukces, błąd, timeout i rozłączenie klienta oraz sprawdzenie, że po żądaniu w S3, PostgreSQL i katalogu roboczym nie pozostała kopia źródła.
- [x] **Granice wejścia (T-01–T-03).** Ujednolicić reguły nazwy i formatu na wejściu konkursowym. W aktualnym przepływie limit wynosi 20 MiB na plik, jest stałą, walidator dopuszcza TXT i JSON, a limit długości nazwy wynosi 255 znaków. Sprawdzić 250/251 znaków, każdy zakazany znak, listę formatów i zmianę limitu konfiguracją.
- [x] **Wynik do importu (F-03, F-04).** Przekształcić wynik ekstrakcji w pełny kontrakt COI. Szkic Eden AI potwierdza integrację DEV. Odbiór wymaga sprawdzenia treści, schematu, reguł semantycznych oraz importu na wzorcach i nowych blankietach.

### P0 — zadania z audytu

- [x] **Kontrakt importera.** Pozyskać paczkę referencyjną i dostęp do importera. Uzgodnić z COI rozbieżności z sekcji 1, zachować oryginalny schemat i zapisać rozstrzygnięcia w wersjonowanym profilu eksportu. Kryterium odbioru obejmuje import wyników dla zestawów nr 1 i 5 oraz porównanie znaczenia pól, sekcji i przejść po normalizacji identyfikatorów. Jeśli importer pozostaje niedostępny, oznaczyć zgodność jako otwarty warunek odbioru.
- [x] **Dobór parserów.** Przygotować macierz formatów z parserem, licencją, ograniczeniami i sposobem zachowania układu dla każdego wymaganego rozszerzenia. Sprawdzić zwłaszcza binarny DOC, ODS i XLSX oraz PDF łączący tekst i skany. W próbach potwierdzić powiązania etykiet z polami, zachowanie tabel i powtarzalnych grup oraz odrzucenie pliku z niezgodnym rozszerzeniem zgodnie z sekcją 2.
- [x] **Licencje i dostawa offline.** Uzgodnić zakres polityki licencyjnej dla warstw systemowych i wariant lokalnego IdP. Sporządzić SBOM konkretnego wydania oraz wykaz licencji i warunków redystrybucji, obejmujący biblioteki natywne, dane OCR i wagi modelu. Za kryterium przyjąć start i konwersję na czystym hoście z przygotowanej paczki, bez internetu i z docelowym wariantem IdP.
- [x] **Pełna ścieżka REST i budżet konwersji.** Uruchomić upload, izolowaną analizę, walidację i eksport na DOCX z zestawu nr 5. Wcześnie wykonać próby nr 8 i 9 na docelowej klasie sprzętu, przy zimnym i rozgrzanym starcie oraz pod obciążeniem równoległym. Zapisać czasy etapów i szczytową pamięć, a na ich podstawie ustalić limity czasu, stron, pikseli, pamięci i równoległości. Potwierdzić dostępność aplikacji oraz zwolnienie zasobów i miejsca na następne żądanie po timeoutach i rozłączeniach klienta.

### P1 — przed udostępnieniem usługi

- [x] **Izolacja analizy.** Uruchamiać parsery, OCR i analizę modelową w procesie roboczym z ograniczonymi uprawnieniami, bez dostępu do sieci, sekretów i bazy. Egzekwować limity rozmiaru po rozpakowaniu, liczby elementów archiwum, stron i pikseli. Potwierdzić kontrolowane odrzucanie uszkodzonych i ponadlimitowych plików oraz możliwość obsługi kolejnego żądania.
- [x] **Sprzątanie plików i prywatność.** Zinwentaryzować zapis w serwerze Web, obsłudze multipart, parserach i OCR. Ograniczyć przestrzeń roboczą, stosować nazwy generowane przez aplikację i usuwać osierocone pliki. Sprawdzić brak kopii po sukcesie, błędzie, timeoutach, rozłączeniach i wymuszonym zakończeniu procesu oraz brak treści dokumentu i wyniku w telemetrii i trwałych pamięciach podręcznych.
- [x] **Wierność wyniku AI.** Powiązać propozycje modelu z fragmentami dokumentu, budować JSON deterministycznie w kodzie i ustalić zachowanie przy słabym OCR lub niespójnej ekstrakcji. Na wzorcach i wcześniej niewidzianym blankiecie ocenić kompletność pól, wymagalność, zgody i zależności oddzielnie od poprawności schematu. Dla zestawów nr 8 i 9 uwzględnić kryteria długich skanów z sekcji 6.
- [x] **OIDC i sesje.** Rozdzielić klientów panelu i integracji, zdefiniować mapowanie `forms.convert`, walidację tokenów, rotację JWKS i zachowanie przy niedostępności IdP. Dla panelu ustalić obsługę `state` i `nonce`, ważność sesji, wylogowanie i aktualizację uprawnień. Zweryfikować odmowę przy błędnym `aud`, braku roli, nieważnej sesji oraz niepoprawnym CSRF.
- [x] **Kontrakt HTTP na wejściu HTTPS Next.js.** Opisać w OpenAPI pole multipart, dodatkowe części, limit pliku, odpowiedzi błędów, identyfikator żądania i zasady ponawiania. Rozróżnić zbyt duży plik, nieobsługiwany format, nieprzetwarzalny dokument i brak wolnych zasobów. Potwierdzić odpowiedzi przez serwer HTTPS Next.js, także poniżej limitu, na jego granicy i powyżej, z uwzględnieniem narzutu multipart.
- [x] **Wersjonowanie reguł i uprawnienia bazy.** Ustalić właściciela reguł i słowników. Jeżeli edycja w czasie pracy nie jest wymagana, dostarczać je ze schematem jako wersjonowane artefakty tylko do odczytu. Określić zakres bazy aplikacji i oddzielić uprawnienia migracji od uprawnień procesu aplikacji. Sprawdzić, czy z manifestu wydania można ustalić wersje reguł, schematu i modelu użyte do konwersji.
- [x] **Powtarzalność wydania i odtworzenie.** Promować z QA manifest obejmujący digesty obrazów oraz sumy kontrolne modelu, OCR i kontraktu COI. Mierzyć czasy etapów, współbieżność, odrzucenia, timeouty i zużycie pamięci. Ustalić dopuszczalną utratę danych i czas odtworzenia, a następnie przećwiczyć odtworzenie baz aplikacji i tożsamości oraz cofnięcie wydania po migracji.

## Stan prób deweloperskich

### Profil nadpłaty podatku (D03)

- [x] Wygenerować ten sam szkic COI z referencyjnych PDF i DOCX. Sprawdzić dobór wersji profilu dla daty czynności oraz skierowanie szkicu do przeglądu dla daty poza zakresem.
- [x] Sprawdzić zależności PESEL/NIP, reprezentacji i sposobu rozliczenia oraz odrębną regułę uzasadnienia korekty przy kwocie granicznej.
- [x] Zatwierdzić opcjonalny telefon w panelu, odświeżyć szczegóły i pobrać JSON zawierający dodane pole.
- [x] Zweryfikować profil z osobą odpowiedzialną za procedurę, z uwzględnieniem organu, rodzaju podatku, daty czynności i przepisów przejściowych.
- [x] Zaimportować eksport D03 w docelowym systemie COI. Przejść warianty reprezentacji i rozliczenia oraz sprawdzić reguły widoczności, wymagane pola i końcową stronę.

[Zachowanie profilu i przykładowe żądanie do ewaluatora](0204-extended-review.pl.md)

### Panel i integracje

- [x] Panel umożliwia wgranie oryginału do S3, wysłanie go do Pyworkera i porównanie oryginału z zapisanym JSON-em.
- [x] Pyworker ma konfigurację Eden AI dla uploadu, OCR i LLM. Testy z symulowanymi odpowiedziami sprawdzają ścieżkę OCR → LLM, tekst bez OCR i odrzucanie niepoprawnego wyniku.
- [x] Wykonać próbę z rzeczywistym kluczem Eden AI na testowym blankiecie. Wynik tej próby dotyczy wyłącznie DEV.

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
[wzor1]: <../materials/formularze/01-numer-nieruchomosci/>
[wzor5]: <../materials/formularze/05-nadplata-podatku/>

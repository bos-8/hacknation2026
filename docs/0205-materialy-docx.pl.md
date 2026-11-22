---
brief: Odczyt źródeł Word, reguły eksportu COI i weryfikacja danych adresowych.
tags: [formularze, docx, import, teryt]
---

# Formularze Word i kontrakt importu COI

Odczyt materiałów jest podstawą reguł, a uruchomienie konwersji opisuje [kontrakt dokumentu](0208-document-redaction.pl.md). DOC jest czytany lokalnie przez Apache POI także w obrazie Docker. Walidacja rozpoznaje faktyczną zawartość, więc plik DOCX z rozszerzeniem `.doc` zostanie odrzucony. Rzeczywisty binarny DOC nie gwarantuje odtworzenia automatycznych podziałów stron Worda.


W katalogu `materials/wyniki-docx` każdy blankiet ma własny tekst źródłowy `form.txt`, model z dowodami i decyzjami `form.ir.json` oraz eksport `form.coi.json`. Indeks łączy wynik z nazwą oryginału, skrótem SHA-256, profilem, liczbą pól i wyodrębnionymi obrazami. Wizualizacje i dokumenty techniczne mają osobne transkrypcje. Obrazy zapisujemy w oryginalnym formacie. Liczby pól poniżej obejmują kontrolki i bloki informacyjne wewnątrz sekcji.

| Formularz źródłowy | Zakładki | Pola | Co wymaga uwagi |
| --- | ---: | ---: | --- |
| Numer porządkowy nieruchomości | 4 | 52 | Osoba fizyczna, JDG i organizacja mają odpowiednie warianty reprezentacji. Osobno można podać adres wnioskodawcy, osoby działającej w jego imieniu i lokalizację budynku. |
| Zwrot opłaty skarbowej | 4 | 19 | Weryfikacji wymaga przypisanie danych do wpłacającego i posiadacza rachunku. |
| Wydanie zaświadczenia | 5 | 25 | Numer rachunku wydrukowany przez urząd wymaga potwierdzenia. |
| Wynajęcie świetlicy | 5 | 31 | Trzeba rozróżnić osobę odpowiedzialną za wydarzenie i wnioskodawcę. |
| Stwierdzenie nadpłaty podatku | 5 | 37 | Profil EXTENDED rozdziela status podatnika, reprezentację i sposób rozliczenia. |
| Zajęcie pasa drogowego | 4 | 33 | Źródła wskazują różne organy. Profil ma status `blocked`. |
| Zezwolenie dotyczące psów | 5 | 59 | Tytuł wskazuje psy ras agresywnych, treść dotyczy chartów. Profil ma status `blocked`. |
| Deklaracja odpadowa | 5 | 48 | Trzeba potwierdzić taryfy i pozyskać wskazane załączniki. |
| Świadczenia sportowe | 5 | 143 | API oznacza wspólny szkic statusem `multiple`. Skrypt odczytu materiałów zapisuje także trzy osobne szkice ze źródłami dla stypendium, nagrody i wyróżnienia. |

## Jak odtworzyć odczyt

Z katalogu głównego repozytorium, po instalacji zależności Pyworkera:

```powershell
apps/pyworker/.venv/Scripts/python.exe scripts/read-form-materials.py materials/wyniki-docx
```

Skrypt czyta akapity, pola tekstowe rysunków Worda, tabele, przywołane przypisy, nagłówki i stopki. Zachowuje pojedynczą wersję rysunku zapisanego w formacie podstawowym i zapasowym. Dla każdego blankietu wywołuje kompilator i sprawdza wynik względem `materials/materialy/schemat.json`. Domyślna data oceny profilu to 22 listopada 2026 r. Można ją zmienić przez `--as-of RRRR-MM-DD`. Do odtworzenia wyników na innym stanowisku potrzebne są źródła COI w katalogu `materials`. Dodanie lub zmiana materiału wymaga przeglądu jego przypisania w katalogu źródeł. Wgranie znanej wizualizacji lub dokumentacji do endpointu przetwarzania zwraca HTTP 422.

## Reguły wynikające z trzech specyfikacji

- **Opis importu** określa identyfikatory stron, pól i przejść, pozycje siatki, tablice walidacji oraz reguły `states`. W nazwie zagnieżdżenia występuje rozbieżność. Eksport używa `repeatingSectionGrid` zgodnie z przykładami JSON i regułami technicznymi.
- **Reguły techniczne** wymagają co najmniej jednej strony roboczej i strony końcowej, tytułu do 255 znaków, niepustych sekcji i poprawnych powiązań. Końcowa sekcja zawiera wyłącznie `INFO_SECTION` z opisem. Warunek zależny od wiersza powtarzanego korzysta z `$repeatingSectionIndex`. Lokalną zgodność można sprawdzić schematem i testami. Zachowanie importera COI pozostaje do potwierdzenia w tym systemie.
- **Słowniki** określają nazwy i typy pól, do których można podłączyć listę. Słowniki administracyjne i `Kraje` są przypisywane do `SELECT`. Pole słownikowe eksportuje pustą listę własnych opcji. Nazwa ulicy korzysta w edytorze z ULIC, a w eksporcie z pola tekstowego.

## TERYT, EGiB i dane z konta

Generator przypisuje rozpoznanemu polu „Województwo” typ `SELECT` i `dictionaryName: "Województwo"`. Powiat, gmina i miejscowość korzystają z kolejnych list, gdy w tej samej sekcji można wskazać ich rodzica. Edytor obsługuje także starsze pola tekstowe o tych etykietach. Jednoznaczna nazwa z dokumentu wybiera odpowiedni kod TERYT, np. „mazowieckie” daje `14`. Pole „Kraj” używa 249 kodów ISO 3166-1 alpha-2 z migawki JDK 21. Etykiety po polsku i angielsku dostarcza `Intl.DisplayNames`.

Edytor pobiera listę potomną po wybraniu rodzica. Używa lokalnych katalogów TERC, SIMC i ULIC. Zmiana rodzica czyści niższe wybory, a serwer sprawdza związek identyfikatorów przed zapisem. Migawka zawiera 16 województw, 380 powiatów, 3964 wpisy gmin i jednostek podrzędnych, 101865 miejscowości i 310486 wystąpień ulic. Nazwy plików GUS oraz SHA-256 archiwów znajdują się w tabeli `sources`. Do przebudowy bazy podaj katalog z plikami `TERC.zip`, `SIMC.zip`, `ULIC.zip` i ścieżkę docelową. [Źródło danych GUS](https://eteryt.stat.gov.pl/eTeryt/rejestr_teryt/udostepnianie_danych/formy_i_zasady_udostepniania/formy_i_zasady_udostepniania.aspx)

```powershell
python scripts/import-teryt.py .local apps/pyworker/src/pyworker/schemas/v1/teryt.sqlite3
```

Opcjonalna zmienna `PYWORKER_EGIB_SQLITE` wskazuje lokalną bazę do odczytu. Dla kontenera zamontuj ją tylko do odczytu i podaj ścieżkę wewnętrzną. Adapter oczekuje tabel `precinct(id, municipality, name, complete)` i `parcel(precinct_id, number)`. Numer działki musi być tekstem, np. `123/4`. Identyfikator obrębu ma postać `WWPPGG_R.XXXX`. Kolumna `complete` może mieć wartość 1 wyłącznie dla kompletnego wykazu działek danego obrębu. Dopiero wtedy brak działki w wykazie daje błąd. Przy niepełnym zakresie lub niejednoznacznej nazwie kontrola pozostaje nierozstrzygnięta. Bez bazy dostępna jest kontrola formatu i zgodności podanego pełnego identyfikatora obrębu z gminą. Wynik sprawdzenia pary działka–obręb dotyczy wpisu w migawce. [Wyszukiwanie działek według GUGiK](https://mapy.geoportal.gov.pl/pomoc_3d/wgdzialkisearchhtml.htm)

W profilu numeracji nieruchomości osoba fizyczna lub prowadząca JDG działająca osobiście może uzupełnić puste pola z własnego konta po zalogowaniu. Edytor odczytuje imię, nazwisko i zweryfikowany e-mail. Dane pozostają w odpowiedziach szkicu. Deklaracja `defaultValueType: EXTERNAL_SYSTEM` jest osobnym mechanizmem importu i wymaga skonfigurowanego rejestru.

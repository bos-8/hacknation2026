---
brief: Dobór profilu nadpłaty, reguły aktywności pól i przegląd szkicu COI w FORMIQ.
tags: [formularze, formir, pyworker, coi]
---

# Profil EXTENDED i przegląd wniosku o nadpłatę

FORMIQ rozpoznaje wersję blankietu Urzędu Gminy Ulan-Majorat oznaczoną w katalogu jako `D03`. Dla tej wersji buduje interaktywny wniosek na podstawie odczytanego dokumentu i profilu procedury. Urzędnik może prześledzić pochodzenie pola, rozstrzygnąć propozycje i pobrać konfigurację COI. Szkic ma status `DRAFT_NOT_FOR_SUBMISSION`.

## Jak Pyworker wybiera profil

1. Next.js pobiera oryginał z S3 i przesyła go z metadanymi do prywatnego `POST /v1/forms/process`. Po sprawdzeniu płatności, nadawcy i typu pliku Pyworker odczytuje treść. Ta konwersja odbywa się w jednym żądaniu.
2. W trybie semantycznym `EXTENDED` dopasowanie do D03 wymaga zgodności skrótu pliku albo skrótu znormalizowanego pełnego tekstu. Podobny tytuł może wskazać kandydata do przeglądu. Sam tytuł ani nazwa pliku nie uruchamiają reguł D03.
3. Parametr zapytania `as_of` wskazuje datę czynności, domyślnie dzień analizy. Profil `pl.tax.overpayment.local.2026.10.extended`, wersja `1.0.0-draft`, obowiązuje w rejestrze od `2026-10-01`. Dla wcześniejszej daty albo blankietu bez pasującego profilu worker zwraca szkic z wpisem `no_applicable_legal_profile` w `form_ir.review`. Jawny wybór `semantic_mode=STANDARD` uruchamia dotychczasową ścieżkę kompilacji.
4. Odpowiedź zawiera `draft` z konfiguracją COI (`title`, `tabs`, `flow`) oraz `form_ir` z regułami i dowodami. W `form_ir.extended.candidates` można odczytać klucz semantyczny, decyzję, źródła, identyfikatory reguł i informację o włączeniu pola. Next.js zapisuje wynik w PostgreSQL przy pliku źródłowym. Przycisk pobrania JSON-a eksportuje zawartość `draft`.

## Co trafia do szkicu

| Decyzja | Kandydaci D03 | Skutek |
| --- | ---: | --- |
| `AUTO` | 20 | Kompilator umieszcza pole lub informację w odpowiedniej sekcji. |
| `CONDITIONAL` | 18 | Pole jest aktywne w określonym wariancie. Jeden kandydat dotyczy osobnej ścieżki korekty deklaracji. |
| `REVIEW` | 8 | Właściciel szkicu otrzymuje propozycję z uzasadnieniem do rozpatrzenia. |
| `REJECT` | 3 | Audyt zachowuje przyczynę pominięcia, np. dla propozycji obowiązkowej zgody RODO. |

Referencyjny wniosek ma początkowo **37 pól na pięciu zakładkach**, licząc pola wewnątrz sekcji. Liczby dotyczą tej wersji profilu. Nie są kryterium jakości innych formularzy.

Reguły rozpatrują rodzaj podmiotu, status podatkowy i sposób reprezentacji osobno. Wybór PESEL wymaga spełnienia warunków profilu osoby fizycznej. Wskazanie pełnomocnika szczególnego aktywuje odpowiedni załącznik. Wybór zwrotu przelewem aktywuje rachunek. Po zmianie na zaliczenie nadpłaty wpisany wcześniej rachunek wypada z aktywnych odpowiedzi.

## Jak sprawdzić regułę w Swagger UI

W grupie **Forms** użyj `GET /v1/forms/profiles`, aby odczytać wersje i źródła. Następnie wywołaj `POST /v1/forms/profiles/evaluate` z poniższym przykładem. Obie operacje wymagają uwierzytelnienia tokenem usługi. [Swagger UI w DEV](http://localhost:8010/docs)

```json
{
  "profileId": "pl.tax.overpayment.local.2026.10.extended",
  "version": "1.0.0-draft",
  "asOf": "2026-10-01",
  "path": "APPLICATION",
  "answers": { "settlement_choice": "BANK_REFUND_REQUEST" }
}
```

W odpowiedzi `states.bank_account` ma wartość `TRUE`, a `states.future_tax_name` wartość `FALSE`. Przy pustym `answers` oba warunki mają wartość `UNKNOWN`. `activeAnswers` zawiera wartości aktywnych pól, `errors` wskazuje błędne dane, a `needsInput` wymienia braki. Żądanie oceny dla niedostępnej wersji lub daty zwraca HTTP 422.

Ścieżka `CORRECTION` ocenia osobno pisemne uzasadnienie korekty. Dla `correction_overpayment_amount` równego `"10000.00"` pole `correction_written_justification` pozostaje nieaktywne, a dla `"10000.01"` staje się aktywne. W ścieżce `APPLICATION` uzasadnienie samego wniosku jest odrębnym polem. [Reguły i testy wartości granicznych](../apps/pyworker/tests/test_extended.py) · [Akt wskazany w profilu](https://eli.gov.pl/eli/DU/2026/846/ogl)

## Jak rozpatrzyć propozycję

### Sprawdzenie danych wpisanych w przesłanym pliku

W szczegółach przetworzonego pliku sekcja **Dane odczytane z formularza** pokazuje wartości, które worker powiązał z konkretnymi polami. Przykładem jest numer wpisany po etykiecie „PESEL” w DOCX albo w polu tekstowym PDF. Właściciel może poprawić odczyt bez zmieniania przesłanego pliku. Starszy wynik bez odczytanych odpowiedzi wymaga ponownej analizy, aby pobrać je ze źródła.

Panel sprawdza aktywne pola przy otwarciu, po edycji oraz przy zapisie. Błędna wartość lub brak wymaganej odpowiedzi oznacza czerwone obramowanie, komunikat przy polu i blokadę zapisu. Komunikat w kolorze bursztynowym oznacza potrzebę weryfikacji, np. gdy brakuje migawki PRG. Taki szkic można zapisać. Next.js zachowuje poprawki w `reviewed_answers` przy pliku. Pierwotny odczyt jest w `source_answers`, a przycisk pobrania JSON eksportuje definicję COI z `draft`.

Podstawowe walidatory m.in. PESEL, NIP, daty, kwoty i e-maila działają w Pyworkerze. Pełna kontrola adresowa wymaga rozpakowania obu archiwów pakietu PL/EU do wspólnego katalogu i dodania katalogu zawierającego `formiq_validation/` do `PYTHONPATH` procesu Pyworkera. Po zmianie środowiska uruchom worker ponownie. Moduł korzysta z `ValidatorEngine` i lokalnych plików danych. Gdy są niedostępne, edytor zgłasza ograniczony zakres kontroli. Reguły i mapowania przykładu D03 pochodzą z `materials/slowniki`; województwo, powiat, gminę, miejscowość i ulicę wybiera się z powiązanych list TERYT. Edytor zapisuje ich kody z zachowaniem zer wiodących. [Odczyt materiałów Word i zakres kontroli adresowych](0205-materialy-docx.pl.md)

### Decyzje dotyczące konfiguracji

1. Otwórz przetworzony wniosek w **Formularze → szczegóły → Decyzje do przeglądu**. Wybierz pole, przeczytaj źródło i opis skutku decyzji.
2. Podaj uzasadnienie i zaakceptuj albo odrzuć propozycję. Akceptacja telefonu, e-maila, okresu podatkowego lub danych posiadacza rachunku dodaje opcjonalne pole do szkicu. Pole posiadacza rachunku pokazuje się dla zwrotu przelewem. Akceptacja pozostałych propozycji zapisuje zalecenie do kolejnej wersji profilu.
3. Next.js ustala autora na podstawie sesji właściciela i zleca przeliczenie przez `POST /v1/forms/profiles/review`. Zapisuje decyzję, czas, uzasadnienie i wynik przy tym samym pliku. Jeśli w międzyczasie zmieniła się wersja szkicu, zapis zwraca HTTP 409. Panel odświeża stan przed następną decyzją.
4. Pobierz JSON ze szczegółów, aby otrzymać eksport po przeglądzie. Polecenie ponownej analizy generuje nowy szkic i rozpoczyna przegląd od początku. Zmiana daty dla już przetworzonego dokumentu w API Next.js wymaga `reanalyze=1`.

Próba w DEV potwierdziła identyczny eksport z referencyjnego PDF i DOCX. Po akceptacji opcjonalnego telefonu i odświeżeniu strony pobrany JSON zawierał 38 pól. Warunki widoczności w eksporcie i wyniki ewaluatora porównano w 22 scenariuszach, wykonując 814 sprawdzeń. Do powtórzenia testów repozytorium służy `pnpm --filter @formiq/pyworker test`. Do publikacji pozostają odbiór prawny profilu oraz próba importu w docelowym systemie COI. [Backlog odbioru](9999-backlog.pl.md)

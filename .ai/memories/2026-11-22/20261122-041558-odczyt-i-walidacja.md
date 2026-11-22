---
brief: Kolejka konwersji, odczyt wartości pól i walidacja PESEL w edytorze formularza.
tags: [formiq, pyworker, ocr, formularze, pesel]
---

# Odczyt i edycja wypełnionych formularzy

- Next.js kolejkuje zadania przez pg-boss (`form.process`), przekazuje plik do bezstanowego Pyworkera i zapisuje zwrócony JSON w powiązaniu z oryginałem.
- Dla obrazów i PDF skonfigurowano `deepinfra/Qwen/Qwen3-VL-235B-A22B-Instruct` z `reasoning_effort: "none"`. W próbie z syntetyczną tabelą model odczytał cztery wypełnione i pięć pustych komórek. W osobnej próbie z pojedynczym polem dostawca zwrócił błędny JSON.
- W podglądzie COI etykieta pochodzi z definicji pola, a odczytana odpowiedź jest przypisana do UUID pola. Podpis drukowany pod linią może opisywać wartość z poprzedniego wiersza. Dla starszych wyników edytor odzyskuje wartości przy jednoznacznym dopasowaniu. Brak całej kontrolki wymaga ponownej analizy pliku.
- Edytor sprawdza PESEL z odczytu oraz po zmianie wartości, także dla zwykłego pola z etykietą „Numer PESEL dziecka”. Walidator `pl.pesel.v1` sprawdza długość, zakodowaną datę i sumę kontrolną. Błędny numer powoduje czerwone oznaczenie pola, komunikat po polsku i blokadę zapisu do czasu poprawienia.
- W tej sesji sprawdzono w przeglądarce kolejkę dwóch plików, odczyt wartości, zapis edycji, pobranie wyniku oraz korektę PESEL. Scenariusz regresji jest w `tests/browser/form-processing.integration.mjs`. Przeszły także kontrola typów i cztery testy Pythona dotyczące walidacji odpowiedzi. Zgodność z rzeczywistym importerem COI pozostaje do potwierdzenia.

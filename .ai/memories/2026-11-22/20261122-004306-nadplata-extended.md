---
brief: Profil EXTENDED dla nadpłaty podatku, zapis decyzji REVIEW i stan odbioru.
tags: [formiq, pyworker, formir, coi, nadplata]
---

# Nadpłata podatku w trybie EXTENDED

Stan lokalny gałęzi `pipeline` z 22 listopada 2026 r.

- **Zakres profilu.** Pyworker rozpoznaje sprawdzoną wersję wniosku z Ulan-Majoratu (D03) po skrócie pliku lub zgodności pełnego tekstu. Rejestr dobiera wersję dla daty czynności `as_of`. Przy braku wersji na ten dzień wynik trafia do przeglądu. Źródłem profilu jest pakiet `materials/formularz-json2`. [Instrukcja API](../../../README.md)
- **Generowanie.** FormIR przechowuje pochodzenie pól, podstawy decyzji i ograniczenia publikacji. Kompilator tworzy eksport COI. Profil `1.0.0-draft` klasyfikuje 49 kandydatów (20 AUTO, 18 CONDITIONAL, 8 REVIEW, 3 REJECT). Wniosek zawiera początkowo 37 pól na pięciu zakładkach. Uzasadnienie wniosku i uzasadnienie osobnej korekty deklaracji mają odrębne reguły.
- **Reguły.** Rodzaj podmiotu i status podatnika ograniczają PESEL/NIP. Reprezentacja steruje danymi i dokumentami pełnomocnika. Sposób rozliczenia steruje polem rachunku. Brak odpowiedzi pozostawia warunek nierozstrzygnięty. Dane z nieaktywnego wariantu wypadają z walidacji.
- **Przegląd.** W szczegółach formularza właściciel zatwierdza albo odrzuca propozycję z uzasadnieniem. Pyworker przelicza szkic w obrębie żądania. Next.js zapisuje decyzję i nowy JSON przy dokumencie, z kontrolą równoczesnych zmian. Akceptacja telefonu, e-maila, okresu podatkowego lub posiadacza rachunku dodaje pole opcjonalne. Decyzje dotyczące zmian prawnych wymagają kolejnej wersji profilu. Ponowna analiza rozpoczyna nowy przegląd.
- **Sprawdzone.** PDF i DOCX dały identyczny eksport. Test przez przeglądarkę potwierdził zapis akceptacji telefonu i pobranie JSON-a z 38 polami po odświeżeniu. Przeszły 64 testy Pyworkera oraz 814 sprawdzeń zgodności warunków JSONata z ewaluatorem w 22 scenariuszach. W pakiecie źródłowym brakowało pliku scenariuszy wskazanego przez jego walidator.
- **Do odbioru.** Profil ma status `DRAFT_NOT_FOR_SUBMISSION`. Do publikacji potrzebne są przegląd prawny dla właściwego organu i podatku oraz próba importu JSON-a w docelowym systemie COI.

---
brief: HTTPS API bez profilu AWS, blokada czasowa oraz poprawki tekstu i ramek.
tags: [api, aws, pipeline, ocr]
---

# Aktualny stan

Ta notatka aktualizuje wcześniejszy opis AgentCore wymagającego profilu AWS.

- Użytkownik wymaga dostępu klienta wyłącznie przez HTTPS z kluczem API, bez profilu AWS. Zatwierdził publiczny endpoint chroniony Bearer, limit czterech analiz i stałe wygaśnięcie.
- Pyworker używa PYWORKER_HARNESS_API_URL, PYWORKER_HARNESS_API_KEY oraz PYWORKER_HARNESS_EXPIRES_AT. Prywatne wartości pozostają w ignorowanym apps/pyworker/.env. Usunięto użycie profilu i ARN przez adapter klienta. SDK AWS wykorzystują serwer i instalatory.
- Endpoint Lambda wywołuje harness_fermiq rolą ograniczoną do wskazanego zasobu. Kod api_handler.py, install_api.py oraz test_api_handler.py jest w infra/aws/harness. Prompt i ARN ustala serwer, nie klient.
- Limit czterech analiz wymuszają atomowe blokady DynamoDB o żywotności pięciu minut. Rezerwacja współbieżności Lambda była niedostępna z powodu limitu konta. Tabela zawiera jedynie identyfikator slotu, właściciela i termin blokady, bez dokumentów.
- Stała data wygaśnięcia wynosi 2026-11-22T19:09:47.576880+00:00, czyli 20:09:47 czasu polskiego. Nie przedłużać jej automatycznie podczas restartu lub instalacji. Hook beforeInvocation fixed_expiry w Harness zwraca deny po terminie i ma failureMode=deny. Pyworker i API sprawdzają ten sam termin. Wcześniejsze wywołania mogą się dokończyć. Administrator może zmienić konfigurację.
- Źródła i instalator hooka są w infra/aws/harness/expiry_hook.py i install_expiry.py. Testy obejmują granicę czasu oraz brak konfiguracji. Funkcja hooka nie ma uprawnień do innych zasobów.
- Sprawdzono rzeczywisty HTTPS bez podpisu AWS: brak i błędny klucz zwróciły 401, poprawny 200 oraz end_turn. Test endpointu głównego DEV z dwustronicowym PDF zwrócił 200 i zachował 33/33 linie drugiej strony.
- Prompty vision, lokalnego generatora i serwera API wymagają pomijania długich ciągów kropek służących do wpisywania danych. clean_writing_guides w form_title.py czyści wartości JSON końcowego CoiResult, zachowując zwykłą interpunkcję i liczby dziesiętne.
- Poprawki geometrii są w SourceFrame (nowy komponent przy podglądzie formularza) i align_printed_text w table_geometry.py. SourceFrame mierzy rzeczywiste rozmiary img/canvas przez ResizeObserver. Jednoznaczne etykiety i wartości z warstwy tekstowej PDF dostają współrzędne źródłowe. Powtarzające się wartości nie są arbitralnie przypisywane do pierwszego dopasowania. Geometrię komórek i checkboxów zachowuje ich osobna ścieżka.
- Ostatnie sprawdzenia geometrii obejmują 17 testów vision, TypeScript oraz test API 200. Nie wykonano wizualnego sprawdzenia konkretnego pliku użytkownika. Dla skanów bez warstwy tekstowej geometria nadal zależy od OCR. Stare wyniki wymagają ponownej analizy.
- Pełne 114 testów pyworkera przeszło po migracji HTTPS i czyszczeniu kropek, przed ostatnią zmianą geometrii. Trzy testy zabezpieczeń API przeszły. Nie przedstawiać pełnego zestawu jako ponownie uruchomionego po geometrii.
- Ostatni push na main to 0e3fb1b. Późniejsze poprawki HTTPS, wygaśnięcia, kropek i geometrii pozostają lokalne na moment tego zapisu. Publicznych certyfikatów nie usuwać na podstawie pozornych usunięć zgłaszanych przez sandbox bez dostępu do certs.

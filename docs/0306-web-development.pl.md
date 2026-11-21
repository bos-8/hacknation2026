---
brief: Rozwój panelu Next.js, lokalizacja, katalogi administratora i historia zmian.
tags: [nextjs, i18n, katalog, administracja]
---

# Web, API i administracja

Next.js obsługuje interfejs i backend Web. Strony aplikacji mają prefiks języka, np. `/pl/admin/files`. Publiczne ścieżki API zachowują prefiks `/api/v1` niezależnie od języka. Komponenty korzystają z Better Auth przez backend. Prywatne tokeny S3, workera i katalogu użytkowników pozostają po stronie serwera.

| Przy zmianie | Miejsce w repozytorium |
| --- | --- |
| Dodajesz ekran | [App Router](../apps/web/src/app/), [routing PL/EN](../apps/web/src/i18n/). Uzupełnij oba katalogi komunikatów i sprawdź widok po zmianie języka. |
| Dodajesz akcję lub endpoint | [Schematy wejścia](../apps/web/src/schemas/), [kod serwerowy](../apps/web/src/server/), [ścieżki API](../apps/web/src/config/api-routes.ts). Sprawdź sesję i uprawnienia przy każdej chronionej operacji, również wywołanej wprost. |
| Budujesz tabelę lub formularz | [Komponenty interfejsu](../apps/web/src/ui/). Wzorce obejmują filtrowanie, paginację, boczny panel edycji, okna dialogowe, motyw, kontrast i powiadomienia. Galeria komponentów jest dostępna pod `/pl/test`. |

## Markdown w czacie

Na stronie `/pl/chat` wtyczka `remark-gfm` dodaje klasę `task-list-item` do elementów listy z polem wyboru. Moduł CSS czatu rozpoznaje ją selektorem atrybutu `li[class~="task-list-item"]`. Dzięki temu zadania mają samo pole wyboru, a zwykłe listy zachowują punktory lub numerację.

## Katalogi

- **Pliki i OCR.** W `/pl/admin/files` administrator zarządza plikiem logicznym i jego wersjami. Do analizy wybiera konkretną wersję PDF, PNG lub JPEG. Trwałe usunięcie dotyczy pliku i jego wersji; zmiana statusu na oczekujący na usunięcie to osobna operacja. [Przegląd dokumentu i eksport](0208-document-redaction.pl.md)
- **Produkty i tagi.** W `/pl/admin/products` administrator zarządza produktem i opcjonalnym obrazem. Panel tagów znajduje się pod `/pl/admin/tags`. Operacje zależne od aktualnego statusu lub wersji rekordu powinny obsługiwać konflikt równoczesnych zmian. Po konflikcie odśwież dane przed ponowieniem.
- **Historia.** Panel informacji o produkcie lub pliku pobiera kolejne strony historii na żądanie. Baza zapisuje operację, czas, aktora i wartości przed i po zmianie w transakcji. Przy analizie zmiany pliku uwzględnij także historię jego wersji.

Po zmianie uruchom `pnpm dev:check:web` i `pnpm test:web`. Szersze testy operacji na danych mają osobne komendy `pnpm test:products:integration` i `pnpm test:tags:integration`. [Polecenia workspace](../package.json)

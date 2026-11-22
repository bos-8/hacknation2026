---
brief: Spójność katalogu i S3, fizyczne kopie wolumenów oraz odtwarzanie na nowych wolumenach.
tags: [postgresql, s3, backup, odtwarzanie]
---

# Spójność danych i odtwarzanie

## Wolumeny Compose PoC

Projekt `formiqpoc` przechowuje bazę i pliki w osobnych wolumenach. `docker compose down` zachowuje je, a ponowny start odtwarza kontenery. Chroń kopię oraz prywatny `.env.poc.local` poza repozytorium. Starszy wolumen `formiqpoc-certs` po wariancie HTTPS może pozostać na komputerze, ale obecny PoC go nie używa. Poniższe skrypty backupu DEV i QA mają własną walidację nazw wolumenów i nie stanowią potwierdzonej procedury backupu projektu PoC. [Nazwy i start PoC](0307-docker-poc.pl.md)


## Rozbieżność między bazą a S3

Uruchom `pnpm storage:report`. Raport odczytuje katalog wersji plików i zawartość zasobnika dokumentów. Wskazuje m.in. brak obiektu, różnicę rozmiaru i obiekt bez powiązanej wersji. Dokument bez powiązania z produktem może być prawidłowym plikiem. Raport nie obejmuje zasobnika awatarów.

Po zakończeniu trwających uploadów powtórz raport, jeśli wynik jest niejednoznaczny. Usuwanie kwalifikujących się osieroconych obiektów to odrębna operacja `pnpm storage:cleanup --report <plik-raportu> --confirm <sha256>`. Wymaga przeglądu raportu i jego sumy. Skrypt ponownie sprawdza powiązania i tożsamość obiektu przed usunięciem. Brakujące bajty pliku odzyskaj z kopii. [Implementacja raportu](../scripts/storage-reconcile.mjs)

## Kopia offline

1. Zatrzymaj procesy zapisujące dane. W DEV użyj `pnpm dev:stop`. W QA użyj `pnpm qa:stop` i zatrzymaj także oddzielnie uruchomioną konsolę S3.
2. Wykonaj `pnpm backup:create dev` albo `pnpm backup:create qa`. Skrypt weryfikuje właściciela wolumenów i odmawia archiwizacji wolumenu używanego przez uruchomiony kontener.
3. Sprawdź utworzenie `manifest.json` w katalogu zwróconym pod `infra/local/backups/`. Kopia zawiera wolumen PostgreSQL ze wszystkimi trzema bazami, wolumen SeaweedFS i stan konsoli, jeżeli jej wolumen istnieje. Manifest identyfikuje obraz pomocniczy i sumy SHA-256 archiwów.
4. Zachowaj osobno zgodne obrazy, prywatne pliki env oraz certyfikaty i klucze potrzebne do uruchomienia stosu.

## Próba odtworzenia

`pnpm backup:restore <katalog-kopii>` weryfikuje manifest oraz sumy i wypakowuje dane do **nowych wolumenów**. Polecenie zwraca ich nazwy. Uruchom odrębny stos weryfikacyjny z tymi wolumenami i pasującą konfiguracją. Sprawdź logowanie do Keycloak, odczyt katalogu, pobranie znanego pliku S3 oraz stan kolejki. Przełączenie działającego środowiska jest osobną decyzją operatora. Test mechanizmu odtwarzania ma komendę `pnpm test:backup:integration`. [Kod archiwizacji i kontroli manifestu](../scripts/lib/volume-backup.mjs)

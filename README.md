# BinderDex 7.0.0 – eigenes Kartenbild per Link

BinderDex 7 ergänzt eine zuverlässige manuelle Bildquelle. Für jede gespeicherte Karte kann ein eigener direkter HTTPS-Bild-Link hinterlegt werden. Dieser Link wird vor den automatischen Bilddatenbanken verwendet.

## Neu in Version 7

- Neues Feld **„Eigenes Kartenbild per Link“** in der Kartendetailansicht.
- Der Link wird vor TCGdex, Pokémon TCG API und Sprach-Ersatzbildern geladen.
- Links ohne sichtbare Dateiendung und Links mit Query-Parametern werden unterstützt.
- Der Link wird vor dem Speichern als echtes Bild getestet.
- Externe Bilder werden ohne Referrer geladen, damit weniger Bildserver das Einbetten blockieren.
- Fällt der gespeicherte Link später aus, probiert BinderDex automatisch die bisherigen Bildquellen.
- Der Bild-Link kann jederzeit geändert oder entfernt werden.
- Gespeicherte Bild-Links sind im vollständigen BinderDex-Export enthalten.
- Bestehende Daten aus V1 bis V6 werden automatisch übernommen.

## Welcher Link funktioniert?

Benötigt wird ein **direkter HTTPS-Link zum Bild**. Beim Öffnen des Links im Browser sollte möglichst nur das Bild erscheinen.

Geeignet:

```text
https://beispiel.de/bilder/meine-karte.jpg
https://bilder.example.com/card?id=12345
```

Nicht geeignet:

```text
https://www.cardmarket.com/de/Pokemon/Products/Singles/...
```

Der zweite Link führt zu einer Webseite und nicht direkt zu einer Bilddatei.

Manche Webseiten verhindern das Anzeigen ihrer Bilder in anderen Apps. In diesem Fall meldet BinderDex, dass der Link nicht geladen werden konnte. Dann kann ein anderer Bild-Link oder weiterhin **„Eigenes Bild wählen“** verwendet werden.

## Eigenen Bild-Link speichern

1. Karte im Binder oder in der Wunschliste öffnen.
2. Zum Bereich **„Eigenes Kartenbild per Link“** scrollen.
3. Den direkten Bild-Link einfügen.
4. **„Link testen & speichern“** antippen.
5. Nach erfolgreicher Prüfung wird das Bild sofort in Detailansicht, Binder und Wunschliste verwendet.

Über **„Gespeicherten Bild-Link entfernen“** wird wieder auf die automatischen Bildquellen umgeschaltet.

## Update auf GitHub Pages

1. In der bisherigen App zuerst **Mehr → Datensicherung → Exportieren** verwenden.
2. `binderdex-v7-image-link.zip` herunterladen und entpacken.
3. Im bestehenden GitHub-Repository **Add file → Upload files** öffnen.
4. Diese Dateien und den Ordner `icons` direkt im Hauptverzeichnis ersetzen:
   - `index.html`
   - `app.js`
   - `styles.css`
   - `manifest.json`
   - `service-worker.js`
   - `README.md`
   - `icons/`
5. **Commit changes** auswählen.
6. Die GitHub-Pages-Adresse in Safari mit `?v=7` öffnen:

```text
https://DEINNAME.github.io/binderdex/?v=7
```

7. Unter **Mehr** kontrollieren, ob **BinderDex 7.0.0** und **V7** angezeigt werden.

## Falls weiterhin V6 erscheint

Vor dem Löschen von Website-Daten unbedingt ein Backup exportieren.

1. BinderDex vom Home-Bildschirm entfernen.
2. Auf dem iPhone **Einstellungen → Apps → Safari → Erweitert → Website-Daten** öffnen.
3. Den Eintrag der eigenen `github.io`-Adresse löschen.
4. Die Seite erneut mit `?v=7` in Safari öffnen.
5. Über **Teilen → Zum Home-Bildschirm** wieder installieren.

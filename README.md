# BinderDex 6.0.0 – Doppelter Bild-Fallback

Diese Version behebt den Fall, dass Karten trotz „Bilder reparieren“ weiterhin ohne Bild blieben.

## Was in Version 6 geändert wurde

- BinderDex nutzt nun **zwei voneinander unabhängige Bildquellen**:
  1. TCGdex
  2. Pokémon TCG API / `images.pokemontcg.io`
- Alte V5-Markierungen wie „Bild defekt“ werden beim ersten Start automatisch zurückgesetzt.
- Set-IDs werden für die zweite Bildquelle automatisch übersetzt, zum Beispiel:
  - `sv03` → `sv3`
  - `sv03.5` → `sv3pt5`
  - `swsh3.5` → `swsh35`
- Führende Nullen in Kartennummern werden für die zweite Quelle berücksichtigt, zum Beispiel `001` → `1`.
- TCGdex-Bilder werden zusätzlich als WebP, PNG und JPG sowie in niedriger und hoher Auflösung probiert.
- Fehlt das Bild der deutschen oder japanischen Ausgabe, wird zuerst die verknüpfte englische Ausgabe verwendet.
- Reicht auch das nicht, wird die Karte über Set, Nummer, Name, Illustrator, HP und Pokédex-Nummer in der zweiten Datenbank abgeglichen.
- In jeder Kartendetailansicht gibt es jetzt **„Bild erneut suchen“**.
- Unter **Mehr → Bilder reparieren** werden alle Karten in beiden Quellen neu geprüft.
- Ein eigenes Foto oder Bild kann weiterhin lokal gespeichert werden.
- Daten aus V1 bis V5 werden automatisch übernommen.

## Update auf GitHub Pages

1. In der bisherigen App unter **Mehr → Datensicherung → Exportieren** ein Backup erstellen.
2. `binderdex-v6-image-fallback.zip` entpacken.
3. Im bestehenden GitHub-Repository **Add file → Upload files** öffnen.
4. Alle Dateien und den Ordner `icons` hochladen und vorhandene Dateien ersetzen.
5. **Commit changes** anklicken.
6. Die App in Safari mit `?v=6` öffnen, zum Beispiel:

   `https://DEINNAME.github.io/binderdex/?v=6`

7. Unter **Mehr** prüfen, ob **BinderDex 6.0.0** und das Abzeichen **V6** angezeigt werden.
8. Unter **Mehr → Bilder reparieren → Alle Bilder in beiden Quellen prüfen** starten.

## Eine einzelne fehlende Karte prüfen

1. Die Karte im Binder öffnen.
2. Unter dem Kartenbild auf **Bild erneut suchen** tippen.
3. BinderDex prüft TCGdex, die englische Vergleichskarte und anschließend die zweite Bilddatenbank.
4. Wird kein automatischer Treffer gefunden, kann über **Eigenes Bild wählen** ein Foto aufgenommen oder aus der Fotomediathek gewählt werden.

## Falls weiterhin Version 5 erscheint

1. Zuerst ein Backup exportieren.
2. BinderDex vom Home-Bildschirm entfernen.
3. Unter **Einstellungen → Apps → Safari → Erweitert → Website-Daten** den Eintrag der eigenen `github.io`-Adresse löschen.
4. Die Seite erneut mit `?v=6` öffnen.
5. Wieder über Safari zum Home-Bildschirm hinzufügen.

## Technischer Hinweis

Einige japanische Karten oder Sonderkarten besitzen in keiner öffentlichen Datenbank einen passenden Scan. In diesem Fall kann keine automatische Quelle ein Bild liefern. Dafür bleibt die lokale Fotoauswahl als zuverlässiger letzter Weg verfügbar.

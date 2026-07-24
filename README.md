# BinderDex 8.0.0 – Cardmarket-Bilder und deutsche Japanisch-Suche

BinderDex 8 behebt drei konkrete Probleme:

1. Cardmarket-S3-Bildlinks werden nicht mehr wegen des Browser-Schutzes sofort abgelehnt.
2. Im Reiter **Japanisch** können deutsche Pokémon-Namen eingegeben werden.
3. Der aktive Sprachreiter ist auf dem iPhone eindeutig erkennbar.

## 1. Cardmarket-Bildlink verwenden

Beispiel:

```text
https://product-images.s3.cardmarket.com/51/MEP/875187/875187.jpg
```

Vorgehen:

1. Eine gespeicherte Karte öffnen.
2. Zum Bereich **Eigenes Kartenbild per Link** scrollen.
3. Den direkten Bildlink einfügen.
4. **Link testen & speichern** antippen.

Cardmarket kann solche Bilder beim direkten Einbetten blockieren. BinderDex erkennt den Host automatisch und probiert in dieser Reihenfolge:

1. `wsrv.nl` als Bild-Cache/Proxy
2. `images.weserv.nl` als zweite Proxy-Adresse
3. den originalen Cardmarket-Bildlink
4. anschließend die bisherigen automatischen Bildquellen

In den Kartendaten wird immer nur der originale Link gespeichert. Er bleibt sichtbar, bearbeitbar und kann wieder entfernt werden.

Bei einem Cardmarket-S3-Link wird der Link auch dann gespeichert, wenn Cardmarket den Testaufruf blockiert. Dadurch erscheint nicht mehr die bisherige Fehlermeldung, die das Speichern verhindert hat.

## 2. Japanische Karten mit deutschem Namen suchen

1. Unten **Suchen** öffnen.
2. Den Reiter **Japanisch** antippen.
3. Einen deutschen Pokémon-Namen eingeben, zum Beispiel:

```text
Glurak
Pikachu ex
Nachtara
Mewtu VSTAR
```

BinderDex übersetzt den Pokémon-Namen lokal in den japanischen Namen und fragt danach ausschließlich den japanischen Kartenbestand ab. In den Ergebnissen steht deshalb immer **JP**.

Deutsche Setkürzel und deutsche Kartennummern werden bei einer übersetzten Japanisch-Suche bewusst nicht erzwungen, da japanische Ausgaben in der Regel andere Sets und Nummern besitzen. Eine japanische Set-ID oder japanische Kartennummer kann weiterhin direkt gesucht werden.

Die lokale Übersetzungstabelle enthält über 1.000 deutsche und japanische Pokémon-Namen und benötigt keinen zusätzlichen Übersetzungsdienst.

## 3. Deutlicher Sprachwechsel

- **Deutsch aktiv:** blauer Reiter
- **Japanisch aktiv:** roter Reiter
- Nur der tatsächlich gewählte Reiter besitzt die aktive Hervorhebung.
- Der Hinweis unter dem Suchfeld nennt zusätzlich die aktive Sprache und gegebenenfalls den übersetzten Namen.

## Update auf GitHub Pages

1. In der alten App unter **Mehr → Datensicherung → Exportieren** ein Backup erstellen.
2. `binderdex-v8-cardmarket-japan.zip` entpacken.
3. Das bestehende GitHub-Repository öffnen.
4. **Add file → Upload files** auswählen.
5. Den vollständigen Inhalt des entpackten Ordners hochladen.
6. Vorhandene Dateien ersetzen.
7. **Commit changes** auswählen.
8. Danach die App in Safari mit folgender Ergänzung öffnen:

```text
https://DEINNAME.github.io/binderdex/?v=8
```

Unter **Mehr** muss stehen:

```text
BinderDex 8.0.0
V8
```

## Neue Datei nicht vergessen

V8 enthält zusätzlich:

```text
pokemon-names.js
```

Diese Datei muss zusammen mit `index.html`, `app.js`, `styles.css`, `service-worker.js`, `manifest.json` und dem Ordner `icons` hochgeladen werden. Fehlt sie, funktioniert die deutsche Namensübersetzung im Japanisch-Reiter nicht.

## Falls weiterhin V7 erscheint

1. Zuerst ein Backup exportieren.
2. BinderDex vom Home-Bildschirm entfernen.
3. **Einstellungen → Apps → Safari → Erweitert → Website-Daten** öffnen.
4. Den Eintrag der eigenen `github.io`-Adresse löschen.
5. Die Seite mit `?v=8` neu in Safari öffnen.
6. Über **Teilen → Zum Home-Bildschirm** erneut hinzufügen.

## Datensicherheit

Die Sammlung wird weiterhin lokal auf dem Gerät gespeichert. Bestehende V7-Daten werden beim ersten Start automatisch nach V8 übernommen.

Eigene Cardmarket-Bildlinks werden an einen externen Bild-Proxy übermittelt, damit dieser das Bild zwischenspeichern und ausliefern kann. Dabei wird nur die öffentliche Bildadresse übertragen, nicht deine Sammlung oder deine Notizen.

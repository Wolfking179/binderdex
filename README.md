# BinderDex 2 – privater 3×3-Kartenbinder

BinderDex ist eine kostenlose, installierbare Web-App (PWA) für das iPhone. Die Sammlung bleibt lokal auf dem Gerät und benötigt weder Login noch Server-Datenbank.

## Neue Funktionen in Version 2

- Echter Binder mit 3×3 Fächern pro Seite
- Blättern per Wischgeste oder Seitentasten
- Karten per Finger verschieben und tauschen
- Alternativ: Karte antippen, Seite wechseln und Zielfach antippen
- Neue Karten werden nur auf Deutsch oder Japanisch angelegt
- Englische Vergleichskarte wird nach Möglichkeit automatisch verknüpft
- Deutsch/Japanisch und Englisch werden gleichzeitig in der Detailansicht verglichen
- Suche nach Name, Kartennummer und Setkürzel, z. B. `Pikachu 58 base1` oder `Glurak 199 OBF`
- Cursor bleibt während der automatischen Suche an der richtigen Position
- Cardmarket-Link wird automatisch als präzise Suche angelegt
- Jeder Cardmarket-Link kann manuell überschrieben und gespeichert werden
- Lesbarkeit und Bedienflächen für große iPhones wie das iPhone 15 Pro Max optimiert
- Bestehende BinderDex-1-Daten werden automatisch übernommen

## Preis- und Linkhinweis

Die Karten- und Cardmarket-Preisdaten kommen über die kostenlose TCGdex-API. TCGdex liefert Marktpreise, aber derzeit nicht für jede Kartenvariante einen garantiert korrekten direkten Cardmarket-Produktlink. BinderDex erzeugt deshalb automatisch einen Cardmarket-Suchlink aus Kartenname, Kartennummer, Set und Sprache. Stimmt das Ergebnis nicht, kann der Link in der Detailansicht manuell ersetzt und gespeichert werden.

Bei deutschen Karten lässt sich die englische Ausgabe meistens über dieselbe Karten-ID automatisch finden. Japanische Sets unterscheiden sich teilweise von internationalen Sets; dann kann die englische Vergleichskarte manuell ausgewählt werden.

## Kostenlos veröffentlichen und aktualisieren

1. Entpacke das ZIP.
2. Lade **alle Dateien aus dem Ordner** in dein bestehendes öffentliches GitHub-Repository hoch.
3. Ersetze dabei die alten Dateien `index.html`, `styles.css`, `app.js`, `manifest.json` und `service-worker.js`.
4. Öffne anschließend deine GitHub-Pages-Adresse auf dem iPhone.
5. Schließe BinderDex einmal vollständig und öffne es erneut. Der neue Service Worker ersetzt dann die alte Version.
6. Falls weiterhin die alte Ansicht erscheint: Safari → Einstellungen → Apps → Safari → Erweitert → Website-Daten → nach deiner GitHub-Adresse suchen und nur diesen Eintrag löschen. Danach die Seite erneut öffnen und wieder zum Home-Bildschirm hinzufügen.

## Installation auf dem iPhone

1. Veröffentlichte GitHub-Pages-Adresse in Safari öffnen.
2. Teilen-Symbol antippen.
3. **Zum Home-Bildschirm** auswählen.
4. **Als Web-App öffnen** aktivieren.
5. **Hinzufügen** antippen.

## Datensicherung

Die Sammlung liegt in `localStorage`. Unter **Mehr → Datensicherung → Exportieren** lässt sich eine JSON-Datei sichern. Vor größeren Updates empfiehlt sich immer ein Export.

## Projektdateien

- `index.html` – Grundstruktur
- `styles.css` – 3×3-Binder und iPhone-Oberfläche
- `app.js` – Suche, Sprachvergleich, Kartenverschiebung, Preise und Datensicherung
- `manifest.json` – Installationsinformationen
- `service-worker.js` – Offline-Cache und Update-Version
- `icons/` – App-Symbole

BinderDex ist ein inoffizielles privates Sammlerprojekt und steht nicht in Verbindung mit Nintendo, The Pokémon Company oder Cardmarket.

# BinderDex 9.0.0

## Neu in V9

- Flohmarktmodus mit großen Preisen und schneller Mengenänderung
- Verkaufshistorie mit Datum, Menge, Erlös sowie Gewinn/Verlust
- Tauschliste
- Sammlungsstatistik mit Wert, Kaufkosten, Verkaufserlös, Sprachen und Top-Karten
- Japanische Karten verwenden keinen englischen Ersatzpreis mehr
- Cardmarket-Link für japanische Karten wird automatisch mit `language=7` und `minCondition=2` geöffnet
- Best-Effort-Abfrage der gefilterten Cardmarket-Produktseite
- Manueller JP-NM-Preis als zuverlässiger Fallback

## Japanische Preise

Für eine automatische Abfrage braucht die Karte einen direkten Cardmarket-Produktlink mit `/Pokemon/Products/Singles/` im Pfad. Suchseiten reichen nicht aus. BinderDex ergänzt beim Öffnen und Auslesen automatisch die Filter:

- `language=7` – Japanisch
- `minCondition=2` – Near Mint oder besser

Cardmarket stellt die offizielle API nicht allgemein für private kostenlose Apps bereit. Deshalb ist die automatische Abfrage eine Best-Effort-Funktion. Falls Cardmarket oder der Reader-Proxy die Seite blockiert, kann der aktuelle JP-NM-Preis manuell gespeichert werden.

## Update über GitHub Pages

1. In der alten App unter **Mehr → Exportieren** ein Backup erstellen.
2. Den Inhalt dieses Ordners direkt in das Hauptverzeichnis des bestehenden GitHub-Repositories hochladen.
3. Vorhandene Dateien ersetzen und committen.
4. Die Seite mit `?v=9` öffnen.
5. Unter **Mehr** kontrollieren, dass **BinderDex 9.0.0 / V9** angezeigt wird.

Persönliche Daten bleiben lokal auf dem iPhone gespeichert.

# BinderDex 4 – Preis-Hotfix

BinderDex 4 behebt den Fehler, durch den nicht verfügbare Preisfelder als **0,00 €** erschienen und dadurch der englische Referenzpreis nicht verwendet wurde.

## Neu in Version 4.0.0

- Nur **positive** Cardmarket-Werte gelten als echte Marktpreise.
- `0`, leere Werte und ungültige Zahlen werden als **nicht verfügbar** behandelt.
- Fehlt der Preis der deutschen oder japanischen Ausgabe, verwendet BinderDex automatisch die verknüpfte englische Ausgabe als klar gekennzeichneten **EN-Referenzpreis**.
- Trendpreise nutzen nacheinander sinnvolle positive Ersatzfelder wie 7-Tage-, 30-Tage-, Durchschnitts- und Niedrigpreis.
- Alte gespeicherte Nullwerte werden beim ersten Start bereinigt.
- Karten ohne positiven Preis werden nach dem Update einmal automatisch neu geladen.
- Unter **Mehr → Preise reparieren** kann die Prüfung jederzeit erneut gestartet werden.
- Die Binder- und Wunschlisten-Gesamtsumme zeigt bei vollständig fehlenden Preisen `–` statt `0,00 €`.
- Der Cache wurde auf Version 4 umgestellt, damit alte Preisantworten aus BinderDex 3 entfernt werden.

## Wichtige Einschränkung

TCGdex liefert nicht für jede Karte Cardmarket-Daten. Wenn nach der Reparatur `–` oder „Kein Marktpreis verfügbar“ erscheint, ist für die konkrete Ausgabe aktuell kein positiver Cardmarket-Wert in der Datenquelle vorhanden. Das ist ehrlicher als ein falscher Preis von 0,00 €.

## Bestehende Daten

BinderDex 4 übernimmt automatisch Daten aus:

- `binderdex-data-v3`
- `binderdex-data-v2`
- `binderdex-data-v1`

Vor dem Update trotzdem unter **Mehr → Datensicherung → Exportieren** eine Sicherung erstellen.

## Update auf GitHub Pages

1. Das ZIP entpacken.
2. Im bestehenden GitHub-Repository **Add file → Upload files** öffnen.
3. Den Inhalt des entpackten Ordners hochladen.
4. Diese vorhandenen Dateien ersetzen:
   - `index.html`
   - `app.js`
   - `styles.css`
   - `manifest.json`
   - `service-worker.js`
   - `README.md`
   - Ordner `icons`
5. **Commit changes** wählen.
6. Die GitHub-Pages-Adresse anschließend in Safari mit `?v=4` öffnen:

   `https://BENUTZERNAME.github.io/binderdex/?v=4`

7. Unter **Mehr** muss **BinderDex 4.0.0** stehen.
8. Beim ersten Start lässt BinderDex automatisch eine Preisreparatur laufen. Die App dabei geöffnet und online lassen.

## Falls weiterhin Version 3 geladen wird

1. Zuerst in BinderDex ein Backup exportieren.
2. BinderDex vom Home-Bildschirm entfernen.
3. **Einstellungen → Apps → Safari → Erweitert → Website-Daten** öffnen.
4. Den Eintrag der eigenen `github.io`-Adresse löschen.
5. Die Seite mit `?v=4` erneut in Safari öffnen.
6. Über **Teilen → Zum Home-Bildschirm** wieder installieren.

Das Löschen der Website-Daten entfernt lokale App-Daten. Deshalb vorher unbedingt exportieren.

## Projektdateien

- `index.html` – App-Grundstruktur
- `styles.css` – iPhone-Oberfläche und 3×3-Binder
- `app.js` – Suche, Preise, Cardmarket-Links und lokale Daten
- `manifest.json` – Installationsinformationen
- `service-worker.js` – Offline-, Bild- und API-Cache
- `icons/` – App-Symbole und Karten-Platzhalter

BinderDex ist ein inoffizielles privates Sammlerprojekt und steht nicht in Verbindung mit Nintendo, The Pokémon Company, TCGdex oder Cardmarket.

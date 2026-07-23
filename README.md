# BinderDex 3 – Performance- und Suchupdate

BinderDex ist eine kostenlose, privat nutzbare iPhone-Web-App (PWA) für den eigenen Pokémon-Kartenbinder und die Wunschliste. Die Sammlung, Notizen und manuell gespeicherten Links bleiben lokal auf dem Gerät.

## Neu in Version 3.0.0

### Schnellere Suche

- Die Trefferliste nutzt zunächst die kleinen Kartendaten der TCGdex-Suche.
- Vollständige Kartendaten werden erst beim Öffnen eines Treffers geladen.
- Setinformationen und bereits geladene Karten werden zwischengespeichert.
- Die Suche aktualisiert nur die Trefferliste; das Eingabefeld wird nicht neu aufgebaut und der Cursor springt nicht mehr an den Anfang.

### Setkürzel und Kartennummer in beliebiger Reihenfolge

Diese Eingaben werden gleich behandelt:

- `OBF 199`
- `199 OBF`
- `Glurak 199 OBF`
- `OBF 199 Glurak`
- `OBF199`
- `SVP088`

Unterstützt werden außerdem TCGdex-Set-IDs wie `sv03 199`. Häufige internationale Setkürzel von Base Set bis zu aktuellen Scarlet-&-Violet-Sets sind hinterlegt.

### Robustere Kartenbilder

Für jedes Kartenbild probiert BinderDex automatisch mehrere von TCGdex unterstützte Varianten:

1. WebP in der gewünschten Auflösung
2. PNG in der gewünschten Auflösung
3. WebP in der alternativen Auflösung
4. PNG in der alternativen Auflösung
5. lokaler Karten-Platzhalter

Bilder und API-Antworten werden durch den Service Worker begrenzt zwischengespeichert, damit bereits geladene Karten schneller erneut erscheinen.

### Ehrlichere und robustere Preise

- Fehlende Preiswerte werden als `–` beziehungsweise „Kein Marktpreis verfügbar“ angezeigt, nicht mehr fälschlich als `0,00 €`.
- Normal-, Holo- und Reverse-Holo-Auswahl wird bei der Preisermittlung berücksichtigt.
- Falls für die deutsche oder japanische Ausgabe kein Marktpreis vorliegt, kann der verknüpfte englische Preis deutlich gekennzeichnet als Referenzwert angezeigt werden.
- Beim Aktualisieren verhindert ein einzelner fehlerhafter Datensatz nicht mehr die Aktualisierung aller anderen Sprachversionen.

### Verbesserte Cardmarket-Links

Cardmarket findet eine Karte über den Namen meist zuverlässiger als über eine reine Kombination aus Setkürzel und Nummer. Deshalb:

- Die normale automatische Cardmarket-Schaltfläche verwendet den Kartennamen.
- Bei japanischen Karten wird nach Möglichkeit der Name der verknüpften englischen Karte verwendet.
- „Exakten Treffer suchen“ verwendet zusätzlich Kartenname, Setname, Setkürzel und Kartennummer für eine gezielte Suche nach einer Cardmarket-Produktseite.
- Ein gefundener direkter Produktlink kann weiterhin manuell eingetragen und dauerhaft gespeichert werden.
- Manuell gespeicherte Links werden bei Updates nicht überschrieben.

Ein garantiert korrekter Direktlink lässt sich nicht aus jedem TCGdex-Datensatz berechnen, weil nicht für jede Karte eine stabile Cardmarket-Produkt-ID oder direkte URL bereitsteht und Cardmarket-Produktpfade zusätzliche Variantenkennzeichen enthalten können.

## Bestehende Daten

BinderDex 3 übernimmt automatisch Daten aus:

- `binderdex-data-v2`
- `binderdex-data-v1`

Vor dem Update trotzdem unter **Mehr → Datensicherung → Exportieren** eine Sicherung erstellen.

## Update auf GitHub Pages

1. Dieses ZIP entpacken.
2. Im bestehenden GitHub-Repository **Add file → Upload files** öffnen.
3. Den **Inhalt** des entpackten Ordners hochladen, nicht den übergeordneten Ordner.
4. Vorhandene Dateien ersetzen:
   - `index.html`
   - `app.js`
   - `styles.css`
   - `manifest.json`
   - `service-worker.js`
   - `README.md`
   - Ordner `icons`
5. **Commit changes** wählen.
6. Nach erfolgreichem GitHub-Pages-Deployment die Seite einmal mit `?v=3` öffnen, beispielsweise:
   `https://BENUTZERNAME.github.io/binderdex/?v=3`
7. In BinderDex unter **Mehr** prüfen, ob **BinderDex 3.0.0** angezeigt wird.

Falls weiterhin eine ältere Version erscheint:

1. BinderDex vom Home-Bildschirm entfernen.
2. Auf dem iPhone **Einstellungen → Apps → Safari → Erweitert → Website-Daten** öffnen.
3. Nur den Eintrag der eigenen GitHub-Pages-Adresse löschen.
4. Die Adresse in Safari erneut öffnen und wieder **Zum Home-Bildschirm** hinzufügen.

Achtung: Das Löschen der Website-Daten entfernt auch lokal gespeicherte BinderDex-Daten. Deshalb vorher exportieren.

## Installation auf dem iPhone

1. GitHub-Pages-Adresse in Safari öffnen.
2. Teilen-Symbol antippen.
3. **Zum Home-Bildschirm** auswählen.
4. **Als Web-App öffnen** aktivieren.
5. **Hinzufügen** antippen.

## Projektdateien

- `index.html` – App-Grundstruktur
- `styles.css` – iPhone-Oberfläche und 3×3-Binder
- `app.js` – Suche, Bilder, Preise, Cardmarket-Links und lokale Daten
- `manifest.json` – Installationsinformationen
- `service-worker.js` – Offline-, Bild- und API-Cache
- `icons/` – App-Symbole und lokaler Karten-Platzhalter

BinderDex ist ein inoffizielles privates Sammlerprojekt und steht nicht in Verbindung mit Nintendo, The Pokémon Company, TCGdex oder Cardmarket.

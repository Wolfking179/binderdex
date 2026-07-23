# BinderDex – privater Kartenbinder

BinderDex ist eine installierbare Web-App (PWA) für iPhone und andere moderne Browser. Sie verwaltet einen persönlichen Kartenbinder und eine Wunschliste, sucht Pokémon-Karten über TCGdex und speichert Cardmarket-Marktpreise sowie eigene Cardmarket-Links.

## Enthaltene Funktionen

- Binder und Wunschliste
- Kartensuche auf Deutsch, Englisch und Japanisch
- Mehrere Sprachversionen in einem Karteneintrag verknüpfen
- Cardmarket-Trend-, Niedrig-, 7-Tage- und 30-Tage-Preis
- Eigener Cardmarket-Link je Sprachversion
- Menge, Zustand, Holo/Normal, Kaufpreis und Notizen
- Gesamtwert des Binders
- Offline-Nutzung bereits geladener Inhalte
- JSON-Export und -Import als Datensicherung
- Keine Anmeldung und keine Datenbank: persönliche Daten bleiben im Browser

## Wichtig zu den Preisen

Die Kartensuche und verfügbaren Cardmarket-Marktdaten werden über die kostenlose TCGdex-API geladen. Die App zeigt separate Preise, wenn du für Deutsch, Englisch und Japanisch jeweils die passende Ausgabe verknüpfst. Manche alten oder japanischen Ausgaben sind nicht eindeutig zugeordnet; deshalb lässt sich jede Ausgabe manuell auswählen und ihr Cardmarket-Link separat speichern.

## Kostenlos veröffentlichen

Eine PWA muss über HTTPS erreichbar sein, damit sie auf dem iPhone installiert werden kann. Lade den gesamten Ordner unverändert zu einem kostenlosen Static-Hosting-Dienst hoch, zum Beispiel GitHub Pages, Cloudflare Pages oder Netlify.

### Einfacher Ablauf

1. Veröffentliche den kompletten Ordner `binderdex` auf einem HTTPS-Host.
2. Öffne die erhaltene URL auf dem iPhone in Safari.
3. Tippe auf **Teilen**.
4. Wähle **Zum Home-Bildschirm**.
5. Bestätige mit **Hinzufügen**.

Danach erscheint BinderDex wie eine App auf dem Home-Bildschirm.

## Lokal testen

Ein Service Worker funktioniert nicht zuverlässig beim direkten Öffnen der Datei. Starte stattdessen im Ordner einen kleinen lokalen Webserver:

```bash
python3 -m http.server 8080
```

Öffne anschließend `http://localhost:8080`.

## Datensicherheit

Die Sammlung liegt in `localStorage` des verwendeten Browsers. Browserdaten löschen oder die Website-Daten entfernen löscht auch die Sammlung. Nutze unter **Mehr → Datensicherung** regelmäßig **Exportieren**.

Die veröffentlichte App-URL kann grundsätzlich von anderen Personen geöffnet werden. Deine Sammlung, Notizen und Links werden dadurch nicht geteilt, weil sie nur lokal auf deinem Gerät gespeichert werden. Für einen echten Login oder eine serverseitige Synchronisierung wäre ein Backend nötig.

## Projektdateien

- `index.html` – Grundstruktur
- `styles.css` – Oberfläche und iPhone-Layout
- `app.js` – Binder, Wunschliste, Suche, Preise und Datensicherung
- `manifest.json` – Installationsinformationen
- `service-worker.js` – Offline-Cache
- `icons/` – App-Symbole

## Hinweis

BinderDex ist ein inoffizielles privates Sammlerprojekt und steht nicht in Verbindung mit Nintendo, The Pokémon Company oder Cardmarket. Kartenbilder und Marktdaten werden über TCGdex bereitgestellt.

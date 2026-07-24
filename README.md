# BinderDex 5.0.0 – Bild-Update

Diese Version behebt die häufigsten Ursachen für fehlende oder langsam ladende Kartenbilder auf dem iPhone.

## Neu in Version 5

- Direkter Bildabruf über Safari statt zusätzlichem Service-Worker-Proxy
- Vier automatische TCGdex-Bildvarianten pro Karte:
  - low.webp
  - low.png
  - high.webp
  - high.png
- Vollständige Bild-URLs werden automatisch auf alle Qualitätsvarianten zurückgeführt
- Fehlende deutsche Bilder verwenden nach Möglichkeit das passende englische Bild
- Japanische Karten verwenden nach Möglichkeit das Bild der verknüpften englischen Vergleichskarte
- Fehlende Suchbilder werden im Hintergrund noch einmal über die Kartendetails geprüft
- Unter **Mehr → Bilder reparieren** können alle gespeicherten Karten erneut geprüft werden
- In den Kartendetails kann ein eigenes Foto oder Bild ausgewählt werden
- Eigene Bilder werden komprimiert und lokal auf dem Gerät gespeichert
- Gesamtexporte enthalten nun auch eigene Kartenbilder
- Alte BinderDex-Daten aus V1 bis V4 werden automatisch übernommen

## Update auf GitHub Pages

1. In der bisherigen App unter **Mehr → Datensicherung → Exportieren** ein Backup erstellen.
2. `binderdex-v5-images.zip` entpacken.
3. Im bestehenden GitHub-Repository **Add file → Upload files** öffnen.
4. Alle Dateien und den Ordner `icons` hochladen und vorhandene Dateien ersetzen.
5. **Commit changes** anklicken.
6. Die App in Safari mit `?v=5` öffnen, zum Beispiel:

   `https://DEINNAME.github.io/binderdex/?v=5`

7. Unter **Mehr** prüfen, ob **BinderDex 5.0.0** angezeigt wird.
8. Unter **Mehr → Bilder reparieren → Alle Bilder neu prüfen** starten.

## Falls weiterhin die alte Version angezeigt wird

1. Zuerst ein Backup exportieren.
2. BinderDex vom Home-Bildschirm entfernen.
3. Unter **Einstellungen → Apps → Safari → Erweitert → Website-Daten** den Eintrag der eigenen `github.io`-Adresse löschen.
4. Die Seite erneut mit `?v=5` öffnen.
5. Wieder über Safari zum Home-Bildschirm hinzufügen.

## Eigene Kartenbilder

Wenn TCGdex für eine Karte keinen Scan besitzt:

1. Karte in BinderDex öffnen.
2. Unter dem Kartenbild auf **Eigenes Bild wählen** tippen.
3. Ein Foto aufnehmen oder aus der Fotomediathek auswählen.
4. BinderDex verkleinert das Bild automatisch und speichert es lokal.

Eigene Bilder erscheinen danach im Binder, in der Wunschliste und in der Detailansicht. Sie werden beim Gesamtexport mitgesichert.

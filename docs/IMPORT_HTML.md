# HTML Import (Confluence / Wiki)

## Unterstützte Quellen

Der HTML Import verarbeitet lokal gespeicherte HTML-Dateien aus Wikis und Dokumentationssystemen:

- **Confluence**: Seite als HTML exportieren (Seite öffnen > Weitere Aktionen > Exportieren > HTML)
- **MediaWiki / DokuWiki / Notion**: Seitenexport als HTML-Datei
- **Intranet-Seiten** oder beliebige HTML-Dokumente

Dateiendungen: `.html`, `.htm`

## Was extrahiert wird

- Fließtext, Absätze und Überschriften
- Listen (ungeordnet und geordnet) als Aufzählung mit `-`
- Zeilenumbrüche an Absatz-, Abschnitts- und Tabellenzeilen-Grenzen
- HTML-Entities werden dekodiert (`&amp;`, `&lt;`, `&gt;`, `&quot;` usw.)

Der Extraktor bevorzugt den Hauptinhalt der Seite (`#main-content`, `#content`, `article`, `main`) vor dem gesamten Body, um Navigation und Sidebars zu reduzieren.

## Limitierungen

- **Tabellen**: Werden nicht als Tabellen erhalten, Zellinhalte erscheinen als Fließtext.
- **Layouts / Spalten**: Spalten-Layouts werden linearisiert.
- **Bilder und Anhänge**: Nicht übernommen, nur der Alt-Text wenn vorhanden.
- **JavaScript-generierter Inhalt**: Wird nicht ausgeführt; nur statisches HTML wird verarbeitet.
- **Sehr navigations-lastige Seiten**: Können wenig Nutzinhalt liefern – eine Warnung wird angezeigt.
- Kein perfekter Layout-Erhalt, aber gute Lesbarkeit für AI-Prompts.

## Ausgabe im AI-Tab

Der extrahierte Text wird direkt in das Quelltextfeld übernommen und kann als Basis für AI-Prompts genutzt werden. Das Evidence-Label wird automatisch auf `HTML: <Dateiname>` gesetzt.

Im `cases`-Modus wird der Inhalt als `FALL N` mit `---` Separator eingefügt (identisches Verhalten wie bei anderen Dateiformaten).

## Offline-Hinweis

Der gesamte Import läuft lokal im Browser. Es werden keine Daten an externe Server übertragen. Die HTML-Datei verlässt das Gerät nicht.

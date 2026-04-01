# HTML ZIP Bundle Import (Confluence / Wiki Export)

## Wie man einen Confluence- oder Wiki-Export als ZIP erstellt

**Confluence:**
1. Space-Einstellungen öffnen
2. „Space exportieren" wählen
3. Format „HTML" auswählen
4. ZIP-Datei herunterladen

**Andere Wikis (z. B. Notion, Outline, Gitea-Wiki):**
- Export-Funktion der jeweiligen Plattform nutzen (HTML-Export als ZIP)

---

## Was wird importiert

- Alle `.html`- und `.htm`-Dateien im ZIP werden zu lesbarem Text bereinigt (Tags entfernt, Struktur erhalten).
- Seiteninhalt wird über bekannte Selektoren erkannt (`#main-content`, `#content`, `article`, `main`, `body`).
- Skript- und Style-Elemente werden entfernt.
- Confluence-typische Unterverzeichnisse `/pages/` werden bevorzugt; falls vorhanden, werden nur diese Seiten importiert.
- Pfade mit `/attachments/`, `/images/` und `/static/` werden ignoriert.

---

## Capture-Modi

| Modus | Verhalten |
|---|---|
| **artifact** | Alle Seiten als ein zusammenhängender Text mit `=== PAGE: ... ===` Trennern |
| **case** | Nur die erste Seite als `FALL 1` |
| **cases** | Jede Seite als eigener `FALL N` (fortlaufend numeriert), getrennt durch `---` |

---

## Limitierungen

- **Maximale Seitenanzahl:** 25 (konfigurierbar über `maxPages`)
- **Maximale Zeichenanzahl pro Seite:** 8.000 (konfigurierbar über `maxCharsPerPage`)
- **Layout:** Nur der Textinhalt wird extrahiert; Tabellen, Bilder und Formatierungen gehen verloren.
- **Anhänge/Bilder:** Werden nicht importiert.
- **Keine OCR:** Seiten, die ausschließlich aus Bildern bestehen, ergeben keinen Text.
- **Navigation/Wrapper:** Seitenleisten und Navigationselemente können mitextrahiert werden, wenn kein Hauptinhalt-Selektor greift (Warnung wird angezeigt).

---

## Offline-Hinweis

Der Import erfolgt vollständig lokal im Browser. Es werden keine Daten an externe Server gesendet.

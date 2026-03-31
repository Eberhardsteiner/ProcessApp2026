# Exportpaket (Deliverables)

## Überblick

Das Exportpaket ist eine ZIP-Datei, die alle relevanten Deliverables eines Prozesses enthält. Es ist gedacht für:

- **IT-Teams und Automatisierung**: BPMN-Datei und strukturierte CSVs für Implementierung
- **Ablage und Archivierung**: Vollständige Dokumentation in maschinenlesbaren Formaten
- **Austausch mit Dritten**: Standardformate ohne Zugriff auf die Anwendung erforderlich

## Inhalt des Exportpakets

Das ZIP-Paket enthält folgende Ordnerstruktur:

```
Prozessname__export__001__20260211/
├── README.md
├── bundle/
│   └── process_bundle.json
├── bpmn/
│   ├── process.bpmn
│   └── warnings.txt (falls vorhanden)
├── csv/
│   ├── happy_path.csv
│   ├── katalog_rollen.csv
│   ├── katalog_systeme.csv
│   ├── katalog_datenobjekte.csv
│   ├── katalog_kpis.csv
│   └── massnahmen.csv
├── workshop/
│   └── workshop_summary.txt
└── report/
    ├── process_report.md
    └── process_report.html
```

### Dateibeschreibung

#### bundle/process_bundle.json
- Vollständiges JSON-Bundle mit allen Prozessdaten und Versionen
- Kann in der Anwendung im Setup-Tab re-importiert werden
- Enthält: Prozess-Metadaten, alle Versionen, Capture-Daten, Kataloge, Maßnahmen

#### bpmn/process.bpmn
- BPMN 2.0 XML-Datei, frisch aus dem aktuellen Draft generiert
- Kann in BPMN-Editoren wie Camunda Modeler geöffnet werden
- Enthält: Happy Path, Entscheidungen, Ausnahmen, Lanes (Rollen)
- **Wichtig**: BPMN wird beim Export neu generiert, nicht aus der Datenbank geladen

#### bpmn/warnings.txt
- Liste der Warnungen bei der BPMN-Generierung
- Nur vorhanden, wenn Warnungen aufgetreten sind
- Typische Warnungen:
  - Fehlende Rollen in Schritten
  - Timeout-Events nutzen Default-Wert PT1H
  - Unvollständige Entscheidungen

#### csv/happy_path.csv
Spalten: `order`, `label`, `role`, `system`, `workType`, `processingTime`, `waitingTime`, `volume`, `rework`, `painPointHint`, `toBeHint`
- Schritte des Happy Path in sequenzieller Reihenfolge
- Rollen und Systeme als Namen (nicht IDs)
- Kennzahlen-Buckets (processingTime, waitingTime, volume, rework) als Keys (z.B. `minutes`, `low`)
- Excel-freundlich mit UTF-8 BOM und `sep=;`

#### csv/katalog_rollen.csv
Spalten: `name`, `kind`, `aliases`
- Alle Rollen im Prozess
- Kind: person, role, org_unit, system
- Aliases: Alternative Bezeichnungen (getrennt durch ` | `)

#### csv/katalog_systeme.csv
Spalten: `name`, `systemType`, `aliases`
- Alle IT-Systeme im Prozess
- systemType ist optional
- Aliases: Alternative Bezeichnungen (getrennt durch ` | `)

#### csv/katalog_datenobjekte.csv
Spalten: `name`, `kind`, `aliases`
- Alle Datenobjekte (Dokumente, Datensätze, Formulare)
- Kind: document, dataset, form, other
- Aliases: Alternative Bezeichnungen (getrennt durch ` | `)

#### csv/katalog_kpis.csv
Spalten: `name`, `definition`, `unit`, `target`, `aliases`
- Alle KPIs des Prozesses
- unit, target und aliases sind optional
- Aliases: Alternative Bezeichnungen (getrennt durch ` | `)

#### csv/massnahmen.csv
Spalten:
- `Priorität Score`, `Priorität`, `Status`, `Kategorie`, `Maßnahme`
- `Scope`, `Schritt`, `Verantwortlich`, `Fällig am`
- `Impact`, `Effort`, `Risiko`
- `Ansatz`, `Zielgrad`, `Human-in-the-loop`
- `Systeme`, `Datenobjekte`, `KPIs`, `Kontrollen`
- `Beschreibung`
- `Betroffene Fälle (%)`, `Einsparung pro Fall (Min)`, `Schätzung Notiz`
- `Erstellt am`, `Aktualisiert am`

Alle Verbesserungsmaßnahmen (Improvement Backlog) mit vollständigen Details inkl. Automatisierungs-Blueprint und Impact-Schätzungen.

#### workshop/workshop_summary.txt
- Plain-Text Zusammenfassung für Workshop-Protokolle
- Inhalt:
  - Top 10 offene Maßnahmen (sortiert nach Priorität)
  - Risiken und Compliance-Maßnahmen
  - Offene Maßnahmen gruppiert nach Verantwortlichem

#### report/process_report.md
- Vollständiger Prozessreport als Markdown
- Enthält: Prozessprofil, End-to-End Definition, Happy Path, Entscheidungen, Ausnahmen, KPIs, KI-Reife Signale, Maßnahmen-Backlog, Assessment
- Geeignet für Wiki, Repository oder Dokumentationsplattformen
- Alle Labels in deutscher Sprache (keine internen Keys)

#### report/process_report.html
- Vollständiger Prozessreport als druckfreundliches HTML
- Eigenständige Datei (offline nutzbar, keine externen Abhängigkeiten)
- Enthält integrierten Print-Button für PDF-Export über Browser
- Optimiert für Ausdruck: Saubere Seitenumbrüche, Druckvorschau-Modus
- Im Browser öffnen und "Drucken" oder "Als PDF speichern" wählen

## Verwendung

### Im Setup-Tab exportieren

1. Projekt und Prozess auswählen
2. Im Tab "Setup" nach unten scrollen
3. Unter "Export (Backup/Transfer)" den Abschnitt "Exportpaket (Deliverables)" finden
4. Button "Exportpaket (ZIP) herunterladen" klicken
5. ZIP-Datei wird heruntergeladen

### CSVs in Excel öffnen

Die CSV-Dateien sind Excel-freundlich formatiert:
- UTF-8 BOM für korrekte Umlaute
- `sep=;` Zeile am Anfang für automatische Trennzeichen-Erkennung
- Escaped Quotes und Zeilenumbrüche in Zellen

**Wichtig**: In Excel "Öffnen" verwenden, nicht "Daten importieren", damit die `sep=;` Zeile korrekt interpretiert wird.

### BPMN in Editoren öffnen

Die BPMN-Datei kann in folgenden Tools geöffnet werden:
- Camunda Modeler (empfohlen)
- bpmn.io Online Modeler
- Signavio Process Manager
- Andere BPMN 2.0 kompatible Tools

### JSON-Bundle re-importieren

Das process_bundle.json kann jederzeit wieder importiert werden:
1. Setup-Tab öffnen
2. Unter "Import (Backup/Transfer)" die JSON-Datei hochladen
3. Preview prüfen
4. "Bundle importieren" klicken
5. Ein neuer Prozess wird angelegt (bestehende Daten werden nicht überschrieben)

## Technische Details

### BPMN-Generierung

Die BPMN-Datei wird **beim Export frisch generiert**, nicht aus der Datenbank geladen. Das bedeutet:
- Der aktuelle Stand des Capture-Drafts wird verwendet
- Änderungen im Draft sind sofort im BPMN sichtbar
- Warnings werden in `warnings.txt` dokumentiert
- Die BPMN ist immer konsistent mit dem aktuellen Draft

### CSV-Format

Alle CSVs verwenden:
- Delimiter: `;` (Semikolon)
- Encoding: UTF-8 with BOM (`\ufeff`)
- Erste Zeile: `sep=;` (für Excel)
- Zweite Zeile: Header
- Quote-Character: `"` (bei Bedarf)
- Escape: `""` (doppelte Quotes)

### Dateinamen

Pattern: `{Prozessname}__export__{Version}__{Datum}.zip`
- Prozessname: Sanitized (nur a-z, A-Z, 0-9, _, -, äöüÄÖÜß)
- Version: 3-stellig mit führenden Nullen (z.B. 001)
- Datum: YYYYMMDD Format

## Anwendungsfälle

### 1. Übergabe an IT-Abteilung
- BPMN für Process Engine Import
- CSVs für Systemkonfiguration
- Maßnahmen-CSV für Aufgabenplanung

### 2. Externe Berater
- Vollständiges Paket ohne Anwendungszugriff
- Alle Informationen in Standardformaten
- Workshop-Summary für Management-Präsentation

### 3. Audit und Compliance
- Vollständige Prozessdokumentation
- Maschinenlesbar und nachvollziehbar
- Zeitstempel und Versionierung

### 4. Langzeitarchivierung
- Standardformate (JSON, XML, CSV, TXT)
- Keine proprietären Formate
- README für spätere Nachvollziehbarkeit

## Limitierungen

- BPMN basiert nur auf dem aktuellen Draft (nicht auf historischen Versionen)
- CSVs enthalten nur die aktuelle Version, nicht alle Versionen
- Für vollständigen Versionshistorie: JSON-Bundle verwenden
- Bilder/Diagramme sind nicht enthalten (nur Texte und Strukturdaten)

## Siehe auch

- [BPMN Export](./BPMN_EXPORT.md) - Details zur BPMN-Generierung
- [Export/Import](./EXPORT_IMPORT.md) - JSON-Bundle Import/Export
- [Workshop Protokoll](./WORKSHOP.md) - Workshop-Summary Details

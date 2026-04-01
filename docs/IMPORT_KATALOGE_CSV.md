# CSV-Import für Kataloge

Diese Anleitung erklärt, wie Sie Rollen, Systeme, Datenobjekte und KPIs aus CSV-Dateien importieren können.

## Empfohlener Workflow

1. **Excel-Daten vorbereiten**: Erstellen Sie eine Liste mit den gewünschten Einträgen in Excel
2. **CSV exportieren**: Speichern Sie die Datei als CSV mit Trennzeichen (Semikolon empfohlen)
3. **Katalogtyp auswählen**: Wählen Sie im Dropdown den passenden Katalogtyp (Rollen, Systeme, Datenobjekte oder KPIs)
4. **CSV importieren**: Wählen Sie die CSV-Datei aus und prüfen Sie die Vorschau
5. **Import anwenden**: Klicken Sie auf "Import anwenden", um die Einträge zu übernehmen
6. **Automatisches Speichern**: Die Änderungen werden automatisch gespeichert

## Wichtige Hinweise

- **Merge-only**: Der Import ergänzt bestehende Einträge. Vorhandene Einträge werden nicht gelöscht oder überschrieben
- **Deduplizierung**: Einträge mit identischem Namen (case-insensitive) werden übersprungen
- **Keine Löschfunktion**: Um Einträge zu entfernen, nutzen Sie die jeweiligen Editor-Funktionen
- **CSV-Format**: UTF-8 mit BOM wird empfohlen, verschiedene Trennzeichen (`;`, `,`, Tab) werden automatisch erkannt

## CSV-Struktur nach Katalogtyp

### 1. Rollen

**Pflichtfelder:**
- `name` (oder `rolle`, `role`): Name der Rolle

**Optionale Felder:**
- `kind` (oder `typ`, `art`): Art der Rolle
  - `person`: Einzelperson
  - `role`: Funktionale Rolle (Standard)
  - `org_unit`: Organisationseinheit
  - `system`: IT-System
- `aliases` (oder `alias`, `synonyms`, `synonyme`, `aka`): Alternative Bezeichnungen (getrennt durch `|` oder `,`)

**Beispiel:**
```csv
sep=;
name;kind;aliases
Sachbearbeiter;role;SB | Mitarbeiter
Teamleiter;person;TL | Lead
Vertriebsabteilung;org_unit;Vertrieb | Sales
CRM-System;system;Salesforce | SFDC
```

### 2. Systeme

**Pflichtfelder:**
- `name` (oder `system`, `applikation`, `it`): Name des Systems

**Optionale Felder:**
- `systemType` (oder `typ`, `systemtyp`): Art des Systems (z.B. ERP, CRM, DMS)
- `aliases` (oder `alias`, `synonyms`, `synonyme`, `aka`): Alternative Bezeichnungen (getrennt durch `|` oder `,`)

**Beispiel:**
```csv
sep=;
name;systemType;aliases
SAP ERP;ERP;SAP S/4HANA | S4 | SAP S4
Salesforce;CRM;SFDC | CRM-System
SharePoint;DMS;SPO | SharePoint Online
Excel;Office;MS Excel | Tabellenkalkulation
```

### 3. Datenobjekte

**Pflichtfelder:**
- `name` (oder `datenobjekt`, `dataobject`, `objekt`): Name des Datenobjekts

**Optionale Felder:**
- `kind` (oder `typ`, `art`): Art des Datenobjekts
  - `document`: Dokument
  - `dataset`: Datensatz
  - `form`: Formular
  - `other`: Sonstiges (Standard)
- `aliases` (oder `alias`, `synonyms`, `synonyme`, `aka`): Alternative Bezeichnungen (getrennt durch `|` oder `,`)

**Beispiel:**
```csv
sep=;
name;kind;aliases
Angebot;document;Offerte | Proposal
Kundenstammdaten;dataset;Kundendaten | Customer Master
Bestellformular;form;Order Form | Bestellmaske
Notizen;other;Notes | Kommentare
```

### 4. KPIs

**Pflichtfelder:**
- `name` (oder `kpi`, `kennzahl`): Name des KPI

**Optionale Felder:**
- `definition` (oder `beschreibung`): Beschreibung des KPI
- `unit` (oder `einheit`): Maßeinheit (z.B. Prozent, Euro, Stunden)
- `target` (oder `ziel`): Zielwert
- `aliases` (oder `alias`, `synonyms`, `synonyme`, `aka`): Alternative Bezeichnungen (getrennt durch `|` oder `,`)

**Beispiel:**
```csv
sep=;
name;definition;unit;target;aliases
Durchlaufzeit;Zeit von Anfrage bis Lieferung;Tage;5;Lead Time | Cycle Time
Kundenzufriedenheit;NPS-Score;Punkte;80;NPS | Customer Satisfaction
Fehlerquote;Anteil fehlerhafter Bestellungen;Prozent;2;Error Rate | Defect Rate
Kosten pro Fall;Durchschnittliche Prozesskosten;Euro;50;Cost per Case | CPCase
```

## CSV-Spaltennamen

Die Spaltennamen sind **nicht case-sensitive** und können verschiedene Schreibweisen haben:
- Leerzeichen, Bindestriche und Unterstriche werden ignoriert
- Deutsche und englische Bezeichnungen werden erkannt

**Beispiele für gültige Spaltennamen:**
- `name`, `Name`, `NAME`
- `system_type`, `systemType`, `System Typ`
- `definition`, `Definition`, `Beschreibung`

## Excel → CSV Export

### Windows/Mac Excel:
1. Datei → Speichern unter
2. Dateityp: CSV (Trennzeichen getrennt) (*.csv)
3. Optional: sep=;-Zeile manuell einfügen

### LibreOffice Calc:
1. Datei → Speichern unter
2. Dateityp: Text CSV (.csv)
3. Trennoptionen: Trennzeichen: Semikolon

### Google Sheets:
1. Datei → Herunterladen → Kommagetrennte Werte (.csv)
2. Hinweis: Verwendet Komma als Trennzeichen (wird automatisch erkannt)

## Alias-Spalte und Synonyme

Die optionale `aliases`-Spalte ermöglicht es, alternative Bezeichnungen für Katalogeinträge zu definieren:

- **Format**: Mehrere Aliases können durch `|` (Pipe), `,` (Komma) oder Zeilenumbruch getrennt werden
- **Deduplizierung**: Aliases, die dem Hauptnamen entsprechen (case/whitespace-insensitiv), werden automatisch entfernt
- **Mapping**: Bei CSV-Importen (z.B. Happy Path) und AI-Imports werden Aliases automatisch auf den Haupteintrag gemappt
- **Merge**: Bestehende Einträge können um neue Aliases ergänzt werden, ohne bestehende Aliases zu löschen

**Beispiel:**
```csv
sep=;
name;systemType;aliases
SAP S/4HANA;ERP;SAP | S4 | SAP ERP | SAP S4
```

Bei einem späteren Import mit:
```csv
sep=;
name;systemType;aliases
S4;ERP;S/4 | S/4HANA
```

Wird der Eintrag "SAP S/4HANA" erkannt (weil "S4" ein Alias ist) und um die neuen Aliases "S/4" und "S/4HANA" ergänzt.

## Merge-Verhalten

Der Import arbeitet nach dem Merge-Prinzip mit Alias-Unterstützung:

- **Deduplizierung**: Einträge werden über Name **ODER** Alias identifiziert (case/whitespace-insensitiv)
- **Neue Einträge**: Werden mit neuer ID hinzugefügt, wenn weder Name noch Alias existiert
- **Bestehende Einträge**: Werden erkannt und um neue Aliases ergänzt (keine Überschreibung anderer Felder)
- **Keine Löschungen**: Bestehende Aliases werden nie gelöscht, nur neue werden hinzugefügt

**Beispiel 1 (ohne Aliases):**
```
Vorhandene Rollen: [Sachbearbeiter, Teamleiter]
CSV enthält: [Sachbearbeiter, Projektmanager]

Ergebnis: [Sachbearbeiter, Teamleiter, Projektmanager]
→ Sachbearbeiter übersprungen (bereits vorhanden)
→ Projektmanager neu hinzugefügt
```

**Beispiel 2 (mit Aliases):**
```
Vorhandene Systeme: [SAP S/4HANA (aliases: [SAP, S4])]
CSV enthält: [S4 (aliases: [S/4HANA, SAP ERP])]

Ergebnis: [SAP S/4HANA (aliases: [SAP, S4, S/4HANA, SAP ERP])]
→ S4 als Alias erkannt → Alias-Merge auf bestehenden Eintrag
→ Neue Aliases "S/4HANA" und "SAP ERP" hinzugefügt
```

## Automatische Updates

Nach dem Import werden folgende Bereiche automatisch aktualisiert:

1. **CaptureProgress**: Die entsprechenden Phase-Status werden auf "done" gesetzt:
   - Rollen → `roles` Phase
   - Systeme/Datenobjekte → `data_it` Phase
   - KPIs → `kpis` Phase

2. **lastTouchedAt**: Wird auf den aktuellen Zeitstempel gesetzt

3. **Dropdowns**: Alle Dropdowns in der App (z.B. Schrittdetails, Maßnahmeneditor) verwenden die aktualisierten Listen

## Häufige Fragen

**F: Kann ich mehrere Kataloge gleichzeitig importieren?**
A: Nein, importieren Sie jeden Katalogtyp einzeln. Wählen Sie dazu den entsprechenden Typ im Dropdown aus.

**F: Was passiert, wenn ich denselben Eintrag zweimal importiere?**
A: Der zweite Import wird übersprungen (Deduplizierung über Namen). Es entstehen keine Duplikate.

**F: Wie kann ich Einträge aktualisieren?**
A: Der Import unterstützt keine Updates. Löschen Sie den Eintrag manuell und importieren Sie ihn erneut mit den neuen Daten.

**F: Wie kann ich Einträge löschen?**
A: Nutzen Sie die Editor-Funktionen im jeweiligen Bereich (z.B. Rollen im Schritt-Editor löschen).

**F: Welche Encoding-Probleme können auftreten?**
A: Verwenden Sie UTF-8 mit BOM für beste Kompatibilität. Die meisten CSV-Exporte aus Excel verwenden dies automatisch.

**F: Kann ich XLSX-Dateien direkt importieren?**
A: Nein, nur CSV-Dateien werden unterstützt. Exportieren Sie XLSX zunächst als CSV.

## Troubleshooting

**Problem**: CSV wird nicht importiert
- Prüfen Sie, ob die Pflichtspalte vorhanden ist
- Stellen Sie sicher, dass die Datei als .csv gespeichert ist
- Öffnen Sie die CSV in einem Texteditor und prüfen Sie das Format

**Problem**: Umlaute werden falsch angezeigt
- Speichern Sie die CSV mit UTF-8 Encoding
- In Excel: Verwenden Sie "CSV UTF-8 (Trennzeichen getrennt)"

**Problem**: Alle Einträge werden übersprungen
- Die Namen existieren bereits (case-insensitive Prüfung)
- Prüfen Sie die bestehenden Einträge in der App

**Problem**: Optionale Felder werden nicht importiert
- Prüfen Sie die Schreibweise der Spaltennamen
- Stellen Sie sicher, dass die Spalten nicht leer sind

# CSV-Import für Happy Path

## Überblick

Der CSV-Import ermöglicht es, Happy Path Schritte schnell aus einer Excel-Tabelle oder anderen CSV-Quellen zu übernehmen. Dies ist besonders nützlich, wenn bereits eine Prozessdokumentation in tabellarischer Form existiert.

## Zugriff

Der CSV-Import ist im **Draft-Tab** verfügbar, direkt unterhalb der End-to-End Definition. Er steht zur Verfügung, sobald ein Prozess und eine Version ausgewählt sind.

## CSV-Datei vorbereiten

### Export aus Excel

1. Öffnen Sie Ihre Excel-Datei mit den Prozessschritten
2. Wählen Sie **Datei → Speichern unter**
3. Wählen Sie als Dateityp: **CSV (Trennzeichen-getrennt) (*.csv)**
4. Speichern Sie die Datei

**Hinweis:** Excel speichert CSV-Dateien standardmäßig mit Semikolon (`;`) als Trennzeichen in deutschsprachigen Umgebungen. Die Anwendung erkennt dies automatisch.

### Spaltenstruktur

#### Pflichtspalten

- **label** (oder: `schritt`, `bezeichnung`, `aktivitaet`, `aktivität`)
  - Die Beschreibung des Prozessschritts
  - Darf nicht leer sein

#### Optionale Spalten

- **order** (oder: `nr`, `nummer`, `reihenfolge`)
  - Numerischer Wert für die Reihenfolge
  - Falls nicht vorhanden, wird die Dateireihenfolge verwendet

- **role** (oder: `rolle`)
  - Name der ausführenden Rolle
  - Wird automatisch im Rollenkatalog angelegt, falls noch nicht vorhanden

- **system** (oder: `it`, `applikation`)
  - Name des verwendeten IT-Systems
  - Wird automatisch im Systemkatalog angelegt, falls noch nicht vorhanden

- **workType** (oder: `work_type`, `typ`)
  - Art der Arbeit
  - Erlaubte Werte:
    - `manual`, `manuell` → manuelle Tätigkeit ohne IT
    - `user_task`, `user`, `it-unterstützt` → IT-unterstützte Tätigkeit
    - `service_task`, `service`, `integration` → automatisierte Integration
    - `ai_assisted`, `ki`, `ai` → KI-unterstützte Tätigkeit
    - `unknown`, `unklar` → noch nicht klassifiziert

- **processingTime** (oder: `bearbeitungszeit`, `bearbeitungszeit_bucket`, `processing_time`)
  - Grobe Einschätzung der Bearbeitungszeit
  - Erlaubte Werte (Keys oder deutsche Labels):
    - `minutes`, `minuten` → Minuten
    - `hours`, `stunden` → Stunden
    - `1_day`, `bis 1 tag`, `1 tag` → Bis 1 Tag
    - `2_5_days`, `2 bis 5 tage`, `2-5 tage` → 2 bis 5 Tage
    - `1_2_weeks`, `1 bis 2 wochen`, `1-2 wochen` → 1 bis 2 Wochen
    - `over_2_weeks`, `mehr als 2 wochen`, `>2 wochen` → Mehr als 2 Wochen
    - `varies`, `variiert`, `variiert stark` → Variiert stark
    - `unknown`, `unbekannt` → Unbekannt

- **waitingTime** (oder: `wartezeit`, `liegezeit`, `waiting_time`)
  - Grobe Einschätzung der Warte-/Liegezeit
  - Erlaubte Werte: Wie `processingTime`

- **volume** (oder: `haeufigkeit`, `häufigkeit`, `volumen`, `frequency_step`)
  - Grobe Einschätzung des Volumens/Häufigkeit
  - Erlaubte Werte (Keys oder deutsche Labels):
    - `low`, `niedrig` → Niedrig
    - `medium`, `mittel` → Mittel
    - `high`, `hoch` → Hoch
    - `varies`, `variiert`, `variiert stark` → Variiert stark
    - `unknown`, `unbekannt` → Unbekannt

- **rework** (oder: `nacharbeit`, `rework_rate`, `rework_bucket`)
  - Grobe Einschätzung der Rework-Rate/Nacharbeit
  - Erlaubte Werte: Wie `volume`

- **painPointHint** (oder: `painpoint`, `problem`, `schmerzpunkt`)
  - Hinweise auf bestehende Probleme oder Ineffizienzen
  - Freitext

- **toBeHint** (oder: `tobe`, `to_be`, `zukunft`, `to-be`)
  - Hinweise für zukünftige Optimierungen
  - Freitext

**Hinweis:** Die Spaltenerkennung ist nicht case-sensitiv und ignoriert Unterstriche, Bindestriche und Leerzeichen. `Work_Type`, `work-type` und `WORKTYPE` werden alle erkannt.

### Beispiel-CSV

Sie können eine Vorlage über den Button "CSV-Vorlage herunterladen" in der Anwendung herunterladen. Hier ein Beispiel:

```csv
sep=;
order;label;role;system;workType;processingTime;waitingTime;volume;rework;painPointHint;toBeHint
1;Kundenanfrage erfassen;Service Agent;Ticket-System;user_task;minutes;hours;high;low;Manuelle Erfassung in mehreren Systemen;Automatische Erfassung über Webformular
2;Anfrage prüfen;Backoffice;ERP-System;user_task;hours;1_day;medium;medium;;
3;Angebot erstellen;Vertrieb;CRM;user_task;1_day;2_5_days;low;low;;
4;Angebot versenden;System;E-Mail-System;service_task;minutes;minutes;high;low;;
5;Rückmeldung einholen;Vertrieb;Telefon;manual;hours;1_2_weeks;low;high;Keine Nachverfolgung;CRM-Integration für Follow-ups
```

**Hinweis zur ersten Zeile (`sep=;`):** Dies ist eine Excel-spezifische Konvention, die das Trennzeichen explizit angibt. Die Anwendung erkennt dies automatisch. Falls Ihre CSV-Datei diese Zeile nicht enthält, wird das Trennzeichen automatisch erkannt.

## Import durchführen

### Schritt 1: CSV-Datei auswählen

1. Klicken Sie auf **"CSV-Datei auswählen"**
2. Wählen Sie Ihre vorbereitete CSV-Datei aus
3. Die Anwendung zeigt eine Vorschau der ersten 15 Zeilen

### Schritt 2: Importmodus wählen

- **Ersetzen** (Standard)
  - Alle bestehenden Happy Path Schritte werden gelöscht
  - Die Schritte aus der CSV-Datei ersetzen die bisherigen
  - **Achtung:** Neue Schritt-IDs werden erzeugt

- **Anhängen**
  - Die Schritte aus der CSV-Datei werden an die bestehenden Schritte angehängt
  - Die Reihenfolge wird fortlaufend nummeriert

### Schritt 3: Optionen festlegen

- **Rollen aus CSV anlegen/zuordnen**
  - Aktiviert: Rollen aus der CSV werden automatisch im Katalog angelegt (falls nicht vorhanden) und den Schritten zugeordnet
  - Deaktiviert: Die Rolle-Spalte wird ignoriert

- **Systeme aus CSV anlegen/zuordnen**
  - Aktiviert: Systeme aus der CSV werden automatisch im Katalog angelegt (falls nicht vorhanden) und den Schritten zugeordnet
  - Deaktiviert: Die System-Spalte wird ignoriert

### Schritt 4: Import bestätigen

1. Prüfen Sie die Vorschau
2. Bei Bedarf: Bestätigen Sie die Warnung (siehe unten)
3. Klicken Sie auf **"X Schritte importieren"**

## Wichtige Hinweise

### Warnung bei Ersetzen-Modus

Wenn Sie bereits **Decisions** oder **Exceptions** erfasst haben und den Modus **Ersetzen** wählen, werden Sie gewarnt:

> **Achtung:** Sie haben bereits Decisions oder Exceptions erfasst. Beim Ersetzen werden neue Schritt-IDs erzeugt, wodurch bestehende Verknüpfungen ungültig werden können.

Sie müssen diese Warnung mit der Checkbox bestätigen, um fortzufahren.

**Empfehlung:** Importieren Sie den Happy Path zu Beginn der Prozesserfassung, bevor Sie Decisions und Exceptions hinzufügen.

### Schritt-IDs ändern sich

Beim Import (sowohl Ersetzen als auch Anhängen) werden immer neue, eindeutige Schritt-IDs generiert. Dies bedeutet:

- Bestehende Verknüpfungen zu Decisions, Exceptions oder Improvement-Maßnahmen können ungültig werden
- Im Draft werden diese dann als "Unbekannter Schritt" angezeigt
- Sie müssen diese Verknüpfungen manuell neu zuordnen

### Rollen und Systeme

- Die Zuordnung erfolgt **case-insensitive**: "Service Agent", "service agent" und "SERVICE AGENT" werden als identisch erkannt
- Es werden keine Duplikate angelegt
- Nach dem Import können Sie die Rollen und Systeme im Draft-Tab bearbeiten oder ergänzen

### Capture Progress

Nach einem erfolgreichen Import wird der Capture Progress automatisch aktualisiert:

- Bei 5 oder mehr Schritten wird die Phase "Happy Path" als **done** markiert
- Bei weniger als 5 Schritten bleibt sie **in_progress**

## Fehlerbehebung

### "Keine Label-Spalte gefunden"

Die CSV-Datei muss eine Spalte mit dem Namen `label`, `schritt`, `bezeichnung`, `aktivitaet` oder `aktivität` enthalten. Prüfen Sie die Spaltenüberschriften in Ihrer CSV-Datei.

### "Keine gültigen Zeilen mit Label gefunden"

Alle Zeilen haben leere Label-Werte. Stellen Sie sicher, dass die Label-Spalte ausgefüllt ist.

### "CSV ist leer"

Die Datei enthält keine Daten oder nur Leerzeilen. Prüfen Sie den Dateiinhalt.

### Encoding-Probleme

Wenn Umlaute oder Sonderzeichen nicht korrekt dargestellt werden:

1. Öffnen Sie die CSV-Datei in einem Text-Editor (z.B. Notepad++)
2. Speichern Sie die Datei mit Encoding **UTF-8**
3. Importieren Sie die Datei erneut

## Best Practices

1. **Template verwenden:** Laden Sie die CSV-Vorlage herunter und füllen Sie diese aus, um sicherzustellen, dass alle Spalten korrekt benannt sind

2. **Zuerst Happy Path:** Importieren Sie den Happy Path zu Beginn der Prozesserfassung, bevor Sie Decisions und Exceptions hinzufügen

3. **Backup erstellen:** Exportieren Sie den Prozess vor einem Ersetzen-Import als Backup (Setup-Tab → Export)

4. **Anhängen für Updates:** Wenn Sie nachträglich weitere Schritte hinzufügen möchten, verwenden Sie den Anhängen-Modus

5. **Kataloge prüfen:** Nach dem Import sollten Sie die automatisch angelegten Rollen und Systeme prüfen und ggf. konsolidieren

6. **Order-Spalte nutzen:** Wenn Ihre Excel-Tabelle bereits eine Nummerierung hat, exportieren Sie diese in der Order-Spalte, um die Reihenfolge beizubehalten

## Technische Details

### Unterstützte Trennzeichen

Die Anwendung erkennt automatisch:
- Semikolon (`;`) - Standard in deutschsprachigen Excel-Versionen
- Komma (`,`) - Standard in englischsprachigen Excel-Versionen
- Tab (`\t`) - Tab-getrennte Werte

### Quote-Handling

Felder können in Anführungszeichen (`"`) gesetzt werden, um Trennzeichen innerhalb des Feldwertes zu ermöglichen:

```csv
"Schritt 1; mit Semikolon";"Rolle A"
```

Doppelte Anführungszeichen (`""`) innerhalb eines Feldes werden als einfaches Anführungszeichen interpretiert.

### Dateiformat-Kompatibilität

- Windows Zeilenenden (`\r\n`) werden unterstützt
- UTF-8 BOM wird automatisch entfernt
- Leere Zeilen werden ignoriert

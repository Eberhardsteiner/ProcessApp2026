# Process Mining Lite

## Überblick

Process Mining Lite ist ein lokales, offline-fähiges Feature zur Analyse von Event Logs. Es ermöglicht Discovery (Variantenanalyse), Conformance Checking (Abgleich gegen Happy Path) und Enhancement (Schritt-Metriken aus realen Daten).

**Wichtig:** Alle Analysen laufen lokal im Browser. Es werden keine Daten an externe Services übertragen. Die Event Logs werden vollständig in der lokalen IndexedDB gespeichert.

## Zweck

Process Mining Lite bietet drei Hauptfunktionen:

1. **Discovery:** Erkennung der häufigsten Prozessvarianten aus Event Logs
2. **Conformance:** Vergleich der tatsächlichen Abläufe mit dem modellierten Happy Path
3. **Enhancement:** Berechnung von Schritt-Metriken (Coverage, Durchlaufzeiten) aus realen Event-Daten

## Zugriff

Process Mining ist im Tab **"Process Mining"** verfügbar, sobald ein Prozess und eine Version ausgewählt sind.

## Event Log Import

### CSV-Format

Der Import erwartet eine CSV-Datei mit Event-Daten. Die Datei muss folgende Spalten enthalten:

#### Pflichtspalten

- **Case ID** (Aliases: `caseId`, `case`, `case_id`, `fall`, `fall_id`, `instance`, `trace`, `trace_id`)
  - Eindeutige Kennung für jeden Prozessfall/Case
  - Ein Case kann mehrere Events enthalten

- **Activity** (Aliases: `activity`, `aktivitaet`, `aktivität`, `event`, `task`, `step`, `aktion`)
  - Name der ausgeführten Aktivität
  - Wird später auf Happy Path Schritte gemappt

- **Timestamp** (Aliases: `timestamp`, `time`, `datetime`, `date`, `ts`, `zeit`, `zeitstempel`, `created_at`, `start_time`)
  - Zeitpunkt der Aktivität
  - Unterstützte Formate:
    - ISO 8601: `2024-02-17T14:30:00Z`
    - Deutsches Format: `17.02.2024`, `17.02.2024 14:30`, `17.02.2024 14:30:45`
  - Empfehlung: ISO 8601 für maximale Kompatibilität

#### Optionale Spalten

- **Resource** (Aliases: `resource`, `user`, `owner`, `actor`, `rolle`, `role`)
  - Person oder System, die/das die Aktivität ausgeführt hat
  - Wird aktuell gespeichert, aber nicht für Analysen verwendet

### Beispiel CSV

```csv
caseId;activity;timestamp;resource
CASE001;Anfrage erfassen;2024-02-17 09:00:00;Service Agent
CASE001;Anfrage prüfen;2024-02-17 09:15:00;Backoffice
CASE001;Angebot erstellen;2024-02-17 14:30:00;Vertrieb
CASE002;Anfrage erfassen;2024-02-17 10:00:00;Service Agent
CASE002;Anfrage prüfen;2024-02-17 10:05:00;Backoffice
```

### Import-Vorgang

1. Klicken Sie auf **"CSV-Datei auswählen"**
2. Die Anwendung versucht automatisch, die Spalten zu erkennen (Auto-Detection)
3. Falls die Auto-Detection nicht funktioniert, wählen Sie die Spalten manuell über die Dropdowns
4. Geben Sie ein **Quellen-Label** ein (z.B. "SAP Event Log Dezember 2024")
5. Klicken Sie auf **"Importieren"**

### Technische Limits

- **Maximale Events:** 200.000 Events pro Import
- Bei Überschreitung wird der Import blockiert; kein stilles Abschneiden auf ein unvollständiges Dataset
- **Empfehlung:** Filtern Sie große Event Logs vor dem Import (z.B. nach Zeitraum)

### Fehlerbehebung

**"Keine gültigen Events gefunden"**
- Prüfen Sie, ob Case ID, Activity und Timestamp in allen Zeilen ausgefüllt sind
- Prüfen Sie das Datumsformat (siehe oben)

**"Ungültiger Zeitstempel in Zeile X"**
- Der Timestamp in dieser Zeile konnte nicht geparst werden
- Der Import wird blockiert oder die Zeile als Validierungsfehler gezählt; die Zeilen-Zähler erscheinen im Import-Protokoll
- Prüfen Sie das Format: ISO 8601 oder deutsches Format `DD.MM.YYYY`
- Sind viele Zeilen betroffen, sollte das Quell-Log bereinigt und neu importiert werden

**"Keine Label-Spalte gefunden"**
- Die Activity-Spalte wurde nicht gefunden
- Prüfen Sie die Spaltenüberschriften (siehe Aliases oben)

## Activity → Step Mapping

Nach dem Import werden alle Aktivitäten aus dem Event Log aufgelistet. Um Conformance Checking und Enhancement durchzuführen, müssen Aktivitäten auf Happy Path Schritte gemappt werden.

### Auto-Mapping

Die Anwendung versucht automatisch, Aktivitäten auf Schritte zu mappen, wenn:
- Der normalisierte Aktivitätsname exakt dem normalisierten Schrittnamen entspricht
- Die Zuordnung eindeutig ist (keine Duplikate)

**Normalisierung:** Groß-/Kleinschreibung wird ignoriert, Leerzeichen und Sonderzeichen werden entfernt.

Beispiel:
- Aktivität: `Anfrage prüfen` → wird automatisch auf Schritt `1. Anfrage prüfen` gemappt
- Aktivität: `ANFRAGE_PRUEFEN` → wird ebenfalls automatisch gemappt

### Manuelles Mapping

1. Suchen Sie die Aktivität in der Tabelle (nutzen Sie die Suchfunktion bei vielen Aktivitäten)
2. Wählen Sie im Dropdown den passenden Happy Path Schritt aus
3. Wiederholen Sie dies für alle relevanten Aktivitäten
4. Klicken Sie auf **"Mapping speichern"**

**Hinweis:** Nur gemappte Aktivitäten werden für Conformance und Enhancement berücksichtigt.

### Mapping-Assistent

Der Mapping-Assistent unterstützt Sie bei der Zuordnung von Aktivitäten zu Schritten durch intelligente Vorschläge.

**Aktivierung:**
- Aktivieren Sie die Checkbox **"Mapping-Assistent anzeigen (Vorschläge)"** oberhalb der Mapping-Tabelle
- Für jede unmapped Aktivität erscheint eine zusätzliche Spalte mit bis zu 3 Vorschlägen

**Funktionsweise:**
- Die Vorschläge basieren auf einer Kombination aus:
  - **Token-Overlap (Jaccard):** Gemeinsame Wörter zwischen Aktivität und Schritt
  - **Levenshtein-Ähnlichkeit:** Zeichenkettenähnlichkeit zwischen Aktivität und Schritt-Label
  - **Katalog-Aliases:** Berücksichtigung von Rollen, Systemen und Datenobjekten, die am Schritt beteiligt sind
- Jeder Vorschlag zeigt:
  - Schritt-Nummer und Label
  - Ähnlichkeits-Score (in Prozent)
  - Gründe (z.B. gemeinsame Tokens)

**Nutzung:**
1. Aktivieren Sie den Mapping-Assistenten
2. Prüfen Sie die Vorschläge für jede Aktivität
3. Klicken Sie auf einen Vorschlag-Button, um das Mapping zu übernehmen
4. Das Dropdown wird automatisch aktualisiert
5. Speichern Sie das Mapping mit **"Mapping speichern"**

**Wichtig:**
- Vorschläge müssen manuell bestätigt werden - es erfolgt keine automatische Zuordnung
- Vorschläge sind Hilfestellungen und sollten immer inhaltlich geprüft werden
- Bei bereits gemappten Aktivitäten werden keine Vorschläge angezeigt

### Best Practices

- Mappen Sie zunächst die häufigsten Aktivitäten (sortiert nach Count)
- Nicht alle Aktivitäten müssen gemappt werden (z.B. technische Events)
- Ein Happy Path Schritt kann auf mehrere Aktivitäten gemappt werden
- Das Mapping bleibt erhalten, auch wenn neue Event Logs importiert werden

## Discovery: Varianten

Die Discovery-Analyse zeigt die **Top 10 häufigsten Prozessvarianten**.

Eine Variante ist eine eindeutige Sequenz von Aktivitäten innerhalb eines Cases:
- Direkt aufeinanderfolgende identische Aktivitäten werden zu einer zusammengefasst
- Die Sequenz wird aus normalisierten Activity Keys gebildet

**Anzeige:**
- Rang (1-10)
- Count (Anzahl Cases mit dieser Variante)
- Anteil (Prozentsatz aller Cases)
- Variante (Sequenz, z.B. `anfrageprufen → angeboterstellen → angebotsenden`)

**Nutzen:**
- Erkennen Sie die häufigsten Pfade durch Ihren Prozess
- Identifizieren Sie Abweichungen vom erwarteten Ablauf
- Verstehen Sie die tatsächliche Prozesskomplexität

## Conformance Checking

Conformance Checking vergleicht die tatsächlichen Event Logs mit dem modellierten Happy Path.

### Voraussetzung

Aktivitäten müssen auf Happy Path Schritte gemappt sein (siehe oben).

### Metriken

**Happy Path abgedeckt**
- Anzahl und Prozentsatz der Cases, die alle Happy Path Schritte in aufsteigender Reihenfolge enthalten
- Algorithmus: Lenient Subsequence Check (zusätzliche Schritte sind erlaubt, aber alle erwarteten Schritte müssen vorkommen)

**Backtracking erkannt**
- Anzahl und Prozentsatz der Cases, die eine echte Rückwärtsbewegung aufweisen
- Beispiel: Case enthält Schritt 3 → Schritt 2 → Schritt 4 (Schritt 2 nach Schritt 3 = Backtrack)

**Häufig fehlende Schritte (Top 10)**
- Liste der Happy Path Schritte, die am häufigsten in Cases fehlen
- Zeigt Count (Anzahl Cases) und Prozentsatz

**Interpretation:**
- Niedrige Happy Path Coverage kann auf:
  - Unvollständige Event Logs hinweisen
  - Fehlende Schritte im Modell
  - Viele Sonderfälle/Ausnahmen in der Praxis
- Hohes Backtracking kann auf:
  - Nacharbeit/Korrekturen hinweisen
  - Manuelle Eingriffe
  - Prozess-Ineffizienzen

## Enhancement: Schritt-Metriken

Enhancement berechnet reale Metriken aus Event Logs für jeden Happy Path Schritt.

### Voraussetzung

Aktivitäten müssen auf Happy Path Schritte gemappt sein.

### Berechnete Metriken

**Coverage %**
- Prozentsatz der Cases, die diesen Schritt enthalten
- 100% = alle Cases enthalten den Schritt
- Niedrige Coverage kann auf optionale Schritte oder fehlende Daten hinweisen

**Median Span**
- Mediane Dauer eines Schritts innerhalb eines Cases
- Berechnung: max(timestamp) - min(timestamp) aller Events, die auf diesen Schritt gemappt sind
- Format: `Xm` (Minuten), `Xh` (Stunden), `Xd` (Tage)

**Median Wartezeit bis nächster Schritt**
- Mediane Zeit zwischen Ende dieses Schritts und Beginn des nächsten Schritts
- Zeigt Liegezeiten/Wartezeiten im Prozess
- Format: `Xm`, `Xh`, `Xd`
- `-` wenn kein nächster Schritt existiert (letzter Schritt)

**Hinweis zum Median:**
- Der Median ist robuster gegen Ausreißer als der Durchschnitt
- 50% der Cases haben eine kürzere Zeit, 50% eine längere

### Interpretation

**Hohe Span-Zeiten können hinweisen auf:**
- Komplexe Schritte mit vielen Sub-Aktivitäten
- Manuelle Bearbeitung
- Unterbrechungen während der Bearbeitung

**Hohe Wartezeiten können hinweisen auf:**
- Engpässe im Prozess
- Fehlende Automatisierung
- Abhängigkeiten von externen Faktoren
- Batch-Verarbeitung

## Workflow

Empfohlener Ablauf für Process Mining:

1. **Happy Path modellieren** (im Draft-Tab)
2. **Event Log importieren** (CSV mit Case ID, Activity, Timestamp)
3. **Activity → Step Mapping durchführen**
   - Auto-Mapping prüfen
   - Fehlende Mappings manuell ergänzen
   - Mapping speichern
4. **Discovery analysieren**
   - Top-Varianten prüfen
   - Abweichungen vom erwarteten Ablauf identifizieren
5. **Conformance prüfen**
   - Happy Path Coverage bewerten
   - Backtracking analysieren
   - Häufig fehlende Schritte untersuchen
6. **Enhancement nutzen**
   - Schritt-Metriken prüfen
   - Engpässe identifizieren (hohe Wartezeiten)
   - Komplexe Schritte identifizieren (hohe Span-Zeiten)
7. **Verbesserungen ableiten** (im Improvements-Tab)

## Einschränkungen

- **Keine Diagramme:** Process Mining Lite zeigt nur tabellarische Auswertungen
- **Keine externen Analysen:** Alle Berechnungen laufen lokal
- **Keine automatischen Draft-Anpassungen:** Metriken werden nur angezeigt, nicht automatisch in Schritt-Kennzahlen übernommen
- **Einfache Algorithmen:** Discovery und Conformance nutzen einfache Heuristiken, keine komplexen Process Mining Algorithmen
- **Max. 200.000 Events:** Bei größeren Logs ist eine Vorfilterung notwendig; der Import wird blockiert statt still abzuschneiden
- **Nur reale Daten:** Synthetische oder unvollständige Datasets (truncated) werden gesperrt und nicht analysiert

## Datenschutz und Sicherheit

- **Lokal:** Alle Event Logs werden ausschließlich lokal im Browser (IndexedDB) gespeichert
- **Offline:** Keine Verbindung zu externen Services
- **Keine Uploads:** Event Logs verlassen niemals Ihr Gerät
- **Löschung:** Event Logs können jederzeit über "Event Log entfernen" gelöscht werden

## Technische Details

### Datenstruktur

Event Logs werden in `version.sidecar.processMining` gespeichert:

```typescript
interface ProcessMiningState {
  schemaVersion: 'process-mining-v1';
  sourceLabel: string;          // z.B. "SAP Event Log"
  importedAt: string;            // ISO timestamp
  events: EventLogEvent[];       // alle Events (vollständig validiert, timeMode='real')
  activityMappings: ProcessMiningActivityMapping[];  // Activity → Step Mapping
  warnings?: string[];           // Import-Warnungen
  truncated?: boolean;           // Legacy-Feld; truncated=true blockiert alle Analysen
  maxEvents?: number;            // Limit (default: 200000)
}
```

**Hinweis zu `truncated`:** Datasets mit `truncated=true` sind unvollständig und für Process Mining gesperrt.
Dieses Feld kann in importierten Legacy-Bundles vorkommen. Löschen Sie solche Datasets und importieren Sie
das Log nach externer Vorfilterung erneut.

### Algorithmen

**Varianten-Berechnung:**
- Gruppierung nach Case ID
- Sortierung nach Timestamp
- Bildung einer Sequenz aus normalisierten Activity Keys
- Entfernung direkter Duplikate (A→A→B wird zu A→B)
- Zählung und Sortierung nach Häufigkeit

**Conformance (Happy Path Coverage):**
- Lenient Subsequence Check: Prüfung, ob alle Happy Path Schritte in aufsteigender Reihenfolge vorkommen
- Zusätzliche Schritte sind erlaubt
- Beispiel: Happy Path = [1,2,3], Actual = [1,X,2,Y,3] → OK
- Beispiel: Happy Path = [1,2,3], Actual = [1,3,2] → Nicht OK

**Conformance (Backtracking):**
- Echte Inversion: Prüfung, ob Step Order irgendwann sinkt
- Beispiel: [1,2,3,2,4] → Backtrack erkannt (2 nach 3)

**Step Metrics:**
- Span: max(timestamp) - min(timestamp) aller Events pro Schritt und Case
- Wait: min(timestamp) des nächsten Schritts - max(timestamp) dieses Schritts
- Median: Sortierte Liste, p50

### Normalisierung

Aktivitätsnamen und Schrittnamen werden für Mapping und Varianten normalisiert:
- Umwandlung in Kleinbuchstaben
- Entfernung von Leerzeichen, Unterstrichen, Bindestrichen
- Beispiel: `Anfrage prüfen` → `anfrageprufen`

Dies ermöglicht flexibles Matching trotz unterschiedlicher Schreibweisen.

# KI-Assistent für Prozessextraktion (Phase C3)

## Überblick

Der KI-Assistent ermöglicht es, unstrukturierte Prozessbeschreibungen (Text, SOPs, E-Mails, Tabellen) automatisch in strukturierte Prozessmodelle zu extrahieren und als neue ProcessVersion zu importieren.

**Wichtig:** Die App sendet keine Daten automatisch an externe Dienste. Standard ist Copy/Paste. Optional kann ein API‑Modus aktiviert werden (nur im Datenmodus „Externer Dienst") und sendet ausschließlich auf expliziten Klick mit Consent.

## Workflow

### 1. Quelltext eingeben
Fügen Sie im KI-Assistent Tab eine Prozessbeschreibung ein:
- Fließtext-Beschreibung
- Standard Operating Procedure (SOP)
- E-Mail oder Meeting-Notizen
- Tabellarische Darstellung
- Beliebige Kombination

**Optional: Datei importieren (lokal)**
- Klicken Sie auf "Datei wählen" um eine lokale Textdatei zu importieren
- **Unterstützte Formate:** TXT, MD, CSV, JSON, LOG sowie DOCX und PDF
  - **DOCX:** Text wird lokal aus Word-Dokumenten extrahiert
  - **PDF:** Nur textbasierte PDFs werden unterstützt (Textlayer muss vorhanden sein)
  - **Keine OCR:** Gescannte Dokumente (Scans ohne Textlayer) können nicht verarbeitet werden
- **Ersetzen oder Anhängen:** Wenn das Textfeld bereits Inhalt hat, können Sie wählen, ob der neue Text den bestehenden ersetzt oder angehängt wird
- **Mehrere Artefakte:** Laden Sie mehrere Dateien nacheinander und wählen Sie jeweils "Anhängen", um verschiedene Quellen zu kombinieren
- **Datenschutz:** Die Datei wird ausschließlich lokal im Browser gelesen. Es wird nichts automatisch übertragen; externe Nutzung erfolgt erst, wenn Sie den Prompt manuell kopieren

**Optional: Spracheingabe (Diktat)**
- Wenn im Setup der Modus "Externer Dienst" und der STT-Provider "Web Speech API" gewählt ist, steht eine Diktat-Funktion zur Verfügung
- Klicken Sie auf "Diktat starten" und sprechen Sie frei - der Text wird live angezeigt und automatisch ins Textfeld übernommen
- **Datenschutz:** Web Speech API kann je nach Browser über einen externen Dienst laufen. Die Aufnahme startet nur auf Ihren Klick
- **Browser-Support:** uneinheitlich. Häufig funktioniert Web Speech in Chromium-basierten Browsern (z.B. Chrome/Edge). Wenn Ihr Browser es nicht unterstützt, bleibt Spracheingabe deaktiviert

**Optional: Übersetzung als Zwischenschritt**
- Wenn der Originaltext nicht deutsch ist (oder stark gemischt), können Sie eine Übersetzung separat einfügen
- Das Originalfeld und das Übersetzungsfeld bleiben beide sichtbar und getrennt
- Die App übersetzt nicht automatisch - Sie entscheiden selbst, ob und wie Sie externe Übersetzungstools nutzen (z.B. DeepL, Google Translate)
- Beim Prompt-Generieren werden beide Texte (Original + Übersetzung) an Claude übergeben
- Claude nutzt beide Quellen gemeinsam und markiert Widersprüche als Warnungen
- Das importierte JSON ist weiterhin auf Deutsch (wie gewohnt)

### 2. Prompt generieren
Klicken Sie auf "Claude-Prompt erzeugen". Die App erstellt einen strukturierten Prompt, der:
- End-to-End Definition fordert (Trigger, Kunde, Outcome, Done Criteria)
- Happy Path mit 5-15 Schritten in Form "Substantiv + Verb" verlangt
- Entscheidungen, Ausnahmen, Rollen, Systeme, Datenobjekte, KPIs abfragt
- KI-Reife-Signale erfasst (Standardisierung, Datenverfügbarkeit, Variabilität, Compliance-Risiko)
- Strikt JSON-only Output fordert (Schema: ai-capture-v1)

### 3. Prompt in Claude einfügen
Kopieren Sie den generierten Prompt:
- Öffnen Sie [claude.ai](https://claude.ai) oder Claude Desktop
- Fügen Sie den Prompt ein
- Warten Sie auf die JSON-Antwort

Empfohlene Claude-Modelle:
- **Claude Sonnet 4** (Standard, gutes Preis/Leistungsverhältnis)
- **Claude Opus** (höchste Qualität bei komplexen Prozessen)

### 4. JSON-Antwort importieren
Kopieren Sie die komplette Antwort von Claude (inkl. JSON):
- Fügen Sie sie im Feld "Claude-Antwort (JSON)" ein
- Klicken Sie auf "Als neue Version importieren"
- Die App validiert, normalisiert und erstellt eine neue ProcessVersion

**Hinweis:** Es wird immer eine neue Version erstellt, bestehende Versionen werden nicht überschrieben.

## Was wird importiert?

### Pflichtfelder
- **End-to-End Definition:** Trigger, Kunde, Outcome, Done Criteria
- **Happy Path:** 5-15 Schritte, chronologisch geordnet

### Optionale Felder
- **Rollen:** Verantwortliche Rollen/Personen
- **Systeme:** Verwendete IT-Systeme
- **Datenobjekte:** Dokumente, Formulare, Datenstrukturen
- **KPIs:** Kennzahlen mit Definition, Einheit, Zielwert
- **KI-Reife-Signale:** Einschätzung der Automatisierbarkeit
- **Entscheidungen:** XOR-Gateways mit Branches (entweder/oder)
- **Ausnahmen:** Error Events, Timeouts, Compliance-Exceptions
- **Step Details:** Detailangaben pro Schritt (Rolle, System, Arbeitstyp, Pain Points, Input/Output, Evidence-Snippet)

### Automatische Erweiterungen
- **Quality Findings:** Automatische Analyse durch `generateQualityFindings()`
- **Capture Progress:** Automatische Phasen-Berechnung über WizardSpec
- **ID-Mapping:** 1-basierte Schrittnummern werden auf UUIDs gemappt
- **Normalisierung:** Duplikate entfernt, Strings getrimmt, Case-insensitive Matching
- **Evidence-Snippets:** Optionale Belege aus Claude-Antwort werden als Text-Evidence übernommen

### Evidence aus KI-Import
Claude kann optional `evidenceSnippet` liefern für:
- Happy-Path Schritte (stepDetails)
- Entscheidungen (decisions)
- Ausnahmen (exceptions)

**Eigenschaften:**
- Kurzes Beleg-Snippet aus dem Eingabetext (max. 180 Zeichen im Prompt)
- Wird beim Import automatisch als Text-Evidence übernommen
- Erscheint nach Import bei "Quelle (Snippet)" in den jeweiligen Editoren
- Nutzer kann Snippets im Draft prüfen, anpassen oder löschen
- Keine personenbezogenen Daten (Claude-Prompt enthält entsprechende Anweisung)

## Validierung & Fehlerbehandlung

### Harte Validierung (Import schlägt fehl)
- Schema-Version muss "ai-capture-v1" sein
- End-to-End Felder (trigger, customer, outcome) erforderlich
- Happy Path muss 5-15 Schritte enthalten
- Keine leeren Schritte im Happy Path

### Weiche Validierung (Warnings)
- Ungültige Branches werden übersprungen
- Ungültige Ausnahmen werden übersprungen
- Fehlende Rollen/Systeme werden automatisch ergänzt
- Ungültige KPIs werden ignoriert
- Ungültige Schritt-Referenzen werden gemeldet

### JSON-Extraktion
Die App ist robust gegen verschiedene Antwortformate:
- Entfernt automatisch Code-Fences (\`\`\`json ... \`\`\`)
- Extrahiert JSON zwischen erstem `{` und letztem `}`
- Zeigt hilfreiche Fehlermeldungen bei Parse-Problemen

## Tipps für beste Ergebnisse

### Bei der Quelltext-Eingabe
1. **Kontext geben:** Beschreiben Sie Start und Ende des Prozesses klar
2. **Chronologie:** Ordnen Sie Schritte zeitlich/logisch
3. **Entscheidungspunkte markieren:** "Wenn X, dann Y, sonst Z"
4. **Beteiligte nennen:** Wer macht was?
5. **Systeme erwähnen:** Welche IT-Systeme werden genutzt?

### Erfassungsmodi: Artefakt vs. Konkreter Fall

Die App bietet drei Erfassungsmodi für unterschiedliche Eingabequellen:

**Modus 1: Prozessbeschreibung / Artefakt (Standard)**
- Für allgemeine Prozessdokumente, SOPs, Ablaufbeschreibungen
- Input: Idealisierte oder normierte Prozessbeschreibung
- Die KI extrahiert direkt den Happy Path aus der Beschreibung

**Modus 2: Letzten konkreten Fall erzählen**
- Für fallbasierte Erfassung: Beschreiben Sie einen realen Einzelvorgang
- Input: Ein konkreter Durchlauf von Anfang bis Ende
- Die KI leitet daraus einen typischen Happy Path ab
- Sonderwege und Abweichungen landen automatisch in decisions/exceptions
- Tipp: Nutzen Sie den Button "Vorlage einfügen" für eine strukturierte Eingabehilfe

**Modus 3: Mehrere konkrete Fälle (3–5)**
- Erfassen Sie 3–5 kurze reale Durchläufe (Instanzen), nicht den Idealprozess
- **Fallkarten-UI:** Jeder Fall wird als eigene Karte angezeigt mit editierbarem Textfeld
  - Pro Karte: Fallnummer, Textfeld für Beschreibung, "Fall löschen"-Button
  - Rohtext (FALL 1 --- FALL 2 ...) bleibt die Single Source of Truth und kann optional eingesehen werden
  - Empfehlung: pro Fall kurz, chronologisch, anonymisiert
- Nutzen Sie „Fall hinzufügen (Vorlage)" um nummerierte Fallblöcke (FALL 1, FALL 2, …) zu erzeugen
- Dateiimport im cases-Modus erzeugt automatisch einen Fallblock (FALL N) aus der Datei
- Nutzen: stabilerer Happy Path, Varianten landen sauber in decisions/exceptions (plus kurze Variantennotizen in notes[])
- Die KI konsolidiert die Fälle zu einem Standardablauf und modelliert Unterschiede als Entscheidungen/Ausnahmen
- Empfehlung: Fälle aus unterschiedlichen Tagen/Teams (anonymisiert), damit Varianz sichtbar wird

**Empfehlung:** Starten Sie mit einem konkreten Fall (Modus 2) für einen schnellen ersten Entwurf. Bei heterogenen Prozessen nutzen Sie Modus 3 für stabilere Ergebnisse. Später können Sie To-Be-Varianten und weitere Fälle ergänzen.

**Wichtig:** Anonymisieren Sie sensible Daten (Namen, Projekte, Kunden) vor dem Einfügen in Claude.

### Wenn JSON nicht parsbar ist
- Prüfen Sie, ob Claude wirklich JSON ausgegeben hat (nicht nur Text)
- Suchen Sie nach Syntax-Fehlern (fehlende Kommas, Klammern)
- Bitten Sie Claude, die Antwort zu korrigieren
- Kopieren Sie nur den JSON-Teil (ohne Erklärungen davor/danach)

### Bei zu vielen Warnings
- Warnings sind normal und helfen bei der Qualitätskontrolle
- Prüfen Sie die Warnings im Import-Ergebnis
- Bei Bedarf: Quelltext präzisieren und erneut importieren
- Nachbearbeitung im Draft-Tab möglich

## Datenschutz

**Standard: Keine automatische Datenübertragung (Copy/Paste):**
- Kein API-Call an Claude oder andere Dienste
- Alle Daten bleiben lokal in Ihrer Browser-Datenbank (IndexedDB)
- Copy/Paste erfolgt manuell durch Sie
- Sie entscheiden, welche Daten Sie Claude zeigen

**Optional: API-Modus:**
- Im Setup-Tab kann optional ein API-Modus aktiviert werden (nur wenn Datenmodus = "Externer Dienst")
- Im API-Modus kann ein eigener Endpoint konfiguriert werden
- Der Prompt wird nur auf expliziten Klick mit Consent-Checkbox gesendet
- Die Antwort wird automatisch ins Response-Feld übernommen, Import bleibt separater Klick
- Empfehlung: Nutzen Sie einen eigenen Proxy/Backend als Endpoint, um API-Keys sicher zu verwalten
- Details siehe [AI_API.md](./AI_API.md)

**Empfehlungen:**
- Anonymisieren Sie sensible Daten vor dem Einfügen in Claude
- Verwenden Sie Platzhalter für Namen, Projekte, Kunden
- Entfernen Sie vertrauliche Details

## Import-Ergebnis

Nach erfolgreichem Import:
- **Neue ProcessVersion** in der Version History
- **Draft-Tab** zeigt Happy Path mit allen Details
- **Review-Tab** zeigt Quality Findings und AI Readiness
- **BPMN Export** sofort verfügbar
- **Wizard** kann für weitere Verfeinerung genutzt werden

### Version History
Jeder Import erstellt eine neue Version:
- Alle Versionen bleiben erhalten und sind im Setup-Tab sichtbar
- Jede Version zeigt Erstellungsdatum, Status und Version-ID
- Rollback durch Laden alter Versionen möglich (Laden-Button im Setup-Tab)
- Aktuell geladene Version ist blau markiert

## Technische Details

### JSON-Schema: ai-capture-v1
Vollständiges Schema siehe `src/ai/aiTypes.ts` (AiCaptureResultV1).

### Module
- **claudePrompt.ts:** Prompt-Generator
- **aiImport.ts:** Import-Logik, Validierung, Normalisierung, Mapping
- **aiTypes.ts:** TypeScript-Definitionen

### Integration mit bestehenden Features
- **WizardEngine:** Phasen-Status wird automatisch berechnet
- **Assessment:** Quality Findings werden generiert
- **BPMN Export:** Sofort nach Import verfügbar
- **Draft Editors:** Nachbearbeitung von Decisions & Exceptions möglich

## Beispiel-Workflow

1. **Setup-Tab:** Projekt "Vertrieb 2024" und Prozess "Angebotserstellung" anlegen
2. **KI-Assistent Tab:** Text einfügen: "Der Prozess startet, wenn ein Vertriebsmitarbeiter eine Kundenanfrage erhält..."
3. **Prompt generieren:** Button klicken, Prompt erscheint
4. **Claude öffnen:** claude.ai, Prompt einfügen
5. **JSON erhalten:** Claude gibt strukturiertes JSON zurück
6. **Import:** JSON kopieren, in App einfügen, "Als neue Version importieren"
7. **Draft-Tab:** Happy Path sichtbar mit 8 Schritten
8. **Review-Tab:** AI Readiness zeigt "high standardization"
9. **BPMN generieren:** Export als .bpmn Datei

## Limitierungen

- **Kein BPMN-Import:** Nur Text → JSON → Import möglich (BPMN-Export funktioniert)
- **API-Integration optional:** Standard bleibt Copy/Paste. API-Modus nur im Datenmodus „Externer Dienst" und nur auf expliziten Klick mit Consent. Keine Hintergrund-Calls.
- **XOR-fokussiert:** AND/OR-Gateways werden gemeldet, aber nicht optimal unterstützt
- **Einfaches Layout:** BPMN-Layout ist funktional, nicht optimiert für komplexe Schleifen
- **Einsteiger-fokussiert:** Komplexe Prozesse erfordern manuelle Nachbearbeitung

## Häufige Fragen

**Q: Muss ich Claude verwenden?**
A: Nein, das Schema ist offen. Sie können auch andere LLMs nutzen oder JSON manuell schreiben.

**Q: Werden meine Daten gespeichert?**
A: Nur lokal in Ihrer Browser-Datenbank. Keine Cloud-Synchronisation.

**Q: Kann ich mehrere Versionen importieren?**
A: Ja, jeder Import erstellt eine neue Version. Ideal für iteratives Vorgehen.

**Q: Was passiert bei Fehlern?**
A: Import schlägt fehl mit klarer Fehlermeldung. Keine Daten gehen verloren.

**Q: Kann ich das Ergebnis bearbeiten?**
A: Ja, im Draft-Tab (Decisions/Exceptions) oder erneut über Wizard.

---

# KI-Entwurf für Maßnahmen (Phase D6)

## Überblick

Der KI-Assistent für Maßnahmen ermöglicht es, einzelne Backlog-Items zu konkretisieren und mit Detailinformationen zu erweitern. Die KI analysiert den Prozesskontext und schlägt verbesserte Beschreibungen und Steckbrief-Details vor.

**Wichtig:** Die App sendet keine Daten automatisch. Standard ist Copy/Paste. Optional kann der API‑Modus genutzt werden (nur im Datenmodus „Externer Dienst") und sendet nur auf Klick mit Consent.

## Workflow

### 0. KI-Vorschläge für neue Maßnahmen (optional)
Für die Generierung komplett neuer Maßnahmen nutzen Sie den Button "KI‑Vorschläge generieren":
- Klicken Sie auf "KI‑Vorschläge generieren" im Maßnahmen-Tab
- Die App erstellt einen Prompt mit dem kompletten Prozesskontext und den bereits erfassten Maßnahmen (zur Vermeidung von Duplikaten)
- Der Prompt enthält zusätzlich interne Kandidaten (Assessment + Heuristiken), damit Claude weniger generisch antwortet und stärker auf Ihren Prozess fokussiert
- **Copy/Paste:** Kopieren Sie den Prompt und fügen Sie ihn in Claude ein
- **Optional API-Modus:** Wenn aktiviert, Button „Per API senden" übernimmt die Antwort automatisch ins JSON-Feld
- Claude generiert 8–15 konkrete Maßnahmenvorschläge als JSON (Schema: ai-improvement-suggestions-v1)
- Fügen Sie die JSON-Antwort in das Feld "JSON-Antwort von Claude" ein (oder nutzen API-Button)
- Klicken Sie auf "Antwort prüfen" → Die App validiert das JSON, markiert Duplikate und zeigt Warnungen
- Wählen Sie die gewünschten Vorschläge aus (Duplikate sind automatisch deaktiviert)
- Klicken Sie auf "Ausgewählte hinzufügen" → Die Maßnahmen werden als neue Backlog-Items angelegt
- Speichern Sie die Änderungen

**Hinweis:** Duplikate werden durch Normalisierung der Titel erkannt (case-insensitive, ohne Sonderzeichen) und standardmäßig nicht zur Auswahl angeboten.

### 1. Maßnahme öffnen
- Navigieren Sie zum Tab "Maßnahmen"
- Wählen Sie eine bestehende Maßnahme oder legen Sie eine neue an
- Klicken Sie auf "Beschreibung" um das Item zu expandieren

### 2. KI-Entwurf starten
Klicken Sie auf den Button "KI-Entwurf". Die App generiert einen Prompt, der:
- Den kompletten Prozesskontext enthält (End-to-End, Happy Path, Schritte)
- Den aktuellen Stand der Maßnahme übergibt (Titel, Kategorie, Impact/Effort/Risk, etc.)
- Erlaubte Systeme, Datenobjekte und KPIs auflistet
- Strikt JSON-only Output fordert (Schema: ai-improvement-v1)

### 3. Prompt in Claude einfügen
Kopieren Sie den generierten Prompt:
- Öffnen Sie [claude.ai](https://claude.ai) oder Claude Desktop
- Fügen Sie den Prompt ein
- Warten Sie auf die JSON-Antwort

Empfohlene Claude-Modelle:
- **Claude Sonnet 4** (Standard, ausreichend für die meisten Fälle)
- **Claude Opus** (bei sehr komplexen Automatisierungsvorhaben)

### 4. JSON-Antwort anwenden
Kopieren Sie die JSON-Antwort von Claude:
- Fügen Sie sie im Feld "JSON-Antwort von Claude" ein
- Klicken Sie auf "Antwort anwenden"
- Die App validiert, normalisiert und wendet die Änderungen auf die Maßnahme an

**Hinweis:** Änderungen werden erst nach Klick auf "Änderungen speichern" persistiert.

## Was wird verbessert?

### Felder im Patch
Die KI kann folgende Felder konkretisieren oder ändern:
- **title:** Verbesserter, präziserer Titel
- **description:** Detaillierte Beschreibung mit konkreten Schritten
- **category:** Kategorie-Optimierung (z.B. von "digitize" → "automate")
- **scope:** Process oder Step-Level
- **relatedStepId:** Zuordnung zu einem spezifischen Happy-Path-Schritt
- **impact / effort / risk:** Neubewertung basierend auf Kontext
- **owner:** Vorschlag für Verantwortlichen (falls ableitbar)
- **dueDate:** Vorschlag für Fälligkeit (optional)
- **status:** Status-Empfehlung

### Automatisierungs-Steckbrief
Bei Kategorien "Automatisierung" oder "KI-Potenzial":
- **approach:** Ansatz (Workflow, RPA, API Integration, ERP Config, Low-Code, AI Assistant, AI Document Processing, AI Classification, Process Mining, Other)
- **level:** Zielgrad (Assist, Partial, Straight Through)
- **humanInTheLoop:** Ob menschliche Kontrolle nötig ist
- **systemIds:** Welche Systeme involviert sind (aus erlaubter Liste)
- **dataObjectIds:** Welche Datenobjekte genutzt werden (aus erlaubter Liste)
- **kpiIds:** Welche KPIs gemessen werden sollen (aus erlaubter Liste)
- **controls:** Governance-Controls (Audit Trail, Approval, Monitoring, Data Privacy, Fallback Manual)
- **notes:** Technische Hinweise zur Umsetzung

## Validierung & Sicherheit

### ID-Validierung
Die KI darf nur IDs verwenden, die im Prozess definiert sind:
- **systemIds:** Nur Systeme aus version.sidecar.systems
- **dataObjectIds:** Nur Datenobjekte aus version.sidecar.dataObjects
- **kpiIds:** Nur KPIs aus version.sidecar.kpis
- **relatedStepId:** Nur Schritte aus dem Happy Path

Ungültige IDs werden automatisch entfernt und als Warning gemeldet.

### Enum-Validierung
Alle Enums werden gegen erlaubte Werte geprüft:
- **category:** standardize, digitize, automate, ai, data, governance, customer, compliance, kpi
- **status:** idea, planned, in_progress, done, discarded
- **scope:** process, step
- **impact/effort/risk:** low, medium, high
- **approach:** workflow, rpa, api_integration, erp_config, low_code, ai_assistant, ai_document_processing, ai_classification, process_mining, other
- **level:** assist, partial, straight_through
- **controls:** audit_trail, approval, monitoring, data_privacy, fallback_manual

Ungültige Werte werden entfernt oder auf Fallback-Werte gesetzt (mit Warning).

### itemId-Check
Die App prüft, ob die JSON-Antwort zur aktuellen Maßnahme passt:
- itemId in der Antwort muss exakt mit der geöffneten Maßnahme übereinstimmen
- Bei Mismatch: Fehlermeldung, kein Patch wird angewendet

## Datenschutz

**Keine automatische Datenübertragung:**
- Kein API-Call an Claude oder andere Dienste
- Alle Daten bleiben lokal in IndexedDB
- Copy/Paste erfolgt manuell durch Sie
- Sie kontrollieren, welche Daten Claude sieht

**Empfehlungen:**
- Anonymisieren Sie sensible Informationen vor dem Einfügen
- Verwenden Sie Platzhalter für Kundennamen, Projekte, etc.
- Prüfen Sie den Prompt vor dem Kopieren in Claude

## Beispiel-Workflow

1. **Maßnahmen-Tab:** Maßnahme "Rechnungsfreigabe digitalisieren" öffnen
2. **Beschreibung expandieren:** Aktueller Stand ist nur: "Manuelle Freigabe durch RPA ersetzen"
3. **KI-Entwurf:** Button klicken → Prompt mit Prozesskontext wird erzeugt
4. **Claude:** Prompt in claude.ai einfügen → JSON-Antwort erhalten
5. **Import:** JSON einfügen → "Antwort anwenden"
6. **Ergebnis:**
   - Titel konkretisiert: "RPA-Workflow für automatische Rechnungsfreigabe bei Standardbeträgen"
   - Beschreibung ergänzt: "Implementierung eines UiPath-Workflows, der Rechnungen <10.000€ automatisch..."
   - Steckbrief gefüllt: approach=rpa, level=partial, humanInTheLoop=true, systemIds=[SAP, DocuSign], controls=[audit_trail, approval]
7. **Speichern:** "Änderungen speichern" klicken

## Warnings & Fehlerbehandlung

### Typische Warnings
- **Unbekannte System-IDs:** "Unbekannte System-IDs wurden entfernt: erp-system-xyz"
  → Die KI hat eine System-ID verwendet, die im Prozess nicht definiert ist
- **Ungültige Kontrollen:** "Unbekannte Kontrollen wurden entfernt: advanced_ml_check"
  → Die KI hat einen Control-Type erfunden, der nicht existiert
- **Schritt nicht gefunden:** "Unbekannte Schritt-ID wurde entfernt: step-999"
  → relatedStepId passt nicht zum Happy Path

**Was tun?**
- Warnings sind unkritisch, der Patch wird trotzdem angewendet
- Prüfen Sie die Warnings und ergänzen Sie fehlende IDs manuell
- Bei Bedarf: Systeme/Datenobjekte im Draft-Tab nachpflegen, dann erneut KI-Entwurf nutzen

### Harte Fehler (Import schlägt fehl)
- **Schema-Version falsch:** Claude hat falsches Schema ausgegeben
- **itemId stimmt nicht:** JSON passt zu einer anderen Maßnahme
- **Kein gültiges JSON:** Parse-Fehler (fehlende Klammern, Kommas, etc.)

**Was tun?**
- Prüfen Sie, ob Claude wirklich JSON ausgegeben hat
- Kopieren Sie nur den JSON-Teil (ohne Erklärungen)
- Bitten Sie Claude, die Antwort zu korrigieren
- Im Notfall: Manuell bearbeiten oder neuen Prompt generieren

## Tipps für beste Ergebnisse

### Vorher: Kontext pflegen
- **Happy Path vollständig:** Je besser der Happy Path gepflegt ist, desto präziser die KI-Vorschläge
- **Systeme & Datenobjekte definiert:** KI kann nur aus bestehenden Listen wählen
- **KPIs angelegt:** KI kann nur vorhandene KPIs verknüpfen

### Bei unzureichenden Ergebnissen
- **Maßnahme manuell vorausfüllen:** Geben Sie im Titel/Beschreibung mehr Kontext
- **Kategorie setzen:** "Automatisierung" oder "KI-Potenzial" triggert Steckbrief-Logik
- **Prozesskontext verbessern:** End-to-End klar definieren, Step Details ergänzen

### Iteratives Vorgehen
- Nutzen Sie den KI-Entwurf mehrfach für dieselbe Maßnahme
- Nach manueller Anpassung: Erneut KI-Entwurf für weitere Verfeinerung
- Kombination: KI für Grobstruktur, Sie für finale Details

## Technische Details

### JSON-Schema: ai-improvement-v1
Vollständiges Schema siehe `src/ai/aiImprovementTypes.ts` (AiImprovementPatchV1).

### Module
- **claudeImprovementPrompt.ts:** Prompt-Generator mit Prozesskontext
- **aiImprovementPatch.ts:** Parser, Validator, Normalizer
- **aiImprovementTypes.ts:** TypeScript-Definitionen

### Integration
- **ImprovementBacklogEditor:** UI-Integration im Expanded-Bereich
- **handleUpdateItem:** Direkter Patch auf Backlog-Item
- **onSave:** Erst nach explizitem Speichern wird persistiert

## Limitierungen

- **Neue Maßnahmen:** Neue Maßnahmen sind über „KI‑Vorschläge generieren" möglich. Standard ist Copy/Paste; optional kann der API‑Modus genutzt werden. In beiden Fällen: Validierung + manuelle Auswahl, keine automatische Übernahme.
- **Nur erlaubte IDs:** KI kann keine neuen Systeme/Datenobjekte/KPIs erfinden
- **Kein Auto-Save:** Änderungen müssen manuell gespeichert werden
- **Ein Item pro Durchgang:** KI-Entwurf verbessert immer nur eine Maßnahme, nicht den ganzen Backlog (für mehrere Vorschläge nutzen Sie "KI‑Vorschläge generieren")

## Häufige Fragen

**Q: Kann die KI neue Maßnahmen vorschlagen?**
A: Ja. Nutzen Sie "KI‑Vorschläge generieren" für 8–15 neue Maßnahmenvorschläge. Die Vorschläge werden geprüft, Duplikate markiert und nur ausgewählte Vorschläge werden übernommen. Alternativ: "Empfehlungen übernehmen" für Assessment-basierte Vorschläge.

**Q: Was wenn die KI systemIds verwendet, die nicht existieren?**
A: Die App filtert ungültige IDs automatisch und zeigt eine Warning. Kein Datenverlust.

**Q: Kann ich den Patch rückgängig machen?**
A: Vor dem Speichern: Seite neu laden. Nach dem Speichern: Alte Version im Setup-Tab laden (falls vorhanden).

**Q: Funktioniert das auch bei Kategorien außer "Automatisierung"?**
A: Ja, die KI kann alle Felder verbessern. Der Automatisierungs-Steckbrief wird nur bei "automate"/"ai" gefüllt.

---

# KI-Auswertung semantischer Prüffragen (Review)

## Überblick

Im Review-Tab können Sie die automatisch generierten semantischen Prüffragen durch eine KI-Analyse priorisieren lassen. Die KI identifiziert kritische Blocker für Automatisierung und Digitalisierung und schlägt konkrete nächste Klärungsschritte vor.

**Wichtig:** Die App sendet keine Daten automatisch. Standard ist Copy/Paste. Optional kann der API‑Modus genutzt werden (nur im Datenmodus „Externer Dienst") und sendet nur auf expliziten Klick mit Consent.

## Workflow

### 1. Review-Tab öffnen
- Navigieren Sie zum Tab "Review"
- Scrollen Sie zum Abschnitt "Semantische Prüffragen"
- Der Button "KI: Fragen priorisieren" erscheint nur, wenn semantische Fragen vorhanden sind

### 2. KI-Auswertung starten
Klicken Sie auf "KI: Fragen priorisieren". Die App generiert einen Prompt, der:
- Den kompletten Prozesskontext enthält (End-to-End, Happy Path, Entscheidungen, Ausnahmen)
- Alle semantischen Prüffragen auflistet
- KI-Reife-Signale und operationalen Kontext übergibt
- Claude anweist, Top-Blocker zu identifizieren und Mikro-Fragen zu formulieren

### 3. Prompt in Claude einfügen
- Kopieren Sie den generierten Prompt über "Prompt kopieren"
- Öffnen Sie claude.ai oder Claude Desktop
- Fügen Sie den Prompt ein
- Warten Sie auf die Markdown-Antwort

### 4. Antwort zurück kopieren
- Kopieren Sie die Markdown-Antwort von Claude
- Fügen Sie sie im Feld "Claude-Antwort (Markdown einfügen)" ein
- Optional: Kopieren Sie die Antwort erneut über "Antwort kopieren"
- Optional: Exportieren Sie die Antwort als .md-Datei über "Markdown exportieren"

## Was wird analysiert?

### Claude liefert strukturiertes Markdown mit:

1. **Kurzfazit:** Größte Automatisierungs-Blocker auf einen Blick
2. **Beobachtet:** Fakten aus den Daten (keine Interpretation)
3. **Priorisierte Blocker (Top 8):** Die kritischsten Fragen für Automatisierung/Digitalisierung
4. **Mikro-Fragen je Top-Blocker:** Konkrete, interview-taugliche nächste Klärungsfragen
5. **Fehlende Informationen:** Minimal-Anforderungen für fundierte Automatisierungsentscheidung
6. **Nächste Schritte:** Umsetzbare Aktionen für 30-60 Minuten Workshop

### Trennung nach Kategorien
Die KI clustert Fragen nach:
- Regeln/Entscheidungen
- Daten
- Systeme
- Rollen
- Ausnahmen
- Compliance/Kontrollen
- KPIs

### Mikro-Fragen
Für jeden Top-Blocker:
- **Nächste konkrete Klärungsfrage:** Die kleinste, interview-taugliche Frage
- **Benötigte Quelle/Artefakt:** Dokumente, Screenshots, Beispieldaten, Workshop
- **Wer sollte gefragt werden:** Rolle/Funktion (Fachbereichsleiter, IT-Verantwortlicher, etc.)

## Datenschutz

**Keine automatische Datenübertragung:**
- Kein API-Call an Claude oder andere Dienste
- Alle Daten bleiben lokal in IndexedDB
- Copy/Paste erfolgt manuell durch Sie
- Sie kontrollieren, welche Daten Claude sieht

**Datenschutz-Hinweis:** Wird im Panel prominent angezeigt.

## Beispiel-Workflow

1. **Review-Tab:** Prozess hat 12 semantische Prüffragen
2. **Button klicken:** "KI: Fragen priorisieren"
3. **Prompt kopieren:** Über "Prompt kopieren"-Button
4. **Claude:** Prompt in claude.ai einfügen
5. **Markdown erhalten:** Claude gibt strukturierte Analyse als Markdown zurück
6. **Import:** Markdown in "Claude-Antwort"-Feld einfügen
7. **Weiterverarbeitung:**
   - "Antwort kopieren" für Dokumentation
   - "Markdown exportieren" für Workshop-Vorbereitung
   - Datei: semantic_questions_ai_prozess_12345678.md

## Tipps für beste Ergebnisse

- **Kontext vollständig:** Je besser Happy Path, Entscheidungen, Ausnahmen gepflegt sind, desto präziser die Analyse
- **KI-Reife-Signale gesetzt:** Standardisierung, Datenverfügbarkeit, etc. beeinflussen die Priorisierung
- **Operationaler Kontext:** Häufigkeit und Durchlaufzeit helfen bei Einschätzung der Automatisierungsrelevanz

## Weiterführende Informationen

- **METHOD_FOUNDATION.md:** Methodische Grundlagen
- **CAPTURE_WIZARD.md:** Wizard-basierte Erfassung
- **BPMN_EXPORT.md:** BPMN-Generierung aus Draft
- **ASSESSMENT.md:** AI Readiness Assessment
- **IMPROVEMENTS.md:** Maßnahmen-Backlog Konzept

# Capture Wizard: Geführte Prozesserfassung

## Überblick

Der Capture Wizard ist ein mehrstufiger, geführter Erfassungsprozess, der Anwender ohne BPM-Expertise dabei unterstützt, Prozesse strukturiert zu dokumentieren. Die Erfassung erfolgt in einem "Draft"-Format, das später in BPMN 2.0 exportiert werden kann.

## Warum ein Wizard?

### Problem: BPMN-Tools sind für Einsteiger zu komplex
- Notation mit 50+ Symbolen überfordert
- Syntax-Regeln müssen bekannt sein
- Canvas-basierte Editoren lenken von der Inhaltserfassung ab

### Lösung: Schrittweise strukturierte Erfassung
1. **Erst denken, dann zeichnen**: Inhalt vor Visualisierung
2. **Einsteiger-Sprache**: Keine Fachbegriffe im Eingabeprozess
3. **Validierung**: Automatische Prüfung von Pflichtfeldern und Konsistenz
4. **Semantik-Hinweise**: Generierung von Review-Fragen, die Tools nicht prüfen können

---

## Phasenmodell

Der Wizard führt durch 9 Phasen, die aufeinander aufbauen:

### Skelett vs. Details

Der Wizard bietet zwei Erfassungsfoki, um unterschiedliche Nutzungssituationen zu unterstützen:

**Skelett (Schnellstart):**
- Konzentriert sich auf die essentiellen Phasen: Scope → Happy Path → Rollen
- Ideal für schnelles Erfassen des Prozessgrundgerüsts
- Ermöglicht raschen Einstieg ohne Überforderung
- Nach Abschluss: Klare Wahlmöglichkeit zwischen Draft-Ansicht oder Detail-Ergänzung

**Details:**
- Umfasst alle 9 Phasen inklusive Entscheidungen, Ausnahmen, Daten/IT, KPIs, Automatisierung
- Für vollständige Prozessmodellierung und Automatisierungsplanung
- Wird automatisch aktiviert, wenn bereits Detail-Phasen bearbeitet wurden

**Empfehlung:** Starten Sie mit dem Skelett, um schnell eine erste Version zu erstellen. Details können später gezielt ergänzt werden, wenn Varianten, Ausnahmen oder Automatisierung relevant sind.

### Phasen-Ablauf und optionale Fragen

Jede Phase besteht aus Pflichtfragen und optionalen Fragen:

1. **Pflichtfragen zuerst**: Der Wizard zeigt zunächst alle erforderlichen Felder der Phase an
2. **Optionale Fragen folgen**: Nach Beantwortung aller Pflichtfragen werden optionale Zusatzfelder angezeigt
3. **Flexible Steuerung**:
   - Nutzer kann optionale Felder ausfüllen (empfohlen für vollständige Dokumentation)
   - Oder: Button "Optionale Fragen überspringen" klicken, um direkt zur nächsten Phase zu gehen
4. **Phasen ohne Pflichtfragen** (z.B. Exceptions, KPIs) können jederzeit komplett übersprungen werden

Dieses Modell stellt sicher, dass wichtige Informationen erfasst werden, während Flexibilität für zusätzliche Details erhalten bleibt.

### Spracheingabe (Optional)

Bei Textfragen (kurzer Text, langer Text, Listen) erscheint ein Mikrofon-Button direkt am Eingabefeld:

- **Voraussetzung**: Im Setup muss der Modus "Externer Dienst" und der STT-Provider "Web Speech API" gewählt sein
- **Funktion**: Klick auf das Mikrofon-Symbol startet die Spracheingabe, der erkannte Text wird automatisch ins Feld geschrieben
- **Live-Anzeige**: Während der Aufnahme wird der Interim-Text (Live-Vorschau) angezeigt
- **Bei Listen**: Jeder final erkannte Satz wird als neue Zeile angehängt
- **Bei Text-Feldern**: Finaler Text wird mit Leerzeichen ans Ende angehängt
- **Nur ein Diktat gleichzeitig**: Wenn Sie bei einer anderen Frage starten, wird die laufende Aufnahme automatisch abgebrochen
- **Datenschutz**: Web Speech API kann je nach Browser über einen externen Dienst laufen. Die Aufnahme startet nur auf Ihren Klick
- **Browser-Support**: uneinheitlich. In der Praxis funktioniert Web Speech häufig in Chromium-basierten Browsern (z.B. Chrome/Edge). Wenn Ihr Browser es nicht unterstützt, bleibt Spracheingabe deaktiviert und die App zeigt dies an.

Während ein Diktat aktiv ist, sind die Buttons "Antworten speichern" und "Optionale Fragen überspringen" deaktiviert, um zu vermeiden, dass versehentlich während der Eingabe gespeichert wird.

### 1. **Scope** (Einordnung)
**Ziel:** Prozess klar abgrenzen und End-to-End-Definition erstellen

**Erfasst:**
- Trigger/Auslöser (required)
- Kunde/Stakeholder (required)
- Outcome/Ergebnis (required)
- Done-Kriterium (optional)
- Kurzer Prozesszweck (optional)
- Häufigkeit (optional, grob): Wie oft tritt der Prozess auf? (täglich, wöchentlich, monatlich, etc.)
- Typische Durchlaufzeit (optional, grob): Wie lange dauert ein typischer Fall vom Start bis zum Ergebnis?

**Warum zuerst?** Ohne klaren Start und Ende ist der Prozess nicht vollständig definiert.

**Hinweis zu Häufigkeit und Durchlaufzeit:**
Diese beiden Fragen sind bewusst grob gehalten und erlauben Unsicherheit („Unbekannt" oder „Variiert" sind gültige Antworten).
Ziel ist nicht exakte Messung, sondern eine erste Einordnung für:
- **Priorisierung:** Hochfrequente Prozesse haben oft größeres Optimierungspotenzial
- **Automatisierung:** Kombinationen wie „täglich + Minuten/Stunden" deuten auf gute Automatisierungskandidaten hin
- **Fokussierung:** Hilft Teams, realistische Erwartungen zu setzen (z.B. „variiert stark" signalisiert höhere Komplexität)

Keine Sorge, wenn Sie die Werte nicht genau kennen – eine grobe Schätzung ist völlig ausreichend.

---

### 2. **Happy Path** (Hauptablauf)
**Ziel:** Die typischen 5-15 Hauptschritte erfassen

**Erfasst:**
- Liste von Schritten über einen visuellen Step-Builder
- Reihenfolge wird durch Up/Down-Buttons angepasst

**Erfassungs-Features:**
- **Einzeln hinzufügen:** Feld "Nächster Schritt" + Button "Hinzufügen"
- **Umsortieren:** Up/Down-Buttons zum Umordnen der Schritte
- **Löschen:** Einzelne Schritte können entfernt werden
- **Aus Text einfügen:** Nummerierte Listen aus Excel/Workshop-Notizen können direkt eingefügt werden (Ersetzen oder Anhängen)

**Parsing-Regeln:**
- Beim Text-Einfügen: Multiline-String wird in Schritte aufgeteilt (split by `\n`)
- Leere Zeilen werden ignoriert
- Nummerierungen (1., 2., -, •) werden automatisch entfernt
- Jeder Schritt erhält eine UUID und `order`-Nummer

**Best Practice:**
- Empfohlen: 5-15 Schritte (passt auf eine Seite)
- Bei > 15 Schritten: System zeigt Hinweis auf Unterprozessbildung
- Minimum: 5 Schritte (für sinnvolle Prozessabbildung)

---

### 3. **Roles** (Beteiligte)
**Ziel:** Alle Rollen, Personen, Abteilungen oder Systeme identifizieren

**Erfasst:**
- Liste von Rollen
- Art: Person / Rolle / Org-Unit / System

**Verwendung:**
- Basis für Swimlanes in BPMN
- Zuordnung zu Schritten (wer macht was?)

---

### 4. **Decisions** (Entscheidungen)
**Ziel:** Verzweigungen und Varianten im Prozess erfassen

**Erfasst:**
- Entscheidungspunkte mit Zuordnung zu Schritten
- Format: "3: Betrag > 10.000 EUR?" (Schrittnummer 1-basiert)
- Alternativ: "nach Rechnung prüfen: Betrag korrekt?"
- Gateway-Typ: XOR (exklusiv) / AND (parallel) / OR (inklusiv) - Standard: XOR
- Branches werden initial als "Ja/Nein" Platzhalter angelegt

**Parsing-Regeln:**
- Pattern "Nummer: Frage" → Zuordnung zu Schritt mit dieser Order-Nummer
- Pattern "nach Label: Frage" → Zuordnung zu Schritt mit diesem Label
- Ohne Zuordnung → Wird letztem Schritt zugeordnet (erzeugt Semantic-Question)

**Hinweis:** Nicht alle Prozesse haben Entscheidungen. Phase ist optional, aber wichtig für Vollständigkeit.

---

### 5. **Exceptions** (Ausnahmen)
**Ziel:** Fehler- und Ausnahmefälle dokumentieren

**Erfasst:**
- Was passiert bei fehlenden Daten?
- Was passiert bei Zeitüberschreitungen?
- Welche typischen Fehler können auftreten?

**Kategorien:**
- missing_data
- timeout
- error
- cancellation
- compliance
- other

**Verwendung:**
- Basis für BPMN Error-Events, Boundary-Events
- Vollständigkeitsprüfung für Semantik-Review

---

### 6. **Data & IT** (Daten und Systeme)
**Ziel:** IT-Systeme und Datenobjekte erfassen

**Erfasst:**
- IT-Systeme (z.B. SAP ERP, CRM, E-Mail)
- Datenobjekte (z.B. Auftrag, Rechnung, Kundendaten)
- Art: document / dataset / form / other

**Verwendung:**
- Basis für BPMN Data Objects, Data Stores
- Digitalisierungs- und Automatisierungsanalyse

---

### 7. **KPIs** (Kennzahlen)
**Ziel:** 1-3 Kennzahlen zur Prozessperformance definieren

**Erfasst:**
- KPI-Name (z.B. "Durchlaufzeit")
- Definition (z.B. "Zeit von Anfrage bis Angebot")
- Einheit (z.B. "Stunden")
- Zielwert (z.B. "< 48")

**Verwendung:**
- Basis für Monitoring und kontinuierliche Verbesserung
- Nicht Teil von BPMN, aber wichtig für Prozessmanagement

---

### 8. **Automatisierung** (Automatisierungs- und KI-Reife)
**Ziel:** Einschätzen, wie gut der Prozess automatisiert werden kann

**Erfasst:**
- Standardisierung (low / medium / high)
- Datenverfügbarkeit (low / medium / high)
- Prozessvariabilität (low / medium / high)
- Compliance-Risiko (low / medium / high)
- Automatisierungsideen (optional, als Liste)

**Verwendung:**
- Priorisierung von Automatisierungsprojekten
- Vorbereitung für RPA, AI, Workflow-Automatisierung

---

### 9. **Review** (Abschluss und Qualitätsprüfung)
**Ziel:** Automatisch generierte Qualitäts-Hinweise durchgehen

**Keine Eingabe, sondern Ausgabe:**
- Naming-Findings (Benennungshinweise)
- Semantic-Questions (Inhaltliche Prüffragen)

**Beispiele:**
- "Schritt 'Prüfung' sollte aus Substantiv + Verb bestehen"
- "Sind alle Rollen vollständig, oder gibt es unsichtbare Beteiligte?"

---

## Draft-Datenmodell

### Warum "Draft" statt direkt BPMN?
- Einsteiger sollen nicht mit BPMN-Syntax kämpfen müssen
- Draft ist einfacher zu editieren und zu verstehen
- Export nach BPMN erfolgt erst, wenn Draft vollständig ist

### CaptureDraft-Struktur
```typescript
{
  draftVersion: 'capture-draft-v1',
  happyPath: CaptureDraftStep[],      // Hauptschritte mit Reihenfolge
  decisions: CaptureDraftDecision[],   // Verzweigungen
  exceptions: CaptureDraftException[], // Ausnahmen
  notes?: string[]                     // Freie Notizen
}
```

### CaptureDraftStep
```typescript
{
  stepId: string,           // UUID
  order: number,            // 1, 2, 3, ... (1-basiert!)
  label: string,            // "Rechnung prüfen"
  roleId?: string,          // Referenz auf sidecar.roles
  systemId?: string,        // Referenz auf sidecar.systems
  workType?: WorkType,      // manual | user_task | service_task | ai_assisted | unknown
  dataIn?: string[],        // IDs von Eingabe-Datenobjekten
  dataOut?: string[],       // IDs von Ausgabe-Datenobjekten
  painPointHint?: string    // Optional: "Hier dauert es immer sehr lange"
}
```

### CaptureDraftDecision
```typescript
{
  decisionId: string,
  afterStepId: string,              // Nach welchem Schritt?
  gatewayType: 'xor' | 'and' | 'or',
  question: string,                 // "Betrag > 10.000 EUR?"
  branches: [
    {
      branchId: string,
      conditionLabel: string,       // "Ja" / "Nein" / "> 10.000"
      nextStepId?: string,          // Wohin führt dieser Zweig?
      endsProcess?: boolean,        // Endet hier der Prozess?
      notes?: string
    }
  ]
}
```

### CaptureDraftException
```typescript
{
  exceptionId: string,
  relatedStepId?: string,           // Optional: Welcher Schritt betroffen?
  type: ExceptionType,              // missing_data | timeout | error | ...
  description: string,              // "Fehlende Kundendaten"
  handling: string                  // "Rückfrage beim Kunden"
}
```

---

## Wizard Engine (Logik)

### getCurrentPhase(version)
- Prüft `captureProgress.phaseStates`
- Gibt die erste Phase zurück, die nicht `done` ist
- Wenn alle Phasen `done`: gibt `review` zurück

### getNextQuestions(process, version, max)
- Ermittelt aktuelle Phase
- Lädt Fragen für diese Phase aus `wizardSpec`
- Filtert bereits beantwortete Fragen
- Gibt max. `max` Fragen zurück (Priorität: required > optional)

### applyAnswers(process, version, answers)
- Validiert jede Antwort (minLen, maxLen, pattern, required)
- Parsed spezielle Formate:
  - `list`-Typ: String → Array (split by `\n`)
  - `happyPath`: Array → CaptureDraftStep[] (mit UUIDs)
  - `roles`, `systems`, `dataObjects`: Array → strukturierte Objekte
- Schreibt Werte in Zielstrukturen (process, version, draft, sidecar)
- Aktualisiert `captureProgress`:
  - Wenn alle required beantwortet: Phase → `done`
  - Sonst: Phase → `in_progress`
- Gibt zurück:
  - `versionPatch`: Änderungen für ProcessVersion
  - `updatedCaptureProgress`: Neuer Progress-Status
  - `errors`: Array von Validierungsfehlern

### generateQualityFindings(process, version)
- **Naming-Findings** (Heuristiken):
  - Trigger/Outcome sollten als Zustand formuliert sein
  - Steps sollten aus Substantiv + Verb bestehen
  - Warnung bei Ein-Wort-Steps
- **Semantic-Questions** (Heuristiken):
  - "Ist der Prozess wirklich End-to-End?"
  - "Sind alle Rollen vollständig?"
  - "Fehlen Entscheidungen?"
  - "Gibt es Medienbrüche?"
- Gibt `Partial<ModelQuality>` zurück (merged mit bestehendem Quality-Objekt)

---

## Parsing-Regeln

### Listen-Input (type: 'list')
**Eingabe:**
```
Kundenanfrage erfassen
Verfügbarkeit prüfen
Angebot erstellen
```

**Parsing:**
```typescript
const lines = input.split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0);
// → ['Kundenanfrage erfassen', 'Verfügbarkeit prüfen', 'Angebot erstellen']
```

### Happy-Path-Steps
**Eingabe:** Array von Strings
**Output:** Array von CaptureDraftStep
```typescript
steps.map((label, index) => ({
  stepId: crypto.randomUUID(),
  order: index + 1,  // 1-basiert!
  label
}))
```

### Decisions
**Eingabe:** Array von Strings mit Format "Nummer: Frage" oder "nach Label: Frage"
**Output:** Array von CaptureDraftDecision
```typescript
// Beispiel: "3: Betrag > 10.000 EUR?"
{
  decisionId: crypto.randomUUID(),
  afterStepId: happyPath.find(s => s.order === 3)?.stepId,
  gatewayType: 'xor',
  question: 'Betrag > 10.000 EUR?',
  branches: [
    { branchId: uuid, conditionLabel: 'Ja' },
    { branchId: uuid, conditionLabel: 'Nein' }
  ]
}
```

### Rollen/Systeme/Daten
**Eingabe:** Array von Strings
**Output:** Strukturierte Objekte mit UUIDs
```typescript
roles.map(name => ({
  id: crypto.randomUUID(),
  name,
  kind: 'role'  // default
}))
```

---

## Vollständigkeitsprüfung

### Automatisch (Engine)
- Sind alle `required`-Fragen beantwortet?
- Sind Antworten nicht leer (`undefined`, `null`, `''`, `[]`)?
- Sind Validierungen erfüllt (minLen, maxLen, pattern)?

### Manuell (Review-Phase)
- Semantische Fragen durchgehen
- Naming-Findings prüfen
- Vollständigkeit inhaltlich bewerten

---

## Schritt-Details Editor

### Warum Schritt-Details wichtig sind

Nach der initialen Erfassung des Happy Path können pro Schritt zusätzliche Details erfasst werden:

- **Rolle**: Wer führt diesen Schritt aus? (Zuordnung zu erfassten Rollen)
- **System**: Welches IT-System wird verwendet? (Zuordnung zu erfassten Systemen)
- **WorkType**: Wie wird dieser Schritt durchgeführt?
- **Pain-Point**: Gibt es bekannte Probleme oder Engpässe bei diesem Schritt?

### WorkType-Kategorien

Der WorkType beschreibt die Art der Durchführung und hilft bei der Automatisierungsanalyse:

| WorkType | Bedeutung | Beispiel |
|----------|-----------|----------|
| **manual** | Komplett manuell, ohne IT-Unterstützung | Telefonanruf, physische Unterschrift |
| **user_task** | Vom Menschen durchgeführt, aber IT-unterstützt | Daten in System eingeben, E-Mail schreiben |
| **service_task** | Vollautomatisch durch System/Integration | API-Aufruf, automatische Berechnung |
| **ai_assisted** | KI-unterstützt (Vorschläge, aber Mensch entscheidet) | KI schlägt Kategorie vor, Mensch bestätigt |
| **unknown** | Noch nicht bekannt/definiert | - |

### Verwendung in BPMN

- **Rolle** → wird zu BPMN Swimlane/Pool
- **System** → wird zu BPMN Participant oder Annotation
- **WorkType** → beeinflusst Task-Typ:
  - `manual` → Manual Task
  - `user_task` → User Task
  - `service_task` → Service Task
  - `ai_assisted` → User Task mit Annotation
- **Pain-Point** → wird zu BPMN Annotation (Text-Note)

### Vorteile der Detaillierung

1. **Verantwortlichkeiten**: Klare Zuordnung, wer was macht
2. **Automatisierungspotenzial**: Schnell erkennen, welche Schritte automatisiert werden können
3. **Digitalisierungsgrad**: Übersicht über manuelle vs. digitale Schritte
4. **Engpässe identifizieren**: Pain-Points sammeln für Verbesserungsmaßnahmen

### Quick Actions

Um Zeit zu sparen, können Rolle oder System für alle Schritte auf einmal gesetzt werden:

- **Rolle für alle setzen**: Wenn ein Prozess von einer einzigen Rolle durchgeführt wird
- **System für alle setzen**: Wenn alle Schritte im gleichen System stattfinden

Diese Actions setzen nur den initialen Wert - einzelne Schritte können danach individuell angepasst werden.

### Geführte Schritt-Anreicherung

Für Einsteiger steht zusätzlich zur Tabellen-Ansicht ein **geführter Assistent** zur Verfügung:

- **Schritt-für-Schritt-Führung**: Der Assistent zeigt immer genau einen Schritt mit Progress-Anzeige (z.B. "Schritt 3 von 8")
- **Einfache Zuordnung**: Für jeden Schritt können Rolle, System und Arbeitstyp über Dropdown-Felder zugeordnet werden
- **Keine Überforderung**: Fokus auf einen Schritt, ohne die Übersicht über alle Schritte zu verlieren
- **Navigation**: Vor/Zurück-Buttons zum schrittweisen Durchgehen
- **Speichern**: Zentrale Speicherung aller Änderungen über einen Speichern-Button

**Empfehlung für Einsteiger**: Nutzen Sie den geführten Assistenten nach Abschluss des Skeletts. Nach dem Button "Skelett abgeschlossen" wählen Sie "Schritte anreichern (Rolle/System)" um direkt zum Assistenten zu gelangen.

Der Assistent und die Tabellen-Ansicht können parallel genutzt werden - Änderungen werden in beiden Ansichten synchron gehalten.

### Quelle (Evidence)

Optional kann für jeden Schritt eine **Quelle (Snippet)** erfasst werden:

- **Zweck**: Nachvollziehbarkeit und Vertrauen durch Dokumentation der Informationsquelle
- **Format**: Freitext (z.B. Zitat aus Workshop, Verweis auf Dokument, Notiz)
- **Verwendung**: In der Schritt-Details Tabelle als eigene Spalte
- **Anzeige**: Button "Quelle anzeigen" öffnet Modal mit lesbarer Ansicht
- **Status**: In dieser Version nur textbasierte Evidence; Audio-Quellen mit Zeitmarken folgen später

**Best Practice**: Nutzen Sie Evidence für kritische oder strittige Punkte, um bei Rückfragen oder Freigaben auf konkrete Quellen verweisen zu können. Beispiel: `Workshop 2024-01-15, Max (Fachabteilung): "Schritt dauert ca. 2h wegen manueller Prüfung"`

Weitere Details siehe [docs/EVIDENCE.md](./EVIDENCE.md).

---

## Zusammenfassung

| Phase | Pflichtfelder | Ziel |
|-------|---------------|------|
| **Scope** | trigger, customer, outcome | Prozess abgrenzen |
| **Happy Path** | steps (Liste, min. 5) | Hauptablauf erfassen |
| **Roles** | roles (Liste, min. 1) | Beteiligte identifizieren |
| **Decisions** | optional | Verzweigungen erfassen |
| **Exceptions** | optional | Ausnahmen dokumentieren |
| **Data & IT** | optional | Systeme und Daten erfassen |
| **KPIs** | optional | Kennzahlen definieren |
| **Automatisierung** | optional | KI-Reife einschätzen |
| **Review** | keine Eingabe | Qualität prüfen |

**Ergebnis:** Ein strukturiertes `CaptureDraft`-Objekt, das als Grundlage für BPMN-Export, Prozessbewertung und weitere Analysen dient.

---

## Entscheidungen & Ausnahmen im Draft bearbeiten

Nach der Erfassung im Wizard können Entscheidungen und Ausnahmen im **Draft-Tab** visuell bearbeitet werden.

### Entscheidungen (Decisions)

**Zweck:** Verzweigungen im Prozessablauf definieren (z.B. „Ist der Betrag über 1000 EUR?")

**Bearbeitbare Felder:**
- **Nach Schritt:** Wählen Sie den Schritt, nach dem die Entscheidung erfolgt
- **Gateway-Typ:** XOR (exklusiv), AND (parallel), OR (inklusiv)
- **Frage:** Das Entscheidungskriterium
- **Quelle (Snippet):** Optional - Nachweis der Entscheidungsgrundlage (z.B. Zitat aus Workshop)
- **Branches:** Verzweigungen mit:
  - Bedingung/Label (z.B. „Ja", „Nein", „> 1000 EUR")
  - Folgeschritt (Dropdown-Auswahl) ODER
  - „Prozess endet hier" (Checkbox)

**Evidence-Snippet:**
- Optional erfassbar für bessere Nachvollziehbarkeit
- Wichtig für Freigabeprozesse und Workshop-Nachbereitung
- Button "Quelle anzeigen" öffnet Modal mit lesbarer Ansicht
- Aktuell nur Text-Snippets (z.B. "Workshop 2024-01-15: 'Grenze liegt bei 1000 EUR laut Richtlinie'")

**Warum wichtig für BPMN:**
- Branches ohne Zielschritt oder Prozessende können nicht exportiert werden
- Jeder Branch muss entweder zu einem bestehenden Schritt führen oder als Ende markiert sein
- Die Verknüpfung ermöglicht korrekte Gateway-Darstellung im BPMN-Diagramm

### Ausnahmen (Exceptions)

**Zweck:** Fehler, Störungen und Sonderfälle dokumentieren

**Bearbeitbare Felder:**
- **Bezugsschritt:** Optional - Welcher Schritt ist betroffen?
- **Typ:** missing_data, timeout, error, cancellation, compliance, other
- **Beschreibung:** Was genau kann schiefgehen?
- **Handling:** Wie wird die Ausnahme behandelt?
- **Quelle (Snippet):** Optional - Nachweis der Ausnahme (z.B. Zitat aus Workshop)

**Evidence-Snippet:**
- Optional erfassbar für bessere Nachvollziehbarkeit
- Dokumentiert, woher das Wissen über die Ausnahme stammt
- Button "Quelle anzeigen" öffnet Modal mit lesbarer Ansicht
- Aktuell nur Text-Snippets (z.B. "Workshop 2024-01-15: 'Tritt ca. 2x pro Monat auf, dann Eskalation an IT'")

**Warum wichtig für BPMN:**
- Vollständig dokumentierte Ausnahmen können als Error Events exportiert werden
- Handling-Informationen fließen in Prozessdokumentation ein
- Basis für Risikobewertung und Automatisierungsplanung

### Persistierung

Alle Änderungen werden in `version.sidecar.captureDraft` gespeichert (IndexedDB) und bleiben nach Reload erhalten.

### Qualitätsprüfung

Der Review-Tab zeigt Warnungen, wenn:
- Branches ohne Zielschritt oder Prozessende existieren
- Entscheidungen auf nicht existierende Schritte verweisen
- Ausnahmen unvollständig beschrieben sind

---

**Status:** Der Wizard ist vollständig implementiert. BPMN-Export und Prozessbewertung (Assessment) sind verfügbar.

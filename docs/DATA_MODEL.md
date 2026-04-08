# Datenmodell: Prozessaufnahme-App

## Überblick

Das Datenmodell folgt dem Prinzip **"BPMN + Sidecar"**:
- **BPMN XML** enthält die standardkonforme Prozesslogik (interoperabel mit anderen Tools)
- **Sidecar-Metadaten** speichern zusätzliche Informationen für Digitalisierung, KI-Reife und Automatisierung

Alle Daten werden **lokal in IndexedDB** gespeichert (offline-first).

---

## Entitäten und Hierarchie

```
Project (Projekt)
  └── Process (Prozess)
       └── ProcessVersion (Prozessversion)
```

### Warum Versionierung?
- Ermöglicht Arbeitsstände (Draft, Review, Published)
- Historie bleibt nachvollziehbar
- Mehrere Personen können parallel an verschiedenen Versionen arbeiten
- Rollback bei Bedarf möglich

---

## Entität: Project

**Zweck:** Organisatorische Klammer für zusammengehörige Prozesse (z.B. "Vertriebsprozesse 2024")

```typescript
interface Project {
  projectId: string;          // UUID
  name: string;               // z.B. "Vertriebsprozesse 2024"
  description?: string;
  createdAt: string;          // ISO 8601
  updatedAt: string;
}
```

**Repositories-Methoden:**
- `createProject(name)`
- `listProjects()`
- `getProject(projectId)`

---

## Entität: Process

**Zweck:** Repräsentiert einen konkreten Prozess mit Metadaten (aber ohne Versionsdetails)

```typescript
interface Process {
  processId: string;                          // UUID
  projectId: string;                          // Fremdschlüssel zu Project

  // Einordnung
  title: string;                              // z.B. "Auftragsabwicklung"
  category: ProcessCategory;                  // 'steuerung' | 'kern' | 'unterstuetzung'
  managementLevel: ProcessManagementLevel;    // 'strategisch' | 'fachlich' | 'technisch'
  hierarchyLevel: ProcessHierarchyLevel;      // 'landkarte' | 'hauptprozess' | 'unterprozess'

  // Hierarchie
  parentProcessId: string | null;             // null = Hauptprozess, sonst ID des Elternprozesses

  // Metadaten
  createdAt: string;
  updatedAt: string;
}
```

**Hierarchie-Regel:**
- **Hauptprozess:** `parentProcessId = null`, `hierarchyLevel = 'hauptprozess'`
- **Unterprozess:** `parentProcessId = <ID des Hauptprozesses>`, `hierarchyLevel = 'unterprozess'`
- **Landkarte:** Spezialfall für Übersichtsprozesse, meist `parentProcessId = null`

**Repositories-Methoden:**
- `createProcess(projectId, coreMeta)`
- `listProcesses(projectId)`
- `getProcess(processId)`
- `updateProcess(processId, patch)`

---

## Entität: ProcessVersion

**Zweck:** Konkrete Ausprägung eines Prozesses mit vollständigen Inhalten und Status

```typescript
interface ProcessVersion {
  id: string;                           // Compound-ID: `${processId}:${versionId}`
  processId: string;                    // Fremdschlüssel zu Process
  versionId: string;                    // UUID (eindeutig innerhalb des Prozesses)

  // Status und Zeitstempel
  status: ProcessStatus;                // 'draft' | 'in_review' | 'published'
  createdAt: string;
  updatedAt: string;

  // Snapshot der Kerndaten (zum Zeitpunkt der Version)
  titleSnapshot: string;

  // End-to-End Definition
  endToEndDefinition: EndToEndDefinition;

  // BPMN-Repräsentation
  bpmn: BpmnModelRef;

  // Zusätzliche Metadaten (nicht in BPMN)
  sidecar: ProcessSidecar;

  // Qualität und Review
  quality: ModelQuality;

  // Fortschritt der geführten Erfassung
  captureProgress: CaptureProgress;
}
```

**Repositories-Methoden:**
- `createVersion(processId, input)`
- `listVersions(processId)`
- `getLatestVersion(processId)`
- `updateVersion(processId, versionId, patch)`

---

## Datenstruktur: EndToEndDefinition

```typescript
interface EndToEndDefinition {
  trigger: string;              // Auslöser, z.B. "Kundenanfrage geht ein"
  customer: string;             // Prozesskunde, z.B. "Externer Kunde" oder "Vertriebsabteilung"
  outcome: string;              // Ergebnis, z.B. "Angebot versendet"
  doneCriteria?: string;        // Optional: "Kunde hat Angebot bestätigt"
}
```

---

## Datenstruktur: BpmnModelRef

```typescript
interface BpmnModelRef {
  diagramType: BpmnDiagramType;     // 'process' | 'collaboration'
  bpmnXml?: string;                 // Optional: BPMN 2.0 XML (wird später befüllt)
  lastExportedAt?: string;          // ISO 8601, wann das XML zuletzt generiert wurde
}
```

**Hinweis:** In Phase A1 bleibt `bpmnXml` leer. Export/Import kommt später.

---

## Datenstruktur: ProcessSidecar

**Zweck:** Strukturierte Metadaten für Digitalisierung, Automatisierung und KI-Reife

```typescript
interface ProcessSidecar {
  // Beteiligte Rollen und Systeme
  roles: ProcessRole[];
  systems: ProcessSystem[];

  // Datenobjekte und Dokumente
  dataObjects: ProcessDataObject[];

  // KPIs und Messgröße
  kpis: ProcessKPI[];

  // Automatisierungs-Notizen
  automationNotes?: string[];

  // KI-Reife-Signale (strukturierte Einschätzung)
  aiReadinessSignals?: AIReadinessSignals;
}

interface ProcessRole {
  id: string;                                   // UUID
  name: string;                                 // z.B. "Sachbearbeiter Vertrieb"
  kind: 'person' | 'role' | 'org_unit' | 'system';
}

interface ProcessSystem {
  id: string;
  name: string;                                 // z.B. "SAP ERP", "CRM-System"
  systemType?: string;                          // z.B. "ERP", "CRM", "DMS"
}

interface ProcessDataObject {
  id: string;
  name: string;                                 // z.B. "Auftrag", "Rechnung"
  kind: 'document' | 'dataset' | 'form' | 'other';
}

interface ProcessKPI {
  id: string;
  name: string;                                 // z.B. "Durchlaufzeit"
  definition: string;                           // z.B. "Zeit von Auftragseingang bis Versand"
  unit?: string;                                // z.B. "Tage", "Stunden"
  target?: string;                              // z.B. "< 48 Stunden"
}

interface AIReadinessSignals {
  standardization: 'low' | 'medium' | 'high';   // Wie standardisiert ist der Prozess?
  dataAvailability: 'low' | 'medium' | 'high';  // Sind digitale Daten verfügbar?
  variability: 'low' | 'medium' | 'high';       // Wie stark variiert der Prozess?
  complianceRisk: 'low' | 'medium' | 'high';    // Wie hoch ist das Compliance-Risiko?
}
```

---

## Datenstruktur: ModelQuality

**Zweck:** Speichert Syntax-Findings und Semantik-Fragen für spätere Reviews

```typescript
interface ModelQuality {
  // Automatisch prüfbare Regelverletzungen
  syntaxFindings: SyntaxFinding[];

  // Fragen zur semantischen Korrektheit (für menschliche Prüfung)
  semanticQuestions: SemanticQuestion[];

  // Benennungs- und Stilhinweise
  namingFindings: NamingFinding[];
}

interface SyntaxFinding {
  severity: 'info' | 'warn' | 'error';
  message: string;                              // z.B. "Task 'xyz' hat keinen ausgehenden Fluss"
  elementId?: string;                           // BPMN-Element-ID (falls verfügbar)
}

interface SemanticQuestion {
  id: string;
  question: string;                             // z.B. "Ist der Prozess wirklich zu Ende?"
  relatedStepHint?: string;                     // z.B. "End-Event 'Rechnung versendet'"
}

interface NamingFinding {
  severity: 'info' | 'warn';
  message: string;                              // z.B. "Schritt sollte aus Substantiv + Verb bestehen"
  exampleFix?: string;                          // z.B. "'Rechnung prüfen' statt 'Prüfung'"
}
```

**Hinweis:** In Phase A1 noch keine echten Checks implementiert, nur Datenstrukturen.

---

## Datenstruktur: CaptureProgress

**Zweck:** Trackt den Fortschritt der geführten Prozessaufnahme

```typescript
type CapturePhase =
  | 'scope'           // Einordnung und End-to-End
  | 'happy_path'      // Hauptablauf skizzieren
  | 'roles'           // Rollen und Verantwortlichkeiten
  | 'decisions'       // Entscheidungen und Gateways
  | 'exceptions'      // Ausnahmen und Fehlerbehandlung
  | 'data_it'         // Daten und IT-Systeme
  | 'kpis'            // Kennzahlen und Messung
  | 'automation'      // Automatisierungspotenziale
  | 'review';         // Finale Prüfung

type CapturePhaseState = 'not_started' | 'in_progress' | 'done';

interface CaptureProgress {
  phaseStates: Record<CapturePhase, CapturePhaseState>;
  lastTouchedAt?: string;                       // ISO 8601
}
```

**Verwendung:** UI kann zeigen, welche Phasen noch offen sind und den Nutzer leiten.

---

## Persistierung in IndexedDB

### Datenbank: `process-advisor`

**Version:** 1

**Object Stores:**

| Store | Key Path | Indices |
|-------|----------|---------|
| `projects` | `projectId` | - |
| `processes` | `processId` | `projectId` |
| `processVersions` | `id` | `processId` |

**ID-Konvention für `processVersions`:**
```
id = `${processId}:${versionId}`
```

**Beispiel:**
- `processId = "abc-123"`
- `versionId = "v1"`
- `id = "abc-123:v1"`

**Vorteil:** Compound-Key ermöglicht schnelles Abrufen einer spezifischen Version.

---

## Beispiel: ProcessVersion-Objekt (JSON)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001:v1",
  "processId": "550e8400-e29b-41d4-a716-446655440001",
  "versionId": "v1",
  "status": "draft",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T14:20:00.000Z",
  "titleSnapshot": "Auftragsabwicklung",
  "endToEndDefinition": {
    "trigger": "Kundenanfrage geht ein",
    "customer": "Externer Kunde",
    "outcome": "Auftrag abgeschlossen und Rechnung versendet",
    "doneCriteria": "Kunde hat Zahlung geleistet"
  },
  "bpmn": {
    "diagramType": "process",
    "bpmnXml": null,
    "lastExportedAt": null
  },
  "sidecar": {
    "roles": [
      {
        "id": "r1",
        "name": "Vertriebsmitarbeiter",
        "kind": "role"
      },
      {
        "id": "r2",
        "name": "SAP ERP",
        "kind": "system"
      }
    ],
    "systems": [
      {
        "id": "s1",
        "name": "SAP ERP",
        "systemType": "ERP"
      }
    ],
    "dataObjects": [
      {
        "id": "d1",
        "name": "Auftrag",
        "kind": "document"
      }
    ],
    "kpis": [
      {
        "id": "k1",
        "name": "Durchlaufzeit",
        "definition": "Zeit von Auftragseingang bis Versand",
        "unit": "Stunden",
        "target": "< 48"
      }
    ],
    "automationNotes": [
      "Automatische Bonitätsprüfung über API möglich"
    ],
    "aiReadinessSignals": {
      "standardization": "high",
      "dataAvailability": "high",
      "variability": "low",
      "complianceRisk": "medium"
    }
  },
  "quality": {
    "syntaxFindings": [],
    "semanticQuestions": [
      {
        "id": "q1",
        "question": "Ist der Prozess wirklich zu Ende, wenn die Rechnung versendet wurde?",
        "relatedStepHint": "End-Event"
      }
    ],
    "namingFindings": []
  },
  "captureProgress": {
    "phaseStates": {
      "scope": "done",
      "happy_path": "in_progress",
      "roles": "not_started",
      "decisions": "not_started",
      "exceptions": "not_started",
      "data_it": "not_started",
      "kpis": "not_started",
      "automation": "not_started",
      "review": "not_started"
    },
    "lastTouchedAt": "2024-01-15T14:20:00.000Z"
  }
}
```

---

## Warum BPMN + Sidecar?

### Vorteile
1. **Interoperabilität:** BPMN XML kann in andere Tools importiert werden (Camunda, Signavio, etc.)
2. **Standardkonformität:** Prozesslogik folgt BPMN 2.0 Standard
3. **Erweiterbarkeit:** Sidecar-Metadaten gehen nicht verloren, auch wenn andere Tools sie nicht verstehen
4. **Flexibilität:** Digitalisierungs- und KI-Metadaten können unabhängig von BPMN-Standard weiterentwickelt werden

### Trade-offs
- Zwei Datenquellen (BPMN XML + Sidecar) müssen synchron gehalten werden
- Export muss entscheiden: Nur BPMN? Oder BPMN + Sidecar als Extension?

---

## Zusammenfassung

| Entität | Zweck | Key |
|---------|-------|-----|
| **Project** | Organisiert Prozesse | `projectId` |
| **Process** | Metadaten ohne Versionsinhalte | `processId` |
| **ProcessVersion** | Vollständige Inhalte mit Status | `id` (compound) |

**Hierarchie:** Project → Process → ProcessVersion
**Speicherung:** IndexedDB (offline-first)
**Export-Ziel:** BPMN 2.0 XML + Sidecar-JSON
**Versionierung:** Draft → Review → Published

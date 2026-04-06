# BPMN Export Dokumentation

## Überblick

Die BPMN Export Funktion ermöglicht es, erfasste Prozesse als valides BPMN 2.0 XML zu exportieren, das in gängigen BPMN-Tools wie Camunda Modeler, Signavio oder bpmn.io geöffnet werden kann.

---

## Funktionsweise

### 1. Export-Logik (`src/bpmn/exportBpmn.ts`)

Die Funktion `buildBpmnXmlFromDraft()` konvertiert den `CaptureDraft` in BPMN 2.0 XML:

```typescript
export function buildBpmnXmlFromDraft(
  process: Process,
  version: ProcessVersion
): BpmnExportResult {
  // Generiert XML + Warnings
}
```

#### XML-Struktur
Das generierte XML enthält:
- **BPMN 2.0 Namespaces:** MODEL, BPMNDI, DC, DI
- **Process Element:** Mit Start Event, Tasks (verschiedene Typen), End Event
- **Lanes:** Für Rollen-Zuordnung (falls vorhanden)
- **Sequence Flows:** Verbindungen zwischen allen Elementen
- **BPMN Diagram Interchange:** Koordinaten für visuelles Layout

---

## WorkType → BPMN Task Typ Mapping

Jeder Schritt wird basierend auf seinem `workType` als spezifischer BPMN-Task-Typ exportiert:

| WorkType | BPMN Element | Bedeutung |
|----------|-------------|-----------|
| `manual` | `<bpmn:manualTask>` | Manuelle Aktivität ohne IT-Unterstützung |
| `user_task` | `<bpmn:userTask>` | Benutzer-Interaktion mit IT-System |
| `service_task` | `<bpmn:serviceTask>` | Vollautomatisierte System-Aktivität |
| `ai_assisted` | `<bpmn:userTask>` | Benutzer-Task mit KI-Unterstützung (siehe Dokumentation) |
| `unknown` / nicht gesetzt | `<bpmn:task>` | Generische Aktivität |

### Dokumentation in Tasks

Tasks können zusätzliche Dokumentation enthalten:

**System-Zuordnung:** Wenn `step.systemId` gesetzt ist, wird das System als Dokumentation hinzugefügt:
```xml
<bpmn:userTask id="Task_123" name="Auftrag erfassen">
  <bpmn:documentation>System: SAP ERP</bpmn:documentation>
</bpmn:userTask>
```

**KI-Unterstützung:** Für `workType: 'ai_assisted'`:
```xml
<bpmn:userTask id="Task_456" name="Kundenanfrage kategorisieren">
  <bpmn:documentation>KI-unterstützt</bpmn:documentation>
</bpmn:userTask>
```

**Kombiniert:** System + KI:
```xml
<bpmn:userTask id="Task_789" name="Vertragsanalyse">
  <bpmn:documentation>System: Dokumentenmanagement | KI-unterstützt</bpmn:documentation>
</bpmn:userTask>
```

---

## Rollen als Lanes

### Wann werden Lanes exportiert?

Lanes werden exportiert, wenn:
1. Mindestens eine Rolle in `version.sidecar.roles` definiert ist
2. Mindestens ein Schritt eine `roleId` zugeordnet hat

### Lane-Erstellung

- **Eine Lane pro verwendeter Rolle:** Reihenfolge nach erstem Auftreten im Happy Path
- **Lane „Unzugeordnet“:** Falls Schritte ohne `roleId` existieren
- **flowNodeRefs:** Start Event, Tasks und End Event werden den Lanes zugeordnet

### Beispiel-XML mit Lanes

```xml
<bpmn:process id="Process_xyz" name="Rechnungseingang" isExecutable="false">
  <bpmn:laneSet id="LaneSet_1">
    <bpmn:lane id="Lane_role1" name="Sachbearbeiter">
      <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
      <bpmn:flowNodeRef>Task_abc123</bpmn:flowNodeRef>
    </bpmn:lane>
    <bpmn:lane id="Lane_role2" name="Teamleiter">
      <bpmn:flowNodeRef>Task_def456</bpmn:flowNodeRef>
      <bpmn:flowNodeRef>EndEvent_1</bpmn:flowNodeRef>
    </bpmn:lane>
  </bpmn:laneSet>
  <bpmn:startEvent id="StartEvent_1" name="Start" />
  <bpmn:userTask id="Task_abc123" name="Rechnung empfangen" />
  <bpmn:userTask id="Task_def456" name="Rechnung prüfen" />
  <bpmn:endEvent id="EndEvent_1" name="End" />
  ...
</bpmn:process>
```

### Layout mit Lanes

Das visuelle Layout berücksichtigt Lanes:

**Konstanten:**
- `LANE_X = 50` - X-Position aller Lanes
- `LANE_Y0 = 60` - Y-Position der ersten Lane
- `LANE_HEIGHT = 140` - Höhe jeder Lane
- `LANE_GAP = 20` - Abstand zwischen Lanes
- `TASK_Y_OFFSET = 30` - Vertikaler Offset der Tasks innerhalb der Lane

**Positionierung:**
- Tasks werden innerhalb ihrer zugeordneten Lane platziert
- Diagonale Kanten zwischen Lanes sind möglich
- Start/End Events befinden sich in der Lane des ersten/letzten Schritts

**BPMNDI Lane Shapes:**
```xml
<bpmndi:BPMNShape id="Lane_role1_di" bpmnElement="Lane_role1" isHorizontal="true">
  <dc:Bounds x="50" y="60" width="1200" height="140" />
</bpmndi:BPMNShape>
```

### Ohne Rollen-Zuordnung

Falls keine Rollen zugeordnet sind:
- Kein `<bpmn:laneSet>` Element
- Alle Tasks in einer horizontalen Linie (wie zuvor)
- Layout: `y = 80` für alle Tasks

---

## Phase B4: Happy Path mit Task-Typen & Lanes

### Was wird exportiert
- ✅ Start Event
- ✅ Tasks aus `captureDraft.happyPath` mit spezifischen Typen (manualTask, userTask, serviceTask)
- ✅ System-Dokumentation in Tasks (falls `systemId` gesetzt)
- ✅ KI-Dokumentation für `ai_assisted` Tasks
- ✅ End Event
- ✅ Lanes für Rollen (falls Rollen zugeordnet sind)
- ✅ Sequence Flows
- ✅ Vollständiges Diagram Layout (DI) mit Lanes

### Was wird NICHT exportiert (B4)
- ❌ Decisions → Keine Gateways (XOR/AND/OR) - kommt in B5
- ❌ Exceptions → Keine Error/Escalation Events - kommt in C1
- ❌ Data Objects → Keine Datenobjekte
- ❌ Pools für externe Partner

### Warnings (B4)
Das System gibt automatisch Warnungen aus:

1. **Kein Happy Path:** "Kein Happy Path vorhanden – BPMN wird nicht generiert."
2. **Decisions vorhanden:** "Entscheidungen sind im Draft erfasst, werden aber im Export (B4) noch nicht als Gateways abgebildet."
3. **Exceptions vorhanden:** "Ausnahmen sind im Draft erfasst, werden aber im Export (B4) noch nicht als Events abgebildet."

---

## Phase B5: XOR-Entscheidungen als Exclusive Gateways

### Überblick

Ab Phase B5 werden Entscheidungen aus `captureDraft.decisions` als BPMN Gateways exportiert:

- **XOR-Gateways:** `gatewayType: 'xor'` → `<bpmn:exclusiveGateway>`
- **Branch-Flows:** Branches werden als benannte `sequenceFlow` exportiert
- **Layout:** Gateways werden zwischen Tasks positioniert mit vollständigem DI-Layout

### Mapping: Decision → BPMN Gateway

#### Decision-Struktur
```typescript
{
  decisionId: "dec_123",
  afterStepId: "step_456",      // Gateway kommt NACH diesem Schritt
  gatewayType: "xor",            // nur XOR wird in B5 unterstützt
  question: "Betrag > 10.000?",  // wird zu Gateway-Name
  branches: [
    {
      branchId: "branch_1",
      conditionLabel: "Ja",      // wird zu Flow-Name
      nextStepId: "step_789",    // Ziel-Schritt
      endsProcess: false
    },
    {
      branchId: "branch_2",
      conditionLabel: "Nein",
      endsProcess: true          // führt zu EndEvent
    }
  ]
}
```

#### BPMN Output
```xml
<bpmn:exclusiveGateway id="Gateway_dec_123"
                       name="Betrag &gt; 10.000?"
                       gatewayDirection="Diverging" />

<bpmn:sequenceFlow id="Flow_4"
                   name="Ja"
                   sourceRef="Gateway_dec_123"
                   targetRef="Task_step_789" />

<bpmn:sequenceFlow id="Flow_5"
                   name="Nein"
                   sourceRef="Gateway_dec_123"
                   targetRef="EndEvent_1" />
```

### Validierung & Warnungen

Der Export validiert alle Decisions und gibt spezifische Warnungen aus:

#### Ignorierte Decisions

1. **Ungültiges afterStepId:**
   - Warning: "Entscheidung X verweist auf unbekannten Schritt Y - wird ignoriert"
   - Grund: afterStepId existiert nicht im Happy Path

2. **Nicht unterstützter Gateway-Typ:**
   - Warning: "Entscheidung X mit Typ AND/OR wird noch nicht unterstützt (nur XOR) - wird ignoriert"
   - Grund: AND/OR Gateways kommen in Phase C2

3. **Mehrere Decisions nach gleichem Schritt:**
   - Warning: "Mehrere Entscheidungen nach Schritt X gefunden - nur die erste wird exportiert"
   - Grund: BPMN erlaubt nur ein Gateway pro Ausgang

#### Ignorierte Branches

4. **Branch ohne Ziel:**
   - Warning: "Branch X hat weder nextStepId noch endsProcess - wird ignoriert"
   - Grund: Branch muss entweder zu einem Schritt oder zum Ende führen

5. **Branch mit ungültigem nextStepId:**
   - Warning: "Branch X verweist auf unbekannten Schritt Y - wird ignoriert"
   - Grund: nextStepId existiert nicht im Happy Path

6. **Rücksprung (Loop):**
   - Warning: "Branch X führt zurück zu Schritt Y. Schleifen werden exportiert, Layout bitte prüfen."
   - Grund: Rücksprünge werden ab Phase C2 exportiert, aber das Layout ist bewusst einfach gehalten

7. **Decision ohne gültige Branches:**
   - Warning: "Entscheidung X hat keine gültigen Branches - wird ignoriert"
   - Grund: Alle Branches waren ungültig

#### Auto-Ergänzung

8. **Fehlender Default-Branch:**
   - Warning: "Entscheidung nach Schritt X hatte keinen Branch zum nächsten Standardschritt; 'Weiter'-Branch wurde ergänzt"
   - Grund: Wenn kein Branch zum sequenziell nächsten Schritt führt, wird automatisch ein "Weiter"-Branch hinzugefügt
   - Verhindert: Deadlocks im BPMN-Diagramm

### Layout & Positionierung

#### Gateway-Position
```typescript
// Gateway wird zwischen Task und nächstem Element positioniert
const gatewayX = afterTaskBounds.x + 145;  // 145px rechts vom Task
const centerY = afterTaskBounds.y + 40;    // vertikal zentriert mit Task
const gatewayY = centerY - 25;             // Gateway ist 50x50px

// Bounds: x, y, width=50, height=50
```

#### Lane-Zuordnung
- Gateway wird in der gleichen Lane platziert wie der `afterStep`
- Gateway-ID wird zu `flowNodeRefs` der Lane hinzugefügt

#### DI-Shapes
```xml
<bpmndi:BPMNShape id="Gateway_dec_123_di"
                  bpmnElement="Gateway_dec_123"
                  isMarkerVisible="true">
  <dc:Bounds x="345" y="105" width="50" height="50" />
</bpmndi:BPMNShape>
```

**Hinweis:** `isMarkerVisible="true"` ist wichtig für die Darstellung in BPMN-Editoren.

#### Edge-Berechnung
Edges werden aus dem `boundsByElementId`-Index berechnet:

```typescript
// Waypoints: Von Mitte rechts der Source zu Mitte links des Targets
const wp1x = sourceBounds.x + sourceBounds.w;   // rechter Rand
const wp1y = sourceBounds.y + sourceBounds.h / 2; // vertikal zentriert
const wp2x = targetBounds.x;                     // linker Rand
const wp2y = targetBounds.y + targetBounds.h / 2; // vertikal zentriert
```

### Nicht unterstützt in B5

**AND/OR Gateways:**
- Parallelisierung (AND-Split/Join)
- Inklusives Gateway (OR)
- Warning wird ausgegeben, Export enthält nur Happy Path

**Merge-Gateways:**
- Automatisches Merge (Zusammenführung mehrerer Branches) wird noch nicht modelliert
- Mehrere eingehende Flows auf Tasks sind zulässig, aber kein explizites Merge-Gateway

**Loops / Rücksprünge:**
- Ab Phase C2 werden Rücksprünge (Loops) exportiert
- Branches mit `nextStepId` zurück zu früheren Schritten erzeugen gültige Sequence Flows
- Warning wird ausgegeben, dass das Layout bei Loops unübersichtlich sein kann
- Kantenrouting ist bewusst einfach gehalten (direkte Verbindungen ohne ausgefeilte Kurven)

**Event-basierte Gateways:**
- Kommen in Phase C1 zusammen mit Exception-Events

### Beispiel: Vollständiger Export mit Gateway

#### Input
```json
{
  "captureDraft": {
    "happyPath": [
      { "stepId": "s1", "order": 1, "label": "Antrag empfangen" },
      { "stepId": "s2", "order": 2, "label": "Bonität prüfen" },
      { "stepId": "s3", "order": 3, "label": "Kredit genehmigen" }
    ],
    "decisions": [
      {
        "decisionId": "d1",
        "afterStepId": "s2",
        "gatewayType": "xor",
        "question": "Bonität ausreichend?",
        "branches": [
          { "branchId": "b1", "conditionLabel": "Ja", "nextStepId": "s3" },
          { "branchId": "b2", "conditionLabel": "Nein", "endsProcess": true }
        ]
      }
    ]
  }
}
```

#### Output (vereinfacht)
```xml
<bpmn:process id="Process_xyz" name="Kreditantrag">
  <bpmn:startEvent id="StartEvent_1" name="Start" />

  <bpmn:task id="Task_s1" name="Antrag empfangen" />
  <bpmn:task id="Task_s2" name="Bonität prüfen" />
  <bpmn:exclusiveGateway id="Gateway_d1" name="Bonität ausreichend?" gatewayDirection="Diverging" />
  <bpmn:task id="Task_s3" name="Kredit genehmigen" />

  <bpmn:endEvent id="EndEvent_1" name="End" />

  <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_s1" />
  <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_s1" targetRef="Task_s2" />
  <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_s2" targetRef="Gateway_d1" />
  <bpmn:sequenceFlow id="Flow_4" name="Ja" sourceRef="Gateway_d1" targetRef="Task_s3" />
  <bpmn:sequenceFlow id="Flow_5" name="Nein" sourceRef="Gateway_d1" targetRef="EndEvent_1" />
  <bpmn:sequenceFlow id="Flow_6" sourceRef="Task_s3" targetRef="EndEvent_1" />
</bpmn:process>
```

### Testing

**Self-Test Coverage (B5):**
- ✅ XOR-Gateway wird exportiert
- ✅ Branch-Flows mit Namen (conditionLabel)
- ✅ Branch zu EndEvent (endsProcess: true)
- ✅ Gateway-Shape mit `isMarkerVisible="true"`
- ✅ Edges zwischen Tasks und Gateway
- ✅ Validierungswarnungen für ungültige Decisions

**Manueller Test:**
1. Erfasse Happy Path mit mindestens 4 Schritten
2. Füge XOR-Decision nach Schritt 2 hinzu
3. Branch A: führt zu Schritt 3
4. Branch B: endsProcess = true
5. BPMN generieren und in Camunda Modeler öffnen
6. Erwartung: Gateway-Diamant mit zwei Abgängen ("Branch A", "Branch B")
7. Branch B führt direkt zum End-Event

---

## UI Integration

### Draft Tab: BPMN Export Sektion
Enthält:
- **Button "BPMN generieren":** Generiert XML und speichert in IndexedDB
- **Button "Download .bpmn":** Lädt XML-Datei herunter (sanitized filename)
- **Warnings Anzeige:** Gelbe Box mit allen Warnungen
- **XML Vorschau:** Readonly Textarea mit vollständigem XML

### Workflow
1. Nutzer erfasst Happy Path im Wizard
2. Nutzer ordnet Rollen zu (Setup Tab)
3. Nutzer setzt `roleId` und `workType` in Schritt-Details (Draft Tab)
4. Klick auf "BPMN generieren"
5. System zeigt Warnings (falls vorhanden) und XML Vorschau
6. Klick auf "Download .bpmn"
7. Datei wird als `Prozessname.bpmn` heruntergeladen
8. Import in Camunda Modeler zeigt Lanes und Task-Typen

---

## Validierung & Kompatibilität

### XML Entities
Alle Task-Namen und Rollen-Namen werden escaped:
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&apos;`

### BPMN 2.0 Compliance
Das generierte XML ist konform mit:
- BPMN 2.0 Specification
- BPMN Task Types (manualTask, userTask, serviceTask)
- BPMN Lanes (laneSet, lane, flowNodeRef)
- BPMN Diagram Interchange (DI)
- OMG Diagram Definition (DD) für Koordinaten

### Getestet mit
- ✅ Camunda Modeler (zeigt Task-Typen und Lanes korrekt an)
- ✅ bpmn.io (online viewer)

---

## Beispiel-Export

### Input: CaptureDraft mit Rollen und WorkTypes
```json
{
  "sidecar": {
    "roles": [
      { "id": "role1", "name": "Sachbearbeiter", "kind": "role" },
      { "id": "role2", "name": "Teamleiter", "kind": "role" }
    ],
    "systems": [
      { "id": "sys1", "name": "SAP ERP", "systemType": "ERP" }
    ]
  },
  "captureDraft": {
    "happyPath": [
      {
        "stepId": "abc123",
        "order": 1,
        "label": "Rechnung empfangen",
        "roleId": "role1",
        "workType": "user_task",
        "systemId": "sys1"
      },
      {
        "stepId": "def456",
        "order": 2,
        "label": "Rechnung prüfen",
        "roleId": "role1",
        "workType": "manual"
      },
      {
        "stepId": "ghi789",
        "order": 3,
        "label": "Zahlung freigeben",
        "roleId": "role2",
        "workType": "user_task"
      }
    ]
  }
}
```

### Output: BPMN XML (vereinfacht)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ...>
  <bpmn:process id="Process_xyz" name="Rechnungseingang" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_role1" name="Sachbearbeiter">
        <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_abc123</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_def456</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_role2" name="Teamleiter">
        <bpmn:flowNodeRef>Task_ghi789</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>EndEvent_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="StartEvent_1" name="Start" />
    <bpmn:userTask id="Task_abc123" name="Rechnung empfangen">
      <bpmn:documentation>System: SAP ERP</bpmn:documentation>
    </bpmn:userTask>
    <bpmn:manualTask id="Task_def456" name="Rechnung prüfen" />
    <bpmn:userTask id="Task_ghi789" name="Zahlung freigeben" />
    <bpmn:endEvent id="EndEvent_1" name="End" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_abc123" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_abc123" targetRef="Task_def456" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_def456" targetRef="Task_ghi789" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Task_ghi789" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram>
    <bpmndi:BPMNPlane>
      <!-- Lane Shapes -->
      <bpmndi:BPMNShape id="Lane_role1_di" bpmnElement="Lane_role1" isHorizontal="true">
        <dc:Bounds x="50" y="60" width="1000" height="140" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_role2_di" bpmnElement="Lane_role2" isHorizontal="true">
        <dc:Bounds x="50" y="220" width="1000" height="140" />
      </bpmndi:BPMNShape>
      <!-- Task und Event Shapes mit Koordinaten innerhalb der Lanes -->
      <!-- Edges mit diagonalen Waypoints zwischen Lanes -->
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
```

---

## Phase C1: Ausnahmen als Boundary Events

### Überblick

Ab Phase C1 werden Ausnahmen aus `captureDraft.exceptions` als BPMN Boundary Events exportiert:

- **Boundary Events:** Werden am zugehörigen Task angehängt (`attachedToRef`)
- **Event-Typen:** Timer, Error, Escalation basierend auf Exception-Typ
- **Dokumentation:** Beschreibung und Handling werden in `<bpmn:documentation>` eingebettet
- **Abbruch-Ende:** Jede Lane mit Exceptions erhält ein "Abbruch (Ausnahme)" End Event

### Welche Exceptions werden exportiert?

**Voraussetzungen:**
1. Exception muss `relatedStepId` gesetzt haben
2. `relatedStepId` muss auf einen existierenden Schritt im Happy Path verweisen

**Ignorierte Exceptions:**
- Ohne `relatedStepId`: Warning "Ausnahme ... hat keinen Bezugsschritt"
- Mit ungültigem `relatedStepId`: Warning "Ausnahme ... verweist auf unbekannten Schritt"

### Exception-Typ → BPMN Event Definition Mapping

| Exception-Typ | BPMN Event Definition | Hinweise |
|---------------|----------------------|----------|
| `timeout` | `<bpmn:timerEventDefinition>` | Nutzt ISO 8601 Duration (z.B. PT4H, P1D); optional unterbrechend/nicht-unterbrechend |
| `error` | `<bpmn:errorEventDefinition />` | Generisches Error Event ohne errorRef |
| `missing_data` | `<bpmn:errorEventDefinition />` | Fehlende Daten werden als Error behandelt |
| `cancellation` | `<bpmn:escalationEventDefinition />` | Eskalation ohne escalationRef |
| `compliance` | `<bpmn:escalationEventDefinition />` | Compliance-Verstöße als Eskalation |
| `other` | `<bpmn:escalationEventDefinition />` | Sonstige Ausnahmen als Eskalation |

**Hinweis:** Wir verzichten bewusst auf `errorRef` und `escalationRef`, um den Definitions-Overhead gering zu halten. Die semantische Information steckt in der Dokumentation.

#### Timeout-Konfiguration

Für Timeout-Exceptions können Sie im Exception Editor konfigurieren:

1. **Timeout-Dauer (ISO 8601 Duration):**
   - Setzen Sie die gewünschte Dauer in ISO 8601 Format (z.B. PT30M, PT4H, P2D)
   - Quick-Buttons für häufige Werte: PT30M, PT1H, PT4H, P1D, P2D
   - Bei fehlender oder ungültiger Duration wird auf folgende Fallbacks zurückgegriffen:
     - Ableitung aus `waitingTime` Bucket des Schritts (z.B. "hours" → PT2H)
     - Default PT1H mit Warnung

2. **Timer-Verhalten:**
   - **Unterbrechend (Standard):** Timer stoppt den Prozess bei Timeout
   - **Nicht unterbrechend:** Timer feuert, aber Prozess läuft parallel weiter (BPMN: `cancelActivity="false"`)

**Mapping waitingTime → Duration (Fallback):**
| Bucket | Duration |
|--------|----------|
| minutes | PT15M |
| hours | PT2H |
| 1_day | P1D |
| 2_5_days | P3D |
| 1_2_weeks | P10D |
| over_2_weeks | P21D |

### Boundary Event Struktur

#### Exception-Struktur im Draft
```typescript
{
  exceptionId: "exc_123",
  relatedStepId: "step_456",      // Boundary Event wird an diesen Task gehängt
  type: "timeout",                // Bestimmt Event Definition
  description: "System antwortet nicht",
  handling: "Ticket erstellen und manuell fortsetzen",
  timeoutDurationIso: "PT4H",     // Optional: ISO 8601 Duration
  timeoutInterrupting: true       // Optional: Standard = unterbrechend
}
```

#### BPMN Output (Unterbrechend)
```xml
<bpmn:boundaryEvent id="BoundaryEvent_exc_123"
                    name="Zeitüberschreitung (Ausnahme)"
                    attachedToRef="Task_step_456">
  <bpmn:documentation>Beschreibung: System antwortet nicht
Handling: Ticket erstellen und manuell fortsetzen</bpmn:documentation>
  <bpmn:timerEventDefinition>
    <bpmn:timeDuration>PT4H</bpmn:timeDuration>
  </bpmn:timerEventDefinition>
</bpmn:boundaryEvent>

<bpmn:sequenceFlow id="Flow_7"
                   sourceRef="BoundaryEvent_exc_123"
                   targetRef="EndEvent_Exception_0" />

<bpmn:endEvent id="EndEvent_Exception_0" name="Abbruch (Ausnahme)" />
```

#### BPMN Output (Nicht-unterbrechend)
```xml
<bpmn:boundaryEvent id="BoundaryEvent_exc_456"
                    name="Zeitüberschreitung (Ausnahme)"
                    attachedToRef="Task_step_789"
                    cancelActivity="false">
  <bpmn:documentation>...</bpmn:documentation>
  <bpmn:timerEventDefinition>
    <bpmn:timeDuration>P1D</bpmn:timeDuration>
  </bpmn:timerEventDefinition>
</bpmn:boundaryEvent>
```

### Layout & Positionierung

#### Boundary Event Position
Boundary Events werden am unteren Rand des zugehörigen Tasks positioniert:

```typescript
// Position berechnen
const boundaryX = taskBounds.x + 10 + idx * 40;  // 10px Abstand, 40px je Exception
const boundaryY = taskBounds.y + taskBounds.h - 18;  // 18px vom unteren Rand
// Size: 36x36px (Standard BPMN Event-Größe)
```

**Mehrere Exceptions am gleichen Task:**
- Werden horizontal verteilt (idx * 40px Abstand)
- Verhindert Überlappung der Boundary Events

#### Exception End Event Position

Pro Lane mit mindestens einer Exception wird ein End Event erzeugt:

```typescript
// Position berechnen
const exceptionEndX = endX + 250;  // 250px rechts vom normalen End Event
const exceptionEndY = taskY + 22;  // vertikal zentriert mit Tasks
// Size: 36x36px
```

#### Lane-Breite Anpassung

Die Lane-Breite wird dynamisch berechnet, um alle Elemente einzuschließen:

```typescript
// maxX = max(bounds.x + bounds.w) über alle Elemente
const diagramWidth = maxX + 200;  // 200px Margin
```

**Ergebnis:** Exception End Events liegen innerhalb der Lane-Breite, keine "schwebenden" Nodes.

### Warnungen

#### Timeout Duration Warnungen

Je nach Konfiguration können folgende Warnungen auftreten:

1. **Ungültige Duration:**
   ```
   "Ungültige Timeout-Duration \"XYZ\". Fallback wird genutzt."
   ```
   Die eingegebene Duration ist kein gültiges ISO 8601 Format.

2. **Ableitung aus waitingTime:**
   ```
   "Timeout bei Schritt 3. Daten prüfen nutzt aus Wartezeit-Bucket abgeleitete Duration PT2H – bitte prüfen"
   ```
   Keine Duration konfiguriert, aber `waitingTime` Bucket vorhanden → automatische Ableitung.

3. **Default Fallback:**
   ```
   "Timeout nutzt Default PT1H, bitte anpassen"
   ```
   Weder Duration noch waitingTime verfügbar → Default PT1H verwendet.

**ISO 8601 Duration Beispiele:**
- PT30M = 30 Minuten
- PT1H = 1 Stunde
- PT4H = 4 Stunden
- P1D = 1 Tag
- P2D = 2 Tage

#### Ignorierte Exceptions

Zwei Arten von Warnungen werden ausgegeben:

1. **Fehlender Bezugsschritt:**
   ```
   Ausnahme "System antwortet nicht..." hat keinen Bezugsschritt (relatedStepId) und wird nicht exportiert.
   ```

2. **Ungültiger Bezugsschritt:**
   ```
   Ausnahme "System antwortet nicht..." verweist auf unbekannten Schritt abc-123 und wird nicht exportiert.
   ```

### Limitierungen

**Kein ausgearbeiteter Handling-Pfad:**
- Boundary Events führen direkt zum Abbruch-Ende
- Keine separaten Tasks oder Subprozesse für Exception-Handling
- Handling-Information steht nur in der Dokumentation

**Pragmatischer Ansatz:**
- Fokus auf Vollständigkeit der Erfassung
- BPMN-semantisch valide, aber simpel
- Erweiterung im BPMN-Modeler möglich

### Beispiel: Vollständiger Export mit Exception

#### Input
```json
{
  "captureDraft": {
    "happyPath": [
      { "stepId": "s1", "order": 1, "label": "Anfrage erfassen" },
      { "stepId": "s2", "order": 2, "label": "System abfragen" },
      { "stepId": "s3", "order": 3, "label": "Antwort verarbeiten" }
    ],
    "exceptions": [
      {
        "exceptionId": "e1",
        "relatedStepId": "s2",
        "type": "timeout",
        "description": "System antwortet nicht innerhalb 30 Sekunden",
        "handling": "Manuell Ticket erstellen"
      }
    ]
  }
}
```

#### Output (vereinfacht)
```xml
<bpmn:process id="Process_xyz" name="Systemabfrage">
  <bpmn:startEvent id="StartEvent_1" name="Start" />

  <bpmn:task id="Task_s1" name="Anfrage erfassen" />
  <bpmn:task id="Task_s2" name="System abfragen" />
  <bpmn:task id="Task_s3" name="Antwort verarbeiten" />

  <bpmn:boundaryEvent id="BoundaryEvent_e1"
                      name="Zeitüberschreitung (Ausnahme)"
                      attachedToRef="Task_s2">
    <bpmn:documentation>Beschreibung: System antwortet nicht innerhalb 30 Sekunden
Handling: Manuell Ticket erstellen</bpmn:documentation>
    <bpmn:timerEventDefinition>
      <bpmn:timeDuration>PT1H</bpmn:timeDuration>
    </bpmn:timerEventDefinition>
  </bpmn:boundaryEvent>

  <bpmn:endEvent id="EndEvent_1" name="End" />
  <bpmn:endEvent id="EndEvent_Exception_0" name="Abbruch (Ausnahme)" />

  <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_s1" />
  <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_s1" targetRef="Task_s2" />
  <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_s2" targetRef="Task_s3" />
  <bpmn:sequenceFlow id="Flow_4" sourceRef="Task_s3" targetRef="EndEvent_1" />
  <bpmn:sequenceFlow id="Flow_5" sourceRef="BoundaryEvent_e1" targetRef="EndEvent_Exception_0" />
</bpmn:process>
```

### Testing

**Self-Test Coverage (C1):**
- ✅ Boundary Event mit `attachedToRef` wird exportiert
- ✅ Timer Event Definition bei `type: timeout`
- ✅ Dokumentation mit Beschreibung und Handling
- ✅ Exception End Event in der gleichen Lane
- ✅ Sequence Flow von Boundary Event zu End Event
- ✅ Warnings für ignorierte Exceptions

**Manueller Test:**
1. Erfasse Happy Path mit mindestens 3 Schritten
2. Füge Exception mit `relatedStepId` zum 2. Schritt hinzu
3. Typ: `timeout`, Beschreibung und Handling ausfüllen
4. BPMN generieren und in Camunda Modeler öffnen
5. Erwartung: Boundary Event am unteren Rand von Task 2
6. Erwartung: Flow führt zu "Abbruch (Ausnahme)" End Event
7. Erwartung: Dokumentation ist im Property Panel sichtbar

---

## Roadmap: Zukünftige Phasen

### Phase C2: XOR-Loops (✓ Implementiert)
- ✅ Rücksprünge und Schleifen für XOR-Gateways
- ✅ Einfaches Kantenrouting (direkte Verbindungen)
- ✅ Warning bei Loop-Detection

### Phase C3: AND/OR Gateways
- Parallelisierung (AND-Split/Join)
- Inklusives Gateway (OR)

### Phase C4: Data Objects & Systems
- Data Objects für Dokumente
- Data Stores für Systeme
- Associations zwischen Tasks und Daten

### Phase C5: Import & Round-Trip
- Import von BPMN XML
- Mapping zurück zu CaptureDraft
- Bidirektionale Synchronisation

---

## Limitierungen

### Technische Limitierungen
- **Offline-Only:** Keine Cloud-Synchronisation des XML
- **Einfaches Layout:** Nur horizontales Layout mit vertikaler Lane-Trennung
- **Keine Validation:** Keine Syntax-Prüfung des generierten XML (vertrauen auf korrekte Generierung)

### Funktionale Limitierungen (B4)
- **Nur Happy Path:** Keine Verzweigungen, Schleifen, Ausnahmen
- **Keine Annotations:** Keine Kommentare oder Notizen (außer Task-Dokumentation)
- **Keine Pools:** Keine Trennung zwischen Organisationen
- **Keine Data Objects:** Keine expliziten Datenobjekte (nur in Task-Dokumentation)

### Workarounds
- Nutzer können exportiertes BPMN in Camunda/Signavio öffnen und dort manuell erweitern
- Für komplexe Prozesse: erst vollständig erfassen, dann Export in späteren Phasen abwarten
- Task-Dokumentation kann als Platzhalter für detaillierte Informationen dienen

---

## Testing

### Self-Test Coverage
Der Self-Test in `src/storage/_selfTest.ts` prüft:
- ✅ XML-Generierung nach Happy Path Erfassung
- ✅ Task-Typen (userTask, serviceTask, manualTask) im XML
- ✅ Lanes und flowNodeRefs im XML
- ✅ System-Dokumentation in Tasks
- ✅ Warnings bei fehlenden Elementen
- ✅ Speicherung in IndexedDB
- ✅ lastExportedAt Timestamp

### Manueller Test
1. Wizard durchlaufen (Happy Path erfassen)
2. Setup Tab: Rollen und Systeme hinzufügen
3. Draft Tab: Schritt-Details öffnen
4. `roleId`, `workType` und `systemId` für Schritte setzen
5. "BPMN generieren" klicken
6. Warnings prüfen
7. XML Vorschau prüfen (nach `<bpmn:laneSet>`, `<bpmn:userTask>` suchen)
8. Download .bpmn klicken
9. Datei in Camunda Modeler öffnen
10. Lanes und Task-Typen visuell prüfen
11. Task-Properties für Dokumentation prüfen

---

## Troubleshooting

### Problem: Keine Lanes im Export
- **Check:** Sind Rollen in `sidecar.roles` definiert?
- **Check:** Haben die Schritte eine `roleId` zugeordnet?
- **Lösung:** Mindestens ein Schritt muss eine `roleId` haben

### Problem: Alle Tasks sind generisch (task statt userTask/serviceTask)
- **Check:** Ist `workType` in den Schritt-Details gesetzt?
- **Lösung:** Öffne Schritt-Details im Draft Tab und wähle WorkType aus

### Problem: System-Dokumentation fehlt
- **Check:** Ist `systemId` im Schritt gesetzt?
- **Check:** Ist das System in `sidecar.systems` definiert?
- **Lösung:** System im Setup Tab hinzufügen und im Draft Tab zuordnen

### Problem: Lanes haben falsche Höhe oder Überlappung
- **Lösung:** Layout-Konstanten sind fest definiert, sollte nicht auftreten
- **Workaround:** Manuelle Anpassung im BPMN-Editor

### Problem: Camunda zeigt Lanes nicht an
- **Check:** DI-Shapes für Lanes vorhanden? (`<bpmndi:BPMNShape ... isHorizontal="true">`)
- **Check:** flowNodeRefs korrekt zugeordnet?
- **Lösung:** XML-Vorschau prüfen, ggf. neu generieren

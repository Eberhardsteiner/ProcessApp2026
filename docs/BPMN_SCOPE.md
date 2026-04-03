# BPMN-Scope für MVP

## Überblick

Diese App unterstützt **BPMN 2.0** für die Prozessmodellierung mit Fokus auf **lesbare, verständliche Prozessdarstellung**. Nicht alle BPMN-Elemente sind im MVP enthalten – wir konzentrieren uns auf die Kernelemente, die für 80% der Geschäftsprozesse ausreichen.

---

## Unterstützte BPMN-Diagrammtypen

### 1. Process Diagram (Haupttyp)
**Zweck:** Zeigt den Ablauf eines einzelnen Prozesses innerhalb einer Organisation
**Verwendung:** Standard für Unterprozesse und einfache Hauptprozesse
**Elemente:**
- Ein impliziter Pool (nicht sichtbar)
- Lanes zur Rollentrennung (optional)
- Flussobjekte (Events, Tasks, Gateways)
- Sequenzflüsse

### 2. Collaboration Diagram
**Zweck:** Zeigt Interaktion zwischen mehreren Beteiligten (z.B. Kunde, Lieferant, Abteilungen)
**Verwendung:** Für End-to-End-Prozesse mit externen Partnern
**Elemente:**
- Mehrere Pools (jeder repräsentiert einen Teilnehmer)
- Lanes innerhalb von Pools
- Nachrichtenflüsse zwischen Pools
- Sequenzflüsse innerhalb von Pools

**Hinweis:** Im MVP zunächst Process Diagrams priorisieren. Collaboration kommt später für komplexere Szenarien.

---

## BPMN-Elementkategorien im Scope

### 1. Swimlanes (Verantwortlichkeiten)

#### Pools
- **Zweck:** Repräsentiert einen Prozessbeteiligten (Organisation, Rolle, System)
- **MVP-Regel:**
  - In Process Diagrams: ein impliziter Pool
  - In Collaboration Diagrams: 2-5 Pools sichtbar
- **Benennung:** Name der Organisation oder Hauptrolle (z.B. "Kunde", "Vertrieb", "Lieferant")

#### Lanes
- **Zweck:** Unterteilt einen Pool in Verantwortungsbereiche
- **MVP-Regel:** 2-7 Lanes pro Pool (sonst zu unübersichtlich)
- **Benennung:** Rolle oder Abteilung (z.B. "Sachbearbeiter", "Teamleiter", "IT-System")

---

### 2. Flussobjekte (Flow Objects)

#### Events (Ereignisse)
**Typen im MVP:**
- **Start-Event:** Startet einen Prozess (z.B. "Anfrage eingegangen")
  - Varianten: Standard, Nachricht, Timer, Signal
- **End-Event:** Beendet einen Prozess (z.B. "Auftrag abgeschlossen")
  - Varianten: Standard, Nachricht, Fehler, Abbruch
- **Intermediate Event:** Tritt während des Prozesses ein (z.B. "Frist abgelaufen")
  - Varianten: Nachricht (fangend/werfend), Timer, Signal, Eskalation

**Benennungsregel:** Ereignisse als **Zustand/Ergebnis** formulieren (nicht als Tätigkeit)

#### Activities (Aktivitäten)
**Typen im MVP:**
- **Task (Aufgabe):** Atomare Arbeitseinheit (z.B. "Rechnung prüfen")
  - Varianten: Standard-Task, User Task, Service Task, Send/Receive Task
- **Subprocess (Unterprozess):** Gekapselte Prozesslogik (z.B. "Bonität prüfen")
  - Collapsed (zugeklappt): Zeigt nur den Namen
  - Expanded (ausgeklappt): Zeigt innere Logik (optional in MVP)

**Benennungsregel:** Tasks aktiv als **"Substantiv + Verb"** (z.B. "Rechnung prüfen", "Auftrag erfassen")

#### Gateways (Verzweigungen)
**Typen im MVP:**
- **Exclusive Gateway (XOR):** Exakt ein Pfad wird gewählt
  - Symbol: Raute mit X
  - Verwendung: "Betrag > 10.000?" → entweder Pfad A oder B
- **Parallel Gateway (AND):** Alle Pfade werden parallel ausgeführt
  - Symbol: Raute mit +
  - Verwendung: "Rechnung + Lieferschein gleichzeitig erstellen"
- **Inclusive Gateway (OR):** Ein oder mehrere Pfade werden gewählt
  - Symbol: Raute mit O
  - Verwendung: "Kunde informieren: per E-Mail und/oder Telefon"

**Wichtig:** Gateways müssen **Split** (ausgehend) und **Join** (eingehend) korrekt nutzen!

**Nicht im MVP:**
- Event-based Gateway
- Complex Gateway

---

### 3. Verbindende Objekte (Connecting Objects)

#### Sequence Flow (Sequenzfluss)
- **Zweck:** Zeigt die Reihenfolge von Aktivitäten innerhalb eines Pools
- **Darstellung:** Durchgezogener Pfeil
- **Regel:** Darf Pool-Grenzen NICHT überschreiten

#### Message Flow (Nachrichtenfluss)
- **Zweck:** Zeigt Kommunikation zwischen verschiedenen Pools (z.B. Kunde → Vertrieb)
- **Darstellung:** Gestrichelter Pfeil
- **Regel:** Nur zwischen Pools, nicht innerhalb

#### Association (Assoziation)
- **Zweck:** Verknüpft Artefakte (Textannotation, Datenobjekte) mit Flussobjekten
- **Darstellung:** Gepunktete Linie
- **Verwendung:** "Diese Notiz gehört zu diesem Task"

---

### 4. Datenobjekte (Data Objects)

#### Data Objects
- **Zweck:** Repräsentiert Informationen, die im Prozess verarbeitet werden
- **Beispiele:** "Auftrag", "Rechnung", "Kundendaten"
- **Zustände:** Optional mit Status versehen (z.B. "Rechnung [geprüft]")

#### Data Stores
- **Zweck:** Persistente Datenspeicherung (z.B. Datenbank, Dateisystem)
- **Beispiele:** "CRM-System", "Dokumentenarchiv"

**MVP-Regel:** Datenobjekte sind optional, aber hilfreich für Verständnis und Automatisierung.

---

### 5. Artefakte (Artifacts)

#### Text Annotation (Textannotation)
- **Zweck:** Erklärt oder kommentiert Prozessschritte
- **Verwendung:** "Achtung: Genehmigung dauert 2-3 Tage"

#### Group (Gruppierung)
- **Zweck:** Visuell zusammengehörige Elemente gruppieren (ohne Prozesslogik)
- **Verwendung:** "Alle Tasks in dieser Gruppe sind optional"

**MVP-Regel:** Sparsam einsetzen, um Übersichtlichkeit zu bewahren.

---

## Nicht im MVP-Scope

### Ausgeschlossen (erstmal)
- **DMN (Decision Model and Notation):** Komplexe Entscheidungstabellen
- **CMMN (Case Management Model and Notation):** Fallbasierte Prozesse
- **Execution Conformance:** Token-Simulation, Performance-Analyse
- **Advanced Events:** Conditional Events, Multiple Events, Compensation
- **Advanced Tasks:** Manual Task, Business Rule Task, Script Task (können später hinzu)

### Warum diese Einschränkung?
- **Fokus auf Verständlichkeit:** 90% der Prozesse lassen sich mit Basic BPMN modellieren
- **Einsteigerfreundlichkeit:** Weniger Auswahl = schnellerer Einstieg
- **Technische Machbarkeit:** MVP liefert Grundfunktionen, Erweiterungen folgen schrittweise

---

## Qualitätsregeln für BPMN-Modelle

### Syntax-Regeln (automatisch prüfbar)
1. Jedes Start-Event muss mindestens einen ausgehenden Sequenzfluss haben
2. Jedes End-Event muss mindestens einen eingehenden Sequenzfluss haben
3. Tasks müssen genau einen eingehenden und einen ausgehenden Sequenzfluss haben (außer bei Gateways)
4. Exclusive Gateways müssen Bedingungen an ausgehenden Pfaden haben
5. Nachrichtenflüsse dürfen nicht innerhalb eines Pools verlaufen
6. Sequenzflüsse dürfen nicht über Pool-Grenzen hinausgehen

### Semantik-Regeln (menschliche Prüfung)
1. Ist der Prozess wirklich End-to-End? (Start = Trigger, Ende = Outcome)
2. Sind alle Rollen/Lanes sinnvoll zugeordnet?
3. Fehlen wichtige Ausnahmen oder Fehlerfälle?
4. Ist die Granularität konsistent? (Nicht 3 Tasks und 1 Task mit 20 Unterschritten)
5. Sind Benennungen konsistent? (Nicht "Auftrag" und "Order" für dasselbe Objekt)

---

## Zusammenfassung

| Kategorie | MVP-Elemente | Später |
|-----------|--------------|--------|
| **Diagrammtypen** | Process, Collaboration | - |
| **Events** | Start, End, Intermediate (Message, Timer) | Conditional, Multiple |
| **Activities** | Task, Subprocess (collapsed) | Expanded Subprocess, Call Activity |
| **Gateways** | XOR, AND, OR | Event-based, Complex |
| **Daten** | Data Objects, Data Stores | - |
| **Artefakte** | Text Annotation, Group | - |

**Export-Ziel:** BPMN 2.0 XML (kompatibel mit Camunda, Signavio, etc.)

---

## A4 Export: BPMN 2.0 XML-Generierung

Phase A4 des MVP implementiert den automatischen Export von erfassten Prozessen in valides BPMN 2.0 XML Format.

### Funktionsumfang A4
- **Happy Path Export:** Jeder erfasste Prozessschritt wird als `<bpmn:task>` exportiert
- **Sequence Flows:** Automatische Verknüpfung von Start → Tasks → End
- **BPMN Diagram Interchange (DI):** Einfaches horizontales Autolayout für direkte Visualisierung in BPMN-Tools
- **Offline-first:** XML-Generierung und Download funktionieren ohne Backend
- **IndexedDB Speicherung:** Generiertes XML wird in `ProcessVersion.bpmn.bpmnXml` gespeichert

### Limitierungen in A4
- **Nur Happy Path:** Decisions und Exceptions werden noch nicht als BPMN-Gateways/Events exportiert
- **Keine Lanes:** Rollen-Zuordnung erfolgt noch nicht über BPMN Lanes
- **Kein Import:** Nur Export ist implementiert, kein Re-Import von BPMN XML
- **Keine komplexen Gateways:** XOR/AND/OR Gateways folgen in späteren Phasen

### Warnings
Das System gibt automatisch Warnungen aus wenn:
- Kein Happy Path vorhanden ist
- Decisions erfasst wurden, aber nicht exportiert werden
- Exceptions erfasst wurden, aber nicht exportiert werden

Diese Warnungen helfen Nutzern zu verstehen, dass der Export noch nicht vollständig ist und weitere Phasen folgen werden.

# Methodische Grundlagen: Prozessaufnahme

## Was ist ein Prozess?

Ein Prozess ist eine strukturierte Abfolge von Aktivitäten, die:
- **Einen klaren Start** hat (Auslöser/Trigger)
- **Ein definiertes Ende** erreicht (Ergebnis/Output)
- **Input verarbeitet** und in **Output transformiert**
- **Wiederholbar** ist (gleiche Abfolge bei ähnlichen Fällen)
- **Wert schafft** für einen Kunden (extern oder intern)

### Kernfragen für jeden Prozess
1. **Wer** ist der Kunde dieses Prozesses?
2. **Was** löst den Prozess aus?
3. **Welches Ergebnis** wird erwartet?
4. **Woran** erkennt man, dass der Prozess abgeschlossen ist?

---

## Prozesskategorien

Wir unterscheiden drei Hauptkategorien nach ihrer Rolle im Unternehmen:

### 1. Führungs-/Steuerungsprozesse
**Zweck:** Steuern und lenken das Unternehmen
**Beispiele:** Strategieentwicklung, Qualitätsmanagement, Controlling
**Kunde:** Meist interne Führungsebene oder Aufsichtsorgane

### 2. Kernprozesse
**Zweck:** Schaffen direkt Wert für den externen Kunden
**Beispiele:** Auftragsabwicklung, Produktentwicklung, Kundenservice
**Kunde:** Externer Kunde oder Endnutzer
**Hinweis:** Diese Prozesse rechtfertigen die Existenz des Unternehmens

### 3. Unterstützungsprozesse
**Zweck:** Ermöglichen die Durchführung von Kern- und Steuerungsprozessen
**Beispiele:** IT-Support, Personalwesen, Beschaffung
**Kunde:** Meist interne Prozesse oder Fachbereiche

---

## End-to-End Prinzip

**Definition:** Ein End-to-End-Prozess beginnt mit einem Kundenbedarf und endet mit der Erfüllung dieses Bedarfs.

### Warum ist das wichtig?
- Verhindert isolierte "Abteilungssichtweisen"
- Zeigt den echten Wertbeitrag
- Ermöglicht Messung der Gesamtperformance
- Identifiziert Schnittstellen und Übergaben

### Pflichtfelder für End-to-End Definition
1. **Trigger/Auslöser:** Was startet den Prozess? (z.B. "Kundenanfrage geht ein")
2. **Kunde:** Wer profitiert vom Ergebnis? (z.B. "Externer Kunde", "Vertriebsabteilung")
3. **Outcome/Ergebnis:** Was wird geliefert? (z.B. "Angebot versendet", "Rechnung bezahlt")
4. **Done-Kriterien (optional):** Woran erkennt man, dass der Prozess erfolgreich war?

---

## Top-down Hierarchisierung

Prozesse werden in drei Ebenen strukturiert:

### 1. Landkarte (Landscape/Übersicht)
- **Zweck:** Gesamtüberblick über alle Hauptprozesse
- **Detailgrad:** Sehr hoch aggregiert, 5-15 Prozessboxen
- **Beispiel:** "Vertrieb", "Produktion", "Logistik"

### 2. Hauptprozess (Big Picture)
- **Zweck:** Zeigt den vollständigen End-to-End-Ablauf auf einer Seite
- **Detailgrad:** 7-15 Hauptschritte, passt auf A4/Bildschirm
- **Beispiel:** "Auftragsabwicklung" mit Schritten von Anfrage bis Lieferung
- **Regel:** Muss eigenständig verständlich sein (wer nicht beteiligt ist, kann den Prozess verstehen)

### 3. Unterprozess
- **Zweck:** Detaillierung einzelner Schritte aus dem Hauptprozess
- **Detailgrad:** Konkrete Aktivitäten, Entscheidungen, Ausnahmen
- **Beispiel:** "Kreditwürdigkeit prüfen" als Unterprozess von "Auftrag annehmen"
- **Regel:** Hat eine klare Schnittstelle zum übergeordneten Prozess (Input/Output)

### Hierarchie-Regel
Ein Unterprozess hat immer einen `parentProcessId`. Hauptprozesse haben `parentProcessId = null`.

---

## Syntax vs. Semantik: Warum Review-Fragen wichtig sind

### Syntax (Toolprüfung möglich)
- **Was ist das?** Die formale Korrektheit nach BPMN-Regeln
- **Beispiele:**
  - Jedes Start-Event muss einen Folgepfeil haben
  - Gateways müssen Split/Join-Logik korrekt nutzen
  - Nachrichtenfluss darf nicht innerhalb eines Pools verlaufen
- **Prüfung:** Kann automatisch validiert werden (XML-Schema, bpmn-js-Lint)

### Semantik (Menschliche Prüfung nötig)
- **Was ist das?** Die inhaltliche Korrektheit und Verständlichkeit
- **Beispiele:**
  - Ist der Prozess wirklich End-to-End?
  - Sind die Schnittstellen konsistent benannt?
  - Fehlen wichtige Ausnahmen?
  - Ist die Granularität sinnvoll (nicht zu detailliert/zu grob)?
- **Prüfung:** Erfordert Review durch Prozesskenner

### Unsere Lösung
Wir speichern **semanticQuestions** als Teil des Datenmodells:
```typescript
semanticQuestions: [
  {
    id: "q1",
    question: "Ist der Prozess wirklich zu Ende, wenn 'Rechnung versendet' wurde? Oder erst bei 'Zahlung eingegangen'?",
    relatedStepHint: "Ende-Ereignis"
  }
]
```

So verliert der Modellierer wichtige Prüfpunkte nicht aus dem Blick.

---

## Modellierungsstil: Benennungslogik

### Aktivitäten/Tasks
**Regel:** Aktiv formulieren als **"Substantiv + Verb"** (in deutscher Praxis)
✅ Gut: "Rechnung prüfen", "Angebot erstellen", "Kunde informieren"
❌ Schlecht: "Rechnungsprüfung", "Angebotserstellung", "Information"

**Hinweis:** Das Substantiv benennt das Objekt, das Verb die Tätigkeit. Diese Reihenfolge ist typisch für deutsche Prozessbeschreibungen und entspricht der natürlichen Sprechweise.

### Ereignisse (Events)
**Regel:** Als **Zustand oder Ergebnis im Perfekt** formulieren
✅ Gut: "Anfrage eingegangen", "Rechnung ist geprüft", "Genehmigung erteilt", "Frist abgelaufen"
❌ Schlecht: "Anfrage eingehen", "Rechnung prüfen", "Genehmigung erteilen"

**Hinweis:** Ereignisse beschreiben etwas, das bereits eingetreten ist (Zustand), nicht eine Tätigkeit.

### Unterprozesse
**Regel:** Als **Substantiv** formulieren (oft nominalisierte Form der Tätigkeit)
✅ Gut: "Rechnungsprüfung", "Bonitätsprüfung", "Auftragsannahme"
❌ Schlecht: "Rechnung prüfen" (das wäre ein Task, kein Unterprozess)

**Hinweis:** Ein Unterprozess kapselt mehrere Schritte. Der Name sollte den Themenbereich beschreiben, nicht eine einzelne Tätigkeit.

### Gateways (Entscheidungen)
**Regel:** Als **Frage** formulieren
✅ Gut: "Betrag > 10.000 EUR?", "Kunde bereits bekannt?", "Material verfügbar?"
❌ Schlecht: "Prüfung", "Check", "Entscheidung"

### Konsistenz
- **Namen wiederholen:** Wenn ein Datenobjekt "Auftrag" heißt, nicht später "Order" oder "Bestellung" verwenden
- **Ebenen-Konsistenz:** Auf der gleichen Hierarchieebene gleichen Detailgrad verwenden
- **A4-Lesbarkeit:** Ein Hauptprozess muss auf eine A4-Seite passen (ca. 10-15 Schritte)

---

## Zusammenfassung

1. **Jeder Prozess braucht:** Start (Trigger), Ende (Outcome), Kunde, Wertbeitrag
2. **Kategorien helfen:** Steuerung/Kern/Unterstützung → zeigt strategische Rolle
3. **End-to-End denken:** Vermeidet Abteilungssilos und Schnittstellenprobleme
4. **Top-down strukturieren:** Landkarte → Hauptprozess → Unterprozesse
5. **Syntax UND Semantik prüfen:** Tool prüft Regeln, Mensch prüft Sinn
6. **Klar benennen:** Aktivitäten aktiv, Ereignisse als Zustand, Konsistenz wahren

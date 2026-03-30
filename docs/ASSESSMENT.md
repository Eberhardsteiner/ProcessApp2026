# Process Assessment System

## Überblick

Das Assessment-System bewertet erfasste Prozesse nach ihrem Potenzial für Digitalisierung und Automatisierung. Die Bewertung erfolgt **komplett lokal** ohne externe KI-Dienste oder Cloud-Anbindung.

## Bewertungsdimensionen

Das System bewertet Prozesse in vier Hauptdimensionen:

### 1. Standardisierung

**Was wird bewertet:**
- Wie einheitlich und wiederholbar ist der Prozess?
- Gibt es viele Varianten und Ausnahmen?
- Ist die Prozesslänge angemessen?

**Inputs:**
- `aiReadinessSignals.standardization` (aus Wizard-Phase „Automatisierung“)
- Anzahl der Prozessschritte im Happy Path
- Anzahl dokumentierter Entscheidungen und Ausnahmen

**Scoring-Logik:**
- Basis-Score aus dem Standardisierungs-Signal (low=25, medium=60, high=85)
- Abzüge bei sehr langen (>15 Schritte) oder sehr kurzen (<5 Schritte) Prozessen
- Abzüge bei vielen Entscheidungspunkten und Ausnahmen

**Empfehlungen:**
- Bei niedriger Bewertung: Prozessstabilität vor Automatisierung
- Bei hoher Komplexität: Varianten sauber dokumentieren, Vereinfachung prüfen
- Bei vielen Schritten: Aufteilung in Unterprozesse erwägen

### 2. Daten & IT-Unterstützung (Digitalisierbarkeit)

**Was wird bewertet:**
- Sind relevante Daten verfügbar und strukturiert?
- Welche IT-Systeme sind im Einsatz?
- Sind Datenobjekte definiert und Systemen zugeordnet?

**Inputs:**
- `aiReadinessSignals.dataAvailability` (aus Wizard-Phase „Automatisierung“)
- Anzahl erfasster IT-Systeme
- Anzahl erfasster Datenobjekte
- Anzahl Schritte mit System-Zuordnung

**Scoring-Logik:**
- Basis-Score aus dem Datenverfügbarkeits-Signal
- Bonus, wenn sowohl Systeme als auch Datenobjekte erfasst sind
- Abzüge, wenn Systeme nicht den Schritten zugeordnet sind
- Abzüge, wenn Systeme ohne Datenobjekte existieren

**Empfehlungen:**
- Systeme im Setup-Tab erfassen
- Datenobjekte definieren (z.B. Kunde, Auftrag, Rechnung)
- System-Zuordnung vervollständigen (Draft-Tab: „Schritt-Details“)
- Digitalisierung ist Voraussetzung für Automatisierung

### 3. Automatisierbarkeit

**Was wird bewertet:**
- Wie gut eignet sich der Prozess für Automatisierung?
- Kombinierte Bewertung aus allen anderen Faktoren

**Inputs:**
- Score aus Standardisierung (35% Gewichtung)
- Score aus Daten & IT (35% Gewichtung)
- Invertierter Score aus Variabilität (15% Gewichtung)
- Invertierter Score aus Risiko (15% Gewichtung)
- Anzahl definierter KPIs
- Anzahl Schritte ohne Rollenzuordnung

**Scoring-Logik:**
- Gewichteter Durchschnitt der vier Faktoren
- Abzüge, wenn keine KPIs definiert sind
- Abzüge, wenn viele Schritte ohne Verantwortlichkeiten

**Empfehlungen:**
- Bei hohem Score: Workflow-Automatisierung ist realistisch
- Bei mittlerem Score: Teilautomatisierung einzelner Schritte
- Bei niedrigem Score: Erst Standardisierung und Digitalisierung verbessern

### 4. Risiko & Kontrollen

**Was wird bewertet:**
- Welche Compliance- und Risiko-Anforderungen bestehen?
- Ist Human-in-the-loop notwendig?

**Inputs:**
- `aiReadinessSignals.complianceRisk` (aus Wizard-Phase „Automatisierung“)
- Der Score wird invertiert (hohes Risiko = niedriger Score)

**Scoring-Logik:**
- 100 - levelToScore(complianceRisk)
- Hohes Risiko führt zu niedrigerem Score (mehr Vorsicht nötig)

**Empfehlungen:**
- Bei hohem Risiko: Freigabe-Workflows, Vier-Augen-Prinzip, Audit-Trail
- Bei mittlerem Risiko: Stichprobenkontrollen, Monitoring
- Bei niedrigem Risiko: Straight-through-Processing möglich

## Gesamtbewertung

Die Gesamtbewertung (Overall Score) wird als gewichteter Durchschnitt berechnet:

- Standardisierung: 25%
- Daten & IT: 25%
- Automatisierbarkeit: 35%
- Risiko & Kontrollen: 15%

**Score-Interpretation:**
- 70-100 (Hoch): Exzellentes Potenzial, konkrete Maßnahmen sollten geprüft werden
- 40-69 (Mittel): Moderates Potenzial, gezielte Verbesserungen möglich
- 0-39 (Niedrig): Grundlegende Arbeit nötig vor Automatisierung

## Nächste Schritte

Das System generiert automatisch eine priorisierte Liste der nächsten Schritte basierend auf erkannten Lücken:

1. **Rollen**: Wenn keine Rollen erfasst oder nicht zugeordnet
2. **Systeme**: Wenn keine Systeme erfasst oder nicht zugeordnet
3. **Datenobjekte**: Wenn keine Datenobjekte definiert
4. **KPIs**: Wenn keine Kennzahlen definiert
5. **Entscheidungen**: Wenn keine Varianten dokumentiert
6. **Automatisierungsideen**: Wenn noch keine Notizen vorhanden

## Automatisierungshinweise

Das System gibt kontextabhängige Hinweise zur Art der möglichen Automatisierung:

- **Workflow-Automatisierung**: Bei hohem Automatisierungs-Score
- **RPA (Robotic Process Automation)**: Für manuelle IT-Schritte
- **Teilautomatisierung**: Bei mittlerem Score
- **Assistenzfunktionen**: Bei hoher Variabilität
- **KI-Unterstützung**: Für Entscheidungsunterstützung
- **Human-in-the-loop**: Bei hohem Compliance-Risiko

## Technische Details

### Hilfsfunktionen

```typescript
levelToScore(level: 'low' | 'medium' | 'high'): number
  - low → 25
  - medium → 60
  - high → 85

scoreToLevel(score: number): 'low' | 'medium' | 'high'
  - 0-39 → low
  - 40-69 → medium
  - 70-100 → high

invertScore(score: number): number
  - Für Faktoren, wo „hoch“ negativ ist (Variabilität, Risiko)
  - Berechnung: 100 - score

clamp(value: number, min=0, max=100): number
  - Begrenzt Werte auf den Bereich 0-100
```

### Datenquellen

Alle Bewertungen basieren ausschließlich auf Daten, die während der Prozesserfassung gesammelt wurden:

**Aus `ProcessVersion.sidecar`:**
- `aiReadinessSignals` (Wizard-Phase „Automatisierung“: Standardisierung, Datenverfügbarkeit, Variabilität, Risiko)
- `systems[]` (Setup-Tab)
- `dataObjects[]` (Setup-Tab)
- `kpis[]` (Setup-Tab)
- `roles[]` (Setup-Tab)
- `automationNotes` (Wizard-Phase „Automatisierung“)

**Aus `ProcessVersion.sidecar.captureDraft`:**
- `happyPath[]` (Wizard-Phase „Hauptablauf“ und Draft-Tab: Hauptablauf mit Schritten)
- `decisions[]` (Wizard-Phase „Entscheidungen“: Entscheidungspunkte)
- `exceptions[]` (Wizard-Phase „Ausnahmen“: Ausnahmen)

**Berechnete Metriken:**
- Anzahl Schritte mit/ohne Rollenzuordnung
- Anzahl Schritte mit/ohne System-Zuordnung
- Verhältnis von zugeordneten zu nicht-zugeordneten Elementen

## Transparenz & Nachvollziehbarkeit

Die Bewertung ist vollständig deterministisch und nachvollziehbar:

1. **Keine Black Box**: Alle Bewertungsregeln sind im Code dokumentiert
2. **Gleiche Inputs = Gleiche Outputs**: Keine Zufallskomponenten
3. **Begründungen**: Jede Dimension enthält konkrete Begründungen
4. **Empfehlungen**: Spezifische, umsetzbare nächste Schritte
5. **Export**: JSON-Download für externe Analyse möglich

## Grenzen des Systems

Das Assessment-System ist ein **heuristisches Werkzeug** mit folgenden Einschränkungen:

- Basiert auf Regeln, nicht auf Machine Learning
- Kann nur bewerten, was erfasst wurde (Garbage In, Garbage Out)
- Ersetzt keine fachliche Beurteilung durch Prozessexperten
- Scores sind Orientierungshilfen, keine absoluten Wahrheiten
- Branchenspezifische Besonderheiten werden nicht berücksichtigt

## Verwendung im Review-Tab

Das Assessment wird automatisch im Review-Tab angezeigt, wenn ein Prozess mit Version geladen ist:

1. **Zusammenfassung**: 1-2 Sätze Gesamteindruck
2. **Gesamtbewertung**: Score 0-100 mit Fortschrittsbalken
3. **Dimensionen**: Detailansicht jeder Dimension mit:
   - Level-Badge (Niedrig/Mittel/Hoch)
   - Score-Balken
   - Begründung (Bulletpoints)
   - Empfehlungen (Bulletpoints)
4. **Nächste Schritte**: Priorisierte To-do-Liste
5. **Automatisierungshinweise**: Kontextabhängige Tipps
6. **JSON-Download**: Export für externe Verwendung

## Weiterentwicklung

Mögliche zukünftige Erweiterungen:

- Branchenspezifische Bewertungsprofile
- Vergleich mit Benchmark-Prozessen
- Trend-Analyse über mehrere Versionen
- Integration mit Automatisierungs-Plattformen
- Kosten-Nutzen-Schätzung

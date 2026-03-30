# Maßnahmen-Backlog

## Überblick

Der Maßnahmen-Backlog ermöglicht die strukturierte Erfassung, Priorisierung und Nachverfolgung von Verbesserungsmaßnahmen für Geschäftsprozesse. Jede ProcessVersion hat ihren eigenen Backlog, wodurch die Entwicklung der Verbesserungsplanung über verschiedene Versionsstände nachvollziehbar wird.

## Konzept

Der Backlog basiert auf einem Impact-Effort-Risk-Modell zur automatischen Priorisierung:

**Prioritäts-Score = (Impact × 2) - Effort - Risk**

- **Impact** (Auswirkung): Wie groß ist der erwartete Nutzen?
- **Effort** (Aufwand): Wie hoch ist der Umsetzungsaufwand?
- **Risk** (Risiko): Wie hoch ist das Umsetzungsrisiko?

Jeder Faktor wird mit Low/Medium/High bewertet (1/2/3 Punkte).

### Priorisierungs-Beispiele

- **Hohe Priorität (Score ≥ 3)**: Hoher Impact, niedriger Aufwand, niedriges Risiko
  - Beispiel: Impact=High (3), Effort=Low (1), Risk=Low (1) → Score = 6-1-1 = +4
- **Mittlere Priorität (Score 1-2)**: Ausgewogenes Verhältnis
  - Beispiel: Impact=Medium (2), Effort=Medium (2), Risk=Low (1) → Score = 4-2-1 = +1
- **Niedrige Priorität (Score < 1)**: Hoher Aufwand bei geringem Nutzen
  - Beispiel: Impact=Low (1), Effort=High (3), Risk=High (3) → Score = 2-3-3 = -4

## Kategorien

Maßnahmen werden in folgende Kategorien eingeteilt:

1. **Standardisierung**: Vereinheitlichung von Prozessabläufen, Vorlagen, Regelwerken
2. **Digitalisierung**: Überführung analoger/papierbasierter Schritte in digitale Form
3. **Automatisierung**: Technische Automatisierung manueller Tätigkeiten
4. **KI-Einsatz**: Einsatz von Künstlicher Intelligenz für intelligente Automatisierung
5. **Daten**: Verbesserung von Datenqualität, -verfügbarkeit oder -integration
6. **Governance**: Verbesserung von Kontrollen, Compliance, Genehmigungsprozessen
7. **Kundennutzen**: Maßnahmen zur direkten Verbesserung der Kundenerfahrung
8. **Compliance**: Erfüllung regulatorischer oder interner Vorgaben
9. **Messung/KPI**: Einführung oder Verbesserung von Kennzahlen und Messverfahren

## Scope

Maßnahmen können zwei Scopes haben:

- **Prozess**: Bezieht sich auf den gesamten Prozess
- **Schritt**: Bezieht sich auf einen spezifischen Schritt im Happy Path

Bei Scope "Schritt" muss ein konkreter Prozessschritt ausgewählt werden.

## Status-Workflow

Maßnahmen durchlaufen typischerweise folgende Stati:

1. **Idee**: Erste Erfassung, noch nicht bewertet oder geplant
2. **Geplant**: Maßnahme ist bewertet und für die Umsetzung vorgesehen
3. **In Arbeit**: Maßnahme wird aktiv umgesetzt
4. **Erledigt**: Maßnahme ist vollständig umgesetzt
5. **Verworfen**: Maßnahme wird nicht weiterverfolgt

## Nutzung

### Maßnahme anlegen

1. Öffnen Sie das Wizard Playground
2. Laden Sie einen Prozess mit Version
3. Wechseln Sie zum Tab "Maßnahmen"
4. Klicken Sie auf "Maßnahme hinzufügen"
5. Füllen Sie die Pflichtfelder aus:
   - Titel (aussagekräftige Bezeichnung)
   - Kategorie (siehe oben)
   - Scope (Prozess oder Schritt)
   - Impact, Effort, Risk (Low/Medium/High)
   - Status (initial: Idee)

### Optional

- **Beschreibung**: Detaillierte Erläuterung der Maßnahme (ausklappbar)
- **Verantwortlich**: Person oder Team, das die Umsetzung verantwortet
- **Fällig am**: Ziel-Datum für die Fertigstellung

### Empfehlungen übernehmen

Der Button "Empfehlungen übernehmen" bietet automatisch generierte Vorschläge aus zwei Quellen:

**Assessment-basierte Vorschläge:**
- Qualitäts-Check (z.B. fehlende End-to-End-Definition, unvollständiger Happy Path)
- Reife-Dimensionen (Standardisierung, Daten/IT, Automatisierung, Risiko)
- Automatisierungshinweise basierend auf erkannten KI-Potenzialen

**Heuristische Vorschläge:**
- Deterministische Muster aus erfassten Prozessdaten
- Hoher manueller Anteil (>60% der Schritte ohne System/Automatisierung)
- Unvollständige System-Zuordnung (Medienbrüche identifizieren)
- Fehlende Datenobjekte trotz definierter Systeme
- missing_data-Ausnahmen (Input-Qualität verbessern)
- Fehlende KPIs (Messbarkeit schaffen)
- Operational Context (Häufigkeit/Durchlaufzeit als Priorisierungshinweis)

**Kontext-Anzeige:**
Im Vorschläge-Panel wird der Operational Context des Prozesses angezeigt:
- **Häufigkeit**: Wie oft der Prozess durchgeführt wird (täglich, wöchentlich, monatlich, etc.)
- **Durchlaufzeit**: Typische Bearbeitungsdauer (Minuten, Stunden, Tage, etc.)
- **Potenzial (grob)**: Eine automatische Einschätzung basierend auf Häufigkeit × Durchlaufzeit:
  - **Hoch** (Score ≥ 20): Prozesse die sehr häufig laufen und längere Durchlaufzeit haben
  - **Mittel** (Score 9-19): Moderate Kombination aus Häufigkeit und Durchlaufzeit
  - **Niedrig** (Score 1-8): Seltene oder sehr kurze Prozesse
  - **Unbekannt**: Wenn Häufigkeit oder Durchlaufzeit nicht erfasst wurden

**Sortierung:**
Die Vorschläge können optional nach "Potenzial (grob)" sortiert werden:
- Bei dieser Sortierung werden die Kategorien zusätzlich gewichtet (z.B. Automatisierung höher als Governance)
- Duplikate erscheinen immer am Ende der Liste
- Default-Sortierung ist "Standard" (Reihenfolge wie vom Assessment erzeugt)

**Hinweis:** Die Potenzial-Einschätzung ist eine grobe Orientierung und kein Ersatz für eine detaillierte Bewertung. Sie dient als erster Anhaltspunkt zur Priorisierung der Vorschläge. Bereits im Backlog vorhandene Vorschläge werden automatisch als Duplikat erkannt.

### Speichern

Klicken Sie auf "Änderungen speichern" wenn alle Maßnahmen erfasst sind. Änderungen werden erst beim Speichern persistent.

## Versionierung

**Wichtig**: Der Backlog ist Teil der ProcessVersion und wird mit dieser gespeichert.

- Jede Version hat ihren eigenen Backlog
- Beim Erstellen einer neuen Version wird der Backlog nicht automatisch übernommen
- Sie können Maßnahmen manuell kopieren oder einen neuen Backlog anlegen
- Export/Import (Process Bundle) schließt den Backlog mit ein

Dies ermöglicht:
- Nachvollziehbarkeit welche Maßnahmen zu welchem Zeitpunkt geplant waren
- Separate Verbesserungsplanung für unterschiedliche Prozess-Evolutionsstufen
- Archivierung erledigter Maßnahmen mit der entsprechenden Version

## Best Practices

1. **Realistische Bewertung**: Überschätzen Sie Impact nicht, unterschätzen Sie Effort nicht
2. **Konkrete Titel**: "SAP-Workflow für Genehmigung implementieren" statt "Prozess verbessern"
3. **Fokus auf Quick Wins**: Maßnahmen mit hohem Score liefern schnellen Mehrwert
4. **Regelmäßige Reviews**: Prüfen Sie Status und Prioritäten in regelmäßigen Abständen
5. **Verknüpfung mit Schritten**: Nutzen Sie Scope "Schritt" für präzise Lokalisierung
6. **Verantwortlichkeit klären**: Weisen Sie Maßnahmen konkrete Owner zu
7. **Zeitplanung**: Setzen Sie realistische Fälligkeitsdaten

## Automatisierungs-Steckbrief

Für Maßnahmen der Kategorien **Automatisierung** und **KI-Einsatz** kann ein detaillierter Automatisierungs-Steckbrief angelegt werden. Dieser konkretisiert die technische Umsetzung und dient als Grundlage für Architekturentscheidungen und Umsetzungsplanung.

### Wann verwenden?

Der Steckbrief ist sinnvoll wenn:
- Die Maßnahme eine technische Lösung erfordert
- Mehrere Systeme oder Datenobjekte beteiligt sind
- Klärung des Automatisierungsgrads notwendig ist
- Kontrollmechanismen definiert werden müssen

### Komponenten des Steckbriefs

#### 1. Ansatz (Umsetzungsart)

Definiert die technologische Basis:

- **Workflow / Prozess-Engine**: Orchestrierung über BPM-Plattform (z.B. Camunda)
- **RPA (UI-Automatisierung)**: Software-Roboter für bestehende Anwendungen
- **API-Integration**: Direkte Systemintegration über Schnittstellen
- **ERP/Standard-Konfiguration**: Nutzung vorhandener Standardfunktionen
- **Low-Code / Formular-App**: Schnelle Entwicklung mit Low-Code-Plattformen
- **KI-Assistent**: Unterstützung von Mitarbeitern durch KI (z.B. Copilot)
- **KI: Dokumente/Extraktion**: Automatische Dokumentenverarbeitung (z.B. OCR, NLP)
- **KI: Klassifikation/Entscheidungshilfe**: KI-gestützte Entscheidungsfindung
- **Process Mining**: Analyse und Optimierung durch Process Mining
- **Sonstiges**: Andere Automatisierungsansätze

#### 2. Zielgrad (Automatisierungsstufe)

Beschreibt den angestrebten Automatisierungsgrad:

- **Assistiert**: System unterstützt, Mensch entscheidet und führt aus
  - Beispiel: KI schlägt Kategorie vor, Sachbearbeiter wählt aus
- **Teilautomatisiert**: Automatisierung einzelner Schritte, Mensch im Gesamtprozess
  - Beispiel: Daten werden automatisch erfasst, Prüfung und Freigabe manuell
- **Vollautomatisiert (Straight-Through)**: Komplett automatisierte Durchführung
  - Beispiel: Routinebestellungen werden ohne menschliches Eingreifen abgewickelt

#### 3. Human-in-the-Loop (HITL)

Gibt an, ob und an welcher Stelle menschliche Entscheidungen oder Überprüfungen erforderlich sind.

**Warum Human-in-the-Loop wichtig ist:**

1. **Qualität und Verlässlichkeit**: Automatisierte Systeme können Fehler machen. HITL ermöglicht Überprüfung und Korrektur.

2. **Compliance und Verantwortung**: In regulierten Bereichen müssen oft Menschen die finale Verantwortung tragen.

3. **Lernen und Anpassung**: Durch menschliches Feedback können Systeme kontinuierlich verbessert werden.

4. **Vertrauen und Akzeptanz**: Nutzer akzeptieren automatisierte Entscheidungen eher wenn sie wissen, dass menschliche Überprüfung möglich ist.

5. **Flexibilität**: Menschen können mit unvorhergesehenen Situationen umgehen, die das System nicht abdeckt.

**Best Practice**: Auch bei "Vollautomatisiert" sollte HITL für Ausnahmen und kritische Fälle vorgesehen sein.

#### 4. Referenzierte Ressourcen

Der Steckbrief kann Bezüge zu bestehenden Prozesselementen herstellen:

- **Systeme**: Welche IT-Systeme sind beteiligt? (aus Sidecar)
- **Datenobjekte**: Welche Daten werden verarbeitet? (aus Sidecar)
- **KPIs**: Welche Kennzahlen werden beeinflusst? (aus Sidecar)

Dies schafft Transparenz über:
- Systemabhängigkeiten und Integrationspunkte
- Datenschutz-relevante Verarbeitungen
- Messbarkeit des Erfolgs

#### 5. Controls (Kontrollmechanismen)

Definition notwendiger Überwachungs- und Steuerungsmechanismen:

- **Audit Trail**: Lückenlose Protokollierung aller Aktivitäten
- **Freigabe/Approval**: Manuelle Freigabeschritte an kritischen Stellen
- **Monitoring**: Technische Überwachung und Alerting
- **Datenschutz**: Besondere Datenschutzvorkehrungen (z.B. Pseudonymisierung)
- **Manuelles Fallback**: Möglichkeit zur manuellen Übernahme bei Fehlern

#### 6. Notizen

Freitextfeld für zusätzliche technische Hinweise, Abhängigkeiten oder Besonderheiten.

### Beispiele

**Beispiel 1: Teilautomatisierte Rechnungsverarbeitung**
- **Ansatz**: KI: Dokumente/Extraktion
- **Zielgrad**: Teilautomatisiert
- **HITL**: Ja
- **Systeme**: SAP, OCR-System
- **Datenobjekte**: Eingangsrechnung, Buchungsbeleg
- **Controls**: Audit Trail, Freigabe, Datenschutz
- **Notizen**: Bei Beträgen > 10.000 EUR immer manuelle Freigabe

**Beispiel 2: Vollautomatisierte Bestellbestätigung**
- **Ansatz**: API-Integration
- **Zielgrad**: Vollautomatisiert (Straight-Through)
- **HITL**: Ja (nur für Ausnahmen)
- **Systeme**: E-Shop, ERP, E-Mail-System
- **KPIs**: Bestellbestätigungszeit, Fehlerquote
- **Controls**: Audit Trail, Monitoring, Manuelles Fallback
- **Notizen**: Bei fehlendem Lagerbestand automatische Eskalation an Disposition

**Beispiel 3: KI-Assistent für Kundenanfragen**
- **Ansatz**: KI-Assistent
- **Zielgrad**: Assistiert
- **HITL**: Ja
- **Systeme**: CRM, LLM-Plattform
- **Datenobjekte**: Kundenanfrage, Antwortvorschlag
- **Controls**: Audit Trail, Datenschutz, Manuelles Fallback
- **Notizen**: KI schlägt Antworten vor, Mitarbeiter prüft vor Versand

### Nutzung im Editor

1. Maßnahme mit Kategorie "Automatisierung" oder "KI-Einsatz" anlegen
2. Beschreibung aufklappen
3. Steckbrief erscheint automatisch unterhalb der Beschreibung
4. Felder ausfüllen
5. Speichern

Der Steckbrief wird nur angezeigt wenn die Kategorie "Automatisierung" oder "KI-Einsatz" ist.

## Filter & Sortierung

Für Workshops und Projekte mit vielen Maßnahmen (30-80+) bietet der Editor umfangreiche Filter- und Sortierfunktionen:

### Filterkriterien

- **Suche**: Durchsucht Titel, Beschreibung, Verantwortlichen und bei Scope "Schritt" auch die Schritt-Labels
- **Kategorie**: Filtern nach spezifischen Kategorien (Automatisierung, KI-Einsatz, etc.)
- **Status**: Filtern nach Bearbeitungsstatus (Idee, Geplant, In Arbeit, Erledigt, Verworfen)
- **Scope**: Filtern nach Prozess- oder Schritt-Maßnahmen
- **Nur offen**: Checkbox um nur nicht-erledigte Maßnahmen anzuzeigen (schließt "Erledigt" und "Verworfen" aus)

### Sortierung

- **Priorität (hoch → niedrig)**: Sortiert nach berechnetem Prioritäts-Score (Standard)
- **„Nutzenindikator (grob)“**: Sortiert nach heuristischem Nutzen-Score basierend auf Prozess-Potenzial (Häufigkeit × Durchlaufzeit), Kategorie-Faktor und Item-Priorität
- **Fälligkeit (früh → spät)**: Sortiert nach Fälligkeitsdatum (Maßnahmen ohne Datum erscheinen am Ende)
- **Zuletzt geändert**: Sortiert nach letzter Änderung (neueste zuerst)
- **Titel (A → Z)**: Alphabetische Sortierung

**Backlog-Sortierung „Nutzenindikator (grob)“**

Diese optionale Sortierung verknüpft mehrere Faktoren zu einer groben Nutzen-Einschätzung:
- **Berechnung (heuristisch)**: Nutzenindikator = (Prioritäts-Score + 5) × (Häufigkeitgewicht × Durchlaufzeitgewicht) × Kategorie-Faktor
- **Kategorie-Faktoren**: Automatisierung (1.3) > KI (1.2) > Standardisierung (1.1) > Digitalisierung/Daten (1.0) > KPI (0.9) > Kunde/Governance/Compliance (0.8)
- **Zweck**: Erste Orientierung, wenn Operational Context (Häufigkeit/Durchlaufzeit) erfasst wurde
- **Kontext-Anzeige**: Im Filterbereich wird der Operational Context angezeigt (Häufigkeit, Durchlaufzeit, Potenzial)
- **Item-Anzeige**: Bei dieser Sortierung wird pro Maßnahme der grobe Nutzen-Score angezeigt
- **Hinweis**: Keine automatische Priorisierung, dient nur als Orientierung. Nutzer entscheidet final basierend auf detaillierter Bewertung

### Kennzahlen

Die Filterleiste zeigt stets eine Übersicht:
- Anzahl sichtbarer vs. gesamte Maßnahmen
- Anzahl offener Maßnahmen
- Anzahl erledigter Maßnahmen
- Anzahl verworfener Maßnahmen

Der Button "Filter zurücksetzen" setzt alle Filter und die Sortierung auf Standardwerte zurück. Dies ist hilfreich um nach intensiver Filterung schnell zur Gesamtübersicht zurückzukehren oder um Validierungsfehler zu finden.

### Tipps für große Backlogs

1. **Kombination**: Kombinieren Sie Filter für präzise Ergebnisse (z.B. "Nur offen" + Kategorie "Automatisierung" + Status "Geplant")
2. **Suche für Quick Access**: Nutzen Sie die Suche um schnell zu spezifischen Maßnahmen oder Verantwortlichen zu springen
3. **Sortierung nach Fälligkeit**: Bei Zeit-kritischen Reviews nach Fälligkeitsdatum sortieren
4. **Reset bei Validierung**: Vor dem Speichern Filter zurücksetzen um sicherzustellen dass alle Maßnahmen korrekt sind

## Integration mit Assessment

Die automatische Prozessbewertung (Assessment) im Report gibt Hinweise auf Verbesserungspotenziale. Diese Empfehlungen können als Grundlage für neue Maßnahmen im Backlog dienen.

## Maßnahmenbibliothek

Die Maßnahmenbibliothek bietet vordefinierte Templates für häufige Verbesserungsmaßnahmen. Templates enthalten:
- Titel und Beschreibung
- Kategorie (z.B. Standardisierung, Digitalisierung, Automatisierung, KI)
- Scope (Prozess oder Schritt)
- Default-Werte für Impact, Effort und Risk
- Optional: Automation Blueprint (für automatisierungs-spezifische Templates)

### Templates nutzen

1. Im Tab "Maßnahmen" finden Sie oberhalb der Item-Liste die Sektion "Maßnahmenbibliothek (Templates)"
2. Filtern Sie nach Kategorie oder durchsuchen Sie die Templates
3. Bei Schritt-Templates wählen Sie den konkreten Schritt aus dem Dropdown
4. Klicken Sie "Hinzufügen", um ein neues Backlog-Item aus dem Template zu erzeugen

**Duplikat-Schutz**: Ein Template kann nicht erneut hinzugefügt werden, wenn bereits ein Item mit gleichem normalisierten Titel und gleichem Scope/Schritt existiert.

Verfügbare Templates (Beispiele):
- Checkliste & Definition of Done einführen (Standardisierung, Schritt)
- Input-Qualität sicherstellen (Standardisierung, Schritt)
- Papier/Excel durch digitales Formular ersetzen (Digitalisierung, Schritt)
- API-Integration statt manuelles Copy/Paste (Automatisierung, Schritt)
- RPA Quick Win (Automatisierung, Schritt)
- KI-Assistent im Schritt einführen (KI, Schritt)
- Automatische Dokumenten-Extraktion (KI, Schritt)
- Audit Trail & Freigabe-Workflow einführen (Governance, Prozess)
- KPI-Monitoring einführen (KPI, Prozess)

## Impact-Schätzung & Simulation (grob)

Für jede Maßnahme können Sie eine grobe Impact-Schätzung hinterlegen:

### Felder

- **Betroffene Fälle (%)**: Welcher Anteil der Fälle profitiert von der Maßnahme? (0-100%, Default: 100)
- **Einsparung pro Fall (Min)**: Wie viele Minuten Durchlaufzeit werden pro Fall eingespart? (grobe Schätzung)
- **Notiz**: Freitext für Annahmen oder Erläuterungen zur Schätzung

### Simulation

Die Simulation basiert auf den Schritt-Kennzahlen (Processing Time / Waiting Time Buckets aus dem Happy Path):

1. **Baseline**: Summe der bekannten Bearbeitungs- und Wartezeiten aller Schritte (in Minuten, grobe Annahmen)
   - minutes = 15, hours = 120, 1_day = 480, 2_5_days = 1680, 1_2_weeks = 3600, over_2_weeks = 7200
   - unknown/varies werden nicht quantifiziert und separat ausgewiesen

2. **Szenario**: Auswahl offener Maßnahmen (Status != done/discarded)
   - Pro Maßnahme: erwartete Einsparung = (Betroffene Fälle % / 100) × Einsparung pro Fall (Min)
   - Summe aller ausgewählten Maßnahmen = Gesamteinsparung pro Fall

3. **Ergebnis**:
   - Erwartete Einsparung pro Fall (in Minuten, formatiert als Xm/Xh/Xd)
   - Baseline (bekannt) vs. Szenario (bekannt) = Baseline - Einsparung
   - Falls Frequency im Operational Context gesetzt: Hochrechnung auf Stunden/Jahr

**Hinweis**: Dies ist eine grobe Simulation basierend auf Annahmen. Sie dient zur Orientierung und Priorisierung, nicht zur exakten Kostenkalkulation. Unbekannte/variierende Schritte werden separat ausgewiesen.

## Reporting

Im Process Report (Tab "Report") wird der Maßnahmen-Backlog tabellarisch dargestellt mit:
- Priorität und Score
- Status
- Kategorie
- Titel
- Scope/Schritt
- Verantwortlicher
- Fälligkeitsdatum
- Impact-Schätzung (falls vorhanden)

Die Report-Ansicht eignet sich für:
- Status-Meetings
- Management-Präsentationen
- Dokumentation der Verbesserungsplanung
- PDF-Export für Archivierung

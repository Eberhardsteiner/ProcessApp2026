import type { AssistCaptureSeed } from './assistedCaptureSeed';
import { buildSeedBlock, hasMeaningfulSeed } from './assistedCaptureSeed';

export interface ClaudePromptInput {
  rawText: string;
  translatedText?: string;
  processTitleHint?: string;
  captureMode?: 'artifact' | 'case' | 'cases';
  seedCapture?: AssistCaptureSeed;
}

export function buildClaudeExtractionPrompt(input: ClaudePromptInput): string {
  const { rawText, translatedText, processTitleHint, captureMode, seedCapture } = input;
  const mode = captureMode ?? 'artifact';
  const isSingleCase = mode === 'case';
  const isMultiCase = mode === 'cases';

  const caseModeInstructions = isSingleCase ? `
WICHTIG: Der INPUT beschreibt einen konkreten Einzelfall (Instanz).
Deine Aufgabe: Leite daraus einen typischen Happy Path ab (Richtwert: 10–30 Schritte; bei Bedarf auch mehr).
- Alles, was im Fall ein Sonderweg, eine Entscheidung oder Abweichung ist, gehört NICHT in den happyPath, sondern in decisions oder exceptions.
- Wenn Informationen fehlen oder unklar sind: KEINE Rückfragen stellen, sondern assumptions/warnings nutzen.
- Der Happy Path soll den Standard-Ablauf darstellen, nicht den konkreten Einzelfall mit all seinen Besonderheiten.
` : '';

  const multiCaseInstructions = isMultiCase ? `
WICHTIG: Der INPUT enthält mehrere konkrete Einzelfälle (Instanzen), typischerweise 3–5.
Deine Aufgabe: Konsolidiere daraus einen stabilen typischen Happy Path (Richtwert: 10–30 Schritte; bei Bedarf auch mehr), der den Standardablauf beschreibt.
- Unterschiede zwischen Fällen modellierst du als decisions (Entscheidungen) oder exceptions (Ausnahmen).
- Verwende KEINE fallspezifischen Namen/IDs, abstrahiere/anonymisiere.
- Wenn unklar: KEINE Rückfragen stellen, sondern assumptions/warnings nutzen.
- Fasse beobachtete Variantencluster kurz in notes[] zusammen (z.B. "Variante: ...", "Häufigkeit: häufig/selten/unbekannt"), zusätzlich zur Modellierung als decisions/exceptions.
` : '';

  const translationInstructions = translatedText ? `
HINWEIS: Zusätzlich liegt eine Übersetzung vor (vom Nutzer bereitgestellt).
- Nutze Original und Übersetzung gemeinsam.
- Wenn Aussagen widersprüchlich sind: notiere dies in warnings und entscheide pragmatisch.
- Erfinde keine Details.
` : '';

  const seedBlock = seedCapture && hasMeaningfulSeed(seedCapture)
    ? '\n\n' + buildSeedBlock(seedCapture) + '\n\n'
    : '';

  return `Du bist Experte für Geschäftsprozessmanagement und BPMN.
${caseModeInstructions}${multiCaseInstructions}${translationInstructions}${seedBlock}
AUFGABE: Analysiere die nachfolgende Prozessbeschreibung und extrahiere strukturierte Daten für einen Geschäftsprozess.

ANFORDERUNGEN:

1. End-to-End Definition:
   - trigger: Was startet den Prozess?
   - customer: Wer ist der Kunde/Nutznießer?
   - outcome: Was ist das Ergebnis für den Kunden?
   - doneCriteria (optional): Wann ist der Prozess abgeschlossen?

2. Happy Path (Hauptablauf):
   - Extrahiere die Hauptschritte (Richtwert: 10–30; wenn der Prozess sonst unvollständig wäre, auch mehr)
   - Form: "Substantiv + Verb" (z.B. "Antrag prüfen", "Rechnung erstellen")
   - Chronologische Reihenfolge
   - Keine Verzweigungen im Happy Path

3. Entscheidungen (optional):
   - afterStep: Nach welchem Schritt? (1-basierter Index im Happy Path)
   - question: Entscheidungsfrage
   - gatewayType: Bevorzugt "xor" (entweder/oder)
   - evidenceSnippet (optional): Kurzes Beleg-Snippet aus dem INPUT (Zitat oder sehr nahe Paraphrase), max. 180 Zeichen
     - Keine personenbezogenen Daten
     - Wenn kein klarer Beleg vorhanden: evidenceSnippet weglassen oder leer lassen
   - branches: Array mit:
     - conditionLabel: Beschriftung der Bedingung
     - nextStep: Sprung zu Schritt (1-basierter Index) ODER
     - endsProcess: true (Prozess endet hier)
     - notes (optional): Erläuterungen

4. Ausnahmen (optional):
   - type: "missing_data", "timeout", "error", "cancellation", "compliance", "other"
   - relatedStep (optional): Bezugsschritt (1-basierter Index)
   - description: Beschreibung der Ausnahme
   - handling: Wie wird damit umgegangen?
   - evidenceSnippet (optional): Kurzes Beleg-Snippet aus dem INPUT (Zitat oder sehr nahe Paraphrase), max. 180 Zeichen
     - Keine personenbezogenen Daten
     - Wenn kein klarer Beleg vorhanden: evidenceSnippet weglassen oder leer lassen

5. Rollen (optional):
   - Array mit Rollennamen (z.B. ["Sachbearbeiter", "Teamleiter"])

6. Systeme (optional):
   - Array mit IT-System-Namen (z.B. ["SAP", "CRM-System"])

7. Datenobjekte (optional):
   - Array mit Dokumenten/Datenobjekten (z.B. ["Antrag", "Vertrag"])

8. KPIs (optional):
   - name: KPI-Bezeichnung
   - definition: Was wird gemessen?
   - unit (optional): Einheit (z.B. "Stunden", "%")
   - target (optional): Zielwert (z.B. "< 24h")

9. KI-Reife-Signale (optional):
   - standardization: low/medium/high (Wie standardisiert ist der Prozess?)
   - dataAvailability: low/medium/high (Wie gut sind Daten verfügbar?)
   - variability: low/medium/high (Wie variabel ist die Ausführung?)
   - complianceRisk: low/medium/high (Wie hoch ist das Compliance-Risiko?)

10. Ergänzungen (optional):
    - stepDetails: Array mit Details zu einzelnen Schritten:
      - step: Schritt-Nummer (1-basiert)
      - role: Rollenname
      - system: System-Name
      - workType: "manual", "user_task", "service_task", "ai_assisted", "unknown"
      - painPointHint: Hinweis auf Schmerzpunkte
      - dataIn: Array mit Input-Datenobjekten
      - dataOut: Array mit Output-Datenobjekten
      - evidenceSnippet: Kurzes Beleg-Snippet aus dem INPUT (Zitat oder sehr nahe Paraphrase), max. 180 Zeichen
        - Keine personenbezogenen Daten
        - Wenn kein klarer Beleg vorhanden: evidenceSnippet leer lassen oder weglassen
    - notes: Allgemeine Hinweise
    - assumptions: Annahmen bei der Extraktion
    - warnings: Unsicherheiten oder fehlende Informationen

AUSGABEFORMAT:

Gib ausschließlich gültiges JSON aus, ohne Codeblock, ohne Kommentare, ohne Zusatztext.

JSON-Schema:
{
  "schemaVersion": "ai-capture-v1",
  "language": "de",
  "endToEnd": {
    "trigger": "...",
    "customer": "...",
    "outcome": "...",
    "doneCriteria": "..."
  },
  "happyPath": ["Schritt 1", "Schritt 2", ...],
  "roles": ["Rolle 1", ...],
  "systems": ["System 1", ...],
  "dataObjects": ["Dokument 1", ...],
  "kpis": [
    { "name": "...", "definition": "...", "unit": "...", "target": "..." }
  ],
  "aiReadinessSignals": {
    "standardization": "low|medium|high",
    "dataAvailability": "low|medium|high",
    "variability": "low|medium|high",
    "complianceRisk": "low|medium|high"
  },
  "decisions": [
    {
      "afterStep": 3,
      "question": "...",
      "gatewayType": "xor",
      "evidenceSnippet": "Kurzer Beleg aus dem Input: ...",
      "branches": [
        { "conditionLabel": "Ja", "nextStep": 5 },
        { "conditionLabel": "Nein", "endsProcess": true }
      ]
    }
  ],
  "exceptions": [
    {
      "type": "missing_data",
      "relatedStep": 2,
      "description": "...",
      "handling": "...",
      "evidenceSnippet": "Kurzer Beleg aus dem Input: ..."
    }
  ],
  "stepDetails": [
    {
      "step": 1,
      "role": "Rolle 1",
      "system": "System 1",
      "workType": "user_task",
      "painPointHint": "...",
      "dataIn": ["Dokument 1"],
      "dataOut": ["Dokument 2"],
      "evidenceSnippet": "Kurzer Beleg aus dem Input: ..."
    }
  ],
  "notes": ["Hinweis 1", ...],
  "assumptions": ["Annahme 1", ...],
  "warnings": ["Warnung 1", ...]
}

Wichtig:
- Pflichtfelder: schemaVersion, language, endToEnd (trigger, customer, outcome), happyPath
- Alle anderen Felder sind optional
- Verwende deutsche Bezeichnungen
${processTitleHint ? `- Prozess-Titel: "${processTitleHint}"\n` : ''}- Strukturiere sorgfältig, aber pragmatisch
- Bei Unsicherheiten: lieber warnings nutzen als ungenaue Daten
- Erzeuge nach Möglichkeit für JEDEN Schritt im happyPath einen stepDetails-Eintrag mit evidenceSnippet
- role/system/workType/dataIn/dataOut bleiben in stepDetails optional, aber evidenceSnippet sollte möglichst gesetzt werden
- Erzeuge nach Möglichkeit auch für Entscheidungen und Ausnahmen evidenceSnippet (kurz), wenn im Input ein klarer Beleg vorhanden ist

### INPUT (Original)

${rawText}

${translatedText ? `

### INPUT (Übersetzung, vom Nutzer bereitgestellt)

${translatedText}
` : ''}`;
}

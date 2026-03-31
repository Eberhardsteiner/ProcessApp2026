import type { Process, ProcessVersion } from '../domain/process';
import { assessProcess } from '../assessment/processAssessment';
import { generateHeuristicCandidates } from '../assessment/heuristicRecommendations';

export function buildClaudeImprovementSuggestionsPrompt(input: {
  process: Process;
  version: ProcessVersion;
  existingTitles: string[];
}): string {
  const { process, version, existingTitles } = input;
  const draft = version.sidecar.captureDraft;
  const e2e = version.endToEndDefinition;

  const oc = version.sidecar.operationalContext;

  type SeedCandidate = { text: string; sourceLabel: string };

  const assessment = assessProcess(process, version);

  const seedCandidates: SeedCandidate[] = [];

  assessment.dimensions.forEach((dim) => {
    dim.recommendations.forEach((rec) => {
      seedCandidates.push({ text: rec, sourceLabel: `Assessment: ${dim.label}` });
    });
  });

  assessment.nextSteps.forEach((step) => {
    seedCandidates.push({ text: step, sourceLabel: 'Assessment: Nächste Schritte' });
  });

  assessment.automationHints.forEach((hint) => {
    seedCandidates.push({ text: hint, sourceLabel: 'Assessment: Automatisierungshinweise' });
  });

  generateHeuristicCandidates(process, version).forEach((h) => {
    seedCandidates.push({ text: h.text, sourceLabel: h.sourceLabel });
  });

  const seen = new Set<string>();
  const uniqueSeeds: SeedCandidate[] = [];

  seedCandidates.forEach((c) => {
    const t = (c.text || '').trim();
    if (!t) return;

    const norm = t.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(norm)) return;

    seen.add(norm);
    uniqueSeeds.push({ ...c, text: t });
  });

  const limitedSeeds = uniqueSeeds.slice(0, 18);

  const seedsHint =
    uniqueSeeds.length > limitedSeeds.length
      ? `\n(Hinweis: Liste gekürzt auf ${limitedSeeds.length} von ${uniqueSeeds.length} Kandidaten)`
      : '';

  const seedsBlock = limitedSeeds.length
    ? limitedSeeds.map((c) => `- [${c.sourceLabel}] ${c.text}`).join('\n')
    : '- (keine)';

  const systemsList = version.sidecar.systems
    .map((s) => `  { "id": "${s.id}", "name": "${s.name}" }`)
    .join(',\n');

  const dataObjectsList = version.sidecar.dataObjects
    .map((d) => `  { "id": "${d.id}", "name": "${d.name}" }`)
    .join(',\n');

  const kpisList = version.sidecar.kpis
    .map((k) => `  { "id": "${k.id}", "name": "${k.name}" }`)
    .join(',\n');

  const happyPathSteps = (draft?.happyPath || [])
    .map((s) => `  ${s.order}. ${s.label} (stepId: "${s.stepId}")`)
    .join('\n');

  const cleanedTitles = (existingTitles || [])
    .map((t) => (t || '').trim())
    .filter((t) => t.length > 0);

  const limitedTitles = cleanedTitles.slice(0, 60);
  const titlesBlock = limitedTitles.length
    ? limitedTitles.map((t) => `- ${t}`).join('\n')
    : '- (keine)';

  const titlesHint =
    cleanedTitles.length > limitedTitles.length
      ? `\n(Hinweis: Liste gekürzt auf ${limitedTitles.length} Titel)`
      : '';

  const operationalContextText = oc
    ? `\nOperational Context (grob, darf Unsicherheit enthalten):\n  Häufigkeit: ${oc.frequency || 'nicht erfasst'}\n  Typische Durchlaufzeit: ${oc.typicalLeadTime || 'nicht erfasst'}`
    : '\nOperational Context: nicht erfasst';

  const exampleStepId = draft?.happyPath?.[0]?.stepId;
  const exampleSystemId = version.sidecar.systems?.[0]?.id;

  const exampleSystemIdsJson = exampleSystemId ? `["${exampleSystemId}"]` : `[]`;

  const example2ScopeBlock = exampleStepId
    ? `"scope": "step",\n      "relatedStepId": "${exampleStepId}",`
    : `"scope": "process",`;

  return `Du bist Experte für Prozessmanagement, Digitalisierung, Automatisierung und KI-Governance.

Aufgabe: Erzeuge 8–15 neue, praxistaugliche Maßnahmenvorschläge für den folgenden Prozess.
Gib ausschließlich gültiges JSON aus (ohne Codeblock, ohne Zusatztext).

Kontext:

Prozess: ${process.title}

End-to-End:
  Trigger: ${e2e.trigger || 'nicht definiert'}
  Kunde: ${e2e.customer || 'nicht definiert'}
  Outcome: ${e2e.outcome || 'nicht definiert'}
  Fertig-Kriterien: ${e2e.doneCriteria || 'nicht definiert'}${operationalContextText}

Happy Path Schritte:
${happyPathSteps || '  keine Schritte definiert'}

Erlaubte Systeme (nur diese IDs verwenden):
[
${systemsList || '  keine Systeme definiert'}
]

Erlaubte Datenobjekte (nur diese IDs verwenden):
[
${dataObjectsList || '  keine Datenobjekte definiert'}
]

Erlaubte KPIs (nur diese IDs verwenden):
[
${kpisList || '  keine KPIs definiert'}
]

Bereits vorhandene Maßnahmentitel (bitte NICHT duplizieren oder nur minimal umformulieren):${titlesHint}
${titlesBlock}

Interne Kandidaten (Assessment + Heuristiken, als Ausgangspunkt):${seedsHint}
${seedsBlock}

Wichtig:
- Nutze diese Kandidaten als Ausgangspunkt, aber formuliere die finalen Backlog‑Items präzise und praxisnah.
- Du darfst Kandidaten zusammenführen, konkretisieren oder priorisieren.
- Vermeide Copy/Paste der Kandidatensätze als Titel.
- Wenn du einen Vorschlag machst, der NICHT aus den Kandidaten ableitbar ist, schreibe den Grund kurz in assumptions.

Output-Regeln:
- Gib ausschließlich gültiges JSON aus (kein Markdown, keine Erklärungen, kein Text außerhalb des JSON)
- schemaVersion muss exakt "ai-improvement-suggestions-v1" sein
- language muss "de" sein
- suggestions: 8–15 Einträge
- Jeder Vorschlag MUSS mindestens enthalten:
  title, category, scope, impact, effort, risk
- Wenn scope "step" ist, MUSS relatedStepId gesetzt sein und eine der oben gelisteten stepId sein
- Wenn category "automate" oder "ai" ist, MUSS automationBlueprint vollständig enthalten sein
- systemIds/dataObjectIds/kpiIds: nur IDs aus den oben genannten Listen verwenden (keine neuen IDs erfinden)
- Wenn dir Informationen fehlen: keine Rückfragen stellen, sondern assumptions/warnings nutzen
- Keine Details erfinden (keine Systeme, KPIs, Datenobjekte, die nicht in den Listen stehen)

Erlaubte Werte:
- categories: standardize, digitize, automate, ai, data, governance, customer, compliance, kpi
- status: idea, planned, in_progress, done, discarded
- scope: process, step
- level (impact/effort/risk): low, medium, high
- approach: workflow, rpa, api_integration, erp_config, low_code, ai_assistant, ai_document_processing, ai_classification, process_mining, other
- level (automation): assist, partial, straight_through
- controls: audit_trail, approval, monitoring, data_privacy, fallback_manual

JSON-Vorlage (Beispiel, du musst 8–15 liefern):
{
  "schemaVersion": "ai-improvement-suggestions-v1",
  "language": "de",
  "suggestions": [
    {
      "title": "Beispiel: Rückfragen reduzieren durch Pflichtfelder am Eingang",
      "description": "Problem: Häufig fehlen Basisdaten. Maßnahme: Pflichtfelder/Validierung am Eingang, Checkliste. Effekt: weniger Schleifen, schnellere Durchlaufzeit. Messung: Anteil Rework-Fälle, Lead Time.",
      "category": "standardize",
      "scope": "process",
      "impact": "high",
      "effort": "medium",
      "risk": "low",
      "status": "idea"
    },
    {
      "title": "Beispiel: Teilautomatisierung eines manuellen Prüfschritts",
      "description": "Maßnahme: Automatisierter Check im System, Ergebnis als Hinweis für Mitarbeiter. Effekt: Zeitersparnis, weniger Fehler. Messung: Bearbeitungszeit Schritt, Fehlerquote.",
      "category": "automate",
      ${example2ScopeBlock}
      "impact": "high",
      "effort": "high",
      "risk": "medium",
      "status": "idea",
      "automationBlueprint": {
        "approach": "workflow",
        "level": "partial",
        "humanInTheLoop": true,
        "systemIds": ${exampleSystemIdsJson},
        "dataObjectIds": [],
        "kpiIds": [],
        "controls": ["audit_trail", "monitoring"],
        "notes": "Nur IDs aus den Listen verwenden."
      }
    }
  ],
  "assumptions": ["Annahme 1"],
  "warnings": ["Warnung 1"]
}

Gib jetzt ausschließlich das JSON aus:`;
}

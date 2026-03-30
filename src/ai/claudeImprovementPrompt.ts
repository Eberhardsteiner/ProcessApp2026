import type { Process, ProcessVersion, ImprovementBacklogItem } from '../domain/process';

export function buildClaudeImprovementPrompt(input: {
  process: Process;
  version: ProcessVersion;
  item: ImprovementBacklogItem;
}): string {
  const { process, version, item } = input;
  const draft = version.sidecar.captureDraft;

  const e2e = version.endToEndDefinition;

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

  let relatedStepInfo = '';
  if (item.scope === 'step' && item.relatedStepId) {
    const step = draft?.happyPath?.find((s) => s.stepId === item.relatedStepId);
    if (step) {
      relatedStepInfo = `\nDiese Maßnahme bezieht sich auf Schritt: ${step.order}. ${step.label}`;
    }
  }

  const blueprintText = item.automationBlueprint
    ? `\n  Automatisierungs-Steckbrief:\n    Ansatz: ${item.automationBlueprint.approach}\n    Zielgrad: ${item.automationBlueprint.level}\n    Human-in-the-loop: ${item.automationBlueprint.humanInTheLoop}\n    Systeme: ${item.automationBlueprint.systemIds?.join(', ') || 'keine'}\n    Datenobjekte: ${item.automationBlueprint.dataObjectIds?.join(', ') || 'keine'}\n    KPIs: ${item.automationBlueprint.kpiIds?.join(', ') || 'keine'}\n    Kontrollen: ${item.automationBlueprint.controls?.join(', ') || 'keine'}\n    Notizen: ${item.automationBlueprint.notes || 'keine'}`
    : '\n  Automatisierungs-Steckbrief: nicht vorhanden';

  return `Du bist Experte für Prozessmanagement, Automatisierung und KI-Governance.

Aufgabe: Verbessere und konkretisiere die folgende Maßnahme. Gib ausschließlich gültiges JSON aus (ohne Codeblock, ohne Zusatztext).

Kontext:

Prozess: ${process.title}

End-to-End:
  Trigger: ${e2e.trigger || 'nicht definiert'}
  Kunde: ${e2e.customer || 'nicht definiert'}
  Outcome: ${e2e.outcome || 'nicht definiert'}
  Fertig-Kriterien: ${e2e.doneCriteria || 'nicht definiert'}

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

Maßnahme (IST-Zustand):
  ID: ${item.id}
  Titel: ${item.title || 'nicht definiert'}
  Kategorie: ${item.category}
  Scope: ${item.scope}${relatedStepInfo}
  Impact: ${item.impact}
  Effort: ${item.effort}
  Risiko: ${item.risk}
  Verantwortlich: ${item.owner || 'nicht definiert'}
  Fällig am: ${item.dueDate || 'nicht definiert'}
  Status: ${item.status}
  Beschreibung: ${item.description || 'nicht definiert'}${blueprintText}

Output-Regeln:
- Gib ausschließlich gültiges JSON aus (kein Markdown, keine Erklärungen, kein Text außerhalb des JSON)
- schemaVersion muss exakt "ai-improvement-v1" sein
- language muss "de" sein
- itemId muss exakt "${item.id}" sein
- Im "patch"-Objekt: nur Felder angeben, die du ändern/verbessern möchtest
- systemIds, dataObjectIds, kpiIds: nur IDs aus den oben genannten Listen verwenden
- Wenn category "automate" oder "ai": liefere vollständiges automationBlueprint
- Erlaubte categories: standardize, digitize, automate, ai, data, governance, customer, compliance, kpi
- Erlaubte status: idea, planned, in_progress, done, discarded
- Erlaubte scope: process, step
- Erlaubte level (impact/effort/risk): low, medium, high
- Erlaubte approach: workflow, rpa, api_integration, erp_config, low_code, ai_assistant, ai_document_processing, ai_classification, process_mining, other
- Erlaubte level (automation): assist, partial, straight_through
- Erlaubte controls: audit_trail, approval, monitoring, data_privacy, fallback_manual

JSON-Vorlage:
{
  "schemaVersion": "ai-improvement-v1",
  "language": "de",
  "itemId": "${item.id}",
  "patch": {
    "title": "Verbesserter Titel",
    "description": "Detaillierte Beschreibung mit konkreten Schritten...",
    "category": "automate",
    "impact": "high",
    "effort": "medium",
    "risk": "low",
    "automationBlueprint": {
      "approach": "rpa",
      "level": "partial",
      "humanInTheLoop": true,
      "systemIds": ["system-id-1"],
      "dataObjectIds": ["data-id-1"],
      "kpiIds": ["kpi-id-1"],
      "controls": ["audit_trail", "approval"],
      "notes": "Technische Hinweise..."
    }
  },
  "assumptions": ["Annahme 1", "Annahme 2"],
  "warnings": ["Warnung 1"]
}

Gib jetzt ausschließlich das JSON aus:`;
}

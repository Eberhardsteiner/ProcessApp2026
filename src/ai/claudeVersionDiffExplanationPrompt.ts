import type { Process, ProcessVersion } from '../domain/process';
import type { CaptureDraftStep } from '../domain/capture';
import { computeVersionDiff } from '../versioning/versionDiff';

function safeText(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || '(leer)';
}

function shortId(id: string): string {
  return (id || '').slice(0, 8);
}

function sanitizeForPrompt(s: string): string {
  return (s || '').replace(/\r/g, '').trim();
}

function mapId<T extends { id: string; name: string }>(list: T[]): Map<string, string> {
  const m = new Map<string, string>();
  (list || []).forEach((x) => m.set(x.id, x.name));
  return m;
}

function joinListLimited(lines: string[], limit: number): { text: string; truncated: boolean; total: number } {
  const total = lines.length;
  const truncated = total > limit;
  const slice = lines.slice(0, limit);
  const text = slice.join('\n') + (truncated ? `\n… (${total - limit} weitere)` : '');
  return { text, truncated, total };
}

export function buildClaudeVersionDiffExplanationPrompt(input: {
  process: Process;
  baseline: ProcessVersion;
  current: ProcessVersion;
}): string {
  const { process, baseline, current } = input;

  const diff = computeVersionDiff(baseline, current);

  const draftBase = baseline.sidecar.captureDraft;
  const draftCur = current.sidecar.captureDraft;

  const baseSteps = draftBase?.happyPath || [];
  const curSteps = draftCur?.happyPath || [];

  const stepLabelById = new Map<string, string>();
  [...baseSteps, ...curSteps].forEach((s) => {
    stepLabelById.set(s.stepId, `${s.order}. ${s.label}`);
  });

  const roleById = mapId(current.sidecar.roles || []);
  const systemById = mapId(current.sidecar.systems || []);
  const dataById = mapId(current.sidecar.dataObjects || []);

  const roleLabel = (id?: string | null) => (id ? (roleById.get(id) || id) : '(nicht gesetzt)');
  const systemLabel = (id?: string | null) => (id ? (systemById.get(id) || id) : '(nicht gesetzt)');
  const stepLabel = (id?: string | null) => (id ? (stepLabelById.get(id) || id) : '(nicht gesetzt)');

  const dataLabels = (ids?: string[]) => {
    const arr = (ids || []).map((id) => dataById.get(id) || id);
    return arr.length ? arr.join(', ') : '(keine)';
  };

  const formatStepLine = (prefix: string, s: CaptureDraftStep): string => {
    return `${prefix} ${s.order}. ${s.label} (stepId: ${s.stepId}) | Rolle: ${roleLabel(s.roleId)} | System: ${systemLabel(s.systemId)} | workType: ${s.workType || 'unknown'}`;
  };

  const addedStepsLines = diff.stepsAdded.map((s) => formatStepLine('+', s));
  const removedStepsLines = diff.stepsRemoved.map((s) => formatStepLine('-', s));

  const modifiedStepsLines = diff.stepsModified.map((ch) => {
    const b = ch.before;
    const a = ch.after;

    const changes: string[] = [];
    ch.changedFields.forEach((f) => {
      if (f === 'order') changes.push(`order: ${b.order} → ${a.order}`);
      else if (f === 'label') changes.push(`label: "${b.label}" → "${a.label}"`);
      else if (f === 'roleId') changes.push(`role: ${roleLabel(b.roleId)} → ${roleLabel(a.roleId)}`);
      else if (f === 'systemId') changes.push(`system: ${systemLabel(b.systemId)} → ${systemLabel(a.systemId)}`);
      else if (f === 'workType') changes.push(`workType: ${b.workType || 'unknown'} → ${a.workType || 'unknown'}`);
      else if (f === 'painPointHint') changes.push(`painPointHint: ${safeText(b.painPointHint)} → ${safeText(a.painPointHint)}`);
      else if (f === 'toBeHint') changes.push(`toBeHint: ${safeText(b.toBeHint)} → ${safeText(a.toBeHint)}`);
      else if (f === 'dataIn') changes.push(`dataIn: ${dataLabels(b.dataIn)} → ${dataLabels(a.dataIn)}`);
      else if (f === 'dataOut') changes.push(`dataOut: ${dataLabels(b.dataOut)} → ${dataLabels(a.dataOut)}`);
      else changes.push(`${f}: (geändert)`);
    });

    return `~ ${stepLabel(ch.id)} (stepId: ${ch.id})\n    ${changes.map((x) => `- ${x}`).join('\n    ')}`;
  });

  const decisionsAddedLines = diff.decisionsAdded.map((d) => {
    return `+ Decision (nach ${stepLabel(d.afterStepId)}): ${d.gatewayType.toUpperCase()} | Frage: ${sanitizeForPrompt(d.question)}`;
  });
  const decisionsRemovedLines = diff.decisionsRemoved.map((d) => {
    return `- Decision (nach ${stepLabel(d.afterStepId)}): ${d.gatewayType.toUpperCase()} | Frage: ${sanitizeForPrompt(d.question)}`;
  });

  const exceptionsAddedLines = diff.exceptionsAdded.map((e) => {
    return `+ Exception (${e.type}) bei ${stepLabel(e.relatedStepId || null)}: ${sanitizeForPrompt(e.description)} | Handling: ${sanitizeForPrompt(e.handling)}`;
  });
  const exceptionsRemovedLines = diff.exceptionsRemoved.map((e) => {
    return `- Exception (${e.type}) bei ${stepLabel(e.relatedStepId || null)}: ${sanitizeForPrompt(e.description)} | Handling: ${sanitizeForPrompt(e.handling)}`;
  });

  const backlogAddedLines = diff.backlogAdded.map((b) => {
    return `+ Backlog: ${sanitizeForPrompt(b.title)} | cat=${b.category} | scope=${b.scope} | status=${b.status}`;
  });
  const backlogRemovedLines = diff.backlogRemoved.map((b) => {
    return `- Backlog: ${sanitizeForPrompt(b.title)} | cat=${b.category} | scope=${b.scope} | status=${b.status}`;
  });
  const backlogModifiedLines = diff.backlogModified.map((ch) => {
    const bf = ch.before;
    const af = ch.after;
    const fields = ch.changedFields.join(', ');
    return `~ Backlog: ${sanitizeForPrompt(bf.title)} → ${sanitizeForPrompt(af.title)} (fields: ${fields})`;
  });

  const addedSteps = joinListLimited(addedStepsLines, 25);
  const removedSteps = joinListLimited(removedStepsLines, 25);
  const modifiedSteps = joinListLimited(modifiedStepsLines, 20);

  const addedDec = joinListLimited(decisionsAddedLines, 20);
  const removedDec = joinListLimited(decisionsRemovedLines, 20);

  const addedEx = joinListLimited(exceptionsAddedLines, 20);
  const removedEx = joinListLimited(exceptionsRemovedLines, 20);

  const addedBl = joinListLimited(backlogAddedLines, 25);
  const removedBl = joinListLimited(backlogRemovedLines, 25);
  const modifiedBl = joinListLimited(backlogModifiedLines, 25);

  const e2eBase = baseline.endToEndDefinition;
  const e2eCur = current.endToEndDefinition;

  const oc = current.sidecar.operationalContext;
  const aiSig = current.sidecar.aiReadinessSignals;

  const systemsList = (current.sidecar.systems || []).map((s) => `- ${s.name} (id: ${s.id})`).join('\n') || '- (keine)';
  const dataList = (current.sidecar.dataObjects || []).map((d) => `- ${d.name} (id: ${d.id})`).join('\n') || '- (keine)';
  const kpiList = (current.sidecar.kpis || []).map((k) => `- ${k.name} (id: ${k.id})`).join('\n') || '- (keine)';
  const rolesList = (current.sidecar.roles || []).map((r) => `- ${r.name} (id: ${r.id})`).join('\n') || '- (keine)';

  const aiSigText = aiSig
    ? `standardization=${aiSig.standardization}, dataAvailability=${aiSig.dataAvailability}, variability=${aiSig.variability}, complianceRisk=${aiSig.complianceRisk}`
    : 'nicht erfasst';

  const ocText = oc
    ? `frequency=${oc.frequency || 'nicht erfasst'}, typicalLeadTime=${oc.typicalLeadTime || 'nicht erfasst'}`
    : 'nicht erfasst';

  return `Du bist Experte für Prozessmanagement, Digitalisierung, Automatisierung und KI-Governance.

Aufgabe:
Erkläre die Änderungen zwischen zwei Prozessversionen in verständlichem Deutsch (Zielgruppe: Fachbereich ohne BPM-Erfahrung).
Leite daraus offene Fragen ab, die wichtig sind, um den Prozess KI-reif und digital/automatisierbar zu machen.

Wichtig:
- Keine Details erfinden. Nutze nur die Informationen im Prompt.
- Trenne strikt:
  1) Beobachtet (aus Diff)
  2) Interpretation (klar als Interpretation markieren)
  3) Empfehlung (konkret, aber ohne Erfindungen)
- Wenn Informationen fehlen: formuliere offene Fragen statt zu raten.

Output-Regeln:
- Gib ausschließlich Markdown aus (kein JSON, kein Codeblock).
- Länge: ca. 400–900 Wörter.
- Struktur EXACT so:
  ## Kurzfazit
  ## Beobachtete Änderungen (aus Diff)
  ## Interpretation (Auswirkungen, Hypothesen)
  ## Offene Fragen für Automatisierung & KI-Reife
  ## Nächste Schritte (empfohlen)

Kontext:
Prozess: ${sanitizeForPrompt(process.title)}
Baseline: ${shortId(diff.fromVersionId)}… | erstellt: ${baseline.createdAt}
Aktuell:  ${shortId(diff.toVersionId)}… | erstellt: ${current.createdAt}

Operational Context (aktuelle Version): ${ocText}
AI-Readiness Signals (aktuelle Version): ${aiSigText}

End-to-End Baseline:
- Trigger: ${safeText(e2eBase.trigger)}
- Kunde: ${safeText(e2eBase.customer)}
- Outcome: ${safeText(e2eBase.outcome)}
- DoneCriteria: ${safeText(e2eBase.doneCriteria)}

End-to-End Aktuell:
- Trigger: ${safeText(e2eCur.trigger)}
- Kunde: ${safeText(e2eCur.customer)}
- Outcome: ${safeText(e2eCur.outcome)}
- DoneCriteria: ${safeText(e2eCur.doneCriteria)}

Diff-Summary:
- End-to-End geändert: ${diff.endToEndChanges.length}
- Happy Path: +${diff.stepsAdded.length} / -${diff.stepsRemoved.length} / ~${diff.stepsModified.length}
- Entscheidungen: +${diff.decisionsAdded.length} / -${diff.decisionsRemoved.length}
- Ausnahmen: +${diff.exceptionsAdded.length} / -${diff.exceptionsRemoved.length}
- Backlog: +${diff.backlogAdded.length} / -${diff.backlogRemoved.length} / ~${diff.backlogModified.length}

Kataloge (nur zur Interpretation von IDs):
Rollen:
${rolesList}

Systeme:
${systemsList}

Datenobjekte:
${dataList}

KPIs:
${kpiList}

Details (Diff):
Happy Path hinzugefügt:
${addedSteps.text || '- (keine)'}

Happy Path entfernt:
${removedSteps.text || '- (keine)'}

Happy Path geändert:
${modifiedSteps.text || '- (keine)'}

Entscheidungen hinzugefügt:
${addedDec.text || '- (keine)'}

Entscheidungen entfernt:
${removedDec.text || '- (keine)'}

Ausnahmen hinzugefügt:
${addedEx.text || '- (keine)'}

Ausnahmen entfernt:
${removedEx.text || '- (keine)'}

Backlog hinzugefügt:
${addedBl.text || '- (keine)'}

Backlog entfernt:
${removedBl.text || '- (keine)'}

Backlog geändert:
${modifiedBl.text || '- (keine)'}

Erstelle jetzt die Markdown-Antwort:`;
}

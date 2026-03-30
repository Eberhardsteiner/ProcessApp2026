import type { Process, ProcessVersion } from '../domain/process';
import { buildClaudeImprovementSuggestionsPrompt } from './claudeImprovementSuggestionsPrompt';

export function buildClaudeAssistedImprovementSuggestionsPrompt(input: {
  process: Process;
  version: ProcessVersion;
  existingTitles: string[];
  userNarrative: string;
}): string {
  const { process, version, existingTitles, userNarrative } = input;

  const base = buildClaudeImprovementSuggestionsPrompt({ process, version, existingTitles });

  const brief = version.sidecar.assistedOptimizationBrief;

  const goalLabel = (() => {
    const g = brief?.goal;
    if (!g) return 'nicht angegeben';
    const map: Record<string, string> = {
      lead_time: 'Schneller / kürzere Durchlaufzeit',
      quality: 'Weniger Fehler',
      cost: 'Kosten senken',
      customer: 'Kundenerlebnis verbessern',
      compliance: 'Compliance/Risiko',
      transparency: 'Transparenz/Steuerung',
      other: 'Sonstiges',
    };
    return g === 'other' ? (brief?.goalOtherText || 'Sonstiges') : (map[g] || String(g));
  })();

  const pain = (brief?.painPoints || []).length
    ? (brief!.painPoints || []).join(', ')
    : 'nicht angegeben';

  const focusStepLabel = (() => {
    const id = brief?.focusStepId;
    if (!id) return 'Gesamter Prozess';
    const step = version.sidecar.captureDraft?.happyPath?.find(s => s.stepId === id);
    return step ? step.label : 'Schritt (ID unbekannt)';
  })();

  const narrative = (userNarrative || '').trim() || (brief?.visionNarrative || '').trim();
  const constraints = (brief?.constraints || '').trim();
  const success = (brief?.successCriteria || '').trim();

  const extraBlock =
`\n\nZusätzliche Nutzerbeschreibung (Assistenzmodus, bitte priorisiert berücksichtigen):
- Optimierungsziel: ${goalLabel}
- Beobachtete Probleme: ${pain}
- Fokus: ${focusStepLabel}
- Randbedingungen: ${constraints || 'nicht angegeben'}
- Erfolgskriterien: ${success || 'nicht angegeben'}

Vision: Wie könnte der Prozess besser ablaufen?
${narrative ? narrative : '(keine Vision angegeben; nutze nur Kontext aus Prozessdaten)'}\n
Wichtig:
- Überführe konkrete Aussagen aus der Vision in Maßnahmenvorschläge im JSON-Schema.
- Formuliere so, dass ein Laienanwender die Maßnahmen versteht (keine Tool-Begriffe, keine Parameter-Sprache).
`;

  const marker = 'Gib jetzt ausschließlich das JSON aus:';
  const idx = base.lastIndexOf(marker);
  if (idx >= 0) {
    return base.slice(0, idx) + extraBlock + '\n' + base.slice(idx);
  }
  return base + extraBlock;
}

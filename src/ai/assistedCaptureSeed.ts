import type { ProcessVersion } from '../domain/process';
import type { CaptureDraftDecision, CaptureDraftException } from '../domain/capture';

export interface AssistCaptureSeed {
  trigger?: string;
  customer?: string;
  outcome?: string;
  doneCriteria?: string;
  happyPath: string[];
  roles: string[];
  systems: string[];
  dataObjects: string[];
  decisions: Array<{ question: string; afterStepIndex: number }>;
  exceptions: Array<{ type: string; description: string }>;
}

export function buildSeedFromVersion(version: ProcessVersion): AssistCaptureSeed {
  const e2e = version.endToEndDefinition;
  const draft = version.sidecar.captureDraft;

  const roles = version.sidecar.roles.map(r => r.name);
  const systems = version.sidecar.systems.map(s => s.name);
  const dataObjects = version.sidecar.dataObjects.map(d => d.name);

  const happyPath = (draft?.happyPath ?? []).map(s => s.label);

  const stepIdToIndex = new Map<string, number>();
  (draft?.happyPath ?? []).forEach((s, i) => {
    stepIdToIndex.set(s.stepId, i + 1);
  });

  const decisions = (draft?.decisions ?? [])
    .filter((d): d is CaptureDraftDecision => !!d.question?.trim())
    .map(d => ({
      question: d.question,
      afterStepIndex: stepIdToIndex.get(d.afterStepId) ?? 0,
    }))
    .filter(d => d.afterStepIndex > 0);

  const exceptions = (draft?.exceptions ?? [])
    .filter((e): e is CaptureDraftException => !!e.description?.trim())
    .map(e => ({
      type: e.type,
      description: e.description,
    }));

  return {
    trigger: e2e?.trigger?.trim() || undefined,
    customer: e2e?.customer?.trim() || undefined,
    outcome: e2e?.outcome?.trim() || undefined,
    doneCriteria: e2e?.doneCriteria?.trim() || undefined,
    happyPath,
    roles,
    systems,
    dataObjects,
    decisions,
    exceptions,
  };
}

export function buildSeedBlock(seed: AssistCaptureSeed): string {
  const lines: string[] = [];
  lines.push('=== BESTEHENDE_VORERFASSUNG_AUS_DER_APP ===');
  lines.push('');

  lines.push('## End-to-End-Definition');
  lines.push(`- Auslöser (trigger): ${seed.trigger || '(leer)'}`);
  lines.push(`- Kunde/Nutznießer (customer): ${seed.customer || '(leer)'}`);
  lines.push(`- Ergebnis (outcome): ${seed.outcome || '(leer)'}`);
  if (seed.doneCriteria) {
    lines.push(`- Fertigkriterium (doneCriteria): ${seed.doneCriteria}`);
  }
  lines.push('');

  if (seed.happyPath.length > 0) {
    lines.push('## Happy Path (manuell erfasst – führend, bitte stabil halten)');
    seed.happyPath.forEach((s, i) => {
      lines.push(`${i + 1}. ${s}`);
    });
    lines.push('');
  }

  if (seed.roles.length > 0) {
    lines.push(`## Rollen: ${seed.roles.join(', ')}`);
    lines.push('');
  }

  if (seed.systems.length > 0) {
    lines.push(`## Systeme: ${seed.systems.join(', ')}`);
    lines.push('');
  }

  if (seed.dataObjects.length > 0) {
    lines.push(`## Datenobjekte: ${seed.dataObjects.join(', ')}`);
    lines.push('');
  }

  if (seed.decisions.length > 0) {
    lines.push('## Entscheidungen (manuell erfasst)');
    seed.decisions.forEach(d => {
      lines.push(`- Nach Schritt ${d.afterStepIndex}: ${d.question}`);
    });
    lines.push('');
  }

  if (seed.exceptions.length > 0) {
    lines.push('## Ausnahmen (manuell erfasst)');
    seed.exceptions.forEach(e => {
      lines.push(`- [${e.type}] ${e.description}`);
    });
    lines.push('');
  }

  lines.push('=== ENDE VORERFASSUNG ===');
  lines.push('');
  lines.push('WICHTIGE ANWEISUNGEN FÜR DIE KI:');
  lines.push('- Nutze diese Vorerfassung als Ausgangsbasis und ergänze fehlende Informationen.');

  if (seed.happyPath.length > 0) {
    lines.push('- Der oben aufgeführte Happy Path ist manuell und führend: Behalte die Schrittbezeichnungen und -reihenfolge möglichst stabil.');
    lines.push('- Wenn du eine abweichende Schrittstruktur erkennst, dokumentiere das in warnings statt den Happy Path stillschweigend neu zu bauen.');
    lines.push('- Merge-Strategie: ergänzen statt neu erfinden.');
  } else {
    lines.push('- Es wurde noch kein Happy Path vorerfasst. Du kannst den Happy Path vollständig aus dem Input ableiten.');
  }

  const hasE2E = seed.trigger || seed.customer || seed.outcome;
  if (hasE2E) {
    lines.push('- End-to-End-Felder (trigger/customer/outcome): Wenn bereits ausgefüllt, diese Werte bevorzugt beibehalten. Nur leere Felder durch KI-Analyse ergänzen.');
  }

  lines.push('- Rollen, Systeme, Datenobjekte als Union aus Vorerfassung und Input zusammenführen (keine Duplikate).');

  return lines.join('\n');
}

export function hasMeaningfulSeed(seed: AssistCaptureSeed): boolean {
  return (
    seed.happyPath.length > 0 ||
    !!seed.trigger ||
    !!seed.customer ||
    !!seed.outcome ||
    seed.roles.length > 0
  );
}

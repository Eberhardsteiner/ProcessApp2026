import type { Process, ProcessVersion, FrequencyBucket, LeadTimeBucket } from '../domain/process';

export type HeuristicCandidate = {
  text: string;
  sourceLabel: string;
  dimensionKey?: 'standardization' | 'dataIT' | 'automation' | 'risk';
};

function count<T>(arr: T[], pred: (x: T) => boolean): number {
  return arr.filter(pred).length;
}

function getFrequencyLabel(bucket?: FrequencyBucket): string {
  switch (bucket) {
    case 'daily': return 'Täglich';
    case 'weekly': return 'Wöchentlich';
    case 'monthly': return 'Monatlich';
    case 'quarterly': return 'Quartalsweise';
    case 'yearly': return 'Jährlich';
    case 'ad_hoc': return 'Ad hoc / unregelmäßig';
    case 'unknown': return 'Unbekannt';
    default: return '(nicht erfasst)';
  }
}

function getLeadTimeLabel(bucket?: LeadTimeBucket): string {
  switch (bucket) {
    case 'minutes': return 'Minuten';
    case 'hours': return 'Stunden';
    case '1_day': return 'Bis 1 Tag';
    case '2_5_days': return '2 bis 5 Tage';
    case '1_2_weeks': return '1 bis 2 Wochen';
    case 'over_2_weeks': return 'Mehr als 2 Wochen';
    case 'varies': return 'Variiert stark';
    case 'unknown': return 'Unbekannt';
    default: return '(nicht erfasst)';
  }
}

export function generateHeuristicCandidates(
  _process: Process,
  version: ProcessVersion
): HeuristicCandidate[] {
  const draft = version.sidecar.captureDraft;
  if (!draft) return [];

  const candidates: HeuristicCandidate[] = [];

  const steps = draft.happyPath || [];
  const exceptions = draft.exceptions || [];
  const systemsCount = version.sidecar.systems?.length || 0;
  const dataObjectsCount = version.sidecar.dataObjects?.length || 0;
  const kpisCount = version.sidecar.kpis?.length || 0;
  const operationalContext = version.sidecar.operationalContext;

  const humanSteps = count(steps, (s) => {
    const wt = s.workType;
    return !wt || wt === 'manual' || wt === 'user_task' || wt === 'unknown';
  });

  if (steps.length >= 5 && humanSteps / steps.length >= 0.6) {
    candidates.push({
      text: `Standardisieren & digitalisieren: ${humanSteps}/${steps.length} Schritte sind überwiegend manuell. Checklisten/Pflichtfelder und klare Rollen/Systeme prüfen.`,
      sourceLabel: 'Heuristik: hoher manueller Anteil',
      dimensionKey: 'standardization',
    });
  }

  const stepsWithSystem = count(steps, (s) => !!s.systemId);
  if (systemsCount > 0 && steps.length > 0 && stepsWithSystem < Math.ceil(steps.length / 2)) {
    candidates.push({
      text: `System-Zuordnung vervollständigen: Nur ${stepsWithSystem}/${steps.length} Schritte sind Systemen zugeordnet. Medienbrüche identifizieren und IT-Nutzung klären.`,
      sourceLabel: 'Heuristik: System-Zuordnung',
      dimensionKey: 'dataIT',
    });
  }

  if (systemsCount > 0 && dataObjectsCount === 0) {
    candidates.push({
      text: 'Datenobjekte definieren: Zentrale Dokumente/Daten (z.B. Ticket, Auftrag, Kunde) erfassen und pro Schritt referenzieren.',
      sourceLabel: 'Heuristik: fehlende Datenobjekte',
      dimensionKey: 'dataIT',
    });
  }

  const missingCount = count(exceptions, (e) => e.type === 'missing_data');
  if (missingCount >= 1) {
    candidates.push({
      text: `Input-Qualität verbessern: ${missingCount} missing_data-Ausnahme(n). Am Eingang Pflichtangaben, Validierungen und eine kurze Eingangs-Checkliste einführen.`,
      sourceLabel: 'Heuristik: missing_data-Ausnahmen',
      dimensionKey: 'dataIT',
    });
  }

  if (kpisCount === 0) {
    candidates.push({
      text: 'Messbarkeit schaffen: Prozess-KPIs definieren (z.B. Durchlaufzeit, Wartezeit, Rework-Quote, First-Time-Right).',
      sourceLabel: 'Heuristik: fehlende KPIs',
    });
  }

  const freq = operationalContext?.frequency;
  const lt = operationalContext?.typicalLeadTime;
  if ((freq && freq !== 'unknown') || (lt && lt !== 'unknown')) {
    candidates.push({
      text: `Priorisierung: Häufigkeit = ${getFrequencyLabel(freq)}, typische Durchlaufzeit = ${getLeadTimeLabel(lt)}. Prüfen Sie zuerst Wartezeiten/Übergaben und Rework.`,
      sourceLabel: 'Heuristik: Operational Context',
      dimensionKey: 'automation',
    });
  }

  const seen = new Set<string>();
  return candidates.filter((c) => {
    const t = c.text.trim();
    if (!t) return false;
    const norm = t.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
}

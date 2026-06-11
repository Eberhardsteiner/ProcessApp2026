import type {
  ProcessMiningObservation,
  DerivationSummary,
  ProcessSystem,
} from '../../domain/process';
import type { CaptureDraft } from '../../domain/capture';
import { createInitialCaptureDraft } from '../../domain/capture';

export interface SynthesizedCapture {
  captureDraft: CaptureDraft;
  systems: ProcessSystem[];
}

/**
 * Baut aus vorhandenen Mining-Beobachtungen einen minimalen captureDraft,
 * damit die Heuristik-Vorschläge auch ohne formale Erfassung greifen.
 * Gibt null zurück, wenn keine Schritt-Beobachtungen vorhanden sind.
 *
 * Schritte tragen bewusst nur stepId/order/label (kein systemId/workType):
 *   - ohne workType zählt die Heuristik jeden Schritt als manuell -> "hoher manueller Anteil",
 *   - ohne systemId ist stepsWithSystem = 0 -> "System-Zuordnung vervollständigen"
 *     (sofern sidecar.systems > 0).
 * exceptions bleibt leer (Reibung liegt als Issue-Beobachtung vor; sie als missing_data
 * zu deklarieren wäre fachlich falsch).
 */
export function synthesizeCaptureDraftFromMining(
  observations: ProcessMiningObservation[] | undefined,
  summary: DerivationSummary | undefined,
): SynthesizedCapture | null {
  const stepObservations = (observations ?? []).filter((o) => o.kind === 'step');
  if (stepObservations.length === 0) return null;

  const happyPath = stepObservations.map((o, index) => ({
    stepId: o.id || `mining-step-${index + 1}`,
    order: index + 1,
    label: o.label,
  }));

  const captureDraft: CaptureDraft = {
    ...createInitialCaptureDraft(),
    happyPath,
  };

  // summary.systems (Strings) -> ProcessSystem[]. Verifiziert: ProcessSystem verlangt
  // nur id + name (systemType/aliases optional) -> sauberes Mapping, kein Cast nötig.
  const systemNames = summary?.systems ?? [];
  const systems: ProcessSystem[] = systemNames.map((name, index) => ({
    id: `mining-system-${index + 1}`,
    name,
  }));

  return { captureDraft, systems };
}

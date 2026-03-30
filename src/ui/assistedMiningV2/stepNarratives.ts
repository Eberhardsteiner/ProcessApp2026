import type { V2ConformanceResult } from './conformance';
import type { V2DiscoveryResult } from './discovery';
import type { V2EnhancementResult } from './enhancement';

export interface StepNarrative {
  headline: string;
  summary: string;
  bullets: string[];
  caution?: string;
}

export function buildDiscoveryNarrative(result: V2DiscoveryResult): StepNarrative {
  const isDraft = result.analysisMode === 'process-draft';
  const bullets: string[] = [];

  if (result.coreProcess.length > 0) {
    bullets.push(`${result.coreProcess.length} Hauptschritte prägen aktuell den erkannten Ablauf.`);
  }
  if (!isDraft && result.variants.length > 1) {
    bullets.push(`${result.variants.length} Varianten wurden erkannt, davon deckt die häufigste ${result.coreProcessCaseCoverage} % der Fälle ab.`);
  }
  if (result.loops.length > 0) {
    bullets.push(`${result.loops.length} Wiederholungen oder Rücksprünge deuten auf mögliche Schleifen im Ablauf hin.`);
  }

  return {
    headline: isDraft ? 'Aus dem Material entsteht ein belastbarer Prozessentwurf.' : 'Die App hat einen Kernprozess und Varianten verdichtet.',
    summary: isDraft
      ? 'Die aktuelle Quelle reicht aus, um einen nachvollziehbaren Ablaufentwurf aufzubauen. Für Häufigkeiten und Standardpfade im Unternehmen braucht es aber weitere Fälle.'
      : 'Aus mehreren Quellen wurde der häufigste Ablauf von den abweichenden Varianten getrennt. Dadurch wird sichtbar, was typisch ist und wo der Prozess instabil wird.',
    bullets,
    caution: isDraft
      ? 'Interpretieren Sie die Schrittfolge als belastbaren Erstentwurf, nicht als statistischen Standardprozess.'
      : result.totalCases < 5
      ? 'Mit wenigen Fällen sind Varianten und Abdeckung noch eher als Richtungssignal zu verstehen.'
      : undefined,
  };
}

export function buildConformanceNarrative(result: V2ConformanceResult): StepNarrative {
  const isDraft = result.analysisMode === 'process-draft';
  const bullets: string[] = [];
  if (result.targetSteps.length > 0) {
    bullets.push(`${result.targetSteps.length} Sollschritte werden als Vergleichsbasis verwendet.`);
  }
  if (result.topDeviations.length > 0) {
    bullets.push(`${result.topDeviations.length} charakteristische Abweichungstypen wurden erkannt.`);
  }
  if (!isDraft) {
    bullets.push(`${result.conformantCases} von ${result.totalCases} Fällen folgen dem Soll vollständig.`);
  }

  return {
    headline: isDraft ? 'Der Abgleich liefert Soll-Hinweise für den aktuellen Entwurf.' : 'Die App zeigt, wo der reale Ablauf vom Soll abweicht.',
    summary: isDraft
      ? 'Bei einem einzelnen Dokument oder Fall zeigt der Soll-Abgleich vor allem, welche Schritte im Entwurf fehlen, zusätzlich auftauchen oder in anderer Reihenfolge liegen.'
      : 'Mit mehreren Fällen wird sichtbar, wie häufig der reale Ablauf dem Soll folgt und welche Abweichungen wiederkehren.',
    bullets,
    caution: isDraft
      ? 'Die Abweichungen sind hier noch keine Fehlerraten, sondern Hinweise zur Schärfung des Entwurfs.'
      : result.totalCases < 5
      ? 'Die Prozentwerte sollten bei kleiner Fallzahl eher als Arbeitshypothese verstanden werden.'
      : undefined,
  };
}

export function buildEnhancementNarrative(result: V2EnhancementResult): StepNarrative {
  const timingHotspots = result.hotspots.filter(hotspot => hotspot.isTimeBased).length;
  const structuralHotspots = result.hotspots.length - timingHotspots;
  const isDraft = result.analysisMode === 'process-draft';

  const bullets: string[] = [];
  if (result.hotspots.length > 0) {
    bullets.push(`${result.hotspots.length} priorisierte Hinweise auf Reibung, Instabilität oder Wartezeiten liegen vor.`);
  }
  if (structuralHotspots > 0) {
    bullets.push(`${structuralHotspots} Hinweise beruhen auf Struktur, Übergaben oder Rework statt auf Zeitdaten.`);
  }
  if (timingHotspots > 0) {
    bullets.push(`${timingHotspots} Hinweise nutzen echte Zeitangaben für Warte- oder Durchlaufzeiten.`);
  }

  return {
    headline: isDraft ? 'Die App erkennt bereits Reibung und Verbesserungshebel im Entwurf.' : 'Die App verdichtet jetzt die wichtigsten Hotspots für Verbesserungen.',
    summary: isDraft
      ? 'Auch ohne große Datenmengen lassen sich Friktionen, schwierige Übergaben und fehlende Informationen aus dem Material ableiten.'
      : 'Auf Basis der erkannten Abläufe werden Hotspots priorisiert, damit Sie gezielt an den wirksamsten Stellen ansetzen können.',
    bullets,
    caution: !result.hasTimingData
      ? 'Ohne echte Zeitangaben sind Aussagen zu Engpässen bewusst vorsichtig formuliert und konzentrieren sich auf Struktur und Reibung.'
      : undefined,
  };
}

import type { AiTransferSection, AiTransferContext } from '../types/aiTransfer';

export const AI_TRANSFER_SECTIONS: AiTransferSection[] = [
  {
    id: 'phase1-topic',
    title: 'Thema und Prozessbezeichnung',
    description: 'Der Name und die Kurzbeschreibung des betrachteten Prozesses.',
    phaseNumber: 1,
    order: 10,
    defaultForContexts: ['phase1-model-selection', 'full-process'],
  },
  {
    id: 'phase1-context',
    title: 'Prozesskontext',
    description: 'Organisatorischer Kontext, betroffene Bereiche und Rahmenbedingungen.',
    phaseNumber: 1,
    order: 20,
    defaultForContexts: ['phase1-model-selection', 'full-process'],
  },
  {
    id: 'phase1-clusters',
    title: 'Cluster und Fokusthema',
    description: 'Identifizierte Themencluster und das gewählte Fokusthema für die Vertiefung.',
    phaseNumber: 1,
    order: 30,
    defaultForContexts: ['phase1-model-selection', 'phase2-goal', 'full-process'],
  },
  {
    id: 'phase2-goal',
    title: 'Zielentwicklung',
    description: 'Das formulierte Verbesserungsziel, einschließlich Zielzustand und Erfolgskriterien.',
    phaseNumber: 2,
    order: 40,
    defaultForContexts: ['phase2-goal', 'phase3-summary', 'phase4-summary', 'full-process'],
  },
  {
    id: 'phase3-resources',
    title: 'Ressourcenanalyse',
    description: 'Verfügbare und benötigte Ressourcen: Personen, Zeit, Werkzeuge, Wissen.',
    phaseNumber: 3,
    order: 50,
    defaultForContexts: ['phase3-summary', 'phase4-summary', 'full-process'],
  },
  {
    id: 'phase3-model-reflection',
    title: 'Modellreflexion',
    description: 'Bewertung des aktuellen Prozessmodells: Stärken, Schwächen und Verbesserungspotenziale.',
    phaseNumber: 3,
    order: 60,
    defaultForContexts: ['phase3-summary', 'full-process'],
  },
  {
    id: 'phase4-selected-resources',
    title: 'Ausgewählte Ressourcen',
    description: 'Die für die Umsetzung konkret ausgewählten Ressourcen und Verantwortlichkeiten.',
    phaseNumber: 4,
    order: 70,
    defaultForContexts: ['phase4-summary', 'full-process'],
  },
  {
    id: 'phase4-action-plan',
    title: 'Handlungsplanung',
    description: 'Konkrete Maßnahmen, Schritte und Meilensteine zur Zielerreichung.',
    phaseNumber: 4,
    order: 80,
    defaultForContexts: ['phase4-summary', 'phase5-completion', 'full-process'],
  },
  {
    id: 'phase4-timeline',
    title: 'Zeitplanung',
    description: 'Zeitrahmen, Deadlines und geplante Überprüfungspunkte.',
    phaseNumber: 4,
    order: 90,
    defaultForContexts: ['phase4-summary', 'full-process'],
  },
  {
    id: 'phase5-control',
    title: 'Umsetzungscontrolling',
    description: 'Durchgeführte Maßnahmen, Ergebnisse und offene Punkte aus der Umsetzungsphase.',
    phaseNumber: 5,
    order: 100,
    defaultForContexts: ['phase5-completion', 'full-process'],
  },
];

export function getSectionsByContext(): AiTransferSection[] {
  return [...AI_TRANSFER_SECTIONS].sort((a, b) => a.order - b.order);
}

export function getDefaultSectionIds(context: AiTransferContext): string[] {
  return AI_TRANSFER_SECTIONS
    .filter(s => s.defaultForContexts.includes(context))
    .sort((a, b) => a.order - b.order)
    .map(s => s.id);
}

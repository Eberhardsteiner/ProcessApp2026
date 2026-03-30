import type { AiTransferData, AiTransferOptions, AiTransferContext, AiSupportType } from '../../types/aiTransfer';
import type { AiTransferSection } from '../../types/aiTransfer';
import { AI_TRANSFER_SECTIONS, getSectionsByContext, getDefaultSectionIds } from '../../config/aiTransferSections';

export function getAvailableAiTransferSections(
  data: AiTransferData,
  context: AiTransferContext,
): AiTransferSection[] {
  void context;
  return getSectionsByContext().filter(section => hasSectionContent(data, section.id));
}

export function getDefaultAiTransferSectionIds(
  data: AiTransferData,
  context: AiTransferContext,
): string[] {
  const defaults = getDefaultSectionIds(context);
  return defaults.filter(id => hasSectionContent(data, id));
}

function hasSectionContent(data: AiTransferData, sectionId: string): boolean {
  switch (sectionId) {
    case 'phase1-topic':
      return !!(data.processTitle?.trim());
    case 'phase1-context':
      return !!(data.processContext?.trim());
    case 'phase1-clusters':
      return !!(data.clusters && data.clusters.length > 0) || !!(data.focusTopic?.trim());
    case 'phase2-goal':
      return !!(data.processGoal?.trim());
    case 'phase3-resources':
      return !!(data.resourceAnalysis?.trim());
    case 'phase3-model-reflection':
      return !!(data.modelReflection?.trim());
    case 'phase4-selected-resources':
      return !!(data.selectedResources && data.selectedResources.length > 0);
    case 'phase4-action-plan':
      return !!(data.actionPlan?.trim());
    case 'phase4-timeline':
      return !!(data.timeline?.trim());
    case 'phase5-control':
      return !!(data.implementationControl?.trim());
    default:
      return false;
  }
}

function renderSectionContent(data: AiTransferData, sectionId: string): string {
  switch (sectionId) {
    case 'phase1-topic':
      return `**Prozessthema:** ${data.processTitle}`;
    case 'phase1-context':
      return `**Prozesskontext:**\n${data.processContext}`;
    case 'phase1-clusters': {
      const parts: string[] = [];
      if (data.clusters && data.clusters.length > 0) {
        parts.push(`**Identifizierte Cluster:** ${data.clusters.join(', ')}`);
      }
      if (data.focusTopic?.trim()) {
        parts.push(`**Gewähltes Fokusthema:** ${data.focusTopic}`);
      }
      return parts.join('\n');
    }
    case 'phase2-goal':
      return `**Verbesserungsziel:**\n${data.processGoal}`;
    case 'phase3-resources':
      return `**Ressourcenanalyse:**\n${data.resourceAnalysis}`;
    case 'phase3-model-reflection':
      return `**Modellreflexion:**\n${data.modelReflection}`;
    case 'phase4-selected-resources':
      return `**Ausgewählte Ressourcen:** ${(data.selectedResources ?? []).join(', ')}`;
    case 'phase4-action-plan':
      return `**Handlungsplanung:**\n${data.actionPlan}`;
    case 'phase4-timeline':
      return `**Zeitplanung:**\n${data.timeline}`;
    case 'phase5-control':
      return `**Umsetzungscontrolling:**\n${data.implementationControl}`;
    default:
      return '';
  }
}

function buildSupportInstruction(supportType: AiSupportType): string {
  switch (supportType) {
    case 'reflection':
      return (
        'Bitte analysiere den bereitgestellten Prozesskontext kritisch und unterstütze mich dabei, ' +
        'meine eigenen Annahmen und Entscheidungen zu hinterfragen. ' +
        'Zeige blinde Flecken, Widersprüche oder unbedachte Konsequenzen auf. ' +
        'Formuliere deine Rückmeldungen als offene Fragen oder konstruktive Beobachtungen.'
      );
    case 'alternatives':
      return (
        'Bitte entwickle auf Basis des bereitgestellten Kontexts alternative Ansätze oder Lösungswege. ' +
        'Stelle mindestens zwei bis drei Alternativen mit ihren jeweiligen Vor- und Nachteilen vor. ' +
        'Gehe dabei auf Machbarkeit, Risiken und mögliche Nebeneffekte ein.'
      );
    case 'implementation':
      return (
        'Bitte unterstütze mich bei der konkreten Umsetzungsplanung auf Basis des vorliegenden Kontexts. ' +
        'Schlage praxistaugliche nächste Schritte vor, benenne Abhängigkeiten und potenzielle Hindernisse. ' +
        'Formuliere deine Empfehlungen klar und handlungsorientiert.'
      );
    case 'feedback':
      return (
        'Bitte gib mir strukturiertes Feedback zu dem bereitgestellten Prozesskontext. ' +
        'Bewerte Vollständigkeit, Konsistenz und Realisierbarkeit. ' +
        'Trenne dabei klar zwischen Stärken und konkreten Verbesserungshinweisen.'
      );
    case 'questions':
      return (
        'Bitte stelle mir auf Basis des bereitgestellten Kontexts gezielte Vertiefungsfragen. ' +
        'Die Fragen sollen mir helfen, wichtige Aspekte zu klären, die ich möglicherweise noch nicht ' +
        'ausreichend durchdacht habe. Formuliere die Fragen offen und explorativ.'
      );
  }
}

export function buildAiTransferPrompt(data: AiTransferData, options: AiTransferOptions): string {
  const { context, supportType, selectedSectionIds, userQuestion } = options;

  const availableSections = getAvailableAiTransferSections(data, context);
  const sectionsById = new Map(AI_TRANSFER_SECTIONS.map(s => [s.id, s]));

  const selectedSections = selectedSectionIds
    .map(id => sectionsById.get(id))
    .filter((s): s is AiTransferSection => s !== undefined)
    .filter(s => availableSections.some(a => a.id === s.id))
    .sort((a, b) => a.order - b.order);

  const contentBlocks = selectedSections
    .map(s => renderSectionContent(data, s.id))
    .filter(block => block.trim().length > 0);

  const lines: string[] = [];

  lines.push('# Prozessanalyse-Kontext');
  lines.push('');
  lines.push(
    'Die folgenden Informationen stammen aus einer strukturierten Prozessanalyse. ' +
    'Bitte beziehe dich ausschließlich auf diese Informationen und stelle keine Annahmen über ' +
    'nicht genannte Sachverhalte an.'
  );
  lines.push('');

  if (contentBlocks.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Bereitgestellte Informationen');
    lines.push('');
    for (const block of contentBlocks) {
      lines.push(block);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## Aufgabe');
  lines.push('');
  lines.push(buildSupportInstruction(supportType));

  if (userQuestion?.trim()) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Meine konkrete Frage');
    lines.push('');
    lines.push(userQuestion.trim());
  }

  if (data.additionalNotes?.trim()) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Zusätzliche Hinweise');
    lines.push('');
    lines.push(data.additionalNotes.trim());
  }

  return lines.join('\n');
}

import type {
  ImprovementCategory,
  ImprovementScope,
  Level3,
  AutomationBlueprint,
} from '../domain/process';

export interface ImprovementTemplateDefinition {
  id: string;
  title: string;
  category: ImprovementCategory;
  scope: ImprovementScope;
  description: string;
  defaultImpact: Level3;
  defaultEffort: Level3;
  defaultRisk: Level3;
  defaultAutomationBlueprint?: AutomationBlueprint;
}

export const IMPROVEMENT_TEMPLATES: ImprovementTemplateDefinition[] = [
  {
    id: 'std_checklist',
    title: 'Checkliste & Definition of Done einführen',
    category: 'standardize',
    scope: 'step',
    description: 'Standardisierung durch Checklisten und klare Abschlusskriterien für konsistente Qualität.',
    defaultImpact: 'medium',
    defaultEffort: 'low',
    defaultRisk: 'low',
  },
  {
    id: 'std_input_quality',
    title: 'Input-Qualität sicherstellen (Pflichtfelder & Validierung)',
    category: 'standardize',
    scope: 'step',
    description: 'Pflichtfelder und Validierungsregeln einführen, um fehlerhafte Eingaben zu vermeiden.',
    defaultImpact: 'medium',
    defaultEffort: 'low',
    defaultRisk: 'low',
  },
  {
    id: 'dig_form',
    title: 'Papier/Excel durch digitales Formular ersetzen',
    category: 'digitize',
    scope: 'step',
    description: 'Medienbruch beseitigen durch digitale Erfassung direkt im System.',
    defaultImpact: 'high',
    defaultEffort: 'medium',
    defaultRisk: 'low',
  },
  {
    id: 'auto_api',
    title: 'API-Integration statt manuelles Copy/Paste',
    category: 'automate',
    scope: 'step',
    description: 'Automatischer Datenaustausch zwischen Systemen über Schnittstellen.',
    defaultImpact: 'high',
    defaultEffort: 'medium',
    defaultRisk: 'medium',
    defaultAutomationBlueprint: {
      approach: 'api_integration',
      level: 'straight_through',
      humanInTheLoop: false,
      controls: ['monitoring', 'fallback_manual'],
    },
  },
  {
    id: 'auto_rpa',
    title: 'RPA Quick Win (Robotic Process Automation)',
    category: 'automate',
    scope: 'step',
    description: 'Einfache repetitive Aufgaben durch Software-Roboter automatisieren.',
    defaultImpact: 'high',
    defaultEffort: 'medium',
    defaultRisk: 'medium',
    defaultAutomationBlueprint: {
      approach: 'rpa',
      level: 'partial',
      humanInTheLoop: true,
      controls: ['monitoring', 'fallback_manual'],
    },
  },
  {
    id: 'ai_assistant',
    title: 'KI-Assistent im Schritt einführen',
    category: 'ai',
    scope: 'step',
    description: 'KI-gestützte Vorschläge und Assistenz für schnellere und bessere Entscheidungen.',
    defaultImpact: 'high',
    defaultEffort: 'high',
    defaultRisk: 'medium',
    defaultAutomationBlueprint: {
      approach: 'ai_assistant',
      level: 'assist',
      humanInTheLoop: true,
      controls: ['audit_trail', 'monitoring', 'data_privacy'],
    },
  },
  {
    id: 'ai_document',
    title: 'Automatische Dokumenten-Extraktion (KI)',
    category: 'ai',
    scope: 'step',
    description: 'Automatisches Auslesen und Verarbeiten von Dokumenten mittels KI.',
    defaultImpact: 'high',
    defaultEffort: 'high',
    defaultRisk: 'medium',
    defaultAutomationBlueprint: {
      approach: 'ai_document_processing',
      level: 'partial',
      humanInTheLoop: true,
      controls: ['audit_trail', 'monitoring', 'data_privacy'],
    },
  },
  {
    id: 'gov_audit',
    title: 'Audit Trail & Freigabe-Workflow einführen',
    category: 'governance',
    scope: 'process',
    description: 'Compliance-gerechte Nachvollziehbarkeit und strukturierte Freigaben etablieren.',
    defaultImpact: 'medium',
    defaultEffort: 'medium',
    defaultRisk: 'low',
    defaultAutomationBlueprint: {
      approach: 'workflow',
      level: 'partial',
      humanInTheLoop: true,
      controls: ['audit_trail', 'approval', 'monitoring'],
    },
  },
  {
    id: 'kpi_monitoring',
    title: 'KPI-Monitoring einführen',
    category: 'kpi',
    scope: 'process',
    description: 'Kontinuierliche Messung und Überwachung der Prozessleistung durch KPIs.',
    defaultImpact: 'medium',
    defaultEffort: 'medium',
    defaultRisk: 'low',
  },
];

import type {
  ProcessCategory,
  ProcessManagementLevel,
  ProcessHierarchyLevel,
  EndToEndDefinition,
  ProcessSidecar,
} from '../domain/process';

export interface ProcessTemplateDefinition {
  id: string;
  label: string;
  description: string;

  process: {
    title: string;
    category: ProcessCategory;
    managementLevel: ProcessManagementLevel;
    hierarchyLevel: ProcessHierarchyLevel;
  };

  version: {
    endToEndDefinition: EndToEndDefinition;
    sidecar: Partial<ProcessSidecar>;
  };
}

export const PROCESS_TEMPLATES: ProcessTemplateDefinition[] = [
  {
    id: 'customer-service-inquiry',
    label: 'Kundenservice: Anfrage bearbeiten',
    description: 'Prozess zur Bearbeitung von Kundenanfragen vom Eingang bis zur Dokumentation',

    process: {
      title: 'Kundenanfrage bearbeiten',
      category: 'kern',
      managementLevel: 'fachlich',
      hierarchyLevel: 'hauptprozess',
    },

    version: {
      endToEndDefinition: {
        trigger: 'Kundenanfrage geht ein (E-Mail, Telefon, Chat)',
        customer: 'Kunde mit Anfrage',
        outcome: 'Anfrage beantwortet und dokumentiert',
      },
      sidecar: {
        roles: [
          { id: 'role_customer', name: 'Kunde', kind: 'role' },
          { id: 'role_agent', name: 'Service Agent', kind: 'role' },
          { id: 'role_lead', name: 'Team Lead', kind: 'role' },
        ],
        systems: [
          { id: 'sys_ticket', name: 'Ticket-System' },
          { id: 'sys_kb', name: 'Wissensdatenbank' },
          { id: 'sys_crm', name: 'CRM' },
        ],
        dataObjects: [],
        kpis: [],
        captureDraft: {
          draftVersion: 'capture-draft-v1',
          happyPath: [
            {
              stepId: 'step_1',
              order: 1,
              label: 'Anfrage im System erfassen',
              roleId: 'role_agent',
              systemId: 'sys_ticket',
              workType: 'user_task',
              painPointHint: '',
              toBeHint: '',
            },
            {
              stepId: 'step_2',
              order: 2,
              label: 'Anfrage kategorisieren und Priorität setzen',
              roleId: 'role_agent',
              systemId: 'sys_ticket',
              workType: 'user_task',
              painPointHint: '',
              toBeHint: '',
            },
            {
              stepId: 'step_3',
              order: 3,
              label: 'Wissensdatenbank nach Lösung durchsuchen',
              roleId: 'role_agent',
              systemId: 'sys_kb',
              workType: 'ai_assisted',
              painPointHint: '',
              toBeHint: 'KI-gestützte Suche könnte hier Treffer verbessern',
            },
            {
              stepId: 'step_4',
              order: 4,
              label: 'Lösung formulieren und an Kunden senden',
              roleId: 'role_agent',
              systemId: 'sys_ticket',
              workType: 'user_task',
              painPointHint: '',
              toBeHint: '',
            },
            {
              stepId: 'step_5',
              order: 5,
              label: 'Kundendaten im CRM aktualisieren',
              roleId: 'role_agent',
              systemId: 'sys_crm',
              workType: 'user_task',
              painPointHint: 'Doppeleingabe zwischen Ticket-System und CRM',
              toBeHint: 'Automatische Synchronisation prüfen',
            },
            {
              stepId: 'step_6',
              order: 6,
              label: 'Ticket als gelöst markieren und dokumentieren',
              roleId: 'role_agent',
              systemId: 'sys_ticket',
              workType: 'user_task',
              painPointHint: '',
              toBeHint: '',
            },
          ],
          decisions: [
            {
              decisionId: 'dec_1',
              afterStepId: 'step_2',
              gatewayType: 'xor',
              question: 'Ist die Anfrage eindeutig und vollständig?',
              branches: [
                {
                  branchId: 'branch_yes',
                  conditionLabel: 'Ja, Anfrage ist klar',
                  nextStepId: 'step_3',
                },
                {
                  branchId: 'branch_no',
                  conditionLabel: 'Nein, Rückfragen nötig',
                  endsProcess: true,
                },
              ],
            },
          ],
          exceptions: [
            {
              exceptionId: 'exc_1',
              type: 'missing_data',
              description: 'Kundeninformationen unvollständig',
              relatedStepId: 'step_2',
              handling: 'Rückfrage an Kunden stellen und auf Antwort warten',
            },
          ],
        },
        improvementBacklog: [],
      },
    },
  },

  {
    id: 'order-to-invoice',
    label: 'Auftragsabwicklung: Auftrag bis Rechnung',
    description: 'Kernprozess von der Auftragsannahme über Versand bis zur Rechnungsstellung',

    process: {
      title: 'Auftrag bis Rechnung',
      category: 'kern',
      managementLevel: 'fachlich',
      hierarchyLevel: 'hauptprozess',
    },

    version: {
      endToEndDefinition: {
        trigger: 'Kundenauftrag geht ein',
        customer: 'Kunde mit Bestellung',
        outcome: 'Rechnung gestellt und Lieferung dokumentiert',
      },
      sidecar: {
        roles: [
          { id: 'role_sales', name: 'Vertrieb', kind: 'role' },
          { id: 'role_warehouse', name: 'Lager', kind: 'role' },
          { id: 'role_accounting', name: 'Buchhaltung', kind: 'role' },
        ],
        systems: [
          { id: 'sys_erp', name: 'ERP-System' },
          { id: 'sys_crm', name: 'CRM' },
          { id: 'sys_shipping', name: 'Versand/Logistik' },
        ],
        dataObjects: [],
        kpis: [],
        captureDraft: {
          draftVersion: 'capture-draft-v1',
          happyPath: [
            {
              stepId: 'step_1',
              order: 1,
              label: 'Auftrag im ERP erfassen',
              roleId: 'role_sales',
              systemId: 'sys_erp',
              workType: 'user_task',
              painPointHint: '',
              toBeHint: '',
            },
            {
              stepId: 'step_2',
              order: 2,
              label: 'Verfügbarkeit prüfen und Liefertermin festlegen',
              roleId: 'role_sales',
              systemId: 'sys_erp',
              workType: 'ai_assisted',
              painPointHint: '',
              toBeHint: 'Automatische Verfügbarkeitsprüfung implementieren',
            },
            {
              stepId: 'step_3',
              order: 3,
              label: 'Auftragsbestätigung an Kunden senden',
              roleId: 'role_sales',
              systemId: 'sys_crm',
              workType: 'service_task',
              painPointHint: '',
              toBeHint: '',
            },
            {
              stepId: 'step_4',
              order: 4,
              label: 'Ware kommissionieren',
              roleId: 'role_warehouse',
              systemId: 'sys_erp',
              workType: 'user_task',
              painPointHint: '',
              toBeHint: '',
            },
            {
              stepId: 'step_5',
              order: 5,
              label: 'Lieferung verpacken und Versand beauftragen',
              roleId: 'role_warehouse',
              systemId: 'sys_shipping',
              workType: 'user_task',
              painPointHint: '',
              toBeHint: '',
            },
            {
              stepId: 'step_6',
              order: 6,
              label: 'Versandbestätigung an Kunden senden',
              roleId: 'role_warehouse',
              systemId: 'sys_shipping',
              workType: 'service_task',
              painPointHint: '',
              toBeHint: '',
            },
            {
              stepId: 'step_7',
              order: 7,
              label: 'Lieferschein erstellen',
              roleId: 'role_warehouse',
              systemId: 'sys_erp',
              workType: 'user_task',
              painPointHint: 'Manuelle Erstellung fehleranfällig',
              toBeHint: 'Automatische Generierung aus Auftragsdaten',
            },
            {
              stepId: 'step_8',
              order: 8,
              label: 'Rechnung erstellen und versenden',
              roleId: 'role_accounting',
              systemId: 'sys_erp',
              workType: 'user_task',
              painPointHint: '',
              toBeHint: '',
            },
          ],
          decisions: [
            {
              decisionId: 'dec_1',
              afterStepId: 'step_1',
              gatewayType: 'xor',
              question: 'Sind alle Auftragsdaten vollständig und plausibel?',
              branches: [
                {
                  branchId: 'branch_yes',
                  conditionLabel: 'Ja, Auftrag vollständig',
                  nextStepId: 'step_2',
                },
                {
                  branchId: 'branch_no',
                  conditionLabel: 'Nein, Daten unvollständig',
                  endsProcess: true,
                },
              ],
            },
          ],
          exceptions: [
            {
              exceptionId: 'exc_1',
              type: 'missing_data',
              description: 'Auftragsdaten unvollständig',
              relatedStepId: 'step_1',
              handling: 'Rücksprache mit Vertrieb, fehlende Daten nachfordern',
            },
            {
              exceptionId: 'exc_2',
              type: 'timeout',
              description: 'Liefertermin nicht einhaltbar',
              relatedStepId: 'step_2',
              handling: 'Kunde kontaktieren und Alternativtermin vereinbaren',
            },
          ],
        },
        improvementBacklog: [
          {
            id: 'imp_1',
            scope: 'step',
            relatedStepId: 'step_2',
            title: 'Verfügbarkeitsprüfung automatisieren',
            category: 'automate',
            description: 'Echtzeit-Lagerbestandsabfrage ohne manuelle Prüfung',
            status: 'idea',
            impact: 'high',
            effort: 'medium',
            risk: 'low',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    },
  },

  {
    id: 'complaint-handling',
    label: 'Reklamation: Reklamation prüfen und abschließen',
    description: 'Prozess zur Bearbeitung von Kundenreklamationen von Eingang bis Abschluss',

    process: {
      title: 'Reklamation prüfen und abschließen',
      category: 'kern',
      managementLevel: 'fachlich',
      hierarchyLevel: 'hauptprozess',
    },

    version: {
      endToEndDefinition: {
        trigger: 'Kundenreklamation geht ein',
        customer: 'Kunde mit Reklamation',
        outcome: 'Reklamation bearbeitet und abgeschlossen (Ersatz/Erstattung/Ablehnung)',
      },
      sidecar: {
        roles: [
          { id: 'role_customer', name: 'Kunde', kind: 'role' },
          { id: 'role_service', name: 'Kundenservice', kind: 'role' },
          { id: 'role_quality', name: 'Qualitätsmanagement', kind: 'role' },
          { id: 'role_accounting', name: 'Buchhaltung', kind: 'role' },
        ],
        systems: [
          { id: 'sys_ticket', name: 'Ticket/CRM-System' },
          { id: 'sys_erp', name: 'ERP-System' },
        ],
        dataObjects: [],
        kpis: [],
        captureDraft: {
          draftVersion: 'capture-draft-v1',
          happyPath: [
            {
              stepId: 'step_1',
              order: 1,
              label: 'Reklamation erfassen und Ticket anlegen',
              roleId: 'role_service',
              systemId: 'sys_ticket',
              workType: 'user_task',
              painPointHint: '',
              toBeHint: '',
            },
            {
              stepId: 'step_2',
              order: 2,
              label: 'Ursprünglichen Auftrag und Lieferung prüfen',
              roleId: 'role_service',
              systemId: 'sys_erp',
              workType: 'user_task',
              painPointHint: '',
              toBeHint: '',
            },
            {
              stepId: 'step_3',
              order: 3,
              label: 'Berechtigung der Reklamation bewerten',
              roleId: 'role_quality',
              systemId: 'sys_ticket',
              workType: 'user_task',
              painPointHint: '',
              toBeHint: '',
            },
            {
              stepId: 'step_4',
              order: 4,
              label: 'Lösungsvorschlag erstellen (Ersatz/Erstattung)',
              roleId: 'role_service',
              systemId: 'sys_ticket',
              workType: 'user_task',
              painPointHint: '',
              toBeHint: '',
            },
            {
              stepId: 'step_5',
              order: 5,
              label: 'Kunde über Entscheidung informieren',
              roleId: 'role_service',
              systemId: 'sys_ticket',
              workType: 'user_task',
              painPointHint: '',
              toBeHint: '',
            },
            {
              stepId: 'step_6',
              order: 6,
              label: 'Maßnahmen umsetzen (Ersatzlieferung/Gutschrift)',
              roleId: 'role_accounting',
              systemId: 'sys_erp',
              workType: 'user_task',
              painPointHint: '',
              toBeHint: '',
            },
            {
              stepId: 'step_7',
              order: 7,
              label: 'Reklamation dokumentieren und Ticket schließen',
              roleId: 'role_service',
              systemId: 'sys_ticket',
              workType: 'user_task',
              painPointHint: '',
              toBeHint: '',
            },
          ],
          decisions: [
            {
              decisionId: 'dec_1',
              afterStepId: 'step_3',
              gatewayType: 'xor',
              question: 'Ist die Reklamation berechtigt?',
              branches: [
                {
                  branchId: 'branch_yes',
                  conditionLabel: 'Ja, berechtigt',
                  nextStepId: 'step_4',
                },
                {
                  branchId: 'branch_no',
                  conditionLabel: 'Nein, unberechtigt',
                  endsProcess: true,
                },
              ],
            },
          ],
          exceptions: [
            {
              exceptionId: 'exc_1',
              type: 'compliance',
              description: 'Rechtliche Prüfung erforderlich',
              relatedStepId: 'step_3',
              handling: 'Rechtsabteilung hinzuziehen bei komplexen Fällen',
            },
            {
              exceptionId: 'exc_2',
              type: 'other',
              description: 'Kunde nicht erreichbar',
              relatedStepId: 'step_5',
              handling: 'Alternative Kontaktwege nutzen oder Wartezeit dokumentieren',
            },
          ],
        },
        improvementBacklog: [
          {
            id: 'imp_1',
            scope: 'step',
            relatedStepId: 'step_3',
            title: 'Berechtigungsprüfung durch KI unterstützen',
            category: 'ai',
            description: 'Automatische Vorschläge basierend auf historischen Fällen',
            status: 'idea',
            impact: 'medium',
            effort: 'high',
            risk: 'medium',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    },
  },
];

export function getProcessTemplate(id: string): ProcessTemplateDefinition | null {
  return PROCESS_TEMPLATES.find((t) => t.id === id) || null;
}

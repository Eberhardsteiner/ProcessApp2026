import { useState, useEffect, useMemo, useRef } from 'react';
import type { Process, ProcessVersion, ImprovementBacklogItem, ImprovementCategory, ImprovementScope, ImprovementStatus, Level3, AutomationBlueprint, AutomationApproach, AutomationLevel, ControlType } from '../domain/process';
import { Trash2, ChevronDown, ChevronUp, Sparkles, Download, Wand2, Copy, Check, Plus, Library, TrendingUp, Send } from 'lucide-react';
import { assessProcess } from '../assessment/processAssessment';
import type { Level } from '../assessment/processAssessment';
import { generateHeuristicCandidates } from '../assessment/heuristicRecommendations';
import { buildClaudeImprovementPrompt } from '../ai/claudeImprovementPrompt';
import { parseAiImprovementPatch, validateAndNormalizePatch } from '../ai/aiImprovementPatch';
import { buildClaudeImprovementSuggestionsPrompt } from '../ai/claudeImprovementSuggestionsPrompt';
import { parseAiImprovementSuggestions, validateAndNormalizeSuggestions } from '../ai/aiImprovementSuggestions';
import { ImprovementBacklogCsvImport } from './ImprovementBacklogCsvImport';
import { IMPROVEMENT_TEMPLATES } from '../templates/improvementTemplates';
import { computeBaselineFromSteps, estimateCasesPerYear, expectedSavingMinPerCase, formatMinutesShort } from '../simulation/simulationLite';
import { runAiProxyRequest } from '../ai/aiApiClient';
import type { AppSettings } from '../settings/appSettings';

type AssessmentSuggestion = {
  key: string;
  title: string;
  category: ImprovementCategory;
  impact: Level3;
  effort: Level3;
  risk: Level3;
  sourceLabel: string;
  duplicate: boolean;
  selected: boolean;
};

type AiGeneratedSuggestion = {
  key: string;

  title: string;
  description?: string;

  category: ImprovementCategory;
  scope: ImprovementScope;
  relatedStepId?: string;

  impact: Level3;
  effort: Level3;
  risk: Level3;

  owner?: string;
  dueDate?: string;
  status: ImprovementStatus;

  automationBlueprint?: AutomationBlueprint;

  duplicate: boolean;
  selected: boolean;
};

type ExportMode = 'filtered' | 'all';

interface ImprovementBacklogEditorProps {
  process: Process;
  version: ProcessVersion;
  onSave: (updatedVersionPatch: Partial<ProcessVersion>) => Promise<void>;
  settings: AppSettings;
  initialOpenAiSuggestions?: boolean;
}

const CSV_DELIM = ';';

function escapeCsvCell(value: string): string {
  const v = value ?? '';
  const mustQuote =
    v.includes(CSV_DELIM) || v.includes('\n') || v.includes('\r') || v.includes('"');

  const escaped = v.replace(/"/g, '""');
  return mustQuote ? `"${escaped}"` : escaped;
}

function rowsToCsv(rows: string[][]): string {
  const lines = rows.map((r) => r.map(escapeCsvCell).join(CSV_DELIM));
  return `\ufeffsep=${CSV_DELIM}\n` + lines.join('\n');
}

function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getCategoryPotentialFactor(category: ImprovementCategory): number {
  switch (category) {
    case 'automate': return 1.3;
    case 'ai': return 1.2;
    case 'standardize': return 1.1;
    case 'digitize': return 1.0;
    case 'data': return 1.0;
    case 'kpi': return 0.9;
    case 'customer': return 0.8;
    case 'governance': return 0.8;
    case 'compliance': return 0.8;
  }
}

export function ImprovementBacklogEditor({ process, version, onSave, settings, initialOpenAiSuggestions }: ImprovementBacklogEditorProps) {
  const [items, setItems] = useState<ImprovementBacklogItem[]>(
    version.sidecar.improvementBacklog || []
  );
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<AssessmentSuggestion[]>([]);
  const [suggestionsMeta, setSuggestionsMeta] = useState<{ total: number; shown: number } | null>(null);
  const [suggestionSortMode, setSuggestionSortMode] = useState<'default' | 'potential_desc'>('default');

  const [viewMode, setViewMode] = useState<'list' | 'by_step'>('list');
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState<ImprovementCategory | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<ImprovementStatus | 'all'>('all');
  const [filterScope, setFilterScope] = useState<ImprovementScope | 'all'>('all');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'priority_desc' | 'potential_desc' | 'due_asc' | 'updated_desc' | 'title_asc'>('priority_desc');

  const [aiItemId, setAiItemId] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiError, setAiError] = useState('');
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [aiStatus, setAiStatus] = useState('');
  const [aiPromptCopied, setAiPromptCopied] = useState(false);

  const [aiPatchApiConsent, setAiPatchApiConsent] = useState(false);
  const [aiPatchApiRunning, setAiPatchApiRunning] = useState(false);
  const [aiPatchApiError, setAiPatchApiError] = useState('');
  const [aiPatchApiRequestPreview, setAiPatchApiRequestPreview] = useState('');

  const [aiGenOpen, setAiGenOpen] = useState(false);
  const [aiGenPrompt, setAiGenPrompt] = useState('');
  const [aiGenPromptCopied, setAiGenPromptCopied] = useState(false);
  const [aiGenResponse, setAiGenResponse] = useState('');
  const [aiGenError, setAiGenError] = useState('');
  const [aiGenWarnings, setAiGenWarnings] = useState<string[]>([]);
  const [aiGenAssumptions, setAiGenAssumptions] = useState<string[]>([]);
  const [aiGenStatus, setAiGenStatus] = useState('');
  const [aiGenSuggestions, setAiGenSuggestions] = useState<AiGeneratedSuggestion[]>([]);

  const [aiGenApiConsent, setAiGenApiConsent] = useState(false);
  const [aiGenApiRunning, setAiGenApiRunning] = useState(false);
  const [aiGenApiError, setAiGenApiError] = useState('');
  const [aiGenApiRequestPreview, setAiGenApiRequestPreview] = useState('');

  const [templateSearch, setTemplateSearch] = useState('');
  const [templateFilterCategory, setTemplateFilterCategory] = useState<ImprovementCategory | 'all'>('all');
  const [templateStepSelections, setTemplateStepSelections] = useState<Map<string, string>>(new Map());
  const [selectedScenarioItems, setSelectedScenarioItems] = useState<Set<string>>(new Set());

  const apiModeActive = settings.dataHandlingMode === 'external' && settings.ai.mode === 'api';
  const apiEndpoint = settings.ai.api.endpointUrl.trim();

  useEffect(() => {
    if (!hasChanges) {
      setItems(version.sidecar.improvementBacklog || []);
    }
  }, [version, hasChanges]);

  function normalizeTitle(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function categorizeSuggestion(input: { text: string; dimensionKey?: string }): ImprovementCategory {
    const textLower = input.text.toLowerCase();

    if (input.dimensionKey) {
      if (input.dimensionKey === 'standardization') return 'standardize';
      if (input.dimensionKey === 'dataIT') {
        if (textLower.includes('datenobjekt') || textLower.includes('daten')) return 'data';
        return 'digitize';
      }
      if (input.dimensionKey === 'automation') {
        if (textLower.includes('ki') || textLower.includes('llm')) return 'ai';
        return 'automate';
      }
      if (input.dimensionKey === 'risk') return 'compliance';
    }

    if (textLower.includes('kpi') || textLower.includes('kennzahl')) return 'kpi';
    if (textLower.includes('datenobjekt') || textLower.includes('daten')) return 'data';
    if (textLower.includes('system') || textLower.includes('it') || textLower.includes('digital')) return 'digitize';
    if (textLower.includes('automatis')) return 'automate';
    if (textLower.includes('ki') || textLower.includes('llm')) return 'ai';
    if (textLower.includes('compliance') || textLower.includes('regel') || textLower.includes('audit')) return 'compliance';
    if (textLower.includes('kunde') || textLower.includes('kund')) return 'customer';
    if (textLower.includes('verantwort') || textLower.includes('owner') || textLower.includes('governance')) return 'governance';

    return 'automate';
  }

  function defaultsForCategory(
    category: ImprovementCategory,
    dimensionLevel?: Level
  ): { impact: Level3; effort: Level3; risk: Level3 } {
    let impact: Level3 = 'medium';
    let effort: Level3 = 'medium';
    let risk: Level3 = 'low';

    switch (category) {
      case 'standardize':
      case 'digitize':
      case 'data':
      case 'kpi':
        impact = 'high';
        effort = 'medium';
        risk = 'low';
        break;
      case 'automate':
        impact = 'high';
        effort = 'high';
        risk = 'medium';
        break;
      case 'ai':
        impact = 'medium';
        effort = 'high';
        risk = 'high';
        break;
      case 'compliance':
        impact = 'high';
        effort = 'medium';
        risk = 'high';
        break;
      case 'governance':
      case 'customer':
        impact = 'medium';
        effort = 'medium';
        risk = 'low';
        break;
    }

    if (dimensionLevel === 'low') {
      impact = 'high';
    } else if (dimensionLevel === 'high') {
      impact = impact === 'high' ? 'medium' : impact;
    }

    return { impact, effort, risk };
  }

  function buildSuggestions() {
    const assessment = assessProcess(process, version);

    type Candidate = {
      text: string;
      sourceLabel: string;
      dimensionKey?: string;
      dimensionLevel?: Level;
    };

    const candidates: Candidate[] = [];

    assessment.dimensions.forEach((dim) => {
      dim.recommendations.forEach((rec) => {
        candidates.push({
          text: rec,
          sourceLabel: `Assessment: ${dim.label}`,
          dimensionKey: dim.key,
          dimensionLevel: dim.level,
        });
      });
    });

    assessment.nextSteps.forEach((step) => {
      candidates.push({
        text: step,
        sourceLabel: 'Assessment: Nächste Schritte',
      });
    });

    assessment.automationHints.forEach((hint) => {
      candidates.push({
        text: hint,
        sourceLabel: 'Assessment: Automatisierungshinweise',
      });
    });

    const heuristics = generateHeuristicCandidates(process, version);
    heuristics.forEach((h) => {
      candidates.push({
        text: h.text,
        sourceLabel: h.sourceLabel,
        dimensionKey: h.dimensionKey,
      });
    });

    const filteredCandidates = candidates
      .filter((c) => c.text.trim().length > 0)
      .map((c) => ({ ...c, text: c.text.trim() }));

    const seenNorms = new Set<string>();
    const uniqueCandidates: Candidate[] = [];
    filteredCandidates.forEach((c) => {
      const norm = normalizeTitle(c.text);
      if (!seenNorms.has(norm)) {
        seenNorms.add(norm);
        uniqueCandidates.push(c);
      }
    });

    const total = uniqueCandidates.length;
    const existingNorms = new Set(items.map((i) => normalizeTitle(i.title)));

    const limitedCandidates = uniqueCandidates.slice(0, 20);
    const shown = limitedCandidates.length;

    const generatedSuggestions: AssessmentSuggestion[] = limitedCandidates.map((c) => {
      const category = categorizeSuggestion({ text: c.text, dimensionKey: c.dimensionKey });
      const defaults = defaultsForCategory(category, c.dimensionLevel);
      const norm = normalizeTitle(c.text);
      const duplicate = existingNorms.has(norm);
      const key = `${category}:${norm}`;

      return {
        key,
        title: c.text,
        category,
        impact: defaults.impact,
        effort: defaults.effort,
        risk: defaults.risk,
        sourceLabel: c.sourceLabel,
        duplicate,
        selected: !duplicate,
      };
    });

    setSuggestions(generatedSuggestions);
    setSuggestionsMeta({ total, shown });
    setShowSuggestions(true);
    setSuggestionSortMode('default');
  }

  const levelWeight = (level: Level3): number => {
    switch (level) {
      case 'low':
        return 1;
      case 'medium':
        return 2;
      case 'high':
        return 3;
    }
  };

  const computePriorityScore = (item: ImprovementBacklogItem): number => {
    return levelWeight(item.impact) * 2 - levelWeight(item.effort) - levelWeight(item.risk);
  };

  const getPriorityLabel = (score: number): string => {
    if (score >= 3) return 'Hoch';
    if (score >= 1) return 'Mittel';
    return 'Niedrig';
  };

  function getFrequencyLabelUi(v?: string): string {
    switch (v) {
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

  function getLeadTimeLabelUi(v?: string): string {
    switch (v) {
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

  function getFrequencyWeight(v?: string): number {
    switch (v) {
      case 'daily': return 5;
      case 'weekly': return 4;
      case 'monthly': return 3;
      case 'quarterly': return 2;
      case 'yearly': return 1;
      case 'ad_hoc': return 1;
      default: return 0;
    }
  }

  function getLeadTimeWeight(v?: string): number {
    switch (v) {
      case 'minutes': return 1;
      case 'hours': return 2;
      case '1_day': return 3;
      case '2_5_days': return 4;
      case '1_2_weeks': return 5;
      case 'over_2_weeks': return 6;
      case 'varies': return 4;
      default: return 0;
    }
  }

  function getPotentialLabel(score: number): 'Hoch' | 'Mittel' | 'Niedrig' | 'Unbekannt' {
    if (score >= 20) return 'Hoch';
    if (score >= 9) return 'Mittel';
    if (score > 0) return 'Niedrig';
    return 'Unbekannt';
  }

  const getCategoryLabel = (category: ImprovementCategory): string => {
    const labels: Record<ImprovementCategory, string> = {
      standardize: 'Standardisierung',
      digitize: 'Digitalisierung',
      automate: 'Automatisierung',
      ai: 'KI-Einsatz',
      data: 'Daten',
      governance: 'Governance',
      customer: 'Kundennutzen',
      compliance: 'Compliance',
      kpi: 'Messung/KPI',
    };
    return labels[category];
  };

  const getStatusLabel = (status: ImprovementStatus): string => {
    const labels: Record<ImprovementStatus, string> = {
      idea: 'Idee',
      planned: 'Geplant',
      in_progress: 'In Arbeit',
      done: 'Erledigt',
      discarded: 'Verworfen',
    };
    return labels[status];
  };

  const getLevelLabel = (level: Level3): string => {
    const labels: Record<Level3, string> = {
      low: 'Niedrig',
      medium: 'Mittel',
      high: 'Hoch',
    };
    return labels[level];
  };

  const getApproachLabel = (approach: AutomationApproach): string => {
    const labels: Record<AutomationApproach, string> = {
      workflow: 'Workflow / Prozess-Engine',
      rpa: 'RPA (UI-Automatisierung)',
      api_integration: 'API-Integration',
      erp_config: 'ERP/Standard-Konfiguration',
      low_code: 'Low-Code / Formular-App',
      ai_assistant: 'KI-Assistent (Mitarbeiter unterstützt)',
      ai_document_processing: 'KI: Dokumente/Extraktion',
      ai_classification: 'KI: Klassifikation/Entscheidungshilfe',
      process_mining: 'Process Mining',
      other: 'Sonstiges',
    };
    return labels[approach];
  };

  const getAutomationLevelLabel = (level: AutomationLevel): string => {
    const labels: Record<AutomationLevel, string> = {
      assist: 'Assistiert',
      partial: 'Teilautomatisiert',
      straight_through: 'Vollautomatisiert (Straight-Through)',
    };
    return labels[level];
  };

  const getControlLabel = (control: ControlType): string => {
    const labels: Record<ControlType, string> = {
      audit_trail: 'Audit Trail',
      approval: 'Freigabe/Approval',
      monitoring: 'Monitoring',
      data_privacy: 'Datenschutz',
      fallback_manual: 'Manuelles Fallback',
    };
    return labels[control];
  };

  const toggleId = (list: string[] | undefined, id: string): string[] => {
    const current = list || [];
    if (current.includes(id)) {
      return current.filter((item) => item !== id);
    }
    return [...current, id];
  };

  const ensureBlueprint = (item: ImprovementBacklogItem): AutomationBlueprint => {
    if (item.automationBlueprint) {
      return item.automationBlueprint;
    }

    if (item.category === 'automate') {
      return {
        approach: 'workflow',
        level: 'partial',
        humanInTheLoop: false,
        controls: ['audit_trail', 'monitoring'],
      };
    }

    if (item.category === 'ai') {
      return {
        approach: 'ai_assistant',
        level: 'assist',
        humanInTheLoop: true,
        controls: ['audit_trail', 'data_privacy', 'fallback_manual'],
      };
    }

    return {
      approach: 'workflow',
      level: 'partial',
      humanInTheLoop: false,
    };
  };

  const handleAddItem = () => {
    const now = new Date().toISOString();
    const newItem: ImprovementBacklogItem = {
      id: crypto.randomUUID(),
      title: '',
      category: 'automate',
      scope: 'process',
      impact: 'medium',
      effort: 'medium',
      risk: 'medium',
      status: 'idea',
      createdAt: now,
      updatedAt: now,
    };
    setItems([...items, newItem]);
    setHasChanges(true);
  };

  const handleAddItemForStep = (stepId: string) => {
    const now = new Date().toISOString();
    const newItem: ImprovementBacklogItem = {
      id: crypto.randomUUID(),
      title: '',
      category: 'automate',
      scope: 'step',
      relatedStepId: stepId,
      impact: 'medium',
      effort: 'medium',
      risk: 'medium',
      status: 'idea',
      createdAt: now,
      updatedAt: now,
    };
    setItems([...items, newItem]);
    setHasChanges(true);
    setExpandedItems((prev) => new Set(prev).add(newItem.id));
  };

  const handleAddItemFromTemplate = (templateId: string) => {
    const template = IMPROVEMENT_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    const stepId = template.scope === 'step' ? templateStepSelections.get(templateId) : undefined;
    if (template.scope === 'step' && !stepId) return;

    const isDuplicate = items.some((item) => {
      const titleMatch = normalizeTitle(item.title) === normalizeTitle(template.title);
      if (template.scope === 'process') {
        return titleMatch && item.scope === 'process';
      } else {
        return titleMatch && item.relatedStepId === stepId;
      }
    });

    if (isDuplicate) return;

    const now = new Date().toISOString();
    const newItem: ImprovementBacklogItem = {
      id: crypto.randomUUID(),
      title: template.title,
      category: template.category,
      scope: template.scope,
      relatedStepId: stepId,
      description: template.description,
      impact: template.defaultImpact,
      effort: template.defaultEffort,
      risk: template.defaultRisk,
      status: 'idea',
      createdAt: now,
      updatedAt: now,
      automationBlueprint: template.defaultAutomationBlueprint,
    };
    setItems([...items, newItem]);
    setHasChanges(true);
    setExpandedItems((prev) => new Set(prev).add(newItem.id));
  };

  const handleDeleteItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
    setHasChanges(true);
  };

  const handleUpdateItem = (id: string, updates: Partial<ImprovementBacklogItem>) => {
    setItems(
      items.map((item) => {
        if (item.id !== id) return item;

        const updatedItem = { ...item, ...updates, updatedAt: new Date().toISOString() };

        if (updates.category && (updates.category === 'automate' || updates.category === 'ai')) {
          if (!updatedItem.automationBlueprint) {
            updatedItem.automationBlueprint = ensureBlueprint(updatedItem);
          }
        }

        return updatedItem;
      })
    );
    setHasChanges(true);
  };

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const handleToggleSuggestion = (key: string) => {
    setSuggestions(
      suggestions.map((s) => (s.key === key ? { ...s, selected: !s.selected } : s))
    );
  };

  const handleAddSelectedSuggestions = () => {
    const nowIso = new Date().toISOString();
    const newItems = suggestions
      .filter((s) => s.selected && !s.duplicate)
      .map((s) => ({
        id: crypto.randomUUID(),
        title: s.title,
        category: s.category,
        scope: 'process' as ImprovementScope,
        impact: s.impact,
        effort: s.effort,
        risk: s.risk,
        status: 'idea' as ImprovementStatus,
        createdAt: nowIso,
        updatedAt: nowIso,
        description: `Quelle: ${s.sourceLabel}`,
      }));

    setItems([...items, ...newItems]);
    setHasChanges(true);
    setShowSuggestions(false);
    setSuggestionsMeta(null);
  };

  const validateItems = (): string[] => {
    const errors: string[] = [];
    items.forEach((item, idx) => {
      if (!item.title.trim()) {
        errors.push(`Maßnahme ${idx + 1}: Titel fehlt`);
      }
      if (item.scope === 'step' && !item.relatedStepId) {
        errors.push(`Maßnahme ${idx + 1}: Schritt muss ausgewählt werden`);
      }
    });
    return errors;
  };

  const handleSave = async () => {
    const errors = validateItems();
    if (errors.length > 0) {
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const normalized = items.map((i) => {
        const base = { ...i, updatedAt: now };
        if ((i.category === 'automate' || i.category === 'ai') && !i.automationBlueprint) {
          base.automationBlueprint = ensureBlueprint(i);
        }
        return base;
      });

      await onSave({
        sidecar: {
          ...version.sidecar,
          improvementBacklog: normalized,
        },
      });
      setHasChanges(false);
    } finally {
      setSaving(false);
    }
  };

  const validationErrors = validateItems();
  const hasBlockingErrors = validationErrors.length > 0;

  const draft = version.sidecar.captureDraft;
  const happyPathSteps = useMemo(() => draft?.happyPath || [], [draft]);

  const stepLabelById = useMemo(() => {
    const m = new Map<string, string>();
    happyPathSteps.forEach((s) => {
      m.set(s.stepId, `${s.order}. ${s.label}`);
    });
    return m;
  }, [happyPathSteps]);

  const filteredTemplates = useMemo(() => {
    let filtered = IMPROVEMENT_TEMPLATES;

    if (templateFilterCategory !== 'all') {
      filtered = filtered.filter((t) => t.category === templateFilterCategory);
    }

    if (templateSearch.trim()) {
      const lower = templateSearch.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(lower) ||
          t.description.toLowerCase().includes(lower)
      );
    }

    return filtered;
  }, [templateSearch, templateFilterCategory]);

  const baseline = useMemo(() => {
    return computeBaselineFromSteps(happyPathSteps);
  }, [happyPathSteps]);

  const openItems = useMemo(() => {
    return items.filter((item) => item.status !== 'done' && item.status !== 'discarded');
  }, [items]);

  const knownOpenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const openIds = new Set(openItems.map((i) => i.id));

    setSelectedScenarioItems((prev) => {
      if (prev.size === 0 && knownOpenIdsRef.current.size === 0) {
        return openIds;
      }

      const next = new Set<string>();
      prev.forEach((id) => {
        if (openIds.has(id)) next.add(id);
      });

      openIds.forEach((id) => {
        if (!knownOpenIdsRef.current.has(id)) {
          next.add(id);
        }
      });

      return next;
    });

    knownOpenIdsRef.current = openIds;
  }, [openItems]);

  const hasOpenedAiSuggestionsRef = useRef(false);

  useEffect(() => {
    if (initialOpenAiSuggestions && !hasOpenedAiSuggestionsRef.current) {
      hasOpenedAiSuggestionsRef.current = true;
      handleStartAiGen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scenarioSaving = useMemo(() => {
    let totalSavingMin = 0;
    selectedScenarioItems.forEach((itemId) => {
      const item = items.find((i) => i.id === itemId);
      if (item) {
        totalSavingMin += expectedSavingMinPerCase(item);
      }
    });
    return totalSavingMin;
  }, [selectedScenarioItems, items]);

  const scenarioLeadTime = useMemo(() => {
    return Math.max(baseline.leadTimeKnownMin - scenarioSaving, 0);
  }, [baseline.leadTimeKnownMin, scenarioSaving]);

  const annualSaving = useMemo(() => {
    const freq = estimateCasesPerYear(version.sidecar.operationalContext?.frequency);
    if (freq.casesPerYear === null) return null;
    return (scenarioSaving * freq.casesPerYear) / 60;
  }, [scenarioSaving, version.sidecar.operationalContext?.frequency]);

  const ocFreq = version.sidecar.operationalContext?.frequency;
  const ocLt = version.sidecar.operationalContext?.typicalLeadTime;

  const processPotentialScore = useMemo(() => {
    const fw = getFrequencyWeight(ocFreq);
    const lw = getLeadTimeWeight(ocLt);
    if (fw === 0 || lw === 0) return 0;
    return fw * lw;
  }, [ocFreq, ocLt]);

  const processPotentialLabel = useMemo(() => {
    return getPotentialLabel(processPotentialScore);
  }, [processPotentialScore]);

  const isOpenStatus = (s: ImprovementStatus) => s !== 'done' && s !== 'discarded';

  const totalCount = items.length;
  const openCount = items.filter((i) => isOpenStatus(i.status)).length;
  const doneCount = items.filter((i) => i.status === 'done').length;
  const discardedCount = items.filter((i) => i.status === 'discarded').length;

  const filtersActive =
    searchText.trim() !== '' ||
    filterCategory !== 'all' ||
    filterStatus !== 'all' ||
    filterScope !== 'all' ||
    onlyOpen;

  const handleResetFilters = () => {
    setSearchText('');
    setFilterCategory('all');
    setFilterStatus('all');
    setFilterScope('all');
    setOnlyOpen(false);
    setSortBy('priority_desc');
  };

  const handleExportCsv = (mode: ExportMode) => {
    const list = mode === 'filtered' ? visibleItems : items;

    if (list.length === 0) return;

    const systemById = new Map<string, string>();
    version.sidecar.systems.forEach((sys) => {
      systemById.set(sys.id, sys.name);
    });

    const dataObjectById = new Map<string, string>();
    version.sidecar.dataObjects.forEach((obj) => {
      dataObjectById.set(obj.id, obj.name);
    });

    const kpiById = new Map<string, string>();
    version.sidecar.kpis.forEach((kpi) => {
      kpiById.set(kpi.id, kpi.name);
    });

    const stepById = new Map<string, string>();
    happyPathSteps.forEach((step) => {
      stepById.set(step.stepId, `${step.order}. ${step.label}`);
    });

    const header = [
      'Priorität Score',
      'Priorität',
      'Status',
      'Kategorie',
      'Maßnahme',
      'Scope',
      'Schritt',
      'Verantwortlich',
      'Fällig am',
      'Impact',
      'Effort',
      'Risiko',
      'Ansatz',
      'Zielgrad',
      'Human-in-the-loop',
      'Systeme',
      'Datenobjekte',
      'KPIs',
      'Kontrollen',
      'Beschreibung',
      'Betroffene Fälle (%)',
      'Einsparung pro Fall (Min)',
      'Schätzung Notiz',
      'Erstellt am',
      'Aktualisiert am',
    ];

    const rows: string[][] = [header];

    list.forEach((item) => {
      const score = computePriorityScore(item);
      const blueprint = item.automationBlueprint;

      const systems = blueprint?.systemIds?.map((id) => systemById.get(id) || id).join(', ') || '';
      const dataObjects = blueprint?.dataObjectIds?.map((id) => dataObjectById.get(id) || id).join(', ') || '';
      const kpis = blueprint?.kpiIds?.map((id) => kpiById.get(id) || id).join(', ') || '';
      const controls = blueprint?.controls?.map((c) => getControlLabel(c)).join(', ') || '';

      const stepLabel =
        item.scope === 'step' && item.relatedStepId ? stepById.get(item.relatedStepId) || item.relatedStepId : '';

      const affected = item.impactEstimate?.affectedCaseSharePct?.toString() || '';
      const savingMin = item.impactEstimate?.leadTimeSavingMinPerCase?.toString() || '';
      const notes = item.impactEstimate?.notes || '';

      rows.push([
        String(score),
        getPriorityLabel(score),
        getStatusLabel(item.status),
        getCategoryLabel(item.category),
        item.title || '',
        item.scope === 'process' ? 'Prozess' : 'Schritt',
        stepLabel,
        item.owner || '',
        item.dueDate || '',
        getLevelLabel(item.impact),
        getLevelLabel(item.effort),
        getLevelLabel(item.risk),
        blueprint ? getApproachLabel(blueprint.approach) : '',
        blueprint ? getAutomationLevelLabel(blueprint.level) : '',
        blueprint ? (blueprint.humanInTheLoop ? 'Ja' : 'Nein') : '',
        systems,
        dataObjects,
        kpis,
        controls,
        item.description || '',
        affected,
        savingMin,
        notes,
        item.createdAt || '',
        item.updatedAt || '',
      ]);
    });

    const csv = rowsToCsv(rows);

    const baseTitle = (process.title || 'prozess')
      .replace(/[^a-zA-Z0-9_\-äöüÄÖÜß ]/g, '')
      .replace(/\s+/g, '_');

    const versionShort = version.versionId ? version.versionId.slice(0, 8) : 'version';
    const dateStamp = new Date().toISOString().slice(0, 10);
    const modeLabel = mode === 'filtered' ? 'gefiltert' : 'alle';

    const filename = `${baseTitle}__massnahmen__${versionShort}__${modeLabel}__${dateStamp}.csv`;

    downloadTextFile(filename, csv);
  };

  const handleStartAiImprovement = (item: ImprovementBacklogItem) => {
    setAiError('');
    setAiWarnings([]);
    setAiResponse('');
    setAiStatus('');
    setAiPromptCopied(false);
    setAiItemId(item.id);
    setAiPatchApiConsent(false);
    setAiPatchApiError('');
    setAiPatchApiRunning(false);

    try {
      const prompt = buildClaudeImprovementPrompt({ process, version, item });
      setAiPrompt(prompt);
      setAiStatus('Prompt erzeugt. Bitte in Claude einfügen.');
      const promptPreview = prompt.length > 4000 ? prompt.slice(0, 4000) + '\n\n… (gekürzt)' : prompt;
      setAiPatchApiRequestPreview(JSON.stringify({ schemaVersion: 'process-ai-proxy-v1', prompt: promptPreview }, null, 2));
    } catch (err) {
      setAiError('Fehler beim Erstellen des Prompts: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(aiPrompt);
      setAiPromptCopied(true);
      setTimeout(() => setAiPromptCopied(false), 2000);
    } catch {
      setAiError('Prompt konnte nicht kopiert werden. Bitte manuell markieren und kopieren.');
    }
  };

  const handleApplyAiResponse = () => {
    setAiError('');
    setAiWarnings([]);
    setAiStatus('');

    try {
      const patch = parseAiImprovementPatch(aiResponse);

      if (patch.itemId !== aiItemId) {
        setAiError('Antwort passt nicht zu dieser Maßnahme (itemId stimmt nicht).');
        return;
      }

      const allowedSystemIds = new Set(version.sidecar.systems.map((s) => s.id));
      const allowedDataObjectIds = new Set(version.sidecar.dataObjects.map((d) => d.id));
      const allowedKpiIds = new Set(version.sidecar.kpis.map((k) => k.id));
      const allowedStepIds = new Set(happyPathSteps.map((s) => s.stepId));

      const { normalized, warnings } = validateAndNormalizePatch({
        patch,
        allowed: {
          systemIds: allowedSystemIds,
          dataObjectIds: allowedDataObjectIds,
          kpiIds: allowedKpiIds,
          stepIds: allowedStepIds,
        },
      });

      handleUpdateItem(aiItemId, normalized.patch as Partial<ImprovementBacklogItem>);
      setHasChanges(true);
      setAiWarnings(warnings);
      setAiStatus('KI-Patch angewendet. Bitte Änderungen speichern.');
    } catch (err) {
      setAiError('Fehler: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleCloseAiPanel = () => {
    setAiItemId(null);
    setAiPrompt('');
    setAiResponse('');
    setAiWarnings([]);
    setAiError('');
    setAiStatus('');
    setAiPromptCopied(false);
  };

  const handleStartAiGen = () => {
    setShowSuggestions(false);
    setSuggestionsMeta(null);

    setAiGenOpen(true);
    setAiGenError('');
    setAiGenWarnings([]);
    setAiGenAssumptions([]);
    setAiGenResponse('');
    setAiGenSuggestions([]);
    setAiGenStatus('');
    setAiGenPromptCopied(false);
    setAiGenApiConsent(false);
    setAiGenApiError('');
    setAiGenApiRunning(false);

    try {
      const prompt = buildClaudeImprovementSuggestionsPrompt({
        process,
        version,
        existingTitles: items.map((i) => i.title).filter((t) => (t || '').trim().length > 0),
      });
      setAiGenPrompt(prompt);
      setAiGenStatus('Prompt erzeugt. Bitte in Claude einfügen.');
      const promptPreview = prompt.length > 4000 ? prompt.slice(0, 4000) + '\n\n… (gekürzt)' : prompt;
      setAiGenApiRequestPreview(JSON.stringify({ schemaVersion: 'process-ai-proxy-v1', prompt: promptPreview }, null, 2));
    } catch (err) {
      setAiGenError(
        'Fehler beim Erstellen des Prompts: ' +
          (err instanceof Error ? err.message : String(err))
      );
    }
  };

  const handleCopyAiGenPrompt = async () => {
    try {
      await navigator.clipboard.writeText(aiGenPrompt);
      setAiGenPromptCopied(true);
      setTimeout(() => setAiGenPromptCopied(false), 2000);
    } catch {
      setAiGenError('Prompt konnte nicht kopiert werden. Bitte manuell markieren und kopieren.');
    }
  };

  const handleCloseAiGenPanel = () => {
    setAiGenOpen(false);
    setAiGenPrompt('');
    setAiGenPromptCopied(false);
    setAiGenResponse('');
    setAiGenError('');
    setAiGenWarnings([]);
    setAiGenAssumptions([]);
    setAiGenStatus('');
    setAiGenSuggestions([]);
  };

  const handleApiSendPatch = async () => {
    setAiPatchApiRunning(true);
    setAiPatchApiError('');
    try {
      const text = await runAiProxyRequest({
        endpointUrl: apiEndpoint,
        authMode: settings.ai.api.authMode,
        apiKey: settings.ai.api.apiKey,
        timeoutMs: settings.ai.api.timeoutMs,
        prompt: aiPrompt,
      });
      setAiResponse(text);
      setAiStatus('API-Antwort übernommen. Bitte prüfen und dann anwenden.');
    } catch (err) {
      setAiPatchApiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiPatchApiRunning(false);
    }
  };

  const handleApiSendSuggestions = async () => {
    setAiGenApiRunning(true);
    setAiGenApiError('');
    try {
      const text = await runAiProxyRequest({
        endpointUrl: apiEndpoint,
        authMode: settings.ai.api.authMode,
        apiKey: settings.ai.api.apiKey,
        timeoutMs: settings.ai.api.timeoutMs,
        prompt: aiGenPrompt,
      });
      setAiGenResponse(text);
      setAiGenStatus('API-Antwort übernommen. Bitte prüfen.');
    } catch (err) {
      setAiGenApiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiGenApiRunning(false);
    }
  };

  const handleCheckAiGenResponse = () => {
    setAiGenError('');
    setAiGenWarnings([]);
    setAiGenAssumptions([]);
    setAiGenStatus('');

    try {
      const parsed = parseAiImprovementSuggestions(aiGenResponse);

      const allowedSystemIds = new Set(version.sidecar.systems.map((s) => s.id));
      const allowedDataObjectIds = new Set(version.sidecar.dataObjects.map((d) => d.id));
      const allowedKpiIds = new Set(version.sidecar.kpis.map((k) => k.id));
      const allowedStepIds = new Set(happyPathSteps.map((s) => s.stepId));

      const { normalized, warnings } = validateAndNormalizeSuggestions({
        result: parsed,
        allowed: {
          systemIds: allowedSystemIds,
          dataObjectIds: allowedDataObjectIds,
          kpiIds: allowedKpiIds,
          stepIds: allowedStepIds,
        },
      });

      const combinedWarnings: string[] = [];
      combinedWarnings.push(...warnings);
      if (Array.isArray(normalized.warnings) && normalized.warnings.length > 0) {
        combinedWarnings.push(...normalized.warnings.map((w) => `Claude: ${w}`));
      }

      setAiGenWarnings(combinedWarnings);
      setAiGenAssumptions(Array.isArray(normalized.assumptions) ? normalized.assumptions : []);

      const existingNorms = new Set(items.map((i) => normalizeTitle(i.title || '')));

      const list: AiGeneratedSuggestion[] = normalized.suggestions.map((s, idx) => {
        const norm = normalizeTitle(s.title);
        const duplicate = existingNorms.has(norm);

        return {
          key: `gen:${idx}:${norm}`,
          title: s.title,
          description: s.description,
          category: s.category,
          scope: s.scope,
          relatedStepId: s.relatedStepId,
          impact: s.impact,
          effort: s.effort,
          risk: s.risk,
          owner: s.owner,
          dueDate: s.dueDate,
          status: s.status || 'idea',
          automationBlueprint: s.automationBlueprint as AutomationBlueprint | undefined,
          duplicate,
          selected: !duplicate,
        };
      });

      setAiGenSuggestions(list);
      setAiGenStatus('Antwort geprüft. Wählen Sie Vorschläge aus und fügen Sie sie hinzu.');
    } catch (err) {
      setAiGenError('Fehler: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const toggleAiGenSuggestion = (key: string) => {
    setAiGenSuggestions((prev) =>
      prev.map((s) => (s.key === key ? { ...s, selected: !s.selected } : s))
    );
  };

  const handleAddSelectedAiGenSuggestions = () => {
    const selected = aiGenSuggestions.filter((s) => s.selected && !s.duplicate);
    if (selected.length === 0) return;

    const nowIso = new Date().toISOString();

    const newItems: ImprovementBacklogItem[] = selected.map((s) => ({
      id: crypto.randomUUID(),
      title: s.title,
      category: s.category,
      scope: s.scope,
      relatedStepId: s.scope === 'step' ? s.relatedStepId : undefined,
      description: s.description
        ? `KI-Vorschlag (manuell aus Claude):\n\n${s.description}`
        : 'KI-Vorschlag (manuell aus Claude).',
      impact: s.impact,
      effort: s.effort,
      risk: s.risk,
      owner: s.owner,
      dueDate: s.dueDate,
      status: s.status || 'idea',
      createdAt: nowIso,
      updatedAt: nowIso,
      automationBlueprint: s.automationBlueprint,
    }));

    setItems((prev) => [...prev, ...newItems]);
    setHasChanges(true);

    setAiGenSuggestions((prev) =>
      prev.map((s) => (s.selected && !s.duplicate ? { ...s, duplicate: true, selected: false } : s))
    );

    setAiGenStatus(`${newItems.length} Vorschläge hinzugefügt. Bitte Änderungen speichern.`);
  };

  const visibleSuggestions = useMemo(() => {
    if (suggestionSortMode === 'default') return suggestions;

    const getCategoryPotentialFactor = (category: ImprovementCategory): number => {
      switch (category) {
        case 'automate': return 1.3;
        case 'ai': return 1.2;
        case 'standardize': return 1.1;
        case 'digitize': return 1.0;
        case 'data': return 1.0;
        case 'kpi': return 0.9;
        case 'customer': return 0.8;
        case 'governance': return 0.8;
        case 'compliance': return 0.8;
      }
    };

    const computeScore = (s: AssessmentSuggestion, base: number): number => {
      return base * getCategoryPotentialFactor(s.category);
    };

    const base = processPotentialScore;
    const copy = [...suggestions];

    return copy.sort((a, b) => {
      if (a.duplicate !== b.duplicate) return a.duplicate ? 1 : -1;

      const sa = computeScore(a, base);
      const sb = computeScore(b, base);
      if (sb !== sa) return sb - sa;

      return a.title.localeCompare(b.title, 'de');
    });
  }, [suggestions, suggestionSortMode, processPotentialScore]);

  const visibleItems = useMemo(() => {
    const stepIdToLabel = new Map<string, string>();
    happyPathSteps.forEach((step) => {
      stepIdToLabel.set(step.stepId, `${step.order}. ${step.label}`);
    });

    const checkOpenStatus = (s: ImprovementStatus) => s !== 'done' && s !== 'discarded';

    const getWeight = (level: Level3): number => {
      switch (level) {
        case 'low':
          return 1;
        case 'medium':
          return 2;
        case 'high':
          return 3;
      }
    };

    const calcPriorityScore = (item: ImprovementBacklogItem): number => {
      return getWeight(item.impact) * 2 - getWeight(item.effort) - getWeight(item.risk);
    };

    let filtered = items.filter((item) => {
      if (searchText.trim() !== '') {
        const search = searchText.toLowerCase();
        const titleMatch = item.title.toLowerCase().includes(search);
        const descMatch = (item.description || '').toLowerCase().includes(search);
        const ownerMatch = (item.owner || '').toLowerCase().includes(search);
        const stepMatch =
          item.scope === 'step' && item.relatedStepId
            ? (stepIdToLabel.get(item.relatedStepId) || '').toLowerCase().includes(search)
            : false;

        if (!titleMatch && !descMatch && !ownerMatch && !stepMatch) {
          return false;
        }
      }

      if (filterCategory !== 'all' && item.category !== filterCategory) {
        return false;
      }

      if (filterStatus !== 'all' && item.status !== filterStatus) {
        return false;
      }

      if (filterScope !== 'all' && item.scope !== filterScope) {
        return false;
      }

      if (onlyOpen && !checkOpenStatus(item.status)) {
        return false;
      }

      return true;
    });

    if (sortBy === 'priority_desc') {
      filtered = [...filtered].sort((a, b) => calcPriorityScore(b) - calcPriorityScore(a));
    } else if (sortBy === 'potential_desc') {
      const base = processPotentialScore;

      const computeOpportunity = (item: ImprovementBacklogItem): number => {
        if (base <= 0) return 0;
        const prio = calcPriorityScore(item);
        const shifted = prio + 5;
        return base * getCategoryPotentialFactor(item.category) * shifted;
      };

      filtered = [...filtered].sort((a, b) => {
        const sa = computeOpportunity(a);
        const sb = computeOpportunity(b);
        if (sb !== sa) return sb - sa;

        const pa = calcPriorityScore(a);
        const pb = calcPriorityScore(b);
        if (pb !== pa) return pb - pa;

        return a.title.localeCompare(b.title, 'de');
      });
    } else if (sortBy === 'due_asc') {
      filtered = [...filtered].sort((a, b) => {
        const aDate = a.dueDate || '';
        const bDate = b.dueDate || '';
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return aDate.localeCompare(bDate);
      });
    } else if (sortBy === 'updated_desc') {
      filtered = [...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } else if (sortBy === 'title_asc') {
      filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'de'));
    }

    return filtered;
  }, [items, searchText, filterCategory, filterStatus, filterScope, onlyOpen, sortBy, happyPathSteps, processPotentialScore]);

  const renderItemCards = (list: ImprovementBacklogItem[]) => (
    <div className="space-y-3">
      {list.map((item) => {
        const score = computePriorityScore(item);
        const priorityLabel = getPriorityLabel(score);
        const isExpanded = expandedItems.has(item.id);

        const opportunityScore =
          processPotentialScore > 0
            ? Math.round(processPotentialScore * getCategoryPotentialFactor(item.category) * (score + 5))
            : 0;

        return (
          <div id={`improvement-${item.id}`} key={item.id} className="border border-slate-200 rounded-lg p-4 bg-white">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 mr-4">
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => handleUpdateItem(item.id, { title: e.target.value })}
                  placeholder="Titel der Maßnahme *"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md font-medium text-slate-900"
                />
              </div>
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className="text-xs text-slate-500">Priorität</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {score >= 0 ? '+' : ''}
                    {score}
                  </div>
                  <div
                    className={`text-xs font-medium ${
                      score >= 3
                        ? 'text-green-700'
                        : score >= 1
                        ? 'text-yellow-700'
                        : 'text-red-700'
                    }`}
                  >
                    {priorityLabel}
                  </div>
                  {sortBy === 'potential_desc' && (
                    <div className="text-xs text-slate-500 mt-1">
                      Nutzen (grob): {processPotentialScore > 0 ? opportunityScore : 'Unbekannt'}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                  title="Löschen"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Kategorie *
                </label>
                <select
                  value={item.category}
                  onChange={(e) =>
                    handleUpdateItem(item.id, { category: e.target.value as ImprovementCategory })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                >
                  <option value="standardize">{getCategoryLabel('standardize')}</option>
                  <option value="digitize">{getCategoryLabel('digitize')}</option>
                  <option value="automate">{getCategoryLabel('automate')}</option>
                  <option value="ai">{getCategoryLabel('ai')}</option>
                  <option value="data">{getCategoryLabel('data')}</option>
                  <option value="governance">{getCategoryLabel('governance')}</option>
                  <option value="customer">{getCategoryLabel('customer')}</option>
                  <option value="compliance">{getCategoryLabel('compliance')}</option>
                  <option value="kpi">{getCategoryLabel('kpi')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Status *</label>
                <select
                  value={item.status}
                  onChange={(e) =>
                    handleUpdateItem(item.id, { status: e.target.value as ImprovementStatus })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                >
                  <option value="idea">{getStatusLabel('idea')}</option>
                  <option value="planned">{getStatusLabel('planned')}</option>
                  <option value="in_progress">{getStatusLabel('in_progress')}</option>
                  <option value="done">{getStatusLabel('done')}</option>
                  <option value="discarded">{getStatusLabel('discarded')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Scope *</label>
                <select
                  value={item.scope}
                  onChange={(e) => {
                    const newScope = e.target.value as ImprovementScope;
                    handleUpdateItem(item.id, {
                      scope: newScope,
                      relatedStepId: newScope === 'process' ? undefined : item.relatedStepId,
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                >
                  <option value="process">Prozess</option>
                  <option value="step">Schritt</option>
                </select>
              </div>

              {item.scope === 'step' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Schritt *
                  </label>
                  <select
                    value={item.relatedStepId || ''}
                    onChange={(e) =>
                      handleUpdateItem(item.id, { relatedStepId: e.target.value || undefined })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  >
                    <option value="">Bitte wählen...</option>
                    {happyPathSteps.map((step) => (
                      <option key={step.stepId} value={step.stepId}>
                        {step.order}. {step.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Impact *
                </label>
                <select
                  value={item.impact}
                  onChange={(e) => handleUpdateItem(item.id, { impact: e.target.value as Level3 })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                >
                  <option value="low">{getLevelLabel('low')}</option>
                  <option value="medium">{getLevelLabel('medium')}</option>
                  <option value="high">{getLevelLabel('high')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Aufwand *
                </label>
                <select
                  value={item.effort}
                  onChange={(e) => handleUpdateItem(item.id, { effort: e.target.value as Level3 })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                >
                  <option value="low">{getLevelLabel('low')}</option>
                  <option value="medium">{getLevelLabel('medium')}</option>
                  <option value="high">{getLevelLabel('high')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Risiko *</label>
                <select
                  value={item.risk}
                  onChange={(e) => handleUpdateItem(item.id, { risk: e.target.value as Level3 })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                >
                  <option value="low">{getLevelLabel('low')}</option>
                  <option value="medium">{getLevelLabel('medium')}</option>
                  <option value="high">{getLevelLabel('high')}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Verantwortlich
                </label>
                <input
                  type="text"
                  value={item.owner || ''}
                  onChange={(e) => handleUpdateItem(item.id, { owner: e.target.value || undefined })}
                  placeholder="Name oder Team"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Fällig am</label>
                <input
                  type="date"
                  value={item.dueDate || ''}
                  onChange={(e) => handleUpdateItem(item.id, { dueDate: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                />
              </div>
            </div>

            <div>
              <button
                onClick={() => toggleExpanded(item.id)}
                className="flex items-center space-x-2 text-sm text-slate-600 hover:text-slate-900"
              >
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                <span>{isExpanded ? 'Beschreibung ausblenden' : 'Beschreibung'}</span>
              </button>
              {isExpanded && (
                <>
                  <textarea
                    value={item.description || ''}
                    onChange={(e) =>
                      handleUpdateItem(item.id, { description: e.target.value || undefined })
                    }
                    placeholder="Detaillierte Beschreibung der Maßnahme..."
                    rows={3}
                    className="w-full mt-2 px-3 py-2 border border-slate-300 rounded-md text-sm"
                  />

                  <div className="mt-3">
                    <button
                      onClick={() => handleStartAiImprovement(item)}
                      className="px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium flex items-center space-x-2 text-sm"
                    >
                      <Wand2 size={16} />
                      <span>KI-Entwurf</span>
                    </button>
                  </div>

                  {aiItemId === item.id && (
                    <div className="mt-4 p-4 bg-purple-50 border-2 border-purple-300 rounded-lg">
                      <h4 className="text-sm font-semibold text-slate-900 mb-2">KI-Assistent für Maßnahmen</h4>
                      <p className="text-xs text-slate-600 mb-3">
                        Die App sendet keine Daten automatisch.
                        {apiModeActive
                          ? ' Standard ist Copy/Paste. API-Modus sendet nur auf Klick mit Consent.'
                          : ' Kopieren Sie den Prompt manuell in Claude und fügen Sie die JSON-Antwort hier ein.'}
                      </p>

                      {aiError && (
                        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
                          {aiError}
                        </div>
                      )}

                      {aiStatus && (
                        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
                          {aiStatus}
                        </div>
                      )}

                      {aiWarnings.length > 0 && (
                        <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                          <p className="text-sm font-medium text-yellow-900 mb-1">Warnungen:</p>
                          <ul className="text-xs text-yellow-800 space-y-1">
                            {aiWarnings.map((warning, idx) => (
                              <li key={idx}>• {warning}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="mb-3">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Prompt für Claude
                        </label>
                        <textarea
                          value={aiPrompt}
                          readOnly
                          rows={6}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs font-mono bg-slate-50"
                        />
                        <button
                          onClick={handleCopyPrompt}
                          className="mt-2 px-3 py-1 bg-slate-600 text-white rounded-md hover:bg-slate-700 font-medium text-sm flex items-center space-x-1"
                        >
                          {aiPromptCopied ? <Check size={14} /> : <Copy size={14} />}
                          <span>{aiPromptCopied ? 'Kopiert!' : 'Prompt kopieren'}</span>
                        </button>
                      </div>

                      {apiModeActive && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-3">
                          <h5 className="text-sm font-semibold text-blue-900 mb-3">API-Modus</h5>

                          {apiEndpoint ? (
                            <p className="text-xs text-blue-800 mb-2">
                              Endpoint: <span className="font-mono">{apiEndpoint}</span>
                            </p>
                          ) : (
                            <div className="bg-yellow-50 border border-yellow-300 rounded p-2 mb-2">
                              <p className="text-xs text-yellow-800">Kein Endpoint konfiguriert. Bitte in den Einstellungen festlegen.</p>
                            </div>
                          )}

                          <label className="flex items-start gap-2 text-xs text-blue-900 mb-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={aiPatchApiConsent}
                              onChange={(e) => setAiPatchApiConsent(e.target.checked)}
                              className="mt-0.5"
                            />
                            <span>Ich stimme der Übertragung an den konfigurierten Endpoint zu.</span>
                          </label>

                          <details className="mb-3">
                            <summary className="text-xs text-blue-800 cursor-pointer mb-1">Request Preview</summary>
                            <pre className="text-xs bg-white border border-blue-200 rounded p-2 overflow-auto max-h-32 font-mono">
                              {aiPatchApiRequestPreview}
                            </pre>
                          </details>

                          {aiPatchApiError && (
                            <div className="bg-red-50 border border-red-200 rounded p-2 mb-3">
                              <p className="text-xs text-red-800">{aiPatchApiError}</p>
                            </div>
                          )}

                          <button
                            onClick={handleApiSendPatch}
                            disabled={!aiPatchApiConsent || !apiEndpoint || aiPatchApiRunning || !aiPrompt.trim()}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 text-sm transition-colors"
                          >
                            <Send size={14} />
                            {aiPatchApiRunning ? 'Sende...' : 'Per API senden (Antwort übernehmen)'}
                          </button>
                        </div>
                      )}

                      <div className="mb-3">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          JSON-Antwort von Claude
                        </label>
                        <textarea
                          value={aiResponse}
                          onChange={(e) => setAiResponse(e.target.value)}
                          placeholder="Fügen Sie hier die JSON-Antwort von Claude ein..."
                          rows={8}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs font-mono"
                        />
                      </div>

                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={handleCloseAiPanel}
                          className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 font-medium text-sm"
                        >
                          Schließen
                        </button>
                        <button
                          onClick={handleApplyAiResponse}
                          disabled={!aiResponse.trim()}
                          className="px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-medium text-sm"
                        >
                          Antwort anwenden
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {(item.category === 'automate' || item.category === 'ai') && isExpanded && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Automatisierungs-Steckbrief</h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Ansatz</label>
                    <select
                      value={ensureBlueprint(item).approach}
                      onChange={(e) =>
                        handleUpdateItem(item.id, {
                          automationBlueprint: {
                            ...ensureBlueprint(item),
                            approach: e.target.value as AutomationApproach,
                          },
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    >
                      <option value="workflow">{getApproachLabel('workflow')}</option>
                      <option value="rpa">{getApproachLabel('rpa')}</option>
                      <option value="api_integration">{getApproachLabel('api_integration')}</option>
                      <option value="erp_config">{getApproachLabel('erp_config')}</option>
                      <option value="low_code">{getApproachLabel('low_code')}</option>
                      <option value="ai_assistant">{getApproachLabel('ai_assistant')}</option>
                      <option value="ai_document_processing">{getApproachLabel('ai_document_processing')}</option>
                      <option value="ai_classification">{getApproachLabel('ai_classification')}</option>
                      <option value="process_mining">{getApproachLabel('process_mining')}</option>
                      <option value="other">{getApproachLabel('other')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Zielgrad</label>
                    <select
                      value={ensureBlueprint(item).level}
                      onChange={(e) =>
                        handleUpdateItem(item.id, {
                          automationBlueprint: {
                            ...ensureBlueprint(item),
                            level: e.target.value as AutomationLevel,
                          },
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    >
                      <option value="assist">{getAutomationLevelLabel('assist')}</option>
                      <option value="partial">{getAutomationLevelLabel('partial')}</option>
                      <option value="straight_through">{getAutomationLevelLabel('straight_through')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Human-in-the-Loop</label>
                    <div className="flex items-center h-10">
                      <input
                        type="checkbox"
                        checked={ensureBlueprint(item).humanInTheLoop}
                        onChange={(e) =>
                          handleUpdateItem(item.id, {
                            automationBlueprint: {
                              ...ensureBlueprint(item),
                              humanInTheLoop: e.target.checked,
                            },
                          })
                        }
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <span className="ml-2 text-sm text-slate-700">
                        {ensureBlueprint(item).humanInTheLoop ? 'Ja' : 'Nein'}
                      </span>
                    </div>
                  </div>
                </div>

                {version.sidecar.systems.length > 0 && (
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-slate-700 mb-2">Systeme</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {version.sidecar.systems.map((sys) => (
                        <label key={sys.id} className="flex items-center space-x-2 text-sm">
                          <input
                            type="checkbox"
                            checked={(ensureBlueprint(item).systemIds || []).includes(sys.id)}
                            onChange={() =>
                              handleUpdateItem(item.id, {
                                automationBlueprint: {
                                  ...ensureBlueprint(item),
                                  systemIds: toggleId(ensureBlueprint(item).systemIds, sys.id),
                                },
                              })
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span className="text-slate-700">{sys.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {version.sidecar.dataObjects.length > 0 && (
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-slate-700 mb-2">Datenobjekte</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {version.sidecar.dataObjects.map((obj) => (
                        <label key={obj.id} className="flex items-center space-x-2 text-sm">
                          <input
                            type="checkbox"
                            checked={(ensureBlueprint(item).dataObjectIds || []).includes(obj.id)}
                            onChange={() =>
                              handleUpdateItem(item.id, {
                                automationBlueprint: {
                                  ...ensureBlueprint(item),
                                  dataObjectIds: toggleId(ensureBlueprint(item).dataObjectIds, obj.id),
                                },
                              })
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span className="text-slate-700">{obj.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {version.sidecar.kpis.length > 0 && (
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-slate-700 mb-2">KPIs</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {version.sidecar.kpis.map((kpi) => (
                        <label key={kpi.id} className="flex items-center space-x-2 text-sm">
                          <input
                            type="checkbox"
                            checked={(ensureBlueprint(item).kpiIds || []).includes(kpi.id)}
                            onChange={() =>
                              handleUpdateItem(item.id, {
                                automationBlueprint: {
                                  ...ensureBlueprint(item),
                                  kpiIds: toggleId(ensureBlueprint(item).kpiIds, kpi.id),
                                },
                              })
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span className="text-slate-700">{kpi.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-700 mb-2">Controls</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {(['audit_trail', 'approval', 'monitoring', 'data_privacy', 'fallback_manual'] as ControlType[]).map((ctrl) => (
                      <label key={ctrl} className="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={(ensureBlueprint(item).controls || []).includes(ctrl)}
                          onChange={() =>
                            handleUpdateItem(item.id, {
                              automationBlueprint: {
                                ...ensureBlueprint(item),
                                controls: toggleId(ensureBlueprint(item).controls, ctrl) as ControlType[],
                              },
                            })
                          }
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span className="text-slate-700">{getControlLabel(ctrl)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Notizen</label>
                  <textarea
                    value={ensureBlueprint(item).notes || ''}
                    onChange={(e) =>
                      handleUpdateItem(item.id, {
                        automationBlueprint: {
                          ...ensureBlueprint(item),
                          notes: e.target.value || undefined,
                        },
                      })
                    }
                    placeholder="Zusätzliche Hinweise zur Automatisierung..."
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Maßnahmen-Backlog</h2>
        <p className="text-sm text-slate-600 mb-4">
          Halten Sie konkrete Verbesserungs- und Automatisierungsmaßnahmen fest.
        </p>
        <div className="flex space-x-3">
          <button
            onClick={handleAddItem}
            className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 font-medium"
          >
            Maßnahme hinzufügen
          </button>
          <button
            onClick={buildSuggestions}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-medium flex items-center space-x-2"
          >
            <Sparkles size={18} />
            <span>Empfehlungen übernehmen</span>
          </button>
          <button
            onClick={handleStartAiGen}
            disabled={saving}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-medium flex items-center space-x-2"
          >
            <Wand2 size={18} />
            <span>KI‑Vorschläge generieren</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <ImprovementBacklogCsvImport
          process={process}
          version={version}
          currentItems={items}
          onApply={(nextItems) => {
            setItems(nextItems);
            setHasChanges(true);
          }}
        />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Library size={20} className="text-blue-600" />
          <h3 className="text-lg font-semibold text-slate-900">Maßnahmenbibliothek (Templates)</h3>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Vordefinierte Maßnahmen mit einem Klick hinzufügen.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Suche</label>
            <input
              type="text"
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              placeholder="Titel oder Beschreibung..."
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Kategorie</label>
            <select
              value={templateFilterCategory}
              onChange={(e) => setTemplateFilterCategory(e.target.value as ImprovementCategory | 'all')}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            >
              <option value="all">Alle</option>
              <option value="standardize">{getCategoryLabel('standardize')}</option>
              <option value="digitize">{getCategoryLabel('digitize')}</option>
              <option value="automate">{getCategoryLabel('automate')}</option>
              <option value="ai">{getCategoryLabel('ai')}</option>
              <option value="governance">{getCategoryLabel('governance')}</option>
              <option value="kpi">{getCategoryLabel('kpi')}</option>
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {filteredTemplates.map((template) => {
            const isDuplicate = items.some((item) => {
              const titleMatch = normalizeTitle(item.title) === normalizeTitle(template.title);
              if (template.scope === 'process') {
                return titleMatch && item.scope === 'process';
              } else {
                const stepId = templateStepSelections.get(template.id);
                return titleMatch && item.relatedStepId === stepId;
              }
            });

            const selectedStepId = templateStepSelections.get(template.id);
            const canAdd = template.scope === 'process' || selectedStepId;

            return (
              <div key={template.id} className="border border-slate-200 rounded-md p-4 bg-slate-50">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">{template.title}</div>
                    <div className="text-xs text-slate-600 mt-1">
                      {getCategoryLabel(template.category)} · {template.scope === 'process' ? 'Prozess' : 'Schritt'}
                    </div>
                  </div>
                  {isDuplicate && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                      Bereits vorhanden
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-700 mb-3">{template.description}</div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4 text-xs text-slate-600">
                    <span>Impact: {getLevelLabel(template.defaultImpact)}</span>
                    <span>Effort: {getLevelLabel(template.defaultEffort)}</span>
                    <span>Risk: {getLevelLabel(template.defaultRisk)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {template.scope === 'step' && (
                      <select
                        value={selectedStepId || ''}
                        onChange={(e) => {
                          const newMap = new Map(templateStepSelections);
                          if (e.target.value) {
                            newMap.set(template.id, e.target.value);
                          } else {
                            newMap.delete(template.id);
                          }
                          setTemplateStepSelections(newMap);
                        }}
                        className="px-2 py-1 border border-slate-300 rounded text-sm"
                      >
                        <option value="">Schritt wählen...</option>
                        {happyPathSteps.map((step) => (
                          <option key={step.stepId} value={step.stepId}>
                            {step.order}. {step.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => handleAddItemFromTemplate(template.id)}
                      disabled={isDuplicate || !canAdd}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <Plus size={14} />
                      Hinzufügen
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-center space-x-2 mb-4">
          <TrendingUp size={20} className="text-green-600" />
          <h3 className="text-lg font-semibold text-slate-900">Wirkungsabschätzung (grob)</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">Basierend auf manuellen Schätzwerten – keine Mining-Datensimulation.</p>

        <div className="mb-6">
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Baseline (bekannte Werte)</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
            <div className="bg-slate-50 p-3 rounded">
              <div className="text-xs text-slate-600 mb-1">Bearbeitungszeit</div>
              <div className="text-lg font-semibold text-slate-900">
                {formatMinutesShort(baseline.processingKnownMin)}
              </div>
            </div>
            <div className="bg-slate-50 p-3 rounded">
              <div className="text-xs text-slate-600 mb-1">Wartezeit</div>
              <div className="text-lg font-semibold text-slate-900">
                {formatMinutesShort(baseline.waitingKnownMin)}
              </div>
            </div>
            <div className="bg-slate-50 p-3 rounded">
              <div className="text-xs text-slate-600 mb-1">Durchlaufzeit</div>
              <div className="text-lg font-semibold text-slate-900">
                {formatMinutesShort(baseline.leadTimeKnownMin)}
              </div>
            </div>
          </div>
          {(baseline.unknownProcessingCount > 0 || baseline.unknownWaitingCount > 0) && (
            <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded mb-2">
              + {baseline.unknownProcessingCount} Schritte (Bearbeitung) und {baseline.unknownWaitingCount} Schritte (Warten) nicht quantifiziert (unknown/varies)
            </div>
          )}
          <div className="text-xs text-slate-500 space-y-1">
            {baseline.assumptions.map((a, i) => (
              <div key={i}>• {a}</div>
            ))}
          </div>
        </div>

        {openItems.length > 0 && (
          <>
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">Szenario (offene Maßnahmen)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left p-2 text-xs font-medium text-slate-700">Im Szenario</th>
                      <th className="text-left p-2 text-xs font-medium text-slate-700">Maßnahme</th>
                      <th className="text-left p-2 text-xs font-medium text-slate-700">Betroffene Fälle (%)</th>
                      <th className="text-left p-2 text-xs font-medium text-slate-700">Einsparung/Fall (Min)</th>
                      <th className="text-left p-2 text-xs font-medium text-slate-700">Notiz</th>
                      <th className="text-left p-2 text-xs font-medium text-slate-700">Erwartet (Min/Fall)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openItems.map((item) => {
                      const isSelected = selectedScenarioItems.has(item.id);
                      const stepLabel = item.scope === 'step' && item.relatedStepId
                        ? ` [${stepLabelById.get(item.relatedStepId) || item.relatedStepId}]`
                        : '';

                      return (
                        <tr key={item.id} className="border-t border-slate-200">
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const newSet = new Set(selectedScenarioItems);
                                if (e.target.checked) {
                                  newSet.add(item.id);
                                } else {
                                  newSet.delete(item.id);
                                }
                                setSelectedScenarioItems(newSet);
                              }}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                          </td>
                          <td className="p-2 text-slate-700">
                            {item.title}{stepLabel}
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={item.impactEstimate?.affectedCaseSharePct ?? ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? undefined : Math.max(0, Math.min(100, Number(e.target.value)));
                                handleUpdateItem(item.id, {
                                  impactEstimate: {
                                    ...item.impactEstimate,
                                    affectedCaseSharePct: val,
                                  },
                                });
                              }}
                              placeholder="100"
                              className="w-20 px-2 py-1 border border-slate-300 rounded text-sm"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              value={item.impactEstimate?.leadTimeSavingMinPerCase ?? ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? undefined : Math.max(0, Number(e.target.value));
                                handleUpdateItem(item.id, {
                                  impactEstimate: {
                                    ...item.impactEstimate,
                                    leadTimeSavingMinPerCase: val,
                                  },
                                });
                              }}
                              placeholder="0"
                              className="w-24 px-2 py-1 border border-slate-300 rounded text-sm"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.impactEstimate?.notes ?? ''}
                              onChange={(e) => {
                                const val = e.target.value.trim();
                                handleUpdateItem(item.id, {
                                  impactEstimate: {
                                    ...item.impactEstimate,
                                    notes: val ? e.target.value : undefined,
                                  },
                                });
                              }}
                              placeholder="Annahmen/Quelle…"
                              className="w-64 px-2 py-1 border border-slate-300 rounded text-sm"
                            />
                          </td>
                          <td className="p-2 font-medium text-slate-900">
                            {formatMinutesShort(expectedSavingMinPerCase(item))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-green-900 mb-3">Ergebnis</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                <div>
                  <div className="text-xs text-green-700 mb-1">Erwartete Einsparung pro Fall</div>
                  <div className="text-2xl font-bold text-green-900">
                    {formatMinutesShort(scenarioSaving)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-green-700 mb-1">Baseline (bekannt)</div>
                  <div className="text-lg font-semibold text-green-900">
                    {formatMinutesShort(baseline.leadTimeKnownMin)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-green-700 mb-1">Szenario (bekannt)</div>
                  <div className="text-lg font-semibold text-green-900">
                    {formatMinutesShort(scenarioLeadTime)}
                  </div>
                </div>
              </div>
              {annualSaving !== null && (
                <div className="text-sm text-green-800 bg-green-100 p-3 rounded">
                  <strong>Einsparung pro Jahr (Stunden, grob):</strong>{' '}
                  {Math.round(annualSaving)} h{' '}
                  <span className="text-xs">
                    ({estimateCasesPerYear(version.sidecar.operationalContext?.frequency).label})
                  </span>
                </div>
              )}
              {annualSaving === null && (
                <div className="text-xs text-slate-600 bg-slate-100 p-2 rounded">
                  Für Jahreshochrechnung Frequency im Operational Context setzen.
                </div>
              )}
            </div>
          </>
        )}

        {openItems.length === 0 && (
          <div className="text-sm text-slate-600 bg-slate-50 p-4 rounded">
            Keine offenen Maßnahmen vorhanden. Fügen Sie Maßnahmen aus der Bibliothek oder manuell hinzu, um eine Simulation durchzuführen.
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Filtern & Sortieren</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ansicht</label>
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as 'list' | 'by_step')}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              >
                <option value="list">Liste</option>
                <option value="by_step">Nach Schritt</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Suche</label>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Titel, Beschreibung, Verantwortlich..."
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kategorie</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as ImprovementCategory | 'all')}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              >
                <option value="all">Alle</option>
                <option value="standardize">{getCategoryLabel('standardize')}</option>
                <option value="digitize">{getCategoryLabel('digitize')}</option>
                <option value="automate">{getCategoryLabel('automate')}</option>
                <option value="ai">{getCategoryLabel('ai')}</option>
                <option value="data">{getCategoryLabel('data')}</option>
                <option value="governance">{getCategoryLabel('governance')}</option>
                <option value="customer">{getCategoryLabel('customer')}</option>
                <option value="compliance">{getCategoryLabel('compliance')}</option>
                <option value="kpi">{getCategoryLabel('kpi')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as ImprovementStatus | 'all')}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              >
                <option value="all">Alle</option>
                <option value="idea">{getStatusLabel('idea')}</option>
                <option value="planned">{getStatusLabel('planned')}</option>
                <option value="in_progress">{getStatusLabel('in_progress')}</option>
                <option value="done">{getStatusLabel('done')}</option>
                <option value="discarded">{getStatusLabel('discarded')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Scope</label>
              <select
                value={filterScope}
                onChange={(e) => setFilterScope(e.target.value as ImprovementScope | 'all')}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              >
                <option value="all">Alle</option>
                <option value="process">Prozess</option>
                <option value="step">Schritt</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Sortierung</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'priority_desc' | 'potential_desc' | 'due_asc' | 'updated_desc' | 'title_asc')}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              >
                <option value="priority_desc">Priorität (hoch → niedrig)</option>
                <option value="potential_desc">Nutzenindikator (grob)</option>
                <option value="due_asc">Fälligkeit (früh → spät)</option>
                <option value="updated_desc">Zuletzt geändert</option>
                <option value="title_asc">Titel (A → Z)</option>
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={onlyOpen}
                  onChange={(e) => setOnlyOpen(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">Nur offen</span>
              </label>
            </div>
          </div>

          <div className="text-xs text-slate-700 mb-2">
            <span className="font-medium">Kontext:</span>{' '}
            Häufigkeit = {getFrequencyLabelUi(ocFreq)} · Durchlaufzeit = {getLeadTimeLabelUi(ocLt)} · Potenzial (grob) = {processPotentialLabel}
          </div>

          {sortBy === 'potential_desc' && (
            <div className="text-xs text-slate-500 mb-2">
              Sortierung „Nutzenindikator (grob)“ = (Priorität + 5) × Potenzial (Häufigkeit×Durchlaufzeit) × Kategorie-Faktor.
              Nur als Orientierung.
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <div className="text-sm text-slate-600">
              <span className="font-medium">{visibleItems.length}</span> von <span className="font-medium">{totalCount}</span> Maßnahmen
              <span className="mx-2">·</span>
              offen: <span className="font-medium">{openCount}</span>
              <span className="mx-2">·</span>
              erledigt: <span className="font-medium">{doneCount}</span>
              <span className="mx-2">·</span>
              verworfen: <span className="font-medium">{discardedCount}</span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handleExportCsv('filtered')}
                disabled={visibleItems.length === 0}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center space-x-1"
                title="Export berücksichtigt Suche, Filter und Sortierung"
              >
                <Download size={14} />
                <span>CSV exportieren (gefiltert)</span>
              </button>
              <button
                onClick={() => handleExportCsv('all')}
                disabled={items.length === 0}
                className="px-3 py-1 text-sm bg-slate-600 text-white rounded-md hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center space-x-1"
              >
                <Download size={14} />
                <span>CSV exportieren (alle)</span>
              </button>
              <button
                onClick={handleResetFilters}
                disabled={!filtersActive}
                className="px-3 py-1 text-sm bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Filter zurücksetzen
              </button>
            </div>
          </div>
          <div className="pt-2 text-xs text-slate-500">
            Der gefilterte Export berücksichtigt Suche, Filter und Sortierung.
          </div>
        </div>
      )}

      {showSuggestions && (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Vorschläge (Assessment + Heuristiken)</h3>
          <p className="text-sm text-slate-600 mb-4">
            Wählen Sie Vorschläge aus und übernehmen Sie diese in den Backlog. Heuristiken basieren auf den erfassten Prozessdaten (z.B. manuelle Schritte, missing_data-Ausnahmen, fehlende KPIs).
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <div className="text-xs text-slate-700">
              <span className="font-medium">Kontext:</span>{' '}
              Häufigkeit = {getFrequencyLabelUi(ocFreq)} · Durchlaufzeit = {getLeadTimeLabelUi(ocLt)} · Potenzial (grob) = {processPotentialLabel}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">Sortierung</span>
              <select
                value={suggestionSortMode}
                onChange={(e) => setSuggestionSortMode(e.target.value as 'default' | 'potential_desc')}
                className="px-2 py-1 border border-slate-300 rounded-md text-xs bg-white"
              >
                <option value="default">Standard</option>
                <option value="potential_desc">Potenzial (grob)</option>
              </select>
            </div>
          </div>

          {suggestionsMeta && suggestionsMeta.total > suggestionsMeta.shown && (
            <div className="text-sm text-slate-600 mb-3">
              Es wurden {suggestionsMeta.total} Vorschläge erzeugt, angezeigt werden die ersten {suggestionsMeta.shown}.
            </div>
          )}

          {suggestions.length === 0 ? (
            <div className="text-sm text-slate-500 italic">
              Keine Vorschläge verfügbar (Assessment liefert derzeit keine Empfehlungen).
            </div>
          ) : (
            <>
              <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
                {visibleSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.key}
                    className={`p-3 bg-white border rounded-md ${
                      suggestion.duplicate
                        ? 'border-slate-300 opacity-60'
                        : 'border-blue-200'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        checked={suggestion.selected}
                        disabled={suggestion.duplicate}
                        onChange={() => handleToggleSuggestion(suggestion.key)}
                        className="mt-1 h-4 w-4"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">{suggestion.title}</div>
                        <div className="flex items-center space-x-3 mt-1 text-xs text-slate-600">
                          <span className="px-2 py-1 bg-slate-100 rounded">
                            {getCategoryLabel(suggestion.category)}
                          </span>
                          <span>{suggestion.sourceLabel}</span>
                          {suggestion.duplicate && (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded font-medium">
                              bereits vorhanden
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-blue-200">
                <button
                  onClick={() => {
                    setShowSuggestions(false);
                    setSuggestionsMeta(null);
                  }}
                  className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 font-medium"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleAddSelectedSuggestions}
                  disabled={suggestions.filter((s) => s.selected && !s.duplicate).length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-medium"
                >
                  Ausgewählte hinzufügen ({suggestions.filter((s) => s.selected && !s.duplicate).length})
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {aiGenOpen && (
        <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">KI‑Vorschläge für neue Maßnahmen</h3>
          <p className="text-sm text-slate-600 mb-4">
            Die App sendet keine Daten automatisch.
            {apiModeActive
              ? ' Standard ist Copy/Paste. API-Modus sendet nur auf Klick mit Consent.'
              : ' Kopieren Sie den Prompt manuell in Claude und fügen Sie die JSON-Antwort hier ein.'}
            {' '}Danach können Sie Vorschläge auswählen und in den Backlog übernehmen.
          </p>

          {aiGenError && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
              {aiGenError}
            </div>
          )}

          {aiGenStatus && (
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
              {aiGenStatus}
            </div>
          )}

          {aiGenWarnings.length > 0 && (
            <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm font-medium text-yellow-900 mb-1">Warnungen:</p>
              <ul className="text-xs text-yellow-800 space-y-1">
                {aiGenWarnings.map((w, idx) => (
                  <li key={idx}>• {w}</li>
                ))}
              </ul>
            </div>
          )}

          {aiGenAssumptions.length > 0 && (
            <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-md">
              <p className="text-sm font-medium text-slate-900 mb-1">Annahmen:</p>
              <ul className="text-xs text-slate-700 space-y-1">
                {aiGenAssumptions.map((a, idx) => (
                  <li key={idx}>• {a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">Prompt für Claude</label>
            <textarea
              value={aiGenPrompt}
              readOnly
              rows={8}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs font-mono bg-slate-50"
            />
            <button
              onClick={handleCopyAiGenPrompt}
              className="mt-2 px-3 py-1 bg-slate-600 text-white rounded-md hover:bg-slate-700 font-medium text-sm flex items-center space-x-1"
            >
              {aiGenPromptCopied ? <Check size={14} /> : <Copy size={14} />}
              <span>{aiGenPromptCopied ? 'Kopiert!' : 'Prompt kopieren'}</span>
            </button>
          </div>

          {apiModeActive && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h4 className="text-sm font-semibold text-blue-900 mb-3">API-Modus</h4>

              {apiEndpoint ? (
                <p className="text-xs text-blue-800 mb-2">
                  Endpoint: <span className="font-mono">{apiEndpoint}</span>
                </p>
              ) : (
                <div className="bg-yellow-50 border border-yellow-300 rounded p-2 mb-2">
                  <p className="text-xs text-yellow-800">Kein Endpoint konfiguriert. Bitte in den Einstellungen festlegen.</p>
                </div>
              )}

              <label className="flex items-start gap-2 text-xs text-blue-900 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiGenApiConsent}
                  onChange={(e) => setAiGenApiConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Ich stimme der Übertragung an den konfigurierten Endpoint zu.</span>
              </label>

              <details className="mb-3">
                <summary className="text-xs text-blue-800 cursor-pointer mb-1">Request Preview</summary>
                <pre className="text-xs bg-white border border-blue-200 rounded p-2 overflow-auto max-h-32 font-mono">
                  {aiGenApiRequestPreview}
                </pre>
              </details>

              {aiGenApiError && (
                <div className="bg-red-50 border border-red-200 rounded p-2 mb-3">
                  <p className="text-xs text-red-800">{aiGenApiError}</p>
                </div>
              )}

              <button
                onClick={handleApiSendSuggestions}
                disabled={!aiGenApiConsent || !apiEndpoint || aiGenApiRunning || !aiGenPrompt.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 text-sm transition-colors"
              >
                <Send size={14} />
                {aiGenApiRunning ? 'Sende...' : 'Per API senden (Antwort übernehmen)'}
              </button>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">JSON-Antwort von Claude</label>
            <textarea
              value={aiGenResponse}
              onChange={(e) => setAiGenResponse(e.target.value)}
              placeholder="Fügen Sie hier die JSON-Antwort von Claude ein..."
              rows={10}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs font-mono"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={handleCheckAiGenResponse}
                disabled={!aiGenResponse.trim()}
                className="px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-medium text-sm"
              >
                Antwort prüfen
              </button>
              <button
                onClick={() => {
                  setAiGenResponse('');
                  setAiGenSuggestions([]);
                  setAiGenWarnings([]);
                  setAiGenAssumptions([]);
                  setAiGenError('');
                  setAiGenStatus('Eingabe geleert.');
                }}
                className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 font-medium text-sm"
              >
                Eingabe leeren
              </button>
            </div>
          </div>

          {aiGenSuggestions.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-slate-900 mb-2">
                Vorschläge ({aiGenSuggestions.length})
              </h4>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {aiGenSuggestions.map((s) => (
                  <div
                    key={s.key}
                    className={`p-3 bg-white border rounded-md ${s.duplicate ? 'border-slate-300 opacity-60' : 'border-purple-200'}`}
                  >
                    <div className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        checked={s.selected}
                        disabled={s.duplicate}
                        onChange={() => toggleAiGenSuggestion(s.key)}
                        className="mt-1 h-4 w-4"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">{s.title}</div>

                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-600">
                          <span className="px-2 py-1 bg-slate-100 rounded">{getCategoryLabel(s.category)}</span>
                          <span className="px-2 py-1 bg-slate-100 rounded">{s.scope === 'process' ? 'Prozess' : 'Schritt'}</span>

                          {s.scope === 'step' && s.relatedStepId && (
                            <span className="px-2 py-1 bg-slate-100 rounded">
                              {stepLabelById.get(s.relatedStepId) || s.relatedStepId}
                            </span>
                          )}

                          <span className="px-2 py-1 bg-slate-100 rounded">
                            Impact {getLevelLabel(s.impact)} · Effort {getLevelLabel(s.effort)} · Risiko {getLevelLabel(s.risk)}
                          </span>

                          {s.duplicate && (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded font-medium">
                              bereits vorhanden
                            </span>
                          )}
                        </div>

                        {(s.description || s.automationBlueprint) && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-slate-600">
                              Details anzeigen
                            </summary>

                            {s.description && (
                              <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                                {s.description}
                              </div>
                            )}

                            {s.automationBlueprint && (
                              <div className="mt-2 text-xs text-slate-600">
                                <span className="font-medium">Automatisierung:</span>{' '}
                                {getApproachLabel(s.automationBlueprint.approach)} · {getAutomationLevelLabel(s.automationBlueprint.level)} ·
                                HITL: {s.automationBlueprint.humanInTheLoop ? 'Ja' : 'Nein'}
                              </div>
                            )}
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <button
              onClick={handleCloseAiGenPanel}
              className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 font-medium text-sm"
            >
              Schließen
            </button>
            <button
              onClick={handleAddSelectedAiGenSuggestions}
              disabled={aiGenSuggestions.filter((s) => s.selected && !s.duplicate).length === 0}
              className="px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-medium text-sm"
            >
              Ausgewählte hinzufügen ({aiGenSuggestions.filter((s) => s.selected && !s.duplicate).length})
            </button>
          </div>
        </div>
      )}

      {hasBlockingErrors && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <p className="text-sm text-blue-800 font-medium mb-2">
            Bitte vervollständigen Sie Pflichtfelder, bevor Sie speichern:
          </p>
          <ul className="text-sm text-blue-700 space-y-1">
            {validationErrors.map((error, idx) => (
              <li key={idx}>• {error}</li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-md p-6 text-center text-slate-600">
          Keine Maßnahmen vorhanden. Klicken Sie auf "Maßnahme hinzufügen" um zu starten.
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-md p-6 text-center text-slate-600">
          Keine Maßnahmen entsprechen den aktuellen Filterkriterien.
        </div>
      ) : viewMode === 'list' ? (
        renderItemCards(visibleItems)
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-3">
              Prozessweite Maßnahmen ({visibleItems.filter((i) => i.scope === 'process').length})
            </h3>
            {visibleItems.filter((i) => i.scope === 'process').length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-md p-4 text-sm text-slate-600">
                Keine prozessweiten Maßnahmen (aktuelle Filter).
              </div>
            ) : (
              renderItemCards(visibleItems.filter((i) => i.scope === 'process'))
            )}
          </div>

          {happyPathSteps.length === 0 ? (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-800">
              Kein Happy Path vorhanden. Schritt-Ansicht ist nicht verfügbar.
            </div>
          ) : (
            <>
              {happyPathSteps.map((step) => {
                const stepItems = visibleItems.filter(
                  (i) => i.scope === 'step' && i.relatedStepId === step.stepId
                );
                return (
                  <div key={step.stepId} className="border border-slate-300 rounded-lg p-4 bg-slate-50">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-slate-900">
                        {step.order}. {step.label} ({stepItems.length})
                      </h3>
                      <button
                        onClick={() => handleAddItemForStep(step.stepId)}
                        className="px-3 py-1 bg-slate-900 text-white rounded-md hover:bg-slate-800 font-medium text-sm"
                      >
                        Maßnahme für diesen Schritt hinzufügen
                      </button>
                    </div>
                    {stepItems.length === 0 ? (
                      <div className="bg-white border border-slate-200 rounded-md p-4 text-sm text-slate-600">
                        Keine Maßnahmen zugeordnet (aktuelle Filter).
                      </div>
                    ) : (
                      renderItemCards(stepItems)
                    )}
                  </div>
                );
              })}

              {(() => {
                const stepIdSet = new Set(happyPathSteps.map((s) => s.stepId));
                const orphanItems = visibleItems.filter(
                  (i) => i.scope === 'step' && (!i.relatedStepId || !stepIdSet.has(i.relatedStepId))
                );
                return orphanItems.length > 0 ? (
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-3">
                      Nicht zugeordnet ({orphanItems.length})
                    </h3>
                    {renderItemCards(orphanItems)}
                  </div>
                ) : null;
              })()}
            </>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || hasBlockingErrors || !hasChanges}
            className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-medium"
          >
            {saving ? 'Speichere...' : 'Änderungen speichern'}
          </button>
        </div>
      )}
    </div>
  );
}

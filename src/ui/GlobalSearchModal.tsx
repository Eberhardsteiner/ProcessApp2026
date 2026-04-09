import { useMemo, useState, useEffect, useRef, useDeferredValue } from 'react';
import type { Process, ProcessVersion, ImprovementBacklogItem } from '../domain/process';
import type { CaptureDraftStep, CaptureDraftDecision, CaptureDraftException } from '../domain/capture';
import { X } from 'lucide-react';

interface GlobalSearchModalProps {
  process: Process;
  version: ProcessVersion;
  query: string;
  setQuery: (q: string) => void;
  onClose: () => void;
  onGoToStep: (stepId: string) => void;
  onGoToDecision: (decisionId: string) => void;
  onGoToException: (exceptionId: string) => void;
  onGoToImprovement: (itemId: string) => void;
  onGoToReview: () => void;
  onGoToMiningActivity: (activityKey: string) => void;
}

interface SearchResult {
  type: 'step' | 'decision' | 'exception' | 'improvement' | 'evidence' | 'semantic' | 'importNote' | 'miningActivity' | 'catalogRole' | 'catalogSystem' | 'catalogDataObject' | 'catalogKpi';
  id: string;
  title: string;
  subtitle: string;
  snippet: string;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function HighlightedText({ text, tokens }: { text: string; tokens: string[] }) {
  const value = text ?? '';
  const cleanTokens = Array.from(
    new Set(
      (tokens || [])
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    )
  )
    .sort((a, b) => b.length - a.length)
    .slice(0, 10);

  if (!value || cleanTokens.length === 0) return <>{value}</>;

  const pattern = cleanTokens.map(escapeRegExp).join('|');
  if (!pattern) return <>{value}</>;

  const re = new RegExp(`(${pattern})`, 'ig');
  const parts = value.split(re);

  return (
    <>
      {parts.map((part, idx) =>
        idx % 2 === 1 ? (
          <mark key={idx} className="bg-yellow-100 text-slate-900 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={idx}>{part}</span>
        )
      )}
    </>
  );
}

export function GlobalSearchModal({
  version,
  query,
  setQuery,
  onClose,
  onGoToStep,
  onGoToDecision,
  onGoToException,
  onGoToImprovement,
  onGoToReview,
  onGoToMiningActivity,
}: GlobalSearchModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedEvidenceRefId, setSelectedEvidenceRefId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [selectedCatalog, setSelectedCatalog] = useState<{ kind: 'role' | 'system' | 'dataObject' | 'kpi'; id: string } | null>(null);

  const deferredQuery = useDeferredValue(query);

  const highlightTokens = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return q.split(/\s+/).filter((t) => t.length >= 2);
  }, [deferredQuery]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo<SearchResult[]>(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (q.length < 2) return [];

    const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length === 0) return [];

    function match(text: string | undefined | null): boolean {
      if (!text) return false;
      const hay = text.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    }

    const found: SearchResult[] = [];

    const draft = version.sidecar.captureDraft;
    const roles = version.sidecar.roles || [];
    const systems = version.sidecar.systems || [];
    const dataObjects = version.sidecar.dataObjects || [];
    const kpis = version.sidecar.kpis || [];

    function getRoleName(roleId: string | undefined | null): string {
      if (!roleId) return '';
      const role = roles.find((r) => r.id === roleId);
      if (!role) return '';
      return `${role.name} ${(role.aliases || []).join(' ')}`;
    }

    function getSystemName(systemId: string | undefined | null): string {
      if (!systemId) return '';
      const system = systems.find((s) => s.id === systemId);
      if (!system) return '';
      return `${system.name} ${(system.aliases || []).join(' ')}`;
    }

    function getEvidenceSnippets(evidence?: Array<{ snippet?: string; refId?: string }>): string {
      if (!evidence || !Array.isArray(evidence)) return '';
      return evidence
        .map((e) => (e.snippet || '').trim())
        .filter((s) => s.length > 0)
        .join(' ');
    }

    if (draft) {
      draft.happyPath.forEach((step: CaptureDraftStep) => {
        const haystack = [
          step.order?.toString() || '',
          step.label || '',
          step.painPointHint || '',
          step.toBeHint || '',
          getRoleName(step.roleId),
          getSystemName(step.systemId),
          getEvidenceSnippets(step.evidence),
        ].join(' ');

        if (match(haystack)) {
          found.push({
            type: 'step',
            id: step.stepId,
            title: `${step.order}. ${step.label}`,
            subtitle: 'Schritt',
            snippet: step.painPointHint || step.label || '',
          });
        }
      });

      (draft.decisions || []).forEach((decision: CaptureDraftDecision) => {
        const afterStep = draft.happyPath.find((s) => s.stepId === decision.afterStepId);
        const afterStepLabel = afterStep ? `${afterStep.order}. ${afterStep.label}` : '';

        const haystack = [
          decision.question || '',
          afterStepLabel,
          ...(decision.branches || []).map((b) => `${b.conditionLabel || ''} ${b.notes || ''}`),
          getEvidenceSnippets(decision.evidence),
        ].join(' ');

        if (match(haystack)) {
          found.push({
            type: 'decision',
            id: decision.decisionId,
            title: decision.question || '(Ohne Frage)',
            subtitle: afterStepLabel ? `Entscheidung nach ${afterStepLabel}` : 'Entscheidung',
            snippet: decision.question || '',
          });
        }
      });

      (draft.exceptions || []).forEach((exception: CaptureDraftException) => {
        const relatedStep = exception.relatedStepId
          ? draft.happyPath.find((s) => s.stepId === exception.relatedStepId)
          : null;
        const relatedStepLabel = relatedStep ? `${relatedStep.order}. ${relatedStep.label}` : '';

        const haystack = [
          exception.description || '',
          exception.handling || '',
          exception.type || '',
          relatedStepLabel,
          getEvidenceSnippets(exception.evidence),
        ].join(' ');

        if (match(haystack)) {
          found.push({
            type: 'exception',
            id: exception.exceptionId,
            title: exception.description || '(Keine Beschreibung)',
            subtitle: relatedStepLabel ? `Ausnahme bei ${relatedStepLabel}` : 'Ausnahme',
            snippet: (exception.description || '').slice(0, 120),
          });
        }
      });
    }

    const improvements = version.sidecar.improvementBacklog || [];
    improvements.forEach((item: ImprovementBacklogItem) => {
      const relatedStep =
        item.scope === 'step' && item.relatedStepId && draft
          ? draft.happyPath.find((s) => s.stepId === item.relatedStepId)
          : null;
      const relatedStepLabel = relatedStep ? `${relatedStep.order}. ${relatedStep.label}` : '';

      const haystack = [
        item.title || '',
        item.description || '',
        item.category || '',
        item.scope || '',
        item.status || '',
        item.impactEstimate?.notes || '',
        relatedStepLabel,
      ].join(' ');

      if (match(haystack)) {
        found.push({
          type: 'improvement',
          id: item.id,
          title: item.title || '(Ohne Titel)',
          subtitle: `Maßnahme (${item.category || 'unbekannt'})`,
          snippet: (item.description || '').slice(0, 120),
        });
      }
    });

    const evidenceSources = version.sidecar.evidenceSources || [];
    evidenceSources.forEach((source) => {
      const haystack = [source.refId, source.kind, source.text || ''].join(' ');

      if (match(haystack)) {
        found.push({
          type: 'evidence',
          id: source.refId,
          title: `Quelle: ${source.refId}`,
          subtitle: `Evidence (${source.kind})`,
          snippet: (source.text || '').slice(0, 120),
        });
      }
    });

    const semanticQuestions = version.quality.semanticQuestions ?? [];
    semanticQuestions.forEach((q) => {
      let stepLabel = '';
      if (q.relatedStepId && draft) {
        const step = draft.happyPath.find((s) => s.stepId === q.relatedStepId);
        if (step) {
          stepLabel = `${step.order}. ${step.label}`;
        }
      }

      const haystack = [q.question, q.answer || '', q.relatedStepHint || '', stepLabel].join(' ');

      if (match(haystack)) {
        found.push({
          type: 'semantic',
          id: q.id,
          title: q.question,
          subtitle: stepLabel ? `Semantikfrage (Schritt: ${stepLabel})` : 'Semantikfrage',
          snippet: (q.answer || q.relatedStepHint || '').slice(0, 120),
        });
      }
    });

    const importNotes = version.sidecar.aiImportNotes ?? [];
    importNotes.forEach((note) => {
      const haystack = [note.message, note.sourceRefId || ''].join(' ');

      if (match(haystack)) {
        found.push({
          type: 'importNote',
          id: note.id,
          title: note.message.slice(0, 80) + (note.message.length > 80 ? '…' : ''),
          subtitle: note.sourceRefId ? `Import-Hinweis (Ref: ${note.sourceRefId})` : 'Import-Hinweis',
          snippet: note.message.slice(0, 120),
        });
      }
    });

    const mining = version.sidecar.processMining;
    if (mining) {
      mining.activityMappings.forEach((a) => {
        const haystack = [a.example, a.activityKey].join(' ');

        if (match(haystack)) {
          found.push({
            type: 'miningActivity',
            id: a.activityKey,
            title: a.example,
            subtitle: a.stepId ? 'Mining Aktivität (gemappt)' : 'Mining Aktivität (nicht gemappt)',
            snippet: `Häufigkeit: ${a.count}`,
          });
        }
      });
    }

    roles.forEach((role) => {
      const haystack = `${role.name} ${(role.aliases || []).join(' ')}`;
      if (match(haystack)) {
        found.push({
          type: 'catalogRole',
          id: role.id,
          title: role.name,
          subtitle: 'Katalog: Rolle',
          snippet: (role.aliases || []).join(' | '),
        });
      }
    });

    systems.forEach((system) => {
      const haystack = `${system.name} ${(system.aliases || []).join(' ')}`;
      if (match(haystack)) {
        found.push({
          type: 'catalogSystem',
          id: system.id,
          title: system.name,
          subtitle: 'Katalog: System',
          snippet: (system.aliases || []).join(' | '),
        });
      }
    });

    dataObjects.forEach((obj) => {
      const haystack = `${obj.name} ${(obj.aliases || []).join(' ')}`;
      if (match(haystack)) {
        found.push({
          type: 'catalogDataObject',
          id: obj.id,
          title: obj.name,
          subtitle: 'Katalog: Datenobjekt',
          snippet: (obj.aliases || []).join(' | '),
        });
      }
    });

    kpis.forEach((kpi) => {
      const haystack = `${kpi.name} ${(kpi.aliases || []).join(' ')}`;
      if (match(haystack)) {
        found.push({
          type: 'catalogKpi',
          id: kpi.id,
          title: kpi.name,
          subtitle: 'Katalog: KPI',
          snippet: (kpi.aliases || []).join(' | '),
        });
      }
    });

    return found;
  }, [deferredQuery, version]);

  const stepResults = results.filter((r) => r.type === 'step');
  const decisionResults = results.filter((r) => r.type === 'decision');
  const exceptionResults = results.filter((r) => r.type === 'exception');
  const improvementResults = results.filter((r) => r.type === 'improvement');
  const evidenceResults = results.filter((r) => r.type === 'evidence');
  const semanticResults = results.filter((r) => r.type === 'semantic');
  const importNoteResults = results.filter((r) => r.type === 'importNote');
  const miningResults = results.filter((r) => r.type === 'miningActivity');
  const roleCatalogResults = results.filter((r) => r.type === 'catalogRole');
  const systemCatalogResults = results.filter((r) => r.type === 'catalogSystem');
  const dataObjectCatalogResults = results.filter((r) => r.type === 'catalogDataObject');
  const kpiCatalogResults = results.filter((r) => r.type === 'catalogKpi');

  const groups = [
    { key: 'steps', title: `Schritte (${stepResults.length})`, results: stepResults },
    { key: 'decisions', title: `Entscheidungen (${decisionResults.length})`, results: decisionResults },
    { key: 'exceptions', title: `Ausnahmen (${exceptionResults.length})`, results: exceptionResults },
    { key: 'improvements', title: `Maßnahmen (${improvementResults.length})`, results: improvementResults },
    { key: 'catalogRoles', title: `Katalog Rollen (${roleCatalogResults.length})`, results: roleCatalogResults },
    { key: 'catalogSystems', title: `Katalog Systeme (${systemCatalogResults.length})`, results: systemCatalogResults },
    { key: 'catalogDataObjects', title: `Katalog Datenobjekte (${dataObjectCatalogResults.length})`, results: dataObjectCatalogResults },
    { key: 'catalogKpis', title: `Katalog KPIs (${kpiCatalogResults.length})`, results: kpiCatalogResults },
    { key: 'evidence', title: `Evidence Quellen (${evidenceResults.length})`, results: evidenceResults },
    { key: 'semantic', title: `Semantikfragen (${semanticResults.length})`, results: semanticResults },
    { key: 'importNotes', title: `Import-Hinweise (${importNoteResults.length})`, results: importNoteResults },
    { key: 'mining', title: `Mining Aktivitäten (${miningResults.length})`, results: miningResults },
  ].filter((g) => g.results.length > 0);

  const flatResults = groups.flatMap((g) => g.results);

  useEffect(() => {
    setSelectedIndex(0);
  }, [deferredQuery]);

  useEffect(() => {
    if (flatResults.length === 0) return;
    if (selectedIndex >= flatResults.length) setSelectedIndex(flatResults.length - 1);
  }, [flatResults.length, selectedIndex]);

  useEffect(() => {
    const el = document.querySelector(`[data-result-index="${selectedIndex}"]`);
    if (el && 'scrollIntoView' in el) {
      (el as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (flatResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = flatResults[selectedIndex];
      if (r) handleResultClick(r);
    }
  }

  function handleResultClick(result: SearchResult) {
    if (result.type === 'step') {
      onGoToStep(result.id);
    } else if (result.type === 'decision') {
      onGoToDecision(result.id);
    } else if (result.type === 'exception') {
      onGoToException(result.id);
    } else if (result.type === 'improvement') {
      onGoToImprovement(result.id);
    } else if (result.type === 'evidence') {
      setSelectedEvidenceRefId(result.id);
      setSelectedCatalog(null);
    } else if (result.type === 'semantic') {
      const q = (version.quality.semanticQuestions ?? []).find((x) => x.id === result.id);
      if (q?.relatedStepId) {
        onGoToStep(q.relatedStepId);
      } else {
        onGoToReview();
      }
    } else if (result.type === 'importNote') {
      const note = (version.sidecar.aiImportNotes ?? []).find((n) => n.id === result.id);
      if (note?.sourceRefId) {
        const exists = (version.sidecar.evidenceSources ?? []).some((s) => s.refId === note.sourceRefId);
        if (exists) {
          setSelectedEvidenceRefId(note.sourceRefId);
          setSelectedCatalog(null);
        } else {
          onGoToReview();
        }
      } else {
        onGoToReview();
      }
    } else if (result.type === 'miningActivity') {
      onGoToMiningActivity(result.id);
    } else if (result.type === 'catalogRole') {
      setSelectedCatalog({ kind: 'role', id: result.id });
      setSelectedEvidenceRefId(null);
    } else if (result.type === 'catalogSystem') {
      setSelectedCatalog({ kind: 'system', id: result.id });
      setSelectedEvidenceRefId(null);
    } else if (result.type === 'catalogDataObject') {
      setSelectedCatalog({ kind: 'dataObject', id: result.id });
      setSelectedEvidenceRefId(null);
    } else if (result.type === 'catalogKpi') {
      setSelectedCatalog({ kind: 'kpi', id: result.id });
      setSelectedEvidenceRefId(null);
    }
  }

  const selectedEvidence = selectedEvidenceRefId
    ? (version.sidecar.evidenceSources || []).find((s) => s.refId === selectedEvidenceRefId)
    : null;

  const draft = version.sidecar.captureDraft;
  const steps = draft?.happyPath ?? [];
  const backlog = version.sidecar.improvementBacklog ?? [];

  let selectedCatalogItem: { name: string; id: string; aliases?: string[] } | null = null;
  if (selectedCatalog) {
    if (selectedCatalog.kind === 'role') {
      selectedCatalogItem = (version.sidecar.roles || []).find((r) => r.id === selectedCatalog.id) || null;
    } else if (selectedCatalog.kind === 'system') {
      selectedCatalogItem = (version.sidecar.systems || []).find((s) => s.id === selectedCatalog.id) || null;
    } else if (selectedCatalog.kind === 'dataObject') {
      selectedCatalogItem = (version.sidecar.dataObjects || []).find((d) => d.id === selectedCatalog.id) || null;
    } else if (selectedCatalog.kind === 'kpi') {
      selectedCatalogItem = (version.sidecar.kpis || []).find((k) => k.id === selectedCatalog.id) || null;
    }
  }

  if (selectedCatalog) {
    if (!selectedCatalogItem) {
      return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg border border-slate-200 w-full max-w-2xl p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Katalog Eintrag</h2>
            <p className="text-slate-600 mb-4">Eintrag nicht gefunden (evtl. gelöscht)</p>
            <button
              onClick={() => setSelectedCatalog(null)}
              className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800"
            >
              Zurück zur Suche
            </button>
          </div>
        </div>
      );
    }

    const kindLabel =
      selectedCatalog.kind === 'role'
        ? 'Rolle'
        : selectedCatalog.kind === 'system'
        ? 'System'
        : selectedCatalog.kind === 'dataObject'
        ? 'Datenobjekt'
        : 'KPI';

    let usedSteps: typeof steps = [];
    let usedStepsIn: typeof steps = [];
    let usedStepsOut: typeof steps = [];
    let usedImprovements: typeof backlog = [];

    if (selectedCatalog.kind === 'role') {
      usedSteps = steps.filter((s) => s.roleId === selectedCatalog.id);
    } else if (selectedCatalog.kind === 'system') {
      usedSteps = steps.filter((s) => s.systemId === selectedCatalog.id);
      usedImprovements = backlog.filter((i) =>
        (i.automationBlueprint?.systemIds || []).includes(selectedCatalog.id)
      );
    } else if (selectedCatalog.kind === 'dataObject') {
      usedStepsIn = steps.filter((s) => (s.dataIn || []).includes(selectedCatalog.id));
      usedStepsOut = steps.filter((s) => (s.dataOut || []).includes(selectedCatalog.id));
      usedImprovements = backlog.filter((i) =>
        (i.automationBlueprint?.dataObjectIds || []).includes(selectedCatalog.id)
      );
    } else if (selectedCatalog.kind === 'kpi') {
      usedImprovements = backlog.filter((i) =>
        (i.automationBlueprint?.kpiIds || []).includes(selectedCatalog.id)
      );
    }

    const totalUsedSteps = usedSteps.length + usedStepsIn.length + usedStepsOut.length;

    const displayAliases = selectedCatalogItem.aliases || [];
    const maxAliasDisplay = 12;
    const aliasesToShow = displayAliases.slice(0, maxAliasDisplay);
    const remainingAliases = displayAliases.length - maxAliasDisplay;

    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg border border-slate-200 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Katalog Eintrag</h2>
              <div className="text-sm text-slate-600 mt-1">{kindLabel}</div>
              <div className="text-sm font-medium text-slate-900 mt-1">{selectedCatalogItem.name}</div>
              <div className="text-xs text-slate-500 mt-1">ID: {selectedCatalogItem.id}</div>
            </div>
            <button
              onClick={() => setSelectedCatalog(null)}
              className="p-2 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          <div className="p-4">
            {displayAliases.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Aliases</h3>
                <div className="flex flex-wrap gap-2">
                  {aliasesToShow.map((alias, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded"
                    >
                      {alias}
                    </span>
                  ))}
                  {remainingAliases > 0 && (
                    <span className="px-2 py-1 bg-slate-200 text-slate-600 text-xs rounded">
                      +{remainingAliases}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Wo verwendet?</h3>
              <div className="text-sm text-slate-600 space-y-1">
                {totalUsedSteps > 0 && <div>Verwendet in Schritten: {totalUsedSteps}</div>}
                {usedImprovements.length > 0 && (
                  <div>Verwendet in Maßnahmen: {usedImprovements.length}</div>
                )}
                {totalUsedSteps === 0 && usedImprovements.length === 0 && (
                  <div className="text-slate-500">Keine Verwendung gefunden</div>
                )}
              </div>
            </div>

            {usedSteps.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Schritte</h4>
                <div className="space-y-2">
                  {usedSteps.map((step) => (
                    <button
                      key={step.stepId}
                      onClick={() => {
                        setSelectedCatalog(null);
                        onGoToStep(step.stepId);
                      }}
                      className="w-full text-left p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-sm"
                    >
                      {step.order}. {step.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {usedStepsIn.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Schritte (Input)</h4>
                <div className="space-y-2">
                  {usedStepsIn.map((step) => (
                    <button
                      key={step.stepId}
                      onClick={() => {
                        setSelectedCatalog(null);
                        onGoToStep(step.stepId);
                      }}
                      className="w-full text-left p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-sm"
                    >
                      {step.order}. {step.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {usedStepsOut.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Schritte (Output)</h4>
                <div className="space-y-2">
                  {usedStepsOut.map((step) => (
                    <button
                      key={step.stepId}
                      onClick={() => {
                        setSelectedCatalog(null);
                        onGoToStep(step.stepId);
                      }}
                      className="w-full text-left p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-sm"
                    >
                      {step.order}. {step.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {usedImprovements.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Maßnahmen</h4>
                <div className="space-y-2">
                  {usedImprovements.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSelectedCatalog(null);
                        onGoToImprovement(item.id);
                      }}
                      className="w-full text-left p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-sm"
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-4 flex justify-end">
            <button
              onClick={() => setSelectedCatalog(null)}
              className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800"
            >
              Zurück zur Suche
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (selectedEvidence) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg border border-slate-200 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Evidence Quelle</h2>
              <div className="text-sm text-slate-600 mt-1">
                {selectedEvidence.refId} ({selectedEvidence.kind})
              </div>
              {selectedEvidence.createdAt && (
                <div className="text-xs text-slate-500 mt-1">
                  Erstellt: {new Date(selectedEvidence.createdAt).toLocaleString('de-DE')}
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedEvidenceRefId(null)}
              className="p-2 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          <div className="p-4">
            <textarea
              readOnly
              value={selectedEvidence.text || '(Kein Text)'}
              className="w-full h-96 font-mono text-xs bg-slate-50 border border-slate-200 rounded-md p-3 resize-none"
            />
          </div>

          <div className="border-t border-slate-200 p-4 flex justify-end">
            <button
              onClick={() => setSelectedEvidenceRefId(null)}
              className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800"
            >
              Zurück zur Suche
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg border border-slate-200 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Globale Suche</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Suchen… (z.B. Schrittname, System, Maßnahme)"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="text-xs text-slate-500 mt-2">
            Ctrl/Cmd+K zum Öffnen, Esc zum Schließen
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {query.trim().length < 2 ? (
            <div className="text-center text-sm text-slate-600 py-8">
              Bitte mindestens 2 Zeichen eingeben
            </div>
          ) : results.length === 0 ? (
            <div className="text-center text-sm text-slate-600 py-8">Keine Treffer</div>
          ) : (
            <div className="space-y-6">
              {(() => {
                let offset = 0;
                return groups.map((g) => {
                  const base = offset;
                  offset += g.results.length;

                  return (
                    <div key={g.key}>
                      <h3 className="text-sm font-semibold text-slate-700 mb-2">{g.title}</h3>
                      <div className="space-y-2">
                        {g.results.map((result, idx) => {
                          const globalIndex = base + idx;
                          const selected = globalIndex === selectedIndex;

                          return (
                            <button
                              key={result.id}
                              data-result-index={globalIndex}
                              onClick={() => handleResultClick(result)}
                              className={
                                'w-full text-left p-3 border rounded-lg ' +
                                (selected
                                  ? 'bg-blue-50 border-blue-300'
                                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200')
                              }
                            >
                              <div className="font-medium text-slate-900 text-sm">
                                <HighlightedText text={result.title} tokens={highlightTokens} />
                              </div>
                              <div className="text-xs text-slate-600 mt-1">
                                <HighlightedText text={result.subtitle} tokens={highlightTokens} />
                              </div>
                              <div className="text-xs text-slate-500 mt-1 line-clamp-2">
                                <HighlightedText
                                  text={result.snippet.slice(0, 120)}
                                  tokens={highlightTokens}
                                />
                                {result.snippet.length > 120 ? '...' : ''}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

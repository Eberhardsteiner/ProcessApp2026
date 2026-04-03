import { useState, useEffect } from 'react';
import { Check, ChevronDown, ChevronRight, Plus, Trash2, Save } from 'lucide-react';
import type { Process, ProcessVersion } from '../../domain/process';
import type { CaptureDraftStep, CaptureDraftDecision, CaptureDraftDecisionBranch, CaptureDraftException, ExceptionType } from '../../domain/capture';
import { updateVersion } from '../../storage/repositories/versionsRepo';
import { normalizeCatalogToken } from '../../utils/catalogAliases';

interface AssistedSeedCapturePanelProps {
  process: Process;
  version: ProcessVersion;
  onSaved: (updated: ProcessVersion) => void;
}

interface SeedDecision {
  id: string;
  question: string;
  afterStepIndex: number;
}

interface SeedException {
  id: string;
  type: ExceptionType;
  description: string;
}

interface SeedState {
  trigger: string;
  customer: string;
  outcome: string;
  doneCriteria: string;
  happyPath: string[];
  roles: string[];
  systems: string[];
  dataObjects: string[];
  decisions: SeedDecision[];
  exceptions: SeedException[];
}

const EXCEPTION_TYPES: { value: ExceptionType; label: string }[] = [
  { value: 'missing_data', label: 'Fehlende Daten' },
  { value: 'timeout', label: 'Zeitüberschreitung' },
  { value: 'error', label: 'Fehler' },
  { value: 'cancellation', label: 'Abbruch' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'other', label: 'Sonstiges' },
];

function buildSummary(seed: SeedState, rolesList: string[], systemsList: string[], dataObjectsList: string[]): string {
  const parts: string[] = [];
  if (seed.happyPath.length) parts.push(`${seed.happyPath.length} Schritte`);
  if (rolesList.length) parts.push(`${rolesList.length} Rollen`);
  if (systemsList.length) parts.push(`${systemsList.length} Systeme`);
  if (dataObjectsList.length) parts.push(`${dataObjectsList.length} Datenobjekte`);
  if (seed.decisions.length) parts.push(`${seed.decisions.length} Entscheidungen`);
  if (seed.exceptions.length) parts.push(`${seed.exceptions.length} Ausnahmen`);
  return parts.length ? parts.join(', ') : 'Noch keine Vorerfassung';
}

function tokenList(csv: string): string[] {
  return csv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function uniqueByToken(a: string[]): string[] {
  const seen = new Set<string>();
  return a.filter(s => {
    const k = normalizeCatalogToken(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function loadSeedFromVersion(v: ProcessVersion): SeedState {
  const draft = v.sidecar.captureDraft;

  const stepIdToIndex = new Map<string, number>();
  (draft?.happyPath ?? []).forEach((s, i) => stepIdToIndex.set(s.stepId, i + 1));

  const decisions: SeedDecision[] = (draft?.decisions ?? [])
    .filter(d => d.question?.trim())
    .map(d => ({
      id: d.decisionId,
      question: d.question,
      afterStepIndex: stepIdToIndex.get(d.afterStepId) ?? 0,
    }));

  const exceptions: SeedException[] = (draft?.exceptions ?? [])
    .filter(e => e.description?.trim())
    .map(e => ({
      id: e.exceptionId,
      type: e.type,
      description: e.description,
    }));

  return {
    trigger: v.endToEndDefinition?.trigger ?? '',
    customer: v.endToEndDefinition?.customer ?? '',
    outcome: v.endToEndDefinition?.outcome ?? '',
    doneCriteria: v.endToEndDefinition?.doneCriteria ?? '',
    happyPath: (draft?.happyPath ?? []).map(s => s.label),
    roles: v.sidecar.roles.map(r => r.name),
    systems: v.sidecar.systems.map(s => s.name),
    dataObjects: v.sidecar.dataObjects.map(d => d.name),
    decisions,
    exceptions,
  };
}

export function AssistedSeedCapturePanel({ process: _process, version, onSaved }: AssistedSeedCapturePanelProps) {
  void _process;
  const [seed, setSeed] = useState<SeedState>(() => loadSeedFromVersion(version));
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newStep, setNewStep] = useState('');
  const [rolesCsv, setRolesCsv] = useState(() => loadSeedFromVersion(version).roles.join(', '));
  const [systemsCsv, setSystemsCsv] = useState(() => loadSeedFromVersion(version).systems.join(', '));
  const [dataObjectsCsv, setDataObjectsCsv] = useState(() => loadSeedFromVersion(version).dataObjects.join(', '));

  useEffect(() => {
    const s = loadSeedFromVersion(version);
    setSeed(s);
    setRolesCsv(s.roles.join(', '));
    setSystemsCsv(s.systems.join(', '));
    setDataObjectsCsv(s.dataObjects.join(', '));
  }, [version.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);

    const resolvedRoles = uniqueByToken(tokenList(rolesCsv));
    const resolvedSystems = uniqueByToken(tokenList(systemsCsv));
    const resolvedDataObjects = uniqueByToken(tokenList(dataObjectsCsv));

    const existingRoleMap = new Map(version.sidecar.roles.map(r => [normalizeCatalogToken(r.name), r]));
    const existingSystemMap = new Map(version.sidecar.systems.map(s => [normalizeCatalogToken(s.name), s]));
    const existingDataObjectMap = new Map(version.sidecar.dataObjects.map(d => [normalizeCatalogToken(d.name), d]));

    const newRoles = resolvedRoles.map(name => {
      const existing = existingRoleMap.get(normalizeCatalogToken(name));
      return existing ?? { id: crypto.randomUUID(), name, kind: 'role' as const };
    });
    const newSystems: import('../../domain/process').ProcessSystem[] = resolvedSystems.map(name => {
      const existing = existingSystemMap.get(normalizeCatalogToken(name));
      return existing ?? { id: crypto.randomUUID(), name };
    });
    const newDataObjects = resolvedDataObjects.map(name => {
      const existing = existingDataObjectMap.get(normalizeCatalogToken(name));
      return existing ?? { id: crypto.randomUUID(), name, kind: 'document' as const };
    });

    const existingStepMap = new Map(
      (version.sidecar.captureDraft?.happyPath ?? []).map(s => [s.label.trim().toLowerCase(), s])
    );
    const newHappyPath: CaptureDraftStep[] = seed.happyPath.map((label, i) => {
      const existing = existingStepMap.get(label.trim().toLowerCase());
      return existing
        ? { ...existing, order: i + 1 }
        : { stepId: crypto.randomUUID(), order: i + 1, label, status: 'confirmed' as const };
    });

    const stepIdByIndex = new Map(newHappyPath.map(s => [s.order, s.stepId]));

    const newDecisions: CaptureDraftDecision[] = seed.decisions
      .filter(d => d.question.trim() && d.afterStepIndex >= 1 && d.afterStepIndex <= newHappyPath.length)
      .map(d => {
        const existingDecision = version.sidecar.captureDraft?.decisions.find(ed => ed.decisionId === d.id);
        const branches: CaptureDraftDecisionBranch[] = existingDecision?.branches ?? [
          { branchId: crypto.randomUUID(), conditionLabel: 'Ja', nextStepId: stepIdByIndex.get(d.afterStepIndex + 1) },
          { branchId: crypto.randomUUID(), conditionLabel: 'Nein', endsProcess: true },
        ];
        return {
          decisionId: d.id,
          afterStepId: stepIdByIndex.get(d.afterStepIndex) ?? '',
          question: d.question.trim(),
          gatewayType: existingDecision?.gatewayType ?? 'xor',
          branches,
          status: 'confirmed' as const,
        };
      })
      .filter(d => d.afterStepId);

    const newExceptions: CaptureDraftException[] = seed.exceptions
      .filter(e => e.description.trim())
      .map(e => {
        const existing = version.sidecar.captureDraft?.exceptions.find(ex => ex.exceptionId === e.id);
        return {
          exceptionId: e.id,
          type: e.type,
          description: e.description.trim(),
          handling: existing?.handling ?? '',
          status: 'confirmed' as const,
        };
      });

    try {
      const result = await updateVersion(version.processId, version.versionId, {
        endToEndDefinition: {
          trigger: seed.trigger,
          customer: seed.customer,
          outcome: seed.outcome,
          doneCriteria: seed.doneCriteria || undefined,
        },
        sidecar: {
          ...version.sidecar,
          roles: newRoles,
          systems: newSystems,
          dataObjects: newDataObjects,
          captureDraft: {
            ...(version.sidecar.captureDraft ?? { draftVersion: 'capture-draft-v1', decisions: [], exceptions: [] }),
            happyPath: newHappyPath,
            decisions: newDecisions,
            exceptions: newExceptions,
          },
        },
      });
      setSaved(true);
      onSaved(result);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const addStep = () => {
    const cleaned = newStep.trim();
    if (!cleaned) return;
    setSeed(s => ({ ...s, happyPath: [...s.happyPath, cleaned] }));
    setNewStep('');
  };

  const removeStep = (i: number) => {
    setSeed(s => ({ ...s, happyPath: s.happyPath.filter((_, idx) => idx !== i) }));
  };

  const updateStep = (i: number, val: string) => {
    setSeed(s => {
      const hp = [...s.happyPath];
      hp[i] = val;
      return { ...s, happyPath: hp };
    });
  };

  const addDecision = () => {
    setSeed(s => ({
      ...s,
      decisions: [...s.decisions, { id: crypto.randomUUID(), question: '', afterStepIndex: s.happyPath.length > 0 ? 1 : 0 }],
    }));
  };

  const removeDecision = (id: string) => {
    setSeed(s => ({ ...s, decisions: s.decisions.filter(d => d.id !== id) }));
  };

  const updateDecision = (id: string, patch: Partial<SeedDecision>) => {
    setSeed(s => ({ ...s, decisions: s.decisions.map(d => d.id === id ? { ...d, ...patch } : d) }));
  };

  const addException = () => {
    setSeed(s => ({
      ...s,
      exceptions: [...s.exceptions, { id: crypto.randomUUID(), type: 'other' as ExceptionType, description: '' }],
    }));
  };

  const removeException = (id: string) => {
    setSeed(s => ({ ...s, exceptions: s.exceptions.filter(e => e.id !== id) }));
  };

  const updateException = (id: string, patch: Partial<SeedException>) => {
    setSeed(s => ({ ...s, exceptions: s.exceptions.map(e => e.id === id ? { ...e, ...patch } : e) }));
  };

  const rolesList = tokenList(rolesCsv);
  const systemsList = tokenList(systemsCsv);
  const dataObjectsList = tokenList(dataObjectsCsv);
  const summary = buildSummary(seed, rolesList, systemsList, dataObjectsList);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">{summary}</div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Speichere…' : saved ? 'Gespeichert' : 'Speichern'}
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">Auslöser (trigger)</label>
          <input
            type="text"
            value={seed.trigger}
            onChange={e => setSeed(s => ({ ...s, trigger: e.target.value }))}
            placeholder="Was startet den Prozess?"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">Kunde / Nutznießer</label>
          <input
            type="text"
            value={seed.customer}
            onChange={e => setSeed(s => ({ ...s, customer: e.target.value }))}
            placeholder="Wer ist der Empfänger des Ergebnisses?"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="block text-xs font-medium text-slate-700">Ergebnis (outcome)</label>
          <input
            type="text"
            value={seed.outcome}
            onChange={e => setSeed(s => ({ ...s, outcome: e.target.value }))}
            placeholder="Was ist das Ergebnis für den Kunden?"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-slate-700">Happy Path <span className="text-slate-400 font-normal">(führend – KI ergänzt, überschreibt nicht)</span></div>
        <ol className="space-y-1.5">
          {seed.happyPath.map((s, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="shrink-0 w-6 text-center text-xs font-mono text-slate-400">{i + 1}</span>
              <input
                type="text"
                value={s}
                onChange={e => updateStep(i, e.target.value)}
                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <button
                type="button"
                onClick={() => removeStep(i)}
                className="shrink-0 p-1 text-slate-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ol>
        <div className="flex gap-2">
          <input
            type="text"
            value={newStep}
            onChange={e => setNewStep(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addStep(); } }}
            placeholder="Neuen Schritt eingeben…"
            className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <button
            type="button"
            onClick={addStep}
            disabled={!newStep.trim()}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate-700">Rollen <span className="text-slate-400 font-normal">(kommagetrennt)</span></label>
        <input
          type="text"
          value={rolesCsv}
          onChange={e => setRolesCsv(e.target.value)}
          placeholder="z.B. Sachbearbeiter, Teamleitung, Prüfer"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>

      <div className="border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setOptionalOpen(o => !o)}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          {optionalOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Optionale Felder (Systeme, Datenobjekte, Entscheidungen, Ausnahmen)
        </button>

        {optionalOpen && (
          <div className="mt-3 space-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">IT-Systeme <span className="text-slate-400 font-normal">(kommagetrennt)</span></label>
              <input
                type="text"
                value={systemsCsv}
                onChange={e => setSystemsCsv(e.target.value)}
                placeholder="z.B. SAP, CRM-System, E-Mail"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Datenobjekte <span className="text-slate-400 font-normal">(kommagetrennt)</span></label>
              <input
                type="text"
                value={dataObjectsCsv}
                onChange={e => setDataObjectsCsv(e.target.value)}
                placeholder="z.B. Antrag, Vertrag, Rechnung"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Abschluss-Kriterium <span className="text-slate-400 font-normal">(optional)</span></label>
              <input
                type="text"
                value={seed.doneCriteria}
                onChange={e => setSeed(s => ({ ...s, doneCriteria: e.target.value }))}
                placeholder="Wann gilt der Prozess als abgeschlossen?"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-slate-700">Entscheidungen <span className="text-slate-400 font-normal">(nach welchem Schritt, welche Frage)</span></div>
                <button
                  type="button"
                  onClick={addDecision}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Hinzufügen
                </button>
              </div>
              {seed.decisions.length === 0 && (
                <div className="text-xs text-slate-400 italic">Noch keine Entscheidungen erfasst.</div>
              )}
              <div className="space-y-2">
                {seed.decisions.map(d => (
                  <div key={d.id} className="flex items-start gap-2 bg-slate-50 rounded-lg p-2">
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <label className="shrink-0 text-xs text-slate-500 w-20">Nach Schritt</label>
                        <input
                          type="number"
                          min={1}
                          max={seed.happyPath.length || 99}
                          value={d.afterStepIndex || ''}
                          onChange={e => updateDecision(d.id, { afterStepIndex: parseInt(e.target.value) || 0 })}
                          className="w-16 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
                          placeholder="Nr."
                        />
                        {seed.happyPath[d.afterStepIndex - 1] && (
                          <span className="text-xs text-slate-400 truncate">„{seed.happyPath[d.afterStepIndex - 1]}"</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="shrink-0 text-xs text-slate-500 w-20">Frage</label>
                        <input
                          type="text"
                          value={d.question}
                          onChange={e => updateDecision(d.id, { question: e.target.value })}
                          placeholder="Entscheidungsfrage…"
                          className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDecision(d.id)}
                      className="shrink-0 p-1 text-slate-400 hover:text-red-500 transition-colors mt-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-slate-700">Ausnahmen <span className="text-slate-400 font-normal">(Typ + Beschreibung)</span></div>
                <button
                  type="button"
                  onClick={addException}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Hinzufügen
                </button>
              </div>
              {seed.exceptions.length === 0 && (
                <div className="text-xs text-slate-400 italic">Noch keine Ausnahmen erfasst.</div>
              )}
              <div className="space-y-2">
                {seed.exceptions.map(ex => (
                  <div key={ex.id} className="flex items-start gap-2 bg-slate-50 rounded-lg p-2">
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <label className="shrink-0 text-xs text-slate-500 w-12">Typ</label>
                        <select
                          value={ex.type}
                          onChange={e => updateException(ex.id, { type: e.target.value as ExceptionType })}
                          className="px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                        >
                          {EXCEPTION_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="shrink-0 text-xs text-slate-500 w-12">Beschreibung</label>
                        <input
                          type="text"
                          value={ex.description}
                          onChange={e => updateException(ex.id, { description: e.target.value })}
                          placeholder="Was passiert und wie wird es behandelt?"
                          className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeException(ex.id)}
                      className="shrink-0 p-1 text-slate-400 hover:text-red-500 transition-colors mt-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

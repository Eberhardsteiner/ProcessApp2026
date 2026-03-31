import { useState, useMemo, useCallback, useEffect } from 'react';
import { Plus, Trash2, Check, AlertCircle, Save, RefreshCw } from 'lucide-react';
import type {
  ProcessVersion,
  ProcessMiningState,
  ProcessMiningDataset,
  MiningPreprocessingRecipe,
  MiningNoiseFilter,
  MiningMergeRule,
  MiningSplitRule,
  MiningLifecycleMode,
  MiningAttributeNormalization,
  EventLogEvent,
} from '../domain/process';
import {
  dedupeExactEvents,
  dedupeConsecutiveActivities,
  filterByTimeRange,
  renameActivities,
  countCases,
  normalizeEventAttributes,
  applyLifecycleHandling,
  mergeActivities,
  splitActivitiesByAttribute,
  filterRareActivities,
} from '../mining/eventLogTransforms';
import type { RenameRule, TransformResult } from '../mining/eventLogTransforms';
import { buildActivityStats } from '../mining/processMiningLite';
import { addMiningDataset, checkEventLogIntegrity } from '../mining/miningDatasets';
import { listPreprocessingRecipes, getPreprocessingRecipe, upsertPreprocessingRecipe, removePreprocessingRecipe } from '../mining/preprocessingRecipeStore';
import { HelpPopover } from './components/HelpPopover';

interface PreprocessingCardProps {
  version: ProcessVersion;
  processMining: ProcessMiningState;
  onSave: (patch: Partial<ProcessVersion>) => Promise<void>;
  activeDatasetEvents: EventLogEvent[];
  isActiveDatasetEventsReady: boolean;
}

function applyTransforms(
  events: import('../domain/process').EventLogEvent[],
  opts: {
    renameRules: RenameRule[];
    timeStart: string;
    timeEnd: string;
    dedupeExact: boolean;
    dedupeConsecutive: boolean;
    attrNorm?: MiningAttributeNormalization;
    lifecycleMode?: MiningLifecycleMode;
    mergeRules?: MiningMergeRule[];
    splitRules?: MiningSplitRule[];
    noiseFilter?: MiningNoiseFilter;
  },
): TransformResult {
  let current = events;
  const allWarnings: string[] = [];

  // 1) normalizeEventAttributes
  if (opts.attrNorm) {
    const r = normalizeEventAttributes(current, opts.attrNorm);
    current = r.events;
    allWarnings.push(...r.warnings);
  }

  // 2) applyLifecycleHandling
  if (opts.lifecycleMode) {
    const r = applyLifecycleHandling(current, opts.lifecycleMode);
    current = r.events;
    allWarnings.push(...r.warnings);
  }

  // 3) renameActivities
  if (opts.renameRules.some((r) => r.from.trim().length > 0)) {
    const r = renameActivities(current, opts.renameRules);
    current = r.events;
    allWarnings.push(...r.warnings);
  }

  // 4) mergeActivities
  if (opts.mergeRules && opts.mergeRules.length > 0) {
    const r = mergeActivities(current, opts.mergeRules);
    current = r.events;
    allWarnings.push(...r.warnings);
  }

  // 5) splitActivitiesByAttribute
  if (opts.splitRules && opts.splitRules.length > 0) {
    const r = splitActivitiesByAttribute(current, opts.splitRules);
    current = r.events;
    allWarnings.push(...r.warnings);
  }

  // 6) filterByTimeRange
  if (opts.timeStart || opts.timeEnd) {
    const r = filterByTimeRange(current, opts.timeStart || undefined, opts.timeEnd || undefined);
    current = r.events;
    allWarnings.push(...r.warnings);
  }

  // 7) filterRareActivities
  if (opts.noiseFilter) {
    const r = filterRareActivities(current, opts.noiseFilter);
    current = r.events;
    allWarnings.push(...r.warnings);
  }

  // 8) dedupeExactEvents
  if (opts.dedupeExact) {
    const r = dedupeExactEvents(current);
    current = r.events;
    allWarnings.push(...r.warnings);
  }

  // 9) dedupeConsecutiveActivities
  if (opts.dedupeConsecutive) {
    const r = dedupeConsecutiveActivities(current);
    current = r.events;
    allWarnings.push(...r.warnings);
  }

  return {
    events: current,
    warnings: allWarnings,
    stats: {
      beforeEvents: events.length,
      afterEvents: current.length,
      beforeCases: countCases(events),
      afterCases: countCases(current),
    },
  };
}

export function PreprocessingCard({ version, processMining, onSave, activeDatasetEvents, isActiveDatasetEventsReady }: PreprocessingCardProps) {
  const [dedupeExact, setDedupeExact] = useState(false);
  const [dedupeConsecutive, setDedupeConsecutive] = useState(false);
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [renameRules, setRenameRules] = useState<RenameRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [saveError, setSaveError] = useState('');

  // Noise filter
  const [noiseEnabled, setNoiseEnabled] = useState(false);
  const [noiseMinCount, setNoiseMinCount] = useState(10);
  const [noiseMinCoverage, setNoiseMinCoverage] = useState(0);

  // Lifecycle
  const [lifecycleMode, setLifecycleMode] = useState<MiningLifecycleMode>('off');

  // Merge
  const [mergeRules, setMergeRules] = useState<MiningMergeRule[]>([]);

  // Split
  const [splitRules, setSplitRules] = useState<MiningSplitRule[]>([]);

  // Attribute normalization
  const [attrNormEnabled, setAttrNormEnabled] = useState(false);
  const [attrNormTrimKeys, setAttrNormTrimKeys] = useState(true);
  const [attrNormLowerKeys, setAttrNormLowerKeys] = useState(false);
  const [attrNormSpacesToUnderscore, setAttrNormSpacesToUnderscore] = useState(true);
  const [attrNormTrimValues, setAttrNormTrimValues] = useState(true);
  const [attrNormDropEmpty, setAttrNormDropEmpty] = useState(true);
  const [attrInferTypes, setAttrInferTypes] = useState(false);
  const [attrNormalizeNumbers, setAttrNormalizeNumbers] = useState(true);
  const [attrNormalizeDates, setAttrNormalizeDates] = useState(true);
  const [attrDateFormat, setAttrDateFormat] = useState<'date' | 'datetime'>('date');
  const [attrEnumCase, setAttrEnumCase] = useState<'preserve' | 'lower' | 'upper'>('preserve');
  const [attrEnumMaxUnique, setAttrEnumMaxUnique] = useState(50);

  const recipes = useMemo(() => listPreprocessingRecipes(processMining), [processMining]);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');
  const [recipeName, setRecipeName] = useState<string>('');
  const [recipeMsg, setRecipeMsg] = useState<string>('');
  const [recipeErr, setRecipeErr] = useState<string>('');

  useEffect(() => {
    if (!selectedRecipeId) return;
    const r = getPreprocessingRecipe(processMining, selectedRecipeId);
    if (r) {
      setDedupeExact(!!r.recipe.dedupeExact);
      setDedupeConsecutive(!!r.recipe.dedupeConsecutive);
      setTimeStart(r.recipe.timeStart ?? '');
      setTimeEnd(r.recipe.timeEnd ?? '');
      setRenameRules((r.recipe.renameRules ?? []).map(x => ({ mode: x.mode, from: x.from, to: x.to })));

      // Noise filter
      setNoiseEnabled(!!r.recipe.noiseFilter?.enabled);
      setNoiseMinCount(r.recipe.noiseFilter?.minEventCount ?? 10);
      setNoiseMinCoverage(r.recipe.noiseFilter?.minCaseCoveragePct ?? 0);

      // Lifecycle
      setLifecycleMode(r.recipe.lifecycleMode ?? 'off');

      // Merge
      setMergeRules(r.recipe.mergeRules ?? []);

      // Split
      setSplitRules(r.recipe.splitRules ?? []);

      // Attribute normalization
      const an = r.recipe.attributeNormalization;
      setAttrNormEnabled(!!an?.enabled);
      setAttrNormTrimKeys(an?.trimKeys ?? true);
      setAttrNormLowerKeys(an?.lowerCaseKeys ?? false);
      setAttrNormSpacesToUnderscore(an?.replaceSpacesInKeys ?? true);
      setAttrNormTrimValues(an?.trimValues ?? true);
      setAttrNormDropEmpty(an?.dropEmptyAttributes ?? true);
      setAttrInferTypes(an?.inferTypes ?? false);
      setAttrNormalizeNumbers(an?.normalizeNumbers ?? true);
      setAttrNormalizeDates(an?.normalizeDates ?? true);
      setAttrDateFormat(an?.dateFormat ?? 'date');
      setAttrEnumCase(an?.enumCase ?? 'preserve');
      setAttrEnumMaxUnique(an?.enumMaxUnique ?? 50);

      setRecipeName(r.name);
    } else {
      setSelectedRecipeId('');
      setRecipeName('');
    }
  }, [selectedRecipeId, processMining]);

  const currentRecipe: MiningPreprocessingRecipe = useMemo(() => ({
    dedupeExact,
    dedupeConsecutive,
    timeStart: timeStart || undefined,
    timeEnd: timeEnd || undefined,
    renameRules: renameRules.filter(r => r.from.trim().length > 0).map(r => ({ mode: r.mode, from: r.from, to: r.to })),
    noiseFilter: noiseEnabled ? {
      enabled: true,
      minEventCount: noiseMinCount,
      minCaseCoveragePct: noiseMinCoverage > 0 ? noiseMinCoverage : undefined,
    } : undefined,
    lifecycleMode,
    mergeRules: mergeRules.filter(r => r.target.trim() && r.sources.length > 0),
    splitRules: splitRules.filter(r => r.match.trim() && r.attributeKey.trim()),
    attributeNormalization: attrNormEnabled ? {
      enabled: true,
      trimKeys: attrNormTrimKeys,
      lowerCaseKeys: attrNormLowerKeys,
      replaceSpacesInKeys: attrNormSpacesToUnderscore,
      trimValues: attrNormTrimValues,
      dropEmptyAttributes: attrNormDropEmpty,
      inferTypes: attrInferTypes,
      normalizeNumbers: attrNormalizeNumbers,
      normalizeDates: attrNormalizeDates,
      dateFormat: attrDateFormat,
      enumCase: attrEnumCase,
      enumMaxUnique: attrEnumMaxUnique,
    } : undefined,
  }), [
    dedupeExact, dedupeConsecutive, timeStart, timeEnd, renameRules,
    noiseEnabled, noiseMinCount, noiseMinCoverage,
    lifecycleMode,
    mergeRules,
    splitRules,
    attrNormEnabled, attrNormTrimKeys, attrNormLowerKeys, attrNormSpacesToUnderscore,
    attrNormTrimValues, attrNormDropEmpty, attrInferTypes, attrNormalizeNumbers,
    attrNormalizeDates, attrDateFormat, attrEnumCase, attrEnumMaxUnique,
  ]);

  const handleSaveNewRecipe = async () => {
    setRecipeErr('');
    setRecipeMsg('');
    if (!recipeName.trim()) {
      setRecipeErr('Bitte einen Namen eingeben.');
      return;
    }
    const nextPm = upsertPreprocessingRecipe(processMining, { name: recipeName, recipe: currentRecipe });
    await onSave({ sidecar: { ...version.sidecar, processMining: nextPm } });
    setRecipeMsg('Recipe gespeichert.');
    setTimeout(() => setRecipeMsg(''), 4000);
  };

  const handleUpdateRecipe = async () => {
    if (!selectedRecipeId) return;
    setRecipeErr('');
    setRecipeMsg('');
    if (!recipeName.trim()) {
      setRecipeErr('Bitte einen Namen eingeben.');
      return;
    }
    const nextPm = upsertPreprocessingRecipe(processMining, { id: selectedRecipeId, name: recipeName, recipe: currentRecipe });
    await onSave({ sidecar: { ...version.sidecar, processMining: nextPm } });
    setRecipeMsg('Recipe aktualisiert.');
    setTimeout(() => setRecipeMsg(''), 4000);
  };

  const handleDeleteRecipe = async () => {
    if (!selectedRecipeId) return;
    if (!confirm('Recipe unwiderruflich löschen?')) return;
    setRecipeErr('');
    setRecipeMsg('');
    const nextPm = removePreprocessingRecipe(processMining, selectedRecipeId);
    await onSave({ sidecar: { ...version.sidecar, processMining: nextPm } });
    setSelectedRecipeId('');
    setRecipeName('');
    setRecipeMsg('Recipe gelöscht.');
    setTimeout(() => setRecipeMsg(''), 4000);
  };

  const addRule = () => {
    setRenameRules((prev) => [...prev, { mode: 'contains', from: '', to: '' }]);
  };

  const updateRule = (idx: number, patch: Partial<RenameRule>) => {
    setRenameRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRule = (idx: number) => {
    setRenameRules((prev) => prev.filter((_, i) => i !== idx));
  };

  const hasValidRules = renameRules.some((r) => r.from.trim().length > 0);
  const hasTimeFilter = timeStart.length > 0 || timeEnd.length > 0;
  const hasValidMergeRules = mergeRules.some((r) => r.target.trim() && r.sources.length > 0);
  const hasValidSplitRules = splitRules.some((r) => r.match.trim() && r.attributeKey.trim());
  const hasAnyTransform = dedupeExact || dedupeConsecutive || hasTimeFilter || hasValidRules ||
    attrNormEnabled || lifecycleMode !== 'off' || noiseEnabled || hasValidMergeRules || hasValidSplitRules;

  const preview = useMemo(() => {
    if (!hasAnyTransform) return null;
    if (!isActiveDatasetEventsReady || activeDatasetEvents.length === 0) return null;
    return applyTransforms(activeDatasetEvents, {
      renameRules,
      timeStart,
      timeEnd,
      dedupeExact,
      dedupeConsecutive,
      attrNorm: attrNormEnabled ? {
        enabled: true,
        trimKeys: attrNormTrimKeys,
        lowerCaseKeys: attrNormLowerKeys,
        replaceSpacesInKeys: attrNormSpacesToUnderscore,
        trimValues: attrNormTrimValues,
        dropEmptyAttributes: attrNormDropEmpty,
        inferTypes: attrInferTypes,
        normalizeNumbers: attrNormalizeNumbers,
        normalizeDates: attrNormalizeDates,
        dateFormat: attrDateFormat,
        enumCase: attrEnumCase,
        enumMaxUnique: attrEnumMaxUnique,
      } : undefined,
      lifecycleMode: lifecycleMode !== 'off' ? lifecycleMode : undefined,
      mergeRules: hasValidMergeRules ? mergeRules.filter(r => r.target.trim() && r.sources.length > 0) : undefined,
      splitRules: hasValidSplitRules ? splitRules.filter(r => r.match.trim() && r.attributeKey.trim()) : undefined,
      noiseFilter: noiseEnabled ? {
        enabled: true,
        minEventCount: noiseMinCount,
        minCaseCoveragePct: noiseMinCoverage > 0 ? noiseMinCoverage : undefined,
      } : undefined,
    });
  }, [
    activeDatasetEvents, isActiveDatasetEventsReady, renameRules, timeStart, timeEnd, dedupeExact, dedupeConsecutive,
    attrNormEnabled, attrNormTrimKeys, attrNormLowerKeys, attrNormSpacesToUnderscore,
    attrNormTrimValues, attrNormDropEmpty, attrInferTypes, attrNormalizeNumbers,
    attrNormalizeDates, attrDateFormat, attrEnumCase, attrEnumMaxUnique,
    lifecycleMode, mergeRules, hasValidMergeRules, splitRules, hasValidSplitRules,
    noiseEnabled, noiseMinCount, noiseMinCoverage, hasAnyTransform,
  ]);

  const attributeSummary = useMemo(() => {
    const sourceEvents = preview?.events ?? activeDatasetEvents;
    if (sourceEvents.length === 0) return [];

    const attrMap = new Map<string, { count: number; values: Map<string, number> }>();

    sourceEvents.forEach(evt => {
      if (evt.attributes) {
        Object.keys(evt.attributes).forEach(key => {
          const val = evt.attributes![key];
          const trimmedVal = typeof val === 'string' ? val.trim() : String(val);

          if (!attrMap.has(key)) {
            attrMap.set(key, { count: 0, values: new Map() });
          }
          const entry = attrMap.get(key)!;
          entry.count++;
          entry.values.set(trimmedVal, (entry.values.get(trimmedVal) ?? 0) + 1);
        });
      }
    });

    const totalEvents = sourceEvents.length;
    const summary = Array.from(attrMap.entries()).map(([key, data]) => {
      const coveragePct = (data.count / totalEvents) * 100;
      const topValues = Array.from(data.values.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }));
      return { key, coveragePct, topValues };
    });

    summary.sort((a, b) => b.coveragePct - a.coveragePct);
    return summary.slice(0, 12);
  }, [preview, activeDatasetEvents]);

  const resetForm = useCallback(() => {
    setDedupeExact(false);
    setDedupeConsecutive(false);
    setTimeStart('');
    setTimeEnd('');
    setRenameRules([]);
    setNoiseEnabled(false);
    setNoiseMinCount(10);
    setNoiseMinCoverage(0);
    setLifecycleMode('off');
    setMergeRules([]);
    setSplitRules([]);
    setAttrNormEnabled(false);
  }, []);

  const handleSave = async () => {
    if (!preview) return;
    setSaveError('');
    setSuccessMsg('');
    const origin = (processMining.datasets ?? []).find(d => d.id === processMining.activeDatasetId) ?? null;
    const sourceTimeMode = origin?.timeMode ?? processMining.timeMode;
    if (sourceTimeMode !== 'real') {
      setSaveError(
        `Preprocessing gesperrt: Das Quell-Dataset hat ein ungültiges timeMode-Feld (${JSON.stringify(sourceTimeMode)}). Nur timeMode="real" ist zulässig.`
      );
      return;
    }
    if (!isActiveDatasetEventsReady || activeDatasetEvents.length === 0) {
      setSaveError(
        'Preprocessing gesperrt: Events des aktiven Datasets sind noch nicht geladen. Bitte warten und erneut versuchen.'
      );
      return;
    }
    if (activeDatasetEvents.length > 0) {
      const sourceIntegrity = checkEventLogIntegrity(activeDatasetEvents);
      if (!sourceIntegrity.valid) {
        setSaveError(
          `Preprocessing gesperrt: Das Quell-Dataset enthält ungültige Events. ${sourceIntegrity.summary}`
        );
        return;
      }
    }
    if (preview.events.length === 0) {
      setSaveError(
        'Preprocessing gesperrt: Die Transformation hat alle Events entfernt (0 Events übrig). ' +
        'Ein leeres Dataset kann nicht gespeichert werden. Bitte die Filter- und Transformationseinstellungen anpassen.'
      );
      return;
    }
    if (preview.events.length > 0) {
      const previewIntegrity = checkEventLogIntegrity(preview.events);
      if (!previewIntegrity.valid) {
        setSaveError(
          `Preprocessing gesperrt: Das transformierte Dataset enthält ungültige Events. ${previewIntegrity.summary}`
        );
        return;
      }
    }
    setSaving(true);
    try {
      const draftSteps = version.sidecar.captureDraft?.happyPath ?? [];
      const activityMappings = buildActivityStats(preview.events, draftSteps);

      const label = processMining.sourceLabel.length > 40
        ? `Cleaned: ${processMining.sourceLabel.slice(0, 37)}...`
        : `Cleaned: ${processMining.sourceLabel}`;

      const recipe = currentRecipe;

      const dataset: ProcessMiningDataset = {
        id: crypto.randomUUID(),
        sourceLabel: label,
        importedAt: new Date().toISOString(),
        events: preview.events,
        activityMappings,
        warnings: [...preview.warnings, `Erzeugt aus Dataset: ${processMining.sourceLabel}`],
        timeMode: origin?.timeMode ?? processMining.timeMode,
        provenance: {
          kind: 'transform',
          method: 'preprocessing',
          createdAt: new Date().toISOString(),
          createdFromDatasetId: processMining.activeDatasetId,
          createdFromLabel: processMining.sourceLabel,
          recipe,
          recipeId: selectedRecipeId || undefined,
          recipeName: selectedRecipeId ? (recipeName.trim() || undefined) : undefined,
        },
        settings: origin?.settings
          ? { ...origin.settings, workspaceView: 'preprocessing' }
          : { workspaceView: 'preprocessing' },
      };

      const next = addMiningDataset(processMining, dataset, true);
      await onSave({ sidecar: { ...version.sidecar, processMining: next } });
      resetForm();
      setSuccessMsg('Neues Dataset gespeichert und aktiviert.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? `Speichern fehlgeschlagen: ${err.message}`
          : 'Speichern fehlgeschlagen: Unbekannter Fehler.'
      );
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString('de-DE');

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-lg font-semibold text-slate-900">Aufbereitung</h3>
        <HelpPopover helpKey="mining.preprocessing" ariaLabel="Hilfe: Aufbereitung" />
      </div>
      <p className="text-xs text-slate-500 mb-5">
        Bereinigt das aktive Dataset. Ergebnis wird als neues Dataset gespeichert, das Original bleibt unverändert.
      </p>

      {!isActiveDatasetEventsReady && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Events werden aus IndexedDB geladen – bitte warten, bevor Sie Transformationen anwenden.
        </div>
      )}

      <div className="space-y-5">
        <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">Recipes</span>
            <HelpPopover helpKey="mining.preprocessing.recipes" ariaLabel="Hilfe: Recipes" />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={selectedRecipeId}
              onChange={(e) => {
                setSelectedRecipeId(e.target.value);
                setRecipeErr('');
                setRecipeMsg('');
              }}
              className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 rounded text-sm bg-white"
            >
              <option value="">(kein Recipe)</option>
              {recipes.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <input
              type="text"
              value={recipeName}
              onChange={(e) => { setRecipeName(e.target.value); setRecipeErr(''); }}
              placeholder="Recipe-Name"
              className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 rounded text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1">
              <button
                onClick={handleSaveNewRecipe}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors"
                title="Als neues Recipe speichern"
              >
                <Save className="w-3.5 h-3.5" />
                Speichern
              </button>
              <HelpPopover helpKey="mining.preprocessing.recipe.save" ariaLabel="Hilfe: Recipe speichern" />
            </div>
            {selectedRecipeId && (
              <>
                <div className="inline-flex items-center gap-1">
                  <button
                    onClick={handleUpdateRecipe}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors"
                    title="Recipe aktualisieren"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Aktualisieren
                  </button>
                  <HelpPopover helpKey="mining.preprocessing.recipe.update" ariaLabel="Hilfe: Recipe aktualisieren" />
                </div>
                <div className="inline-flex items-center gap-1">
                  <button
                    onClick={handleDeleteRecipe}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-300 rounded hover:bg-red-50 transition-colors"
                    title="Recipe löschen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Löschen
                  </button>
                  <HelpPopover helpKey="mining.preprocessing.recipe.delete" ariaLabel="Hilfe: Recipe löschen" />
                </div>
              </>
            )}
          </div>

          {recipeErr && (
            <div className="flex items-center gap-2 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {recipeErr}
            </div>
          )}
          {recipeMsg && (
            <div className="flex items-center gap-2 text-xs text-emerald-700">
              <Check className="w-3.5 h-3.5 flex-shrink-0" />
              {recipeMsg}
            </div>
          )}
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={attrNormEnabled}
                onChange={(e) => setAttrNormEnabled(e.target.checked)}
                className="accent-slate-700"
              />
              <span className="text-sm font-medium text-slate-700">Attribut-Normalisierung</span>
            </label>
            <HelpPopover helpKey="mining.preprocessing.attrnorm" ariaLabel="Hilfe: Attribut-Normalisierung" />
          </div>

          {attrNormEnabled && (
            <div className="space-y-2 pl-6 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={attrNormTrimKeys} onChange={(e) => setAttrNormTrimKeys(e.target.checked)} className="accent-slate-700" />
                  <span className="text-xs text-slate-600">Schlüssel trimmen</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={attrNormLowerKeys} onChange={(e) => setAttrNormLowerKeys(e.target.checked)} className="accent-slate-700" />
                  <span className="text-xs text-slate-600">Schlüssel in Kleinbuchstaben</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={attrNormSpacesToUnderscore} onChange={(e) => setAttrNormSpacesToUnderscore(e.target.checked)} className="accent-slate-700" />
                  <span className="text-xs text-slate-600">Leerzeichen → _</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={attrNormTrimValues} onChange={(e) => setAttrNormTrimValues(e.target.checked)} className="accent-slate-700" />
                  <span className="text-xs text-slate-600">Werte trimmen</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={attrNormDropEmpty} onChange={(e) => setAttrNormDropEmpty(e.target.checked)} className="accent-slate-700" />
                  <span className="text-xs text-slate-600">Leere Attribute entfernen</span>
                </label>
              </div>
              <div className="pt-2 border-t border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={attrInferTypes} onChange={(e) => setAttrInferTypes(e.target.checked)} className="accent-slate-700" />
                  <span className="text-xs text-slate-600">Typen inferieren & normalisieren</span>
                </label>
                {attrInferTypes && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={attrNormalizeNumbers} onChange={(e) => setAttrNormalizeNumbers(e.target.checked)} className="accent-slate-700" />
                      <span className="text-xs text-slate-600">Zahlen normalisieren</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={attrNormalizeDates} onChange={(e) => setAttrNormalizeDates(e.target.checked)} className="accent-slate-700" />
                      <span className="text-xs text-slate-600">Datumswerte normalisieren</span>
                    </label>
                    {attrNormalizeDates && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Format:</span>
                        <select value={attrDateFormat} onChange={(e) => setAttrDateFormat(e.target.value as 'date' | 'datetime')} className="px-2 py-1 border border-slate-300 rounded text-xs">
                          <option value="date">Datum (YYYY-MM-DD)</option>
                          <option value="datetime">Datum+Uhrzeit (ISO)</option>
                        </select>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Enum-Schreibweise:</span>
                      <select value={attrEnumCase} onChange={(e) => setAttrEnumCase(e.target.value as 'preserve' | 'lower' | 'upper')} className="px-2 py-1 border border-slate-300 rounded text-xs">
                        <option value="preserve">beibehalten</option>
                        <option value="lower">klein</option>
                        <option value="upper">groß</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Max. eindeutige Werte:</span>
                      <input type="number" value={attrEnumMaxUnique} onChange={(e) => setAttrEnumMaxUnique(Number(e.target.value))} className="w-20 px-2 py-1 border border-slate-300 rounded text-xs" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">Lifecycle</span>
            <HelpPopover helpKey="mining.preprocessing.lifecycle" ariaLabel="Hilfe: Lifecycle" />
          </div>
          <select value={lifecycleMode} onChange={(e) => setLifecycleMode(e.target.value as MiningLifecycleMode)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm">
            <option value="off">Aus</option>
            <option value="keep_complete">Start entfernen (Complete bevorzugen)</option>
            <option value="keep_start">Complete entfernen (Start bevorzugen)</option>
            <option value="strip_suffix">Suffixe entfernen (Start/Complete)</option>
          </select>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={noiseEnabled}
                onChange={(e) => setNoiseEnabled(e.target.checked)}
                className="accent-slate-700"
              />
              <span className="text-sm font-medium text-slate-700">Noise-Filter</span>
            </label>
            <HelpPopover helpKey="mining.preprocessing.noise" ariaLabel="Hilfe: Noise-Filter" />
          </div>

          {noiseEnabled && (
            <div className="space-y-2 pl-6">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-600 w-32">Min. Event-Anzahl:</label>
                <input type="number" value={noiseMinCount} onChange={(e) => setNoiseMinCount(Number(e.target.value))} className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-600 w-32">Min. Abdeckung (0–1):</label>
                  <input type="number" step="0.01" value={noiseMinCoverage} onChange={(e) => setNoiseMinCoverage(Number(e.target.value))} className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm" />
                </div>
                <div className="text-xs text-slate-500 pl-32 mt-1">Beispiel: 0,05 = 5% der Cases</div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-slate-700">Merge</span>
            <HelpPopover helpKey="mining.preprocessing.merge" ariaLabel="Hilfe: Merge" />
          </div>

          {mergeRules.length > 0 && (
            <div className="space-y-2 mb-3">
              {mergeRules.map((rule, idx) => (
                <div key={idx} className="space-y-2 p-2 bg-white rounded border border-slate-200">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={rule.target}
                      onChange={(e) => {
                        const newRules = [...mergeRules];
                        newRules[idx] = { ...newRules[idx], target: e.target.value };
                        setMergeRules(newRules);
                      }}
                      placeholder="Zielname"
                      className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-sm"
                    />
                    <select
                      value={rule.mode}
                      onChange={(e) => {
                        const newRules = [...mergeRules];
                        newRules[idx] = { ...newRules[idx], mode: e.target.value as 'equals' | 'contains' };
                        setMergeRules(newRules);
                      }}
                      className="px-2 py-1.5 border border-slate-300 rounded text-sm w-28"
                    >
                      <option value="contains">enthält</option>
                      <option value="equals">gleich</option>
                    </select>
                    <button
                      onClick={() => setMergeRules(mergeRules.filter((_, i) => i !== idx))}
                      className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                      title="Regel entfernen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={rule.sources.join('\n')}
                    onChange={(e) => {
                      const newRules = [...mergeRules];
                      const sources = e.target.value.split(/[\n,]+/).map(s => s.trim()).filter(s => s);
                      newRules[idx] = { ...newRules[idx], sources };
                      setMergeRules(newRules);
                    }}
                    placeholder="Quellnamen (je Zeile oder kommagetrennt)"
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                    rows={3}
                  />
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setMergeRules([...mergeRules, { target: '', mode: 'contains', sources: [] }])}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Merge-Regel hinzufügen
          </button>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-slate-700">Split nach Attribut</span>
            <HelpPopover helpKey="mining.preprocessing.split" ariaLabel="Hilfe: Split nach Attribut" />
          </div>

          {splitRules.length > 0 && (
            <div className="space-y-2 mb-3">
              {splitRules.map((rule, idx) => (
                <div key={idx} className="space-y-2 p-2 bg-white rounded border border-slate-200">
                  <div className="flex items-center gap-2">
                    <select
                      value={rule.mode}
                      onChange={(e) => {
                        const newRules = [...splitRules];
                        newRules[idx] = { ...newRules[idx], mode: e.target.value as 'equals' | 'contains' };
                        setSplitRules(newRules);
                      }}
                      className="px-2 py-1.5 border border-slate-300 rounded text-sm w-28"
                    >
                      <option value="contains">enthält</option>
                      <option value="equals">gleich</option>
                    </select>
                    <input
                      type="text"
                      value={rule.match}
                      onChange={(e) => {
                        const newRules = [...splitRules];
                        newRules[idx] = { ...newRules[idx], match: e.target.value };
                        setSplitRules(newRules);
                      }}
                      placeholder="Match (Aktivitätsname)"
                      className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-sm"
                    />
                    <button
                      onClick={() => setSplitRules(splitRules.filter((_, i) => i !== idx))}
                      className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                      title="Regel entfernen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={rule.attributeKey}
                      onChange={(e) => {
                        const newRules = [...splitRules];
                        newRules[idx] = { ...newRules[idx], attributeKey: e.target.value };
                        setSplitRules(newRules);
                      }}
                      placeholder="Attribut-Key"
                      className="px-2 py-1.5 border border-slate-300 rounded text-sm"
                    />
                    <input
                      type="text"
                      value={rule.separator ?? ' · '}
                      onChange={(e) => {
                        const newRules = [...splitRules];
                        newRules[idx] = { ...newRules[idx], separator: e.target.value };
                        setSplitRules(newRules);
                      }}
                      placeholder="Trennzeichen"
                      className="px-2 py-1.5 border border-slate-300 rounded text-sm"
                    />
                    <input
                      type="text"
                      value={rule.prefix ?? ''}
                      onChange={(e) => {
                        const newRules = [...splitRules];
                        newRules[idx] = { ...newRules[idx], prefix: e.target.value };
                        setSplitRules(newRules);
                      }}
                      placeholder="Präfix (optional)"
                      className="px-2 py-1.5 border border-slate-300 rounded text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setSplitRules([...splitRules, { mode: 'contains', match: '', attributeKey: '', separator: ' · ' }])}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Split-Regel hinzufügen
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dedupeExact}
              onChange={(e) => setDedupeExact(e.target.checked)}
              className="accent-slate-700"
            />
            <span className="text-sm font-medium text-slate-700">Exakte Duplikate entfernen</span>
            <HelpPopover helpKey="mining.preprocessing.dedupeExact" ariaLabel="Hilfe: Exakte Duplikate" />
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dedupeConsecutive}
              onChange={(e) => setDedupeConsecutive(e.target.checked)}
              className="accent-slate-700"
            />
            <span className="text-sm font-medium text-slate-700">Konsekutive Duplikate entfernen</span>
            <HelpPopover helpKey="mining.preprocessing.dedupeConsecutive" ariaLabel="Hilfe: Konsekutive Duplikate" />
          </label>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-slate-700">Zeitfenster</span>
            <HelpPopover helpKey="mining.preprocessing.timeRange" ariaLabel="Hilfe: Zeitfenster" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Start</label>
              <input
                type="datetime-local"
                value={timeStart}
                onChange={(e) => setTimeStart(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Ende</label>
              <input
                type="datetime-local"
                value={timeEnd}
                onChange={(e) => setTimeEnd(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
              />
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-slate-700">Aktivitäten umbenennen</span>
            <HelpPopover helpKey="mining.preprocessing.rename" ariaLabel="Hilfe: Umbenennen" />
          </div>

          {renameRules.length > 0 && (
            <div className="space-y-2 mb-3">
              {renameRules.map((rule, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={rule.mode}
                    onChange={(e) => updateRule(idx, { mode: e.target.value as 'contains' | 'equals' })}
                    className="px-2 py-1.5 border border-slate-300 rounded text-sm w-28 flex-shrink-0"
                  >
                    <option value="contains">enthält</option>
                    <option value="equals">gleich</option>
                  </select>
                  <input
                    type="text"
                    value={rule.from}
                    onChange={(e) => updateRule(idx, { from: e.target.value })}
                    placeholder="Von"
                    className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 rounded text-sm"
                  />
                  <input
                    type="text"
                    value={rule.to}
                    onChange={(e) => updateRule(idx, { to: e.target.value })}
                    placeholder="Nach"
                    className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 rounded text-sm"
                  />
                  <button
                    onClick={() => removeRule(idx)}
                    className="p-1.5 text-slate-400 hover:text-red-600 transition-colors flex-shrink-0"
                    title="Regel entfernen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={addRule}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Regel hinzufügen
          </button>
        </div>

        {preview && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div className="text-slate-600">
                Vorher: <span className="font-medium text-slate-900">{fmt(preview.stats.beforeEvents)} Events</span> / <span className="font-medium text-slate-900">{fmt(preview.stats.beforeCases)} Cases</span>
              </div>
              <div className="text-slate-600">
                Nachher (Vorschau): <span className="font-medium text-slate-900">{fmt(preview.stats.afterEvents)} Events</span> / <span className="font-medium text-slate-900">{fmt(preview.stats.afterCases)} Cases</span>
              </div>
            </div>

            {preview.warnings.length > 0 && (
              <div className="flex items-start gap-2 text-xs text-amber-700">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <div>
                  {preview.warnings.slice(0, 5).map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                  {preview.warnings.length > 5 && (
                    <div className="text-slate-500">...und {preview.warnings.length - 5} weitere</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {attributeSummary.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-slate-700 mb-3">
              Attribute {preview ? '(Vorschau)' : '(Original)'}
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-300">
                    <th className="text-left py-2 px-2 font-medium text-slate-600">Attribut</th>
                    <th className="text-right py-2 px-2 font-medium text-slate-600">Abdeckung</th>
                    <th className="text-left py-2 px-2 font-medium text-slate-600">Häufigste Werte</th>
                  </tr>
                </thead>
                <tbody>
                  {attributeSummary.map((attr, idx) => (
                    <tr key={idx} className="border-b border-slate-200 last:border-0">
                      <td className="py-2 px-2 text-slate-700 font-mono">{attr.key}</td>
                      <td className="py-2 px-2 text-right text-slate-600">
                        {attr.coveragePct.toFixed(1)}%
                      </td>
                      <td className="py-2 px-2 text-slate-600">
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {attr.topValues.map((tv, vidx) => (
                            <span key={vidx} className="whitespace-nowrap">
                              <span className="text-slate-700">{tv.value}</span>
                              <span className="text-slate-400 ml-1">({tv.count})</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {attributeSummary.length === 12 && (
              <p className="text-xs text-slate-500 mt-2">Zeigt die Top 12 Attribute nach Abdeckung</p>
            )}
          </div>
        )}

        {attributeSummary.length === 0 && (preview || activeDatasetEvents.length > 0) && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-slate-700 mb-2">
              Attribute {preview ? '(Vorschau)' : '(Original)'}
            </h4>
            <p className="text-xs text-slate-500">Keine Attribute gefunden.</p>
          </div>
        )}

        {saveError && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {saveError}
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
            <Check className="w-4 h-4 flex-shrink-0" />
            {successMsg}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={!hasAnyTransform || saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Speichern...' : 'Als neues Dataset speichern'}
        </button>
      </div>
    </div>
  );
}

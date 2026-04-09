import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { FileText, Upload, Trash2, Search, Copy, Check, AlertCircle, Info, Download, ArrowDownUp, RefreshCw, Pencil, X, CopyPlus, PlusCircle, Users, MoreVertical, Sparkles } from 'lucide-react';
import type { Process, ProcessVersion, ProcessMiningActivityMapping, ProcessMiningDataset, ProcessMiningState, ImprovementBacklogItem, ImprovementCategory, Level3, MiningSlaRule, MiningWorkspaceView, ProcessMiningDatasetSettings, EventLogEvent } from '../domain/process';
import type { CaptureDraft, CaptureDraftStep, StepLeadTimeBucket, StepLevelBucket } from '../domain/capture';
import type { AppSettings } from '../settings/appSettings';
import { parseCsvText } from '../import/csv';
import {
  detectEventLogColumns,
  parseEventLogFromCsv,
  buildActivityStats,
  computeVariants,
  computeConformance,
  computeStepMetrics,
  computeStepEnhancement,
  formatDurationShort,
  buildCaseIndex,
  computeEventLogQuality,
  normalizeActivityKey,
} from '../mining/processMiningLite';
import type { StepEnhancementMetric, ConformanceResult } from '../mining/processMiningLite';
import { leadTimeBucketFromMs, volumeBucketFromCoverage, reworkBucketFromPct } from '../mining/stepBucketSuggest';
import { buildConformanceDriverAnalysis } from '../mining/conformanceDrivers';
import { computeAlignmentConformance } from '../mining/alignmentConformance';
import type { AlignmentConformanceResult } from '../mining/alignmentConformance';
import { computeAttributeSignals } from '../mining/attributeSignals';
import type { AttributeSignalsResult } from '../mining/attributeSignals';
import { computeBpmnConformance } from '../mining/bpmnConformance';
import type { BpmnConformanceResult } from '../mining/bpmnConformance';
import { computeDraftTransitionConformance } from '../mining/draftTransitionConformance';
import type { DraftTransitionConformanceResult } from '../mining/draftTransitionConformance';
import { suggestMappingsForActivities } from '../mining/mappingAssistant';
import { filterEventsBySegment } from '../mining/segmentFilter';
import type { SegmentFilter } from '../mining/segmentFilter';
import { buildDirectlyFollowsGraph } from '../mining/discoveryDfg';
import type { BuildDfgResult } from '../mining/discoveryDfg';
import { deriveDraftFromTopVariant, deriveDraftFromDfgHeuristics } from '../mining/discoveryToDraft';
import { runMiningTask } from '../mining/miningWorkerClient';
import type { DeriveResult, DeriveDfgResult } from '../mining/discoveryToDraft';
import { buildBpmnXmlFromDraft } from '../bpmn/exportBpmn';
import { BpmnViewerModal } from './BpmnViewerModal';

import { buildXesXml, sanitizeFilenameBase } from '../export/xesExport';
import { downloadTextFile } from '../utils/downloadTextFile';
import { normalizeAiEventLogToProcessMining } from '../ai/aiEventLog';
import { parseXesXmlToAiEventLog } from '../import/xesImport';
import { computeEventLogStats } from '../mining/eventLogStats';
import { detectToolHistoryColumns, parseToolHistoryCsvToAiEventLog, parseToolHistoryHtmlToAiEventLog } from '../import/toolHistoryEventLog';
import type { ToolHistoryKind, ToolHistoryFilterMode } from '../import/toolHistoryEventLog';
import { normalizeProcessMiningState, addMiningDataset, setActiveMiningDataset, renameMiningDataset, removeMiningDataset, updateActiveMiningDataset, updateActiveMiningDatasetSettings, checkEventLogIntegrity } from '../mining/miningDatasets';
import { maybeExternalizeEvents } from '../mining/externalizeEvents';
import { sweepOrphanedEventBlobs } from '../storage/eventBlobLifecycle';
import { HelpPopover } from './components/HelpPopover';
import { CollapsibleCard } from './components/CollapsibleCard';
import { GuideCallout } from './components/GuideCallout';
import { PreprocessingCard } from './PreprocessingCard';
import { computeCaseDurationStats, computeTransitionPerformance, buildHistogramBins } from '../mining/performanceAnalytics';
import { evaluateSlaRules } from '../mining/slaEvaluator';
import { computeOrganizationAnalytics } from '../mining/organizationAnalytics';
import type { OrganizationAnalyticsResult } from '../mining/organizationAnalytics';
import { computeWorkloadAnalytics } from '../mining/workloadAnalytics';
import type { WorkloadAnalyticsResult } from '../mining/workloadAnalytics';
import { computeRootCauseSignals } from '../mining/rootCauseAnalytics';
import type { RootCauseResult, RootCauseThresholdMode } from '../mining/rootCauseAnalytics';
import { computeDriftProfile, computeShareDeltas, computeDistributionDistance } from '../mining/driftAnalytics';
import type { DriftCompareMode, DriftProfile } from '../mining/driftAnalytics';
import { sliceByCaseStartMonth, sliceByCaseStartQuarter } from '../mining/timeSlicing';

type MiningView = MiningWorkspaceView;

const HEAVY_DFG_THRESHOLD = 80000;
const HEAVY_VARIANTS_THRESHOLD = 80000;
const HEAVY_DURATION_THRESHOLD = 80000;
const HEAVY_ALIGNMENT_THRESHOLD = 60000;

interface CreateVersionFromMiningPayload {
  titleSuffix: string;
  draft: CaptureDraft;
  bpmnXml: string;
  processMining?: ProcessMiningState;
}

interface ProcessMiningLitePanelProps {
  process: Process;
  version: ProcessVersion;
  onSave: (patch: Partial<ProcessVersion>) => Promise<void>;
  mappingSearchPreset?: string;
  onConsumedMappingSearchPreset?: () => void;
  settings: AppSettings;
  onGoToImprovement?: (itemId: string) => void;
  onCreateVersionFromMining?: (payload: CreateVersionFromMiningPayload) => Promise<void>;
  miningView?: MiningWorkspaceView;
  onMiningViewChange?: (view: MiningWorkspaceView) => void;
}

export function ProcessMiningLitePanel({ process, version, onSave, mappingSearchPreset, onConsumedMappingSearchPreset, settings, onGoToImprovement, onCreateVersionFromMining, miningView: externalMiningView, onMiningViewChange }: ProcessMiningLitePanelProps) {
  const isAssisted = settings.uiMode === 'assisted';
  const prepareDatasetWithExternalization = useCallback(async (dataset: ProcessMiningDataset): Promise<ProcessMiningDataset> => {
    const externalizeEnabled = settings.processMining?.externalizeEvents ?? false;
    const externalizeThreshold = settings.processMining?.externalizeThreshold ?? 150000;

    if (!externalizeEnabled || dataset.events.length < externalizeThreshold) {
      return dataset;
    }

    const result = await maybeExternalizeEvents({
      datasetId: dataset.id,
      events: dataset.events,
      enabled: externalizeEnabled,
      threshold: externalizeThreshold,
    });

    return {
      ...dataset,
      events: result.events,
      eventsRef: result.eventsRef,
    };
  }, [settings.processMining]);

  const [importing, setImporting] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [selectedCaseCol, setSelectedCaseCol] = useState<number>(-1);
  const [selectedActivityCol, setSelectedActivityCol] = useState<number>(-1);
  const [selectedTimestampCol, setSelectedTimestampCol] = useState<number>(-1);
  const [selectedResourceCol, setSelectedResourceCol] = useState<number>(-1);
  const [sourceLabel, setSourceLabel] = useState<string>('Event Log');
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [importError, setImportError] = useState<string>('');

  const [mappingSearch, setMappingSearch] = useState<string>('');
  const [localMappings, setLocalMappings] = useState<ProcessMiningActivityMapping[]>([]);
  const [savingMapping, setSavingMapping] = useState(false);
  const [showMappingAssistant, setShowMappingAssistant] = useState(false);
  const [caseSearch, setCaseSearch] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [dfgMode, setDfgMode] = useState<'activity' | 'step'>('activity');
  const [minEdgeCount, setMinEdgeCount] = useState<number>(5);
  const [maxNodes, setMaxNodes] = useState<number>(30);
  const [dfgHeatMetric, setDfgHeatMetric] = useState<'median' | 'p95'>('median');
  const [discoveryPreset, setDiscoveryPreset] = useState<'overview' | 'balanced' | 'detailed'>('balanced');
  const [dfgWorkerResult, setDfgWorkerResult] = useState<BuildDfgResult | null>(null);
  const [dfgWorkerStatus, setDfgWorkerStatus] = useState<'idle' | 'computing' | 'error'>('idle');
  const [dfgWorkerError, setDfgWorkerError] = useState<string>('');
  const [variantsWorker, setVariantsWorker] = useState<Array<{variant:string; count:number; share:number}> | null>(null);
  const [variantsWorkerStatus, setVariantsWorkerStatus] = useState<'idle' | 'computing' | 'error'>('idle');
  const [variantsWorkerError, setVariantsWorkerError] = useState<string>('');
  const [caseDurationWorker, setCaseDurationWorker] = useState<ReturnType<typeof computeCaseDurationStats> | null>(null);
  const [caseDurationWorkerStatus, setCaseDurationWorkerStatus] = useState<'idle' | 'computing' | 'error'>('idle');
  const [caseDurationWorkerError, setCaseDurationWorkerError] = useState<string>('');
  const [alignmentWorkerA, setAlignmentWorkerA] = useState<ReturnType<typeof computeAlignmentConformance> | null>(null);
  const [alignmentWorkerStatusA, setAlignmentWorkerStatusA] = useState<'idle' | 'computing' | 'error'>('idle');
  const [alignmentWorkerErrorA, setAlignmentWorkerErrorA] = useState<string>('');
  const [alignmentWorkerB, setAlignmentWorkerB] = useState<ReturnType<typeof computeAlignmentConformance> | null>(null);
  const [alignmentWorkerStatusB, setAlignmentWorkerStatusB] = useState<'idle' | 'computing' | 'error'>('idle');
  const [alignmentWorkerErrorB, setAlignmentWorkerErrorB] = useState<string>('');

  const eventsRuntimeCacheRef = useRef<Map<string, EventLogEvent[]>>(new Map());
  const [eventsLoadTrigger, setEventsLoadTrigger] = useState(0);
  const [eventsLoadError, setEventsLoadError] = useState<string | null>(null);
  const [driftDatasetsLoadError, setDriftDatasetsLoadError] = useState<string | null>(null);
  const [timesliceTrendLoadError, setTimesliceTrendLoadError] = useState<string | null>(null);

  const [discoveryDeriveResult, setDiscoveryDeriveResult] = useState<DeriveResult | null>(null);
  const [discoveryBpmnXml, setDiscoveryBpmnXml] = useState<string | null>(null);
  const [discoveryBpmnWarnings, setDiscoveryBpmnWarnings] = useState<string[]>([]);
  const [discoveryBpmnModalOpen, setDiscoveryBpmnModalOpen] = useState(false);
  const [creatingVersionFromMining, setCreatingVersionFromMining] = useState(false);
  const [createVersionError, setCreateVersionError] = useState<string | null>(null);

  type DiscoveryDeriveMode = 'top_variant' | 'dfg_xor' | 'dfg_xor_and';
  const [discoveryMode, setDiscoveryMode] = useState<DiscoveryDeriveMode>(() => {
    return (localStorage.getItem('pm.discovery.mode') as DiscoveryDeriveMode) || 'top_variant';
  });
  const [discoveryMinEdgeShare, setDiscoveryMinEdgeShare] = useState<number>(() => {
    return parseFloat(localStorage.getItem('pm.discovery.minEdgeShare') || '0.02');
  });
  const [discoveryMaxExtraBranches, setDiscoveryMaxExtraBranches] = useState<number>(() => {
    return parseInt(localStorage.getItem('pm.discovery.maxExtraBranches') || '3', 10);
  });
  const [discoveryIncludeLoops, setDiscoveryIncludeLoops] = useState<boolean>(() => {
    return localStorage.getItem('pm.discovery.includeLoops') === 'true';
  });
  const [discoveryRestrictToTopPath, setDiscoveryRestrictToTopPath] = useState<boolean>(() => {
    const v = localStorage.getItem('pm.discovery.restrictToTopPath');
    return v === null ? true : v === 'true';
  });
  const [discoveryMaxSteps, setDiscoveryMaxSteps] = useState<number>(() => {
    return parseInt(localStorage.getItem('pm.discovery.maxSteps') || '80', 10);
  });
  const [discoveryMinNodeCoverage, setDiscoveryMinNodeCoverage] = useState<number>(() => {
    return parseFloat(localStorage.getItem('pm.discovery.minNodeCoverage') || '0');
  });

  const [alignmentDetailSegment, setAlignmentDetailSegment] = useState<'A' | 'B'>('A');

  const [segmentActive, setSegmentActive] = useState(false);
  const [segmentKey, setSegmentKey] = useState('');
  const [segmentValueA, setSegmentValueA] = useState('');
  const [compareActive, setCompareActive] = useState(false);
  const [segmentValueB, setSegmentValueB] = useState('');

  const focusCase = (caseId: string) => {
    setMiningView('cases');
    setCaseSearch(caseId);
    setSelectedCaseId(caseId);
    setTimeout(() => {
      document.getElementById('case-explorer')?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };



  const [xesExportWarnings, setXesExportWarnings] = useState<string[]>([]);
  const [xesExportStatus, setXesExportStatus] = useState<string>('');
  const [xesExportError, setXesExportError] = useState<string>('');
  const [xesImportStatus, setXesImportStatus] = useState<string>('');
  const [xesImportError, setXesImportError] = useState<string>('');
  const [xesImportLoading, setXesImportLoading] = useState(false);

  const [toolHistoryPreferred, setToolHistoryPreferred] = useState<'auto' | ToolHistoryKind>('auto');
  const [toolHistoryFilterMode, setToolHistoryFilterMode] = useState<ToolHistoryFilterMode>('status_only');
  const [toolHistoryFileName, setToolHistoryFileName] = useState('');
  const [toolHistoryRawText, setToolHistoryRawText] = useState<string | null>(null);
  const [toolHistoryIsHtml, setToolHistoryIsHtml] = useState(false);
  const [toolHistoryDetectInfo, setToolHistoryDetectInfo] = useState('');
  const [toolHistoryWarnings, setToolHistoryWarnings] = useState<string[]>([]);
  const [toolHistoryError, setToolHistoryError] = useState('');
  const [toolHistoryImporting, setToolHistoryImporting] = useState(false);
  const [toolHistoryEvidenceRefId, setToolHistoryEvidenceRefId] = useState('');
  const [toolHistoryStatus, setToolHistoryStatus] = useState('');

  const [appendRemaining, setAppendRemaining] = useState(true);
  const [xesRoundtripReport, setXesRoundtripReport] = useState<string>('');
  const [xesRoundtripError, setXesRoundtripError] = useState<string>('');
  const [xesRoundtripRunning, setXesRoundtripRunning] = useState(false);
  const [happyPathStatus, setHappyPathStatus] = useState<string>('');
  const [miningBacklogStatus, setMiningBacklogStatus] = useState('');
  const [miningBacklogError, setMiningBacklogError] = useState('');
  const [miningBacklogBusy, setMiningBacklogBusy] = useState(false);
  const [bucketStatus, setBucketStatus] = useState('');
  const [bucketError, setBucketError] = useState('');
  const [bucketBusy, setBucketBusy] = useState(false);

  const [showImportPanel, setShowImportPanel] = useState<boolean>(!version.sidecar.processMining);

  const [dataImportTab, setDataImportTab] = useState<'csv'|'xes'|'tool'>(() => {
    const stored = localStorage.getItem('pm.dataImport.tab');
    if (stored === 'csv' || stored === 'xes' || stored === 'tool') return stored;
    return 'csv';
  });
  useEffect(() => { localStorage.setItem('pm.dataImport.tab', dataImportTab); }, [dataImportTab]);

  const VIEW_KEY_GLOBAL = 'pm.workspace.view';

  const [internalMiningView, setInternalMiningView] = useState<MiningView>(() => {
    const raw = localStorage.getItem(VIEW_KEY_GLOBAL);
    const allowed: MiningView[] = ['data','preprocessing','mapping','discovery','conformance','performance','cases','export','organisation','rootcause','drift','guided'];
    const defaultView = isAssisted ? 'guided' : 'data';
    return (allowed.includes(raw as MiningView) ? (raw as MiningView) : defaultView);
  });

  const miningView: MiningView = (externalMiningView ?? internalMiningView) as MiningView;

  const setMiningView = useCallback((v: MiningView) => {
    try { localStorage.setItem(VIEW_KEY_GLOBAL, v); } catch { /* intentional */ }
    if (onMiningViewChange) onMiningViewChange(v);
    else setInternalMiningView(v);
  }, [onMiningViewChange]);

  const [driftAId, setDriftAId] = useState<string>(() => localStorage.getItem('pm.drift.a') ?? '');
  const [driftBId, setDriftBId] = useState<string>(() => localStorage.getItem('pm.drift.b') ?? '');
  const [driftMode, setDriftMode] = useState<DriftCompareMode>(() => {
    return (localStorage.getItem('pm.drift.mode') as DriftCompareMode) || 'activity';
  });
  const [driftSliceStartMonth, setDriftSliceStartMonth] = useState<string>(() => localStorage.getItem('pm.drift.slice.start') ?? '');
  const [driftSliceEndMonth, setDriftSliceEndMonth] = useState<string>(() => localStorage.getItem('pm.drift.slice.end') ?? '');
  const [driftSliceGranularity, _setDriftSliceGranularity] = useState<'month' | 'quarter'>(() => {
    const v = localStorage.getItem('pm.drift.slice.grain');
    return v === 'quarter' ? 'quarter' : 'month';
  });
  const [driftSliceStatus, setDriftSliceStatus] = useState<string>('');
  const [driftTab, setDriftTab] = useState<'compare' | 'slice' | 'monitor'>(() => {
    return (localStorage.getItem('pm.drift.tab') as 'compare' | 'slice' | 'monitor' | null) || 'compare';
  });
  useEffect(() => { localStorage.setItem('pm.drift.tab', driftTab); }, [driftTab]);

  const [xesExportMode, setXesExportMode] = useState<'activity' | 'step'>('activity');
  const [advancedConformanceEnabled, setAdvancedConformanceEnabled] = useState(false);
  const [bpmnConformanceEnabled, setBpmnConformanceEnabled] = useState(false);
  const [draftModelConformanceEnabled, setDraftModelConformanceEnabled] = useState<boolean>(() => {
    return (localStorage.getItem('pm.conformance.draftModel') ?? 'true') === 'true';
  });
  const [conformanceTab, setConformanceTab] = useState<'overview' | 'alignment' | 'bpmn' | 'draft'>(() => {
    return (localStorage.getItem('pm.conformance.tab') as 'overview' | 'alignment' | 'bpmn' | 'draft' | null) || 'overview';
  });
  useEffect(() => { localStorage.setItem('pm.conformance.tab', conformanceTab); }, [conformanceTab]);

  const [performanceTab, setPerformanceTab] = useState<'durations' | 'bottlenecks' | 'sla' | 'happyPath'>(() => {
    return (localStorage.getItem('pm.performance.tab') as 'durations' | 'bottlenecks' | 'sla' | 'happyPath' | null) || 'durations';
  });
  useEffect(() => { localStorage.setItem('pm.performance.tab', performanceTab); }, [performanceTab]);

  const [xesStepIncludeOriginal, setXesStepIncludeOriginal] = useState(true);

  const [dsRenameId, setDsRenameId] = useState<string | null>(null);
  const [dsRenameValue, setDsRenameValue] = useState('');

  const [discoveryTab, setDiscoveryTab] = useState<'map' | 'variants' | 'model'>(() => {
    return (localStorage.getItem('pm.discovery.tab') as 'map' | 'variants' | 'model' | null) || 'map';
  });

  const processMiningRaw = version.sidecar.processMining;
  const { processMining, expertValidationError } = useMemo(() => {
    if (!processMiningRaw) return { processMining: undefined, expertValidationError: null };
    try {
      return { processMining: normalizeProcessMiningState(processMiningRaw), expertValidationError: null };
    } catch (e) {
      return { processMining: undefined, expertValidationError: e instanceof Error ? e.message : String(e) };
    }
  }, [processMiningRaw]);

  const datasets = useMemo(() => processMining?.datasets ?? [], [processMining?.datasets]);
  const activeId = processMining?.activeDatasetId ?? '';
  const activeDataset = datasets.find(d => d.id === activeId) ?? null;



  const getDatasetEvents = useCallback((dataset: ProcessMiningDataset | null): EventLogEvent[] => {
    if (!dataset) return [];
    if (dataset.events && dataset.events.length > 0) return dataset.events;
    if (dataset.eventsRef) {
      const cached = eventsRuntimeCacheRef.current.get(dataset.id);
      if (cached) return cached;
      return [];
    }
    return [];
  }, []);

  useEffect(() => {
    if (!activeDataset || !activeDataset.eventsRef) {
      return;
    }
    if (activeDataset.events && activeDataset.events.length > 0) {
      return;
    }
    if (eventsRuntimeCacheRef.current.has(activeDataset.id)) {
      return;
    }

    const loadExternalEvents = async () => {
      try {
        const { getEvents } = await import('../storage/indexedDbEventStore');
        const events = await getEvents(activeDataset.eventsRef!.key);
        if (!events || events.length === 0) {
          setEventsLoadError(
            `Dataset „${activeDataset.sourceLabel}": Externalisierte Events konnten nicht aus IndexedDB geladen werden oder sind leer. ` +
            'Das Dataset kann nicht für Process Mining verwendet werden. Bitte das Dataset löschen und neu importieren.'
          );
          return;
        }
        const integrity = checkEventLogIntegrity(events);
        if (!integrity.valid) {
          setEventsLoadError(
            `Dataset „${activeDataset.sourceLabel}": Geladene Events sind ungültig. ${integrity.summary}`
          );
          return;
        }
        setEventsLoadError(null);
        eventsRuntimeCacheRef.current.set(activeDataset.id, events);
        setEventsLoadTrigger(prev => prev + 1);
      } catch (err) {
        setEventsLoadError(
          `Dataset „${activeDataset.sourceLabel}": IndexedDB-Ladefehler – ${err instanceof Error ? err.message : String(err)}. ` +
          'Analyse dieses Datasets ist nicht möglich. Bitte das Dataset löschen und neu importieren.'
        );
      }
    };

    setEventsLoadError(null);
    loadExternalEvents();
  }, [activeDataset]);

  const activeDatasetEvents = useMemo((): EventLogEvent[] => {
    return getDatasetEvents(activeDataset);
  // eventsLoadTrigger forces recompute after IndexedDB load completes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDataset, getDatasetEvents, eventsLoadTrigger]);

  const isActiveDatasetEventsReady = useMemo((): boolean => {
    if (!activeDataset) return false;
    if (activeDataset.events && activeDataset.events.length > 0) return true;
    if (activeDataset.eventsRef) {
      return eventsRuntimeCacheRef.current.has(activeDataset.id);
    }
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDataset, eventsLoadTrigger]);

  const isDatasetEventsReady = useCallback((dataset: ProcessMiningDataset | null): boolean => {
    if (!dataset) return false;
    if (dataset.events && dataset.events.length > 0) return true;
    if (dataset.eventsRef) return eventsRuntimeCacheRef.current.has(dataset.id);
    return true;
  }, []);

  const loadDatasetEventsToCache = useCallback(async (
    dataset: ProcessMiningDataset,
    onError: (msg: string) => void,
  ): Promise<boolean> => {
    if (dataset.events && dataset.events.length > 0) return true;
    if (!dataset.eventsRef) return true;
    if (eventsRuntimeCacheRef.current.has(dataset.id)) return true;
    try {
      const { getEvents } = await import('../storage/indexedDbEventStore');
      const events = await getEvents(dataset.eventsRef.key);
      if (!events || events.length === 0) {
        onError(
          `Dataset „${dataset.sourceLabel}": Externalisierte Events konnten nicht aus IndexedDB geladen werden oder sind leer.`
        );
        return false;
      }
      const integrity = checkEventLogIntegrity(events);
      if (!integrity.valid) {
        onError(`Dataset „${dataset.sourceLabel}": Geladene Events sind ungültig. ${integrity.summary}`);
        return false;
      }
      eventsRuntimeCacheRef.current.set(dataset.id, events);
      setEventsLoadTrigger(prev => prev + 1);
      return true;
    } catch (err) {
      onError(
        `Dataset „${dataset.sourceLabel}": IndexedDB-Ladefehler – ${err instanceof Error ? err.message : String(err)}.`
      );
      return false;
    }
  }, []);

  useEffect(() => {
    const dsADataset = datasets.find(d => d.id === driftAId) ?? null;
    const dsBDataset = datasets.find(d => d.id === driftBId) ?? null;
    if (!dsADataset && !dsBDataset) return;

    const errors: string[] = [];
    const loads: Promise<void>[] = [];

    if (dsADataset && dsADataset.eventsRef && !eventsRuntimeCacheRef.current.has(dsADataset.id)) {
      loads.push(
        loadDatasetEventsToCache(dsADataset, (msg) => { errors.push(`Dataset A: ${msg}`); }).then(() => {})
      );
    }
    if (dsBDataset && dsBDataset.eventsRef && !eventsRuntimeCacheRef.current.has(dsBDataset.id)) {
      loads.push(
        loadDatasetEventsToCache(dsBDataset, (msg) => { errors.push(`Dataset B: ${msg}`); }).then(() => {})
      );
    }

    if (loads.length === 0) return;
    setDriftDatasetsLoadError(null);
    Promise.all(loads).then(() => {
      if (errors.length > 0) setDriftDatasetsLoadError(errors.join(' | '));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driftAId, driftBId, datasets.length]);

  useEffect(() => {
    if (!processMining?.datasets) return;
    const timesliceDatasets = processMining.datasets.filter(d =>
      d.provenance?.method === 'timeslice' &&
      d.eventsRef &&
      !eventsRuntimeCacheRef.current.has(d.id)
    );
    if (timesliceDatasets.length === 0) return;

    const errors: string[] = [];
    setTimesliceTrendLoadError(null);

    Promise.all(
      timesliceDatasets.map(ds =>
        loadDatasetEventsToCache(ds, (msg) => { errors.push(msg); }).then(() => {})
      )
    ).then(() => {
      if (errors.length > 0) setTimesliceTrendLoadError(errors.join(' | '));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processMining?.datasets?.length]);

  const prevImportedAtRef = useRef<string | undefined>(processMining?.importedAt);
  const applyingSettingsRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const processMiningRef = useRef(processMining);
  const sidecarRef = useRef(version.sidecar);
  const pendingSettingsPatchRef = useRef<Partial<ProcessMiningDatasetSettings>>({});

  useEffect(() => {
    if (!processMining) {
      prevImportedAtRef.current = undefined;
      setShowImportPanel(true);
      return;
    }
    const prev = prevImportedAtRef.current;
    if (prev !== processMining.importedAt) {
      prevImportedAtRef.current = processMining.importedAt;
      setShowImportPanel(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processMining?.importedAt, !!processMining]);

  useEffect(() => { processMiningRef.current = processMining; }, [processMining]);
  useEffect(() => { sidecarRef.current = version.sidecar; }, [version.sidecar]);

  useEffect(() => {
    if (processMining?.sourceLabel) {
      setSourceLabel(processMining.sourceLabel);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processMining?.activeDatasetId]);

  useEffect(() => {
    if (!processMining || !activeDataset) return;
    applyingSettingsRef.current = true;

    const existing = activeDataset.settings;
    const defaults = getDefaultDatasetSettingsFromLocalStorage();
    const effective: ProcessMiningDatasetSettings = existing
      ? {
          ...defaults,
          ...existing,
          segment: { ...defaults.segment, ...existing.segment },
          discovery: { ...defaults.discovery, ...existing.discovery },
          conformance: { ...defaults.conformance, ...existing.conformance },
          performance: { ...defaults.performance, ...existing.performance },
          rootCause: { ...defaults.rootCause, ...existing.rootCause },
        }
      : defaults;

    setMiningView(effective.workspaceView ?? 'data');

    setSegmentActive(!!effective.segment?.enabled);
    setCompareActive(!!effective.segment?.compareEnabled);
    setSegmentKey(effective.segment?.attributeKey ?? '');
    setSegmentValueA(effective.segment?.valueA ?? '');
    setSegmentValueB(effective.segment?.valueB ?? '');

    setDfgMode(effective.discovery?.dfgMode ?? 'activity');
    setMinEdgeCount(effective.discovery?.minEdgeCount ?? 5);
    setMaxNodes(effective.discovery?.maxNodes ?? 30);
    setDfgHeatMetric(effective.discovery?.heatMetric ?? 'median');

    setDiscoveryMode(effective.discovery?.deriveMode ?? 'top_variant');
    setDiscoveryMinEdgeShare(effective.discovery?.minEdgeShare ?? 0.02);
    setDiscoveryMaxExtraBranches(effective.discovery?.maxExtraBranches ?? 3);
    setDiscoveryIncludeLoops(!!effective.discovery?.includeLoops);
    setDiscoveryRestrictToTopPath(effective.discovery?.restrictToTopPath ?? true);
    setDiscoveryMaxSteps(effective.discovery?.maxSteps ?? 80);
    setDiscoveryMinNodeCoverage(effective.discovery?.minNodeCoverage ?? 0);

    setAdvancedConformanceEnabled(!!effective.conformance?.advancedEnabled);
    setBpmnConformanceEnabled(!!effective.conformance?.bpmnEnabled);
    setDraftModelConformanceEnabled(effective.conformance?.draftEnabled ?? true);

    setTransitionPerfMode((effective.performance?.transitionPerfMode ?? 'step') as 'step' | 'activity');

    setRcThresholdMode((effective.rootCause?.thresholdMode ?? 'p90') as RootCauseThresholdMode);
    const ct = effective.rootCause?.customThresholdMs ?? (24 * 60 * 60 * 1000);
    if (ct >= 24 * 60 * 60 * 1000) {
      setRcCustomUnit('days');
      setRcCustomValue(Math.max(1, Math.round(ct / (24 * 60 * 60 * 1000))));
    } else {
      setRcCustomUnit('hours');
      setRcCustomValue(Math.max(1, Math.round(ct / (60 * 60 * 1000))));
    }
    setRcMinSupport(effective.rootCause?.minSupportCases ?? 10);

    if (!existing || existing.workspaceView == null) {
      const next = updateActiveMiningDatasetSettings(processMining, effective);
      onSave({ sidecar: { ...version.sidecar, processMining: next } }).catch(() => {});
    }

    setTimeout(() => { applyingSettingsRef.current = false; }, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processMining?.activeDatasetId]);

  useEffect(() => {
    if (!processMining && miningView !== 'data') setMiningView('data');
  }, [processMining, miningView, setMiningView]);

  useEffect(() => {
    localStorage.setItem('pm.drift.mode', driftMode);
  }, [driftMode]);

  useEffect(() => {
    if (driftAId) localStorage.setItem('pm.drift.a', driftAId);
    else localStorage.removeItem('pm.drift.a');
  }, [driftAId]);

  useEffect(() => {
    if (driftBId) localStorage.setItem('pm.drift.b', driftBId);
    else localStorage.removeItem('pm.drift.b');
  }, [driftBId]);

  useEffect(() => {
    if (driftSliceStartMonth) localStorage.setItem('pm.drift.slice.start', driftSliceStartMonth);
    else localStorage.removeItem('pm.drift.slice.start');
  }, [driftSliceStartMonth]);

  useEffect(() => {
    if (driftSliceEndMonth) localStorage.setItem('pm.drift.slice.end', driftSliceEndMonth);
    else localStorage.removeItem('pm.drift.slice.end');
  }, [driftSliceEndMonth]);

  useEffect(() => {
    localStorage.setItem('pm.discovery.tab', discoveryTab);
  }, [discoveryTab]);

  useEffect(() => {
    localStorage.setItem('pm.drift.slice.grain', driftSliceGranularity);
  }, [driftSliceGranularity]);

  const datasetsSorted = useMemo(
    () => [...datasets].sort((a, b) => a.importedAt.localeCompare(b.importedAt)),
    [datasets],
  );

  useEffect(() => {
    if (datasets.length === 0) return;
    const ids = new Set(datasets.map(d => d.id));
    setDriftBId(prev => {
      if (prev && ids.has(prev)) return prev;
      return activeId || datasets[datasets.length - 1].id;
    });
    setDriftAId(prev => {
      if (prev && ids.has(prev)) return prev;
      const effectiveBId = activeId || datasets[datasets.length - 1].id;
      const oldest = datasetsSorted.find(d => d.id !== effectiveBId);
      return oldest ? oldest.id : effectiveBId;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets.length, activeId]);

  const dsA = datasets.find(d => d.id === driftAId) ?? null;
  const dsB = datasets.find(d => d.id === driftBId) ?? null;

  const profileA: DriftProfile | null = useMemo(() => {
    if (!dsA) return null;
    if (!isDatasetEventsReady(dsA)) return null;
    const eventsA = getDatasetEvents(dsA);
    if (eventsA.length === 0) return null;
    return computeDriftProfile({
      events: eventsA,
      mode: driftMode,
      activityMappings: dsA.activityMappings,
      draftSteps: version.sidecar.captureDraft?.happyPath ?? [],
      timeMode: dsA.timeMode,
    });
  // eventsLoadTrigger ensures recompute after IndexedDB load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dsA, driftMode, version.sidecar.captureDraft, processMining?.timeMode, eventsLoadTrigger]);

  const profileB: DriftProfile | null = useMemo(() => {
    if (!dsB) return null;
    if (!isDatasetEventsReady(dsB)) return null;
    const eventsB = getDatasetEvents(dsB);
    if (eventsB.length === 0) return null;
    return computeDriftProfile({
      events: eventsB,
      mode: driftMode,
      activityMappings: dsB.activityMappings,
      draftSteps: version.sidecar.captureDraft?.happyPath ?? [],
      timeMode: dsB.timeMode,
    });
  // eventsLoadTrigger ensures recompute after IndexedDB load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dsB, driftMode, version.sidecar.captureDraft, processMining?.timeMode, eventsLoadTrigger]);

  const driftResults = useMemo(() => {
    if (!profileA || !profileB) return null;
    const variantDeltas = computeShareDeltas({
      a: profileA.topVariants,
      aOtherShare: profileA.otherVariantsShare,
      b: profileB.topVariants,
      bOtherShare: profileB.otherVariantsShare,
    });
    const dist = computeDistributionDistance({
      a: profileA.topVariants,
      aOtherShare: profileA.otherVariantsShare,
      b: profileB.topVariants,
      bOtherShare: profileB.otherVariantsShare,
    });
    const aKeyMap = new Map(profileA.topKeysByCaseCoverage.map(r => [r.key, r]));
    const bKeyMap = new Map(profileB.topKeysByCaseCoverage.map(r => [r.key, r]));
    const newKeys = profileB.topKeysByCaseCoverage.filter(r => !aKeyMap.has(r.key));
    const removedKeys = profileA.topKeysByCaseCoverage.filter(r => !bKeyMap.has(r.key));
    const unionKeySet = new Set([...aKeyMap.keys(), ...bKeyMap.keys()]);
    const keyDeltas: Array<{ key: string; label: string; pctA: number; pctB: number; delta: number }> = [];
    for (const key of unionKeySet) {
      const rA = aKeyMap.get(key);
      const rB = bKeyMap.get(key);
      const pctA = rA?.pctCases ?? 0;
      const pctB = rB?.pctCases ?? 0;
      const delta = pctB - pctA;
      if (Math.abs(delta) >= 0.10) {
        const label = rB?.label ?? rA?.label ?? key;
        keyDeltas.push({ key, label, pctA, pctB, delta });
      }
    }
    keyDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return { variantDeltas, dist, newKeys, removedKeys, changedKeys: keyDeltas.slice(0, 20) };
  }, [profileA, profileB]);

  const slicePreview = useMemo(() => {
    if (!activeDataset || processMining?.timeMode !== 'real') return null;
    if (!isActiveDatasetEventsReady || activeDatasetEvents.length === 0) return null;
    return (driftSliceGranularity === 'quarter' ? sliceByCaseStartQuarter : sliceByCaseStartMonth)({
      events: activeDatasetEvents,
      rangeStartMonth: driftSliceStartMonth || undefined,
      rangeEndMonth: driftSliceEndMonth || undefined,
    });
  }, [activeDataset, isActiveDatasetEventsReady, activeDatasetEvents, driftSliceStartMonth, driftSliceEndMonth, driftSliceGranularity, processMining?.timeMode]);

  const timesliceTrend = useMemo(() => {
    if (!processMining || !activeDataset || !processMining.datasets) return null;

    let baseDatasetId: string;
    if (activeDataset.provenance?.method === 'timeslice' && activeDataset.provenance.createdFromDatasetId) {
      baseDatasetId = activeDataset.provenance.createdFromDatasetId;
    } else {
      baseDatasetId = activeDataset.id;
    }

    const timesliceDatasets = processMining.datasets.filter(d =>
      d.provenance?.method === 'timeslice' &&
      d.provenance.createdFromDatasetId === baseDatasetId &&
      d.provenance.window?.startIso &&
      d.provenance.window?.endIso
    );

    if (timesliceDatasets.length < 2) return null;

    timesliceDatasets.sort((a, b) => {
      const aStart = a.provenance?.window?.startIso ?? '';
      const bStart = b.provenance?.window?.startIso ?? '';
      const aMs = Date.parse(aStart);
      const bMs = Date.parse(bStart);
      if (isFinite(aMs) && isFinite(bMs)) return aMs - bMs;
      return aStart.localeCompare(bStart);
    });

    const rows: Array<{
      datasetId: string;
      label: string;
      startIso: string;
      analyzedCases: number;
      variantsTotal: number;
      uniqueKeys: number;
      medianMs: number | null;
      p90Ms: number | null;
      overlapPrev: number | null;
      jsdPrev: number | null;
      compareBaselineId: string;
    }> = [];

    let prevProfile: DriftProfile | null = null;
    let prevDatasetId: string | null = null;

    for (const ds of timesliceDatasets) {
      const dsEvents = getDatasetEvents(ds);
      if (dsEvents.length === 0) {
        continue;
      }
      const profile = computeDriftProfile({
        events: dsEvents,
        mode: driftMode,
        activityMappings: ds.activityMappings,
        draftSteps: version.sidecar.captureDraft?.happyPath ?? [],
        timeMode: ds.timeMode,
      });

      let overlapPrev: number | null = null;
      let jsdPrev: number | null = null;

      if (prevProfile) {
        const distPrev = computeDistributionDistance({
          a: prevProfile.topVariants,
          aOtherShare: prevProfile.otherVariantsShare,
          b: profile.topVariants,
          bOtherShare: profile.otherVariantsShare,
        });
        overlapPrev = distPrev.overlap;
        jsdPrev = distPrev.jsd;
      }

      const grain = ds.provenance?.window?.grain;
      const startIso = ds.provenance?.window?.startIso ?? '';
      let label = ds.sourceLabel;

      if (grain && startIso) {
        const d = new Date(startIso);
        if (isFinite(d.getTime())) {
          if (grain === 'quarter') {
            const y = d.getUTCFullYear();
            const q = Math.floor(d.getUTCMonth() / 3) + 1;
            label = `${y}-Q${q}`;
          } else {
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            label = `${y}-${m}`;
          }
        }
      } else {
        const parts = ds.sourceLabel.split('·');
        if (parts.length > 1) {
          label = parts[parts.length - 1].trim();
        }
      }

      rows.push({
        datasetId: ds.id,
        label,
        startIso,
        analyzedCases: profile.analyzedCases,
        variantsTotal: profile.variantsTotal,
        uniqueKeys: profile.uniqueKeys,
        medianMs: profile.durationMedianMs,
        p90Ms: profile.durationP90Ms,
        overlapPrev,
        jsdPrev,
        compareBaselineId: prevDatasetId ?? baseDatasetId,
      });

      prevProfile = profile;
      prevDatasetId = ds.id;
    }

    return { baseId: baseDatasetId, rows };
  // eventsLoadTrigger ensures recompute after IndexedDB load for any timeslice dataset
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processMining, activeDataset, driftMode, version.sidecar.captureDraft?.happyPath, eventsLoadTrigger]);

  function getDefaultDatasetSettingsFromLocalStorage(): ProcessMiningDatasetSettings {
    const safeNum = (v: string | null, fallback: number) => {
      const n = v == null ? NaN : Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const safeInt = (v: string | null, fallback: number) => {
      const n = v == null ? NaN : parseInt(v, 10);
      return Number.isFinite(n) ? n : fallback;
    };

    const discoveryModeVal = (localStorage.getItem('pm.discovery.mode') as 'top_variant' | 'dfg_xor' | 'dfg_xor_and' | null) || 'top_variant';

    return {
      workspaceView: 'data',
      segment: { enabled: false, attributeKey: '', valueA: '', compareEnabled: false, valueB: '' },
      discovery: {
        dfgMode: 'activity',
        minEdgeCount: 5,
        maxNodes: 30,
        deriveMode: discoveryModeVal,
        minEdgeShare: safeNum(localStorage.getItem('pm.discovery.minEdgeShare'), 0.02),
        maxExtraBranches: safeInt(localStorage.getItem('pm.discovery.maxExtraBranches'), 3),
        includeLoops: localStorage.getItem('pm.discovery.includeLoops') === 'true',
        restrictToTopPath: (localStorage.getItem('pm.discovery.restrictToTopPath') ?? 'true') === 'true',
        maxSteps: safeInt(localStorage.getItem('pm.discovery.maxSteps'), 80),
        minNodeCoverage: safeNum(localStorage.getItem('pm.discovery.minNodeCoverage'), 0),
      },
      conformance: {
        advancedEnabled: false,
        bpmnEnabled: false,
        draftEnabled: (localStorage.getItem('pm.conformance.draftModel') ?? 'true') === 'true',
      },
      performance: {
        transitionPerfMode: ((localStorage.getItem('pm.perf.mode') as 'step' | 'activity' | null) || 'step'),
      },
      rootCause: {
        thresholdMode: 'p90',
        customThresholdMs: 24 * 60 * 60 * 1000,
        minSupportCases: 10,
      },
      assistant: {
        step: 'goal',
        objective: 'overview',
        complexity: 'balanced',
        notes: '',
      },
    };
  }

  const resetTransientMiningUi = useCallback(() => {
    setCaseSearch('');
    setSelectedCaseId(null);
    setMappingSearch('');
    setShowMappingAssistant(false);
  }, []);

  const resetAfterHardImport = useCallback(() => {
    setCaseSearch('');
    setSelectedCaseId(null);
    setMappingSearch('');
    setShowMappingAssistant(false);
    setFileContent(null);
    setCsvHeaders([]);
  }, []);

  function mergeSettingsPatch(
    base: Partial<ProcessMiningDatasetSettings>,
    patch: Partial<ProcessMiningDatasetSettings>,
  ): Partial<ProcessMiningDatasetSettings> {
    return {
      ...base,
      ...patch,
      segment: { ...(base.segment ?? {}), ...(patch.segment ?? {}) },
      discovery: { ...(base.discovery ?? {}), ...(patch.discovery ?? {}) },
      conformance: { ...(base.conformance ?? {}), ...(patch.conformance ?? {}) },
      performance: { ...(base.performance ?? {}), ...(patch.performance ?? {}) },
      rootCause: { ...(base.rootCause ?? {}), ...(patch.rootCause ?? {}) },
      assistant: { ...(base.assistant ?? {}), ...(patch.assistant ?? {}) },
    };
  }

  const scheduleDatasetSettingsSave = useCallback((settingsPatch: Partial<ProcessMiningDatasetSettings>) => {
    const pmNow = processMiningRef.current;
    if (!pmNow) return;
    if (applyingSettingsRef.current) return;

    pendingSettingsPatchRef.current = mergeSettingsPatch(pendingSettingsPatchRef.current, settingsPatch);

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const pmLatest = processMiningRef.current;
        const sidecarLatest = sidecarRef.current;
        if (!pmLatest) return;

        const patchToApply = pendingSettingsPatchRef.current;
        pendingSettingsPatchRef.current = {};
        saveTimerRef.current = null;

        const next = updateActiveMiningDatasetSettings(pmLatest, patchToApply);
        await onSave({ sidecar: { ...sidecarLatest, processMining: next } });
      } catch {
        // bewusst still
      }
    }, 250);
  }, [onSave]);

  useEffect(() => {
    pendingSettingsPatchRef.current = {};
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, [processMining?.activeDatasetId]);

  useEffect(() => {
    if (!processMining?.activeDatasetId) return;
    scheduleDatasetSettingsSave({ workspaceView: miningView });
  }, [miningView, processMining?.activeDatasetId, scheduleDatasetSettingsSave]);

  useEffect(() => {
    scheduleDatasetSettingsSave({
      segment: {
        enabled: segmentActive,
        attributeKey: segmentKey,
        valueA: segmentValueA,
        compareEnabled: compareActive,
        valueB: segmentValueB,
      },
    });
  }, [segmentActive, segmentKey, segmentValueA, compareActive, segmentValueB, scheduleDatasetSettingsSave]);

  useEffect(() => {
    scheduleDatasetSettingsSave({
      discovery: { dfgMode, minEdgeCount, maxNodes, heatMetric: dfgHeatMetric },
    });
  }, [dfgMode, minEdgeCount, maxNodes, dfgHeatMetric, scheduleDatasetSettingsSave]);

  const handleDiscoveryPresetChange = (preset: 'overview' | 'balanced' | 'detailed') => {
    setDiscoveryPreset(preset);
    let newMinEdgeCount: number;
    let newMaxNodes: number;

    switch (preset) {
      case 'overview':
        newMinEdgeCount = 10;
        newMaxNodes = 20;
        break;
      case 'balanced':
        newMinEdgeCount = 5;
        newMaxNodes = 30;
        break;
      case 'detailed':
        newMinEdgeCount = 1;
        newMaxNodes = 50;
        break;
    }

    setMinEdgeCount(newMinEdgeCount);
    setMaxNodes(newMaxNodes);
  };

  useEffect(() => {
    scheduleDatasetSettingsSave({
      discovery: {
        deriveMode: discoveryMode,
        minEdgeShare: discoveryMinEdgeShare,
        maxExtraBranches: discoveryMaxExtraBranches,
        includeLoops: discoveryIncludeLoops,
        restrictToTopPath: discoveryRestrictToTopPath,
        maxSteps: discoveryMaxSteps,
        minNodeCoverage: discoveryMinNodeCoverage,
      },
    });
  }, [discoveryMode, discoveryMinEdgeShare, discoveryMaxExtraBranches, discoveryIncludeLoops, discoveryRestrictToTopPath, discoveryMaxSteps, discoveryMinNodeCoverage, scheduleDatasetSettingsSave]);

  useEffect(() => {
    scheduleDatasetSettingsSave({
      conformance: {
        advancedEnabled: advancedConformanceEnabled,
        bpmnEnabled: bpmnConformanceEnabled,
        draftEnabled: draftModelConformanceEnabled,
      },
    });
  }, [advancedConformanceEnabled, bpmnConformanceEnabled, draftModelConformanceEnabled, scheduleDatasetSettingsSave]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError('');
    setCsvHeaders([]);
    setFileContent(null);

    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setFileContent(text);

      const parsed = parseCsvText(text);
      if (parsed.headers.length === 0) {
        setImportError('Keine Spaltenüberschriften gefunden.');
        return;
      }

      setCsvHeaders(parsed.headers);

      const detected = detectEventLogColumns(parsed.headers);

      setSelectedCaseCol(detected.caseIdCol);
      setSelectedActivityCol(detected.activityCol);
      setSelectedTimestampCol(detected.timestampCol);
      setSelectedResourceCol(detected.resourceCol);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Fehler beim Lesen der Datei.');
    }
  };

  const handleImport = async () => {
    if (!fileContent || selectedCaseCol < 0 || selectedActivityCol < 0 || selectedTimestampCol < 0) {
      setImportError('Bitte wählen Sie mindestens Case ID, Activity und Timestamp aus.');
      return;
    }

    setImporting(true);
    setImportError('');

    try {
      const { events, warnings } = parseEventLogFromCsv({
        csvText: fileContent,
        columns: {
          caseIdCol: selectedCaseCol,
          activityCol: selectedActivityCol,
          timestampCol: selectedTimestampCol,
          resourceCol: selectedResourceCol,
        },
      });

      if (events.length === 0) {
        setImportError('Keine gültigen Events gefunden. Prüfen Sie die Spalten und Datumsformate.');
        setImporting(false);
        return;
      }

      const activityMappings = buildActivityStats(events, version.sidecar.captureDraft?.happyPath ?? []);

      const csvImportedAt = new Date().toISOString();
      let dataset: ProcessMiningDataset = {
        id: crypto.randomUUID(),
        sourceLabel,
        importedAt: csvImportedAt,
        events,
        activityMappings,
        warnings: warnings.length > 0 ? warnings : undefined,
        timeMode: 'real',
        provenance: { kind: 'import', method: 'csv', createdAt: csvImportedAt },
        settings: getDefaultDatasetSettingsFromLocalStorage(),
      };

      dataset = await prepareDatasetWithExternalization(dataset);

      const next = addMiningDataset(processMining ?? undefined, dataset, true);

      await onSave({
        sidecar: {
          ...version.sidecar,
          processMining: next,
        },
      });

      setFileContent(null);
      setCsvHeaders([]);
      resetAfterHardImport();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Fehler beim Import.');
    } finally {
      setImporting(false);
    }
  };

  const handleRemoveLog = async () => {
    if (!confirm('Alle Mining-Daten und Datasets entfernen? Dies kann nicht rückgängig gemacht werden.')) return;

    await onSave({
      sidecar: {
        ...version.sidecar,
        processMining: undefined,
      },
    });
    resetTransientMiningUi();
    setShowImportPanel(true);
    sweepOrphanedEventBlobs().catch((err) => {
      console.warn('sweepOrphanedEventBlobs nach Log-Reset fehlgeschlagen:', err);
    });
  };

  const handleSwitchDataset = async (datasetId: string) => {
    if (!processMining || datasetId === activeId) return;
    const next = setActiveMiningDataset(processMining, datasetId);
    await onSave({ sidecar: { ...version.sidecar, processMining: next } });
    resetTransientMiningUi();
  };

  const handleRenameDataset = async () => {
    if (!processMining || !dsRenameId || !dsRenameValue.trim()) return;
    const next = renameMiningDataset(processMining, dsRenameId, dsRenameValue.trim());
    await onSave({ sidecar: { ...version.sidecar, processMining: next } });
    setDsRenameId(null);
    setDsRenameValue('');
  };

  const handleDuplicateDataset = async (datasetId: string) => {
    if (!processMining) return;
    const normalized = normalizeProcessMiningState(processMining);
    const original = normalized.datasets?.find((d) => d.id === datasetId);
    if (!original) return;

    let events = original.events;
    if (original.eventsRef) {
      let loadError = '';
      const loaded = await loadDatasetEventsToCache(original, (msg) => { loadError = msg; });
      if (!loaded || loadError) {
        setEventsLoadError(
          `Duplikat konnte nicht erstellt werden: ${loadError || 'Events konnten nicht geladen werden.'}`
        );
        return;
      }
      const cached = eventsRuntimeCacheRef.current.get(original.id);
      if (!cached || cached.length === 0) {
        setEventsLoadError(
          `Duplikat konnte nicht erstellt werden: Events für Dataset „${original.sourceLabel}" sind nicht im Cache.`
        );
        return;
      }
      events = cached;
    }

    const now = new Date().toISOString();
    const newId = crypto.randomUUID();
    const rawDuplicate: ProcessMiningDataset = {
      ...original,
      id: newId,
      sourceLabel: `${original.sourceLabel} (Kopie)`,
      importedAt: now,
      provenance: {
        kind: 'transform',
        method: 'duplicate',
        createdAt: now,
        createdFromDatasetId: original.id,
        createdFromLabel: original.sourceLabel,
      },
      events,
      eventsRef: undefined,
    };

    const finalDataset = await prepareDatasetWithExternalization(rawDuplicate);
    eventsRuntimeCacheRef.current.set(newId, events);

    const next = addMiningDataset(processMining, finalDataset, false);
    await onSave({ sidecar: { ...version.sidecar, processMining: next } });
  };

  const handleDeleteDataset = async (datasetId: string) => {
    if (!processMining) return;
    const ds = datasets.find((d) => d.id === datasetId);
    if (!confirm(`Dataset "${ds?.sourceLabel ?? datasetId}" löschen?`)) return;
    const next = removeMiningDataset(processMining, datasetId);
    await onSave({ sidecar: { ...version.sidecar, processMining: next } });
    if (!next) {
      resetAfterHardImport();
      setShowImportPanel(true);
    }
    sweepOrphanedEventBlobs().catch((err) => {
      console.warn('sweepOrphanedEventBlobs nach Dataset-Löschung fehlgeschlagen:', err);
    });
  };

  const handleXesExport = (scope: 'all' | 'segmentA' | 'segmentB') => {
    if (!processMining) return;
    setXesExportWarnings([]);
    setXesExportStatus('');
    setXesExportError('');

    let allowedCaseIds: Set<string> | undefined;
    const nowIso = new Date().toISOString();
    const logAttrs: Record<string, string> = {
      exportScope: scope,
      exportMode: xesExportMode,
      exportedBy: 'workbench',
      exportedAt: nowIso,
    };

    if (!isActiveDatasetEventsReady || activeDatasetEvents.length === 0) {
      setXesExportError('Events des aktiven Datasets sind noch nicht geladen. Bitte warten und erneut versuchen.');
      return;
    }

    if (scope === 'segmentA') {
      if (!filterA) return;
      const matched = new Set<string>();
      for (const e of activeDatasetEvents) {
        if (e.attributes?.[filterA.attributeKey] === filterA.attributeValue) {
          matched.add(e.caseId);
        }
      }
      allowedCaseIds = matched;
      logAttrs.segmentKey = filterA.attributeKey;
      logAttrs.segmentValue = filterA.attributeValue;
    } else if (scope === 'segmentB') {
      if (!filterB) return;
      const matched = new Set<string>();
      for (const e of activeDatasetEvents) {
        if (e.attributes?.[filterB.attributeKey] === filterB.attributeValue) {
          matched.add(e.caseId);
        }
      }
      allowedCaseIds = matched;
      logAttrs.segmentKey = filterB.attributeKey;
      logAttrs.segmentValue = filterB.attributeValue;
    }

    const scopeEvents = allowedCaseIds
      ? activeDatasetEvents.filter((e) => allowedCaseIds!.has(e.caseId))
      : activeDatasetEvents;

    let exportProcessMining = processMining;
    let mappedEvents = 0;
    let unmappedEvents = 0;

    if (xesExportMode === 'step') {
      const draftSteps = version.sidecar.captureDraft?.happyPath ?? [];
      const stepIdToExportLabel = new Map<string, string>();
      for (const step of draftSteps) {
        stepIdToExportLabel.set(step.stepId, `${step.order}. ${step.label}`);
      }
      const activityKeyToStepId = new Map<string, string>();
      for (const m of mappingsForAnalysis) {
        if (m.stepId && stepIdToExportLabel.has(m.stepId)) {
          activityKeyToStepId.set(m.activityKey, m.stepId);
        }
      }

      const exportEvents = scopeEvents.map((e) => {
        const key = normalizeActivityKey(e.activity);
        const stepId = activityKeyToStepId.get(key);
        const newName = stepId ? (stepIdToExportLabel.get(stepId) ?? e.activity) : e.activity;

        if (!stepId || newName === e.activity) {
          unmappedEvents++;
          return e;
        }

        mappedEvents++;
        let attrs = e.attributes ?? {};
        if (xesStepIncludeOriginal && !('activity_original' in attrs)) {
          attrs = { ...attrs, activity_original: e.activity };
        }
        return { ...e, activity: newName, attributes: attrs };
      });

      exportProcessMining = { ...processMining, events: exportEvents };
      logAttrs.stepExportMapping = 'true';
    } else {
      exportProcessMining = { ...processMining, events: scopeEvents };
    }

    const base = sanitizeFilenameBase(processMining.sourceLabel);
    const suffix = scope === 'segmentA' ? '-segmentA' : scope === 'segmentB' ? '-segmentB' : '';
    const modeSuffix = xesExportMode === 'step' ? '-steps' : '';
    const filename = `${base}${suffix}${modeSuffix}.xes`;

    try {
      const { xml, warnings } = buildXesXml({
        processMining: exportProcessMining,
        options: { logAttributes: logAttrs },
      });

      const exportStats = computeEventLogStats(exportProcessMining.events);

      const allWarnings = [...warnings];
      if (xesExportMode === 'step') {
        if (mappedEvents === 0 && scopeEvents.length > 0) {
          allWarnings.push(`Schritt-Export: keine gemappten Events (Mapping prüfen).`);
        } else if (unmappedEvents > 0) {
          allWarnings.push(`Schritt-Export (Scope=${scope}): ${mappedEvents} von ${scopeEvents.length} Events gemappt, ${unmappedEvents} ohne Mapping.`);
        }
      }

      setXesExportWarnings(allWarnings.length > 0 ? allWarnings : []);
      setXesExportStatus(`XES exportiert (${scope}, ${xesExportMode}): ${exportStats.totalEvents.toLocaleString('de-DE')} Events, ${exportStats.totalCases.toLocaleString('de-DE')} Cases.`);
      downloadTextFile({ filename, content: xml, mimeType: 'application/xml' });
    } catch (err) {
      setXesExportError(err instanceof Error ? err.message : String(err));
      setXesExportStatus('');
    }
  };

  const handleXesImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setXesImportError('');
    setXesImportStatus('');
    setXesImportLoading(true);

    try {
      const xmlText = await file.text();
      const parsed = parseXesXmlToAiEventLog({ xmlText, fallbackSourceLabel: file.name.replace(/\.[^.]+$/, '') });
      const draftSteps = version.sidecar.captureDraft?.happyPath ?? [];

      const { state, warnings } = normalizeAiEventLogToProcessMining({
        ai: parsed.ai,
        sourceLabel: parsed.sourceLabel,
        draftSteps,
      });

      if (!state.events || state.events.length === 0) {
        setXesImportError('XES enthält keine gültigen Events.');
        return;
      }

      let dataset: ProcessMiningDataset = {
        id: state.activeDatasetId ?? crypto.randomUUID(),
        sourceLabel: state.sourceLabel,
        importedAt: state.importedAt,
        events: state.events,
        activityMappings: state.activityMappings,
        warnings: state.warnings,
        timeMode: state.timeMode,
        sourceRefId: state.sourceRefId,
        provenance: { kind: 'import', method: 'xes', createdAt: state.importedAt },
        settings: getDefaultDatasetSettingsFromLocalStorage(),
      };

      dataset = await prepareDatasetWithExternalization(dataset);

      const next = addMiningDataset(processMining ?? undefined, dataset, true);

      await onSave({
        sidecar: {
          ...version.sidecar,
          processMining: next,
        },
      });

      resetAfterHardImport();
      const importStats = computeEventLogStats(state.events);
      const allImportWarnings = [...warnings];
      if (importStats.missingTimestampEvents > 0) {
        allImportWarnings.push(`${importStats.missingTimestampEvents} Events ohne gültigen Timestamp.`);
      }
      if (importStats.casesWithOutOfOrderTimestamps > 0) {
        allImportWarnings.push(`${importStats.casesWithOutOfOrderTimestamps} Cases haben nicht-monotone Timestamps (Sortierung/Quelle prüfen).`);
      }
      if (importStats.distinctAttributeKeys > 0) {
        allImportWarnings.push(`Attribute-Keys erkannt: ${importStats.distinctAttributeKeys}.`);
      }
      const parts = [`XES importiert: ${importStats.totalEvents.toLocaleString('de-DE')} Events, ${importStats.totalCases.toLocaleString('de-DE')} Cases, ${importStats.distinctActivities} Aktivitäten.`];
      if (allImportWarnings.length > 0) parts.push(`Hinweise: ${allImportWarnings.slice(0, 5).join(' | ')}`);
      setXesImportStatus(parts.join(' '));
    } catch (err) {
      setXesImportError(err instanceof Error ? err.message : 'XES konnte nicht gelesen werden.');
    } finally {
      setXesImportLoading(false);
    }
  };

  const handleToolHistoryFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const isHtml = ext === 'html' || ext === 'htm';
    setToolHistoryIsHtml(isHtml);
    setToolHistoryFileName(file.name);
    setToolHistoryError('');
    setToolHistoryStatus('');
    setToolHistoryDetectInfo('');
    setToolHistoryWarnings([]);
    setToolHistoryEvidenceRefId(`Mining: Tool-Historie: ${file.name}`);
    if (sourceLabel === 'Event Log') setSourceLabel(file.name.replace(/\.[^.]+$/, ''));

    try {
      const text = await file.text();
      setToolHistoryRawText(text);

      if (!isHtml) {
        try {
          const { headers } = parseCsvText(text);
          const det = detectToolHistoryColumns(headers, toolHistoryPreferred);
          const cId = headers[det.mapping.caseIdCol] ?? '?';
          const tsCol = headers[det.mapping.timestampCol] ?? '?';
          const fCol = det.mapping.fieldCol >= 0 ? headers[det.mapping.fieldCol] : '–';
          const tCol = det.mapping.toCol >= 0 ? headers[det.mapping.toCol] : '–';
          setToolHistoryDetectInfo(
            `Erkennung: ${det.kind} (Score ${det.score}) | case="${cId}" | time="${tsCol}" | field="${fCol}" | to="${tCol}"`
          );
          if (det.warnings.length > 0) setToolHistoryWarnings(det.warnings);
        } catch {
          setToolHistoryDetectInfo('CSV-Vorschau nicht möglich.');
        }
      } else {
        setToolHistoryDetectInfo('HTML-Datei geladen. Tabellenerkennung beim Import.');
      }
    } catch {
      setToolHistoryError('Datei konnte nicht gelesen werden.');
    }
  };

  const handleImportToolHistory = async () => {
    if (!toolHistoryRawText) return;

    setToolHistoryImporting(true);
    setToolHistoryError('');
    setToolHistoryStatus('');

    try {
      const r = toolHistoryIsHtml
        ? parseToolHistoryHtmlToAiEventLog({
            html: toolHistoryRawText,
            preferred: toolHistoryPreferred,
            filterMode: toolHistoryFilterMode,
            sourceLabelForNotes: sourceLabel,
          })
        : parseToolHistoryCsvToAiEventLog({
            csvText: toolHistoryRawText,
            preferred: toolHistoryPreferred,
            filterMode: toolHistoryFilterMode,
            sourceLabelForNotes: sourceLabel,
          });

      if (r.ai.events.length === 0) {
        setToolHistoryError(
          'Keine gültigen Events erkannt. Prüfen Sie Exportformat (Ticket-Historie/Änderungsprotokoll) und Spalten.'
        );
        return;
      }

      const draftSteps = version.sidecar.captureDraft?.happyPath ?? [];
      const refId = toolHistoryEvidenceRefId.trim() || `Mining: Tool-Historie: ${toolHistoryFileName || sourceLabel}`;

      const { state, warnings } = normalizeAiEventLogToProcessMining({
        ai: r.ai,
        sourceLabel,
        draftSteps,
        evidenceSource: { refId },
      });

      let dataset: ProcessMiningDataset = {
        id: state.activeDatasetId ?? crypto.randomUUID(),
        sourceLabel: state.sourceLabel,
        importedAt: state.importedAt,
        events: state.events,
        activityMappings: state.activityMappings,
        warnings: state.warnings,
        timeMode: state.timeMode,
        sourceRefId: state.sourceRefId,
        provenance: { kind: 'import', method: 'tool_history', createdAt: state.importedAt },
        settings: getDefaultDatasetSettingsFromLocalStorage(),
      };

      dataset = await prepareDatasetWithExternalization(dataset);

      const next = addMiningDataset(processMining ?? undefined, dataset, true);

      const now = new Date().toISOString();
      const uniqueCases = new Set(state.events.map((ev) => ev.caseId)).size;
      const allWarnUniq = [...new Set([...(r.warnings ?? []), ...(warnings ?? [])])].slice(0, 15);
      const evidenceText = [
        `Tool-Historie Import`,
        `Tool: ${r.detectedKind}`,
        `Datei: ${toolHistoryFileName}`,
        `Filter: ${toolHistoryFilterMode === 'status_only' ? 'nur Status/State' : 'alle Felder'}`,
        `Events: ${state.events.length.toLocaleString('de-DE')}`,
        `Cases: ${uniqueCases.toLocaleString('de-DE')}`,
        `Zeilen mit Validierungsfehlern (kein Case/Timestamp/Activity): ${r.skippedRows.toLocaleString('de-DE')}`,
        ...(r.filteredRows > 0 ? [`Status-Filter ausgeblendet: ${r.filteredRows.toLocaleString('de-DE')}`] : []),
        `Mapping: caseIdCol=${r.usedMapping.caseIdCol}, timestampCol=${r.usedMapping.timestampCol}, fieldCol=${r.usedMapping.fieldCol}, fromCol=${r.usedMapping.fromCol}, toCol=${r.usedMapping.toCol}, actorCol=${r.usedMapping.actorCol}`,
        '',
        'Warnungen:',
        ...allWarnUniq.map((w) => `- ${w}`),
      ].join('\n');

      const existingSources = version.sidecar.evidenceSources ?? [];
      const existingIdx = existingSources.findIndex((s) => s.refId === refId);
      const newSource = { refId, kind: 'file' as const, text: evidenceText, createdAt: existingIdx >= 0 ? existingSources[existingIdx].createdAt : now, updatedAt: now };
      const updatedSources = existingIdx >= 0
        ? existingSources.map((s, i) => (i === existingIdx ? newSource : s))
        : [...existingSources, newSource];

      await onSave({
        sidecar: {
          ...version.sidecar,
          evidenceSources: updatedSources,
          processMining: next,
        },
      });

      resetAfterHardImport();
      setToolHistoryWarnings(allWarnUniq);
      setToolHistoryStatus(
        `Import erfolgreich: ${state.events.length.toLocaleString('de-DE')} Events, ${uniqueCases.toLocaleString('de-DE')} Cases` +
        (r.skippedRows > 0 ? `, ${r.skippedRows} Zeilen mit Validierungsfehlern (nicht importiert)` : '') +
        (r.filteredRows > 0 ? `, ${r.filteredRows} durch Status-Filter ausgeblendet` : '') + '.'
      );
      setToolHistoryRawText(null);
      setToolHistoryFileName('');
      setToolHistoryDetectInfo('');
    } catch (err) {
      setToolHistoryError(err instanceof Error ? err.message : 'Import fehlgeschlagen.');
    } finally {
      setToolHistoryImporting(false);
    }
  };

  const buildExportProcessMining = (scope: 'all' | 'segmentA' | 'segmentB') => {
    if (!processMining) return null;
    if (!isActiveDatasetEventsReady || activeDatasetEvents.length === 0) return null;

    let allowedCaseIds: Set<string> | undefined;
    if (scope === 'segmentA') {
      if (!filterA) return null;
      const matched = new Set<string>();
      for (const e of activeDatasetEvents) {
        if (e.attributes?.[filterA.attributeKey] === filterA.attributeValue) matched.add(e.caseId);
      }
      allowedCaseIds = matched;
    } else if (scope === 'segmentB') {
      if (!filterB) return null;
      const matched = new Set<string>();
      for (const e of activeDatasetEvents) {
        if (e.attributes?.[filterB.attributeKey] === filterB.attributeValue) matched.add(e.caseId);
      }
      allowedCaseIds = matched;
    }

    const scopeEvents = allowedCaseIds
      ? activeDatasetEvents.filter((e) => allowedCaseIds!.has(e.caseId))
      : activeDatasetEvents;

    if (xesExportMode === 'step') {
      const draftSteps = version.sidecar.captureDraft?.happyPath ?? [];
      const stepIdToExportLabel = new Map<string, string>();
      for (const step of draftSteps) stepIdToExportLabel.set(step.stepId, `${step.order}. ${step.label}`);
      const activityKeyToStepId = new Map<string, string>();
      for (const m of mappingsForAnalysis) {
        if (m.stepId && stepIdToExportLabel.has(m.stepId)) activityKeyToStepId.set(m.activityKey, m.stepId);
      }
      const exportEvents = scopeEvents.map((e) => {
        const key = normalizeActivityKey(e.activity);
        const stepId = activityKeyToStepId.get(key);
        const newName = stepId ? (stepIdToExportLabel.get(stepId) ?? e.activity) : e.activity;
        if (!stepId || newName === e.activity) return e;
        let attrs = e.attributes ?? {};
        if (xesStepIncludeOriginal && !('activity_original' in attrs)) attrs = { ...attrs, activity_original: e.activity };
        return { ...e, activity: newName, attributes: attrs };
      });
      return { ...processMining, events: exportEvents };
    }
    return { ...processMining, events: scopeEvents };
  };

  const handleXesRoundtrip = async (scope: 'all' | 'segmentA' | 'segmentB') => {
    if (!processMining) return;
    setXesRoundtripRunning(true);
    setXesRoundtripReport('');
    setXesRoundtripError('');

    try {
      const exportPM = buildExportProcessMining(scope);
      if (!exportPM) {
        setXesRoundtripError('Segment nicht konfiguriert – bitte Segment-Filter setzen.');
        return;
      }

      const { xml } = buildXesXml({ processMining: exportPM, options: { logAttributes: { exportScope: scope, exportMode: xesExportMode } } });
      const parsed = parseXesXmlToAiEventLog({ xmlText: xml, fallbackSourceLabel: 'roundtrip.xes' });
      const draftSteps = version.sidecar.captureDraft?.happyPath ?? [];
      const { state: roundtripState } = normalizeAiEventLogToProcessMining({ ai: parsed.ai, sourceLabel: 'roundtrip', draftSteps, maxEvents: 200000 });

      const statsExport = computeEventLogStats(exportPM.events);
      const statsImported = computeEventLogStats(roundtripState.events);

      const ok = (v: boolean) => (v ? '✅' : '⚠️');

      const eventsMatch = statsImported.totalEvents === statsExport.totalEvents;
      const casesMatch = statsImported.totalCases === statsExport.totalCases;
      const activitiesOk = xesExportMode === 'step' ? statsImported.distinctActivities >= 1 : statsImported.distinctActivities === statsExport.distinctActivities;
      const noMissingTs = statsImported.missingTimestampEvents === 0;
      const attrKeysOk = statsImported.distinctAttributeKeys >= statsExport.distinctAttributeKeys;

      const lines: string[] = [
        '# XES Roundtrip Check',
        `Scope: ${scope}`,
        `Mode: ${xesExportMode}`,
        `TimeMode: ${exportPM.timeMode}`,
        '',
        '## Export Stats',
        `- Events: ${statsExport.totalEvents.toLocaleString('de-DE')}`,
        `- Cases: ${statsExport.totalCases.toLocaleString('de-DE')}`,
        `- Aktivitäten: ${statsExport.distinctActivities}`,
        `- Attr-Keys: ${statsExport.distinctAttributeKeys}`,
        `- Missing Timestamps: ${statsExport.missingTimestampEvents}`,
        statsExport.minTimestamp ? `- Zeitraum: ${statsExport.minTimestamp} – ${statsExport.maxTimestamp}` : '- Zeitraum: –',
        '',
        '## Re-Import Stats',
        `- Events: ${statsImported.totalEvents.toLocaleString('de-DE')}`,
        `- Cases: ${statsImported.totalCases.toLocaleString('de-DE')}`,
        `- Aktivitäten: ${statsImported.distinctActivities}`,
        `- Attr-Keys: ${statsImported.distinctAttributeKeys}`,
        `- Missing Timestamps: ${statsImported.missingTimestampEvents}`,
        `- Out-of-Order Cases: ${statsImported.casesWithOutOfOrderTimestamps}`,
        '',
        '## Invarianten / Warnungen',
        `${ok(eventsMatch)} Event-Anzahl: Export ${statsExport.totalEvents} / Import ${statsImported.totalEvents}${eventsMatch ? '' : ' – ABWEICHUNG'}`,
        `${ok(casesMatch)} Case-Anzahl: Export ${statsExport.totalCases} / Import ${statsImported.totalCases}${casesMatch ? '' : ' – ABWEICHUNG'}`,
        xesExportMode === 'step'
          ? `${ok(activitiesOk)} Aktivitäten (step-mode): Import ${statsImported.distinctActivities} (erwartet >= 1)`
          : `${ok(activitiesOk)} Aktivitäten: Export ${statsExport.distinctActivities} / Import ${statsImported.distinctActivities}${activitiesOk ? '' : ' – ABWEICHUNG'}`,
        `${ok(noMissingTs)} Missing Timestamps im Re-Import: ${statsImported.missingTimestampEvents}`,
        `${ok(attrKeysOk)} Attr-Keys: Export ${statsExport.distinctAttributeKeys} / Import ${statsImported.distinctAttributeKeys}${attrKeysOk ? '' : ' – weniger als exportiert'}`,
      ];

      setXesRoundtripReport(lines.join('\n'));
    } catch (err) {
      setXesRoundtripError(err instanceof Error ? err.message : String(err));
    } finally {
      setXesRoundtripRunning(false);
    }
  };


  const handleSaveMapping = async () => {
    if (!processMining || !localMappings) return;

    setSavingMapping(true);
    try {
      const next = updateActiveMiningDataset(processMining, { activityMappings: localMappings });
      await onSave({ sidecar: { ...version.sidecar, processMining: next } });
    } finally {
      setSavingMapping(false);
    }
  };

  useEffect(() => {
    if (processMining?.activityMappings) {
      setLocalMappings(processMining.activityMappings);
    } else {
      setLocalMappings([]);
    }
  }, [processMining?.activityMappings, processMining?.importedAt]);

  const handleAddSlaRule = async () => {
    if (!slaCanAddRule) return;
    const nowIso = new Date().toISOString();
    const rule: MiningSlaRule = {
      id: crypto.randomUUID(),
      enabled: true,
      name: slaName.trim(),
      kind: slaKind,
      thresholdMs: toMs(slaThresholdValue, slaThresholdUnit),
      createdAt: nowIso,
      updatedAt: nowIso,
      ...(slaKind === 'time_to_step' && {
        targetStepId: slaTargetStepId || undefined,
        countMissingAsBreach: slaMissingAsBreach,
      }),
      ...(slaKind === 'wait_between_steps' && {
        fromStepId: slaFromStepId || undefined,
        toStepId: slaToStepId || undefined,
        countMissingAsBreachForWait: slaMissingAsBreach,
      }),
      ...(slaKind === 'case_duration' && {
        countMissingAsBreach: slaMissingAsBreach,
      }),
    };
    const next = { ...processMining, slaRules: [...(processMining.slaRules ?? []), rule] };
    await onSave({ sidecar: { ...version.sidecar, processMining: next } });
    setSlaName('');
    setSlaTargetStepId('');
    setSlaFromStepId('');
    setSlaToStepId('');
    setSlaMissingAsBreach(false);
  };

  const handleToggleSlaRule = async (ruleId: string) => {
    if (!processMining) return;
    const next = {
      ...processMining,
      slaRules: (processMining.slaRules ?? []).map((r) =>
        r.id === ruleId ? { ...r, enabled: !r.enabled, updatedAt: new Date().toISOString() } : r
      ),
    };
    await onSave({ sidecar: { ...version.sidecar, processMining: next } });
  };

  const handleDeleteSlaRule = async (ruleId: string) => {
    if (!processMining) return;
    if (!confirm('SLA-Regel löschen?')) return;
    const next = {
      ...processMining,
      slaRules: (processMining.slaRules ?? []).filter((r) => r.id !== ruleId),
    };
    await onSave({ sidecar: { ...version.sidecar, processMining: next } });
  };

  useEffect(() => {
    const term = (mappingSearchPreset ?? '').trim();
    if (!term) return;
    setMiningView('mapping');
    setMappingSearch(term);
    onConsumedMappingSearchPreset?.();
  }, [mappingSearchPreset, onConsumedMappingSearchPreset, setMiningView]);

  const canImport =
    fileContent && selectedCaseCol >= 0 && selectedActivityCol >= 0 && selectedTimestampCol >= 0;

  const mappingsForAnalysis = useMemo(() => {
    return localMappings && localMappings.length > 0
      ? localMappings
      : processMining?.activityMappings ?? [];
  }, [localMappings, processMining?.activityMappings]);

  const filteredMappings = useMemo(() => {
    if (!localMappings) return [];
    if (!mappingSearch.trim()) return localMappings;

    const lower = mappingSearch.toLowerCase();
    return localMappings.filter((m) => m.example.toLowerCase().includes(lower));
  }, [localMappings, mappingSearch]);

  const mappingSuggestions = useMemo(() => {
    if (!showMappingAssistant) return {};
    const steps = version.sidecar.captureDraft?.happyPath ?? [];
    return suggestMappingsForActivities({
      activities: filteredMappings.slice(0, 80),
      steps,
      roles: version.sidecar.roles ?? [],
      systems: version.sidecar.systems ?? [],
      dataObjects: version.sidecar.dataObjects ?? [],
      maxSuggestions: 3,
      minScore: 0.25,
    });
  }, [
    showMappingAssistant,
    filteredMappings,
    version.sidecar.captureDraft,
    version.sidecar.roles,
    version.sidecar.systems,
    version.sidecar.dataObjects,
  ]);

  const availableAttributes = useMemo(() => {
    if (!processMining) return { keys: [], valuesByKey: new Map<string, string[]>() };
    const keyCounts = new Map<string, Map<string, number>>();
    for (const e of activeDatasetEvents) {
      if (!e.attributes) continue;
      for (const [k, v] of Object.entries(e.attributes)) {
        if (keyCounts.size >= 20 && !keyCounts.has(k)) continue;
        let vals = keyCounts.get(k);
        if (!vals) { vals = new Map(); keyCounts.set(k, vals); }
        if (vals.size < 30 || vals.has(v)) vals.set(v, (vals.get(v) ?? 0) + 1);
      }
    }
    const keys = Array.from(keyCounts.keys()).sort();
    const valuesByKey = new Map<string, string[]>();
    for (const [k, vMap] of keyCounts) {
      valuesByKey.set(k, Array.from(vMap.keys()).sort());
    }
    return { keys, valuesByKey };
  }, [processMining, activeDatasetEvents]);

  const filterA: SegmentFilter | null = useMemo(() => {
    if (!segmentActive || !segmentKey || !segmentValueA) return null;
    return { attributeKey: segmentKey, attributeValue: segmentValueA };
  }, [segmentActive, segmentKey, segmentValueA]);

  const filterB: SegmentFilter | null = useMemo(() => {
    if (!segmentActive || !compareActive || !segmentKey || !segmentValueB) return null;
    return { attributeKey: segmentKey, attributeValue: segmentValueB };
  }, [segmentActive, compareActive, segmentKey, segmentValueB]);

  const eventsA = useMemo(() => {
    if (!processMining) return [];
    const datasetEvents = activeDataset ? getDatasetEvents(activeDataset) : processMining.events;
    return filterEventsBySegment(datasetEvents, filterA);
  // eventsLoadTrigger is an intentional cache-invalidation trigger after IndexedDB loads
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processMining, activeDataset, filterA, getDatasetEvents, eventsLoadTrigger]);

  const eventsB = useMemo(() => {
    if (!processMining || !filterB) return null;
    const datasetEvents = activeDataset ? getDatasetEvents(activeDataset) : processMining.events;
    return filterEventsBySegment(datasetEvents, filterB);
  // eventsLoadTrigger is an intentional cache-invalidation trigger after IndexedDB loads
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processMining, activeDataset, filterB, getDatasetEvents, eventsLoadTrigger]);

  const compareKpis = useMemo(() => {
    if (!eventsB || eventsB.length === 0) return null;
    const casesA = new Set(eventsA.map((e) => e.caseId)).size;
    const casesB = new Set(eventsB.map((e) => e.caseId)).size;

    const variantsA = computeVariants(eventsA);
    const variantsB = computeVariants(eventsB);
    const topVariantA = variantsA[0] ?? null;
    const topVariantB = variantsB[0] ?? null;

    const draftSteps = version.sidecar.captureDraft?.happyPath;
    const timeMode: string | undefined = processMining?.timeMode;

    let conformanceAFull: ConformanceResult | null = null;
    let conformanceBFull: ConformanceResult | null = null;
    if (draftSteps && draftSteps.length > 0) {
      conformanceAFull = computeConformance({ events: eventsA, activityMappings: mappingsForAnalysis, draftSteps });
      conformanceBFull = computeConformance({ events: eventsB, activityMappings: mappingsForAnalysis, draftSteps });
    }

    const conformanceA = conformanceAFull ? { exactHappyPath: conformanceAFull.exactHappyPath } : null;
    const conformanceB = conformanceBFull ? { exactHappyPath: conformanceBFull.exactHappyPath } : null;

    type MappedVariantEntry = { variant: string; share: number; count: number; exampleCaseId?: string } | null;

    let topWaitMetricA: StepEnhancementMetric | null = null;
    let topWaitMetricB: StepEnhancementMetric | null = null;
    let topSpanMetricA: StepEnhancementMetric | null = null;
    let topSpanMetricB: StepEnhancementMetric | null = null;
    let topReworkMetricA: StepEnhancementMetric | null = null;
    let topReworkMetricB: StepEnhancementMetric | null = null;

    if (draftSteps && draftSteps.length > 0 && timeMode) {
      const enhA = computeStepEnhancement({ events: eventsA, draftSteps, activityMappings: mappingsForAnalysis, timeMode });
      const enhB = computeStepEnhancement({ events: eventsB, draftSteps, activityMappings: mappingsForAnalysis, timeMode });

      if (timeMode === 'real') {
        const sortedWaitA = enhA.filter((m) => m.medianWaitToNextMs !== null).sort((a, b) => (b.medianWaitToNextMs ?? 0) - (a.medianWaitToNextMs ?? 0));
        const sortedWaitB = enhB.filter((m) => m.medianWaitToNextMs !== null).sort((a, b) => (b.medianWaitToNextMs ?? 0) - (a.medianWaitToNextMs ?? 0));
        topWaitMetricA = sortedWaitA[0] ?? null;
        topWaitMetricB = sortedWaitB[0] ?? null;

        const sortedSpanA = enhA.filter((m) => m.medianSpanMs !== null).sort((a, b) => (b.medianSpanMs ?? 0) - (a.medianSpanMs ?? 0));
        const sortedSpanB = enhB.filter((m) => m.medianSpanMs !== null).sort((a, b) => (b.medianSpanMs ?? 0) - (a.medianSpanMs ?? 0));
        topSpanMetricA = sortedSpanA[0] ?? null;
        topSpanMetricB = sortedSpanB[0] ?? null;
      }

      const sortedReworkA = enhA.filter((m) => m.reworkCaseCount > 0).sort((a, b) => b.reworkPct - a.reworkPct);
      const sortedReworkB = enhB.filter((m) => m.reworkCaseCount > 0).sort((a, b) => b.reworkPct - a.reworkPct);
      topReworkMetricA = sortedReworkA[0] ?? null;
      topReworkMetricB = sortedReworkB[0] ?? null;
    }

    const topMappedVariantA: MappedVariantEntry = conformanceAFull?.mappedVariants[0] ?? null;
    const topMappedVariantB: MappedVariantEntry = conformanceBFull?.mappedVariants[0] ?? null;

    return {
      casesA, casesB, topVariantA, topVariantB, conformanceA, conformanceB,
      conformanceAFull, conformanceBFull,
      topWaitMetricA, topWaitMetricB, topSpanMetricA, topSpanMetricB, topReworkMetricA, topReworkMetricB,
      topMappedVariantA, topMappedVariantB,
    };
  }, [eventsA, eventsB, processMining, version.sidecar.captureDraft, mappingsForAnalysis]);

  const conformanceDrivers = useMemo(() => {
    if (!compareKpis?.conformanceAFull || !compareKpis?.conformanceBFull) return null;
    const steps = version.sidecar.captureDraft?.happyPath ?? [];
    if (steps.length === 0) return null;
    if (!filterA || !filterB) return null;
    return buildConformanceDriverAnalysis({
      conformanceA: compareKpis.conformanceAFull,
      conformanceB: compareKpis.conformanceBFull,
      topMappedVariantA: compareKpis.topMappedVariantA,
      topMappedVariantB: compareKpis.topMappedVariantB,
      draftSteps: steps,
      segmentLabelA: `Segment A (${filterA.attributeKey}=${filterA.attributeValue})`,
      segmentLabelB: `Segment B (${filterB.attributeKey}=${filterB.attributeValue})`,
    });
  }, [compareKpis, version.sidecar.captureDraft, filterA, filterB]);

  const variants = useMemo(() => {
    if (!processMining) return [];
    if (eventsA.length < HEAVY_VARIANTS_THRESHOLD) {
      return computeVariants(eventsA);
    }
    return variantsWorker ?? [];
  }, [processMining, eventsA, variantsWorker]);

  const conformance = useMemo(() => {
    if (!processMining || !version.sidecar.captureDraft) return null;
    return computeConformance({
      events: eventsA,
      activityMappings: mappingsForAnalysis,
      draftSteps: version.sidecar.captureDraft.happyPath,
    });
  }, [processMining, eventsA, version.sidecar.captureDraft, mappingsForAnalysis]);

  const alignmentConformanceA: AlignmentConformanceResult | null = useMemo(() => {
    if (!advancedConformanceEnabled) return null;
    if (!processMining || !version.sidecar.captureDraft) return null;
    const steps = version.sidecar.captureDraft.happyPath;
    if (steps.length === 0) return null;
    if (eventsA.length < HEAVY_ALIGNMENT_THRESHOLD) {
      return computeAlignmentConformance({
        events: eventsA,
        activityMappings: mappingsForAnalysis,
        draftSteps: steps,
      });
    }
    return alignmentWorkerA;
  }, [advancedConformanceEnabled, processMining, eventsA, version.sidecar.captureDraft, mappingsForAnalysis, alignmentWorkerA]);

  const alignmentConformanceB: AlignmentConformanceResult | null = useMemo(() => {
    if (!advancedConformanceEnabled) return null;
    if (!processMining || !version.sidecar.captureDraft) return null;
    if (!eventsB || eventsB.length === 0) return null;
    const steps = version.sidecar.captureDraft.happyPath;
    if (steps.length === 0) return null;
    if (eventsB.length < HEAVY_ALIGNMENT_THRESHOLD) {
      return computeAlignmentConformance({
        events: eventsB,
        activityMappings: mappingsForAnalysis,
        draftSteps: steps,
      });
    }
    return alignmentWorkerB;
  }, [advancedConformanceEnabled, processMining, eventsB, version.sidecar.captureDraft, mappingsForAnalysis, alignmentWorkerB]);

  const alignmentDisplayed = useMemo(() => {
    if (alignmentDetailSegment === 'B' && alignmentConformanceB) return alignmentConformanceB;
    return alignmentConformanceA;
  }, [alignmentDetailSegment, alignmentConformanceA, alignmentConformanceB]);

  const deviationAttributeSignalsA: AttributeSignalsResult | null = useMemo(() => {
    if (!alignmentConformanceA) return null;
    const ids = new Set(alignmentConformanceA.sampleDeviatingCaseIds ?? []);
    if (ids.size === 0) return null;
    return computeAttributeSignals({ events: eventsA, targetCaseIds: ids, minSupportCases: 10 });
  }, [alignmentConformanceA, eventsA]);

  const deviationAttributeSignalsB: AttributeSignalsResult | null = useMemo(() => {
    if (!alignmentConformanceB) return null;
    const ids = new Set(alignmentConformanceB.sampleDeviatingCaseIds ?? []);
    if (ids.size === 0) return null;
    if (!eventsB || eventsB.length === 0) return null;
    return computeAttributeSignals({ events: eventsB, targetCaseIds: ids, minSupportCases: 10 });
  }, [alignmentConformanceB, eventsB]);

  const deviationAttributeSignalsDisplayed = useMemo(() => {
    if (alignmentDetailSegment === 'B' && deviationAttributeSignalsB) return deviationAttributeSignalsB;
    return deviationAttributeSignalsA;
  }, [alignmentDetailSegment, deviationAttributeSignalsA, deviationAttributeSignalsB]);

  const bpmnConformance: BpmnConformanceResult | null = useMemo(() => {
    if (!advancedConformanceEnabled) return null;
    if (!bpmnConformanceEnabled) return null;
    if (!processMining || !version.sidecar.captureDraft) return null;
    const steps = version.sidecar.captureDraft.happyPath;
    if (steps.length === 0) return null;
    const bpmnXml = version.bpmn?.bpmnXml;
    if (!bpmnXml) return null;
    try {
      return computeBpmnConformance({
        bpmnXml,
        events: eventsA,
        activityMappings: mappingsForAnalysis,
        draftSteps: steps,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unbekannter Fehler in BPMN-Conformance';
      return {
        totalCases: 0,
        analyzedCases: 0,
        casesWithNoMappedSteps: { count: 0, pct: 0 },
        casesWithUnknownTasks: { count: 0, pct: 0 },
        casesWithIllegalStart: { count: 0, pct: 0 },
        casesWithIllegalTransition: { count: 0, pct: 0 },
        casesConformTransitions: { count: 0, pct: 0 },
        topIllegalTransitions: [],
        warnings: [msg],
        modelInfo: { tasks: 0, flows: 0, hasParallel: false, hasInclusive: false, hasEventBased: false },
      };
    }
  }, [advancedConformanceEnabled, bpmnConformanceEnabled, processMining, eventsA, version.sidecar.captureDraft, mappingsForAnalysis, version.bpmn?.bpmnXml]);

const draftTransitionConformance: DraftTransitionConformanceResult | null = useMemo(() => {
  if (!advancedConformanceEnabled) return null;
  if (!draftModelConformanceEnabled) return null;
  if (!processMining || !version.sidecar.captureDraft) return null;
  const steps = version.sidecar.captureDraft.happyPath;
  if (steps.length === 0) return null;
  const decisions = version.sidecar.captureDraft.decisions ?? [];
  return computeDraftTransitionConformance({
    events: eventsA,
    activityMappings: mappingsForAnalysis,
    draftSteps: steps,
    draftDecisions: decisions,
  });
}, [advancedConformanceEnabled, draftModelConformanceEnabled, processMining, eventsA, version.sidecar.captureDraft, mappingsForAnalysis]);

  const stepMetrics = useMemo(() => {
    if (!processMining || !version.sidecar.captureDraft) return [];
    return computeStepMetrics({
      events: eventsA,
      activityMappings: mappingsForAnalysis,
      draftSteps: version.sidecar.captureDraft.happyPath,
    });
  }, [processMining, eventsA, version.sidecar.captureDraft, mappingsForAnalysis]);

  const stepEnhancement = useMemo(() => {
    if (!processMining) return null;
    const steps = version.sidecar.captureDraft?.happyPath ?? [];
    if (steps.length === 0) return null;
    return computeStepEnhancement({
      events: eventsA,
      draftSteps: steps,
      activityMappings: mappingsForAnalysis,
      timeMode: processMining.timeMode,
    });
  }, [processMining, eventsA, version.sidecar.captureDraft, mappingsForAnalysis]);

  const topWaits = useMemo(() => {
    if (!stepEnhancement) return [];
    return stepEnhancement
      .filter((m) => m.medianWaitToNextMs !== null)
      .sort((a, b) => (b.medianWaitToNextMs ?? 0) - (a.medianWaitToNextMs ?? 0))
      .slice(0, 10);
  }, [stepEnhancement]);

  const topSpans = useMemo(() => {
    if (!stepEnhancement) return [];
    return stepEnhancement
      .filter((m) => m.medianSpanMs !== null)
      .sort((a, b) => (b.medianSpanMs ?? 0) - (a.medianSpanMs ?? 0))
      .slice(0, 10);
  }, [stepEnhancement]);

  const topRework = useMemo(() => {
    if (!stepEnhancement) return [];
    return stepEnhancement
      .filter((m) => m.reworkPct > 0)
      .sort((a, b) => b.reworkPct - a.reworkPct)
      .slice(0, 10);
  }, [stepEnhancement]);

  const [slaName, setSlaName] = useState('');
  const [slaKind, setSlaKind] = useState<'case_duration' | 'time_to_step' | 'wait_between_steps'>('case_duration');
  const [slaThresholdValue, setSlaThresholdValue] = useState<number>(24);
  const [slaThresholdUnit, setSlaThresholdUnit] = useState<'minutes' | 'hours' | 'days'>('hours');
  const [slaTargetStepId, setSlaTargetStepId] = useState<string>('');
  const [slaFromStepId, setSlaFromStepId] = useState<string>('');
  const [slaToStepId, setSlaToStepId] = useState<string>('');
  const [slaMissingAsBreach, setSlaMissingAsBreach] = useState<boolean>(false);

  const [rcThresholdMode, setRcThresholdMode] = useState<RootCauseThresholdMode>('p90');
  const [rcCustomValue, setRcCustomValue] = useState<number>(24);
  const [rcCustomUnit, setRcCustomUnit] = useState<'hours' | 'days'>('hours');
  const [rcMinSupport, setRcMinSupport] = useState<number>(10);

  function rcToMs(value: number, unit: 'hours' | 'days'): number {
    if (unit === 'hours') return value * 60 * 60 * 1000;
    return value * 24 * 60 * 60 * 1000;
  }

  const slaCanAddRule =
    !!processMining &&
    !!slaName.trim() &&
    (slaKind !== 'time_to_step' || !!slaTargetStepId) &&
    (slaKind !== 'wait_between_steps' || (!!slaFromStepId && !!slaToStepId && slaFromStepId !== slaToStepId));

  function toMs(value: number, unit: 'minutes' | 'hours' | 'days'): number {
    if (unit === 'minutes') return value * 60 * 1000;
    if (unit === 'hours') return value * 60 * 60 * 1000;
    return value * 24 * 60 * 60 * 1000;
  }

  type TransitionPerfMode = 'step' | 'activity';
  const [transitionPerfMode, setTransitionPerfMode] = useState<TransitionPerfMode>(() => {
    return (localStorage.getItem('pm.perf.mode') as TransitionPerfMode) || 'step';
  });

  useEffect(() => {
    scheduleDatasetSettingsSave({
      performance: { transitionPerfMode },
    });
  }, [transitionPerfMode, scheduleDatasetSettingsSave]);

  useEffect(() => {
    const customThresholdMs = rcCustomUnit === 'days'
      ? rcCustomValue * 24 * 60 * 60 * 1000
      : rcCustomValue * 60 * 60 * 1000;
    scheduleDatasetSettingsSave({
      rootCause: {
        thresholdMode: rcThresholdMode,
        customThresholdMs: rcThresholdMode === 'custom' ? customThresholdMs : undefined,
        minSupportCases: rcMinSupport,
      },
    });
  }, [rcThresholdMode, rcCustomValue, rcCustomUnit, rcMinSupport, scheduleDatasetSettingsSave]);

  const caseDurationStats = useMemo(() => {
    if (!processMining) return null;
    if (eventsA.length < HEAVY_DURATION_THRESHOLD) {
      return computeCaseDurationStats({ events: eventsA, timeMode: processMining.timeMode });
    }
    return caseDurationWorker;
  }, [processMining, eventsA, caseDurationWorker]);

  const transitionPerf = useMemo(() => {
    if (!processMining) return null;
    const draftSteps = version.sidecar.captureDraft?.happyPath ?? [];
    const activityKeyToStepIdMap = new Map<string, string>();
    const stepIdToLabelMap = new Map<string, string>();
    for (const step of draftSteps) {
      stepIdToLabelMap.set(step.stepId, `${step.order}. ${step.label}`);
    }
    for (const m of mappingsForAnalysis) {
      if (m.stepId) activityKeyToStepIdMap.set(m.activityKey, m.stepId);
    }
    const activityKeyToLabelMap = new Map<string, string>();
    for (const m of mappingsForAnalysis) {
      activityKeyToLabelMap.set(m.activityKey, m.example);
    }
    try {
      return computeTransitionPerformance({
        events: eventsA,
        mode: transitionPerfMode === 'step' ? 'step' : 'activity',
        activityKeyToStepId: activityKeyToStepIdMap,
        stepIdToLabel: stepIdToLabelMap,
        activityKeyToLabel: activityKeyToLabelMap,
        timeMode: processMining.timeMode,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) } as const;
    }
  }, [eventsA, transitionPerfMode, mappingsForAnalysis, processMining, version.sidecar.captureDraft]);

  const orgAnalytics: OrganizationAnalyticsResult | null = useMemo(() => {
    if (!processMining) return null;
    return computeOrganizationAnalytics({ events: eventsA });
  }, [processMining, eventsA]);

  const workload: WorkloadAnalyticsResult | null = useMemo(() => {
    if (!processMining) return null;
    return computeWorkloadAnalytics({
      events: eventsA,
      timeMode: processMining.timeMode,
      maxResources: 20,
    });
  }, [processMining, eventsA]);

  const rootCause: RootCauseResult | null = useMemo(() => {
    if (!processMining) return null;
    return computeRootCauseSignals({
      events: eventsA,
      thresholdMode: rcThresholdMode,
      customThresholdMs: rcThresholdMode === 'custom' ? rcToMs(rcCustomValue, rcCustomUnit) : undefined,
      minSupportCases: rcMinSupport,
      timeMode: processMining.timeMode,
    });
  }, [processMining, eventsA, rcThresholdMode, rcCustomValue, rcCustomUnit, rcMinSupport]);

  const summary = useMemo(() => {
    if (!processMining) return null;

    const cases = new Set(eventsA.map((e) => e.caseId));
    const activities = new Set(eventsA.map((e) => e.activity));

    let minTime = Number.POSITIVE_INFINITY;
    let maxTime = Number.NEGATIVE_INFINITY;
    for (const e of eventsA) {
      const t = Date.parse(e.timestamp);
      if (!Number.isFinite(t)) continue;
      if (t < minTime) minTime = t;
      if (t > maxTime) maxTime = t;
    }
    const hasRange = Number.isFinite(minTime) && Number.isFinite(maxTime);
    const timeRange = hasRange
      ? { min: new Date(minTime).toLocaleString('de-DE'), max: new Date(maxTime).toLocaleString('de-DE') }
      : { min: '–', max: '–' };

    return {
      eventsCount: eventsA.length,
      casesCount: cases.size,
      activitiesCount: activities.size,
      timeRange,
    };
  }, [processMining, eventsA]);

  const quality = useMemo(() => {
    if (!processMining) return null;
    return computeEventLogQuality({
      events: eventsA,
      activityMappings: mappingsForAnalysis,
    });
  }, [processMining, eventsA, mappingsForAnalysis]);

  const caseIndex = useMemo(() => {
    if (!processMining) return null;
    return buildCaseIndex(eventsA);
  }, [processMining, eventsA]);

  const slaEval = useMemo(() => {
    if (!processMining) return null;
    if (!version.sidecar.captureDraft) return null;
    const rules = processMining.slaRules ?? [];
    if (rules.length === 0) return null;
    return evaluateSlaRules({
      events: eventsA,
      activityMappings: mappingsForAnalysis,
      draftSteps: version.sidecar.captureDraft.happyPath,
      rules,
      timeMode: processMining.timeMode,
    });
  }, [processMining, eventsA, mappingsForAnalysis, version.sidecar.captureDraft]);

  const activityKeyToStepLabel = useMemo(() => {
    const map = new Map<string, string>();
    const draftSteps = version.sidecar.captureDraft?.happyPath ?? [];
    const stepById = new Map(draftSteps.map((s) => [s.stepId, s.label]));
    for (const m of mappingsForAnalysis) {
      if (m.stepId) {
        const label = stepById.get(m.stepId);
        if (label) map.set(m.activityKey, label);
      }
    }
    return map;
  }, [mappingsForAnalysis, version.sidecar.captureDraft]);

  const dfgCacheKey = useMemo(() => {
    const datasetId = processMining?.activeDatasetId ?? 'none';
    const segmentSig = filterA ? `${filterA.attributeKey}=${filterA.attributeValue}` : 'all';

    const mappingSig = mappingsForAnalysis
      .map((m) => `${m.activityKey}:${m.stepId ?? ''}`)
      .sort()
      .join(',');

    const draftSteps = version.sidecar.captureDraft?.happyPath ?? [];
    const draftSig = draftSteps
      .map((s) => `${s.stepId}:${s.order}`)
      .sort()
      .join(',');

    const timeMode = processMining?.timeMode;

    return `dfg|${datasetId}|${dfgMode}|${segmentSig}|${mappingSig}|${draftSig}|${timeMode}`;
  }, [processMining, dfgMode, filterA, mappingsForAnalysis, version.sidecar.captureDraft]);

  const dfgMappings = useMemo(() => {
    const draftSteps = version.sidecar.captureDraft?.happyPath ?? [];
    const activityKeyToStepId = new Map<string, string>();
    const stepIdToLabel = new Map<string, string>();
    const stepIdToOrder = new Map<string, number>();
    const activityKeyToLabel = new Map<string, string>();

    for (const step of draftSteps) {
      stepIdToLabel.set(step.stepId, step.label);
      stepIdToOrder.set(step.stepId, step.order);
    }
    for (const m of mappingsForAnalysis) {
      if (m.stepId) activityKeyToStepId.set(m.activityKey, m.stepId);
      activityKeyToLabel.set(m.activityKey, m.example);
    }
    return { activityKeyToStepId, stepIdToLabel, stepIdToOrder, activityKeyToLabel };
  }, [mappingsForAnalysis, version.sidecar.captureDraft]);

  const dfg = useMemo(() => {
    if (!processMining) return null;
    if (eventsA.length < HEAVY_DFG_THRESHOLD) {
      return buildDirectlyFollowsGraph({
        events: eventsA,
        mode: dfgMode,
        activityKeyToStepId: dfgMappings.activityKeyToStepId,
        stepIdToLabel: dfgMappings.stepIdToLabel,
        activityKeyToLabel: dfgMappings.activityKeyToLabel,
        timeMode: processMining.timeMode,
      });
    }
    return dfgWorkerResult;
  }, [processMining, eventsA, dfgMode, dfgMappings, dfgWorkerResult]);

  useEffect(() => {
    if (!processMining || eventsA.length < HEAVY_DFG_THRESHOLD) {
      return;
    }

    let cancelled = false;

    const computeDfgInWorker = async () => {
      setDfgWorkerStatus('computing');
      setDfgWorkerResult(null);
      setDfgWorkerError('');

      try {
        const result = await runMiningTask<BuildDfgResult>({
          kind: 'dfg',
          cacheKey: dfgCacheKey,
          events: eventsA,
          mode: dfgMode,
          activityMappings: mappingsForAnalysis,
          draftSteps: version.sidecar.captureDraft?.happyPath ?? [],
          timeMode: processMining.timeMode,
        });

        if (cancelled) return;
        setDfgWorkerResult(result);
        setDfgWorkerStatus('idle');
      } catch (err) {
        if (cancelled) return;
        const errorMessage = err instanceof Error ? err.message : String(err);
        setDfgWorkerError(errorMessage);
        setDfgWorkerStatus('error');
      }
    };

    computeDfgInWorker();

    return () => { cancelled = true; };
  }, [processMining, eventsA, dfgMode, mappingsForAnalysis, version.sidecar.captureDraft, dfgCacheKey]);

  useEffect(() => {
    if (!processMining || eventsA.length < HEAVY_VARIANTS_THRESHOLD) {
      return;
    }

    let cancelled = false;

    const computeVariantsInWorker = async () => {
      setVariantsWorkerStatus('computing');
      setVariantsWorker(null);
      setVariantsWorkerError('');

      try {
        const datasetId = processMining.activeDatasetId ?? 'none';
        const segmentSig = filterA ? `${filterA.attributeKey}=${filterA.attributeValue}` : 'all';
        const timeMode = processMining.timeMode;
        const cacheKey = `variants|${datasetId}|${segmentSig}|${timeMode}`;

        const result = await runMiningTask<Array<{variant:string; count:number; share:number}>>({
          kind: 'variants',
          cacheKey,
          events: eventsA,
        });

        if (cancelled) return;
        setVariantsWorker(result);
        setVariantsWorkerStatus('idle');
      } catch (err) {
        if (cancelled) return;
        const errorMessage = err instanceof Error ? err.message : String(err);
        setVariantsWorkerError(errorMessage);
        setVariantsWorkerStatus('error');
      }
    };

    computeVariantsInWorker();

    return () => { cancelled = true; };
  }, [processMining, eventsA, filterA]);

  useEffect(() => {
    if (!processMining || eventsA.length < HEAVY_DURATION_THRESHOLD) {
      return;
    }

    let cancelled = false;

    const computeCaseDurationInWorker = async () => {
      setCaseDurationWorkerStatus('computing');
      setCaseDurationWorker(null);
      setCaseDurationWorkerError('');

      try {
        const datasetId = processMining.activeDatasetId ?? 'none';
        const segmentSig = filterA ? `${filterA.attributeKey}=${filterA.attributeValue}` : 'all';
        const timeMode = processMining.timeMode;
        const cacheKey = `caseDuration|${datasetId}|${segmentSig}|${timeMode}`;

        const result = await runMiningTask<ReturnType<typeof computeCaseDurationStats>>({
          kind: 'caseDurationStats',
          cacheKey,
          events: eventsA,
          timeMode,
        });

        if (cancelled) return;
        setCaseDurationWorker(result);
        setCaseDurationWorkerStatus('idle');
      } catch (err) {
        if (cancelled) return;
        const errorMessage = err instanceof Error ? err.message : String(err);
        setCaseDurationWorkerError(errorMessage);
        setCaseDurationWorkerStatus('error');
      }
    };

    computeCaseDurationInWorker();

    return () => { cancelled = true; };
  }, [processMining, eventsA, filterA]);

  useEffect(() => {
    if (!advancedConformanceEnabled || !processMining || !version.sidecar.captureDraft) {
      return;
    }
    const steps = version.sidecar.captureDraft.happyPath;
    if (steps.length === 0 || eventsA.length < HEAVY_ALIGNMENT_THRESHOLD) {
      return;
    }

    let cancelled = false;

    const computeAlignmentInWorkerA = async () => {
      setAlignmentWorkerStatusA('computing');
      setAlignmentWorkerA(null);
      setAlignmentWorkerErrorA('');

      try {
        const datasetId = processMining.activeDatasetId ?? 'none';
        const segmentSig = filterA ? `${filterA.attributeKey}=${filterA.attributeValue}` : 'all';
        const mappingSig = mappingsForAnalysis.map(m => `${m.activityKey}:${m.stepId}`).join(',');
        const draftSig = steps.map(s => s.stepId).join(',');
        const cacheKey = `align|A|${datasetId}|${segmentSig}|${mappingSig}|${draftSig}`;

        const result = await runMiningTask<ReturnType<typeof computeAlignmentConformance>>({
          kind: 'alignmentConformance',
          cacheKey,
          events: eventsA,
          activityMappings: mappingsForAnalysis,
          draftSteps: steps,
        });

        if (cancelled) return;
        setAlignmentWorkerA(result);
        setAlignmentWorkerStatusA('idle');
      } catch (err) {
        if (cancelled) return;
        const errorMessage = err instanceof Error ? err.message : String(err);
        setAlignmentWorkerErrorA(errorMessage);
        setAlignmentWorkerStatusA('error');
      }
    };

    computeAlignmentInWorkerA();

    return () => { cancelled = true; };
  }, [advancedConformanceEnabled, processMining, eventsA, filterA, version.sidecar.captureDraft, mappingsForAnalysis]);

  useEffect(() => {
    if (!advancedConformanceEnabled || !processMining || !version.sidecar.captureDraft) {
      return;
    }
    if (!eventsB || eventsB.length === 0) {
      return;
    }
    const steps = version.sidecar.captureDraft.happyPath;
    if (steps.length === 0 || eventsB.length < HEAVY_ALIGNMENT_THRESHOLD) {
      return;
    }

    let cancelled = false;

    const computeAlignmentInWorkerB = async () => {
      setAlignmentWorkerStatusB('computing');
      setAlignmentWorkerB(null);
      setAlignmentWorkerErrorB('');

      try {
        const datasetId = processMining.activeDatasetId ?? 'none';
        const segmentSig = filterB ? `${filterB.attributeKey}=${filterB.attributeValue}` : 'all';
        const mappingSig = mappingsForAnalysis.map(m => `${m.activityKey}:${m.stepId}`).join(',');
        const draftSig = steps.map(s => s.stepId).join(',');
        const cacheKey = `align|B|${datasetId}|${segmentSig}|${mappingSig}|${draftSig}`;

        const result = await runMiningTask<ReturnType<typeof computeAlignmentConformance>>({
          kind: 'alignmentConformance',
          cacheKey,
          events: eventsB,
          activityMappings: mappingsForAnalysis,
          draftSteps: steps,
        });

        if (cancelled) return;
        setAlignmentWorkerB(result);
        setAlignmentWorkerStatusB('idle');
      } catch (err) {
        if (cancelled) return;
        const errorMessage = err instanceof Error ? err.message : String(err);
        setAlignmentWorkerErrorB(errorMessage);
        setAlignmentWorkerStatusB('error');
      }
    };

    computeAlignmentInWorkerB();

    return () => { cancelled = true; };
  }, [advancedConformanceEnabled, processMining, eventsB, filterB, version.sidecar.captureDraft, mappingsForAnalysis]);

  const dfgFiltered = useMemo(() => {
    if (!dfg) return null;

    const sortedNodes = dfg.nodes.slice().sort((a, b) => b.occurrences - a.occurrences);
    const topNodes = sortedNodes.slice(0, maxNodes);
    const allowedKeys = new Set(topNodes.map((n) => n.key));

    const filteredEdges = dfg.edges
      .filter((e) => e.count >= minEdgeCount && allowedKeys.has(e.from) && allowedKeys.has(e.to))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return (b.medianDeltaMs ?? 0) - (a.medianDeltaMs ?? 0);
      });

    return { topNodes, filteredEdges, allowedKeys };
  }, [dfg, maxNodes, minEdgeCount]);

  const { nodeHeatMax, edgeHeatMax } = useMemo(() => {
    if (!dfgFiltered || !processMining) {
      return { nodeHeatMax: 0, edgeHeatMax: 0 };
    }

    let nodeMax = 0;
    for (const node of dfgFiltered.topNodes) {
      const value = dfgHeatMetric === 'median' ? node.medianOutDeltaMs : node.p95OutDeltaMs;
      if (value !== null && value > nodeMax) nodeMax = value;
    }

    let edgeMax = 0;
    for (const edge of dfgFiltered.filteredEdges) {
      const value = dfgHeatMetric === 'median' ? edge.medianDeltaMs : edge.p95DeltaMs;
      if (value !== null && value > edgeMax) edgeMax = value;
    }

    return { nodeHeatMax: nodeMax, edgeHeatMax: edgeMax };
  }, [dfgFiltered, dfgHeatMetric, processMining]);

  const filteredCaseIds = useMemo(() => {
    if (!caseIndex) return [];
    const term = caseSearch.trim().toLowerCase();
    if (!term) return caseIndex.caseIds.slice(0, 30);
    return caseIndex.caseIds.filter((id) => id.toLowerCase().includes(term)).slice(0, 30);
  }, [caseIndex, caseSearch]);

  const selectedCaseEvents = useMemo(() => {
    if (!caseIndex || !selectedCaseId) return null;
    return caseIndex.cases.get(selectedCaseId) ?? null;
  }, [caseIndex, selectedCaseId]);

  const selectedCaseDurationMs = useMemo(() => {
    if (!selectedCaseEvents || selectedCaseEvents.length < 2) return null;
    const first = new Date(selectedCaseEvents[0].timestamp).getTime();
    const last = new Date(selectedCaseEvents[selectedCaseEvents.length - 1].timestamp).getTime();
    return last - first;
  }, [selectedCaseEvents]);

  const happyPathSuggestion = useMemo(() => {
    if (!conformance || !conformance.mappedVariants.length) return null;
    const happyPath = version.sidecar.captureDraft?.happyPath;
    if (!happyPath || happyPath.length < 2) return null;

    const top = conformance.mappedVariants[0];
    const orders = top.variant
      .split('\u2192')
      .map((s) => parseInt(s.trim(), 10))
      .filter(Number.isFinite);

    if (orders.length === 0) return null;

    const stepByOrder = new Map<number, CaptureDraftStep>();
    for (const step of happyPath) {
      stepByOrder.set(step.order, step);
    }

    const suggestedSteps: CaptureDraftStep[] = [];
    const missingOrders: number[] = [];
    for (const o of orders) {
      const step = stepByOrder.get(o);
      if (step) {
        suggestedSteps.push(step);
      } else {
        missingOrders.push(o);
      }
    }

    const suggWarnings: string[] = [];
    if (suggestedSteps.length === 0) {
      suggWarnings.push('Keine gemappte Variante verfügbar (Mapping prüfen).');
      return { suggestedSteps: [], top, warnings: suggWarnings };
    }
    if (missingOrders.length > 0) {
      suggWarnings.push(`Orders ${missingOrders.join(', ')} aus der Top-Variante konnten keinem Step zugeordnet werden.`);
    }

    return { suggestedSteps, top, warnings: suggWarnings };
  }, [conformance, version.sidecar.captureDraft]);

  const handleApplyHappyPathSuggestion = async () => {
    if (!happyPathSuggestion || happyPathSuggestion.suggestedSteps.length < 2) return;
    const happyPath = version.sidecar.captureDraft?.happyPath;
    if (!happyPath) return;

    if (!confirm('Happy Path Reihenfolge wird angepasst. Step IDs bleiben erhalten. Fortfahren?')) return;

    const selectedSet = new Set(happyPathSuggestion.suggestedSteps.map((s) => s.stepId));
    const remaining = happyPath.filter((s) => !selectedSet.has(s.stepId)).sort((a, b) => a.order - b.order);
    const combined = appendRemaining
      ? [...happyPathSuggestion.suggestedSteps, ...remaining]
      : [...happyPathSuggestion.suggestedSteps];
    const reNumbered = combined.map((s, idx) => ({ ...s, order: idx + 1 }));

    await onSave({
      sidecar: {
        ...version.sidecar,
        captureDraft: {
          ...version.sidecar.captureDraft!,
          happyPath: reNumbered,
        },
      },
    });
    setHappyPathStatus('Happy Path Vorschlag angewendet.');
  };

  function normalizeTitleKey(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9äöüß]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function findDuplicate(items: ImprovementBacklogItem[], titleKey: string, relatedStepId: string): ImprovementBacklogItem | null {
    return items.find(
      (item) => item.scope === 'step' && item.relatedStepId === relatedStepId && normalizeTitleKey(item.title) === titleKey
    ) ?? null;
  }

  type MiningFindingKind = 'wait' | 'span' | 'rework';
  type MiningContext = { scopeLabel: string; segmentLabel?: string; sourceLabel: string; importedAt: string; timeMode: string };

  const createImprovementFromStepMetric = async (params: {
    kind: MiningFindingKind;
    metric: StepEnhancementMetric;
    context: MiningContext;
    exampleCaseId?: string;
  }) => {
    if (!processMining) return;
    const { kind, metric, context, exampleCaseId } = params;
    const backlog = version.sidecar.improvementBacklog ?? [];
    const now = new Date().toISOString();

    let baseTitle: string;
    let category: ImprovementCategory;
    let impact: Level3;
    if (kind === 'wait') {
      baseTitle = `Wartezeiten reduzieren bei: ${metric.label}`;
      category = 'automate';
      impact = 'high';
    } else if (kind === 'span') {
      baseTitle = `Bearbeitungszeit reduzieren bei: ${metric.label}`;
      category = 'standardize';
      impact = 'high';
    } else {
      baseTitle = `Rework reduzieren bei: ${metric.label}`;
      category = 'standardize';
      impact = metric.reworkPct >= 0.15 ? 'high' : 'medium';
    }

    const title = context.segmentLabel ? `${baseTitle} (${context.segmentLabel})` : baseTitle;
    const titleKey = normalizeTitleKey(title);

    if (findDuplicate(backlog, titleKey, metric.stepId)) {
      setMiningBacklogStatus('Maßnahme existiert bereits für diesen Schritt.');
      return;
    }

    const description = [
      `Quelle: Process Mining \u2013 ${context.sourceLabel} (importiert: ${context.importedAt}, timeMode: ${context.timeMode})`,
      `Scope: ${context.scopeLabel}${context.segmentLabel ? ` / ${context.segmentLabel}` : ''}`,
      `Schritt: ${metric.order}. ${metric.label} (stepId=${metric.stepId})`,
      `Coverage: ${(metric.caseCoverage * 100).toFixed(1)}% (${metric.caseCount} Cases), Events: ${metric.eventCount}`,
      `Median Span: ${metric.medianSpanMs !== null ? formatDurationShort(metric.medianSpanMs) : '\u2013'}`,
      `Median Wait: ${metric.medianWaitToNextMs !== null ? formatDurationShort(metric.medianWaitToNextMs) : '\u2013'}`,
      `Rework: ${metric.reworkCaseCount > 0 ? `${(metric.reworkPct * 100).toFixed(1)}% (${metric.reworkCaseCount} Cases)` : '\u2013'}`,
      `Beispiel-Case: ${exampleCaseId ?? '\u2013'}`,
      'Hinweis: Diese Maßnahme wurde aus Mining-Metriken abgeleitet und muss fachlich bestätigt werden.',
    ].join('\n');

    const newItem: ImprovementBacklogItem = {
      id: crypto.randomUUID(),
      title,
      category,
      scope: 'step',
      relatedStepId: metric.stepId,
      description,
      impact,
      effort: 'medium',
      risk: 'medium',
      status: 'idea',
      createdAt: now,
      updatedAt: now,
    };

    setMiningBacklogBusy(true);
    try {
      await onSave({ sidecar: { ...version.sidecar, improvementBacklog: [...backlog, newItem] } });
      setMiningBacklogStatus(`Maßnahme angelegt: "${title}"`);
      setMiningBacklogError('');
      if (onGoToImprovement) onGoToImprovement(newItem.id);
    } catch (err) {
      setMiningBacklogError(err instanceof Error ? err.message : String(err));
    } finally {
      setMiningBacklogBusy(false);
    }
  };

  const applyBucketsFromMetric = async (metric: StepEnhancementMetric) => {
    const draft = version.sidecar.captureDraft;
    const steps = draft?.happyPath ?? [];
    if (steps.length === 0) {
      setBucketStatus('Kein Draft vorhanden.');
      return;
    }
    const step = steps.find((s) => s.stepId === metric.stepId);
    if (!step) return;

    const timeMode = processMining?.timeMode;

    const suggestedVolume = volumeBucketFromCoverage(metric.caseCoverage);
    const suggestedRework = reworkBucketFromPct(metric.reworkPct);
    const suggestedProc: StepLeadTimeBucket = (timeMode === 'real' && metric.medianSpanMs !== null) ? leadTimeBucketFromMs(metric.medianSpanMs) : 'unknown';
    const suggestedWait: StepLeadTimeBucket = (timeMode === 'real' && metric.medianWaitToNextMs !== null) ? leadTimeBucketFromMs(metric.medianWaitToNextMs) : 'unknown';

    const changes: { field: string; from: string; to: StepLeadTimeBucket | StepLevelBucket }[] = [];

    if ((!step.processingTime || step.processingTime === 'unknown') && suggestedProc !== 'unknown') {
      changes.push({ field: 'processingTime', from: step.processingTime ?? 'unknown', to: suggestedProc });
    }
    if ((!step.waitingTime || step.waitingTime === 'unknown') && suggestedWait !== 'unknown') {
      changes.push({ field: 'waitingTime', from: step.waitingTime ?? 'unknown', to: suggestedWait });
    }
    if ((!step.volume || step.volume === 'unknown') && suggestedVolume !== 'unknown') {
      changes.push({ field: 'volume', from: step.volume ?? 'unknown', to: suggestedVolume });
    }
    if ((!step.rework || step.rework === 'unknown') && suggestedRework !== 'unknown') {
      changes.push({ field: 'rework', from: step.rework ?? 'unknown', to: suggestedRework });
    }

    if (changes.length === 0) {
      setBucketStatus('Keine neuen Buckets (bereits gesetzt oder keine Daten).');
      return;
    }

    const changeText = changes.map((c) => `${c.field}: ${c.from} \u2192 ${c.to}`).join('\n');
    if (!confirm(`Buckets übernehmen für "${metric.label}"?\n${changeText}`)) return;

    setBucketBusy(true);
    try {
      const updatedSteps = steps.map((s) => {
        if (s.stepId !== metric.stepId) return s;
        const updated = { ...s };
        for (const c of changes) {
          if (c.field === 'processingTime') updated.processingTime = c.to as StepLeadTimeBucket;
          if (c.field === 'waitingTime') updated.waitingTime = c.to as StepLeadTimeBucket;
          if (c.field === 'volume') updated.volume = c.to as StepLevelBucket;
          if (c.field === 'rework') updated.rework = c.to as StepLevelBucket;
        }
        return updated;
      });
      await onSave({
        sidecar: {
          ...version.sidecar,
          captureDraft: { ...draft!, happyPath: updatedSteps },
        },
      });
      setBucketStatus('Buckets übernommen (nur unknown Felder).');
      setBucketError('');
    } catch (err) {
      setBucketError(err instanceof Error ? err.message : String(err));
    } finally {
      setBucketBusy(false);
    }
  };

  if (expertValidationError) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-300 rounded-2xl p-6 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-800 mb-1">
              Ungültiger Datenzustand – Experten-Mining gesperrt
            </p>
            <p className="text-sm text-red-700 whitespace-pre-wrap leading-relaxed">
              {expertValidationError}
            </p>
            <p className="text-xs text-red-600 mt-3 leading-relaxed">
              Process Mining ist ausschließlich auf Basis realer, vollständig validierter Event Logs zulässig.
              Bitte das betroffene Dataset entfernen und das Event Log neu importieren
              (CSV-Export aus Jira, ServiceNow o.ä.). Synthetische, abgeschnittene oder
              unvollständige Altdaten werden aus Qualitätsgründen nicht weiterverarbeitet.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (eventsLoadError) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-300 rounded-2xl p-6 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-800 mb-1">
              Dataset-Events nicht ladbar – Experten-Mining gesperrt
            </p>
            <p className="text-sm text-red-700 whitespace-pre-wrap leading-relaxed">
              {eventsLoadError}
            </p>
            <p className="text-xs text-red-600 mt-3 leading-relaxed">
              Externalisierte Events konnten nicht validiert geladen werden.
              Process Mining wird nicht mit unvollständigen oder unvalidierten Daten fortgesetzt.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="pm-card pm-card-pad">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-900">Process Mining</h2>
            <HelpPopover helpKey="mining.overview" ariaLabel="Hilfe: Process Mining" />
          </div>
        </div>

        <p className="text-sm text-slate-600 mb-4">
          Importieren Sie einen Event Log (CSV) für Discovery, Conformance-Checking und Enhancement.
        </p>

        {processMining && summary && (
          <div className="mb-4 space-y-3">
            <div className="bg-slate-50 border border-slate-200 rounded-md px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Datasets</span>
                <HelpPopover helpKey="mining.datasets" ariaLabel="Hilfe: Datasets" />
                <span className="text-xs text-slate-400">({datasets.length})</span>
              </div>

              {datasets.length > 1 ? (
                <select
                  value={activeId}
                  onChange={(e) => handleSwitchDataset(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm bg-white mb-2"
                >
                  {datasets.map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      {ds.sourceLabel} — {new Date(ds.importedAt).toLocaleString('de-DE')}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm font-medium text-slate-900 mb-2">{processMining.sourceLabel}</div>
              )}

              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                  <FileText className="w-3 h-3" />
                  {summary.eventsCount.toLocaleString('de-DE')} Events
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                  <Users className="w-3 h-3" />
                  {summary.casesCount.toLocaleString('de-DE')} Cases
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                  Realzeit
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">
                  {new Date(processMining.importedAt).toLocaleDateString('de-DE')}
                </span>
                {activeDataset?.provenance && (
                  <>
                    {activeDataset.provenance.kind === 'transform' && activeDataset.provenance.createdFromLabel && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">
                        {activeDataset.provenance.method === 'duplicate'
                          ? `Dupliziert von: ${activeDataset.provenance.createdFromLabel}`
                          : activeDataset.provenance.method === 'timeslice'
                            ? `Zeitschnitt: ${activeDataset.provenance.window?.startIso.slice(0, 7) || ''}`
                            : `Erzeugt aus: ${activeDataset.provenance.createdFromLabel}`
                        }
                      </span>
                    )}
                    {activeDataset.provenance.kind === 'import' && activeDataset.provenance.method && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs">
                        Import: {activeDataset.provenance.method === 'csv' ? 'CSV' : activeDataset.provenance.method === 'xes' ? 'XES' : activeDataset.provenance.method === 'tool_history' ? 'Tool-Historie' : activeDataset.provenance.method}
                      </span>
                    )}
                  </>
                )}
              </div>

              {dsRenameId === activeId ? (
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="text"
                    value={dsRenameValue}
                    onChange={(e) => setDsRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRenameDataset(); if (e.key === 'Escape') setDsRenameId(null); }}
                    className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm"
                    autoFocus
                  />
                  <button onClick={handleRenameDataset} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-slate-700 text-white hover:bg-slate-800 transition-colors">
                    <Check className="w-3 h-3" />
                  </button>
                  <button onClick={() => setDsRenameId(null)} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (miningView !== 'data') {
                        setMiningView('data');
                        setShowImportPanel(true);
                      } else {
                        setShowImportPanel((prev) => !prev);
                      }
                    }}
                    className="pm-btn-primary"
                  >
                    <PlusCircle className="w-4 h-4" />
                    {miningView !== 'data' ? 'Dataset hinzufügen' : (showImportPanel ? 'Import schliessen' : 'Dataset hinzufügen')}
                  </button>
                </div>

                <details className="relative">
                  <summary className="list-none inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer">
                    <MoreVertical className="w-4 h-4" />
                    Aktionen
                  </summary>
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-lg p-1 z-50">
                    <button
                      onClick={(e) => {
                        e.currentTarget.closest('details')?.removeAttribute('open');
                        setDsRenameId(activeId);
                        setDsRenameValue(processMining.sourceLabel);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded transition-colors text-left"
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Umbenennen</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.currentTarget.closest('details')?.removeAttribute('open');
                        handleDuplicateDataset(activeId);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded transition-colors text-left"
                    >
                      <CopyPlus className="w-4 h-4" />
                      <span>Duplizieren</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.currentTarget.closest('details')?.removeAttribute('open');
                        handleDeleteDataset(activeId);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded transition-colors text-left"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Dataset löschen</span>
                    </button>
                    <div className="h-px bg-slate-200 my-1"></div>
                    <button
                      onClick={(e) => {
                        e.currentTarget.closest('details')?.removeAttribute('open');
                        handleRemoveLog();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded transition-colors text-left"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Alle Mining-Daten entfernen</span>
                    </button>
                  </div>
                </details>
              </div>
            </div>
          </div>
        )}
      </div>

      {(miningView === 'data') && showImportPanel && (
        <div className="space-y-4">
          {processMining && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                Hinweis: Ein neuer Import wird als zusätzliches Dataset hinzugefügt und automatisch aktiviert. Zwischen Datasets kann über die Dataset-Auswahl gewechselt werden.
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="block text-sm font-medium text-slate-700">Quelle/Label</label>
                <HelpPopover helpKey="mining.sourceLabel" ariaLabel="Hilfe: Quellenlabel" />
              </div>
              <input
                type="text"
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                placeholder="z.B. SAP Event Log"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              />
            </div>

            <div className="pm-card p-4 mt-4">
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setDataImportTab('csv')}
                  className={dataImportTab === 'csv' ? 'pm-tab pm-tab-active' : 'pm-tab pm-tab-inactive'}
                >
                  CSV
                </button>
                <button
                  onClick={() => setDataImportTab('xes')}
                  className={dataImportTab === 'xes' ? 'pm-tab pm-tab-active' : 'pm-tab pm-tab-inactive'}
                >
                  XES
                </button>
                <button
                  onClick={() => setDataImportTab('tool')}
                  className={dataImportTab === 'tool' ? 'pm-tab pm-tab-active' : 'pm-tab pm-tab-inactive'}
                >
                  Tool-Historie
                </button>
              </div>

            {dataImportTab === 'tool' && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Tool-Historie (Jira/ServiceNow)</h3>
              <p className="text-xs text-slate-500 mb-3">
                Erwartet einen Export der Ticket-Änderungshistorie (jede Zeile = Änderung). Standard: Status/State-Wechsel.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Quelle</label>
                  <select
                    value={toolHistoryPreferred}
                    onChange={(e) => setToolHistoryPreferred(e.target.value as 'auto' | ToolHistoryKind)}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                  >
                    <option value="auto">Auto (erkennen)</option>
                    <option value="jira">Jira</option>
                    <option value="servicenow">ServiceNow</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Importmodus</label>
                  <select
                    value={toolHistoryFilterMode}
                    onChange={(e) => setToolHistoryFilterMode(e.target.value as ToolHistoryFilterMode)}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                  >
                    <option value="status_only">Nur Status/State (empfohlen)</option>
                    <option value="all_fields">Alle Felder (mehr Rauschen)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 mb-3">
                <label className="flex items-center gap-2 px-4 py-2 bg-teal-700 text-white rounded-md hover:bg-teal-800 cursor-pointer text-sm">
                  <Upload className="w-4 h-4" />
                  Tool-Historie auswählen
                  <input
                    type="file"
                    accept=".csv,.html,.htm"
                    onChange={handleToolHistoryFileSelect}
                    onClick={(e) => { (e.currentTarget as HTMLInputElement).value = ''; }}
                    className="hidden"
                  />
                </label>
                {toolHistoryFileName && (
                  <span className="self-center text-xs text-slate-600">{toolHistoryFileName}</span>
                )}
              </div>

              {toolHistoryDetectInfo && (
                <div className="mb-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2 font-mono">
                  {toolHistoryDetectInfo}
                </div>
              )}

              {toolHistoryWarnings.length > 0 && !toolHistoryError && (
                <div className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 space-y-0.5">
                  {toolHistoryWarnings.slice(0, 8).map((w, i) => <div key={i}>{w}</div>)}
                </div>
              )}

              {toolHistoryRawText && (
                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Evidence Ref-ID</label>
                  <input
                    type="text"
                    value={toolHistoryEvidenceRefId}
                    onChange={(e) => setToolHistoryEvidenceRefId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
                  />
                </div>
              )}

              <button
                onClick={handleImportToolHistory}
                disabled={!toolHistoryRawText || toolHistoryImporting}
                className="pm-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {toolHistoryImporting ? 'Importiere...' : 'Als Event Log übernehmen'}
              </button>

              {toolHistoryError && (
                <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {toolHistoryError}
                </div>
              )}

              {toolHistoryStatus && (
                <div className="mt-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-3">
                  {toolHistoryStatus}
                </div>
              )}

              <div className="mt-3 space-y-1">
                <p className="text-xs text-slate-400">
                  Für Jira benötigen Sie einen Export, der Status-/Feldänderungen enthält (z.B. Changelog/History). Eine reine Ticketliste reicht nicht.
                </p>
              </div>
            </div>
            )}

            {dataImportTab === 'csv' && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Generischer CSV-Import</h3>
              <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer w-fit">
                <Upload className="w-4 h-4" />
                CSV-Datei auswählen
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  onClick={(e) => {
                    (e.currentTarget as HTMLInputElement).value = '';
                  }}
                  className="hidden"
                />
              </label>

            {csvHeaders.length > 0 && (
              <div className="space-y-3 border-t border-slate-200 pt-4">
                <h3 className="text-sm font-medium text-slate-900">Spalten-Mapping</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <label className="text-xs text-slate-600">
                        Case ID <span className="text-red-600">*</span>
                      </label>
                      <HelpPopover helpKey="mining.column.caseId" ariaLabel="Hilfe: Case ID" />
                    </div>
                    <select
                      value={selectedCaseCol}
                      onChange={(e) => setSelectedCaseCol(parseInt(e.target.value, 10))}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                    >
                      <option value={-1}>(nicht ausgewählt)</option>
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <label className="text-xs text-slate-600">
                        Activity <span className="text-red-600">*</span>
                      </label>
                      <HelpPopover helpKey="mining.column.activity" ariaLabel="Hilfe: Activity" />
                    </div>
                    <select
                      value={selectedActivityCol}
                      onChange={(e) => setSelectedActivityCol(parseInt(e.target.value, 10))}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                    >
                      <option value={-1}>(nicht ausgewählt)</option>
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <label className="text-xs text-slate-600">
                        Timestamp <span className="text-red-600">*</span>
                      </label>
                      <HelpPopover helpKey="mining.column.timestamp" ariaLabel="Hilfe: Timestamp" />
                    </div>
                    <select
                      value={selectedTimestampCol}
                      onChange={(e) => setSelectedTimestampCol(parseInt(e.target.value, 10))}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                    >
                      <option value={-1}>(nicht ausgewählt)</option>
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Resource (optional)</label>
                    <select
                      value={selectedResourceCol}
                      onChange={(e) => setSelectedResourceCol(parseInt(e.target.value, 10))}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                    >
                      <option value={-1}>(keine)</option>
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleImport}
                  disabled={!canImport || importing}
                  className="pm-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importing ? 'Importiere...' : 'Importieren'}
                </button>
              </div>
            )}

            {importError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                {importError}
              </div>
            )}
            </div>
            )}

            {dataImportTab === 'xes' && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-slate-900">XES importieren</h3>
                <HelpPopover helpKey="mining.xesImport" ariaLabel="Hilfe: XES Import" />
              </div>
              <p className="text-xs text-slate-500 mb-3">
                IEEE XES Datei (.xes) direkt importieren. Traces werden als Cases, Events als Log-Events übernommen.
              </p>
              <label className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 cursor-pointer w-fit text-sm">
                <Upload className="w-4 h-4" />
                {xesImportLoading ? 'Importiere...' : 'XES-Datei auswählen'}
                <input
                  type="file"
                  accept=".xes,application/xml,text/xml"
                  onChange={handleXesImport}
                  onClick={(e) => { (e.currentTarget as HTMLInputElement).value = ''; }}
                  className="hidden"
                  disabled={xesImportLoading}
                />
              </label>
              {xesImportError && (
                <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {xesImportError}
                </div>
              )}
              {xesImportStatus && (
                <div className="mt-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-3">
                  {xesImportStatus}
                </div>
              )}
            </div>
            )}


            </div>
        </div>
      )}

      {processMining && summary && (
          <div className="space-y-4">
            {miningView === 'data' && (
            <>
            <GuideCallout
              title="Ziel: Event Log importieren und Datenqualität prüfen"
              steps={[
                'Event Log aus Ticket-System oder CSV importieren.',
                'Datenqualität-Bericht prüfen (Vollständigkeit, Zeitstempel).',
                'Bei Bedarf weitere Datasets laden und vergleichen.'
              ]}
              tip="Nutzen Sie mehrere Datasets, um verschiedene Zeiträume oder Filter zu analysieren."
            />
            <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Event Log Summary</h3>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-slate-600">Quelle:</dt>
                <dd className="text-slate-900 font-medium">{processMining.sourceLabel}</dd>

                <dt className="text-slate-600">Events:</dt>
                <dd className="text-slate-900 font-medium">{summary.eventsCount.toLocaleString('de-DE')}</dd>

                <dt className="text-slate-600">Cases:</dt>
                <dd className="text-slate-900 font-medium">{summary.casesCount.toLocaleString('de-DE')}</dd>

                <dt className="text-slate-600">Aktivitäten:</dt>
                <dd className="text-slate-900 font-medium">{summary.activitiesCount.toLocaleString('de-DE')}</dd>

                <dt className="text-slate-600">Zeitraum:</dt>
                <dd className="text-slate-900 font-medium">
                  {summary.timeRange.min} – {summary.timeRange.max}
                </dd>

                <dt className="text-slate-600">Importiert:</dt>
                <dd className="text-slate-900 font-medium">
                  {new Date(processMining.importedAt).toLocaleString('de-DE')}
                </dd>

                <dt className="text-slate-600">Zeitmodus:</dt>
                <dd className="text-slate-900 font-medium">
                  {'real'}
                </dd>
              </dl>

              {processMining.warnings && processMining.warnings.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-medium text-slate-700">Warnungen beim Import:</p>
                  <ul className="text-xs text-slate-600 list-disc list-inside space-y-0.5">
                    {processMining.warnings.slice(0, 5).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                    {processMining.warnings.length > 5 && (
                      <li>... und {processMining.warnings.length - 5} weitere</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
            </>
            )}

            {miningView === 'export' && (
            <>
            <GuideCallout
              title="Ziel: Event Log in Standardformaten exportieren"
              steps={[
                'XES-Format wählen (Activity-Level oder Step-Level).',
                'XES-Datei herunterladen für externe Tools (Disco, ProM, Celonis).',
                'Optional: Preprocessing-Rezept und Mapping dokumentieren.'
              ]}
              tip="XES ist der Standard für Process Mining und wird von allen gängigen Tools unterstützt."
            />
            <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-slate-900">XES Export</h3>
                <HelpPopover helpKey="mining.xesExport" ariaLabel="Hilfe: XES Export" />
              </div>
              <div className="mb-3">
                <p className="text-xs font-medium text-slate-700 mb-1.5">Export als</p>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="xesExportMode"
                      value="activity"
                      checked={xesExportMode === 'activity'}
                      onChange={() => setXesExportMode('activity')}
                      className="accent-slate-700"
                    />
                    <span className="text-xs text-slate-700">Aktivitäten</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="xesExportMode"
                      value="step"
                      checked={xesExportMode === 'step'}
                      onChange={() => setXesExportMode('step')}
                      className="accent-slate-700"
                    />
                    <span className="text-xs text-slate-700">Schritte (wenn gemappt)</span>
                  </label>
                </div>
                {xesExportMode === 'step' && (
                  <label className="mt-2 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={xesStepIncludeOriginal}
                      onChange={(e) => setXesStepIncludeOriginal(e.target.checked)}
                      className="accent-slate-700"
                    />
                    <span className="text-xs text-slate-600">Originalaktivität als Attribut <code className="bg-slate-100 px-1 rounded">activity_original</code> speichern</span>
                  </label>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleXesExport('all')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-700 text-white hover:bg-slate-800 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Alle exportieren
                </button>
                <button
                  onClick={() => handleXesExport('segmentA')}
                  disabled={!filterA}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" />
                  Segment A{segmentValueA ? ` (${segmentValueA})` : ''}
                </button>
                <button
                  onClick={() => handleXesExport('segmentB')}
                  disabled={!filterB}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" />
                  Segment B{segmentValueB ? ` (${segmentValueB})` : ''}
                </button>
              </div>
              {xesExportError && (
                <div className="mt-3 rounded-md bg-red-50 border border-red-200 p-3">
                  <p className="text-xs font-semibold text-red-700 mb-1">Export fehlgeschlagen</p>
                  <pre className="text-xs text-red-700 whitespace-pre-wrap break-words">{xesExportError}</pre>
                </div>
              )}
              {xesExportStatus && (
                <p className="mt-2 text-xs text-slate-600">{xesExportStatus}</p>
              )}
              {xesExportWarnings.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-medium text-slate-700">Hinweise zum Export:</p>
                  <ul className="text-xs text-slate-600 list-disc list-inside space-y-0.5">
                    {xesExportWarnings.slice(0, 8).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                    {xesExportWarnings.length > 8 && (
                      <li>... und {xesExportWarnings.length - 8} weitere</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="mt-4 border-t border-slate-200 pt-3">
                <p className="text-xs font-medium text-slate-700 mb-2">Interoperabilitäts-Check</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleXesRoundtrip('all')}
                    disabled={!processMining || xesRoundtripRunning}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${xesRoundtripRunning ? 'animate-spin' : ''}`} />
                    {xesRoundtripRunning ? 'Prüfe...' : 'XES Roundtrip prüfen (alle)'}
                  </button>
                  <button
                    onClick={() => handleXesRoundtrip('segmentA')}
                    disabled={!filterA || xesRoundtripRunning}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Roundtrip Segment A
                  </button>
                  <button
                    onClick={() => handleXesRoundtrip('segmentB')}
                    disabled={!filterB || xesRoundtripRunning}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Roundtrip Segment B
                  </button>
                </div>
                {xesRoundtripError && (
                  <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    {xesRoundtripError}
                  </div>
                )}
                {xesRoundtripReport && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-slate-700">Roundtrip Report</p>
                      <button
                        onClick={() => navigator.clipboard.writeText(xesRoundtripReport).catch(() => {})}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                        Kopieren
                      </button>
                    </div>
                    <pre className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-3 whitespace-pre-wrap font-mono leading-relaxed max-h-72 overflow-y-auto">
                      {xesRoundtripReport}
                    </pre>
                  </div>
                )}
              </div>
            </div>
            </>
            )}

            {miningView === 'data' && quality && (
              <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
                <h3 className="text-sm font-semibold text-slate-900 mb-2">Data Quality</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-slate-600">Events/Case (Median / P90):</dt>
                  <dd className="text-slate-900 font-medium">
                    {quality.medianEventsPerCase !== null ? Math.round(quality.medianEventsPerCase) : '–'}
                    {' / '}
                    {quality.p90EventsPerCase !== null ? Math.round(quality.p90EventsPerCase) : '–'}
                  </dd>

                  <dt className="text-slate-600">Durchlaufzeit (Median / P90):</dt>
                  <dd className="text-slate-900 font-medium">
                    {`${formatDurationShort(quality.medianCaseDurationMs)} / ${formatDurationShort(quality.p90CaseDurationMs)}`}
                  </dd>

                  <dt className="text-slate-600">Duplikate:</dt>
                  <dd className={quality.duplicateEvents > 0 ? 'text-amber-700 font-medium' : 'text-slate-900 font-medium'}>
                    {quality.duplicateEvents.toLocaleString('de-DE')}
                    {' '}
                    ({(quality.duplicatePct * 100).toFixed(1)}%)
                  </dd>

                  <dt className="text-slate-600">Unmapped Events:</dt>
                  <dd className={quality.unmappedEventsPct > 0.3 ? 'text-amber-700 font-medium' : 'text-slate-900 font-medium'}>
                    {(quality.unmappedEventsPct * 100).toFixed(1)}%
                  </dd>
                </dl>
              </div>
            )}
          </div>
        )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-12 space-y-6">
      {miningView === 'data' && (
        <>
          <GuideCallout
            title="Ziel: Event Log importieren und Datenqualität prüfen"
            steps={[
              "Quelle wählen (CSV, XES oder Tool-Historie mit realen Event-Log-Daten).",
              "Import durchführen und Dataset aktivieren.",
              "Data Quality prüfen und bei Bedarf Aufbereitung nutzen."
            ]}
            tip="Wichtig: Import erzeugt immer ein neues Dataset, Sie können jederzeit zwischen Datasets wechseln."
          />

          {!processMining && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <p className="text-sm text-slate-600">
                Klicken Sie oben auf „Dataset hinzufügen", um einen Import zu starten.
              </p>
            </div>
          )}
        </>
      )}

      {processMining && (miningView === 'preprocessing') && (
        <PreprocessingCard
          version={version}
          processMining={processMining}
          onSave={onSave}
          activeDatasetEvents={activeDatasetEvents}
          isActiveDatasetEventsReady={isActiveDatasetEventsReady}
        />
      )}

      {processMining && (
        <>
          {(['discovery','conformance','performance','cases','export','organisation','rootcause'] as MiningView[]).includes(miningView) && (<>
          <CollapsibleCard
            title="Analysebereich"
            helpKey="mining.segmentFilter"
            description="Optional: Segment A/B filtert die Analyse auf Cases mit einem Attributwert."
            defaultOpen={segmentActive || compareActive}
            right={
              <span className="text-xs text-slate-600">
                {segmentActive
                  ? compareActive && segmentValueB
                    ? `A: ${segmentKey}=${segmentValueA || '(alle)'} · B: ${segmentKey}=${segmentValueB}`
                    : `A: ${segmentKey}=${segmentValueA || '(alle)'}`
                  : 'Gesamt'}
              </span>
            }
          >
            <p className="text-xs text-slate-500">
              Filtert die Analyse auf Cases, bei denen mindestens ein Event ein bestimmtes Attribut trägt.
              {availableAttributes.keys.length === 0 && ' (Keine Attribute im Event Log vorhanden.)'}
            </p>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={segmentActive}
                onChange={(e) => setSegmentActive(e.target.checked)}
                disabled={availableAttributes.keys.length === 0}
              />
              <span className="text-sm font-medium text-slate-700">Segment-Filter aktiv</span>
            </label>

            {segmentActive && availableAttributes.keys.length > 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Attribut (Key)</label>
                    <select
                      value={segmentKey}
                      onChange={(e) => { setSegmentKey(e.target.value); setSegmentValueA(''); setSegmentValueB(''); }}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                    >
                      <option value="">(wählen)</option>
                      {availableAttributes.keys.map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Segment A – Wert</label>
                    <select
                      value={segmentValueA}
                      onChange={(e) => setSegmentValueA(e.target.value)}
                      disabled={!segmentKey}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm disabled:bg-slate-100"
                    >
                      <option value="">(alle)</option>
                      {(availableAttributes.valuesByKey.get(segmentKey) ?? []).map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col justify-end">
                    {filterA && (
                      <p className="text-xs text-emerald-700 font-medium">
                        Segment A: {eventsA.length.toLocaleString('de-DE')} Events,{' '}
                        {new Set(eventsA.map((e) => e.caseId)).size.toLocaleString('de-DE')} Cases
                      </p>
                    )}
                    {segmentActive && segmentKey && segmentValueA && eventsA.length === 0 && (
                      <p className="text-xs text-amber-700">Keine Cases gefunden.</p>
                    )}
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={compareActive}
                    onChange={(e) => setCompareActive(e.target.checked)}
                    disabled={!segmentKey}
                  />
                  <span className="text-sm text-slate-700">Vergleich aktiv (Segment B)</span>
                </label>

                {compareActive && segmentKey && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-start-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">Segment B – Wert</label>
                      <select
                        value={segmentValueB}
                        onChange={(e) => setSegmentValueB(e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                      >
                        <option value="">(wählen)</option>
                        {(availableAttributes.valuesByKey.get(segmentKey) ?? []).map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col justify-end">
                      {filterB && eventsB && (
                        <p className="text-xs text-blue-700 font-medium">
                          Segment B: {eventsB.length.toLocaleString('de-DE')} Events,{' '}
                          {new Set(eventsB.map((e) => e.caseId)).size.toLocaleString('de-DE')} Cases
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CollapsibleCard>

          {compareKpis && (
            <CollapsibleCard
              title="Segment-Vergleich (KPIs)"
              description={`Vergleich: Segment A (${segmentValueA}) vs. B (${segmentValueB})`}
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-md p-4">
                  <p className="text-xs text-slate-500 mb-1">Cases</p>
                  <div className="flex items-end gap-3">
                    <div>
                      <p className="text-xs text-slate-500">A</p>
                      <p className="text-xl font-bold text-slate-900">{compareKpis.casesA.toLocaleString('de-DE')}</p>
                    </div>
                    <div className="text-slate-400 pb-1">vs.</div>
                    <div>
                      <p className="text-xs text-slate-500">B</p>
                      <p className="text-xl font-bold text-slate-900">{compareKpis.casesB.toLocaleString('de-DE')}</p>
                    </div>
                  </div>
                </div>

                {compareKpis.conformanceA && compareKpis.conformanceB && (
                  <div className="border border-slate-200 rounded-md p-4">
                    <p className="text-xs text-slate-500 mb-1">Exakt konform (Happy Path)</p>
                    <div className="flex items-end gap-3">
                      <div>
                        <p className="text-xs text-slate-500">A</p>
                        <p className="text-xl font-bold text-emerald-700">
                          {(compareKpis.conformanceA.exactHappyPath.pct * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div className="text-slate-400 pb-1">vs.</div>
                      <div>
                        <p className="text-xs text-slate-500">B</p>
                        <p className="text-xl font-bold text-emerald-700">
                          {(compareKpis.conformanceB.exactHappyPath.pct * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {compareKpis.topVariantA && compareKpis.topVariantB && (
                  <div className="border border-slate-200 rounded-md p-4 md:col-span-2">
                    <p className="text-xs text-slate-500 mb-2">Top-Variante (Anteil)</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-1">A – {(compareKpis.topVariantA.share * 100).toFixed(1)}% ({compareKpis.topVariantA.count} Cases)</p>
                        <p className="text-xs text-slate-700 font-mono truncate" title={compareKpis.topVariantA.variant}>
                          {compareKpis.topVariantA.variant.length > 120 ? compareKpis.topVariantA.variant.substring(0, 120) + '…' : compareKpis.topVariantA.variant}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-1">B – {(compareKpis.topVariantB.share * 100).toFixed(1)}% ({compareKpis.topVariantB.count} Cases)</p>
                        <p className="text-xs text-slate-700 font-mono truncate" title={compareKpis.topVariantB.variant}>
                          {compareKpis.topVariantB.variant.length > 120 ? compareKpis.topVariantB.variant.substring(0, 120) + '…' : compareKpis.topVariantB.variant}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {(compareKpis.topWaitMetricA !== null || compareKpis.topWaitMetricB !== null) && (
                  <div className="border border-slate-200 rounded-md p-4 md:col-span-2">
                    <p className="text-xs text-slate-500 mb-2">Größte Wartezeit (Median)</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        {compareKpis.topWaitMetricA ? (
                          <>
                            <p className="text-xs font-medium text-slate-600 mb-0.5">A – {compareKpis.topWaitMetricA.label}</p>
                            <p className="text-sm font-bold text-amber-700">{formatDurationShort(compareKpis.topWaitMetricA.medianWaitToNextMs)}</p>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {(compareKpis.topWaitMetricA.exampleWaitCaseId ?? compareKpis.topWaitMetricA.exampleCaseId) && (
                                <button className="text-xs text-blue-600 hover:underline" onClick={() => focusCase((compareKpis.topWaitMetricA!.exampleWaitCaseId ?? compareKpis.topWaitMetricA!.exampleCaseId)!)}>
                                  Beispiel
                                </button>
                              )}
                              <button
                                disabled={miningBacklogBusy}
                                onClick={() => createImprovementFromStepMetric({ kind: 'wait', metric: compareKpis.topWaitMetricA!, context: { sourceLabel: processMining!.sourceLabel, importedAt: processMining!.importedAt, timeMode: processMining!.timeMode, scopeLabel: 'Segment A', segmentLabel: filterA ? `${filterA.attributeKey}=${filterA.attributeValue}` : undefined }, exampleCaseId: compareKpis.topWaitMetricA!.exampleWaitCaseId ?? compareKpis.topWaitMetricA!.exampleCaseId })}
                                className="text-xs text-emerald-700 hover:underline disabled:opacity-40"
                              >
                                Maßnahme
                              </button>
                            </div>
                          </>
                        ) : <p className="text-xs text-slate-400">A – –</p>}
                      </div>
                      <div>
                        {compareKpis.topWaitMetricB ? (
                          <>
                            <p className="text-xs font-medium text-slate-600 mb-0.5">B – {compareKpis.topWaitMetricB.label}</p>
                            <p className="text-sm font-bold text-amber-700">{formatDurationShort(compareKpis.topWaitMetricB.medianWaitToNextMs)}</p>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {(compareKpis.topWaitMetricB.exampleWaitCaseId ?? compareKpis.topWaitMetricB.exampleCaseId) && (
                                <button className="text-xs text-blue-600 hover:underline" onClick={() => focusCase((compareKpis.topWaitMetricB!.exampleWaitCaseId ?? compareKpis.topWaitMetricB!.exampleCaseId)!)}>
                                  Beispiel
                                </button>
                              )}
                              <button
                                disabled={miningBacklogBusy}
                                onClick={() => createImprovementFromStepMetric({ kind: 'wait', metric: compareKpis.topWaitMetricB!, context: { sourceLabel: processMining!.sourceLabel, importedAt: processMining!.importedAt, timeMode: processMining!.timeMode, scopeLabel: 'Segment B', segmentLabel: filterB ? `${filterB.attributeKey}=${filterB.attributeValue}` : undefined }, exampleCaseId: compareKpis.topWaitMetricB!.exampleWaitCaseId ?? compareKpis.topWaitMetricB!.exampleCaseId })}
                                className="text-xs text-emerald-700 hover:underline disabled:opacity-40"
                              >
                                Maßnahme
                              </button>
                            </div>
                          </>
                        ) : <p className="text-xs text-slate-400">B – –</p>}
                      </div>
                    </div>
                  </div>
                )}

                {(compareKpis.topSpanMetricA !== null || compareKpis.topSpanMetricB !== null) && (
                  <div className="border border-slate-200 rounded-md p-4 md:col-span-2">
                    <p className="text-xs text-slate-500 mb-2">Größte Bearbeitungszeit (Median Span)</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        {compareKpis.topSpanMetricA ? (
                          <>
                            <p className="text-xs font-medium text-slate-600 mb-0.5">A – {compareKpis.topSpanMetricA.label}</p>
                            <p className="text-sm font-bold text-slate-700">{formatDurationShort(compareKpis.topSpanMetricA.medianSpanMs)}</p>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {(compareKpis.topSpanMetricA.exampleSpanCaseId ?? compareKpis.topSpanMetricA.exampleCaseId) && (
                                <button className="text-xs text-blue-600 hover:underline" onClick={() => focusCase((compareKpis.topSpanMetricA!.exampleSpanCaseId ?? compareKpis.topSpanMetricA!.exampleCaseId)!)}>
                                  Beispiel
                                </button>
                              )}
                              <button
                                disabled={miningBacklogBusy}
                                onClick={() => createImprovementFromStepMetric({ kind: 'span', metric: compareKpis.topSpanMetricA!, context: { sourceLabel: processMining!.sourceLabel, importedAt: processMining!.importedAt, timeMode: processMining!.timeMode, scopeLabel: 'Segment A', segmentLabel: filterA ? `${filterA.attributeKey}=${filterA.attributeValue}` : undefined }, exampleCaseId: compareKpis.topSpanMetricA!.exampleSpanCaseId ?? compareKpis.topSpanMetricA!.exampleCaseId })}
                                className="text-xs text-emerald-700 hover:underline disabled:opacity-40"
                              >
                                Maßnahme
                              </button>
                            </div>
                          </>
                        ) : <p className="text-xs text-slate-400">A – –</p>}
                      </div>
                      <div>
                        {compareKpis.topSpanMetricB ? (
                          <>
                            <p className="text-xs font-medium text-slate-600 mb-0.5">B – {compareKpis.topSpanMetricB.label}</p>
                            <p className="text-sm font-bold text-slate-700">{formatDurationShort(compareKpis.topSpanMetricB.medianSpanMs)}</p>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {(compareKpis.topSpanMetricB.exampleSpanCaseId ?? compareKpis.topSpanMetricB.exampleCaseId) && (
                                <button className="text-xs text-blue-600 hover:underline" onClick={() => focusCase((compareKpis.topSpanMetricB!.exampleSpanCaseId ?? compareKpis.topSpanMetricB!.exampleCaseId)!)}>
                                  Beispiel
                                </button>
                              )}
                              <button
                                disabled={miningBacklogBusy}
                                onClick={() => createImprovementFromStepMetric({ kind: 'span', metric: compareKpis.topSpanMetricB!, context: { sourceLabel: processMining!.sourceLabel, importedAt: processMining!.importedAt, timeMode: processMining!.timeMode, scopeLabel: 'Segment B', segmentLabel: filterB ? `${filterB.attributeKey}=${filterB.attributeValue}` : undefined }, exampleCaseId: compareKpis.topSpanMetricB!.exampleSpanCaseId ?? compareKpis.topSpanMetricB!.exampleCaseId })}
                                className="text-xs text-emerald-700 hover:underline disabled:opacity-40"
                              >
                                Maßnahme
                              </button>
                            </div>
                          </>
                        ) : <p className="text-xs text-slate-400">B – –</p>}
                      </div>
                    </div>
                  </div>
                )}

                {(compareKpis.topReworkMetricA !== null || compareKpis.topReworkMetricB !== null) && (
                  <div className="border border-slate-200 rounded-md p-4 md:col-span-2">
                    <p className="text-xs text-slate-500 mb-2">Höchste Rework-Rate</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        {compareKpis.topReworkMetricA ? (
                          <>
                            <p className="text-xs font-medium text-slate-600 mb-0.5">A – {compareKpis.topReworkMetricA.label}</p>
                            <p className="text-sm font-bold text-rose-700">
                              {(compareKpis.topReworkMetricA.reworkPct * 100).toFixed(1)}% ({compareKpis.topReworkMetricA.reworkCaseCount} Cases)
                            </p>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {(compareKpis.topReworkMetricA.exampleReworkCaseId ?? compareKpis.topReworkMetricA.exampleCaseId) && (
                                <button className="text-xs text-blue-600 hover:underline" onClick={() => focusCase((compareKpis.topReworkMetricA!.exampleReworkCaseId ?? compareKpis.topReworkMetricA!.exampleCaseId)!)}>
                                  Beispiel
                                </button>
                              )}
                              <button
                                disabled={miningBacklogBusy}
                                onClick={() => createImprovementFromStepMetric({ kind: 'rework', metric: compareKpis.topReworkMetricA!, context: { sourceLabel: processMining!.sourceLabel, importedAt: processMining!.importedAt, timeMode: processMining!.timeMode, scopeLabel: 'Segment A', segmentLabel: filterA ? `${filterA.attributeKey}=${filterA.attributeValue}` : undefined }, exampleCaseId: compareKpis.topReworkMetricA!.exampleReworkCaseId ?? compareKpis.topReworkMetricA!.exampleCaseId })}
                                className="text-xs text-emerald-700 hover:underline disabled:opacity-40"
                              >
                                Maßnahme
                              </button>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-slate-400">A – kein Rework</p>
                        )}
                      </div>
                      <div>
                        {compareKpis.topReworkMetricB ? (
                          <>
                            <p className="text-xs font-medium text-slate-600 mb-0.5">B – {compareKpis.topReworkMetricB.label}</p>
                            <p className="text-sm font-bold text-rose-700">
                              {(compareKpis.topReworkMetricB.reworkPct * 100).toFixed(1)}% ({compareKpis.topReworkMetricB.reworkCaseCount} Cases)
                            </p>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {(compareKpis.topReworkMetricB.exampleReworkCaseId ?? compareKpis.topReworkMetricB.exampleCaseId) && (
                                <button className="text-xs text-blue-600 hover:underline" onClick={() => focusCase((compareKpis.topReworkMetricB!.exampleReworkCaseId ?? compareKpis.topReworkMetricB!.exampleCaseId)!)}>
                                  Beispiel
                                </button>
                              )}
                              <button
                                disabled={miningBacklogBusy}
                                onClick={() => createImprovementFromStepMetric({ kind: 'rework', metric: compareKpis.topReworkMetricB!, context: { sourceLabel: processMining!.sourceLabel, importedAt: processMining!.importedAt, timeMode: processMining!.timeMode, scopeLabel: 'Segment B', segmentLabel: filterB ? `${filterB.attributeKey}=${filterB.attributeValue}` : undefined }, exampleCaseId: compareKpis.topReworkMetricB!.exampleReworkCaseId ?? compareKpis.topReworkMetricB!.exampleCaseId })}
                                className="text-xs text-emerald-700 hover:underline disabled:opacity-40"
                              >
                                Maßnahme
                              </button>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-slate-400">B – kein Rework</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {(compareKpis.topMappedVariantA !== null || compareKpis.topMappedVariantB !== null) && (
                  <div className="border border-slate-200 rounded-md p-4 md:col-span-2">
                    <p className="text-xs text-slate-500 mb-2">Top gemappte Variante (Schritte)</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        {compareKpis.topMappedVariantA ? (
                          <>
                            <p className="text-xs font-medium text-slate-600 mb-1">
                              A – {(compareKpis.topMappedVariantA.share * 100).toFixed(1)}% ({compareKpis.topMappedVariantA.count} Cases)
                            </p>
                            <p className="text-xs text-slate-700 font-mono truncate" title={compareKpis.topMappedVariantA.variant}>
                              {compareKpis.topMappedVariantA.variant.length > 120 ? compareKpis.topMappedVariantA.variant.substring(0, 120) + '...' : compareKpis.topMappedVariantA.variant}
                            </p>
                            {compareKpis.topMappedVariantA.exampleCaseId && (
                              <button className="mt-1 text-xs text-blue-600 hover:underline" onClick={() => focusCase(compareKpis.topMappedVariantA!.exampleCaseId!)}>
                                Beispiel öffnen
                              </button>
                            )}
                          </>
                        ) : <p className="text-xs text-slate-400">A – –</p>}
                      </div>
                      <div>
                        {compareKpis.topMappedVariantB ? (
                          <>
                            <p className="text-xs font-medium text-slate-600 mb-1">
                              B – {(compareKpis.topMappedVariantB.share * 100).toFixed(1)}% ({compareKpis.topMappedVariantB.count} Cases)
                            </p>
                            <p className="text-xs text-slate-700 font-mono truncate" title={compareKpis.topMappedVariantB.variant}>
                              {compareKpis.topMappedVariantB.variant.length > 120 ? compareKpis.topMappedVariantB.variant.substring(0, 120) + '...' : compareKpis.topMappedVariantB.variant}
                            </p>
                            {compareKpis.topMappedVariantB.exampleCaseId && (
                              <button className="mt-1 text-xs text-blue-600 hover:underline" onClick={() => focusCase(compareKpis.topMappedVariantB!.exampleCaseId!)}>
                                Beispiel öffnen
                              </button>
                            )}
                          </>
                        ) : <p className="text-xs text-slate-400">B – –</p>}
                      </div>
                    </div>
                  </div>
                )}

              </div>

              <div className="mt-5 border-t border-slate-200 pt-4">
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Treiberanalyse (Conformance)</h4>
                {!conformanceDrivers ? (
                  <p className="text-xs text-slate-500">Für Treiberanalyse werden Mapping + Draft benötigt.</p>
                ) : (
                  <div className="space-y-3">
                    <ul className="list-disc pl-5 text-xs text-slate-700 space-y-1">
                      {conformanceDrivers.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                    {conformanceDrivers.variantNote && (
                      <p className="text-xs text-slate-600">{conformanceDrivers.variantNote}</p>
                    )}
                    {conformanceDrivers.topMissingStepDeltas.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-800 mb-1">Schritte, die häufiger fehlen (Delta)</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>
                                <th className="text-left py-1.5 px-2 font-medium text-slate-700">Schritt</th>
                                <th className="text-right py-1.5 px-2 font-medium text-slate-700">Fehlt in A</th>
                                <th className="text-right py-1.5 px-2 font-medium text-slate-700">Fehlt in B</th>
                                <th className="text-right py-1.5 px-2 font-medium text-slate-700">Δ</th>
                                <th className="text-center py-1.5 px-2 font-medium text-slate-700">Beispiel</th>
                              </tr>
                            </thead>
                            <tbody>
                              {conformanceDrivers.topMissingStepDeltas.map((row) => (
                                <tr key={row.stepId} className="border-b border-slate-100">
                                  <td className="py-1.5 px-2 text-slate-900">{row.order}. {row.label}</td>
                                  <td className="py-1.5 px-2 text-right text-slate-700">{(row.missingPctA * 100).toFixed(1)}%</td>
                                  <td className="py-1.5 px-2 text-right text-slate-700">{(row.missingPctB * 100).toFixed(1)}%</td>
                                  <td className={`py-1.5 px-2 text-right font-medium ${row.deltaPp > 0 ? 'text-rose-700' : row.deltaPp < 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                                    {row.deltaPp >= 0 ? '+' : ''}{row.deltaPp.toFixed(1)}pp
                                  </td>
                                  <td className="py-1.5 px-2 text-center">
                                    {row.exampleCaseId ? (
                                      <button className="text-xs text-blue-600 hover:underline" onClick={() => focusCase(row.exampleCaseId!)}>
                                        Öffnen
                                      </button>
                                    ) : '–'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Heuristik: Treiber basieren auf fehlenden Schritten und Conformance-Kennzahlen, nicht auf perfektem Alignment.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CollapsibleCard>
          )}
          </>)}

          {(miningView === 'mapping') && (
          <>
          <GuideCallout
            title="Ziel: Log-Aktivitäten auf Prozess-Schritte abbilden"
            steps={[
              'Mapping-Assistent aktivieren für automatische Vorschläge.',
              'Aktivitäten den Prozess-Schritten zuordnen.',
              'Mapping speichern und zur Discovery wechseln.'
            ]}
            tip="Ein gutes Mapping reduziert Varianz und verbessert die Modellqualität erheblich."
          />
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Activity → Step Mapping</h3>
              <HelpPopover helpKey="mining.mapping" ariaLabel="Hilfe: Mapping" />
            </div>

            <div className="mb-4 space-y-3">
              <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <input
                  type="checkbox"
                  id="mappingAssistant"
                  checked={showMappingAssistant}
                  onChange={(e) => setShowMappingAssistant(e.target.checked)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <label htmlFor="mappingAssistant" className="text-sm font-medium text-slate-900 cursor-pointer">
                    Mapping-Assistent anzeigen (Vorschläge)
                  </label>
                  <p className="text-xs text-slate-600 mt-1">
                    Vorschläge basieren auf Textähnlichkeit + Katalog-Aliases. Bitte manuell prüfen.
                  </p>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={mappingSearch}
                  onChange={(e) => setMappingSearch(e.target.value)}
                  placeholder="Aktivität suchen..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md text-sm"
                />
              </div>
            </div>

            <div className="overflow-x-auto mb-4" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-slate-700">Activity</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-700 w-24">Count</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-700 w-64">
                      Gemappt auf Schritt
                    </th>
                    {showMappingAssistant && (
                      <th className="text-left py-2 px-3 font-medium text-slate-700 w-80">
                        Vorschläge
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredMappings.slice(0, 80).map((mapping, idx) => {
                    const suggestions = mappingSuggestions[mapping.activityKey] ?? [];
                    return (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="py-2 px-3 text-slate-900">{mapping.example}</td>
                        <td className="py-2 px-3 text-slate-600">{mapping.count}</td>
                        <td className="py-2 px-3">
                          <select
                            value={mapping.stepId || ''}
                            onChange={(e) => {
                              const newMappings = [...(localMappings || [])];
                              const idx = newMappings.findIndex((m) => m.activityKey === mapping.activityKey);
                              if (idx >= 0) {
                                newMappings[idx] = {
                                  ...newMappings[idx],
                                  stepId: e.target.value || undefined,
                                };
                                setLocalMappings(newMappings);
                              }
                            }}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                          >
                            <option value="">(nicht gemappt)</option>
                            {(version.sidecar.captureDraft?.happyPath ?? []).map((step) => (
                              <option key={step.stepId} value={step.stepId}>
                                {step.order}. {step.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        {showMappingAssistant && (
                          <td className="py-2 px-3">
                            {mapping.stepId ? (
                              <span className="text-xs text-slate-400">—</span>
                            ) : suggestions.length === 0 ? (
                              <span className="text-xs text-slate-500">Keine sinnvollen Vorschläge</span>
                            ) : (
                              <div className="space-y-1">
                                {suggestions.map((sugg) => (
                                  <div key={sugg.stepId} className="space-y-0.5">
                                    <button
                                      onClick={() => {
                                        const newMappings = [...(localMappings || [])];
                                        const idx = newMappings.findIndex(
                                          (m) => m.activityKey === mapping.activityKey
                                        );
                                        if (idx >= 0) {
                                          newMappings[idx] = {
                                            ...newMappings[idx],
                                            stepId: sugg.stepId,
                                          };
                                          setLocalMappings(newMappings);
                                        }
                                      }}
                                      className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-blue-900 transition-colors"
                                    >
                                      {sugg.order}. {sugg.label} ({(sugg.score * 100).toFixed(0)}%)
                                    </button>
                                    {sugg.reasons.length > 0 && (
                                      <div className="text-xs text-slate-500 pl-2">
                                        {sugg.reasons.join(', ')}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button
              onClick={handleSaveMapping}
              disabled={savingMapping}
              className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:bg-slate-400 text-sm"
            >
              {savingMapping ? 'Speichere...' : 'Mapping speichern'}
            </button>
          </div>
          </>
          )}

          {(miningView === 'discovery') && (<>
          <GuideCallout
            title="Ziel: Ein Modell aus dem Log ableiten"
            steps={[
              'Process Map prüfen (Struktur, Bottlenecks).',
              'Varianten ansehen (Top-Variante, Varianz).',
              'Modell ableiten und optional als neue Version übernehmen.'
            ]}
            tip='Wenn das Ergebnis "zu chaotisch" ist: Aufbereitung oder Noise-Filter nutzen.'
          />

          <div className="pm-card p-4 mb-4">
            <div className="flex gap-2">
              <button
                onClick={() => setDiscoveryTab('map')}
                className={discoveryTab === 'map' ? 'pm-tab pm-tab-active' : 'pm-tab pm-tab-inactive'}
              >
                Process Map
              </button>
              <button
                onClick={() => setDiscoveryTab('variants')}
                className={discoveryTab === 'variants' ? 'pm-tab pm-tab-active' : 'pm-tab pm-tab-inactive'}
              >
                Varianten
              </button>
              <button
                onClick={() => setDiscoveryTab('model')}
                className={discoveryTab === 'model' ? 'pm-tab pm-tab-active' : 'pm-tab pm-tab-inactive'}
              >
                Modell ableiten
              </button>
            </div>
          </div>

          {discoveryTab === 'variants' && (
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Discovery: Varianten (Top 10)</h3>

            {eventsA.length >= HEAVY_VARIANTS_THRESHOLD && variantsWorkerStatus === 'computing' && (
              <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-md flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-slate-600 animate-spin" />
                <span className="text-sm text-slate-700">Varianten werden im Hintergrund berechnet…</span>
              </div>
            )}

            {variantsWorkerStatus === 'error' && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">Fehler bei der Berechnung</p>
                    {variantsWorkerError && <p className="mt-1 text-xs">{variantsWorkerError}</p>}
                  </div>
                </div>
              </div>
            )}

            {variantsWorkerStatus === 'idle' && variants.length === 0 && (
              <p className="text-sm text-slate-600">Keine Varianten gefunden.</p>
            )}

            {variants.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium text-slate-700 w-16">Rang</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-700 w-24">Count</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-700 w-24">Anteil</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-700">Variante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((v, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="py-2 px-3 text-slate-600">{idx + 1}</td>
                        <td className="py-2 px-3 text-slate-900">{v.count}</td>
                        <td className="py-2 px-3 text-slate-900">{(v.share * 100).toFixed(1)}%</td>
                        <td className="py-2 px-3 text-slate-900">
                          {v.variant.length > 200 ? `${v.variant.substring(0, 200)}...` : v.variant}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}

          {discoveryTab === 'map' && processMining && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Discovery: Process Map</h3>

              {dfgWorkerStatus === 'computing' && (
                <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-md flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-slate-600 animate-spin" />
                  <span className="text-sm text-slate-700">Process Map wird im Hintergrund berechnet…</span>
                </div>
              )}

              {dfgWorkerStatus === 'error' && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium">Fehler bei der Berechnung</p>
                      {dfgWorkerError && <p className="mt-1 text-xs">{dfgWorkerError}</p>}
                      <p className="mt-1 text-xs">Tipp: Für kleinere Datensätze oder bei Problemen können Sie die Daten filtern oder segmentieren.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-end gap-4 mb-5 p-4 bg-slate-50 border border-slate-200 rounded-md">
                <div>
                  <p className="text-xs font-medium text-slate-700 mb-1.5">Modus</p>
                  <div className="flex rounded-md overflow-hidden border border-slate-300">
                    <button
                      onClick={() => setDfgMode('activity')}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${dfgMode === 'activity' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
                    >
                      Aktivitäten
                    </button>
                    <button
                      onClick={() => setDfgMode('step')}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-slate-300 ${dfgMode === 'step' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
                    >
                      Schritte (Mapping)
                    </button>
                  </div>
                  {dfgMode === 'step' && (
                    <p className="text-xs text-amber-700 mt-1">Unmapped Aktivitäten erscheinen als „unmapped:…"</p>
                  )}
                </div>

{isAssisted ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-2">
                        Detailgrad der Karte
                      </label>
                      <div className="flex rounded-md overflow-hidden border border-slate-300">
                        <button
                          onClick={() => handleDiscoveryPresetChange('overview')}
                          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${discoveryPreset === 'overview' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
                        >
                          Übersichtlich
                        </button>
                        <button
                          onClick={() => handleDiscoveryPresetChange('balanced')}
                          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors border-l border-slate-300 ${discoveryPreset === 'balanced' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
                        >
                          Ausgewogen
                        </button>
                        <button
                          onClick={() => handleDiscoveryPresetChange('detailed')}
                          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors border-l border-slate-300 ${discoveryPreset === 'detailed' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
                        >
                          Detailliert
                        </button>
                      </div>
                      <p className="text-xs text-slate-600 mt-1.5">
                        {discoveryPreset === 'overview' && 'Übersichtlich blendet seltene Übergänge aus. Zeigt nur den Hauptablauf.'}
                        {discoveryPreset === 'balanced' && 'Ausgewogen zeigt häufige Verbindungen und wichtige Pfade.'}
                        {discoveryPreset === 'detailed' && 'Detailliert zeigt mehr, kann aber unruhig wirken.'}
                      </p>
                    </div>
                    <details className="pt-2">
                      <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-900">
                        Erweiterte Einstellungen
                      </summary>
                      <div className="mt-3 space-y-3 pl-2 border-l-2 border-slate-200">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Min. Häufigkeit (Übergänge)
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min={1}
                              max={500}
                              value={minEdgeCount}
                              onChange={(e) => setMinEdgeCount(Number(e.target.value))}
                              className="w-28"
                            />
                            <input
                              type="number"
                              min={1}
                              max={500}
                              value={minEdgeCount}
                              onChange={(e) => setMinEdgeCount(Math.max(1, Number(e.target.value)))}
                              className="w-16 px-2 py-1 border border-slate-300 rounded text-xs text-center"
                            />
                          </div>
                          <p className="text-xs text-slate-500 mt-1">Niedrigere Werte zeigen mehr Details</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Max. Aktivitäten
                          </label>
                          <input
                            type="number"
                            min={10}
                            max={100}
                            value={maxNodes}
                            onChange={(e) => setMaxNodes(Math.max(10, Math.min(100, Number(e.target.value))))}
                            className="w-20 px-2 py-1 border border-slate-300 rounded text-xs text-center"
                          />
                          <p className="text-xs text-slate-500 mt-1">Anzahl der häufigsten Aktivitäten</p>
                        </div>
                      </div>
                    </details>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Min. Kantengewicht
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={1}
                          max={500}
                          value={minEdgeCount}
                          onChange={(e) => setMinEdgeCount(Number(e.target.value))}
                          className="w-28"
                        />
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={minEdgeCount}
                          onChange={(e) => setMinEdgeCount(Math.max(1, Number(e.target.value)))}
                          className="w-16 px-2 py-1 border border-slate-300 rounded text-xs text-center"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Max. Knoten
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={100}
                        value={maxNodes}
                        onChange={(e) => setMaxNodes(Math.max(10, Math.min(100, Number(e.target.value))))}
                        className="w-20 px-2 py-1 border border-slate-300 rounded text-xs text-center"
                      />
                    </div>
                  </>
                )}

                <div>
                  <div className="flex items-center gap-1 mb-1.5">
                    <p className="text-xs font-medium text-slate-700">Heatmap</p>
                    <HelpPopover helpKey="mining.discovery.heatmap" ariaLabel="Hilfe: Heatmap" />
                  </div>
                  <div className="flex rounded-md overflow-hidden border border-slate-300">
                    <button
                      onClick={() => setDfgHeatMetric('median')}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${dfgHeatMetric === 'median' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
                    >
                      Median
                    </button>
                    <button
                      onClick={() => setDfgHeatMetric('p95')}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-slate-300 ${dfgHeatMetric === 'p95' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
                    >
                      P95
                    </button>
                  </div>
                </div>
              </div>

              {!dfgFiltered ? (
                <p className="text-sm text-slate-500">Bitte Event Log importieren.</p>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-2">
                      {isAssisted ? 'Häufigste Aktivitäten' : 'Top Knoten'}{' '}
                      <span className="text-slate-400 font-normal">(nach Häufigkeit, max. {maxNodes})</span>
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-slate-700">Label</th>
                            <th className="text-right py-2 px-3 font-medium text-slate-700 w-28">Occurrences</th>
                            <th className="text-right py-2 px-3 font-medium text-slate-700 w-36">Case Coverage</th>
                            <th className="text-right py-2 px-3 font-medium text-slate-700 w-48">Wartezeit (Out)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dfgFiltered.topNodes.slice(0, 20).map((node) => {
                            const order = dfgMode === 'step' && !node.key.startsWith('unmapped:')
                              ? dfgMappings.stepIdToOrder.get(node.key)
                              : undefined;
                            const displayLabel = order != null ? `${order}. ${node.label}` : node.label;
                            const valueSelected = dfgHeatMetric === 'median' ? node.medianOutDeltaMs : node.p95OutDeltaMs;
                            return (
                              <tr key={node.key} className="border-b border-slate-100">
                                <td className="py-2 px-3 text-slate-900">{displayLabel}</td>
                                <td className="py-2 px-3 text-slate-900 text-right">{node.occurrences.toLocaleString('de-DE')}</td>
                                <td className="py-2 px-3 text-right">
                                  <span className={`font-medium ${node.caseCoverage >= 0.8 ? 'text-emerald-700' : node.caseCoverage >= 0.4 ? 'text-amber-700' : 'text-slate-500'}`}>
                                    {(node.caseCoverage * 100).toFixed(1)}%
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {valueSelected === null ? (
                                    <span className="text-slate-400">–</span>
                                  ) : (() => {
                                    const widthPct = nodeHeatMax > 0
                                      ? Math.min(100, Math.round((valueSelected / nodeHeatMax) * 100))
                                      : 0;
                                    return (
                                      <div>
                                        <div className="text-slate-900 mb-1">{formatDurationShort(valueSelected)}</div>
                                        <div className="h-2 bg-slate-100 rounded">
                                          <div
                                            className="h-2 bg-slate-900 rounded"
                                            style={{ width: `${widthPct}%` }}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-2">
                      {isAssisted ? 'Häufige Übergänge' : 'Top Kanten'}{' '}
                      <span className="text-slate-400 font-normal">
                        {isAssisted ? `(mind. ${minEdgeCount}×)` : `(minEdgeCount ≥ ${minEdgeCount})`}
                      </span>
                    </h4>
                    {dfgFiltered.filteredEdges.length === 0 ? (
                      <p className="text-sm text-slate-500 bg-amber-50 border border-amber-200 rounded-md p-3">
                        {isAssisted
                          ? 'Keine Übergänge bei aktueller Filterung. Versuchen Sie eine andere Ansicht oder passen Sie die Einstellungen an.'
                          : 'Keine Kanten bei aktuellem Filter. minEdgeCount verringern oder maxNodes erhöhen.'}
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="text-left py-2 px-3 font-medium text-slate-700">Von</th>
                              <th className="text-left py-2 px-3 font-medium text-slate-700">Nach</th>
                              <th className="text-right py-2 px-3 font-medium text-slate-700 w-24">Count</th>
                              <th className="text-right py-2 px-3 font-medium text-slate-700 w-48">Wartezeit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dfgFiltered.filteredEdges.slice(0, 30).map((edge, idx) => {
                              const fromNode = dfg?.nodes.find((n) => n.key === edge.from);
                              const toNode = dfg?.nodes.find((n) => n.key === edge.to);
                              const fromOrder = dfgMode === 'step' && fromNode && !fromNode.key.startsWith('unmapped:')
                                ? dfgMappings.stepIdToOrder.get(fromNode.key)
                                : undefined;
                              const toOrder = dfgMode === 'step' && toNode && !toNode.key.startsWith('unmapped:')
                                ? dfgMappings.stepIdToOrder.get(toNode.key)
                                : undefined;
                              const fromLabel = fromOrder != null ? `${fromOrder}. ${fromNode?.label ?? edge.from}` : (fromNode?.label ?? edge.from);
                              const toLabel = toOrder != null ? `${toOrder}. ${toNode?.label ?? edge.to}` : (toNode?.label ?? edge.to);
                              const valueSelected = dfgHeatMetric === 'median' ? edge.medianDeltaMs : edge.p95DeltaMs;
                              const otherValue = dfgHeatMetric === 'median' ? edge.p95DeltaMs : edge.medianDeltaMs;
                              const otherLabel = dfgHeatMetric === 'median' ? 'P95' : 'Median';
                              return (
                                <tr key={idx} className="border-b border-slate-100">
                                  <td className="py-2 px-3 text-slate-900 max-w-xs truncate" title={fromLabel}>{fromLabel}</td>
                                  <td className="py-2 px-3 text-slate-900 max-w-xs truncate" title={toLabel}>{toLabel}</td>
                                  <td className="py-2 px-3 text-slate-900 text-right font-medium">{edge.count.toLocaleString('de-DE')}</td>
                                  <td className="py-2 px-3 text-right">
                                    {valueSelected === null ? (
                                      <span className="text-slate-400">–</span>
                                    ) : (() => {
                                      const widthPct = edgeHeatMax > 0
                                        ? Math.min(100, Math.round((valueSelected / edgeHeatMax) * 100))
                                        : 0;
                                      return (
                                        <div>
                                          <div className="text-slate-900 mb-0.5">{formatDurationShort(valueSelected)}</div>
                                          {otherValue !== null && (
                                            <div className="text-xs text-slate-500 mb-1">{otherLabel}: {formatDurationShort(otherValue)}</div>
                                          )}
                                          <div className="h-2 bg-slate-100 rounded">
                                            <div
                                              className="h-2 bg-slate-900 rounded"
                                              style={{ width: `${widthPct}%` }}
                                            />
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {discoveryTab === 'model' && (
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Discovery → BPMN (Vorschlag)</h3>
              <HelpPopover helpKey="mining.discoveryToBpmn" ariaLabel="Hilfe: Discovery BPMN" />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-md p-4 mb-4 space-y-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Ableitungsmodus</label>
                <HelpPopover helpKey="mining.discoveryToBpmn.mode" ariaLabel="Hilfe: Ableitungsmodus" />
                <select
                  value={discoveryMode}
                  onChange={(e) => {
                    const v = e.target.value as DiscoveryDeriveMode;
                    setDiscoveryMode(v);
                  }}
                  className="ml-2 flex-1 min-w-0 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <option value="top_variant">Top-Variante (linear)</option>
                  <option value="dfg_xor">DFG-Heuristik (XOR-Abzweige)</option>
                  <option value="dfg_xor_and">DFG-Heuristik (XOR + Parallelität, experimentell)</option>
                </select>
              </div>

              {discoveryMode !== 'top_variant' && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <label className="text-xs font-medium text-slate-600">
                          {isAssisted ? 'Seltene Übergänge ausblenden' : 'Min. Kanten-Anzahl'}
                        </label>
                        <HelpPopover helpKey="mining.discoveryToBpmn.params" ariaLabel="Hilfe: Komplexität" />
                      </div>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={minEdgeCount}
                        onChange={(e) => setMinEdgeCount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <label className="text-xs font-medium text-slate-600">
                          {isAssisted ? 'Min. Übergangs-Anteil' : 'Min. Kanten-Anteil'}
                        </label>
                        <HelpPopover helpKey="mining.discoveryToBpmn.minEdgeShare" ariaLabel="Hilfe: Min Kanten-Anteil" />
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={discoveryMinEdgeShare}
                        onChange={(e) => {
                          const v = Math.min(1, Math.max(0, parseFloat(e.target.value) || 0));
                          setDiscoveryMinEdgeShare(v);
                        }}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <label className="text-xs font-medium text-slate-600">Max. extra Branches</label>
                        <HelpPopover helpKey="mining.discoveryToBpmn.maxBranches" ariaLabel="Hilfe: Max Branches" />
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        step={1}
                        value={discoveryMaxExtraBranches}
                        onChange={(e) => {
                          const v = Math.max(1, parseInt(e.target.value) || 1);
                          setDiscoveryMaxExtraBranches(v);
                        }}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <label className="text-xs font-medium text-slate-600">
                          {isAssisted ? 'Maximale Schritte im Modell' : 'Max. Steps'}
                        </label>
                      </div>
                      <input
                        type="number"
                        min={5}
                        max={200}
                        step={5}
                        value={discoveryMaxSteps}
                        onChange={(e) => {
                          const v = Math.max(5, parseInt(e.target.value) || 5);
                          setDiscoveryMaxSteps(v);
                        }}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <label className="text-xs font-medium text-slate-600">Min. Node-Coverage</label>
                        <HelpPopover helpKey="mining.discoveryToBpmn.minNodeCoverage" ariaLabel="Hilfe: Seltene Aktivitäten" />
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={discoveryMinNodeCoverage}
                        onChange={(e) => {
                          const v = Math.min(1, Math.max(0, parseFloat(e.target.value) || 0));
                          setDiscoveryMinNodeCoverage(v);
                        }}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={discoveryRestrictToTopPath}
                        onChange={(e) => {
                          setDiscoveryRestrictToTopPath(e.target.checked);
                        }}
                        className="rounded border-slate-400"
                      />
                      Nur Hauptpfad als Entscheidungsbasis
                    </label>
                    <div className="flex items-center gap-1">
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={discoveryIncludeLoops}
                          onChange={(e) => {
                            setDiscoveryIncludeLoops(e.target.checked);
                          }}
                          className="rounded border-slate-400"
                        />
                        Schleifen zulassen
                      </label>
                      <HelpPopover helpKey="mining.discoveryToBpmn.loops" ariaLabel="Hilfe: Schleifen" />
                    </div>
                    <div className="flex items-center gap-1">
                      <label className={`flex items-center gap-2 text-sm cursor-pointer select-none ${discoveryMode === 'dfg_xor_and' ? 'text-slate-700' : 'text-slate-400'}`}>
                        <input
                          type="checkbox"
                          checked={discoveryMode === 'dfg_xor_and'}
                          disabled={discoveryMode !== 'dfg_xor_and'}
                          readOnly
                          className="rounded border-slate-400 disabled:opacity-50"
                        />
                        Parallelität erkennen
                      </label>
                      <HelpPopover helpKey="mining.discoveryToBpmn.parallel" ariaLabel="Hilfe: Parallelität" />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
              <div className="inline-flex items-center gap-1">
                <button
                  onClick={() => {
                    let result: DeriveResult | DeriveDfgResult;
                    if (discoveryMode === 'top_variant') {
                      result = deriveDraftFromTopVariant(eventsA, { maxSteps: discoveryMaxSteps });
                    } else {
                      result = deriveDraftFromDfgHeuristics(eventsA, {
                        maxSteps: discoveryMaxSteps,
                        minEdgeCount,
                        minEdgeShare: discoveryMinEdgeShare,
                        maxExtraBranches: discoveryMaxExtraBranches,
                        restrictToTopVariantPath: discoveryRestrictToTopPath,
                        includeLoops: discoveryIncludeLoops,
                        enableParallelBlocks: discoveryMode === 'dfg_xor_and',
                        minNodeCoverage: discoveryMinNodeCoverage,
                      });
                    }
                    setDiscoveryDeriveResult(result);
                    const tmpVersion = {
                      ...version,
                      sidecar: {
                        ...version.sidecar,
                        captureDraft: result.draft,
                      },
                    };
                    const bpmnResult = buildBpmnXmlFromDraft(process, tmpVersion);
                    setDiscoveryBpmnXml(bpmnResult.xml);
                    setDiscoveryBpmnWarnings([...result.warnings, ...bpmnResult.warnings]);
                  }}
                  disabled={eventsA.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <RefreshCw size={14} />
                  Modell ableiten
                </button>
                <HelpPopover helpKey="mining.discoveryToBpmn.derive" ariaLabel="Hilfe: Modell ableiten" />
              </div>

              <div className="inline-flex items-center gap-1">
                <button
                  onClick={() => setDiscoveryBpmnModalOpen(true)}
                  disabled={!discoveryBpmnXml}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <FileText size={14} />
                  BPMN Vorschau
                </button>
                <HelpPopover helpKey="mining.discoveryToBpmn.preview" ariaLabel="Hilfe: BPMN Vorschau" />
              </div>

              <div className="inline-flex items-center gap-1">
                <button
                  onClick={() => {
                    if (!discoveryBpmnXml) return;
                    const base = sanitizeFilenameBase(process.title || 'discovery');
                    downloadTextFile({ filename: `${base}_discovery.bpmn`, content: discoveryBpmnXml, mimeType: 'application/xml' });
                  }}
                  disabled={!discoveryBpmnXml}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Download size={14} />
                  BPMN herunterladen
                </button>
                <HelpPopover helpKey="mining.discoveryToBpmn.download" ariaLabel="Hilfe: BPMN herunterladen" />
              </div>

              {onCreateVersionFromMining && (
                <div className="inline-flex items-center gap-1">
                  <button
                    onClick={async () => {
                      if (!discoveryDeriveResult || !discoveryBpmnXml) return;
                      setCreatingVersionFromMining(true);
                      setCreateVersionError(null);
                      try {
                        const pm = version.sidecar.processMining;
                        let remappedPm: ProcessMiningState | undefined;
                        if (pm) {
                          const normalized = normalizeProcessMiningState(pm);
                          const remappedDatasets: ProcessMiningDataset[] = [];
                          for (const ds of (normalized.datasets ?? [])) {
                            if (ds.eventsRef && !eventsRuntimeCacheRef.current.has(ds.id)) {
                              let loadError: string | null = null;
                              const ok = await loadDatasetEventsToCache(ds, (msg) => { loadError = msg; });
                              if (!ok) {
                                setCreateVersionError(
                                  `Dataset „${ds.sourceLabel}" konnte nicht geladen werden – keine neue Version gespeichert. ${loadError ?? ''}`
                                );
                                return;
                              }
                            }
                            const events = getDatasetEvents(ds);
                            remappedDatasets.push({
                              ...ds,
                              activityMappings: buildActivityStats(events, discoveryDeriveResult.draft.happyPath),
                            });
                          }
                          const activeId = normalized.activeDatasetId ?? remappedDatasets[0]?.id;
                          const activeDs = remappedDatasets.find((d) => d.id === activeId) ?? remappedDatasets[0];
                          remappedPm = {
                            ...normalized,
                            datasets: remappedDatasets,
                            activityMappings: activeDs ? activeDs.activityMappings : normalized.activityMappings,
                            activeDatasetId: activeId,
                          };
                        }
                        const titleSuffix = discoveryMode === 'top_variant'
                          ? 'Mining Modell (Top-Variante)'
                          : discoveryMode === 'dfg_xor'
                            ? 'Mining Modell (DFG XOR)'
                            : 'Mining Modell (DFG XOR+AND)';
                        await onCreateVersionFromMining({
                          titleSuffix,
                          draft: discoveryDeriveResult.draft,
                          bpmnXml: discoveryBpmnXml,
                          processMining: remappedPm,
                        });
                      } finally {
                        setCreatingVersionFromMining(false);
                      }
                    }}
                    disabled={!discoveryDeriveResult || !discoveryBpmnXml || creatingVersionFromMining}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 text-white text-sm font-medium rounded-md hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <PlusCircle size={14} />
                    {creatingVersionFromMining ? 'Wird gespeichert…' : 'Als neue Version speichern'}
                  </button>
                  <HelpPopover helpKey="mining.discoveryToBpmn.createVersion" ariaLabel="Hilfe: Als neue Version speichern" />
                </div>
              )}
            </div>

            {createVersionError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-600" />
                <p className="text-xs text-red-700">{createVersionError}</p>
              </div>
            )}

            {discoveryBpmnWarnings.length > 0 && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md space-y-1">
                {discoveryBpmnWarnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                    <AlertCircle size={12} className="mt-0.5 shrink-0" />
                    {w}
                  </p>
                ))}
              </div>
            )}

            {discoveryDeriveResult && discoveryDeriveResult.steps.length > 0 && (() => {
              const dfgResult = 'xorDecisions' in discoveryDeriveResult ? (discoveryDeriveResult as DeriveDfgResult) : null;
              const xorCount = dfgResult ? dfgResult.xorDecisions : discoveryDeriveResult.draft.decisions.filter(d => d.gatewayType === 'xor').length;
              const andCount = dfgResult ? dfgResult.andDecisions : discoveryDeriveResult.draft.decisions.filter(d => d.gatewayType === 'and').length;
              const stepById = new Map(discoveryDeriveResult.steps.map(s => [s.stepId, s]));
              const decisions = discoveryDeriveResult.draft.decisions;
              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-1.5 bg-slate-100 rounded px-3 py-1.5">
                      <span className="text-slate-500 text-xs">Steps</span>
                      <span className="font-semibold text-slate-900">{discoveryDeriveResult.steps.length}</span>
                    </div>
                    {(xorCount > 0 || andCount > 0) && (
                      <div className="flex items-center gap-1.5 bg-slate-100 rounded px-3 py-1.5">
                        <span className="text-slate-500 text-xs">XOR</span>
                        <span className="font-semibold text-slate-900">{xorCount}</span>
                        {andCount > 0 && (
                          <>
                            <span className="text-slate-400 text-xs ml-2">AND</span>
                            <span className="font-semibold text-slate-900">{andCount}</span>
                          </>
                        )}
                      </div>
                    )}
                    {discoveryDeriveResult.topVariant && (
                      <div className="flex items-center gap-1.5 bg-slate-100 rounded px-3 py-1.5">
                        <span className="text-slate-500 text-xs">Top-Variante</span>
                        <span className="font-semibold text-slate-900">{(discoveryDeriveResult.topVariant.share * 100).toFixed(1)}%</span>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium text-slate-700 w-12">#</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-700">Schritt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {discoveryDeriveResult.steps.slice(0, 20).map((step) => (
                          <tr key={step.stepId} className="border-b border-slate-100">
                            <td className="py-2 px-3 text-slate-500">{step.order}</td>
                            <td className="py-2 px-3 text-slate-900">{step.label}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {discoveryDeriveResult.steps.length > 20 && (
                      <p className="text-xs text-slate-400 mt-2 px-1">
                        … und {discoveryDeriveResult.steps.length - 20} weitere Schritte
                      </p>
                    )}
                  </div>

                  {decisions.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-600 mb-2">Entscheidungen ({decisions.length})</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="text-left py-2 px-3 font-medium text-slate-700">Nach Schritt</th>
                              <th className="text-left py-2 px-3 font-medium text-slate-700 w-16">Typ</th>
                              <th className="text-left py-2 px-3 font-medium text-slate-700 w-16">Branches</th>
                              <th className="text-left py-2 px-3 font-medium text-slate-700">Beispiel-Branches</th>
                            </tr>
                          </thead>
                          <tbody>
                            {decisions.slice(0, 10).map((dec) => {
                              const afterStep = stepById.get(dec.afterStepId);
                              const afterLabel = afterStep ? `${afterStep.order}. ${afterStep.label}` : dec.afterStepId;
                              const branchExamples = dec.branches.slice(0, 3).map(b => b.conditionLabel).join(', ');
                              return (
                                <tr key={dec.decisionId} className="border-b border-slate-100">
                                  <td className="py-2 px-3 text-slate-900 max-w-xs truncate" title={afterLabel}>{afterLabel}</td>
                                  <td className="py-2 px-3">
                                    <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded ${dec.gatewayType === 'xor' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                      {dec.gatewayType.toUpperCase()}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-slate-700 text-center">{dec.branches.length}</td>
                                  <td className="py-2 px-3 text-slate-500 text-xs max-w-xs truncate" title={branchExamples}>{branchExamples}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {decisions.length > 10 && (
                          <p className="text-xs text-slate-400 mt-2 px-1">
                            … und {decisions.length - 10} weitere Entscheidungen
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {!discoveryDeriveResult && eventsA.length === 0 && (
              <p className="text-sm text-slate-500">Bitte Event Log importieren.</p>
            )}

            {!discoveryDeriveResult && eventsA.length > 0 && (
              <p className="text-sm text-slate-500">Auf „Modell ableiten" klicken, um zu starten.</p>
            )}
          </div>
          )}
          </>)}

          {conformance && (miningView === 'conformance') && (
            <>
            <GuideCallout
              title="Ziel: Abweichungen vom Soll-Prozess identifizieren"
              steps={[
                'Conformance-Rate prüfen (wie viele Cases folgen dem Happy Path).',
                'Top-Abweichungen analysieren (Skips, Rework, Out-of-Order).',
                'Ursachen für Abweichungen untersuchen (Tab "Ursachen").'
              ]}
              tip="Niedrige Conformance deutet auf ungeklärte Varianz oder fehlende Ausnahmen im Modell hin."
            />
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Conformance Checking</h3>
                <HelpPopover helpKey="mining.conformance" ariaLabel="Hilfe: Conformance" />
              </div>

              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setConformanceTab('overview')}
                  className={conformanceTab === 'overview' ? 'pm-tab pm-tab-active' : 'pm-tab pm-tab-inactive'}
                >
                  Übersicht
                </button>
                <button
                  onClick={() => setConformanceTab('alignment')}
                  className={conformanceTab === 'alignment' ? 'pm-tab pm-tab-active' : 'pm-tab pm-tab-inactive'}
                >
                  Alignment
                </button>
                <button
                  onClick={() => setConformanceTab('bpmn')}
                  className={conformanceTab === 'bpmn' ? 'pm-tab pm-tab-active' : 'pm-tab pm-tab-inactive'}
                >
                  BPMN
                </button>
                <button
                  onClick={() => setConformanceTab('draft')}
                  className={conformanceTab === 'draft' ? 'pm-tab pm-tab-active' : 'pm-tab pm-tab-inactive'}
                >
                  Draft
                </button>
              </div>

              {conformanceTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
                    <p className="text-xs text-slate-600 mb-1">Exakt konform (Happy Path)</p>
                    <p className="text-2xl font-bold text-emerald-700">
                      {conformance.exactHappyPath.count} / {conformance.totalCases}
                    </p>
                    <p className="text-sm text-slate-600">
                      ({(conformance.exactHappyPath.pct * 100).toFixed(1)}%)
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
                    <p className="text-xs text-slate-600 mb-1">Happy Path abgedeckt</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {conformance.casesCoverHappyPath.count} / {conformance.totalCases}
                    </p>
                    <p className="text-sm text-slate-600">
                      ({(conformance.casesCoverHappyPath.pct * 100).toFixed(1)}%)
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
                    <p className="text-xs text-slate-600 mb-1">Backtracking erkannt</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {conformance.casesWithBacktrack.count} / {conformance.totalCases}
                    </p>
                    <p className="text-sm text-slate-600">
                      ({(conformance.casesWithBacktrack.pct * 100).toFixed(1)}%)
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
                    <p className="text-xs text-slate-600 mb-1">Cases mit unmapped Aktivitäten</p>
                    <p className="text-2xl font-bold text-amber-700">
                      {conformance.casesWithUnmapped.count} / {conformance.totalCases}
                    </p>
                    <p className="text-sm text-slate-600">
                      ({(conformance.casesWithUnmapped.pct * 100).toFixed(1)}%)
                    </p>
                  </div>
                </div>

                {conformance.missingStepCounts.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-2">
                      Häufig fehlende Schritte (Top 10)
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-slate-700">Schritt</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-700 w-20">Count</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-700 w-20">Anteil</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-700 w-24">Beispiel</th>
                          </tr>
                        </thead>
                        <tbody>
                          {conformance.missingStepCounts.map((item) => (
                            <tr key={item.stepId} className="border-b border-slate-100">
                              <td className="py-2 px-3 text-slate-900">{item.label}</td>
                              <td className="py-2 px-3 text-slate-900">{item.count}</td>
                              <td className="py-2 px-3 text-slate-900">{(item.pct * 100).toFixed(1)}%</td>
                              <td className="py-2 px-3">
                                {item.exampleCaseIds[0] ? (
                                  <button
                                    onClick={() => focusCase(item.exampleCaseIds[0])}
                                    className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-blue-800 transition-colors"
                                  >
                                    Öffnen
                                  </button>
                                ) : (
                                  <span className="text-slate-400 text-xs">–</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {conformance.deviationPatterns.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-2">
                      Abweichungsmuster (Top 8)
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-slate-700">Muster</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-700 w-20">Count</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-700 w-20">Anteil</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-700 w-40">Beispiele</th>
                          </tr>
                        </thead>
                        <tbody>
                          {conformance.deviationPatterns.map((pattern) => (
                            <tr key={pattern.key} className="border-b border-slate-100">
                              <td className="py-2 px-3 text-slate-900">{pattern.label}</td>
                              <td className="py-2 px-3 text-slate-900">{pattern.count}</td>
                              <td className="py-2 px-3 text-slate-900">{(pattern.pct * 100).toFixed(1)}%</td>
                              <td className="py-2 px-3">
                                <div className="flex flex-wrap gap-1">
                                  {pattern.exampleCaseIds.map((cid) => (
                                    <button
                                      key={cid}
                                      onClick={() => focusCase(cid)}
                                      className="text-xs px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-slate-700 transition-colors truncate max-w-[80px]"
                                      title={cid}
                                    >
                                      {cid}
                                    </button>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {conformance.mappedVariants.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-2">
                      Mapped Varianten (Top 10)
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-slate-700">Variante</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-700 w-20">Count</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-700 w-20">Anteil</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-700 w-24">Beispiel</th>
                          </tr>
                        </thead>
                        <tbody>
                          {conformance.mappedVariants.map((v, idx) => (
                            <tr key={idx} className="border-b border-slate-100">
                              <td className="py-2 px-3 text-slate-900 max-w-xs truncate" title={v.variant}>
                                {v.variant}
                              </td>
                              <td className="py-2 px-3 text-slate-900">{v.count}</td>
                              <td className="py-2 px-3 text-slate-900">{(v.share * 100).toFixed(1)}%</td>
                              <td className="py-2 px-3">
                                {v.exampleCaseId ? (
                                  <button
                                    onClick={() => focusCase(v.exampleCaseId)}
                                    className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-blue-800 transition-colors"
                                  >
                                    Öffnen
                                  </button>
                                ) : (
                                  <span className="text-slate-400 text-xs">–</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-200 pt-4 mt-6">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">Erweiterte Analysen aktivieren</h4>
                  <div className="flex flex-wrap gap-4 items-center">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={advancedConformanceEnabled}
                        onChange={(e) => setAdvancedConformanceEnabled(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600"
                      />
                      <span className="text-sm font-medium text-slate-700">Erweiterte Conformance (Alignment/BPMN)</span>
                    </label>
                    <label className={`flex items-center gap-2 cursor-pointer select-none ${!advancedConformanceEnabled || !version.bpmn?.bpmnXml ? 'opacity-40' : ''}`}>
                      <input
                        type="checkbox"
                        checked={bpmnConformanceEnabled}
                        disabled={!advancedConformanceEnabled || !version.bpmn?.bpmnXml}
                        onChange={(e) => setBpmnConformanceEnabled(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600"
                      />
                      <span className="text-sm text-slate-700">BPMN als Modell prüfen</span>
                    </label>
                    <div className={`flex items-center gap-2 ${!advancedConformanceEnabled ? 'opacity-40' : ''}`}>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draftModelConformanceEnabled}
                          disabled={!advancedConformanceEnabled}
                          onChange={(e) => {
                            setDraftModelConformanceEnabled(e.target.checked);
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600"
                        />
                        <span className="text-sm text-slate-700">Draft als Modell prüfen</span>
                      </label>
                      <HelpPopover helpKey="mining.conformance.draftModel.toggle" />
                    </div>
                    {advancedConformanceEnabled && !version.bpmn?.bpmnXml && (
                      <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        Hinweis: BPMN muss vorher exportiert werden (Draft → BPMN Export).
                      </span>
                    )}
                  </div>
                </div>
              </div>
              )}

              {conformanceTab === 'alignment' && (
              <div className="space-y-6">
                {!advancedConformanceEnabled ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                    <p className="text-sm text-slate-700">
                      Aktivieren Sie "Erweiterte Conformance" auf der Übersicht-Seite, um diese Ansicht zu nutzen.
                    </p>
                  </div>
                ) : (
                <>
                  {eventsA.length >= HEAVY_ALIGNMENT_THRESHOLD && alignmentWorkerStatusA === 'computing' && (
                    <div className="space-y-4 mt-4">
                      <h4 className="text-sm font-semibold text-slate-900">Erweiterte Conformance: Alignment (Edit Distance)</h4>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-slate-600 animate-spin" />
                        <span className="text-sm text-slate-700">Alignment wird im Hintergrund berechnet…</span>
                      </div>
                    </div>
                  )}

                  {alignmentWorkerStatusA === 'error' && (
                    <div className="space-y-4 mt-4">
                      <h4 className="text-sm font-semibold text-slate-900">Erweiterte Conformance: Alignment (Edit Distance)</h4>
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-amber-800">
                            <p className="font-medium">Fehler bei der Berechnung</p>
                            {alignmentWorkerErrorA && <p className="mt-1 text-xs">{alignmentWorkerErrorA}</p>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {alignmentConformanceA && (
                    <div className="space-y-4 mt-4">
                      <h4 className="text-sm font-semibold text-slate-900">Erweiterte Conformance: Alignment (Edit Distance)</h4>

                      {eventsB && eventsB.length >= HEAVY_ALIGNMENT_THRESHOLD && alignmentWorkerStatusB === 'computing' && (
                        <div className="space-y-3 mb-4">
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 text-slate-600 animate-spin" />
                            <span className="text-xs text-slate-700">Alignment für Segment B wird berechnet…</span>
                          </div>
                        </div>
                      )}

                      {alignmentWorkerStatusB === 'error' && (
                        <div className="space-y-3 mb-4">
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                              <div className="text-xs text-amber-800">
                                <p className="font-medium">Fehler bei Berechnung Segment B</p>
                                {alignmentWorkerErrorB && <p className="mt-1 text-xs">{alignmentWorkerErrorB}</p>}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {alignmentConformanceB && (
                        <div className="space-y-3 mb-4">
                          <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                            <p className="text-xs font-semibold text-slate-700 mb-2">Segment-Vergleich</p>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-slate-200">
                                    <th className="text-left py-1.5 px-2 text-slate-600 font-medium">Kennzahl</th>
                                    <th className="text-right py-1.5 px-2 text-slate-600 font-medium">Segment A</th>
                                    <th className="text-right py-1.5 px-2 text-slate-600 font-medium">Segment B</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="border-b border-slate-100">
                                    <td className="py-1.5 px-2 text-slate-700">Fitness Median</td>
                                    <td className="py-1.5 px-2 text-right text-slate-900 font-semibold">{(alignmentConformanceA.fitnessMedian * 100).toFixed(1)}%</td>
                                    <td className="py-1.5 px-2 text-right text-slate-900 font-semibold">{(alignmentConformanceB.fitnessMedian * 100).toFixed(1)}%</td>
                                  </tr>
                                  <tr className="border-b border-slate-100">
                                    <td className="py-1.5 px-2 text-slate-700">Median Distance</td>
                                    <td className="py-1.5 px-2 text-right text-slate-900 font-semibold">{alignmentConformanceA.medianDistance.toFixed(1)}</td>
                                    <td className="py-1.5 px-2 text-right text-slate-900 font-semibold">{alignmentConformanceB.medianDistance.toFixed(1)}</td>
                                  </tr>
                                  <tr className="border-b border-slate-100">
                                    <td className="py-1.5 px-2 text-slate-700">Order Violations</td>
                                    <td className="py-1.5 px-2 text-right text-slate-900 font-semibold">{(alignmentConformanceA.casesWithOrderViolations.pct * 100).toFixed(1)}%</td>
                                    <td className="py-1.5 px-2 text-right text-slate-900 font-semibold">{(alignmentConformanceB.casesWithOrderViolations.pct * 100).toFixed(1)}%</td>
                                  </tr>
                                  <tr>
                                    <td className="py-1.5 px-2 text-slate-700">Rework</td>
                                    <td className="py-1.5 px-2 text-right text-slate-900 font-semibold">{(alignmentConformanceA.casesWithRework.pct * 100).toFixed(1)}%</td>
                                    <td className="py-1.5 px-2 text-right text-slate-900 font-semibold">{(alignmentConformanceB.casesWithRework.pct * 100).toFixed(1)}%</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-600 font-medium">Details anzeigen für:</span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => setAlignmentDetailSegment('A')}
                                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                  alignmentDetailSegment === 'A'
                                    ? 'bg-slate-900 text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                              >
                                Segment A
                              </button>
                              <button
                                onClick={() => setAlignmentDetailSegment('B')}
                                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                  alignmentDetailSegment === 'B'
                                    ? 'bg-slate-900 text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                              >
                                Segment B
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {alignmentDisplayed && (
                        <>
                          {alignmentDisplayed.warnings.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-1">
                              {alignmentDisplayed.warnings.slice(0, 5).map((w, i) => (
                                <p key={i} className="text-xs text-amber-800">{w}</p>
                              ))}
                            </div>
                          )}

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                          <div className="flex items-center gap-1 mb-1">
                            <p className="text-xs text-slate-500">Fitness (Median)</p>
                            <HelpPopover helpKey="mining.conformance.fitness" />
                          </div>
                          <p className="text-xl font-bold text-slate-900">{(alignmentDisplayed.fitnessMedian * 100).toFixed(1)}%</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                          <p className="text-xs text-slate-500 mb-1">Median Distance</p>
                          <p className="text-xl font-bold text-slate-900">{alignmentDisplayed.medianDistance.toFixed(1)}</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                          <div className="flex items-center gap-1 mb-1">
                            <p className="text-xs text-slate-500">Order & Rework</p>
                            <HelpPopover helpKey="mining.conformance.order" />
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-600">Order:</span>
                              <span className="font-semibold text-slate-900">{alignmentDisplayed.casesWithOrderViolations.count} ({(alignmentDisplayed.casesWithOrderViolations.pct * 100).toFixed(1)}%)</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-600">Rework:</span>
                              <span className="font-semibold text-slate-900">{alignmentDisplayed.casesWithRework.count} ({(alignmentDisplayed.casesWithRework.pct * 100).toFixed(1)}%)</span>
                            </div>
                          </div>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                          <p className="text-xs text-slate-500 mb-1">Analysiert</p>
                          <p className="text-xl font-bold text-slate-900">{alignmentDisplayed.analyzedCases.toLocaleString('de-DE')}</p>
                          {alignmentDisplayed.analyzedCases < alignmentDisplayed.totalCases && (
                            <p className="text-xs text-slate-500">von {alignmentDisplayed.totalCases.toLocaleString('de-DE')}</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <h5 className="text-xs font-semibold text-slate-700 mb-2">Distance-Buckets</h5>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>
                                <th className="text-left py-2 px-3 font-medium text-slate-700">Bucket</th>
                                <th className="text-left py-2 px-3 font-medium text-slate-700 w-24">Count</th>
                                <th className="text-left py-2 px-3 font-medium text-slate-700 w-24">Anteil</th>
                                <th className="text-left py-2 px-3 font-medium text-slate-700 w-24">Beispiel</th>
                              </tr>
                            </thead>
                            <tbody>
                              {alignmentDisplayed.distanceBuckets.map((b) => (
                                <tr key={b.bucket} className="border-b border-slate-100">
                                  <td className="py-2 px-3 text-slate-900 font-mono">{b.bucket}</td>
                                  <td className="py-2 px-3 text-slate-900">{b.count}</td>
                                  <td className="py-2 px-3 text-slate-900">{(b.pct * 100).toFixed(1)}%</td>
                                  <td className="py-2 px-3">
                                    {b.exampleCaseId ? (
                                      <button
                                        onClick={() => focusCase(b.exampleCaseId!)}
                                        className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-blue-800 transition-colors"
                                      >
                                        Öffnen
                                      </button>
                                    ) : <span className="text-slate-400 text-xs">–</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {alignmentDisplayed.worstCases.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-slate-700 mb-2">Worst Cases (Top 5)</h5>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                  <th className="text-left py-2 px-3 font-medium text-slate-700">Case</th>
                                  <th className="text-left py-2 px-3 font-medium text-slate-700 w-24">Distance</th>
                                  <th className="text-left py-2 px-3 font-medium text-slate-700 w-16">+Ins</th>
                                  <th className="text-left py-2 px-3 font-medium text-slate-700 w-16">+Del</th>
                                  <th className="text-left py-2 px-3 font-medium text-slate-700 w-20">Gemappt</th>
                                  <th className="text-left py-2 px-3 font-medium text-slate-700 w-24">Öffnen</th>
                                </tr>
                              </thead>
                              <tbody>
                                {alignmentDisplayed.worstCases.map((wc) => (
                                  <tr key={wc.caseId} className="border-b border-slate-100">
                                    <td className="py-2 px-3 text-slate-900 font-mono text-xs max-w-[120px] truncate" title={wc.caseId}>{wc.caseId}</td>
                                    <td className="py-2 px-3 text-red-700 font-semibold">{wc.distance}</td>
                                    <td className="py-2 px-3 text-slate-700">{wc.insertions}</td>
                                    <td className="py-2 px-3 text-slate-700">{wc.deletions}</td>
                                    <td className="py-2 px-3 text-slate-700">{wc.mappedSteps}</td>
                                    <td className="py-2 px-3">
                                      <button
                                        onClick={() => focusCase(wc.caseId)}
                                        className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-blue-800 transition-colors"
                                      >
                                        Öffnen
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {(alignmentDisplayed.topDeletedSteps.length > 0 || alignmentDisplayed.topInsertedSteps.length > 0) && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <h5 className="text-xs font-semibold text-slate-700">Deviation Explorer (Alignment)</h5>
                            <HelpPopover helpKey="mining.conformance.alignmentDeviations" />
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
                              <span className="text-xs text-amber-800">Fälle mit zusätzlichen Schritten:</span>
                              <span className="text-xs font-semibold text-amber-900">{alignmentDisplayed.casesWithInsertions.count.toLocaleString('de-DE')}</span>
                              <span className="text-xs text-amber-700">({(alignmentDisplayed.casesWithInsertions.pct * 100).toFixed(1)}%)</span>
                            </div>
                            <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-md px-3 py-1.5">
                              <span className="text-xs text-rose-800">Fälle mit fehlenden Schritten:</span>
                              <span className="text-xs font-semibold text-rose-900">{alignmentDisplayed.casesWithDeletions.count.toLocaleString('de-DE')}</span>
                              <span className="text-xs text-rose-700">({(alignmentDisplayed.casesWithDeletions.pct * 100).toFixed(1)}%)</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <h6 className="text-xs font-semibold text-slate-700">Fehlende Schritte</h6>
                                <HelpPopover helpKey="mining.conformance.alignmentDeletions" />
                              </div>
                              {alignmentDisplayed.topDeletedSteps.length === 0 ? (
                                <p className="text-xs text-slate-400">Keine fehlenden Schritte gefunden.</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                      <tr>
                                        <th className="text-left py-2 px-2 font-medium text-slate-700 w-10">#</th>
                                        <th className="text-left py-2 px-2 font-medium text-slate-700">Schritt</th>
                                        <th className="text-left py-2 px-2 font-medium text-slate-700 w-14">Count</th>
                                        <th className="text-left py-2 px-2 font-medium text-slate-700 w-16">Anteil</th>
                                        <th className="text-left py-2 px-2 font-medium text-slate-700 w-20">Beispiel</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {alignmentDisplayed.topDeletedSteps.map((d) => (
                                        <tr key={d.stepId} className="border-b border-slate-100">
                                          <td className="py-1.5 px-2 text-slate-500 font-mono text-xs">{d.order}</td>
                                          <td className="py-1.5 px-2 text-slate-900 text-xs max-w-[140px] truncate" title={d.label}>{d.label}</td>
                                          <td className="py-1.5 px-2 text-slate-900 text-xs">{d.count}</td>
                                          <td className="py-1.5 px-2 text-slate-700 text-xs">{(d.pct * 100).toFixed(1)}%</td>
                                          <td className="py-1.5 px-2">
                                            {d.exampleCaseId ? (
                                              <button
                                                onClick={() => focusCase(d.exampleCaseId!)}
                                                className="text-xs px-2 py-0.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-blue-800 transition-colors"
                                              >
                                                Öffnen
                                              </button>
                                            ) : <span className="text-slate-400 text-xs">–</span>}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>

                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <h6 className="text-xs font-semibold text-slate-700">Zusätzliche Schritte</h6>
                                <HelpPopover helpKey="mining.conformance.alignmentInsertions" />
                              </div>
                              {alignmentDisplayed.topInsertedSteps.length === 0 ? (
                                <p className="text-xs text-slate-400">Keine zusätzlichen Schritte gefunden.</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                      <tr>
                                        <th className="text-left py-2 px-2 font-medium text-slate-700 w-10">#</th>
                                        <th className="text-left py-2 px-2 font-medium text-slate-700">Schritt</th>
                                        <th className="text-left py-2 px-2 font-medium text-slate-700 w-14">Count</th>
                                        <th className="text-left py-2 px-2 font-medium text-slate-700 w-16">Anteil</th>
                                        <th className="text-left py-2 px-2 font-medium text-slate-700 w-20">Beispiel</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {alignmentDisplayed.topInsertedSteps.map((d) => (
                                        <tr key={d.stepId} className="border-b border-slate-100">
                                          <td className="py-1.5 px-2 text-slate-500 font-mono text-xs">{d.order}</td>
                                          <td className="py-1.5 px-2 text-slate-900 text-xs max-w-[140px] truncate" title={d.label}>{d.label}</td>
                                          <td className="py-1.5 px-2 text-slate-900 text-xs">{d.count}</td>
                                          <td className="py-1.5 px-2 text-slate-700 text-xs">{(d.pct * 100).toFixed(1)}%</td>
                                          <td className="py-1.5 px-2">
                                            {d.exampleCaseId ? (
                                              <button
                                                onClick={() => focusCase(d.exampleCaseId!)}
                                                className="text-xs px-2 py-0.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-blue-800 transition-colors"
                                              >
                                                Öffnen
                                              </button>
                                            ) : <span className="text-slate-400 text-xs">–</span>}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {alignmentDisplayed.topPatterns.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <h5 className="text-xs font-semibold text-slate-700">Top Abweichungsmuster</h5>
                            <HelpPopover helpKey="mining.conformance.patterns" />
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border border-slate-200">
                              <thead className="bg-slate-50">
                                <tr className="border-b border-slate-200">
                                  <th className="text-left py-2 px-3 font-medium text-slate-700">Muster</th>
                                  <th className="text-right py-2 px-3 font-medium text-slate-700 w-20">Count</th>
                                  <th className="text-right py-2 px-3 font-medium text-slate-700 w-20">Anteil</th>
                                  <th className="text-center py-2 px-3 font-medium text-slate-700 w-24">Beispiel</th>
                                </tr>
                              </thead>
                              <tbody>
                                {alignmentDisplayed.topPatterns.map((pattern, idx) => (
                                  <tr key={idx} className="border-b border-slate-100">
                                    <td className="py-2 px-3 text-slate-900 font-mono text-xs max-w-[200px] break-words" title={pattern.signature}>
                                      {pattern.signature}
                                    </td>
                                    <td className="py-2 px-3 text-right text-slate-900 font-semibold">{pattern.count}</td>
                                    <td className="py-2 px-3 text-right text-slate-900">{(pattern.pct * 100).toFixed(1)}%</td>
                                    <td className="py-2 px-3 text-center">
                                      {pattern.exampleCaseId ? (
                                        <button
                                          onClick={() => focusCase(pattern.exampleCaseId!)}
                                          className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-blue-800 transition-colors"
                                        >
                                          Öffnen
                                        </button>
                                      ) : (
                                        <span className="text-slate-400">–</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {deviationAttributeSignalsDisplayed && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <h5 className="text-xs font-semibold text-slate-700">Attribute-Signale für Abweichungen</h5>
                            <HelpPopover helpKey="mining.conformance.attributes" />
                          </div>

                          {deviationAttributeSignalsDisplayed.warnings.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-md p-2">
                              {deviationAttributeSignalsDisplayed.warnings.map((w, i) => (
                                <p key={i} className="text-xs text-amber-800">{w}</p>
                              ))}
                            </div>
                          )}

                          {deviationAttributeSignalsDisplayed.signals.length === 0 ? (
                            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-3">
                              Keine ausreichenden Attribute-Signale gefunden.
                            </p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs border border-slate-200">
                                <thead className="bg-slate-50">
                                  <tr className="border-b border-slate-200">
                                    <th className="text-left py-2 px-3 font-medium text-slate-700">Attribut</th>
                                    <th className="text-left py-2 px-3 font-medium text-slate-700">Wert</th>
                                    <th className="text-right py-2 px-3 font-medium text-slate-700 w-20">Lift</th>
                                    <th className="text-right py-2 px-3 font-medium text-slate-700 w-28">Support</th>
                                    <th className="text-center py-2 px-3 font-medium text-slate-700 w-24">Beispiel</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {deviationAttributeSignalsDisplayed.signals.map((signal, idx) => (
                                    <tr key={idx} className="border-b border-slate-100">
                                      <td className="py-2 px-3 text-slate-700 font-medium">{signal.key}</td>
                                      <td className="py-2 px-3 text-slate-900 max-w-[150px] truncate" title={signal.value}>
                                        {signal.value}
                                      </td>
                                      <td className="py-2 px-3 text-right text-slate-900 font-semibold">
                                        {signal.lift === Infinity ? '∞' : signal.lift.toFixed(2)}
                                      </td>
                                      <td className="py-2 px-3 text-right text-slate-900">
                                        {signal.supportCases} ({(signal.supportPct * 100).toFixed(1)}%)
                                      </td>
                                      <td className="py-2 px-3 text-center">
                                        {signal.exampleCaseId ? (
                                          <button
                                            onClick={() => focusCase(signal.exampleCaseId!)}
                                            className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-blue-800 transition-colors"
                                          >
                                            Öffnen
                                          </button>
                                        ) : (
                                          <span className="text-slate-400">–</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                        </>
                      )}
                    </div>
                  )}
                </>
                )}
              </div>
              )}

              {conformanceTab === 'bpmn' && (
              <div className="space-y-6">
                {!advancedConformanceEnabled ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                    <p className="text-sm text-slate-700">
                      Aktivieren Sie "Erweiterte Conformance" auf der Übersicht-Seite, um diese Ansicht zu nutzen.
                    </p>
                  </div>
                ) : !bpmnConformance ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
                    <p className="text-sm text-slate-700 mb-2 font-medium">BPMN-Modell erforderlich</p>
                    <p className="text-xs text-slate-600">
                      Um BPMN Conformance zu nutzen, exportieren Sie zunächst Ihren Draft als BPMN (Draft → BPMN Export)
                      und aktivieren Sie "BPMN als Modell prüfen" auf der Übersicht-Seite.
                    </p>
                  </div>
                ) : (
                <>
                  {bpmnConformance && (
                    <div className="space-y-4 mt-4">
                      <h4 className="text-sm font-semibold text-slate-900">BPMN Conformance (Transitions)</h4>

                      {bpmnConformance.warnings.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-1">
                          {bpmnConformance.warnings.map((w, i) => (
                            <p key={i} className="text-xs text-amber-800">{w}</p>
                          ))}
                        </div>
                      )}

                      <div className="text-xs text-slate-500 mb-1">
                        Modell: {bpmnConformance.modelInfo.tasks} Tasks, {bpmnConformance.modelInfo.flows} Flows
                        {bpmnConformance.modelInfo.hasParallel && ' · Parallelität erkannt'}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3">
                          <p className="text-xs text-slate-500 mb-1">Transition-konform</p>
                          <p className="text-xl font-bold text-emerald-700">{bpmnConformance.casesConformTransitions.count}</p>
                          <p className="text-xs text-slate-500">{(bpmnConformance.casesConformTransitions.pct * 100).toFixed(1)}%</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                          <p className="text-xs text-slate-500 mb-1">Illegale Starts</p>
                          <p className="text-xl font-bold text-amber-700">{bpmnConformance.casesWithIllegalStart.count}</p>
                          <p className="text-xs text-slate-500">{(bpmnConformance.casesWithIllegalStart.pct * 100).toFixed(1)}%</p>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-md p-3">
                          <p className="text-xs text-slate-500 mb-1">Illegale Transitions</p>
                          <p className="text-xl font-bold text-red-700">{bpmnConformance.casesWithIllegalTransition.count}</p>
                          <p className="text-xs text-slate-500">{(bpmnConformance.casesWithIllegalTransition.pct * 100).toFixed(1)}%</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                          <p className="text-xs text-slate-500 mb-1">Unbekannte Tasks</p>
                          <p className="text-xl font-bold text-slate-700">{bpmnConformance.casesWithUnknownTasks.count}</p>
                          <p className="text-xs text-slate-500">{(bpmnConformance.casesWithUnknownTasks.pct * 100).toFixed(1)}%</p>
                        </div>
                      </div>

                      {bpmnConformance.topIllegalTransitions.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-slate-700 mb-2">Top illegale Transitions</h5>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                  <th className="text-left py-2 px-3 font-medium text-slate-700">Von</th>
                                  <th className="text-left py-2 px-3 font-medium text-slate-700">Nach</th>
                                  <th className="text-left py-2 px-3 font-medium text-slate-700 w-20">Count</th>
                                  <th className="text-left py-2 px-3 font-medium text-slate-700 w-20">Anteil</th>
                                  <th className="text-left py-2 px-3 font-medium text-slate-700 w-24">Beispiel</th>
                                </tr>
                              </thead>
                              <tbody>
                                {bpmnConformance.topIllegalTransitions.map((t, idx) => (
                                  <tr key={idx} className="border-b border-slate-100">
                                    <td className="py-2 px-3 text-slate-900 max-w-[140px] truncate" title={t.fromLabel}>{t.fromLabel}</td>
                                    <td className="py-2 px-3 text-slate-900 max-w-[140px] truncate" title={t.toLabel}>{t.toLabel}</td>
                                    <td className="py-2 px-3 text-slate-900">{t.count}</td>
                                    <td className="py-2 px-3 text-slate-900">{(t.pct * 100).toFixed(1)}%</td>
                                    <td className="py-2 px-3">
                                      {t.exampleCaseIds[0] ? (
                                        <button
                                          onClick={() => focusCase(t.exampleCaseIds[0])}
                                          className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-blue-800 transition-colors"
                                        >
                                          Öffnen
                                        </button>
                                      ) : <span className="text-slate-400 text-xs">–</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
                )}
              </div>
              )}

              {conformanceTab === 'draft' && (
              <div className="space-y-6">
                {!advancedConformanceEnabled ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                    <p className="text-sm text-slate-700">
                      Aktivieren Sie "Erweiterte Conformance" auf der Übersicht-Seite, um diese Ansicht zu nutzen.
                    </p>
                  </div>
                ) : !draftTransitionConformance ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
                    <p className="text-sm text-slate-700 mb-2 font-medium">Draft-Modell erforderlich</p>
                    <p className="text-xs text-slate-600">
                      Um Draft Conformance zu nutzen, aktivieren Sie "Draft als Modell prüfen" auf der Übersicht-Seite.
                    </p>
                  </div>
                ) : (
                <>
                  {draftTransitionConformance && (
                    <div className="space-y-4 mt-4">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-slate-900">Draft Conformance (Transitions)</h4>
                        <HelpPopover helpKey="mining.conformance.draftModel" />
                      </div>

                      {draftTransitionConformance.warnings.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-1">
                          {draftTransitionConformance.warnings.map((w, i) => (
                            <p key={i} className="text-xs text-amber-800">{w}</p>
                          ))}
                        </div>
                      )}

                      <div className="text-xs text-slate-500 mb-1">
                        Modell: {draftTransitionConformance.modelInfo.nodes} Schritte, {draftTransitionConformance.modelInfo.flows} erlaubte Transitionen, XOR: {draftTransitionConformance.modelInfo.xorDecisions}, AND-Blöcke: {draftTransitionConformance.modelInfo.andBlocks}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3">
                          <p className="text-xs text-slate-500 mb-1">Konform (Transitions)</p>
                          <p className="text-xl font-bold text-emerald-700">{draftTransitionConformance.casesConformTransitions.count}</p>
                          <p className="text-xs text-slate-500">{(draftTransitionConformance.casesConformTransitions.pct * 100).toFixed(1)}%</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                          <p className="text-xs text-slate-500 mb-1">Illegal Start</p>
                          <p className="text-xl font-bold text-amber-700">{draftTransitionConformance.casesWithIllegalStart.count}</p>
                          <p className="text-xs text-slate-500">{(draftTransitionConformance.casesWithIllegalStart.pct * 100).toFixed(1)}%</p>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-md p-3">
                          <p className="text-xs text-slate-500 mb-1">Illegal Transition</p>
                          <p className="text-xl font-bold text-red-700">{draftTransitionConformance.casesWithIllegalTransition.count}</p>
                          <p className="text-xs text-slate-500">{(draftTransitionConformance.casesWithIllegalTransition.pct * 100).toFixed(1)}%</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                          <p className="text-xs text-slate-500 mb-1">Keine gemappten Schritte</p>
                          <p className="text-xl font-bold text-slate-700">{draftTransitionConformance.casesWithNoMappedSteps.count}</p>
                          <p className="text-xs text-slate-500">{(draftTransitionConformance.casesWithNoMappedSteps.pct * 100).toFixed(1)}%</p>
                        </div>
                      </div>

                      {draftTransitionConformance.topIllegalTransitions.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-slate-700 mb-2">Top illegale Transitions</h5>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                  <th className="text-left py-2 px-3 font-medium text-slate-700">Von</th>
                                  <th className="text-left py-2 px-3 font-medium text-slate-700">Nach</th>
                                  <th className="text-left py-2 px-3 font-medium text-slate-700 w-20">Count</th>
                                  <th className="text-left py-2 px-3 font-medium text-slate-700 w-20">Anteil</th>
                                  <th className="text-left py-2 px-3 font-medium text-slate-700 w-24">Beispiel</th>
                                </tr>
                              </thead>
                              <tbody>
                                {draftTransitionConformance.topIllegalTransitions.map((t, idx) => (
                                  <tr key={idx} className="border-b border-slate-100">
                                    <td className="py-2 px-3 text-slate-900 max-w-[140px] truncate" title={t.fromLabel}>{t.fromLabel}</td>
                                    <td className="py-2 px-3 text-slate-900 max-w-[140px] truncate" title={t.toLabel}>{t.toLabel}</td>
                                    <td className="py-2 px-3 text-slate-900">{t.count}</td>
                                    <td className="py-2 px-3 text-slate-900">{(t.pct * 100).toFixed(1)}%</td>
                                    <td className="py-2 px-3">
                                      {t.exampleCaseIds[0] ? (
                                        <button
                                          onClick={() => focusCase(t.exampleCaseIds[0])}
                                          className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-blue-800 transition-colors"
                                        >
                                          Öffnen
                                        </button>
                                      ) : <span className="text-slate-400 text-xs">–</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
                )}
              </div>
              )}
            </div>
            </>
          )}

          {(miningView === 'performance') && processMining && (
            <>
            <GuideCallout
              title="Ziel: Durchlaufzeiten und Bottlenecks analysieren"
              steps={[
                'Case Duration Distribution prüfen (Min, Median, Max).',
                'Transition-Performance analysieren (wo dauert es am längsten).',
                'SLA-Regeln definieren und Verstöße identifizieren.'
              ]}
              tip="Lange Wartezeiten zwischen Schritten deuten oft auf Übergabeprobleme oder fehlende Ressourcen hin."
            />

            <div className="pm-card pm-card-pad">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Performance Analyse</h3>
              </div>

              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setPerformanceTab('happyPath')}
                  className={performanceTab === 'happyPath' ? 'pm-tab pm-tab-active' : 'pm-tab pm-tab-inactive'}
                >
                  Happy Path
                </button>
                <button
                  onClick={() => setPerformanceTab('durations')}
                  className={performanceTab === 'durations' ? 'pm-tab pm-tab-active' : 'pm-tab pm-tab-inactive'}
                >
                  Durchlaufzeiten
                </button>
                <button
                  onClick={() => setPerformanceTab('bottlenecks')}
                  className={performanceTab === 'bottlenecks' ? 'pm-tab pm-tab-active' : 'pm-tab pm-tab-inactive'}
                >
                  Bottlenecks
                </button>
                <button
                  onClick={() => setPerformanceTab('sla')}
                  className={performanceTab === 'sla' ? 'pm-tab pm-tab-active' : 'pm-tab pm-tab-inactive'}
                >
                  SLA
                </button>
              </div>

              {performanceTab === 'happyPath' && (
              <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <ArrowDownUp className="w-5 h-5 text-slate-600" />
                <h4 className="text-base font-semibold text-slate-900">Happy Path Vorschlag (aus Mining)</h4>
              </div>

              {!version.sidecar.captureDraft ? (
                <p className="text-sm text-slate-500">
                  Kein Capture Draft vorhanden. Bitte zuerst den Happy Path im Capture-Tab definieren.
                </p>
              ) : !conformance || !conformance.mappedVariants.length ? (
                <p className="text-sm text-slate-500">
                  Keine gemappten Varianten vorhanden. Voraussetzung: Aktivitäten müssen auf Schritte gemappt sein (Mapping-Assistent).
                </p>
              ) : !happyPathSuggestion || happyPathSuggestion.suggestedSteps.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-slate-500">
                    Keine gemappte Variante verfügbar (Mapping prüfen).
                  </p>
                  {happyPathSuggestion?.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700">{w}</p>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                    <p className="text-xs text-slate-600 mb-1">
                      Basis: Top Variante — {happyPathSuggestion.top.count} Cases ({(happyPathSuggestion.top.share * 100).toFixed(1)}%)
                    </p>
                    <p className="text-xs text-slate-500 font-mono truncate" title={happyPathSuggestion.top.variant}>
                      {happyPathSuggestion.top.variant.length > 120
                        ? happyPathSuggestion.top.variant.substring(0, 120) + '...'
                        : happyPathSuggestion.top.variant}
                    </p>
                  </div>

                  {happyPathSuggestion.warnings.length > 0 && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 space-y-0.5">
                      {happyPathSuggestion.warnings.map((w, i) => (
                        <div key={i}>{w}</div>
                      ))}
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium text-slate-700 w-24">Neue Pos.</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-700">Step</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-700 w-28">Bisherige Pos.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {happyPathSuggestion.suggestedSteps.map((step, idx) => (
                          <tr key={step.stepId} className="border-b border-slate-100">
                            <td className="py-2 px-3 text-slate-900 font-medium">{idx + 1}</td>
                            <td className="py-2 px-3 text-slate-900">{step.label}</td>
                            <td className="py-2 px-3 text-slate-500">{step.order}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appendRemaining}
                      onChange={(e) => setAppendRemaining(e.target.checked)}
                    />
                    <span className="text-sm text-slate-700">Nicht enthaltene Steps ans Ende hängen</span>
                  </label>

                  <button
                    onClick={handleApplyHappyPathSuggestion}
                    disabled={happyPathSuggestion.suggestedSteps.length < 2}
                    className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:bg-slate-400 text-sm"
                  >
                    Vorschlag anwenden
                  </button>

                  {happyPathStatus && (
                    <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-3">
                      {happyPathStatus}
                    </div>
                  )}
                </div>
              )}
              </div>
              )}

              {performanceTab === 'durations' && (
              <div className="space-y-6">
          {eventsA.length >= HEAVY_DURATION_THRESHOLD && caseDurationWorkerStatus === 'computing' && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-slate-600 animate-spin" />
                <span className="text-sm text-slate-700">Performance wird im Hintergrund berechnet…</span>
              </div>
          )}

          {caseDurationWorkerStatus === 'error' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">Fehler bei der Berechnung</p>
                    {caseDurationWorkerError && <p className="mt-1 text-xs">{caseDurationWorkerError}</p>}
                  </div>
                </div>
              </div>
          )}

          {caseDurationStats && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 mb-4">
                <h4 className="text-base font-semibold text-slate-900">Durchlaufzeiten (Cases)</h4>
                <HelpPopover helpKey="mining.performance.caseDurations" />
              </div>

              <div className="space-y-5">
                  {caseDurationStats.warnings.length > 0 && (
                    <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <div className="space-y-0.5">{caseDurationStats.warnings.map((w, i) => <div key={i}>{w}</div>)}</div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <div className="text-xs text-slate-500 mb-1">Cases analysiert</div>
                      <div className="text-lg font-semibold text-slate-900">{caseDurationStats.analyzedCases.toLocaleString('de-DE')}</div>
                      <div className="text-xs text-slate-400">von {caseDurationStats.totalCases.toLocaleString('de-DE')}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <div className="text-xs text-slate-500 mb-1">Median (P50)</div>
                      <div className="text-lg font-semibold text-slate-900">{caseDurationStats.medianMs !== null ? formatDurationShort(caseDurationStats.medianMs) : '–'}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <div className="text-xs text-slate-500 mb-1">P90</div>
                      <div className="text-lg font-semibold text-slate-900">{caseDurationStats.p90Ms !== null ? formatDurationShort(caseDurationStats.p90Ms) : '–'}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <div className="text-xs text-slate-500 mb-1">P95</div>
                      <div className="text-lg font-semibold text-slate-900">{caseDurationStats.p95Ms !== null ? formatDurationShort(caseDurationStats.p95Ms) : '–'}</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 mb-2">Verteilung</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-slate-700">Bereich</th>
                            <th className="text-right py-2 px-3 font-medium text-slate-700 w-24">Anzahl</th>
                            <th className="text-right py-2 px-3 font-medium text-slate-700 w-24">Anteil</th>
                          </tr>
                        </thead>
                        <tbody>
                          {caseDurationStats.buckets.map((b) => (
                            <tr key={b.label} className="border-b border-slate-100">
                              <td className="py-2 px-3 text-slate-700">{b.label}</td>
                              <td className="py-2 px-3 text-right text-slate-900 font-medium">{b.count.toLocaleString('de-DE')}</td>
                              <td className="py-2 px-3 text-right text-slate-600">{(b.pct * 100).toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {caseDurationStats.durationsMs.length > 0 && (() => {
                    const hist = buildHistogramBins(caseDurationStats.durationsMs, 10);
                    const maxCount = Math.max(...hist.map(b => b.count), 1);
                    return (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-sm font-semibold text-slate-800">Histogramm</h4>
                          <HelpPopover helpKey="mining.performance.histogram" ariaLabel="Hilfe: Histogramm" />
                        </div>
                        <div className="space-y-2">
                          {hist.map((bin, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                              <div className="text-xs text-slate-700 w-48 flex-shrink-0">
                                {formatDurationShort(bin.fromMs)} – {formatDurationShort(bin.toMs)}
                              </div>
                              <div className="flex-1 flex items-center gap-2">
                                <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden">
                                  <div
                                    className="h-6 bg-slate-900 rounded"
                                    style={{ width: `${Math.round((bin.count / maxCount) * 100)}%` }}
                                  />
                                </div>
                                <div className="text-xs text-slate-700 w-20 text-right">
                                  {bin.count.toLocaleString('de-DE')} ({(bin.pct * 100).toFixed(1)}%)
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {caseDurationStats.worstCases.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800 mb-2">Top Ausreißer (längste Cases)</h4>
                      {typeof caseDurationStats.outlierUpperFenceMs === 'number' && Number.isFinite(caseDurationStats.outlierUpperFenceMs) && (
                        <div className="text-xs text-slate-600 mb-3 bg-slate-50 border border-slate-200 rounded p-2">
                          IQR-Ausreißer: {caseDurationStats.outlierCount} ({(caseDurationStats.outlierPct * 100).toFixed(1)}%) · Schwelle &gt; {formatDurationShort(caseDurationStats.outlierUpperFenceMs)}
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="text-left py-2 px-3 font-medium text-slate-700">Case ID</th>
                              <th className="text-right py-2 px-3 font-medium text-slate-700 w-28">Dauer</th>
                              <th className="text-left py-2 px-3 font-medium text-slate-700 w-36">Start</th>
                              <th className="text-left py-2 px-3 font-medium text-slate-700 w-36">Ende</th>
                              <th className="text-center py-2 px-3 font-medium text-slate-700 w-20"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {caseDurationStats.worstCases.map((row) => (
                              <tr key={row.caseId} className="border-b border-slate-100">
                                <td className="py-2 px-3 text-slate-900 font-mono text-xs max-w-[180px] truncate" title={row.caseId}>{row.caseId}</td>
                                <td className="py-2 px-3 text-right text-slate-900 font-medium">{formatDurationShort(row.durationMs)}</td>
                                <td className="py-2 px-3 text-slate-500 text-xs">{row.startTs.slice(0, 16).replace('T', ' ')}</td>
                                <td className="py-2 px-3 text-slate-500 text-xs">{row.endTs.slice(0, 16).replace('T', ' ')}</td>
                                <td className="py-2 px-3 text-center">
                                  <button
                                    onClick={() => focusCase(row.caseId)}
                                    className="text-xs text-slate-600 hover:text-slate-900 underline underline-offset-2"
                                  >
                                    Öffnen
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
            </div>
          )}
              </div>
              )}

              {performanceTab === 'sla' && (
              <div className="space-y-6">

          {processMining && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 mb-4">
                <h4 className="text-base font-semibold text-slate-900">SLA &amp; Breaches</h4>
                <HelpPopover helpKey="mining.sla" />
              </div>

              {/* Regel anlegen */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-5">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Neue Regel</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={slaName}
                      onChange={(e) => setSlaName(e.target.value)}
                      placeholder="z.B. Gesamtlaufzeit &lt; 5 Tage"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex-1 min-w-[160px]">
                      <div className="flex items-center gap-1 mb-1">
                        <label className="text-xs font-medium text-slate-700">Typ</label>
                        <HelpPopover helpKey="mining.sla.kind" />
                      </div>
                      <select
                        value={slaKind}
                        onChange={(e) => setSlaKind(e.target.value as typeof slaKind)}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white"
                      >
                        <option value="case_duration">Case Duration</option>
                        <option value="time_to_step">Time-to-Step</option>
                        <option value="wait_between_steps">Wait-between-Steps</option>
                      </select>
                    </div>

                    <div className="flex-1 min-w-[160px]">
                      <div className="flex items-center gap-1 mb-1">
                        <label className="text-xs font-medium text-slate-700">Schwellwert</label>
                        <HelpPopover helpKey="mining.sla.threshold" />
                      </div>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={slaThresholdValue}
                          onChange={(e) => setSlaThresholdValue(Number(e.target.value))}
                          className="w-20 px-2 py-1.5 border border-slate-300 rounded-md text-sm"
                        />
                        <select
                          value={slaThresholdUnit}
                          onChange={(e) => setSlaThresholdUnit(e.target.value as typeof slaThresholdUnit)}
                          className="flex-1 px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white"
                        >
                          <option value="minutes">Minuten</option>
                          <option value="hours">Stunden</option>
                          <option value="days">Tage</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {slaKind === 'time_to_step' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Ziel-Schritt</label>
                      <select
                        value={slaTargetStepId}
                        onChange={(e) => setSlaTargetStepId(e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white"
                      >
                        <option value="">– Schritt wählen –</option>
                        {(version.sidecar.captureDraft?.happyPath ?? []).map((s) => (
                          <option key={s.stepId} value={s.stepId}>{s.order}. {s.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {slaKind === 'wait_between_steps' && (
                    <div className="flex gap-2 flex-wrap">
                      <div className="flex-1 min-w-[140px]">
                        <label className="block text-xs font-medium text-slate-700 mb-1">Von Schritt</label>
                        <select
                          value={slaFromStepId}
                          onChange={(e) => setSlaFromStepId(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white"
                        >
                          <option value="">– Schritt wählen –</option>
                          {(version.sidecar.captureDraft?.happyPath ?? []).map((s) => (
                            <option key={s.stepId} value={s.stepId}>{s.order}. {s.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1 min-w-[140px]">
                        <label className="block text-xs font-medium text-slate-700 mb-1">Bis Schritt</label>
                        <select
                          value={slaToStepId}
                          onChange={(e) => setSlaToStepId(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white"
                        >
                          <option value="">– Schritt wählen –</option>
                          {(version.sidecar.captureDraft?.happyPath ?? []).map((s) => (
                            <option key={s.stepId} value={s.stepId}>{s.order}. {s.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        id="sla-missing-breach"
                        checked={slaMissingAsBreach}
                        onChange={(e) => setSlaMissingAsBreach(e.target.checked)}
                        className="rounded"
                      />
                      <label htmlFor="sla-missing-breach" className="text-xs text-slate-700 cursor-pointer">Missing als Breach zählen</label>
                    </div>
                    <HelpPopover helpKey="mining.sla.missing" />
                  </div>

                  <button
                    onClick={handleAddSlaRule}
                    disabled={!slaCanAddRule}
                    className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:bg-slate-400 text-sm transition-colors"
                  >
                    Regel hinzufügen
                  </button>
                </div>
              </div>

              {/* Bestehende Regeln */}
              {(processMining.slaRules ?? []).length > 0 && (
                <div className="mb-5">
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">Regeln</h4>
                  <div className="space-y-2">
                    {(processMining.slaRules ?? []).map((rule) => {
                      const thresholdLabel = (() => {
                        const ms = rule.thresholdMs;
                        if (ms >= 86400000 && ms % 86400000 === 0) return `${ms / 86400000}d`;
                        if (ms >= 3600000 && ms % 3600000 === 0) return `${ms / 3600000}h`;
                        if (ms >= 60000 && ms % 60000 === 0) return `${ms / 60000}min`;
                        return `${ms}ms`;
                      })();
                      const kindLabel =
                        rule.kind === 'case_duration' ? 'Case Duration' :
                        rule.kind === 'time_to_step' ? 'Time-to-Step' : 'Wait-between-Steps';
                      return (
                        <div key={rule.id} className="flex items-center gap-3 px-3 py-2 bg-white border border-slate-200 rounded-lg">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={() => handleToggleSlaRule(rule.id)}
                            className="rounded flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-slate-900 truncate block">{rule.name}</span>
                            <span className="text-xs text-slate-500">{kindLabel} · &le; {thresholdLabel}</span>
                          </div>
                          <button
                            onClick={() => handleDeleteSlaRule(rule.id)}
                            className="flex-shrink-0 p-1 text-slate-400 hover:text-red-600 transition-colors rounded"
                            title="Löschen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Auswertung */}
              {slaEval && slaEval.results.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">
                    Auswertung
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {slaEval.analyzedCases.toLocaleString('de-DE')} von {slaEval.totalCases.toLocaleString('de-DE')} Cases
                    </span>
                  </h4>

                  {slaEval.warnings.length > 0 && (
                    <div className="mb-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <div className="space-y-0.5">{slaEval.warnings.map((w, i) => <div key={i}>{w}</div>)}</div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {slaEval.results.map((res) => {
                      const rule = (processMining.slaRules ?? []).find(r => r.id === res.ruleId);
                      const missingCountsAsBreach = rule
                        ? (rule.kind === 'wait_between_steps' ? rule.countMissingAsBreachForWait === true : rule.countMissingAsBreach === true)
                        : false;
                      const conformCount = missingCountsAsBreach
                        ? Math.max(0, res.analyzedCases - res.breach.count)
                        : Math.max(0, res.analyzedCases - res.breach.count - res.missing.count);
                      return (
                      <div key={res.ruleId} className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="bg-slate-50 px-3 py-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-800">{res.name}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${res.breach.pct > 0.2 ? 'bg-red-100 text-red-800' : res.breach.pct > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                            {(res.breach.pct * 100).toFixed(1)}% Breach
                          </span>
                        </div>
                        <div className="px-3 py-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div>
                            <div className="text-slate-500 mb-0.5">Breach</div>
                            <div className="font-semibold text-slate-900">{res.breach.count.toLocaleString('de-DE')} <span className="font-normal text-slate-500">({(res.breach.pct * 100).toFixed(1)}%)</span></div>
                          </div>
                          <div>
                            <div className="text-slate-500 mb-0.5">Missing</div>
                            <div className="font-semibold text-slate-900">{res.missing.count.toLocaleString('de-DE')} <span className="font-normal text-slate-500">({(res.missing.pct * 100).toFixed(1)}%)</span></div>
                          </div>
                          <div>
                            <div className="text-slate-500 mb-0.5">Analysiert</div>
                            <div className="font-semibold text-slate-900">{res.analyzedCases.toLocaleString('de-DE')}</div>
                          </div>
                          <div>
                            <div className="text-slate-500 mb-0.5">Konform</div>
                            <div className="font-semibold text-emerald-700">{conformCount.toLocaleString('de-DE')}</div>
                          </div>
                        </div>
                        {res.worstCases.length > 0 && (
                          <div className="border-t border-slate-100 px-3 py-2">
                            <div className="text-xs text-slate-500 mb-1.5">Top Cases (Worst)</div>
                            <div className="flex flex-wrap gap-1.5">
                              {res.worstCases.slice(0, 3).map((wc) => {
                                const ms = wc.valueMs;
                                const label = ms >= 86400000 ? `${(ms / 86400000).toFixed(1)}d` : ms >= 3600000 ? `${(ms / 3600000).toFixed(1)}h` : `${(ms / 60000).toFixed(0)}min`;
                                return (
                                  <button
                                    key={wc.caseId}
                                    onClick={() => focusCase(wc.caseId)}
                                    className="text-xs px-2 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-slate-700 transition-colors"
                                    title={wc.caseId}
                                  >
                                    {wc.caseId.length > 12 ? wc.caseId.slice(0, 12) + '…' : wc.caseId} ({label})
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {res.warnings.length > 0 && (
                          <div className="border-t border-slate-100 px-3 py-1.5">
                            {res.warnings.map((w, i) => (
                              <div key={i} className="text-xs text-amber-700">{w}</div>
                            ))}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(processMining.slaRules ?? []).length === 0 && (
                <p className="text-sm text-slate-400 mt-1">Noch keine Regeln definiert.</p>
              )}
            </div>
          )}
              </div>
              )}

              {performanceTab === 'bottlenecks' && (
              <div className="space-y-6">

          {transitionPerf && 'error' in transitionPerf && (
            <div className="mb-4 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <pre className="whitespace-pre-wrap break-words">{transitionPerf.error}</pre>
            </div>
          )}

          {transitionPerf && !('error' in transitionPerf) && (
            <div className="space-y-5">
              <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-semibold text-slate-900">Top Transitions (Wartezeit zwischen Events)</h4>
                  <HelpPopover helpKey="mining.performance.transitions" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    Modus
                    <HelpPopover helpKey="mining.performance.mode" />
                  </span>
                  <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs">
                    <button
                      onClick={() => setTransitionPerfMode('step')}
                      disabled={!version.sidecar.captureDraft || mappingsForAnalysis.length === 0}
                      className={`px-3 py-1.5 font-medium transition-colors ${transitionPerfMode === 'step' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'} disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      Schritt
                    </button>
                    <button
                      onClick={() => setTransitionPerfMode('activity')}
                      className={`px-3 py-1.5 font-medium transition-colors border-l border-slate-200 ${transitionPerfMode === 'activity' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                    >
                      Aktivität
                    </button>
                  </div>
                </div>
              </div>

              {transitionPerf.warnings.length > 0 && (
                <div className="mb-4 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <div className="space-y-0.5">{transitionPerf.warnings.map((w, i) => <div key={i}>{w}</div>)}</div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium text-slate-700">Von</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-700">Nach</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-700 w-16">Count</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-700 w-24">P50</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-700 w-24">P90</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-700 w-24">P95</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-700 w-24">Max</th>
                      <th className="text-center py-2 px-3 font-medium text-slate-700 w-20">Beispiel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transitionPerf.rows.slice(0, 30).map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="py-2 px-3 text-slate-700 text-xs max-w-[150px] truncate" title={row.fromLabel}>{row.fromLabel}</td>
                        <td className="py-2 px-3 text-slate-700 text-xs max-w-[150px] truncate" title={row.toLabel}>{row.toLabel}</td>
                        <td className="py-2 px-3 text-right text-slate-900">{row.count.toLocaleString('de-DE')}</td>
                        <td className="py-2 px-3 text-right text-slate-600">{row.medianMs !== null ? formatDurationShort(row.medianMs) : '–'}</td>
                        <td className="py-2 px-3 text-right font-medium text-slate-900">{row.p90Ms !== null ? formatDurationShort(row.p90Ms) : '–'}</td>
                        <td className="py-2 px-3 text-right text-slate-600">{row.p95Ms !== null ? formatDurationShort(row.p95Ms) : '–'}</td>
                        <td className="py-2 px-3 text-right text-slate-500">{row.maxMs !== null ? formatDurationShort(row.maxMs) : '–'}</td>
                        <td className="py-2 px-3 text-center">
                          {row.exampleCaseId ? (
                            <button
                              onClick={() => focusCase(row.exampleCaseId!)}
                              className="text-xs text-slate-600 hover:text-slate-900 underline underline-offset-2"
                            >
                              Öffnen
                            </button>
                          ) : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {transitionPerf.rows.length === 0 && (
                <p className="text-sm text-slate-500 mt-3">Keine Transitions berechnet.</p>
              )}
            </div>
          )}

          {(miningView === 'performance') && stepMetrics.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Enhancement: Schritt-Metriken</h3>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium text-slate-700 w-16">#</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-700">Schritt</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-700 w-24">Coverage</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-700 w-32">Median Span</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-700 w-32">
                        Median Wartezeit
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stepMetrics.map((metric) => (
                      <tr key={metric.stepId} className="border-b border-slate-100">
                        <td className="py-2 px-3 text-slate-600">{metric.order}</td>
                        <td className="py-2 px-3 text-slate-900">{metric.label}</td>
                        <td className="py-2 px-3 text-slate-900">
                          {(metric.coveragePct * 100).toFixed(1)}%
                        </td>
                        <td className="py-2 px-3 text-slate-900">
                          {formatDurationShort(metric.medianSpanMs)}
                        </td>
                        <td className="py-2 px-3 text-slate-900">
                          {formatDurationShort(metric.medianWaitToNextMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(miningView === 'performance') && stepEnhancement && stepEnhancement.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Enhancement: Performance &amp; Bottlenecks</h3>

              {miningBacklogError && (
                <div className="mb-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {miningBacklogError}
                </div>
              )}
              {miningBacklogStatus && !miningBacklogError && (
                <div className="mb-3 flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-3">
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {miningBacklogStatus}
                </div>
              )}
              {bucketError && (
                <div className="mb-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {bucketError}
                </div>
              )}
              {bucketStatus && !bucketError && (
                <div className="mb-3 flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-md p-3">
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {bucketStatus}
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">Schritt-Details (Top 30)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium text-slate-700 w-12">#</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-700">Schritt</th>
                          <th className="text-right py-2 px-3 font-medium text-slate-700 w-24">Coverage %</th>
                          <th className="text-right py-2 px-3 font-medium text-slate-700 w-20">Events</th>
                          <th className="text-right py-2 px-3 font-medium text-slate-700 w-28">Median Span</th>
                          <th className="text-right py-2 px-3 font-medium text-slate-700 w-28">Median Wait</th>
                          <th className="text-right py-2 px-3 font-medium text-slate-700 w-24">Rework %</th>
                          {version.sidecar.captureDraft && (
                            <th className="text-center py-2 px-3 font-medium text-slate-700 w-20">Aktionen</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {stepEnhancement
                          .slice()
                          .sort((a, b) => b.caseCoverage - a.caseCoverage)
                          .slice(0, 30)
                          .map((m) => (
                            <tr key={m.stepId} className="border-b border-slate-100">
                              <td className="py-2 px-3 text-slate-400 text-xs">{m.order}</td>
                              <td className="py-2 px-3 text-slate-900">{m.label}</td>
                              <td className="py-2 px-3 text-right">
                                <span className={`font-medium ${m.caseCoverage >= 0.8 ? 'text-emerald-700' : m.caseCoverage >= 0.4 ? 'text-amber-700' : 'text-slate-500'}`}>
                                  {(m.caseCoverage * 100).toFixed(1)}%
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-700 text-right">{m.eventCount}</td>
                              <td className="py-2 px-3 text-slate-700 text-right">
                                {m.medianSpanMs !== null ? formatDurationShort(m.medianSpanMs) : '–'}
                              </td>
                              <td className="py-2 px-3 text-slate-700 text-right">
                                {m.medianWaitToNextMs !== null ? formatDurationShort(m.medianWaitToNextMs) : '–'}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <span className={m.reworkPct > 0.1 ? 'text-rose-700 font-medium' : 'text-slate-700'}>
                                  {m.reworkCaseCount > 0 ? `${(m.reworkPct * 100).toFixed(1)}%` : '–'}
                                </span>
                              </td>
                              {version.sidecar.captureDraft && (
                                <td className="py-2 px-3 text-center">
                                  <button
                                    disabled={bucketBusy}
                                    onClick={() => applyBucketsFromMetric(m)}
                                    className="text-xs px-2 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-slate-700 transition-colors disabled:opacity-40"
                                  >
                                    Buckets
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {(topWaits.length > 0 || topSpans.length > 0 || topRework.length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {topWaits.length > 0 && (
                      <div className="border border-slate-200 rounded-md overflow-hidden">
                        <div className="bg-slate-800 px-3 py-2">
                          <h5 className="text-xs font-semibold text-white">Top Waits (Median)</h5>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {topWaits.map((m) => {
                            const caseId = m.exampleWaitCaseId ?? m.exampleCaseId;
                            const ctx: MiningContext = {
                              sourceLabel: processMining!.sourceLabel,
                              importedAt: processMining!.importedAt,
                              timeMode: processMining!.timeMode,
                              scopeLabel: filterA ? 'Segment A' : 'Alle',
                              segmentLabel: filterA ? `${filterA.attributeKey}=${filterA.attributeValue}` : undefined,
                            };
                            return (
                              <div key={m.stepId} className="px-3 py-2 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs text-slate-900 font-medium truncate" title={m.label}>{m.label}</p>
                                  <p className="text-xs text-amber-700 font-semibold">{formatDurationShort(m.medianWaitToNextMs)}</p>
                                </div>
                                <div className="flex-shrink-0 flex gap-1">
                                  {caseId && (
                                    <button onClick={() => focusCase(caseId)} className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-blue-800 transition-colors">
                                      Beispiel
                                    </button>
                                  )}
                                  <button
                                    disabled={miningBacklogBusy}
                                    onClick={() => createImprovementFromStepMetric({ kind: 'wait', metric: m, context: ctx, exampleCaseId: caseId })}
                                    className="text-xs px-2 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded text-emerald-800 transition-colors disabled:opacity-40"
                                  >
                                    Maßnahme
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {topSpans.length > 0 && (
                      <div className="border border-slate-200 rounded-md overflow-hidden">
                        <div className="bg-slate-800 px-3 py-2">
                          <h5 className="text-xs font-semibold text-white">Top Spans (Median)</h5>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {topSpans.map((m) => {
                            const caseId = m.exampleSpanCaseId ?? m.exampleCaseId;
                            const ctx: MiningContext = {
                              sourceLabel: processMining!.sourceLabel,
                              importedAt: processMining!.importedAt,
                              timeMode: processMining!.timeMode,
                              scopeLabel: filterA ? 'Segment A' : 'Alle',
                              segmentLabel: filterA ? `${filterA.attributeKey}=${filterA.attributeValue}` : undefined,
                            };
                            return (
                              <div key={m.stepId} className="px-3 py-2 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs text-slate-900 font-medium truncate" title={m.label}>{m.label}</p>
                                  <p className="text-xs text-slate-600 font-semibold">{formatDurationShort(m.medianSpanMs)}</p>
                                </div>
                                <div className="flex-shrink-0 flex gap-1">
                                  {caseId && (
                                    <button onClick={() => focusCase(caseId)} className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-blue-800 transition-colors">
                                      Beispiel
                                    </button>
                                  )}
                                  <button
                                    disabled={miningBacklogBusy}
                                    onClick={() => createImprovementFromStepMetric({ kind: 'span', metric: m, context: ctx, exampleCaseId: caseId })}
                                    className="text-xs px-2 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded text-emerald-800 transition-colors disabled:opacity-40"
                                  >
                                    Maßnahme
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {topRework.length > 0 && (
                      <div className="border border-slate-200 rounded-md overflow-hidden">
                        <div className="bg-slate-800 px-3 py-2">
                          <h5 className="text-xs font-semibold text-white">Top Rework</h5>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {topRework.map((m) => {
                            const caseId = m.exampleReworkCaseId ?? m.exampleCaseId;
                            const ctx: MiningContext = {
                              sourceLabel: processMining!.sourceLabel,
                              importedAt: processMining!.importedAt,
                              timeMode: processMining!.timeMode,
                              scopeLabel: filterA ? 'Segment A' : 'Alle',
                              segmentLabel: filterA ? `${filterA.attributeKey}=${filterA.attributeValue}` : undefined,
                            };
                            return (
                              <div key={m.stepId} className="px-3 py-2 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs text-slate-900 font-medium truncate" title={m.label}>{m.label}</p>
                                  <p className="text-xs text-rose-700 font-semibold">{(m.reworkPct * 100).toFixed(1)}% ({m.reworkCaseCount} Cases)</p>
                                </div>
                                <div className="flex-shrink-0 flex gap-1">
                                  {caseId && (
                                    <button onClick={() => focusCase(caseId)} className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-blue-800 transition-colors">
                                      Beispiel
                                    </button>
                                  )}
                                  <button
                                    disabled={miningBacklogBusy}
                                    onClick={() => createImprovementFromStepMetric({ kind: 'rework', metric: m, context: ctx, exampleCaseId: caseId })}
                                    className="text-xs px-2 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded text-emerald-800 transition-colors disabled:opacity-40"
                                  >
                                    Maßnahme
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
              </div>
              )}

            </div>
            </>
          )}

          {(miningView === 'cases') && caseIndex && (
            <div id="case-explorer" className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Case Explorer</h3>

              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={caseSearch}
                  onChange={(e) => {
                    setCaseSearch(e.target.value);
                    setSelectedCaseId(null);
                  }}
                  placeholder="Case ID suchen..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md text-sm"
                />
              </div>

              <div className="mb-4">
                <select
                  value={selectedCaseId ?? ''}
                  onChange={(e) => setSelectedCaseId(e.target.value || null)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  size={Math.min(6, filteredCaseIds.length + 1)}
                >
                  <option value="">(Case wählen – {filteredCaseIds.length} Treffer)</option>
                  {filteredCaseIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCaseEvents && (
                <div>
                  <div className="flex items-center gap-6 mb-3 text-sm">
                    <span className="text-slate-600">
                      Events:{' '}
                      <span className="font-semibold text-slate-900">
                        {selectedCaseEvents.length}
                      </span>
                    </span>
                    <span className="text-slate-600">
                      Durchlaufzeit:{' '}
                      <span className="font-semibold text-slate-900">
                        {formatDurationShort(selectedCaseDurationMs)}
                      </span>
                    </span>
                  </div>

                  <div className="overflow-x-auto" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium text-slate-700 w-10">#</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-700 w-44">Timestamp</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-700">Activity</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-700 w-48">Mapping</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCaseEvents.map((ev, idx) => {
                          const key = normalizeActivityKey(ev.activity);
                          const stepLabel = activityKeyToStepLabel.get(key);
                          const isUnmapped = !stepLabel;
                          return (
                            <tr key={idx} className="border-b border-slate-100">
                              <td className="py-1.5 px-3 text-slate-400 text-xs">{idx + 1}</td>
                              <td className="py-1.5 px-3 text-slate-600 text-xs whitespace-nowrap">
                                {new Date(ev.timestamp).toLocaleString('de-DE')}
                              </td>
                              <td className="py-1.5 px-3 text-slate-900">{ev.activity}</td>
                              <td className={`py-1.5 px-3 text-xs ${isUnmapped ? 'text-slate-400' : 'text-slate-700'}`}>
                                {stepLabel ?? 'unmapped'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
          {(miningView === 'organisation') && orgAnalytics && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Organisation</h3>
                <HelpPopover helpKey="mining.org" />
              </div>

              {orgAnalytics.warnings.length > 0 && (
                <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 space-y-0.5">
                  {orgAnalytics.warnings.map((w, i) => <div key={i}>{w}</div>)}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500 mb-1">Events gesamt</div>
                  <div className="text-lg font-semibold text-slate-900">{orgAnalytics.totalEvents.toLocaleString('de-DE')}</div>
                </div>
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500 mb-1">Events mit Resource</div>
                  <div className="text-lg font-semibold text-slate-900">{orgAnalytics.eventsWithResource.toLocaleString('de-DE')}</div>
                  <div className="text-xs text-slate-400">{Math.round(orgAnalytics.pctEventsWithResource * 100)} %</div>
                </div>
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500 mb-1">Cases gesamt</div>
                  <div className="text-lg font-semibold text-slate-900">{orgAnalytics.totalCases.toLocaleString('de-DE')}</div>
                </div>
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500 mb-1">Analysiert</div>
                  <div className="text-lg font-semibold text-slate-900">{orgAnalytics.analyzedCases.toLocaleString('de-DE')}</div>
                  {orgAnalytics.totalCases !== orgAnalytics.analyzedCases && (
                    <div className="text-xs text-amber-600">Stichprobe</div>
                  )}
                </div>
              </div>

              {orgAnalytics.resources.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-sm font-semibold text-slate-800">Ressourcen</h4>
                    <HelpPopover helpKey="mining.org.resources" />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left py-2 px-3 font-medium text-slate-700">Resource</th>
                          <th className="text-right py-2 px-3 font-medium text-slate-700">Cases</th>
                          <th className="text-right py-2 px-3 font-medium text-slate-700">Anteil</th>
                          <th className="text-right py-2 px-3 font-medium text-slate-700">Events</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orgAnalytics.resources.slice(0, 30).map((row) => (
                          <tr key={row.resource} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-1.5 px-3 text-slate-900">{row.resource}</td>
                            <td className="py-1.5 px-3 text-right text-slate-700">{row.caseCount.toLocaleString('de-DE')}</td>
                            <td className="py-1.5 px-3 text-right text-slate-500">{Math.round(row.pctCases * 100)} %</td>
                            <td className="py-1.5 px-3 text-right text-slate-500">{row.eventCount.toLocaleString('de-DE')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {orgAnalytics.handovers.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-sm font-semibold text-slate-800">Top Handovers</h4>
                    <HelpPopover helpKey="mining.org.handovers" />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left py-2 px-3 font-medium text-slate-700">Von</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-700">Nach</th>
                          <th className="text-right py-2 px-3 font-medium text-slate-700">Cases</th>
                          <th className="text-right py-2 px-3 font-medium text-slate-700">Anteil</th>
                          <th className="text-right py-2 px-3 font-medium text-slate-700">Occurrences</th>
                          <th className="py-2 px-3 font-medium text-slate-700">Beispiel</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orgAnalytics.handovers.slice(0, 30).map((row, idx) => (
                          <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-1.5 px-3 text-slate-900">{row.fromResource}</td>
                            <td className="py-1.5 px-3 text-slate-900">{row.toResource}</td>
                            <td className="py-1.5 px-3 text-right text-slate-700">{row.cases.toLocaleString('de-DE')}</td>
                            <td className="py-1.5 px-3 text-right text-slate-500">{Math.round(row.pctCases * 100)} %</td>
                            <td className="py-1.5 px-3 text-right text-slate-500">{row.occurrences.toLocaleString('de-DE')}</td>
                            <td className="py-1.5 px-3">
                              {row.exampleCaseId && (
                                <button
                                  className="text-xs text-blue-600 hover:underline"
                                  onClick={() => focusCase(row.exampleCaseId!)}
                                >
                                  {row.exampleCaseId}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {workload && (
                <div className="mt-8">
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-sm font-semibold text-slate-800">Workload</h4>
                    <HelpPopover helpKey="mining.org.workload" />
                  </div>

                  {workload.warnings.length > 0 && (
                    <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 space-y-0.5">
                      {workload.warnings.map((w, i) => <div key={i}>{w}</div>)}
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <div className="text-xs text-slate-500 mb-3">Top Ressourcen (Events)</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-white border-b border-slate-200">
                            <tr>
                              <th className="text-left py-2 px-3 font-medium text-slate-700">Ressource</th>
                              <th className="text-right py-2 px-3 font-medium text-slate-700 w-28">Events</th>
                              <th className="text-right py-2 px-3 font-medium text-slate-700 w-24">Anteil</th>
                            </tr>
                          </thead>
                          <tbody>
                            {workload.resources.map(r => (
                              <tr key={r.resource} className="border-b border-slate-100">
                                <td className="py-1.5 px-3 text-slate-900">{r.resource}</td>
                                <td className="py-1.5 px-3 text-right text-slate-700">{r.count.toLocaleString('de-DE')}</td>
                                <td className="py-1.5 px-3 text-right text-slate-500">{(r.pct * 100).toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="text-xs text-slate-500">Peak-Zeiten</div>
                        <HelpPopover helpKey="mining.org.workload.peaks" />
                        <div className="ml-auto text-xs text-slate-400">
                          Zeitstempel ok: {workload.timedEvents.toLocaleString('de-DE')} · ungültig: {workload.invalidTimestampEvents.toLocaleString('de-DE')}
                        </div>
                      </div>

                      {workload.timedEvents === 0 ? (
                        <div className="text-sm text-slate-500">
                          Keine Peak-Auswertung möglich (keine verwertbaren Zeitstempel).
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <div className="text-xs text-slate-600 mb-2">Wochentage</div>
                              {(() => {
                                const max = Math.max(...workload.byWeekday.map(w => w.count), 1);
                                return (
                                  <div className="space-y-1">
                                    {workload.byWeekday.map(w => (
                                      <div key={w.weekday} className="flex items-center gap-2">
                                        <div className="w-8 text-xs text-slate-700">{w.label}</div>
                                        <div className="flex-1 h-2 bg-white rounded overflow-hidden border border-slate-200">
                                          <div
                                            className="h-2 bg-slate-900"
                                            style={{ width: `${Math.round((w.count / max) * 100)}%` }}
                                          />
                                        </div>
                                        <div className="w-16 text-right text-xs text-slate-600">
                                          {(w.pct * 100).toFixed(1)}%
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>

                            <div>
                              <div className="text-xs text-slate-600 mb-2">Top Stunden</div>
                              {(() => {
                                const topHours = workload.byHour.slice().sort((a,b)=>b.count-a.count).slice(0, 8);
                                const max = Math.max(...topHours.map(h => h.count), 1);
                                return (
                                  <div className="space-y-1">
                                    {topHours.map(h => (
                                      <div key={h.hour} className="flex items-center gap-2">
                                        <div className="w-8 text-xs text-slate-700">{String(h.hour).padStart(2,'0')}</div>
                                        <div className="flex-1 h-2 bg-white rounded overflow-hidden border border-slate-200">
                                          <div
                                            className="h-2 bg-slate-900"
                                            style={{ width: `${Math.round((h.count / max) * 100)}%` }}
                                          />
                                        </div>
                                        <div className="w-16 text-right text-xs text-slate-600">
                                          {(h.pct * 100).toFixed(1)}%
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="text-xs text-slate-600">Heatmap (Wochentag × Stunde)</div>
                              <HelpPopover helpKey="mining.org.workload.heatmap" />
                            </div>

                            {(() => {
                              let maxHeat = 0;
                              for (const row of workload.heatmap) for (const c of row) if (c > maxHeat) maxHeat = c;

                              const hourMarks = new Set([0, 4, 8, 12, 16, 20, 23]);

                              return (
                                <div className="overflow-x-auto">
                                  <div className="inline-block">
                                    <div className="flex items-center gap-1 mb-1">
                                      <div className="w-10" />
                                      {Array.from({ length: 24 }, (_, h) => (
                                        <div key={h} className="w-3 text-[10px] text-slate-400 text-center">
                                          {hourMarks.has(h) ? String(h) : ''}
                                        </div>
                                      ))}
                                    </div>

                                    {workload.byWeekday.map(wd => (
                                      <div key={wd.weekday} className="flex items-center gap-1 mb-1">
                                        <div className="w-10 text-xs text-slate-600">{wd.label}</div>
                                        {Array.from({ length: 24 }, (_, h) => {
                                          const c = workload.heatmap[wd.weekday]?.[h] ?? 0;
                                          const op = maxHeat > 0 ? Math.min(1, c / maxHeat) : 0;
                                          return (
                                            <div
                                              key={h}
                                              className="w-3 h-3 bg-slate-900 rounded-sm"
                                              style={{ opacity: op }}
                                              title={`${wd.label} ${String(h).padStart(2,'0')}:00 · ${c} Events`}
                                            />
                                          );
                                        })}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {orgAnalytics.resources.length === 0 && (
                <div className="text-sm text-slate-500 text-center py-6">
                  Keine Resource-Daten vorhanden. Bitte Resource-Spalte beim Import zuordnen.
                </div>
              )}
            </div>
          )}

          {(miningView === 'rootcause') && rootCause && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Ursachenanalyse</h3>
                <HelpPopover helpKey="mining.rootcause" />
              </div>

              {rootCause.warnings.length > 0 && (
                <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 space-y-0.5">
                  {rootCause.warnings.map((w, i) => <div key={i}>{w}</div>)}
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-700">Schwelle</label>
                    <HelpPopover helpKey="mining.rootcause.threshold" />
                    <select
                      className="text-sm border border-slate-200 rounded px-2 py-1 bg-white"
                      value={rcThresholdMode}
                      onChange={(e) => setRcThresholdMode(e.target.value as RootCauseThresholdMode)}
                    >
                      <option value="p90">Langsam ab P90</option>
                      <option value="p95">Langsam ab P95</option>
                      <option value="custom">Feste Schwelle</option>
                    </select>
                  </div>

                  {rcThresholdMode === 'custom' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        className="text-sm border border-slate-200 rounded px-2 py-1 w-20 bg-white"
                        value={rcCustomValue}
                        onChange={(e) => setRcCustomValue(Math.max(1, Number(e.target.value)))}
                      />
                      <select
                        className="text-sm border border-slate-200 rounded px-2 py-1 bg-white"
                        value={rcCustomUnit}
                        onChange={(e) => setRcCustomUnit(e.target.value as 'hours' | 'days')}
                      >
                        <option value="hours">Stunden</option>
                        <option value="days">Tage</option>
                      </select>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-700">Min. Support</label>
                    <HelpPopover helpKey="mining.rootcause.support" />
                    <input
                      type="number"
                      min={1}
                      className="text-sm border border-slate-200 rounded px-2 py-1 w-20 bg-white"
                      value={rcMinSupport}
                      onChange={(e) => setRcMinSupport(Math.max(1, Number(e.target.value)))}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500 mb-1">Cases analysiert</div>
                  <div className="text-lg font-semibold text-slate-900">{rootCause.analyzedCases.toLocaleString('de-DE')}</div>
                </div>
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500 mb-1">Langsame Cases</div>
                  <div className="text-lg font-semibold text-slate-900">{rootCause.slowCases.toLocaleString('de-DE')}</div>
                </div>
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500 mb-1">Schwelle</div>
                  <div className="text-lg font-semibold text-slate-900">{formatDurationShort(rootCause.thresholdMs)}</div>
                </div>
              </div>

              {rootCause.signals.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left py-2 px-3 font-medium text-slate-700">Attribut</th>
                        <th className="text-left py-2 px-3 font-medium text-slate-700">Wert</th>
                        <th className="text-right py-2 px-3 font-medium text-slate-700">Lift</th>
                        <th className="text-right py-2 px-3 font-medium text-slate-700">Slow %</th>
                        <th className="text-right py-2 px-3 font-medium text-slate-700">All %</th>
                        <th className="text-right py-2 px-3 font-medium text-slate-700">Slow</th>
                        <th className="text-right py-2 px-3 font-medium text-slate-700">Gesamt</th>
                        <th className="py-2 px-3 font-medium text-slate-700">Beispiel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rootCause.signals.map((sig, idx) => (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-1.5 px-3 text-slate-700 font-medium">{sig.attributeKey}</td>
                          <td className="py-1.5 px-3 text-slate-900 max-w-[180px] truncate" title={sig.attributeValue}>{sig.attributeValue}</td>
                          <td className="py-1.5 px-3 text-right font-semibold text-slate-900">{sig.lift.toFixed(2)}</td>
                          <td className="py-1.5 px-3 text-right text-rose-700 font-medium">{(sig.pctSlow * 100).toFixed(1)} %</td>
                          <td className="py-1.5 px-3 text-right text-slate-500">{(sig.pctAll * 100).toFixed(1)} %</td>
                          <td className="py-1.5 px-3 text-right text-slate-700">{sig.countSlow.toLocaleString('de-DE')}</td>
                          <td className="py-1.5 px-3 text-right text-slate-500">{sig.countAll.toLocaleString('de-DE')}</td>
                          <td className="py-1.5 px-3">
                            {sig.exampleCaseId && (
                              <button
                                className="text-xs text-blue-600 hover:underline"
                                onClick={() => focusCase(sig.exampleCaseId!)}
                              >
                                {sig.exampleCaseId}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-slate-500 text-center py-6">
                  Keine belastbaren Signale (Support zu niedrig oder keine Attribute vorhanden).
                </div>
              )}
            </div>
          )}

          {(miningView === 'drift') && (
            <>
            <GuideCallout
              title="Ziel: Zwei Datasets oder Zeiträume vergleichen"
              steps={[
                'Zwei Datasets auswählen (z.B. Q1 vs. Q2, Standort A vs. B).',
                'Vergleichsmodus wählen (Activities, Steps, Transitions).',
                'Drift-Metriken prüfen (neue/weggefallene Elemente, Häufigkeitsänderungen).'
              ]}
              tip="Time Slicing erlaubt Monats- oder Quartals-Vergleiche über die Zeit hinweg."
            />
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-6">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-900">Vergleich (Drift)</h3>
                <HelpPopover helpKey="mining.drift" />
              </div>

              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setDriftTab('compare')}
                  className={driftTab === 'compare' ? 'pm-tab pm-tab-active' : 'pm-tab pm-tab-inactive'}
                >
                  Vergleich
                </button>
                <button
                  onClick={() => setDriftTab('slice')}
                  className={driftTab === 'slice' ? 'pm-tab pm-tab-active' : 'pm-tab pm-tab-inactive'}
                >
                  Time Slicing
                </button>
                <button
                  onClick={() => setDriftTab('monitor')}
                  className={driftTab === 'monitor' ? 'pm-tab pm-tab-active' : 'pm-tab pm-tab-inactive'}
                >
                  Monitoring
                </button>
              </div>

              {driftTab === 'compare' && (
              <div className="space-y-6">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-slate-700">Datasets auswählen</span>
                  <HelpPopover helpKey="mining.drift.select" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Baseline (A)</label>
                    <select
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={driftAId}
                      onChange={e => setDriftAId(e.target.value)}
                    >
                      {datasetsSorted.map(d => (
                        <option key={d.id} value={d.id}>{d.sourceLabel || d.id}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Vergleich (B)</label>
                    <select
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={driftBId}
                      onChange={e => setDriftBId(e.target.value)}
                    >
                      {datasetsSorted.map(d => (
                        <option key={d.id} value={d.id}>{d.sourceLabel || d.id}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition-colors"
                    onClick={() => { const tmp = driftAId; setDriftAId(driftBId); setDriftBId(tmp); }}
                  >
                    <ArrowDownUp className="w-4 h-4" />
                    Tauschen
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">Ebene:</span>
                    <HelpPopover helpKey="mining.drift.mode" />
                    <button
                      className={`text-sm px-3 py-1.5 rounded border transition-colors ${driftMode === 'activity' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
                      onClick={() => setDriftMode('activity')}
                    >
                      Aktivität
                    </button>
                    <button
                      className={`text-sm px-3 py-1.5 rounded border transition-colors ${driftMode === 'step' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'} disabled:opacity-40 disabled:cursor-not-allowed`}
                      onClick={() => setDriftMode('step')}
                      disabled={!version.sidecar.captureDraft?.happyPath?.length}
                      title={!version.sidecar.captureDraft?.happyPath?.length ? 'Kein Capture Draft verfügbar' : ''}
                    >
                      Schritt
                    </button>
                  </div>
                </div>
              </div>

              {driftDatasetsLoadError && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 mb-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{driftDatasetsLoadError}</span>
                </div>
              )}
              {(!profileA || !profileB) ? (
                <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  {(dsA?.eventsRef && !eventsRuntimeCacheRef.current.has(dsA.id)) || (dsB?.eventsRef && !eventsRuntimeCacheRef.current.has(dsB.id))
                    ? 'Events werden aus IndexedDB geladen – Vergleich steht gleich zur Verfügung.'
                    : 'Mindestens zwei Datasets nötig. Bitte Baseline und Vergleichs-Dataset auswählen.'}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                      <span className="font-semibold text-slate-800 text-sm">KPIs</span>
                      <HelpPopover helpKey="mining.drift.kpis" />
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {(() => {
                          const formatSignedDurationDelta = (ms: number) => {
                            const sign = ms < 0 ? '−' : '+';
                            return `${sign}${formatDurationShort(Math.abs(ms))}`;
                          };

                          type CountKPI = {
                            type: 'count';
                            label: string;
                            a: number;
                            b: number;
                            fmt: (v: number) => string;
                          };

                          type DurationKPI = {
                            type: 'duration';
                            label: string;
                            aVal: number | null;
                            bVal: number | null;
                          };

                          type KPI = CountKPI | DurationKPI;

                          const kpis: KPI[] = [
                            { type: 'count', label: 'Cases', a: profileA.analyzedCases, b: profileB.analyzedCases, fmt: (v: number) => v.toLocaleString('de-DE') },
                            { type: 'count', label: 'Events', a: profileA.analyzedEvents, b: profileB.analyzedEvents, fmt: (v: number) => v.toLocaleString('de-DE') },
                            { type: 'count', label: 'Varianten', a: profileA.variantsTotal, b: profileB.variantsTotal, fmt: (v: number) => v.toLocaleString('de-DE') },
                            { type: 'count', label: 'Unique Keys', a: profileA.uniqueKeys, b: profileB.uniqueKeys, fmt: (v: number) => v.toLocaleString('de-DE') },
                          ];

                          if (profileA.durationMedianMs !== null || profileB.durationMedianMs !== null) {
                            kpis.push({
                              type: 'duration',
                              label: 'Median Dauer',
                              aVal: profileA.durationMedianMs,
                              bVal: profileB.durationMedianMs,
                            });
                          }

                          if (profileA.durationP90Ms !== null || profileB.durationP90Ms !== null) {
                            kpis.push({
                              type: 'duration',
                              label: 'P90 Dauer',
                              aVal: profileA.durationP90Ms,
                              bVal: profileB.durationP90Ms,
                            });
                          }

                          if (profileA.durationP95Ms !== null || profileB.durationP95Ms !== null) {
                            kpis.push({
                              type: 'duration',
                              label: 'P95 Dauer',
                              aVal: profileA.durationP95Ms,
                              bVal: profileB.durationP95Ms,
                            });
                          }

                          return kpis.map((kpi) => {
                            if (kpi.type === 'count') {
                              const delta = kpi.b - kpi.a;
                              const pct = kpi.a > 0 ? (delta / kpi.a) * 100 : null;
                              return (
                                <div key={kpi.label} className="bg-white border border-slate-200 rounded-lg p-3">
                                  <div className="text-xs text-slate-500 mb-1">{kpi.label}</div>
                                  <div className="text-sm font-semibold text-slate-800">A: {kpi.fmt(kpi.a)}</div>
                                  <div className="text-sm text-slate-600">B: {kpi.fmt(kpi.b)}</div>
                                  <div className={`text-xs mt-1 font-medium ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                    {delta >= 0 ? '+' : ''}{kpi.fmt(delta)}
                                    {pct !== null && ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`}
                                  </div>
                                </div>
                              );
                            } else {
                              const aDisplay = kpi.aVal !== null ? formatDurationShort(kpi.aVal) : '–';
                              const bDisplay = kpi.bVal !== null ? formatDurationShort(kpi.bVal) : '–';

                              let deltaDisplay = '–';
                              let pctDisplay: string | null = null;
                              let deltaColor = 'text-slate-400';

                              if (kpi.aVal !== null && kpi.bVal !== null) {
                                const delta = kpi.bVal - kpi.aVal;
                                deltaDisplay = formatSignedDurationDelta(delta);
                                deltaColor = delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-slate-400';

                                if (kpi.aVal > 0) {
                                  const pct = (delta / kpi.aVal) * 100;
                                  pctDisplay = ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`;
                                }
                              }

                              return (
                                <div key={kpi.label} className="bg-white border border-slate-200 rounded-lg p-3">
                                  <div className="text-xs text-slate-500 mb-1">{kpi.label}</div>
                                  <div className="text-sm font-semibold text-slate-800">A: {aDisplay}</div>
                                  <div className="text-sm text-slate-600">B: {bDisplay}</div>
                                  <div className={`text-xs mt-1 font-medium ${deltaColor}`}>
                                    {deltaDisplay}
                                    {pctDisplay}
                                  </div>
                                </div>
                              );
                            }
                          });
                        })()}
                      </div>
                      {(profileA.warnings.length > 0 || profileB.warnings.length > 0) && (
                        <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 space-y-0.5">
                          {[...new Set([...profileA.warnings, ...profileB.warnings])].map((w, i) => (
                            <div key={i}>{w}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {driftResults && (
                    <>
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                          <span className="font-semibold text-slate-800 text-sm">Varianten-Drift</span>
                          <HelpPopover helpKey="mining.drift.variants" />
                        </div>
                        <div className="p-4">
                          <div className="flex items-center gap-6 mb-4 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500">Overlap</span>
                              <span className="text-sm font-semibold text-slate-800">{(driftResults.dist.overlap * 100).toFixed(1)}%</span>
                              <div className="w-24 h-2 rounded-full bg-slate-200 overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${driftResults.dist.overlap * 100}%` }} />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500">JSD</span>
                              <span className={`text-sm font-semibold ${driftResults.dist.jsd < 0.1 ? 'text-emerald-600' : driftResults.dist.jsd < 0.3 ? 'text-amber-600' : 'text-red-600'}`}>
                                {driftResults.dist.jsd.toFixed(3)}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500">
                              A: {profileA.variantsTotal} Varianten · B: {profileB.variantsTotal} Varianten
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-slate-200">
                                  <th className="text-left py-2 pr-3 font-medium text-slate-600 w-full">Variante</th>
                                  <th className="text-right py-2 px-2 font-medium text-slate-600 whitespace-nowrap">Share A</th>
                                  <th className="text-right py-2 px-2 font-medium text-slate-600 whitespace-nowrap">Share B</th>
                                  <th className="text-right py-2 px-2 font-medium text-slate-600 whitespace-nowrap">Delta</th>
                                  <th className="text-right py-2 px-2 font-medium text-slate-600 whitespace-nowrap">Cnt A</th>
                                  <th className="text-right py-2 pl-2 font-medium text-slate-600 whitespace-nowrap">Cnt B</th>
                                </tr>
                              </thead>
                              <tbody>
                                {driftResults.variantDeltas.slice(0, 20).map((row, i) => (
                                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="py-1.5 pr-3 text-slate-700 max-w-xs">
                                      <span className="block truncate" title={row.key}>{row.key || '(leer)'}</span>
                                    </td>
                                    <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums">{(row.shareA * 100).toFixed(1)}%</td>
                                    <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums">{(row.shareB * 100).toFixed(1)}%</td>
                                    <td className={`py-1.5 px-2 text-right font-medium tabular-nums ${row.delta > 0.005 ? 'text-emerald-600' : row.delta < -0.005 ? 'text-red-500' : 'text-slate-400'}`}>
                                      {row.delta >= 0 ? '+' : ''}{(row.delta * 100).toFixed(1)}%
                                    </td>
                                    <td className="py-1.5 px-2 text-right text-slate-500 tabular-nums">{row.countA}</td>
                                    <td className="py-1.5 pl-2 text-right text-slate-500 tabular-nums">{row.countB}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>

                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                          <span className="font-semibold text-slate-800 text-sm">Aktivitäten / Schritte</span>
                          <HelpPopover helpKey="mining.drift.activities" />
                        </div>
                        <div className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">
                                Neu in B ({driftResults.newKeys.length})
                              </div>
                              {driftResults.newKeys.length === 0 ? (
                                <p className="text-xs text-slate-400">Keine neuen</p>
                              ) : (
                                <ul className="space-y-1">
                                  {driftResults.newKeys.slice(0, 10).map((r, i) => (
                                    <li key={i} className="flex items-center gap-2 text-xs">
                                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px] flex-shrink-0">+</span>
                                      <span className="text-slate-700 truncate" title={r.label}>{r.label}</span>
                                      <span className="text-slate-400 ml-auto whitespace-nowrap">{(r.pctCases * 100).toFixed(0)}%</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
                                Entfallen in B ({driftResults.removedKeys.length})
                              </div>
                              {driftResults.removedKeys.length === 0 ? (
                                <p className="text-xs text-slate-400">Keine entfallen</p>
                              ) : (
                                <ul className="space-y-1">
                                  {driftResults.removedKeys.slice(0, 10).map((r, i) => (
                                    <li key={i} className="flex items-center gap-2 text-xs">
                                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-600 font-bold text-[10px] flex-shrink-0">−</span>
                                      <span className="text-slate-700 truncate" title={r.label}>{r.label}</span>
                                      <span className="text-slate-400 ml-auto whitespace-nowrap">{(r.pctCases * 100).toFixed(0)}%</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                                Stärkste Verschiebungen ({driftResults.changedKeys.length})
                              </div>
                              {driftResults.changedKeys.length === 0 ? (
                                <p className="text-xs text-slate-400">Keine ≥10 PP Änderung</p>
                              ) : (
                                <ul className="space-y-1">
                                  {driftResults.changedKeys.slice(0, 10).map((r, i) => (
                                    <li key={i} className="flex items-center gap-2 text-xs">
                                      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full font-bold text-[10px] flex-shrink-0 ${r.delta > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                                        {r.delta > 0 ? '↑' : '↓'}
                                      </span>
                                      <span className="text-slate-700 truncate" title={r.label}>{r.label}</span>
                                      <span className={`ml-auto whitespace-nowrap font-medium ${r.delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {r.delta >= 0 ? '+' : ''}{(r.delta * 100).toFixed(0)}PP
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              </div>
              )}

              {driftTab === 'slice' && (
              <div className="space-y-6">
              {processMining && activeDataset && processMining.timeMode === 'real' ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <span className="font-semibold text-slate-800 text-sm">Zeitschnitte als Datasets</span>
                    <HelpPopover helpKey="mining.drift.timeslicing" />
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="flex rounded-md border border-slate-300 overflow-hidden">
                        <button
                          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                            driftSliceGranularity === 'month' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                          onClick={() => _setDriftSliceGranularity('month')}
                        >
                          Monat
                        </button>
                        <button
                          className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-slate-300 ${
                            driftSliceGranularity === 'quarter' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                          onClick={() => _setDriftSliceGranularity('quarter')}
                        >
                          Quartal
                        </button>
                      </div>
                      <HelpPopover helpKey="mining.drift.timeslicing.granularity" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-slate-600 whitespace-nowrap">Von</label>
                        <input
                          type="month"
                          className="border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={driftSliceStartMonth}
                          onChange={e => setDriftSliceStartMonth(e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-slate-600 whitespace-nowrap">Bis</label>
                        <input
                          type="month"
                          className="border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={driftSliceEndMonth}
                          onChange={e => setDriftSliceEndMonth(e.target.value)}
                        />
                      </div>
                      <HelpPopover helpKey="mining.drift.timeslicing.range" />
                    </div>
                    <p className="text-xs text-slate-500">Case-Start-basiert. Cases können über {driftSliceGranularity === 'quarter' ? 'Quartals' : 'Monats'}grenzen laufen.</p>

                    {slicePreview && (
                      <div className="bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm space-y-1">
                        <div className="flex items-center gap-4 flex-wrap">
                          <span className="text-slate-700"><span className="font-medium">{slicePreview.slices.length}</span> {driftSliceGranularity === 'quarter' ? 'Quartals' : 'Monats'}-Zeitschnitte</span>
                          <span className="text-slate-700"><span className="font-medium">{slicePreview.slices.reduce((s, sl) => s + sl.caseCount, 0)}</span> Cases gesamt</span>
                        </div>
                        {slicePreview.warnings.length > 0 && (
                          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1 space-y-0.5">
                            {slicePreview.warnings.map((w, i) => <div key={i}>{w}</div>)}
                          </div>
                        )}
                        {slicePreview.slices.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {slicePreview.slices.map(sl => (
                              <span key={sl.key} className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-600">
                                {sl.key}
                                <span className="text-slate-400">{sl.caseCount}c</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded font-medium transition-colors"
                      disabled={!slicePreview || slicePreview.slices.length === 0}
                      onClick={async () => {
                        if (!processMining || !activeDataset || !slicePreview) return;
                        const nowIso = new Date().toISOString();
                        let next = processMining;
                        for (const slice of slicePreview.slices) {
                          const mappings = buildActivityStats(slice.events, version.sidecar.captureDraft?.happyPath ?? []);
                          const dsId = crypto.randomUUID();
                          let sliceDataset: ProcessMiningDataset = {
                            id: dsId,
                            sourceLabel: `${activeDataset.sourceLabel} · ${slice.key}`,
                            importedAt: nowIso,
                            events: slice.events,
                            activityMappings: mappings,
                            timeMode: processMining.timeMode,
                            provenance: {
                              kind: 'transform',
                              method: 'timeslice',
                              createdAt: nowIso,
                              createdFromDatasetId: activeDataset.id,
                              createdFromLabel: activeDataset.sourceLabel,
                              window: { startIso: slice.startIso, endIso: slice.endIso, basis: 'case_start', grain: driftSliceGranularity },
                            },
                            settings: activeDataset?.settings
                              ? { ...activeDataset.settings, workspaceView: 'drift' }
                              : getDefaultDatasetSettingsFromLocalStorage(),
                          };
                          sliceDataset = await prepareDatasetWithExternalization(sliceDataset);
                          next = addMiningDataset(next, sliceDataset, false);
                        }
                        await onSave({ sidecar: { ...version.sidecar, processMining: next } });
                        setDriftSliceStatus(`${slicePreview.slices.length} ${driftSliceGranularity === 'quarter' ? 'Quartals' : 'Monats'}-Datasets erzeugt.`);
                        setTimeout(() => setDriftSliceStatus(''), 4000);
                      }}
                    >
                      {driftSliceGranularity === 'quarter' ? 'Quartals' : 'Monats'}-Datasets erzeugen
                    </button>
                    {driftSliceStatus && (
                      <div className="flex items-center gap-2 text-sm text-emerald-700">
                        <Check className="w-4 h-4" />
                        {driftSliceStatus}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
                  <p className="text-sm text-slate-700">
                    Time Slicing ist nur im Modus "Realzeit" verfügbar. Bitte aktivieren Sie den Realzeit-Modus unter "Data".
                  </p>
                </div>
              )}
              </div>
              )}

              {driftTab === 'monitor' && (
              <div className="space-y-6">
              {timesliceTrendLoadError && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{timesliceTrendLoadError}</span>
                </div>
              )}
              {timesliceTrend && timesliceTrend.rows.length >= 2 ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <span className="font-semibold text-slate-800 text-sm">Zeitverlauf (Monitoring)</span>
                    <HelpPopover helpKey="mining.drift.trend" />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Zeitraum</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-600">Cases</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-600">Median</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-600">P90</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-600">Varianten</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-600">Unique Keys</th>
                          <th className="px-3 py-2 text-center font-medium text-slate-600">Drift vs Vormonat</th>
                          <th className="px-3 py-2 text-center font-medium text-slate-600">Aktionen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timesliceTrend.rows.map((row) => {
                          const isActive = activeDataset?.id === row.datasetId;
                          const formatDuration = (ms: number | null) => {
                            if (ms === null) return '–';
                            const s = Math.round(ms / 1000);
                            if (s < 60) return `${s}s`;
                            const m = Math.floor(s / 60);
                            const sr = s % 60;
                            if (m < 60) return `${m}m ${sr}s`;
                            const h = Math.floor(m / 60);
                            const mr = m % 60;
                            return `${h}h ${mr}m`;
                          };

                          return (
                            <tr key={row.datasetId} className={`border-b border-slate-100 ${isActive ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                              <td className="px-3 py-2 font-medium text-slate-800">{row.label}</td>
                              <td className="px-3 py-2 text-right text-slate-700">{row.analyzedCases.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right text-slate-700">{formatDuration(row.medianMs)}</td>
                              <td className="px-3 py-2 text-right text-slate-700">{formatDuration(row.p90Ms)}</td>
                              <td className="px-3 py-2 text-right text-slate-700">{row.variantsTotal.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right text-slate-700">{row.uniqueKeys.toLocaleString()}</td>
                              <td className="px-3 py-2 text-center">
                                {row.overlapPrev !== null && row.jsdPrev !== null ? (
                                  <div className="text-xs space-y-0.5">
                                    <div className="text-slate-700">
                                      Overlap: <span className="font-medium">{(row.overlapPrev * 100).toFixed(1)}%</span>
                                    </div>
                                    <div className="text-slate-600">
                                      JSD: <span className="font-medium">{row.jsdPrev.toFixed(3)}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">–</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5 justify-center">
                                  <div className="flex items-center gap-1">
                                    <button
                                      className="px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 transition-colors"
                                      onClick={() => {
                                        setDriftAId(row.compareBaselineId);
                                        setDriftBId(row.datasetId);
                                      }}
                                    >
                                      Vergleichen
                                    </button>
                                    <HelpPopover helpKey="mining.drift.trend.compare" />
                                  </div>
                                  {!isActive && (
                                    <div className="flex items-center gap-1">
                                      <button
                                        className="px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 transition-colors"
                                        onClick={() => handleSwitchDataset(row.datasetId)}
                                      >
                                        Aktivieren
                                      </button>
                                      <HelpPopover helpKey="mining.drift.trend.activate" />
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
                  <p className="text-sm text-slate-700">
                    Monitoring-Daten sind verfügbar, sobald Sie mit Time Slicing mehrere Zeitschnitte erstellt haben.
                  </p>
                </div>
              )}
              </div>
              )}
            </div>
            </>
          )}
        </>
      )}

      {miningView === 'guided' && (
        <div className="pm-card pm-card-pad">
          <div className="flex items-center gap-3 mb-3">
            <Sparkles className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">Geführte Analyse</h2>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            Im <strong>Assisted Mode</strong> steht dir der neue geführte Analyseprozess direkt im Tab
            <strong> Process Mining</strong> zur Verfügung. Dort kannst du Prozessfälle beschreiben,
            Dokumente hochladen und in fünf Schritten eine vollständige Analyse durchführen.
          </p>
          <p className="text-xs text-slate-400">
            Tipp: Wechsle oben rechts in den Assisted Mode, um den geführten Einstieg zu nutzen.
            Der Expertenmodus bleibt davon unberührt.
          </p>
        </div>
      )}
        </div>
      </div>

      {discoveryBpmnModalOpen && discoveryBpmnXml && (
        <BpmnViewerModal
          title="Discovery BPMN (Vorschau)"
          bpmnXml={discoveryBpmnXml}
          onClose={() => setDiscoveryBpmnModalOpen(false)}
        />
      )}
    </div>
  );
}

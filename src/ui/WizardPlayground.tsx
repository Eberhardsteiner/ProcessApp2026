import { useState, useEffect, useCallback, useRef } from 'react';
import type { Project, Process, ProcessVersion, ProcessCategory, ProcessManagementLevel, ProcessHierarchyLevel, ImprovementBacklogItem, MiningWorkspaceView, EvidenceSource } from '../domain/process';
import { createProject, listProjects } from '../storage/repositories/projectsRepo';
import { createProcess, getProcess, updateProcess, listProcesses } from '../storage/repositories/processesRepo';
import { createVersion, listVersions, getVersion, getLatestVersion, updateVersion, cloneVersion } from '../storage/repositories/versionsRepo';
import { exportProcessBundle, parseProcessBundle, importProcessBundleToProject } from '../storage/processBundle';
import type { ProcessBundleV1 } from '../storage/processBundle';
import { exportProjectBundle, parseProjectBundle, importProjectBundleAsNewProject } from '../storage/projectBundle';
import type { ProjectBundleV1 } from '../storage/projectBundle';
import {
  applyAnswers,
  getPhaseAnswerStatus,
  CAPTURE_PHASES_ALL,
  CAPTURE_PHASES_SKELETON,
  getCurrentPhaseForPhases,
  getNextQuestionsForPhase,
} from '../capture/wizardEngine';
import type { WizardAnswer } from '../capture/wizardTypes';
import { QuestionRenderer } from './QuestionRenderer';
import { HappyPathStepBuilder } from './HappyPathStepBuilder';
import { StepEnrichmentFlow } from './StepEnrichmentFlow';
import { buildBpmnXmlFromDraft } from '../bpmn/exportBpmn';
import { getQuestionsByPhase } from '../capture/wizardSpec';
import type { CaptureDraftStep, WorkType, StepLeadTimeBucket, StepLevelBucket, CaptureElementStatus, CapturePhase } from '../domain/capture';
import { assessProcess } from '../assessment/processAssessment';
import { DraftDecisionsEditor } from './DraftDecisionsEditor';
import { DraftExceptionsEditor } from './DraftExceptionsEditor';
import { HappyPathCsvImport } from './HappyPathCsvImport';
import { CatalogCsvImport } from './CatalogCsvImport';
import { CatalogMergeTool } from './CatalogMergeTool';
import { buildClaudeExtractionPrompt } from '../ai/claudePrompt';
import { importAiCaptureToNewVersion } from '../ai/aiImport';
import { buildSeedFromVersion } from '../ai/assistedCaptureSeed';
import { AssistedSeedCapturePanel } from './assisted/AssistedSeedCapturePanel';
import { runAiProxyRequest } from '../ai/aiApiClient';
import { ProcessReport } from './ProcessReport';
import { ImprovementBacklogEditor } from './ImprovementBacklogEditor';
import { AssistedOptimizationCoach } from './AssistedOptimizationCoach';
import { AssistedOptimizationAiMeasures } from './AssistedOptimizationAiMeasures';
import { VersionChangesView } from './VersionChangesView';
import { WorkshopModeView } from './WorkshopModeView';
import { ProcessMiningLitePanel } from './ProcessMiningLitePanel';
import { AssistedProcessMiningPanel } from './assistedMining/AssistedProcessMiningPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PROCESS_TEMPLATES, getProcessTemplate } from '../templates/processTemplates';
import { buildAndDownloadProcessExportZip } from '../export/exportPackageZip';
import { useAppSettings } from '../settings/useAppSettings';
import { SpeechAndTranslationSettingsCard } from './SpeechAndTranslationSettingsCard';
import { AiApiSettingsCard } from './AiApiSettingsCard';
import { isWebSpeechSupported } from '../speech/transcriptionProviders';
import { startWebSpeechTranscription, type WebSpeechSession } from '../speech/webSpeechTranscription';
import { readFileTextRobust } from '../utils/readFileTextRobust';
import { extractTextFromDocx } from '../import/extractTextFromDocx';
import { extractTextFromPdf } from '../import/extractTextFromPdf';
import { extractTextFromHtml } from '../import/extractTextFromHtml';
import { htmlZipBundleToText } from '../import/htmlZipBundleImport';
import { SemanticQuestionsAiPanel } from './SemanticQuestionsAiPanel';
import { EvidenceCoveragePanel } from './EvidenceCoveragePanel';
import { findEvidenceContexts } from './evidence/findEvidenceInSource';
import { jiraCsvToText } from '../import/jiraCsvImport';
import { serviceNowCsvToText } from '../import/serviceNowCsvImport';
import { jiraHtmlToText } from '../import/jiraHtmlImport';
import { serviceNowHtmlToText } from '../import/serviceNowHtmlImport';
import { detectCsvMode, detectZipLooksLikeHtmlBundle, detectHtmlMode } from '../import/importModeDetection';
import type { DetectedImportHint } from '../import/importModeDetection';
import { SemanticQuestionsChecklistEditor } from './SemanticQuestionsChecklistEditor';
import { OpenIssuesDashboard } from './OpenIssuesDashboard';
import { GlobalSearchModal } from './GlobalSearchModal';
import { cloneMiningSidecarEventBlobs } from '../storage/eventBlobLifecycle';
import { BpmnViewerModal } from './BpmnViewerModal';
import { Mic, Square, Settings2, Upload, FileText, X, Search, Copy, Send, ExternalLink, CheckCircle2, Eye, File as FileEdit, AlertTriangle, Sparkles, TrendingUp, RefreshCw, ArrowDownUp, Check, Info, Download, Users, Target, MoreVertical } from 'lucide-react';
import { ModeToggle } from './components/ModeToggle';
import { InfoPopover } from './components/InfoPopover';
import { FieldLabel } from './components/FieldLabel';
import { Stepper } from './components/Stepper';
import { resetAllAppData, APP_RESET_SCOPE_NOTE } from '../persistence/resetAllAppData';

type TabId = 'setup' | 'wizard' | 'draft' | 'review' | 'issues' | 'improvements' | 'report' | 'ai' | 'mining' | 'changes' | 'workshop' | 'settings' | 'transfer';
type AssistedStepId = 'context' | 'setup' | 'describe' | 'prompt' | 'analyze' | 'optimize';

interface TabConfig {
  id: TabId;
  label: string;
  group: 'core' | 'tools';
}

const TAB_CONFIG: TabConfig[] = [
  { id: 'setup', label: 'Arbeitsbereich', group: 'core' },
  { id: 'wizard', label: 'Wizard', group: 'core' },
  { id: 'draft', label: 'Entwurf', group: 'core' },
  { id: 'review', label: 'Review', group: 'core' },
  { id: 'issues', label: 'Open Issues', group: 'core' },
  { id: 'improvements', label: 'Maßnahmen', group: 'core' },
  { id: 'report', label: 'Report', group: 'core' },
  { id: 'settings', label: 'Setup', group: 'tools' },
  { id: 'transfer', label: 'Import/Export', group: 'tools' },
  { id: 'ai', label: 'KI-Assistent', group: 'tools' },
  { id: 'mining', label: 'Process Mining', group: 'tools' },
  { id: 'changes', label: 'Änderungen', group: 'tools' },
  { id: 'workshop', label: 'Workshop', group: 'tools' },
];

interface WizardPlaygroundProps {
  initialProcessId?: string;
}

const ASSISTED_STEPS = [
  { id: 'context', label: 'Kontext', description: 'Projekt & Prozess' },
  { id: 'setup', label: 'Setup', description: 'KI, Sprache' },
  { id: 'describe', label: 'Beschreiben', description: 'Was wird gemacht?' },
  { id: 'prompt', label: 'Erfassen & KI ergänzen', description: 'Vorerfassen, Prompt, Übernahme' },
  { id: 'analyze', label: 'Analysieren', description: 'Process Mining' },
  { id: 'optimize', label: 'Optimieren', description: 'Verbesserungen' },
];

type ContextSubTab = 'select' | 'meta';

export function WizardPlayground({ initialProcessId }: WizardPlaygroundProps = {}) {
  const [activeTab, setActiveTab] = useState<TabId>('setup');
  const [assistedStep, setAssistedStep] = useState<AssistedStepId>('context');
  const [preparingContext, setPreparingContext] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');

  const [contextSubTab, setContextSubTab] = useState<ContextSubTab>(() => {
    const raw = localStorage.getItem('assisted.context.subtab');
    return raw === 'meta' ? 'meta' : 'select';
  });

  const [metaSaving, setMetaSaving] = useState(false);
  const [metaProcessTitle, setMetaProcessTitle] = useState('');
  const [metaProcessDescription, setMetaProcessDescription] = useState('');
  const [metaEditorsCsv, setMetaEditorsCsv] = useState('');
  const [metaTagsCsv, setMetaTagsCsv] = useState('');
  const [metaRaciR, setMetaRaciR] = useState('');
  const [metaRaciA, setMetaRaciA] = useState('');
  const [metaRaciC, setMetaRaciC] = useState('');
  const [metaRaciI, setMetaRaciI] = useState('');
  const [metaVersionLabel, setMetaVersionLabel] = useState('');
  const [metaVersionStatus, setMetaVersionStatus] = useState<'draft' | 'in_review' | 'published'>('draft');
  const [metaApprovedBy, setMetaApprovedBy] = useState('');
  const [metaApprovalNotes, setMetaApprovalNotes] = useState('');

  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);

  const [processTitle, setProcessTitle] = useState('');
  const [processCategory, setProcessCategory] = useState<ProcessCategory>('kern');
  const [processManagementLevel, setProcessManagementLevel] = useState<ProcessManagementLevel>('fachlich');
  const [processHierarchyLevel, setProcessHierarchyLevel] = useState<ProcessHierarchyLevel>('hauptprozess');
  const [processId, setProcessId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>('');
  const [versionTemplateId, setVersionTemplateId] = useState<string>('');

  const [process, setProcess] = useState<Process | null>(null);
  const [version, setVersion] = useState<ProcessVersion | null>(null);
  const [versions, setVersions] = useState<ProcessVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [bpmnWarnings, setBpmnWarnings] = useState<string[]>([]);
  const [generatingBpmn, setGeneratingBpmn] = useState(false);

  const [stepEdits, setStepEdits] = useState<Record<string, Partial<CaptureDraftStep>>>({});
  const [savingStepDetails, setSavingStepDetails] = useState(false);
  const [quickActionRole, setQuickActionRole] = useState<string>('');
  const [quickActionSystem, setQuickActionSystem] = useState<string>('');

  const [wizardFocus, setWizardFocus] = useState<'skeleton' | 'detail'>('skeleton');
  const [enrichmentOpen, setEnrichmentOpen] = useState(false);

  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [evidenceModalTitle, setEvidenceModalTitle] = useState<string>('');
  const [evidenceModalText, setEvidenceModalText] = useState<string>('');
  const [evidenceModalRefId, setEvidenceModalRefId] = useState<string>('');

  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  const [bpmnPreviewOpen, setBpmnPreviewOpen] = useState(false);

  const [miningMappingSearchPreset, setMiningMappingSearchPreset] = useState<string>('');

  const [miningWorkspaceView, setMiningWorkspaceView] = useState<MiningWorkspaceView>(() => {
    const raw = localStorage.getItem('pm.workspace.view');
    const allowed: MiningWorkspaceView[] = ['data','preprocessing','mapping','discovery','conformance','performance','cases','export','organisation','rootcause','drift','guided'];
    return (allowed.includes(raw as MiningWorkspaceView) ? (raw as MiningWorkspaceView) : 'data');
  });

  const [aiRawText, setAiRawText] = useState<string>('');
  const [aiTranslatedText, setAiTranslatedText] = useState<string>('');
  const [aiGeneratedPrompt, setAiGeneratedPrompt] = useState<string>('');
  const [aiResponseJson, setAiResponseJson] = useState<string>('');
  const [aiImportWarnings, setAiImportWarnings] = useState<string[]>([]);
  const [aiImporting, setAiImporting] = useState(false);
  const [aiImportSuccess, setAiImportSuccess] = useState(false);
  const [aiCaptureMode, setAiCaptureMode] = useState<'artifact' | 'case' | 'cases'>('artifact');
  const [aiEvidenceSourceLabel, setAiEvidenceSourceLabel] = useState<string>('');
  const [aiDictationActive, setAiDictationActive] = useState(false);
  const [aiDictationInterim, setAiDictationInterim] = useState('');
  const [aiDictationError, setAiDictationError] = useState('');
  const aiDictationSessionRef = useRef<WebSpeechSession | null>(null);
  const aiDictationRunRef = useRef(0);

  const [aiFilePending, setAiFilePending] = useState<{ name: string; text: string; warnings?: string[] } | null>(null);
  const [aiFileError, setAiFileError] = useState<string>('');
  const aiFileInputRef = useRef<HTMLInputElement | null>(null);
  const [aiCsvImportMode, setAiCsvImportMode] = useState<'raw' | 'jira' | 'servicenow'>('raw');
  const [aiHtmlImportMode, setAiHtmlImportMode] = useState<'raw' | 'jira' | 'servicenow'>('raw');
  const [aiImportHint, setAiImportHint] = useState<DetectedImportHint | null>(null);
  const [aiZipImportMode, setAiZipImportMode] = useState<'auto' | 'htmlzip'>('auto');

  const [aiApiConsent, setAiApiConsent] = useState(false);
  const [aiApiRunning, setAiApiRunning] = useState(false);
  const [aiApiError, setAiApiError] = useState<string>('');
  const [aiApiLastRequestPreview, setAiApiLastRequestPreview] = useState<string>('');

  const [wizardDictationActive, setWizardDictationActive] = useState(false);
  const [wizardDictationQuestionId, setWizardDictationQuestionId] = useState<string | null>(null);
  const [wizardDictationInterim, setWizardDictationInterim] = useState('');
  const [wizardDictationError, setWizardDictationError] = useState('');
  const wizardDictationSessionRef = useRef<WebSpeechSession | null>(null);
  const wizardDictationRunRef = useRef(0);

  const wizardPhaseAnchorRef = useRef<HTMLDivElement | null>(null);
  const [wizardActivePhase, setWizardActivePhase] = useState<CapturePhase | null>(null);

  const [bundleFileName, setBundleFileName] = useState<string>('');
  const [bundlePreview, setBundlePreview] = useState<ProcessBundleV1 | null>(null);
  const [bundleParseError, setBundleParseError] = useState<string>('');
  const [bundleImportWarnings, setBundleImportWarnings] = useState<string[]>([]);
  const [bundleImporting, setBundleImporting] = useState(false);

  const [projectBundleFileName, setProjectBundleFileName] = useState<string>('');
  const [projectBundlePreview, setProjectBundlePreview] = useState<ProjectBundleV1 | null>(null);
  const [projectBundleParseError, setProjectBundleParseError] = useState<string>('');
  const [projectBundleWarnings, setProjectBundleWarnings] = useState<string[]>([]);
  const [projectBundleImporting, setProjectBundleImporting] = useState(false);

  const [exportPackageWarnings, setExportPackageWarnings] = useState<string[]>([]);
  const [exportingPackage, setExportingPackage] = useState(false);

  const { settings, setSettings } = useAppSettings();

  const [projectProcesses, setProjectProcesses] = useState<Process[]>([]);
  const [loadingProjectProcesses, setLoadingProjectProcesses] = useState(false);

  const CASE_FIRST_TEMPLATE_DE = `Letzter konkreter Fall (bitte anonymisiert):

1) Kontext (Kunde/Produkt/Kanal):
- ...

2) Auslöser (was hat den Fall gestartet?):
- ...

3) Ablauf (chronologisch, so wie es wirklich passiert ist):
- Schritt 1: ...
- Schritt 2: ...
- ...

4) Ergebnis (was war am Ende beim Kunden/Stakeholder anders?):
- ...

5) Sonderfälle / Rückfragen / Nacharbeiten (falls vorhanden):
- ...

6) Beteiligte Rollen/Personen:
- ...

7) Systeme/Tools:
- ...

8) Daten/Dokumente (Input/Output):
- ...

9) Zeitgefühl (ungefähr): wo lag Wartezeit, wo Aufwand?
- ...`;

  const buildCaseBlockTemplate = (n: number): string => {
    return `FALL ${n} (bitte anonymisiert)

1) Kontext (Kunde/Produkt/Kanal):
- ...

2) Auslöser (was hat den Fall gestartet?):
- ...

3) Ablauf (chronologisch, so wie es wirklich passiert ist):
- Schritt 1: ...
- Schritt 2: ...
- ...

4) Ergebnis (was war am Ende beim Kunden/Stakeholder anders?):
- ...

5) Sonderfälle / Rückfragen / Nacharbeiten (falls vorhanden):
- ...

6) Beteiligte Rollen/Personen:
- ...

7) Systeme/Tools:
- ...

8) Daten/Dokumente (Input/Output):
- ...

9) Zeitgefühl (ungefähr): wo lag Wartezeit, wo Aufwand?
- ...`;
  };

  type CaseBlock = { header: string; body: string };

  const parseCaseBlocks = (raw: string): CaseBlock[] => {
    const normalized = raw.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    // Split an Separator-Linien "---"
    const parts = normalized
      .split(/^\s*---\s*$/m)
      .map((p) => p.trim())
      .filter(Boolean);

    return parts.map((part, idx) => {
      const lines = part.split('\n');
      const first = (lines[0] ?? '').trim();

      // Body: alles nach der ersten Zeile, aber die erste Leerzeile direkt nach Header entfernen
      let rest = lines.slice(1);
      if (rest.length > 0 && rest[0].trim() === '') rest = rest.slice(1);
      const body = rest.join('\n');

      if (/^FALL\s+\d+/i.test(first)) {
        return { header: first, body };
      }

      // Falls Header fehlt: konservativ behandeln
      return { header: `FALL ${idx + 1}`, body: part };
    });
  };

  const normalizeCaseHeader = (header: string, idx: number): string => {
    const m = header.match(/^\s*FALL\s+\d+(.*)$/i);
    const tail = m ? m[1] : '';
    // tail enthält ggf. führendes Leerzeichen, das bewusst behalten wird
    return `FALL ${idx + 1}${tail}`.trimEnd();
  };

  const buildCaseBlocksText = (blocks: CaseBlock[]): string => {
    return blocks
      .map((b, idx) => {
        const h = normalizeCaseHeader(b.header, idx);
        const body = b.body ?? '';
        const cleanedBody = body.replace(/\r\n/g, '\n');
        return cleanedBody.trim() ? `${h}\n\n${cleanedBody}` : `${h}`;
      })
      .join('\n\n---\n\n');
  };

  useEffect(() => {
    if (initialProcessId) {
      setProcessId(initialProcessId);
      setActiveTab('wizard');
    }
  }, [initialProcessId]);

  useEffect(() => {
    if (activeTab !== 'ai' && aiDictationSessionRef.current) {
      aiDictationRunRef.current += 1;
      aiDictationSessionRef.current.abort();
      aiDictationSessionRef.current = null;
      setAiDictationActive(false);
      setAiDictationInterim('');
    }
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('pm.workspace.view', miningWorkspaceView);
  }, [miningWorkspaceView]);

  useEffect(() => {
    if (activeTab !== 'wizard' && wizardDictationSessionRef.current) {
      wizardDictationRunRef.current += 1;
      wizardDictationSessionRef.current.abort();
      wizardDictationSessionRef.current = null;
      setWizardDictationActive(false);
      setWizardDictationQuestionId(null);
      setWizardDictationInterim('');
    }
  }, [activeTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setGlobalSearchOpen(true);
      }
      if (e.key === 'Escape' && globalSearchOpen) {
        setGlobalSearchOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [globalSearchOpen]);

  useEffect(() => {
    if (!pendingScrollId) return;

    let attempts = 0;
    const maxAttempts = 15;

    const tryScroll = () => {
      const el = document.getElementById(pendingScrollId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('bg-yellow-50');
        setTimeout(() => {
          el.classList.remove('bg-yellow-50');
        }, 1500);
        setPendingScrollId(null);
      } else {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(tryScroll, 80);
        } else {
          setStatusMessage('Element konnte nicht fokussiert werden (ggf. Filter aktiv oder Ansicht nicht sichtbar).');
          setPendingScrollId(null);
        }
      }
    };

    tryScroll();
  }, [pendingScrollId]);

  const refreshProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const list = await listProjects();
      list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
      setProjects(list);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const refreshProjectProcesses = useCallback(async (projId: string) => {
    setLoadingProjectProcesses(true);
    try {
      const procs = await listProcesses(projId);
      procs.sort((a, b) => a.title.localeCompare(b.title, 'de'));
      setProjectProcesses(procs);
    } finally {
      setLoadingProjectProcesses(false);
    }
  }, []);

  useEffect(() => {
    if (projectId) {
      refreshProjectProcesses(projectId);
    } else {
      setProjectProcesses([]);
    }
  }, [projectId, refreshProjectProcesses]);

  useEffect(() => {
    localStorage.setItem('assisted.context.subtab', contextSubTab);
  }, [contextSubTab]);

  useEffect(() => {
    if (process && version) {
      setContextSubTab((prev) => (prev === 'select' ? 'meta' : prev));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [process?.processId, version?.id]);

  useEffect(() => {
    if (!process) return;
    setMetaProcessTitle(process.title || '');
    setMetaProcessDescription(process.description || '');
    setMetaEditorsCsv(Array.isArray(process.editors) ? process.editors.join(', ') : '');
    setMetaTagsCsv(Array.isArray(process.tags) ? process.tags.join(', ') : '');

    setMetaRaciR(Array.isArray(process.raci?.responsible) ? process.raci!.responsible!.join(', ') : '');
    setMetaRaciA(Array.isArray(process.raci?.accountable) ? process.raci!.accountable!.join(', ') : '');
    setMetaRaciC(Array.isArray(process.raci?.consulted) ? process.raci!.consulted!.join(', ') : '');
    setMetaRaciI(Array.isArray(process.raci?.informed) ? process.raci!.informed!.join(', ') : '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [process?.processId]);

  useEffect(() => {
    if (!version) return;
    setMetaVersionLabel(version.versionLabel || '');
    setMetaVersionStatus(version.status);
    setMetaApprovedBy(version.approval?.approvedBy || '');
    setMetaApprovalNotes(version.approval?.notes || '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version?.id]);

  const refreshVersions = useCallback(async (procId: string) => {
    setLoadingVersions(true);
    try {
      const list = await listVersions(procId);
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setVersions(list);
    } finally {
      setLoadingVersions(false);
    }
  }, []);

  const loadProcessAndVersion = useCallback(async (procId: string) => {
    try {
      const proc = await getProcess(procId);
      if (!proc) {
        setStatusMessage('Prozess nicht gefunden');
        return;
      }
      setProcess(proc);
      setProjectId(proc.projectId);

      await refreshVersions(procId);

      const ver = await getLatestVersion(procId);
      if (!ver) {
        setVersion(null);
        setActiveTab('setup');
        setStatusMessage('Keine Version gefunden. Bitte im Arbeitsbereich eine Version erstellen oder in der Prozesslandkarte "Wizard starten" nutzen.');
        return;
      }
      setVersion(ver);
      setStatusMessage('Prozess und Version geladen');
    } catch (error) {
      setStatusMessage(`Fehler beim Laden: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    }
  }, [refreshVersions]);

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      setStatusMessage('Projektname fehlt');
      return;
    }
    try {
      const proj = await createProject(projectName);
      setProjectId(proj.projectId);
      await refreshProjects();
      setStatusMessage(`Projekt erstellt: ${proj.name}`);
    } catch (error) {
      setStatusMessage(`Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    }
  };

  const handleCreateProcess = async () => {
    if (!projectId) {
      setStatusMessage('Erst Projekt erstellen');
      return;
    }
    if (!processTitle.trim()) {
      setStatusMessage('Prozessname fehlt');
      return;
    }
    try {
      const proc = await createProcess(projectId, {
        title: processTitle,
        category: processCategory,
        managementLevel: processManagementLevel,
        hierarchyLevel: processHierarchyLevel,
      });
      setProcessId(proc.processId);
      setProcess(proc);
      setStatusMessage(`Prozess erstellt: ${proc.title}`);
    } catch (error) {
      setStatusMessage(`Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    }
  };

  const handleCreateProcessFromTemplate = async () => {
    if (!projectId) {
      setStatusMessage('Bitte zuerst ein Projekt auswählen.');
      return;
    }
    if (!templateId) {
      setStatusMessage('Bitte ein Template auswählen.');
      return;
    }

    const tpl = getProcessTemplate(templateId);
    if (!tpl) {
      setStatusMessage('Template nicht gefunden.');
      return;
    }

    try {
      setStatusMessage('Erstelle Prozess aus Template...');

      const proc = await createProcess(projectId, {
        title: tpl.process.title,
        category: tpl.process.category,
        managementLevel: tpl.process.managementLevel,
        hierarchyLevel: tpl.process.hierarchyLevel,
      });

      setProcess(proc);
      setProcessId(proc.processId);

      await refreshProjectProcesses(projectId);

      const ver = await createVersion(proc.processId, {
        status: 'draft',
        titleSnapshot: proc.title,
        endToEndDefinition: tpl.version.endToEndDefinition,
        sidecar: tpl.version.sidecar,
      });

      setVersion(ver);
      await refreshVersions(proc.processId);

      setStatusMessage('Prozess aus Template erstellt. Wizard gestartet.');
      setActiveTab('wizard');
    } catch (e) {
      setStatusMessage(`Template-Erstellung fehlgeschlagen: ${e instanceof Error ? e.message : 'Unbekannt'}`);
    }
  };

  const handleCreateVersionFromTemplate = async () => {
    if (!processId || !process) {
      setStatusMessage('Bitte zuerst einen Prozess auswählen oder erstellen.');
      return;
    }
    if (!versionTemplateId) {
      setStatusMessage('Bitte ein Template auswählen.');
      return;
    }

    const tpl = getProcessTemplate(versionTemplateId);
    if (!tpl) {
      setStatusMessage('Template nicht gefunden.');
      return;
    }

    try {
      setStatusMessage('Erstelle Version aus Template...');

      const ver = await createVersion(processId, {
        status: 'draft',
        titleSnapshot: process.title,
        endToEndDefinition: tpl.version.endToEndDefinition,
        sidecar: tpl.version.sidecar,
      });

      setVersion(ver);
      await refreshVersions(processId);

      setStatusMessage('Version aus Template erstellt. Wizard gestartet.');
      setActiveTab('wizard');
    } catch (e) {
      setStatusMessage(`Template-Version fehlgeschlagen: ${e instanceof Error ? e.message : 'Unbekannt'}`);
    }
  };

  const handleCreateVersion = async () => {
    if (!processId) {
      setStatusMessage('Erst Prozess erstellen');
      return;
    }
    try {
      const ver = await createVersion(processId, {
        status: 'draft',
        titleSnapshot: process?.title || 'Unbenannt',
        endToEndDefinition: {
          trigger: '',
          customer: '',
          outcome: '',
        },
      });
      setVersion(ver);
      await refreshVersions(processId);
      setStatusMessage('Version erstellt - Wizard bereit');
      setActiveTab('wizard');
    } catch (error) {
      setStatusMessage(`Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    }
  };

  const ensureContextReady = async () => {
    setPreparingContext(true);
    setStatusMessage('Bereite Arbeitsbereich vor...');

    try {
      let currentProjectId = projectId;
      let currentProcess = process;
      let currentProcessId = processId;
      let currentVersion = version;

      if (!currentProjectId) {
        const name = projectName.trim() || `Neues Projekt ${new Date().toISOString().split('T')[0]}`;
        const proj = await createProject(name);
        currentProjectId = proj.projectId;
        setProjectId(proj.projectId);
        setProjectName(name);
        await refreshProjects();
      }

      if (!currentProcess || !currentProcessId) {
        const title = processTitle.trim() || `Neuer Prozess ${new Date().toISOString().split('T')[0]}`;
        const proc = await createProcess(currentProjectId, {
          title,
          category: 'kern',
          managementLevel: 'fachlich',
          hierarchyLevel: 'hauptprozess',
        });
        currentProcess = proc;
        currentProcessId = proc.processId;
        setProcess(proc);
        setProcessId(proc.processId);
        setProcessTitle(title);
        await refreshProjectProcesses(currentProjectId);
      }

      if (!currentVersion) {
        const ver = await createVersion(currentProcessId, {
          status: 'draft',
          titleSnapshot: currentProcess.title,
          endToEndDefinition: {
            trigger: '',
            customer: '',
            outcome: '',
          },
        });
        currentVersion = ver;
        setVersion(ver);
        await refreshVersions(currentProcessId);
      }

      setStatusMessage('Arbeitsbereich bereit.');
      setAssistedStep('describe');
    } catch (error) {
      setStatusMessage(`Fehler bei der Vorbereitung: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    } finally {
      setPreparingContext(false);
    }
  };

  function parseCsvList(text: string): string[] {
    return text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function uniq(list: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of list) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  const handleSaveContextMeta = async () => {
    if (!process) {
      setStatusMessage('Bitte zuerst einen Prozess auswählen oder erstellen.');
      return;
    }

    setMetaSaving(true);
    setStatusMessage('');

    try {
      const title = metaProcessTitle.trim() || process.title;

      const editors = uniq(parseCsvList(metaEditorsCsv));
      const tags = uniq(parseCsvList(metaTagsCsv));

      const raci = {
        responsible: uniq(parseCsvList(metaRaciR)),
        accountable: uniq(parseCsvList(metaRaciA)),
        consulted: uniq(parseCsvList(metaRaciC)),
        informed: uniq(parseCsvList(metaRaciI)),
      };

      const raciHasAny =
        raci.responsible.length || raci.accountable.length || raci.consulted.length || raci.informed.length;

      const processPatch: Partial<Process> = {
        title,
        description: metaProcessDescription.trim() || undefined,
        editors: editors.length ? editors : undefined,
        tags: tags.length ? tags : undefined,
        raci: raciHasAny ? raci : undefined,
      };

      const updatedProcess = await updateProcess(process.processId, processPatch);
      setProcess(updatedProcess);

      await refreshProjectProcesses(updatedProcess.projectId);

      if (version) {
        const existingApproval = version.approval || {};
        const approvalNext = {
          ...existingApproval,
          approvedBy: metaApprovedBy.trim() || undefined,
          notes: metaApprovalNotes.trim() || undefined,
          approvedAt: existingApproval.approvedAt,
        };

        if (metaVersionStatus === 'published' && !approvalNext.approvedAt) {
          approvalNext.approvedAt = new Date().toISOString();
        }

        const approvalHasAny = !!(approvalNext.approvedBy || approvalNext.notes || approvalNext.approvedAt);

        const versionPatch: Partial<ProcessVersion> = {
          status: metaVersionStatus,
          versionLabel: metaVersionLabel.trim() || undefined,
          approval: approvalHasAny ? approvalNext : undefined,
          titleSnapshot: title,
        };

        const updatedVersion = await updateVersion(process.processId, version.versionId, versionPatch);
        setVersion(updatedVersion);

        await refreshVersions(process.processId);

        setStatusMessage('Metadaten gespeichert.');
      } else {
        setStatusMessage('Prozess-Metadaten gespeichert. Hinweis: Keine Version geladen, daher keine Versionsdaten gespeichert.');
      }
    } catch (e) {
      setStatusMessage(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : 'Unbekannt'}`);
    } finally {
      setMetaSaving(false);
    }
  };

  const handleLoadVersion = async (versionId: string) => {
    if (!processId) {
      setStatusMessage('Kein Prozess geladen');
      return;
    }
    try {
      const ver = await getVersion(processId, versionId);
      if (!ver) {
        setStatusMessage('Version nicht gefunden');
        return;
      }
      setVersion(ver);
      setActiveTab('wizard');
      setStatusMessage('Version geladen');
    } catch (error) {
      setStatusMessage(`Fehler beim Laden: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    }
  };

  const handleCloneVersion = async (sourceVersionId: string) => {
    if (!process) {
      setStatusMessage('Kein Prozess geladen');
      return;
    }

    try {
      setStatusMessage('Dupliziere Version...');
      const cloned = await cloneVersion(process.processId, sourceVersionId, {
        titleSnapshot: process.title,
        status: 'draft',
        resetBpmnXml: true,
      });

      await refreshVersions(process.processId);
      setVersion(cloned);
      setActiveTab('wizard');
      setStatusMessage('Version dupliziert und geladen.');
    } catch (e) {
      setStatusMessage(`Duplizieren fehlgeschlagen: ${e instanceof Error ? e.message : 'Unbekannt'}`);
    }
  };

  const handleExportProcessBundle = async () => {
    if (!processId) {
      setStatusMessage('Kein Prozess geladen');
      return;
    }

    try {
      const bundle = await exportProcessBundle(processId);
      const json = JSON.stringify(bundle, null, 2);

      const baseName = (bundle.process.title || 'prozess')
        .replace(/[^a-zA-Z0-9_\-äöüÄÖÜß ]/g, '')
        .replace(/\s+/g, '_');

      const dateStamp = new Date().toISOString().slice(0, 10);
      const filename = `${baseName}__bundle__${dateStamp}.json`;

      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusMessage('Export erstellt und heruntergeladen.');
    } catch (e) {
      setStatusMessage(`Export fehlgeschlagen: ${e instanceof Error ? e.message : 'Unbekannt'}`);
    }
  };

  const handleExportProjectBundle = async () => {
    if (!projectId) {
      setStatusMessage('Kein Projekt ausgewählt');
      return;
    }

    try {
      const bundle = await exportProjectBundle(projectId);
      const json = JSON.stringify(bundle, null, 2);

      const baseName = (bundle.project.name || 'projekt')
        .replace(/[^a-zA-Z0-9_\-äöüÄÖÜß ]/g, '')
        .replace(/\s+/g, '_');

      const dateStamp = new Date().toISOString().slice(0, 10);
      const filename = `${baseName}__project_bundle__${dateStamp}.json`;

      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusMessage('Projekt-Export erstellt und heruntergeladen.');
    } catch (e) {
      setStatusMessage(`Projekt-Export fehlgeschlagen: ${e instanceof Error ? e.message : 'Unbekannt'}`);
    }
  };

  const handleExportPackageZip = async () => {
    if (!process || !version) {
      setStatusMessage('Prozess oder Version fehlt');
      return;
    }
    setExportingPackage(true);
    setExportPackageWarnings([]);
    try {
      const res = await buildAndDownloadProcessExportZip({ process, version });
      setStatusMessage(`Exportpaket heruntergeladen: ${res.filename}`);
      if (res.warnings.length > 0) {
        setExportPackageWarnings(res.warnings);
      }
    } catch (e) {
      setStatusMessage(`Exportpaket fehlgeschlagen: ${e instanceof Error ? e.message : 'Unbekannt'}`);
    } finally {
      setExportingPackage(false);
    }
  };

  const handleBundleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setBundleParseError('');
    setBundleImportWarnings([]);
    setBundlePreview(null);

    const file = e.currentTarget.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseProcessBundle(text);
      setBundlePreview(parsed);
      setBundleFileName(file.name);
      setStatusMessage('Import-Datei gelesen. Bitte Preview prüfen und Import starten.');
    } catch {
      setBundleFileName(file?.name || '');
      setBundlePreview(null);
      setBundleParseError('Datei konnte nicht als Prozess-Bundle gelesen werden. Bitte prüfen Sie das JSON-Format.');
      setStatusMessage('Import-Datei ungültig oder nicht lesbar.');
    }
  };

  const handleImportBundle = async () => {
    if (!projectId || !bundlePreview) return;

    setBundleImporting(true);
    try {
      const result = await importProcessBundleToProject(projectId, bundlePreview);
      setBundleImportWarnings(result.warnings);
      setStatusMessage(`Import abgeschlossen: ${result.importedVersionCount} Version(en) importiert.`);
      setProcessId(result.processId);
      setActiveTab('wizard');
    } catch (err) {
      setStatusMessage(`Import fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannt'}`);
    } finally {
      setBundleImporting(false);
    }
  };

  const handleProjectBundleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setProjectBundleParseError('');
    setProjectBundleWarnings([]);
    setProjectBundlePreview(null);

    const file = e.currentTarget.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseProjectBundle(text);
      setProjectBundlePreview(parsed);
      setProjectBundleFileName(file.name);
      setStatusMessage('Projekt-Bundle gelesen. Bitte Preview prüfen und Import starten.');
    } catch {
      setProjectBundleFileName(file?.name || '');
      setProjectBundlePreview(null);
      setProjectBundleParseError('Datei konnte nicht als Projekt-Bundle gelesen werden. Bitte prüfen Sie das JSON-Format.');
      setStatusMessage('Projekt-Bundle ungültig oder nicht lesbar.');
    }
  };

  const handleImportProjectBundle = async () => {
    if (!projectBundlePreview) return;

    setProjectBundleImporting(true);
    try {
      const result = await importProjectBundleAsNewProject(projectBundlePreview);
      setProjectBundleWarnings(result.warnings);
      setStatusMessage(`Projekt importiert: ${result.importedProcessCount} Prozess(e), ${result.importedVersionCount} Version(en).`);

      await refreshProjects();
      setProjectId(result.projectId);

      setProcessId(null);
      setProcess(null);
      setVersion(null);
      setActiveTab('setup');
    } catch (e) {
      setStatusMessage(`Projekt-Import fehlgeschlagen: ${e instanceof Error ? e.message : 'Unbekannt'}`);
    } finally {
      setProjectBundleImporting(false);
    }
  };

  const handleStartWizardForProcess = async (proc: Process) => {
    try {
      const latestVersion = await getLatestVersion(proc.processId);
      if (latestVersion) {
        setProcessId(proc.processId);
        setActiveTab('wizard');
        setStatusMessage('Prozess geladen');
      } else {
        const newVersion = await createVersion(proc.processId, {
          status: 'draft',
          titleSnapshot: proc.title,
          endToEndDefinition: {
            trigger: '',
            customer: '',
            outcome: '',
          },
        });
        setProcessId(proc.processId);
        setVersion(newVersion);
        setActiveTab('wizard');
        setStatusMessage('Neue Version erstellt - Wizard bereit');
      }
    } catch (error) {
      setStatusMessage(`Fehler beim Öffnen: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    }
  };

  const handleSaveAnswers = async () => {
    if (!process || !version) {
      setStatusMessage('Prozess oder Version fehlt');
      return;
    }

    setSaving(true);
    setErrors({});
    setStatusMessage('');

    try {
      const answersList: WizardAnswer[] = Object.entries(answers).map(([questionId, value]) => ({
        questionId,
        value,
      }));

      if (!wizardShownPhase) {
        setStatusMessage('Keine aktive Wizard-Phase gefunden');
        setSaving(false);
        return;
      }
      const result = applyAnswers(process, version, answersList, wizardShownPhase);

      if (result.errors.length > 0) {
        const errorMap: Record<string, string> = {};
        result.errors.forEach((err) => {
          errorMap[err.questionId] = err.error;
        });
        setErrors(errorMap);
        setStatusMessage(`${result.errors.length} Fehler bei der Validierung`);
        setSaving(false);
        return;
      }

      if (result.processPatch) {
        const updatedProcess = await updateProcess(process.processId, result.processPatch);
        setProcess(updatedProcess);
      }

      const updated = await updateVersion(process.processId, version.versionId, result.versionPatch);
      setVersion(updated);
      setAnswers({});
      setStatusMessage('Antworten gespeichert! Phase aktualisiert.');
    } catch (error) {
      setStatusMessage(`Fehler beim Speichern: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    } finally {
      setSaving(false);
    }
  };

  const ensureBpmnXml = async (): Promise<boolean> => {
    if (!process || !version) {
      setStatusMessage('Prozess oder Version fehlt');
      return false;
    }

    if (version.bpmn?.bpmnXml && version.bpmn.bpmnXml.trim().length > 0) return true;

    const hpLen = version.sidecar.captureDraft?.happyPath?.length ?? 0;
    if (hpLen === 0) {
      setStatusMessage('Kein Draft vorhanden. BPMN Vorschau ist aktuell nicht möglich.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    }

    setGeneratingBpmn(true);
    setBpmnWarnings([]);
    setStatusMessage('Erzeuge BPMN für die Vorschau...');

    try {
      const result = buildBpmnXmlFromDraft(process, version);
      setBpmnWarnings(result.warnings);

      const updated = await updateVersion(process.processId, version.versionId, {
        bpmn: {
          ...version.bpmn,
          bpmnXml: result.xml,
          lastExportedAt: new Date().toISOString(),
        },
      });

      setVersion(updated);

      if (result.warnings?.length) {
        setStatusMessage(`BPMN erzeugt (Hinweise: ${result.warnings.length}). Öffne Vorschau...`);
      } else {
        setStatusMessage('BPMN erzeugt. Öffne Vorschau...');
      }

      return true;
    } catch (error) {
      setStatusMessage(`Fehler bei BPMN-Generierung: ${error instanceof Error ? error.message : 'Unbekannt'}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    } finally {
      setGeneratingBpmn(false);
    }
  };

  const handleOpenBpmnPreview = async () => {
    const ok = await ensureBpmnXml();
    if (ok) setBpmnPreviewOpen(true);
  };

  const handleGenerateBpmn = async () => {
    if (!process || !version) {
      setStatusMessage('Prozess oder Version fehlt');
      return;
    }

    setGeneratingBpmn(true);
    setBpmnWarnings([]);
    setStatusMessage('');

    try {
      const result = buildBpmnXmlFromDraft(process, version);
      setBpmnWarnings(result.warnings);

      const updated = await updateVersion(process.processId, version.versionId, {
        bpmn: {
          ...version.bpmn,
          bpmnXml: result.xml,
          lastExportedAt: new Date().toISOString(),
        },
      });

      setVersion(updated);
      setStatusMessage('BPMN erfolgreich generiert!');
    } catch (error) {
      setStatusMessage(`Fehler bei BPMN-Generierung: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    } finally {
      setGeneratingBpmn(false);
    }
  };

  const handleDownloadBpmn = () => {
    if (!version || !version.bpmn.bpmnXml) {
      setStatusMessage('Kein BPMN XML vorhanden. Bitte erst generieren.');
      return;
    }

    const sanitizedFilename = (version.titleSnapshot || process?.title || 'process')
      .replace(/[^a-zA-Z0-9_\-äöüÄÖÜß ]/g, '')
      .replace(/\s+/g, '_');

    const blob = new Blob([version.bpmn.bpmnXml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizedFilename}.bpmn`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setStatusMessage('BPMN-Datei heruntergeladen!');
  };

  const handleSkipPhase = async () => {
    if (!process || !version) {
      setStatusMessage('Prozess oder Version fehlt');
      return;
    }

    setSaving(true);
    setErrors({});
    setStatusMessage('');

    try {
      if (!wizardShownPhase) {
        setStatusMessage('Keine aktive Wizard-Phase gefunden');
        setSaving(false);
        return;
      }
      const result = applyAnswers(process, version, [], wizardShownPhase);

      if (result.errors.length > 0) {
        setStatusMessage(`${result.errors.length} Fehler beim Überspringen`);
        setSaving(false);
        return;
      }

      if (result.processPatch) {
        const updatedProcess = await updateProcess(process.processId, result.processPatch);
        setProcess(updatedProcess);
      }

      const updated = await updateVersion(process.processId, version.versionId, result.versionPatch);
      setVersion(updated);
      setAnswers({});
      setStatusMessage('Phase abgeschlossen (übersprungen).');
    } catch (error) {
      setStatusMessage(`Fehler beim Überspringen: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    } finally {
      setSaving(false);
    }
  };

  const patchStepEdit = (stepId: string, patch: Partial<CaptureDraftStep>) => {
    setStepEdits((prev) => ({
      ...prev,
      [stepId]: {
        ...prev[stepId],
        ...patch,
      },
    }));
  };

  const handleSaveStepDetails = async () => {
    if (!process || !version || !version.sidecar.captureDraft) {
      setStatusMessage('Prozess, Version oder Draft fehlt');
      return;
    }

    setSavingStepDetails(true);
    setStatusMessage('');

    try {
      const updatedHappyPathRaw = version.sidecar.captureDraft.happyPath.map((step) => ({
        ...step,
        ...(stepEdits[step.stepId] || {}),
      }));

      const updatedHappyPath = updatedHappyPathRaw.map((s) => {
        if (!Array.isArray(s.evidence) || s.evidence.length === 0) return s;

        const ev = s.evidence[0];
        const snippet = typeof ev?.snippet === 'string' ? ev.snippet.trim() : '';
        const refId = typeof ev?.refId === 'string' ? ev.refId.trim() : '';

        if (!snippet && !refId) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { evidence: _evidence, ...rest } = s;
          return rest;
        }

        return s;
      });

      const updated = await updateVersion(process.processId, version.versionId, {
        sidecar: {
          ...version.sidecar,
          captureDraft: {
            ...version.sidecar.captureDraft,
            happyPath: updatedHappyPath,
          },
        },
      });

      setVersion(updated);
      setStatusMessage('Schritt-Details gespeichert.');
    } catch (error) {
      setStatusMessage(`Fehler beim Speichern: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    } finally {
      setSavingStepDetails(false);
    }
  };

  const handleSaveDraftChanges = async (versionPatch: Partial<ProcessVersion>) => {
    if (!process || !version) {
      throw new Error('Prozess oder Version fehlt');
    }

    const updated = await updateVersion(process.processId, version.versionId, versionPatch);
    setVersion(updated);
    setStatusMessage('Änderungen gespeichert.');
  };

  const handleCreateVersionFromMining = async (payload: {
    titleSuffix: string;
    draft: import('../domain/capture').CaptureDraft;
    bpmnXml: string;
    processMining?: import('../domain/process').ProcessMiningState;
  }) => {
    if (!process || !version) return;
    const now = new Date().toISOString();
    const baseSidecar = {
      ...version.sidecar,
      captureDraft: payload.draft,
      ...(payload.processMining ? { processMining: payload.processMining } : {}),
    };
    const clonedSidecar = await cloneMiningSidecarEventBlobs(baseSidecar);
    const newVersion = await createVersion(process.processId, {
      status: 'draft',
      titleSnapshot: `${process.title} (${payload.titleSuffix})`,
      endToEndDefinition: structuredClone(version.endToEndDefinition),
      sidecar: clonedSidecar,
      bpmn: {
        bpmnXml: payload.bpmnXml,
        lastExportedAt: now,
      },
    });
    await refreshVersions(process.processId);
    setVersion(newVersion);
    setActiveTab('draft');
    setStatusMessage('Neue Version aus Mining-Modell erstellt.');
  };

  const handleSetRoleForAll = () => {
    if (!quickActionRole || !version?.sidecar.captureDraft?.happyPath) return;

    const newEdits = { ...stepEdits };
    version.sidecar.captureDraft.happyPath.forEach((step) => {
      newEdits[step.stepId] = {
        ...newEdits[step.stepId],
        roleId: quickActionRole,
      };
    });
    setStepEdits(newEdits);
    setStatusMessage('Rolle für alle Schritte gesetzt (noch nicht gespeichert).');
  };

  const handleSetSystemForAll = () => {
    if (!quickActionSystem || !version?.sidecar.captureDraft?.happyPath) return;

    const newEdits = { ...stepEdits };
    version.sidecar.captureDraft.happyPath.forEach((step) => {
      newEdits[step.stepId] = {
        ...newEdits[step.stepId],
        systemId: quickActionSystem,
      };
    });
    setStepEdits(newEdits);
    setStatusMessage('System für alle Schritte gesetzt (noch nicht gespeichert).');
  };

  const normalizeForContains = (text: string): string => {
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
  };

  const buildToBeLine = (item: ImprovementBacklogItem): string => {
    if (item.automationBlueprint) {
      const approach = item.automationBlueprint.approach || 'unklar';
      const level = item.automationBlueprint.level || 'unklar';
      const hitl = item.automationBlueprint.humanInTheLoop ? 'Ja' : 'Nein';
      return `• [Automatisierung] ${item.title} (Ansatz: ${approach}, Grad: ${level}, HITL: ${hitl})`;
    }
    const dueDate = item.dueDate ? `, Fällig: ${item.dueDate}` : '';
    return `• [${item.category}] ${item.title} (Status: ${item.status}${dueDate})`;
  };

  const appendUniqueLines = (existing: string, newLines: string[]): string => {
    const existingNorm = normalizeForContains(existing);
    const lines = existing ? existing.split('\n') : [];

    for (const line of newLines) {
      const lineNorm = normalizeForContains(line);
      if (!existingNorm.includes(lineNorm)) {
        lines.push(line);
      }
    }

    return lines.join('\n');
  };

  const handleCopyImprovementsToStep = (stepId: string) => {
    if (!version) return;

    const related = (version.sidecar.improvementBacklog ?? []).filter(
      (item) =>
        item.scope === 'step' &&
        item.relatedStepId === stepId &&
        item.status !== 'done' &&
        item.status !== 'discarded'
    );

    if (related.length === 0) return;

    const newLines = related.map(buildToBeLine);
    const step = version.sidecar.captureDraft?.happyPath.find(s => s.stepId === stepId) || null;
    const existingHint = stepEdits[stepId]?.toBeHint ?? step?.toBeHint ?? '';
    const updatedToBeHint = appendUniqueLines(existingHint, newLines);

    setStepEdits((prev) => ({
      ...prev,
      [stepId]: {
        ...prev[stepId],
        toBeHint: updatedToBeHint,
      },
    }));

    setStatusMessage('To-Be Hinweise übernommen (noch nicht gespeichert).');
  };

  const getEvidenceSnippet = (
    step: CaptureDraftStep,
    edit?: Partial<CaptureDraftStep>
  ): string => {
    const editEvidence = edit?.evidence;
    if (Array.isArray(editEvidence)) {
      const s = editEvidence[0]?.snippet;
      return typeof s === 'string' ? s : '';
    }

    const stepEvidence = step.evidence;
    if (Array.isArray(stepEvidence)) {
      const s = stepEvidence[0]?.snippet;
      return typeof s === 'string' ? s : '';
    }

    return '';
  };

  const getBaseStepEvidence = (stepId: string): { snippet?: string; refId?: string } => {
    const step = version?.sidecar.captureDraft?.happyPath.find((s) => s.stepId === stepId);
    const ev = Array.isArray(step?.evidence) ? step?.evidence[0] : undefined;
    return {
      snippet: typeof ev?.snippet === 'string' ? ev.snippet : undefined,
      refId: typeof ev?.refId === 'string' ? ev.refId : undefined,
    };
  };

  const patchEvidenceSnippet = (stepId: string, snippet: string) => {
    const cleaned = snippet.trim();
    const base = getBaseStepEvidence(stepId);

    setStepEdits((prev) => {
      const current = prev[stepId] ?? {};
      const currentEvidence = current.evidence;

      const hasOverride = Array.isArray(currentEvidence);
      const existingRefId = hasOverride ? currentEvidence?.[0]?.refId : base.refId;

      const refIdClean =
        typeof existingRefId === 'string' && existingRefId.trim() ? existingRefId.trim() : undefined;

      return {
        ...prev,
        [stepId]: {
          ...current,
          evidence: cleaned || refIdClean ? [{ type: 'text' as const, snippet: cleaned, refId: refIdClean }] : [],
        },
      };
    });
  };

  const getEvidenceRefId = (
    step: CaptureDraftStep,
    edit?: Partial<CaptureDraftStep>
  ): string => {
    const editEvidence = edit?.evidence;
    if (Array.isArray(editEvidence)) {
      const r = editEvidence[0]?.refId;
      return typeof r === 'string' ? r : '';
    }

    const stepEvidence = step.evidence;
    if (Array.isArray(stepEvidence)) {
      const r = stepEvidence[0]?.refId;
      return typeof r === 'string' ? r : '';
    }

    return '';
  };

  const patchEvidenceRefId = (stepId: string, refIdRaw: string) => {
    const cleaned = refIdRaw.trim();
    const base = getBaseStepEvidence(stepId);

    setStepEdits((prev) => {
      const current = prev[stepId] ?? {};
      const currentEvidence = current.evidence;

      const hasOverride = Array.isArray(currentEvidence);
      const existingSnippet = hasOverride ? currentEvidence?.[0]?.snippet : base.snippet;

      const snippetKeep = typeof existingSnippet === 'string' ? existingSnippet : '';

      const refIdKeep = cleaned ? cleaned : undefined;

      const hasSnippet = typeof existingSnippet === 'string' && existingSnippet.trim().length > 0;

      return {
        ...prev,
        [stepId]: {
          ...current,
          evidence: refIdKeep || hasSnippet ? [{ type: 'text' as const, snippet: snippetKeep, refId: refIdKeep }] : [],
        },
      };
    });
  };

  useEffect(() => {
    if (processId) {
      loadProcessAndVersion(processId);
    }
  }, [processId, loadProcessAndVersion]);

  useEffect(() => {
    if (version?.sidecar.captureDraft?.happyPath) {
      const initialEdits: Record<string, Partial<CaptureDraftStep>> = {};
      version.sidecar.captureDraft.happyPath.forEach((step) => {
        initialEdits[step.stepId] = {
          roleId: step.roleId,
          systemId: step.systemId,
          workType: step.workType,
          painPointHint: step.painPointHint,
          toBeHint: step.toBeHint,
        };
      });
      setStepEdits(initialEdits);
    }
  }, [version]);

  useEffect(() => {
    if (!version) return;

    const nonSkeleton = CAPTURE_PHASES_ALL.filter(
      (p) => !CAPTURE_PHASES_SKELETON.includes(p)
    );

    const startedNonSkeleton = nonSkeleton.some(
      (p) => version.captureProgress.phaseStates[p] !== 'not_started'
    );

    setWizardFocus(startedNonSkeleton ? 'detail' : 'skeleton');
    setAnswers({});
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version?.versionId]);

  const wizardPhases = wizardFocus === 'skeleton' ? CAPTURE_PHASES_SKELETON : CAPTURE_PHASES_ALL;
  const wizardCurrentPhase = version ? getCurrentPhaseForPhases(version, wizardPhases) : null;

  const wizardDefaultPhase: CapturePhase | null =
    (wizardCurrentPhase as CapturePhase | null) ??
    (wizardPhases.length > 0 ? (wizardPhases[wizardPhases.length - 1] as CapturePhase) : null);

  const wizardShownPhase: CapturePhase | null =
    wizardActivePhase && wizardPhases.includes(wizardActivePhase)
      ? wizardActivePhase
      : wizardDefaultPhase;

  useEffect(() => {
    if (!version) return;
    setWizardActivePhase((prev) => {
      if (prev && wizardPhases.includes(prev)) return prev;
      return wizardDefaultPhase;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version?.versionId, wizardFocus]);

  const nextQuestions =
    process && version && wizardShownPhase
      ? getNextQuestionsForPhase(process, version, wizardShownPhase, 3)
      : [];

  const phaseQuestions = wizardShownPhase ? getQuestionsByPhase(wizardShownPhase) : [];
  const phaseHasRequired = phaseQuestions.some(q => q.required);

  const phaseStatus =
    process && version && wizardShownPhase
      ? getPhaseAnswerStatus(process, version, wizardShownPhase)
      : { requiredAnswered: false, optionalUnanswered: false, allQuestionsAnswered: false };

  const phaseLabels: Record<CapturePhase, string> = {
    scope: 'Einordnung & End-to-End',
    happy_path: 'Hauptablauf',
    roles: 'Beteiligte',
    decisions: 'Entscheidungen',
    exceptions: 'Ausnahmen',
    data_it: 'Daten & IT-Systeme',
    kpis: 'Kennzahlen',
    automation: 'Automatisierung',
    review: 'Review & Qualität',
  };

  const handleGenerateAiPrompt = () => {
    if (!aiRawText.trim()) {
      setStatusMessage('Bitte Quelltext eingeben');
      return;
    }

    const hasTranslation = Boolean(aiTranslatedText.trim());
    let extraHint = '';
    if (aiCaptureMode === 'cases') {
      const c = parseCaseBlocks(aiRawText).length;
      if (c > 0 && c < 3) {
        extraHint = ' Hinweis: Für stabilere Ergebnisse sind 3–5 Fälle empfehlenswert.';
      }
    }

    const seedCapture = version ? buildSeedFromVersion(version) : undefined;

    const prompt = buildClaudeExtractionPrompt({
      rawText: aiRawText,
      translatedText: aiTranslatedText.trim() ? aiTranslatedText : undefined,
      processTitleHint: process?.title,
      captureMode: aiCaptureMode,
      seedCapture,
    });

    setAiGeneratedPrompt(prompt);

    const promptPreview = prompt.length > 4000 ? prompt.slice(0, 4000) + '\n\n… (gekürzt)' : prompt;
    setAiApiLastRequestPreview(
      JSON.stringify({ schemaVersion: 'process-ai-proxy-v1', prompt: promptPreview }, null, 2)
    );

    setStatusMessage(`Prompt generiert. Kopieren Sie ihn und fügen Sie ihn in Claude ein.${extraHint}${hasTranslation ? ' (inkl. Übersetzung)' : ''}`);
  };

  const handleRunAiExtractionViaApi = async () => {
    setAiApiError('');

    if (!aiRawText.trim()) {
      setStatusMessage('Bitte Quelltext eingeben');
      return;
    }

    if (settings.dataHandlingMode !== 'external') {
      setStatusMessage('API ist im lokalen Modus deaktiviert');
      return;
    }

    if (settings.ai.mode !== 'api') {
      return;
    }

    if (!settings.ai.api.endpointUrl.trim()) {
      setAiApiError('Endpoint URL fehlt');
      return;
    }

    const seedCaptureApi = version ? buildSeedFromVersion(version) : undefined;

    const prompt = buildClaudeExtractionPrompt({
      rawText: aiRawText,
      translatedText: aiTranslatedText.trim() ? aiTranslatedText : undefined,
      processTitleHint: process?.title,
      captureMode: aiCaptureMode,
      seedCapture: seedCaptureApi,
    });

    setAiGeneratedPrompt(prompt);

    const promptPreview = prompt.length > 4000 ? prompt.slice(0, 4000) + '\n\n… (gekürzt)' : prompt;
    setAiApiLastRequestPreview(
      JSON.stringify({ schemaVersion: 'process-ai-proxy-v1', prompt: promptPreview }, null, 2)
    );

    setAiApiRunning(true);

    try {
      const text = await runAiProxyRequest({
        endpointUrl: settings.ai.api.endpointUrl,
        authMode: settings.ai.api.authMode,
        apiKey: settings.ai.api.apiKey,
        timeoutMs: settings.ai.api.timeoutMs,
        prompt,
      });

      setAiResponseJson(text);
      setStatusMessage('API-Antwort übernommen. Bitte prüfen und dann importieren.');
    } catch (e) {
      setAiApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiApiRunning(false);
    }
  };

  const handleInsertCaseTemplate = () => {
    if (aiRawText.trim() === '') {
      setAiRawText(CASE_FIRST_TEMPLATE_DE);
    } else {
      setAiRawText(aiRawText + '\n\n' + CASE_FIRST_TEMPLATE_DE);
    }
    setStatusMessage('Vorlage eingefügt. Bitte ergänzen/anonymisieren.');
  };

  const caseBlocks = aiCaptureMode === 'cases' ? parseCaseBlocks(aiRawText) : [];

  const handleInsertMultiCaseBlock = () => {
    const nextNo = parseCaseBlocks(aiRawText).length + 1;
    const block = buildCaseBlockTemplate(nextNo);

    setAiRawText((prev) => {
      const base = prev.trim();
      if (!base) return block;
      return base + '\n\n---\n\n' + block;
    });

    setStatusMessage(`Fall ${nextNo} Vorlage eingefügt. Bitte ergänzen/anonymisieren.`);
  };

  const updateCaseBody = (index: number, nextBody: string) => {
    const blocks = parseCaseBlocks(aiRawText);
    if (index < 0 || index >= blocks.length) return;
    blocks[index] = { ...blocks[index], body: nextBody };
    setAiRawText(buildCaseBlocksText(blocks));
  };

  const removeCaseBlock = (index: number) => {
    const blocks = parseCaseBlocks(aiRawText);
    if (index < 0 || index >= blocks.length) return;
    const next = blocks.filter((_, i) => i !== index);
    setAiRawText(buildCaseBlocksText(next));
    setStatusMessage(`Fall ${index + 1} gelöscht.`);
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(aiGeneratedPrompt);
      setStatusMessage('Prompt in Zwischenablage kopiert');
    } catch {
      setStatusMessage(
        'Kopieren fehlgeschlagen. Bitte manuell markieren und kopieren (Ctrl+C / Cmd+C).'
      );
    }
  };

  const appendToAiRawText = useCallback((chunk: string) => {
    const t = chunk.trim();
    if (!t) return;
    setAiRawText((prev) => {
      if (!prev) return t;
      const sep = /\s$/.test(prev) ? '' : ' ';
      return prev + sep + t;
    });
  }, []);

  const canUseAiDictation =
    settings.dataHandlingMode === 'external' &&
    settings.transcription.providerId === 'web_speech' &&
    isWebSpeechSupported();

  const needsAiDictationSetup =
    settings.dataHandlingMode !== 'external' || settings.transcription.providerId !== 'web_speech';

  const handleStartAiDictation = () => {
    setAiDictationError('');
    setAiDictationInterim('');

    if (aiDictationActive) return;

    if (settings.dataHandlingMode !== 'external') {
      setAiDictationError('Spracheingabe ist deaktiviert. Bitte im Setup den Modus "Externer Dienst" wählen.');
      return;
    }

    if (settings.transcription.providerId !== 'web_speech') {
      setAiDictationError('Spracheingabe ist nicht aktiv. Bitte im Setup als STT-Provider "Browser-Spracherkennung (Web Speech API)" wählen.');
      return;
    }

    if (!isWebSpeechSupported()) {
      setAiDictationError('Dieser Browser unterstützt Web Speech API nicht.');
      return;
    }

    aiDictationRunRef.current += 1;
    const runId = aiDictationRunRef.current;

    aiDictationSessionRef.current?.abort();
    aiDictationSessionRef.current = null;

    setAiDictationActive(true);

    const session = startWebSpeechTranscription(
      { language: settings.transcription.language, continuous: true, interimResults: true },
      {
        onInterim: (t) => {
          if (aiDictationRunRef.current !== runId) return;
          setAiDictationInterim(t);
        },
        onFinal: (t) => {
          if (aiDictationRunRef.current !== runId) return;
          appendToAiRawText(t);
          setAiDictationInterim('');
        },
        onError: (msg) => {
          if (aiDictationRunRef.current !== runId) return;
          setAiDictationError(msg);
          setAiDictationInterim('');
          setAiDictationActive(false);
          aiDictationSessionRef.current = null;
        },
        onEnd: () => {
          if (aiDictationRunRef.current !== runId) return;
          setAiDictationInterim('');
          setAiDictationActive(false);
          aiDictationSessionRef.current = null;
        },
      }
    );

    if (!session) {
      setAiDictationActive(false);
      return;
    }

    aiDictationSessionRef.current = session;
  };

  const handleStopAiDictation = () => {
    aiDictationSessionRef.current?.stop();
  };

  const isSupportedTextFile = (file: File): boolean => {
    const name = file.name.toLowerCase();

    if (file.type?.startsWith('text/')) return true;

    if (
      name.endsWith('.txt') ||
      name.endsWith('.md') ||
      name.endsWith('.csv') ||
      name.endsWith('.json') ||
      name.endsWith('.log')
    ) return true;

    if (file.type === 'application/json' || file.type === 'text/csv') return true;

    return false;
  };

  const DOC_PREFIX = 'PM Assist: ';
  const MAX_DOC_CHARS = 200_000;

  const saveDocToEvidenceSources = async (fileName: string, text: string): Promise<void> => {
    if (!version) return;
    const truncated = text.length > MAX_DOC_CHARS ? text.slice(0, MAX_DOC_CHARS) : text;
    const now = new Date().toISOString();
    const baseRefId = DOC_PREFIX + fileName;
    const existing: EvidenceSource[] = version.sidecar.evidenceSources ?? [];
    let refId = baseRefId;
    let n = 2;
    while (existing.some(s => s.refId === refId)) {
      refId = `${baseRefId} (${n++})`;
      if (n > 99) break;
    }
    const newEntry: EvidenceSource = { refId, kind: 'file', text: truncated, createdAt: now, updatedAt: now };
    const next: EvidenceSource[] = [...existing, newEntry];
    await handleSaveDraftChanges({ sidecar: { ...version.sidecar, evidenceSources: next } });
  };

  const handleAiFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setAiFileError('');
    setAiFilePending(null);
    setAiImportHint(null);

    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    if (aiDictationActive) {
      setAiFileError('Bitte stoppen Sie zuerst das Diktat, bevor Sie eine Datei importieren.');
      input.value = '';
      return;
    }

    const lower = file.name.toLowerCase();
    const isPdf = lower.endsWith('.pdf') || file.type === 'application/pdf';
    const isDocx = lower.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isCsv = lower.endsWith('.csv');
    const isHtml = lower.endsWith('.html') || lower.endsWith('.htm') || file.type === 'text/html';
    const isZip = lower.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';

    const trySaveEvidence = async (fileName: string, text: string): Promise<boolean> => {
      try {
        await saveDocToEvidenceSources(fileName, text);
        return true;
      } catch (saveErr) {
        setAiFileError(`Datei gelesen, aber Speichern in Mining-Dokumenten fehlgeschlagen: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
        return false;
      }
    };

    try {
      if (isZip) {
        const zipData = await file.arrayBuffer();

        const { default: JSZip } = await import('jszip');
        const zipForNames = await JSZip.loadAsync(zipData);
        const zipFileNames = Object.keys(zipForNames.files);
        const zipHint = detectZipLooksLikeHtmlBundle(zipFileNames);
        if (zipHint) {
          setAiImportHint(zipHint);
        }

        const nextNo = parseCaseBlocks(aiRawText).length + 1;
        const r = await htmlZipBundleToText({
          zipData,
          captureMode: aiCaptureMode,
          startingCaseNo: nextNo,
        });

        if (!r.text.trim()) {
          const errorMsg = aiZipImportMode === 'htmlzip'
            ? `"${file.name}" enthält keine importierbaren HTML-Seiten (HTML ZIP Modus).`
            : `"${file.name}" enthält keine importierbaren HTML-Seiten. (Hinweis: nur HTML-Bundles unterstützt)`;
          setAiFileError(errorMsg);
          input.value = '';
          return;
        }

        if (!aiEvidenceSourceLabel.trim() || aiEvidenceSourceLabel.startsWith('AI:')) {
          setAiEvidenceSourceLabel(`HTML ZIP: ${file.name}`);
        }

        const warningSuffix = r.warnings.length ? ` Hinweise: ${r.warnings.join(' ')}` : '';
        const saved = await trySaveEvidence(file.name, r.text);
        const docNote = saved ? ' Im Mining-Dokumente-Tab verfügbar.' : '';

        if (!aiRawText.trim()) {
          setAiRawText(r.text);
          setAiImportHint(null);
          setStatusMessage(`HTML ZIP importiert: ${r.importedCount} Seite(n).${docNote}${warningSuffix}`);
          input.value = '';
          return;
        }

        setAiImportHint(null);
        setAiFilePending({ name: file.name, text: r.text, warnings: r.warnings });
        setStatusMessage(`HTML ZIP gelesen: ${r.importedCount} Seite(n).${docNote} Bitte ersetzen oder anhängen.${warningSuffix}`);
        input.value = '';
        return;
      }
      let rawText = '';
      let warnings: string[] = [];

      if (isPdf) {
        const result = await extractTextFromPdf(file);
        rawText = result.text;
        warnings = result.warnings;
      } else if (isDocx) {
        const result = await extractTextFromDocx(file);
        rawText = result.text;
        warnings = result.warnings;
      } else if (isHtml) {
        const rawHtml = await readFileTextRobust(file, { retries: 1, retryDelayMs: 200 });

        if (aiHtmlImportMode === 'jira') {
          const nextNo = parseCaseBlocks(aiRawText).length + 1;
          const r = jiraHtmlToText({ html: rawHtml, captureMode: aiCaptureMode, startingCaseNo: nextNo });
          if (!r.text.trim()) {
            setAiFileError(`"${file.name}": ${r.warnings.join(' ')}`);
            input.value = '';
            return;
          }
          if (!aiEvidenceSourceLabel.trim() || aiEvidenceSourceLabel.startsWith('AI:')) {
            setAiEvidenceSourceLabel(`Jira HTML: ${file.name}`);
          }
          const saved = await trySaveEvidence(file.name, r.text);
          const docNote = saved ? ' Im Mining-Dokumente-Tab verfügbar.' : '';
          const warnSuffix = r.warnings.length ? ' ' + r.warnings.join(' ') : '';
          if (!aiRawText.trim()) {
            setAiRawText(r.text);
            setAiImportHint(null);
            setStatusMessage(`Jira HTML importiert: ${r.importedCount} Ticket(s).${docNote}${warnSuffix}`);
            input.value = '';
            return;
          }
          setAiImportHint(null);
          setAiFilePending({ name: file.name, text: r.text, warnings: r.warnings });
          setStatusMessage(`Jira HTML gelesen: ${r.importedCount} Ticket(s).${docNote} Bitte ersetzen oder anhängen.${warnSuffix}`);
          input.value = '';
          return;
        }

        if (aiHtmlImportMode === 'servicenow') {
          const nextNo = parseCaseBlocks(aiRawText).length + 1;
          const r = serviceNowHtmlToText({ html: rawHtml, captureMode: aiCaptureMode, startingCaseNo: nextNo });
          if (!r.text.trim()) {
            setAiFileError(`"${file.name}": ${r.warnings.join(' ')}`);
            input.value = '';
            return;
          }
          if (!aiEvidenceSourceLabel.trim() || aiEvidenceSourceLabel.startsWith('AI:')) {
            setAiEvidenceSourceLabel(`ServiceNow HTML: ${file.name}`);
          }
          const saved = await trySaveEvidence(file.name, r.text);
          const docNote = saved ? ' Im Mining-Dokumente-Tab verfügbar.' : '';
          const warnSuffix = r.warnings.length ? ' ' + r.warnings.join(' ') : '';
          if (!aiRawText.trim()) {
            setAiRawText(r.text);
            setAiImportHint(null);
            setStatusMessage(`ServiceNow HTML importiert: ${r.importedCount} Ticket(s).${docNote}${warnSuffix}`);
            input.value = '';
            return;
          }
          setAiImportHint(null);
          setAiFilePending({ name: file.name, text: r.text, warnings: r.warnings });
          setStatusMessage(`ServiceNow HTML gelesen: ${r.importedCount} Ticket(s).${docNote} Bitte ersetzen oder anhängen.${warnSuffix}`);
          input.value = '';
          return;
        }

        if (aiHtmlImportMode === 'raw') {
          const htmlHint = detectHtmlMode(rawHtml);
          if (htmlHint) {
            setAiImportHint(htmlHint);
          }
        }
        const result = extractTextFromHtml(rawHtml);
        rawText = result.text;
        warnings = result.warnings;
        if (!rawText) {
          setAiFileError(`"${file.name}" enthält keinen lesbaren Text.`);
          input.value = '';
          return;
        }
        if (!aiEvidenceSourceLabel.trim() || aiEvidenceSourceLabel.startsWith('AI:')) {
          setAiEvidenceSourceLabel(`HTML: ${file.name}`);
        }
      } else {
        if (!isSupportedTextFile(file)) {
          setAiFileError(`"${file.name}" ist kein unterstütztes Textformat. Unterstützt sind: .txt, .md, .csv, .json, .log, .pdf, .docx, .html, .htm, .zip (HTML-Bundle).`);
          input.value = '';
          return;
        }

        rawText = await readFileTextRobust(file, { retries: 1, retryDelayMs: 200 });
      }

      if (isCsv) {
        const csvHint = detectCsvMode(rawText);
        if (csvHint) {
          setAiImportHint(csvHint);
        }
      }

      if (aiCsvImportMode === 'jira' && isCsv) {
        const nextNo = parseCaseBlocks(aiRawText).length + 1;
        let jiraResult;
        try {
          jiraResult = jiraCsvToText({
            csvText: rawText,
            captureMode: aiCaptureMode,
            startingCaseNo: nextNo,
          });
        } catch (e) {
          setAiFileError(e instanceof Error ? e.message : String(e));
          input.value = '';
          return;
        }

        if (!jiraResult.text) {
          setAiFileError(`"${file.name}": Jira CSV Import ergab keinen Text. ${jiraResult.warnings.join(' ')}`);
          input.value = '';
          return;
        }

        if (!aiEvidenceSourceLabel.trim() || aiEvidenceSourceLabel.startsWith('AI:')) {
          setAiEvidenceSourceLabel(`Jira CSV: ${file.name}`);
        }

        const saved = await trySaveEvidence(file.name, jiraResult.text);
        const docNote = saved ? ' Im Mining-Dokumente-Tab verfügbar.' : '';
        const allWarnings = jiraResult.warnings;
        const statusBase = `Jira CSV importiert: ${jiraResult.importedCount} Ticket(s).${allWarnings.length > 0 ? ' ' + allWarnings.join(' ') : ''}`;

        if (!aiRawText.trim()) {
          setAiRawText(jiraResult.text);
          setAiImportHint(null);
          setStatusMessage(statusBase + docNote);
          input.value = '';
          return;
        }

        setAiImportHint(null);
        setAiFilePending({ name: file.name, text: jiraResult.text, warnings: jiraResult.warnings });
        setStatusMessage(statusBase + docNote + ' Bitte ersetzen oder anhängen.');
        input.value = '';
        return;
      }

      if (aiCsvImportMode === 'servicenow' && isCsv) {
        const nextNo = parseCaseBlocks(aiRawText).length + 1;
        let snResult;
        try {
          snResult = serviceNowCsvToText({
            csvText: rawText,
            captureMode: aiCaptureMode,
            startingCaseNo: nextNo,
          });
        } catch (e) {
          setAiFileError(e instanceof Error ? e.message : String(e));
          input.value = '';
          return;
        }

        if (!snResult.text) {
          setAiFileError(`"${file.name}": ServiceNow CSV Import ergab keinen Text. ${snResult.warnings.join(' ')}`);
          input.value = '';
          return;
        }

        if (!aiEvidenceSourceLabel.trim() || aiEvidenceSourceLabel.startsWith('AI:')) {
          setAiEvidenceSourceLabel(`ServiceNow CSV: ${file.name}`);
        }

        const saved = await trySaveEvidence(file.name, snResult.text);
        const docNote = saved ? ' Im Mining-Dokumente-Tab verfügbar.' : '';
        const snWarnings = snResult.warnings;
        const snStatusBase = `ServiceNow CSV importiert: ${snResult.importedCount} Ticket(s).${snWarnings.length > 0 ? ' ' + snWarnings.join(' ') : ''}`;

        if (!aiRawText.trim()) {
          setAiRawText(snResult.text);
          setAiImportHint(null);
          setStatusMessage(snStatusBase + docNote);
          input.value = '';
          return;
        }

        setAiImportHint(null);
        setAiFilePending({ name: file.name, text: snResult.text, warnings: snResult.warnings });
        setStatusMessage(snStatusBase + docNote + ' Bitte ersetzen oder anhängen.');
        input.value = '';
        return;
      }

      const cleaned = rawText.replace(/\r\n/g, '\n').trim();

      if (!cleaned) {
        setAiFileError(`"${file.name}" enthält keinen lesbaren Text.`);
        input.value = '';
        return;
      }

      const warningSuffix = warnings.length > 0 ? ` Hinweise: ${warnings.join(' ')}` : '';

      const effectiveText = (() => {
        if (aiCaptureMode !== 'cases') return cleaned;
        const nextNo = parseCaseBlocks(aiRawText).length + 1;
        return `FALL ${nextNo} (Datei: ${file.name})\n\n${cleaned}`;
      })();

      if (!aiEvidenceSourceLabel.trim() || aiEvidenceSourceLabel.startsWith('AI:')) {
        setAiEvidenceSourceLabel(`Datei: ${file.name}`);
      }

      const saved = await trySaveEvidence(file.name, cleaned);
      const docNote = saved ? ' Im Mining-Dokumente-Tab verfügbar.' : '';

      if (!aiRawText.trim()) {
        setAiRawText(effectiveText);
        setStatusMessage(`Text aus "${file.name}" übernommen.${docNote}${warningSuffix}`);
        input.value = '';
        return;
      }

      setAiFilePending({ name: file.name, text: effectiveText, warnings });
      setStatusMessage(`Datei "${file.name}" gelesen.${docNote} Bitte ersetzen oder anhängen.${warningSuffix}`);
      input.value = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const domName = (err as unknown as { name?: string })?.name ? String((err as unknown as { name?: string }).name) : 'UnknownError';
      setAiFileError(`Der Browser konnte die Datei "${file.name}" nicht lesen (DOMException: ${domName}). Details: ${msg}`);
      input.value = '';
    }
  };

  const handleAiApplyFileReplace = () => {
    if (!aiFilePending) return;
    const w = aiFilePending.warnings?.length ? ` Hinweise: ${aiFilePending.warnings.join(' ')}` : '';
    setAiRawText(aiFilePending.text);
    setStatusMessage(`Text aus "${aiFilePending.name}" übernommen (ersetzt).${w}`);
    setAiFilePending(null);
    setAiImportHint(null);
  };

  const handleAiApplyFileAppend = () => {
    if (!aiFilePending) return;
    setAiRawText((prev) => {
      const base = prev.trim();
      const add = aiFilePending.text.trim();
      if (!base) return add;

      const sep = aiCaptureMode === 'cases' ? '\n\n---\n\n' : '\n\n';
      return base + sep + add;
    });
    const w = aiFilePending.warnings?.length ? ` Hinweise: ${aiFilePending.warnings.join(' ')}` : '';
    setStatusMessage(`Text aus "${aiFilePending.name}" übernommen (angehängt).${w}`);
    setAiFilePending(null);
    setAiImportHint(null);
  };

  const handleAiCancelFilePending = () => {
    setAiFilePending(null);
  };

  const appendToWizardAnswer = useCallback(
    (questionId: string, chunk: string, mode: 'space' | 'newline') => {
      const t = chunk.trim();
      if (!t) return;

      setAnswers((prev) => {
        const currentRaw = prev[questionId];
        const current =
          typeof currentRaw === 'string'
            ? currentRaw
            : Array.isArray(currentRaw)
            ? currentRaw.join('\n')
            : '';

        if (!current) return { ...prev, [questionId]: t };

        if (mode === 'newline') {
          const sep = current.endsWith('\n') ? '' : '\n';
          return { ...prev, [questionId]: current + sep + t };
        }

        const sep = /\s$/.test(current) ? '' : ' ';
        return { ...prev, [questionId]: current + sep + t };
      });
    },
    []
  );

  const canUseWizardDictation =
    settings.dataHandlingMode === 'external' &&
    settings.transcription.providerId === 'web_speech' &&
    isWebSpeechSupported();

  const needsWizardDictationSetup =
    settings.dataHandlingMode !== 'external' || settings.transcription.providerId !== 'web_speech';

  const handleStartWizardDictation = (questionId: string, mode: 'space' | 'newline') => {
    setWizardDictationError('');
    setWizardDictationInterim('');
    setWizardDictationQuestionId(questionId);

    if (settings.dataHandlingMode !== 'external') {
      setWizardDictationError('Spracheingabe ist deaktiviert. Bitte im Setup den Modus "Externer Dienst" wählen.');
      return;
    }
    if (settings.transcription.providerId !== 'web_speech') {
      setWizardDictationError('Spracheingabe ist nicht aktiv. Bitte im Setup als STT-Provider "Web Speech API" wählen.');
      return;
    }
    if (!isWebSpeechSupported()) {
      setWizardDictationError('Dieser Browser unterstützt Web Speech API nicht.');
      return;
    }

    wizardDictationRunRef.current += 1;
    const runId = wizardDictationRunRef.current;

    wizardDictationSessionRef.current?.abort();
    wizardDictationSessionRef.current = null;

    setWizardDictationActive(true);

    const session = startWebSpeechTranscription(
      { language: settings.transcription.language, continuous: true, interimResults: true },
      {
        onInterim: (t) => {
          if (wizardDictationRunRef.current !== runId) return;
          setWizardDictationInterim(t);
        },
        onFinal: (t) => {
          if (wizardDictationRunRef.current !== runId) return;
          appendToWizardAnswer(questionId, t, mode);
          setWizardDictationInterim('');
        },
        onError: (msg) => {
          if (wizardDictationRunRef.current !== runId) return;
          setWizardDictationError(msg);
          setWizardDictationInterim('');
          setWizardDictationActive(false);
          wizardDictationSessionRef.current = null;
        },
        onEnd: () => {
          if (wizardDictationRunRef.current !== runId) return;
          setWizardDictationInterim('');
          setWizardDictationActive(false);
          wizardDictationSessionRef.current = null;
        },
      }
    );

    if (!session) {
      setWizardDictationActive(false);
      return;
    }

    wizardDictationSessionRef.current = session;
  };

  const handleStopWizardDictation = () => {
    wizardDictationSessionRef.current?.stop();
  };

  function hasMeaningfulVersionSeed(v: ProcessVersion): boolean {
    const e2e = v.endToEndDefinition;
    const draft = v.sidecar.captureDraft;
    return !!(
      e2e?.trigger?.trim() ||
      e2e?.customer?.trim() ||
      e2e?.outcome?.trim() ||
      e2e?.doneCriteria?.trim() ||
      (draft?.happyPath?.length ?? 0) > 0 ||
      v.sidecar.roles.length > 0 ||
      v.sidecar.systems.length > 0 ||
      v.sidecar.dataObjects.length > 0 ||
      (draft?.decisions?.length ?? 0) > 0 ||
      (draft?.exceptions?.length ?? 0) > 0
    );
  }

  const handleImportAiResponse = async () => {
    if (!process || !version) {
      setStatusMessage('Bitte erst Prozess und Version laden (Arbeitsbereich)');
      return;
    }

    if (!aiResponseJson.trim()) {
      setStatusMessage('Bitte Claude-Antwort (JSON) eingeben');
      return;
    }

    setAiImporting(true);
    setAiImportWarnings([]);
    setAiImportSuccess(false);

    try {
      const localWarnings: string[] = [];

      const defaultLabels = {
        artifact: 'AI: Artefakt',
        case: 'AI: Einzelfall',
        cases: 'AI: Mehrere Fälle',
      };
      const evidenceRefId = aiEvidenceSourceLabel.trim() || defaultLabels[aiCaptureMode];

      let evidenceSourceText = aiRawText;
      if (aiTranslatedText.trim()) {
        evidenceSourceText = `ORIGINAL:\n${aiRawText}\n\nÜBERSETZUNG:\n${aiTranslatedText}`;
      }

      const maxEvidenceLength = 250000;
      if (evidenceSourceText.length > maxEvidenceLength) {
        evidenceSourceText = evidenceSourceText.slice(0, maxEvidenceLength);
        localWarnings.push(`Quelltext wurde auf ${maxEvidenceLength} Zeichen gekürzt.`);
      }

      const hasSeed = version ? hasMeaningfulVersionSeed(version) : false;

      const result = importAiCaptureToNewVersion(process, version, aiResponseJson, {
        mergeIntoExistingSidecar: true,
        defaultEvidenceRefId: evidenceRefId,
        evidenceSource: {
          refId: evidenceRefId,
          kind: 'ai_input',
          language: 'de',
          text: evidenceSourceText,
        },
        additionalWarnings: localWarnings,
        mergeStrategy: hasSeed ? 'enrich_existing' : 'replace_all',
      });

      const newVersion = await createVersion(process.processId, result.versionInput);

      setVersion(newVersion);
      setAiImportSuccess(true);
      await refreshVersions(process.processId);
      setAiImportWarnings(result.warnings);
      setStatusMessage('KI-Import abgeschlossen: neue Version erstellt');
    } catch (error) {
      setStatusMessage(
        `Import fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannt'}`
      );
    } finally {
      setAiImporting(false);
    }
  };

  const renderContextMetaEditor = (_opts?: { variant?: 'assisted' | 'setup' }) => {
    void _opts;
    const hasProcess = !!process;
    const hasVersion = !!version;

    if (!hasProcess) {
      return (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center">
          <p className="text-slate-600">Bitte zuerst einen Prozess auswählen oder erstellen.</p>
        </div>
      );
    }

    return (
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Prozess-Metadaten</h3>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input
              type="text"
              value={metaProcessTitle}
              onChange={(e) => setMetaProcessTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Prozessname"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Kurzbeschreibung</label>
            <textarea
              value={metaProcessDescription}
              onChange={(e) => setMetaProcessDescription(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Kurze Beschreibung des Prozesses"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Bearbeiter:innen (kommagetrennt)</label>
            <input
              type="text"
              value={metaEditorsCsv}
              onChange={(e) => setMetaEditorsCsv(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="z.B. Max Mustermann, Erika Musterfrau"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tags (optional)</label>
            <input
              type="text"
              value={metaTagsCsv}
              onChange={(e) => setMetaTagsCsv(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="z.B. Einkauf, Rechnungen, Compliance"
            />
          </div>

          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="text-sm font-semibold text-slate-800">RACI (optional)</div>
              <InfoPopover title="RACI" ariaLabel="RACI Info">
                <p className="text-sm">
                  Responsible = führt aus, Accountable = verantwortet, Consulted = wird konsultiert, Informed = wird informiert.
                </p>
              </InfoPopover>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                value={metaRaciR}
                onChange={(e) => setMetaRaciR(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="Responsible (kommagetrennt)"
              />
              <input
                type="text"
                value={metaRaciA}
                onChange={(e) => setMetaRaciA(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="Accountable (kommagetrennt)"
              />
              <input
                type="text"
                value={metaRaciC}
                onChange={(e) => setMetaRaciC(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="Consulted (kommagetrennt)"
              />
              <input
                type="text"
                value={metaRaciI}
                onChange={(e) => setMetaRaciI(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="Informed (kommagetrennt)"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleSaveContextMeta}
              disabled={metaSaving}
              className="w-full px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {metaSaving ? 'Speichere…' : 'Metadaten speichern'}
            </button>
          </div>
        </div>

        {hasVersion ? (
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Version & Freigabe</h3>

            <div className="text-sm text-slate-600 space-y-1">
              <div><span className="font-medium text-slate-700">Version-ID:</span> {version.versionId.slice(0,8)}… (automatisch)</div>
              <div><span className="font-medium text-slate-700">Erstellt am:</span> {new Date(version.createdAt).toLocaleString('de-DE')}</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Version-Label (optional)</label>
              <input
                type="text"
                value={metaVersionLabel}
                onChange={(e) => setMetaVersionLabel(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="z.B. v1.0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={metaVersionStatus}
                onChange={(e) => setMetaVersionStatus(e.target.value as 'draft' | 'in_review' | 'published')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="draft">Entwurf</option>
                <option value="in_review">In Review</option>
                <option value="published">Freigegeben</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Hinweis: Beim Setzen auf „Freigegeben" wird das Freigabedatum automatisch gesetzt (falls noch leer).
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Freigegeben von (optional)</label>
              <input
                type="text"
                value={metaApprovedBy}
                onChange={(e) => setMetaApprovedBy(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Name / Rolle"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Freigabe-Notiz (optional)</label>
              <textarea
                value={metaApprovalNotes}
                onChange={(e) => setMetaApprovalNotes(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Notizen zur Freigabe"
              />
            </div>

            {version.approval?.approvedAt && (
              <div className="text-xs text-slate-600">
                <span className="font-medium text-slate-700">Freigabedatum:</span> {new Date(version.approval.approvedAt).toLocaleString('de-DE')}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Version & Freigabe</h3>
            <p className="text-sm text-slate-600">
              Aktuell ist keine Version geladen. Erstellen Sie im Arbeitsbereich unter „Schritt 3: Version" eine Version oder laden Sie eine vorhandene.
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderVersionInfoHeader = () => {
    if (!version) return null;
    return (
      <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 mb-6 text-sm text-slate-700">
        <span className="font-medium">Aktive Version:</span> {version.versionId.slice(0, 8)}...
        {' · '}
        <span className="font-medium">Erstellt am:</span> {new Date(version.createdAt).toLocaleString('de-DE')}
        {' · '}
        <span className="font-medium">Status:</span> {version.status}
      </div>
    );
  };

  function goToTabAndScroll(tab: 'draft' | 'improvements', elementId: string) {
    setActiveTab(tab);
    setPendingScrollId(elementId);
    setGlobalSearchOpen(false);
  }

  function renderAssistedMode() {
    return (
      <>
        <div className="mb-8">
          <Stepper
            steps={ASSISTED_STEPS}
            activeId={assistedStep}
            onSelect={(id) => setAssistedStep(id as AssistedStepId)}
          />
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-200 shadow-sm p-8">
            {assistedStep === 'context' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900 mb-2">Arbeitsbereich vorbereiten</h2>
                  <p className="text-slate-600">
                    Wählen Sie ein bestehendes Projekt und einen Prozess aus oder lassen Sie automatisch neue erstellen.
                  </p>
                </div>

                <div className="flex items-center gap-2 border-b border-slate-200">
                  <button
                    type="button"
                    onClick={() => setContextSubTab('select')}
                    className={[
                      'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                      contextSubTab === 'select'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                    ].join(' ')}
                  >
                    Auswahl
                  </button>
                  <button
                    type="button"
                    onClick={() => setContextSubTab('meta')}
                    disabled={!process}
                    className={[
                      'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                      contextSubTab === 'meta'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300',
                      (!process) ? 'opacity-50 cursor-not-allowed' : ''
                    ].join(' ')}
                    title={!process ? 'Bitte zuerst einen Prozess auswählen oder erstellen' : (process && !version ? 'Prozess-Metadaten verfügbar, Versionsdaten erst nach Erstellung/Laden' : 'Metadaten bearbeiten')}
                  >
                    Metadaten
                  </button>
                </div>

                {contextSubTab === 'select' && (
                  <div className="space-y-6">
                    {process && version ? (
                      <>
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-semibold">
                              ✓
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold text-green-900 mb-1">Arbeitsbereich bereit</h3>
                              <p className="text-sm text-green-800">
                                <strong>Prozess:</strong> {process.title}
                              </p>
                              <p className="text-sm text-green-700">
                                Version erstellt am {new Date(version.createdAt).toLocaleDateString('de-DE')}
                              </p>
                              <p className="text-xs text-green-600 mt-2">
                                Metadaten können Sie im Tab „Metadaten" ergänzen.
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <label className="block text-sm font-medium text-slate-700">
                                Projekt
                              </label>
                              <InfoPopover title="Warum ein Projekt?" ariaLabel="Projekt Info">
                                <p className="text-sm">
                                  Projekte organisieren mehrere Prozesse. Wenn Sie mehrere Prozesse erfassen möchten, können diese einem gemeinsamen Projekt zugeordnet werden.
                                </p>
                              </InfoPopover>
                            </div>
                            {projects.length > 0 && (
                              <select
                                value={projectId || ''}
                                onChange={(e) => setProjectId(e.target.value || null)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
                                disabled={preparingContext}
                              >
                                <option value="">-- Neues Projekt erstellen --</option>
                                {projects.map((p) => (
                                  <option key={p.projectId} value={p.projectId}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            {!projectId && (
                              <input
                                type="text"
                                placeholder="Projektname (optional)"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                disabled={preparingContext}
                              />
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <label className="block text-sm font-medium text-slate-700">
                                Prozess
                              </label>
                              <InfoPopover title="Warum ein Prozess?" ariaLabel="Prozess Info">
                                <p className="text-sm">
                                  Ein Prozess beschreibt einen Ablauf in Ihrem Unternehmen. Sie können einen bestehenden Prozess auswählen oder einen neuen anlegen.
                                </p>
                              </InfoPopover>
                            </div>
                            {projectId && projectProcesses.length > 0 && (
                              <select
                                value={processId || ''}
                                onChange={(e) => {
                                  const id = e.target.value || null;
                                  setProcessId(id);
                                  if (id) {
                                    const proc = projectProcesses.find(p => p.processId === id);
                                    if (proc) setProcess(proc);
                                  }
                                }}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
                                disabled={preparingContext}
                              >
                                <option value="">-- Neuen Prozess erstellen --</option>
                                {projectProcesses.map((p) => (
                                  <option key={p.processId} value={p.processId}>
                                    {p.title}
                                  </option>
                                ))}
                              </select>
                            )}
                            {!processId && (
                              <input
                                type="text"
                                placeholder="Prozessname (optional)"
                                value={processTitle}
                                onChange={(e) => setProcessTitle(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                disabled={preparingContext}
                              />
                            )}
                          </div>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <p className="text-sm text-blue-800">
                            Wenn Sie nichts eingeben, wird automatisch ein Projekt und Prozess mit dem aktuellen Datum erstellt.
                          </p>
                        </div>
                      </>
                    )}

                    <div className="flex items-center justify-end">
                      {!process || !version ? (
                        <button
                          onClick={ensureContextReady}
                          disabled={preparingContext}
                          className="px-6 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {preparingContext ? 'Bereite vor...' : 'Arbeitsbereich vorbereiten'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}

                {contextSubTab === 'meta' && renderContextMetaEditor({ variant: 'assisted' })}
              </div>
            )}

            {assistedStep === 'setup' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900 mb-2">Setup</h2>
                  <p className="text-slate-600">
                    Konfigurieren Sie Spracheingabe, Übersetzung und KI (Copy/Paste oder API).
                  </p>
                </div>

                <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-200 shadow-sm p-6">
                  <SpeechAndTranslationSettingsCard settings={settings} onChange={setSettings} />
                </div>

                <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-200 shadow-sm p-6">
                  <AiApiSettingsCard settings={settings} onChange={setSettings} />
                </div>

                <div className="flex justify-between">
                  <button
                    onClick={() => setAssistedStep('context')}
                    className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
                  >
                    Zurück
                  </button>
                  <button
                    onClick={() => setAssistedStep('describe')}
                    className="px-6 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium"
                  >
                    Weiter: Beschreiben
                  </button>
                </div>
              </div>
            )}

            {assistedStep === 'describe' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900 mb-2">Prozess beschreiben</h2>
                  <p className="text-slate-600">
                    Beschreiben Sie den Prozess per Sprache, Dokumenten-Upload oder direkt als Text.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-200 shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="text-lg font-semibold text-slate-900">Spracheingabe</h3>
                      <InfoPopover title="Wofür ist das?" ariaLabel="Spracheingabe Info">
                        <p className="text-sm">
                          Nutzen Sie die Browser-Spracherkennung, um Ihre Prozessbeschreibung bequem zu diktieren.
                        </p>
                      </InfoPopover>
                    </div>

                    {!canUseAiDictation && needsAiDictationSetup && isWebSpeechSupported() && (
                      <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <p className="text-sm text-amber-900 mb-3">
                          Spracheingabe ist noch nicht aktiviert. Möchten Sie die Browser-Spracherkennung nutzen?
                        </p>
                        <button
                          onClick={() => {
                            setSettings({
                              ...settings,
                              dataHandlingMode: 'external',
                              transcription: {
                                ...settings.transcription,
                                providerId: 'web_speech',
                              },
                            });
                            setStatusMessage('Spracheingabe aktiviert');
                          }}
                          className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium"
                        >
                          Spracheingabe aktivieren
                        </button>
                      </div>
                    )}

                    {!isWebSpeechSupported() && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                        <p className="text-sm text-slate-600">
                          Ihr Browser unterstützt die Web Speech API nicht. Bitte verwenden Sie Chrome, Edge oder Safari.
                        </p>
                      </div>
                    )}

                    {canUseAiDictation && (
                      <div className="space-y-3">
                        {!aiDictationActive ? (
                          <button
                            onClick={handleStartAiDictation}
                            className="w-full px-4 py-3 bg-cyan-600 text-white rounded-xl hover:bg-cyan-700 transition-colors font-medium flex items-center justify-center gap-2"
                          >
                            <Mic className="w-5 h-5" />
                            Diktat starten
                          </button>
                        ) : (
                          <button
                            onClick={handleStopAiDictation}
                            className="w-full px-4 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium flex items-center justify-center gap-2"
                          >
                            <Square className="w-5 h-5" />
                            Diktat beenden
                          </button>
                        )}

                        <div className="text-xs text-slate-500 text-center">
                          Sprache: {settings.transcription.language === 'de-DE' ? 'Deutsch' : settings.transcription.language}
                        </div>

                        {aiDictationActive && aiDictationInterim && (
                          <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-3">
                            <div className="text-xs font-medium text-cyan-900 mb-1">Live:</div>
                            <div className="text-sm text-cyan-800">{aiDictationInterim}</div>
                          </div>
                        )}

                        {aiDictationError && (
                          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                            <p className="text-sm text-red-800">{aiDictationError}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-200 shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="text-lg font-semibold text-slate-900">Dokumente hochladen</h3>
                      <InfoPopover title="Wofür ist das?" ariaLabel="Upload Info">
                        <p className="text-sm">
                          Laden Sie bestehende Dokumentation hoch. Unterstützt werden Text-, PDF-, Word-, HTML- und CSV-Dateien.
                        </p>
                      </InfoPopover>
                    </div>

                    <button
                      onClick={() => aiFileInputRef.current?.click()}
                      disabled={aiDictationActive}
                      className="w-full px-4 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Upload className="w-5 h-5" />
                      Datei auswählen
                    </button>

                    <input
                      ref={aiFileInputRef}
                      type="file"
                      accept=".txt,.md,.csv,.json,.log,.pdf,.docx,.html,.htm,.zip,text/*,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html,application/zip,application/x-zip-compressed"
                      onChange={handleAiFileSelect}
                      onClick={(e) => { (e.currentTarget as HTMLInputElement).value = ''; }}
                      className="hidden"
                    />

                    <div className="mt-3 text-xs text-slate-500 space-y-1">
                      <div>Unterstützte Formate:</div>
                      <div>Text, PDF, Word, HTML, CSV, ZIP</div>
                    </div>

                    {aiFileError && (
                      <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3">
                        <p className="text-sm text-red-800">{aiFileError}</p>
                      </div>
                    )}

                    {aiFilePending && (
                      <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                        <div className="text-sm text-slate-700">
                          <strong>Datei:</strong> {aiFilePending.name}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleAiApplyFileReplace}
                            className="flex-1 px-3 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors text-sm font-medium"
                          >
                            Ersetzen
                          </button>
                          <button
                            onClick={handleAiApplyFileAppend}
                            className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                          >
                            Anhängen
                          </button>
                          <button
                            onClick={handleAiCancelFilePending}
                            className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors text-sm font-medium"
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-lg font-semibold text-slate-900">Prozessbeschreibung</h3>
                    <InfoPopover title="Wofür ist das?" ariaLabel="Text Info">
                      <p className="text-sm">
                        Hier erscheint Ihre Prozessbeschreibung aus Spracheingabe oder Datei-Upload. Sie können den Text auch direkt bearbeiten oder einfügen.
                      </p>
                    </InfoPopover>
                  </div>

                  <textarea
                    value={aiRawText}
                    onChange={(e) => setAiRawText(e.target.value)}
                    placeholder="Beschreiben Sie Ihren Prozess hier oder nutzen Sie Spracheingabe/Upload..."
                    className="w-full h-48 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
                  />

                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={() => setAiRawText('')}
                      className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
                    >
                      Leeren
                    </button>
                    <div className="text-xs text-slate-500">
                      {aiRawText.length} Zeichen
                    </div>
                  </div>

                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-slate-700 hover:text-slate-900">
                      Optional: Übersetzung hinzufügen
                    </summary>
                    <div className="mt-3">
                      <textarea
                        value={aiTranslatedText}
                        onChange={(e) => setAiTranslatedText(e.target.value)}
                        placeholder="Übersetzte Version (optional)..."
                        className="w-full h-32 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
                      />
                    </div>
                  </details>
                </div>

                <div className="flex justify-between">
                  <button
                    onClick={() => setAssistedStep('context')}
                    className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
                  >
                    Zurück
                  </button>
                  <button
                    onClick={() => setAssistedStep('prompt')}
                    disabled={!aiRawText.trim()}
                    className="px-6 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Weiter zur Erfassung
                  </button>
                </div>
              </div>
            )}

            {assistedStep === 'prompt' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900 mb-2">Erfassen & KI ergänzen</h2>
                  <p className="text-slate-600">
                    Erfassen Sie den Prozess vorab in der App, generieren Sie dann einen KI-Prompt und übernehmen Sie die KI-Antwort direkt in diesem Schritt.
                  </p>
                </div>

                <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold shrink-0">A</span>
                    <h3 className="text-lg font-semibold text-slate-900">Vorerfassung in der App</h3>
                    <InfoPopover title="Wofür ist das?" ariaLabel="Vorerfassung Info">
                      <p className="text-sm">
                        Tragen Sie die wichtigsten Prozessinformationen vorab ein. Diese Daten werden beim Prompt-Generieren als Seed an die KI übergeben – die KI ergänzt, ohne Ihre manuelle Erfassung zu überschreiben.
                      </p>
                    </InfoPopover>
                  </div>

                  {process && version ? (
                    <AssistedSeedCapturePanel
                      process={process}
                      version={version}
                      onSaved={(updated) => setVersion(updated)}
                    />
                  ) : (
                    <div className="text-sm text-amber-600 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Bitte erst im Schritt „Kontext" einen Prozess und eine Version vorbereiten.
                    </div>
                  )}
                </div>

                <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold shrink-0">B</span>
                    <h3 className="text-lg font-semibold text-slate-900">KI-Prompt generieren</h3>
                    <InfoPopover title="Wofür ist das?" ariaLabel="Prompt Info">
                      <p className="text-sm">
                        Generiert einen optimierten Prompt für Claude. Die Vorerfassung aus Abschnitt A wird als Seed eingebettet.
                      </p>
                    </InfoPopover>
                  </div>

                  {!aiGeneratedPrompt ? (
                    <button
                      onClick={handleGenerateAiPrompt}
                      disabled={!aiRawText.trim()}
                      className="px-6 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Prompt generieren
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <p className="text-sm text-slate-700 mb-2">
                          <strong>Prompt generiert!</strong> Kopieren Sie ihn und fügen Sie ihn in Claude ein.
                        </p>
                        <textarea
                          readOnly
                          value={aiGeneratedPrompt}
                          className="w-full h-48 px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs bg-white resize-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleCopyPrompt}
                          className="flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-medium flex items-center justify-center gap-2"
                        >
                          <Copy className="w-4 h-4" />
                          Kopieren
                        </button>
                        <button
                          onClick={() => setAiGeneratedPrompt('')}
                          className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors font-medium"
                        >
                          Neu generieren
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold shrink-0">C</span>
                    <h3 className="text-lg font-semibold text-slate-900">KI-Antwort einfügen und übernehmen</h3>
                    <InfoPopover title="Wofür ist das?" ariaLabel="Antwort Info">
                      <p className="text-sm">
                        Fügen Sie die JSON-Antwort von Claude ein und übernehmen Sie sie direkt. Eine neue Version wird erstellt – Ihre Vorerfassung bleibt führend.
                      </p>
                    </InfoPopover>
                  </div>

                  <textarea
                    value={aiResponseJson}
                    onChange={(e) => setAiResponseJson(e.target.value)}
                    placeholder='KI-Antwort (JSON) hier einfügen…'
                    className="w-full h-40 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none font-mono text-sm"
                  />

                  {settings.dataHandlingMode === 'external' &&
                   settings.ai.mode === 'api' &&
                   settings.ai.api.endpointUrl.trim() && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <label className="flex items-start gap-2 mb-3">
                        <input
                          type="checkbox"
                          checked={aiApiConsent}
                          onChange={(e) => setAiApiConsent(e.target.checked)}
                          className="mt-1"
                        />
                        <span className="text-xs text-slate-600">
                          Ich verstehe, dass der Prompt an einen externen Dienst gesendet wird.
                        </span>
                      </label>
                      <button
                        onClick={handleRunAiExtractionViaApi}
                        disabled={!aiApiConsent || !aiRawText.trim() || aiApiRunning}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {aiApiRunning ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Sende...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            Per API senden
                          </>
                        )}
                      </button>
                      {aiApiError && (
                        <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3">
                          <p className="text-sm font-medium text-red-900">API Fehler:</p>
                          <p className="text-sm text-red-700 mt-1">{aiApiError}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {settings.dataHandlingMode !== 'external' && (
                    <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="text-xs text-amber-900 mb-2">
                        API-Integration ist im lokalen Modus nicht verfügbar.
                      </p>
                      <button
                        onClick={() => setAssistedStep('setup')}
                        className="text-xs text-amber-700 hover:text-amber-900 underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Setup öffnen
                      </button>
                    </div>
                  )}

                  <div className="mt-4">
                    <button
                      onClick={handleImportAiResponse}
                      disabled={aiImporting || !aiResponseJson.trim() || !process || !version}
                      className="w-full px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {aiImporting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Übernehme...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          KI-Ergebnis übernehmen
                        </>
                      )}
                    </button>

                    {(!process || !version) && (
                      <div className="mt-3 text-sm text-amber-600 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Bitte erst Prozess und Version im Schritt „Kontext" vorbereiten.
                      </div>
                    )}
                  </div>

                  {aiImportWarnings.length > 0 && (
                    <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                      <h3 className="font-medium text-yellow-900 mb-2 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Übernahme-Hinweise
                      </h3>
                      <ul className="space-y-1 text-sm text-yellow-800">
                        {aiImportWarnings.map((warning, idx) => (
                          <li key={idx}>• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {aiImportSuccess && version?.sidecar.captureDraft?.happyPath && version.sidecar.captureDraft.happyPath.length > 0 && (
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-200 shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <h3 className="text-lg font-semibold text-slate-900">Entwurf bereit</h3>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="bg-white/80 backdrop-blur rounded-xl p-4 border border-green-100">
                        <div className="text-2xl font-bold text-green-700">
                          {version.sidecar.captureDraft.happyPath.length}
                        </div>
                        <div className="text-xs text-slate-600 mt-1">Prozessschritte</div>
                      </div>
                      <div className="bg-white/80 backdrop-blur rounded-xl p-4 border border-green-100">
                        <div className="text-2xl font-bold text-green-700">
                          {version.sidecar.roles?.length || 0}
                        </div>
                        <div className="text-xs text-slate-600 mt-1">Rollen</div>
                      </div>
                      <div className="bg-white/80 backdrop-blur rounded-xl p-4 border border-green-100">
                        <div className="text-2xl font-bold text-green-700">
                          {version.sidecar.systems?.length || 0}
                        </div>
                        <div className="text-xs text-slate-600 mt-1">IT-Systeme</div>
                      </div>
                      <div className="bg-white/80 backdrop-blur rounded-xl p-4 border border-green-100">
                        <div className="text-2xl font-bold text-green-700">
                          {version.sidecar.dataObjects?.length || 0}
                        </div>
                        <div className="text-xs text-slate-600 mt-1">Datenobjekte</div>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={handleOpenBpmnPreview}
                        disabled={generatingBpmn}
                        className="px-4 py-2 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <Eye className="w-4 h-4" />
                        BPMN Vorschau
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSettings({ ...settings, uiMode: 'expert' }); setActiveTab('draft'); }}
                        className="px-4 py-2 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <FileEdit className="w-4 h-4" />
                        Entwurf ansehen
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssistedStep('analyze')}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Weiter: Analysieren
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex justify-between">
                  <button
                    onClick={() => setAssistedStep('describe')}
                    className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
                  >
                    Zurück
                  </button>
                  <button
                    onClick={() => setAssistedStep('analyze')}
                    className="px-6 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium"
                  >
                    Weiter: Analysieren
                  </button>
                </div>
              </div>
            )}

            {assistedStep === 'analyze' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900 mb-2">Analysieren (Process Mining)</h2>
                  <p className="text-slate-600">
                    Geführte Analyse für Laienanwender. Der Expertenmodus bleibt unverändert. Ergebnisse werden später gezielt übernommen.
                  </p>
                </div>

                {!process || !version ? (
                  <div className="bg-white border border-slate-200 rounded-lg p-6 text-sm text-slate-700">
                    Bitte zuerst im Schritt „Kontext" einen Prozess und eine Version vorbereiten.
                  </div>
                ) : (
                  <ErrorBoundary
                    title="Assistiertes Process Mining"
                    hint="Ein unerwarteter Fehler ist aufgetreten. Bitte neu laden. Ihre Daten sind gespeichert, sobald Sie zuvor 'Übernehmen' geklickt haben."
                  >
                    <AssistedProcessMiningPanel
                      key={version.id}
                      process={process}
                      version={version}
                      settings={settings}
                      onSave={handleSaveDraftChanges}
                    />
                  </ErrorBoundary>
                )}

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setAssistedStep('prompt')}
                    className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
                  >
                    Zurück
                  </button>

                  <button
                    type="button"
                    onClick={() => setAssistedStep('optimize')}
                    className="px-6 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium"
                  >
                    Weiter: Optimieren
                  </button>
                </div>
              </div>
            )}

            {assistedStep === 'optimize' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900 mb-2">Prozess optimieren</h2>
                  <p className="text-slate-600">
                    Identifizieren Sie Verbesserungspotenziale und dokumentieren Sie Maßnahmen zur Prozessoptimierung.
                  </p>
                </div>

                {process && version && (
                  <AssistedOptimizationCoach
                    process={process}
                    version={version}
                    settings={settings}
                    onSave={handleSaveDraftChanges}
                  />
                )}

                <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                    <h3 className="text-lg font-semibold text-slate-900">KI-gestützte Optimierung</h3>
                    <InfoPopover title="Wie funktioniert das?" ariaLabel="KI-Optimierung Info">
                      <div className="text-sm space-y-2">
                        <p>
                          Die KI analysiert Ihren Prozess und schlägt konkrete Verbesserungsmaßnahmen vor.
                        </p>
                        <p className="font-medium">Zwei Wege:</p>
                        <ul className="list-disc list-inside space-y-1 pl-2">
                          <li><span className="font-medium">Copy/Paste:</span> Prompt kopieren und in Claude einfügen</li>
                          <li><span className="font-medium">API:</span> Direkt automatisch, wenn API konfiguriert</li>
                        </ul>
                      </div>
                    </InfoPopover>
                  </div>
                  <p className="text-sm text-slate-700">
                    Nutzen Sie unten den KI‑Block, um aus Ihrer Beschreibung konkrete Maßnahmen zu erzeugen. Im Expertenmodus können Sie alle Maßnahmen später detailliert weiterbearbeiten.
                  </p>
                </div>

                {process && version && (
                  <AssistedOptimizationAiMeasures
                    process={process}
                    version={version}
                    settings={settings}
                    onSave={handleSaveDraftChanges}
                  />
                )}

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-sm font-medium text-slate-700 mb-3">Weitere Aktionen:</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setSettings({ ...settings, uiMode: 'expert' });
                        setActiveTab('improvements');
                      }}
                      className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium flex items-center gap-2"
                    >
                      <TrendingUp className="w-4 h-4" />
                      Maßnahmenliste im Expertenmodus
                    </button>
                    <button
                      onClick={() => {
                        setSettings({ ...settings, uiMode: 'expert' });
                        setActiveTab('report');
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      Report erstellen
                    </button>
                  </div>
                </div>

                <div className="flex justify-between">
                  <button
                    onClick={() => setAssistedStep('analyze')}
                    className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
                  >
                    Zurück
                  </button>
                  <button
                    onClick={() => {
                      setSettings({ ...settings, uiMode: 'expert' });
                      setActiveTab('report');
                    }}
                    className="px-6 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium"
                  >
                    Abschließen: Report
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  const isExpertMode = settings.uiMode === 'expert';

  return (
    <div className="min-h-screen bg-slate-50 print-container">
      <div className={activeTab === 'workshop' ? 'w-full' : 'max-w-6xl mx-auto'}>
        <div className={activeTab === 'workshop' ? 'px-4 lg:px-6 pt-6' : 'p-6'}>
          <div className="mb-6 no-print">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">
                  {isExpertMode ? 'Wizard Playground' : 'Prozesserfassung'}
                </h1>
                <p className="text-slate-600">
                  {isExpertMode
                    ? 'Geführte Prozesserfassung ohne BPMN-Kenntnisse'
                    : 'Schritt für Schritt zum optimierten Prozess'
                  }
                </p>
              </div>
              <div className="flex items-center gap-3">
                <ModeToggle
                  value={settings.uiMode}
                  onChange={(mode) => setSettings({ ...settings, uiMode: mode })}
                />
              </div>
            </div>
          </div>

          {isExpertMode ? (
            <div className="mb-6 no-print">
              <div className="bg-white/70 backdrop-blur-sm border-b border-slate-200">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider px-2">
                      Kernworkflow
                    </span>
                    <InfoPopover
                      title="Kernworkflow"
                      ariaLabel="Kernworkflow Info"
                    >
                      <p>
                        Hauptprozess der Prozesserfassung: Arbeitsbereich, geführte Erfassung (Wizard), Entwurfsbearbeitung, Review, offene Punkte, Verbesserungsmaßnahmen und Report-Generierung.
                      </p>
                    </InfoPopover>
                  </div>

                  <button
                    onClick={() => setGlobalSearchOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                  >
                    <Search className="w-4 h-4" />
                    Suche
                    <span className="text-xs text-slate-500">(Ctrl+K)</span>
                  </button>
                </div>

                <div className="flex gap-1 px-2 pb-0 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' as const }}>
                  {TAB_CONFIG.filter(tab => tab.group === 'core').map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-shrink-0 px-4 py-2.5 font-medium transition-all text-sm ${
                        activeTab === tab.id
                          ? 'text-cyan-800 border-b-2 border-emerald-500 bg-white/60 backdrop-blur-sm rounded-t-lg'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="border-t border-slate-100 mt-1">
                  <div className="flex items-center gap-2 px-2 pt-2">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider px-2">
                      Werkzeuge
                    </span>
                    <InfoPopover
                      title="Werkzeuge"
                      ariaLabel="Werkzeuge Info"
                    >
                      <p>
                        Zusätzliche Funktionen: Setup (Einstellungen), Import/Export (Transfer/Backup), KI-gestützte Analyse, Process Mining, Versionsvergleich und Workshop-Modus für Live-Sessions.
                      </p>
                    </InfoPopover>
                  </div>

                  <div className="flex gap-1 px-2 pb-2 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' as const }}>
                    {TAB_CONFIG.filter(tab => tab.group === 'tools').map((tab) => {
                      const getActiveColor = () => {
                        switch (tab.id) {
                          case 'settings':
                            return 'text-white bg-gradient-to-r from-slate-700 to-slate-900 shadow-sm';
                          case 'transfer':
                            return 'text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 shadow-sm';
                          case 'ai':
                            return 'text-white bg-gradient-to-r from-blue-600 to-cyan-600 shadow-sm';
                          case 'mining':
                            return 'text-white bg-gradient-to-r from-cyan-600 to-teal-600 shadow-sm';
                          case 'changes':
                            return 'text-white bg-gradient-to-r from-teal-600 to-emerald-600 shadow-sm';
                          case 'workshop':
                            return 'text-white bg-gradient-to-r from-emerald-600 to-green-600 shadow-sm';
                          default:
                            return 'text-white bg-gradient-to-r from-cyan-600 to-emerald-600 shadow-sm';
                        }
                      };

                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex-shrink-0 px-3 py-2 font-medium transition-all text-sm rounded-md ${
                            activeTab === tab.id
                              ? getActiveColor()
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  {activeTab === 'wizard' && version && (
                    <div className="px-2 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-2">
                          Wizard
                        </span>
                        <span className="text-xs text-slate-400">
                          Phase wählen
                        </span>
                        <span className="ml-auto text-xs text-slate-500 px-2">
                          Aktuell: {wizardCurrentPhase ? phaseLabels[wizardCurrentPhase as CapturePhase] : 'Abgeschlossen'}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 px-2">
                        {wizardPhases.map((phase) => {
                          const state = version.captureProgress.phaseStates[phase];
                          const active = wizardShownPhase === phase;
                          const isCurrent = wizardCurrentPhase === phase;

                          const base =
                            'inline-flex items-center gap-2 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all';

                          const color =
                            state === 'not_started'
                              ? 'bg-gradient-to-r from-blue-300 to-sky-100 text-blue-950 border-blue-200 hover:from-blue-200 hover:to-sky-50'
                              : state === 'in_progress'
                              ? 'bg-blue-800 text-white border-blue-900/30 hover:bg-blue-700'
                              : 'bg-blue-900 text-white border-blue-900 hover:bg-blue-800';

                          const ring = active ? 'ring-2 ring-sky-300 ring-offset-2 ring-offset-white' : '';

                          return (
                            <button
                              key={phase}
                              type="button"
                              onClick={() => {
                                setWizardActivePhase(phase);
                                setAnswers({});
                                setErrors({});
                                window.requestAnimationFrame(() => {
                                  wizardPhaseAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                });
                              }}
                              className={[base, color, ring].join(' ')}
                              title={`${phaseLabels[phase]} (${state})`}
                            >
                              {state === 'done' ? (
                                <CheckCircle2 className="w-4 h-4 opacity-90" />
                              ) : state === 'in_progress' ? (
                                <FileEdit className="w-4 h-4 opacity-90" />
                              ) : (
                                <span className="w-4 h-4" />
                              )}

                              {isCurrent ? (
                                <span
                                  className={[
                                    'w-2 h-2 rounded-full',
                                    state === 'not_started' ? 'bg-blue-700' : 'bg-sky-200',
                                  ].join(' ')}
                                  title="Aktuelle Phase"
                                />
                              ) : null}

                              {phaseLabels[phase]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeTab === 'mining' && version && (
                    <div className="px-2 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-2">
                          Mining
                        </span>
                        <span className="text-xs text-slate-400">
                          Bereich auswählen
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1">
                        {(() => {
                          const miningEnabled = !!version.sidecar.processMining;

                          const guidedItem = { id: 'guided' as MiningWorkspaceView, label: 'Geführt', Icon: Sparkles } as const;

                          const coreItems = [
                            { id: 'data' as MiningWorkspaceView, label: 'Daten', Icon: FileText },
                            { id: 'preprocessing' as MiningWorkspaceView, label: 'Aufbereitung', Icon: RefreshCw },
                            { id: 'mapping' as MiningWorkspaceView, label: 'Mapping', Icon: ArrowDownUp },
                            { id: 'discovery' as MiningWorkspaceView, label: 'Discovery', Icon: Search },
                            { id: 'conformance' as MiningWorkspaceView, label: 'Conformance', Icon: Check },
                            { id: 'performance' as MiningWorkspaceView, label: 'Performance', Icon: Info },
                            { id: 'export' as MiningWorkspaceView, label: 'Export', Icon: Download },
                          ] as const;

                          const advancedItems = [
                            { id: 'cases' as MiningWorkspaceView, label: 'Cases', Icon: FileText },
                            { id: 'organisation' as MiningWorkspaceView, label: 'Organisation', Icon: Users },
                            { id: 'rootcause' as MiningWorkspaceView, label: 'Ursachen', Icon: Target },
                            { id: 'drift' as MiningWorkspaceView, label: 'Vergleich', Icon: TrendingUp },
                          ] as const;

                          const isAssisted = settings.uiMode === 'assisted';

                          const renderBtn = ({ id, label, Icon }: typeof coreItems[number] | typeof advancedItems[number] | typeof guidedItem) => {
                            const disabled = !miningEnabled && id !== 'data';
                            const active = miningWorkspaceView === id;

                            return (
                              <button
                                key={id}
                                onClick={() => { if (!disabled) setMiningWorkspaceView(id); }}
                                className={[
                                  'pm-tab',
                                  active ? 'pm-tab-active' : 'pm-tab-inactive',
                                  'inline-flex items-center gap-1.5 whitespace-nowrap',
                                  'px-3 py-1.5 text-xs',
                                  disabled ? 'opacity-40 cursor-not-allowed' : '',
                                ].join(' ')}
                                type="button"
                              >
                                <Icon className="w-4 h-4" />
                                {label}
                              </button>
                            );
                          };

                          return (
                            <>
                              {isAssisted && renderBtn(guidedItem)}
                              {coreItems.map(renderBtn)}

                              {isAssisted ? (
                                <details className="relative">
                                  <summary className="list-none cursor-pointer pm-tab pm-tab-inactive inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-xs">
                                    <MoreVertical className="w-4 h-4" />
                                    Erweitert
                                  </summary>
                                  <div className="absolute left-0 mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-lg p-1 z-50">
                                    {advancedItems.map(({ id, label, Icon }) => {
                                      const disabled = !miningEnabled && id !== 'data';
                                      return (
                                        <button
                                          key={id}
                                          onClick={() => { if (!disabled) setMiningWorkspaceView(id); }}
                                          className={[
                                            'w-full flex items-center gap-2 px-3 py-2 text-sm rounded text-left',
                                            disabled ? 'opacity-40 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-50',
                                          ].join(' ')}
                                          type="button"
                                        >
                                          <Icon className="w-4 h-4" />
                                          {label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </details>
                              ) : (
                                advancedItems.map(renderBtn)
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {statusMessage && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 no-print">
              {statusMessage}
            </div>
          )}
        </div>

        {!isExpertMode ? (
          <div className="p-6 pt-0">
            {renderAssistedMode()}
          </div>
        ) : (
          <>
            {activeTab !== 'workshop' && (
              <div className="p-6 pt-0">

        {activeTab === 'setup' && (
          <div className="space-y-6">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900 mb-1">Hinweis</p>
                  <p className="text-sm text-slate-700">
                    Einstellungen (KI, Übersetzung, Sprache) finden Sie oben unter <span className="font-medium">Werkzeuge → Setup</span>.
                    Export/Import finden Sie unter <span className="font-medium">Werkzeuge → Import/Export</span>.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('settings')}
                    className="px-3 py-2 rounded-md text-sm font-medium bg-slate-900 text-white hover:bg-slate-800"
                  >
                    Setup öffnen
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('transfer')}
                    className="px-3 py-2 rounded-md text-sm font-medium bg-white border border-slate-300 text-slate-800 hover:bg-slate-100"
                  >
                    Import/Export öffnen
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Schritt 1: Projekt</h2>
                <InfoPopover title="Was ist ein Projekt?">
                  <p className="text-sm">
                    Ein Projekt ist der Container für mehrere zusammenhängende Prozesse.
                    Verwenden Sie Projekte, um Ihre Prozesslandschaft zu organisieren (z.B. "Vertrieb 2024", "HR-Prozesse").
                  </p>
                </InfoPopover>
              </div>
              <div className="space-y-4">
                <div>
                  <FieldLabel
                    label="Bestehendes Projekt auswählen"
                    info={{
                      content: <p className="text-sm">Wählen Sie ein bereits angelegtes Projekt aus, um darin neue Prozesse zu erstellen oder bestehende zu bearbeiten.</p>
                    }}
                  />
                  {loadingProjects ? (
                    <div className="text-sm text-slate-500">Lade Projekte...</div>
                  ) : (
                    <select
                      value={projectId ?? ''}
                      onChange={(e) => setProjectId(e.target.value || null)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md"
                    >
                      <option value="">– Projekt auswählen –</option>
                      {projects.map((p) => (
                        <option key={p.projectId} value={p.projectId}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <p className="text-sm font-medium text-slate-700 mb-3">Oder neues Projekt erstellen</p>
                  <div className="space-y-3">
                    <div>
                      <FieldLabel
                        label="Projektname"
                        htmlFor="project-name-input"
                      />
                      <input
                        id="project-name-input"
                        type="text"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md"
                        placeholder="z.B. Vertriebsprozesse 2024"
                      />
                    </div>
                    <button
                      onClick={handleCreateProject}
                      className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800"
                    >
                      Projekt erstellen
                    </button>
                  </div>
                </div>

                {projectId && (
                  <div className="text-sm text-green-600">✓ Projekt ausgewählt: {projects.find(p => p.projectId === projectId)?.name || projectId}</div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Schritt 2: Prozess</h2>
                <InfoPopover title="Prozess anlegen">
                  <p className="text-sm">
                    Erstellen Sie einen neuen Prozess entweder aus einem Template (mit Vorausfüllung) oder manuell.
                    Jeder Prozess kann mehrere Versionen haben.
                  </p>
                </InfoPopover>
              </div>

              <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-md font-medium text-slate-800">Prozess aus Template erstellen (optional)</h3>
                  <InfoPopover title="Templates">
                    <p className="text-sm">
                      Templates enthalten vorbefüllte Prozessschritte und typische Strukturen für häufige Prozesstypen.
                      Spart Zeit bei der Erfassung.
                    </p>
                  </InfoPopover>
                </div>
                <div className="space-y-3">
                  <div>
                    <FieldLabel
                      label="Template auswählen"
                    />
                    <select
                      value={templateId}
                      onChange={(e) => setTemplateId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md"
                    >
                      <option value="">(kein Template - manuelle Erstellung)</option>
                      {PROCESS_TEMPLATES.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {templateId && (() => {
                    const selectedTemplate = getProcessTemplate(templateId);
                    return selectedTemplate ? (
                      <div className="text-sm text-slate-600 p-3 bg-white rounded border border-slate-200">
                        <p className="font-medium mb-1">{selectedTemplate.label}</p>
                        <p className="text-xs mb-2">{selectedTemplate.description}</p>
                        <div className="text-xs space-y-1">
                          <p><span className="font-medium">Kategorie:</span> {selectedTemplate.process.category}</p>
                          <p><span className="font-medium">Management-Ebene:</span> {selectedTemplate.process.managementLevel}</p>
                          <p><span className="font-medium">Hierarchie:</span> {selectedTemplate.process.hierarchyLevel}</p>
                        </div>
                      </div>
                    ) : null;
                  })()}

                  <button
                    onClick={handleCreateProcessFromTemplate}
                    disabled={!projectId || !templateId}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-400"
                  >
                    Aus Template erstellen und Wizard starten
                  </button>
                </div>
              </div>

              <div className="mb-3 text-center text-sm text-slate-500">
                oder manuell erstellen:
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Prozessname
                  </label>
                  <input
                    type="text"
                    value={processTitle}
                    onChange={(e) => setProcessTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                    placeholder="z.B. Auftragsabwicklung"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Kategorie
                    </label>
                    <select
                      value={processCategory}
                      onChange={(e) => setProcessCategory(e.target.value as ProcessCategory)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md"
                    >
                      <option value="steuerung">Steuerung</option>
                      <option value="kern">Kernprozess</option>
                      <option value="unterstuetzung">Unterstützung</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Management-Ebene
                    </label>
                    <select
                      value={processManagementLevel}
                      onChange={(e) => setProcessManagementLevel(e.target.value as ProcessManagementLevel)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md"
                    >
                      <option value="strategisch">Strategisch</option>
                      <option value="fachlich">Fachlich</option>
                      <option value="technisch">Technisch</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Hierarchie
                    </label>
                    <select
                      value={processHierarchyLevel}
                      onChange={(e) => setProcessHierarchyLevel(e.target.value as ProcessHierarchyLevel)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md"
                    >
                      <option value="landkarte">Landkarte</option>
                      <option value="hauptprozess">Hauptprozess</option>
                      <option value="unterprozess">Unterprozess</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleCreateProcess}
                  disabled={!projectId}
                  className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:bg-slate-400"
                >
                  Prozess erstellen
                </button>
                {processId && (
                  <div className="text-sm text-green-600">✓ Prozess-ID: {processId}</div>
                )}
              </div>

              {projectId && projectProcesses.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <h3 className="text-md font-medium text-slate-800 mb-3">Vorhandene Prozesse im Projekt</h3>
                  {loadingProjectProcesses ? (
                    <p className="text-sm text-slate-500">Lade Prozesse...</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-2 px-3 font-medium text-slate-700">Titel</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-700">Kategorie</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-700">Ebene</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-700">Hierarchie</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-700">Aktion</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectProcesses.map((proc) => {
                            const isActive = processId === proc.processId;
                            return (
                              <tr
                                key={proc.processId}
                                className={`border-b border-slate-100 ${
                                  isActive ? 'bg-blue-50' : ''
                                }`}
                              >
                                <td className="py-2 px-3 text-slate-900 font-medium">{proc.title}</td>
                                <td className="py-2 px-3 text-slate-600">{proc.category}</td>
                                <td className="py-2 px-3 text-slate-600">{proc.managementLevel}</td>
                                <td className="py-2 px-3 text-slate-600">{proc.hierarchyLevel}</td>
                                <td className="py-2 px-3">
                                  {isActive ? (
                                    <span className="text-blue-700 font-medium text-xs">
                                      Aktiv
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => handleStartWizardForProcess(proc)}
                                      className="px-3 py-1 bg-slate-600 text-white rounded text-xs hover:bg-slate-700"
                                    >
                                      Öffnen
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Schritt 3: Version</h2>
                <InfoPopover title="Versionen">
                  <p className="text-sm">
                    Jeder Prozess kann mehrere Versionen haben (z.B. "Ist-Zustand", "Soll-Konzept").
                    Versionen ermöglichen Änderungsverfolgung und Vergleiche.
                  </p>
                </InfoPopover>
              </div>

              <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-md font-medium text-slate-800">Neue Version aus Template (optional)</h3>
                  <InfoPopover title="Version aus Template">
                    <p className="text-sm">Erstellt eine neue Version mit vorbefülltem Draft. Der Prozessname und die Klassifikation bleiben unverändert.</p>
                  </InfoPopover>
                </div>
                <p className="text-xs text-slate-600 mb-3">
                  Erstellt eine neue Version mit vorbefülltem Draft. Der Prozessname und die Prozessklassifikation bleiben unverändert.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Template auswählen
                    </label>
                    <select
                      value={versionTemplateId}
                      onChange={(e) => setVersionTemplateId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md"
                    >
                      <option value="">(kein Template - manuelle Erstellung)</option>
                      {PROCESS_TEMPLATES.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {versionTemplateId && (() => {
                    const selectedTemplate = getProcessTemplate(versionTemplateId);
                    return selectedTemplate ? (
                      <div className="text-sm text-slate-600 p-3 bg-white rounded border border-slate-200">
                        <p className="font-medium mb-1">{selectedTemplate.label}</p>
                        <p className="text-xs mb-2">{selectedTemplate.description}</p>
                        <div className="text-xs space-y-1">
                          <p><span className="font-medium">Kategorie:</span> {selectedTemplate.process.category}</p>
                          <p><span className="font-medium">Management-Ebene:</span> {selectedTemplate.process.managementLevel}</p>
                          <p><span className="font-medium">Hierarchie:</span> {selectedTemplate.process.hierarchyLevel}</p>
                        </div>
                      </div>
                    ) : null;
                  })()}

                  <button
                    onClick={handleCreateVersionFromTemplate}
                    disabled={!processId || !versionTemplateId}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-400"
                  >
                    Version aus Template erstellen und Wizard starten
                  </button>
                </div>
              </div>

              <div className="mb-3 text-center text-sm text-slate-500">
                oder manuell erstellen:
              </div>

              <button
                onClick={handleCreateVersion}
                disabled={!processId}
                className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:bg-slate-400"
              >
                Neue Version erstellen und Wizard starten
              </button>
              {version && (
                <div className="text-sm text-green-600 mt-2">
                  ✓ Version erstellt - Wechsle zum Wizard-Tab
                </div>
              )}

              {processId && versions.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-md font-medium text-slate-800 mb-3">Vorhandene Versionen</h3>
                  {loadingVersions ? (
                    <p className="text-sm text-slate-500">Lade Versionen...</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-2 px-3 font-medium text-slate-700">Erstellt am</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-700">Status</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-700">Version-ID</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-700">Aktion</th>
                          </tr>
                        </thead>
                        <tbody>
                          {versions.map((ver) => {
                            const isActive = version?.versionId === ver.versionId;
                            return (
                              <tr
                                key={ver.versionId}
                                className={`border-b border-slate-100 ${
                                  isActive ? 'bg-blue-50' : ''
                                }`}
                              >
                                <td className="py-2 px-3 text-slate-700">
                                  {new Date(ver.createdAt).toLocaleString('de-DE')}
                                </td>
                                <td className="py-2 px-3">
                                  <span
                                    className={`px-2 py-1 rounded text-xs font-medium ${
                                      ver.status === 'published'
                                        ? 'bg-green-100 text-green-800'
                                        : ver.status === 'in_review'
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : 'bg-slate-100 text-slate-700'
                                    }`}
                                  >
                                    {ver.status}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-slate-600 font-mono text-xs">
                                  {ver.versionId.slice(0, 8)}...
                                </td>
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-2">
                                    {isActive ? (
                                      <span className="text-blue-700 font-medium text-xs">
                                        Aktiv
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => handleLoadVersion(ver.versionId)}
                                        className="px-3 py-1 bg-slate-600 text-white rounded text-xs hover:bg-slate-700"
                                      >
                                        Laden
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleCloneVersion(ver.versionId)}
                                      className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                                      title="Version duplizieren"
                                    >
                                      Duplizieren
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Schritt 4: Metadaten</h2>
                <InfoPopover title="Metadaten">
                  <p className="text-sm">
                    Diese Metadaten sind identisch mit dem assistierten Modus (Kontext → Metadaten) und werden zwischen beiden Ansichten synchron gehalten.
                  </p>
                </InfoPopover>
              </div>

              {renderContextMetaEditor({ variant: 'setup' })}
            </div>
          </div>
        )}

        {activeTab === 'transfer' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Import/Export</h2>
              <p className="text-sm text-slate-600">
                Transfer/Backup-Funktionen. Es wird nichts überschrieben. Imports legen neue Objekte an.
              </p>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Export (Backup/Transfer)</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-600 mb-3">
                    Exportiert das gesamte Projekt mit allen Prozessen und Versionen als JSON-Datei.
                  </p>
                  <button
                    onClick={handleExportProjectBundle}
                    disabled={!projectId}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-slate-400"
                  >
                    Projekt als JSON exportieren
                  </button>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <p className="text-sm text-slate-600 mb-3">
                    Exportiert nur einen einzelnen Prozess mit allen seinen Versionen als JSON-Datei.
                  </p>
                  <button
                    onClick={handleExportProcessBundle}
                    disabled={!processId}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-400"
                  >
                    Prozessmodell als JSON exportieren
                  </button>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">Exportpaket (Deliverables)</h3>
                  <p className="text-sm text-slate-600 mb-3">
                    Enthält BPMN, CSVs und ein JSON-Bundle für Transfer/Archivierung.
                  </p>
                  <button
                    onClick={handleExportPackageZip}
                    disabled={!process || !version || exportingPackage}
                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-slate-400"
                  >
                    {exportingPackage ? 'Erstelle ZIP...' : 'Exportpaket (ZIP) herunterladen'}
                  </button>
                  {exportPackageWarnings.length > 0 && (
                    <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-md p-3">
                      <p className="text-sm font-medium text-yellow-900 mb-2">Warnungen beim BPMN-Export:</p>
                      <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
                        {exportPackageWarnings.map((warning, idx) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Import (Backup/Transfer)</h2>
              <p className="text-sm text-slate-600 mb-4">
                Importiert ein exportiertes Prozessmodell-Bundle als neuen Prozess. Bestehende Daten werden nicht überschrieben.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    JSON-Datei auswählen
                  </label>
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={handleBundleFileSelect}
                    onClick={(e) => { (e.currentTarget as HTMLInputElement).value = ''; }}
                    className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                  />
                </div>

                {bundleParseError && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-sm text-red-800">{bundleParseError}</p>
                  </div>
                )}

                {bundlePreview && (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-2">
                    <h3 className="text-sm font-semibold text-slate-900 mb-2">Preview</h3>
                    <div className="text-sm space-y-1">
                      <p><span className="font-medium">Datei:</span> {bundleFileName}</p>
                      <p><span className="font-medium">Schema-Version:</span> {bundlePreview.schemaVersion}</p>
                      <p><span className="font-medium">Exportiert am:</span> {new Date(bundlePreview.exportedAt).toLocaleString('de-DE')}</p>
                      <p><span className="font-medium">Prozess:</span> {bundlePreview.process.title}</p>
                      <p><span className="font-medium">Kategorie:</span> {bundlePreview.process.category}</p>
                      <p><span className="font-medium">Management-Ebene:</span> {bundlePreview.process.managementLevel}</p>
                      <p><span className="font-medium">Hierarchie:</span> {bundlePreview.process.hierarchyLevel}</p>
                      <p><span className="font-medium">Versionen:</span> {bundlePreview.versions.length}</p>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-300">
                      <p className="text-xs text-slate-600">
                        Der Import legt immer einen neuen Prozess an. Bestehende Daten werden nicht überschrieben.
                      </p>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleImportBundle}
                  disabled={!projectId || !bundlePreview || bundleImporting}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-slate-400"
                >
                  {bundleImporting ? 'Importiere...' : 'Bundle importieren (neuer Prozess)'}
                </button>

                {bundleImportWarnings.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                    <p className="text-sm font-medium text-yellow-900 mb-2">Hinweise:</p>
                    <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
                      {bundleImportWarnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Projekt-Import (Backup/Transfer)</h2>
              <p className="text-sm text-slate-600 mb-4">
                Importiert ein Projekt-Bundle als neues Projekt. Es wird nichts überschrieben. Alle Prozesse und Versionen werden importiert.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    JSON-Datei auswählen
                  </label>
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={handleProjectBundleFileSelect}
                    onClick={(e) => { (e.currentTarget as HTMLInputElement).value = ''; }}
                    className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                  />
                </div>

                {projectBundleParseError && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-sm text-red-800">{projectBundleParseError}</p>
                  </div>
                )}

                {projectBundlePreview && (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-2">
                    <h3 className="text-sm font-semibold text-slate-900 mb-2">Preview</h3>
                    <div className="text-sm space-y-1">
                      <p><span className="font-medium">Datei:</span> {projectBundleFileName}</p>
                      <p><span className="font-medium">Schema-Version:</span> {projectBundlePreview.schemaVersion}</p>
                      <p><span className="font-medium">Exportiert am:</span> {new Date(projectBundlePreview.exportedAt).toLocaleString('de-DE')}</p>
                      <p><span className="font-medium">Projektname:</span> {projectBundlePreview.project.name}</p>
                      <p><span className="font-medium">Prozesse:</span> {projectBundlePreview.processes.length}</p>
                      <p><span className="font-medium">Versionen:</span> {projectBundlePreview.versions.length}</p>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-300">
                      <p className="text-xs text-slate-600">
                        Der Import legt ein neues Projekt an. Prozess-Hierarchien (parentProcessId) werden nach Möglichkeit wiederhergestellt.
                      </p>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleImportProjectBundle}
                  disabled={!projectBundlePreview || projectBundleImporting}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-slate-400"
                >
                  {projectBundleImporting ? 'Importiere...' : 'Projekt-Bundle importieren (neues Projekt)'}
                </button>

                {projectBundleWarnings.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                    <p className="text-sm font-medium text-yellow-900 mb-2">Hinweise:</p>
                    <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
                      {projectBundleWarnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Setup (Einstellungen)</h2>
              <p className="text-sm text-slate-600">
                Einstellungen für Spracheingabe, Übersetzung und KI-Integration.
              </p>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <SpeechAndTranslationSettingsCard settings={settings} onChange={setSettings} />
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <AiApiSettingsCard settings={settings} onChange={setSettings} />
            </div>

            <div className="border border-red-200 bg-red-50 rounded-xl p-6">
              <h3 className="text-base font-semibold text-red-800 mb-1">Danger Zone</h3>
              <p className="text-sm text-red-700 mb-4">
                Diese Aktion löscht alle lokal gespeicherten Inhalte der App (Projekte, Prozesse, Versionen, Mining-Datasets, Upload-Evidenzen, Settings und gecachte Events). Nicht rückgängig zu machen.
              </p>
              <button
                onClick={() => { setResetConfirmText(''); setResetError(''); setResetOpen(true); }}
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors"
              >
                Alle Inhalte löschen
              </button>
            </div>
          </div>
        )}

        {resetOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="p-6 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Alle Inhalte löschen?</h2>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-700 font-medium">Folgende Daten werden unwiderruflich gelöscht:</p>
                <ul className="text-sm text-slate-700 space-y-1 list-disc list-inside">
                  <li>Projekte / Prozesse / Versionen</li>
                  <li>Mining-Datasets, Mappings &amp; Mining-Settings</li>
                  <li>Dokument-Evidenzen (lokal gespeicherte Texte)</li>
                  <li>Caches (IndexedDB Events)</li>
                  <li>UI / Setup-Einstellungen</li>
                </ul>
                <p className="text-xs text-slate-500 bg-slate-100 rounded-lg px-3 py-2">{APP_RESET_SCOPE_NOTE}</p>
                <div>
                  <label className="block text-sm font-medium text-slate-800 mb-1">
                    Bitte tippen Sie <span className="font-bold text-red-700">LÖSCHEN</span>, um zu bestätigen.
                  </label>
                  <input
                    type="text"
                    value={resetConfirmText}
                    onChange={e => setResetConfirmText(e.target.value)}
                    placeholder="LÖSCHEN"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    autoFocus
                  />
                </div>
                {resetError && (
                  <div className="bg-red-100 border border-red-300 text-red-700 rounded-lg px-3 py-2 text-sm">
                    {resetError}
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  onClick={() => setResetOpen(false)}
                  disabled={resetBusy}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Abbrechen
                </button>
                <button
                  disabled={resetConfirmText.trim() !== 'LÖSCHEN' || resetBusy}
                  onClick={async () => {
                    setResetBusy(true);
                    setResetError('');
                    try {
                      await resetAllAppData();
                      window.location.reload();
                    } catch {
                      setResetError('Löschen fehlgeschlagen. Bitte Seite neu laden und erneut versuchen.');
                    } finally {
                      setResetBusy(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {resetBusy ? 'Lösche…' : 'Jetzt löschen'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'wizard' && (
          <div className="space-y-6">
            {renderVersionInfoHeader()}

            {version && (
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Erfassungsfokus</h2>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setWizardFocus('skeleton');
                      setAnswers({});
                      setErrors({});
                    }}
                    className={`flex-1 px-4 py-3 rounded-md font-medium transition-colors ${
                      wizardFocus === 'skeleton'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <div className="font-semibold">Skelett (Schnellstart)</div>
                    <div className="text-xs mt-1 opacity-90">
                      Start/Ende/Ziel, die wichtigsten Hauptschritte, Rollen. Details später.
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setWizardFocus('detail');
                      setAnswers({});
                      setErrors({});
                    }}
                    className={`flex-1 px-4 py-3 rounded-md font-medium transition-colors ${
                      wizardFocus === 'detail'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <div className="font-semibold">Details</div>
                    <div className="text-xs mt-1 opacity-90">
                      Varianten, Ausnahmen, Daten/IT, KPIs, Automatisierung.
                    </div>
                  </button>
                </div>
              </div>
            )}

            {!version && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                <p className="text-yellow-800">Bitte erst im Arbeitsbereich eine Version erstellen</p>
              </div>
            )}

            {version && (
              <>
                <div ref={wizardPhaseAnchorRef} className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Wizard-Phase
                      </div>
                      <div className="text-lg font-semibold text-slate-900">
                        {wizardShownPhase ? phaseLabels[wizardShownPhase] : '—'}
                      </div>
                      <div className="text-sm text-slate-600">
                        Nutzen Sie die Phasen-Navigation oben unter „Werkzeuge", um schnell zu wechseln.
                      </div>
                    </div>
                    {wizardShownPhase && (
                      <div className="text-xs font-semibold">
                        {version.captureProgress.phaseStates[wizardShownPhase] === 'done' ? (
                          <span className="text-white bg-blue-900 px-3 py-1 rounded-full">Bearbeitet</span>
                        ) : version.captureProgress.phaseStates[wizardShownPhase] === 'in_progress' ? (
                          <span className="text-white bg-blue-800 px-3 py-1 rounded-full">In Arbeit</span>
                        ) : (
                          <span className="text-blue-950 bg-gradient-to-r from-blue-300 to-sky-100 border border-blue-200 px-3 py-1 rounded-full">
                            Nicht bearbeitet
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {nextQuestions.length === 0 && wizardCurrentPhase === null && wizardFocus === 'skeleton' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                    <p className="text-blue-900 font-medium text-center mb-4">
                      Skelett abgeschlossen. Als nächstes können Sie den Draft prüfen oder Details ergänzen.
                    </p>
                    <div className="flex justify-center gap-3 flex-wrap">
                      <button
                        onClick={() => setActiveTab('draft')}
                        className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                      >
                        Zum Draft wechseln
                      </button>
                      <button
                        onClick={() => {
                          setActiveTab('draft');
                          setEnrichmentOpen(true);
                        }}
                        className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
                      >
                        Schritte anreichern (Rolle/System)
                      </button>
                      <button
                        onClick={() => {
                          setWizardFocus('detail');
                          setAnswers({});
                          setErrors({});
                        }}
                        className="px-6 py-3 bg-slate-700 text-white rounded-md hover:bg-slate-600 font-medium"
                      >
                        Details ergänzen
                      </button>
                    </div>
                    <p className="text-xs text-blue-700 text-center mt-3">
                      Tipp: Details sind sinnvoll, wenn Varianten/Ausnahmen wichtig sind oder Automatisierung geplant ist.
                    </p>
                  </div>
                )}

                {nextQuestions.length === 0 && !(wizardCurrentPhase === null && wizardFocus === 'skeleton') && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                    <p className="text-green-800 font-medium">
                      Alle Pflichtfragen dieser Phase beantwortet!
                    </p>
                    <p className="text-green-600 text-sm mt-2">
                      {phaseStatus.optionalUnanswered
                        ? 'Optional: Sie können noch Zusatzfelder ausfüllen oder direkt weitergehen.'
                        : 'Du kannst zum Draft-Tab wechseln oder die nächste Phase beginnen.'}
                    </p>
                  </div>
                )}

                {nextQuestions.length > 0 && (
                  <>
                    <div className="space-y-4">
                      {nextQuestions.map((question) => {
                        if (question.id === 'happy_path_steps') {
                          const raw = answers[question.id];
                          const steps =
                            Array.isArray(raw) ? raw as string[] :
                            typeof raw === 'string' ? raw.split('\n').map(s => s.trim()).filter(Boolean) :
                            [];

                          return (
                            <HappyPathStepBuilder
                              key={question.id}
                              question={question}
                              steps={steps}
                              onChange={(next) =>
                                setAnswers((prev) => ({ ...prev, [question.id]: next }))
                              }
                              error={errors[question.id]}
                            />
                          );
                        }

                        return (
                          <QuestionRenderer
                            key={question.id}
                            question={question}
                            value={answers[question.id]}
                            onChange={(value) =>
                              setAnswers((prev) => ({ ...prev, [question.id]: value }))
                            }
                            error={errors[question.id]}
                            dictation={{
                              enabled: canUseWizardDictation,
                              needsSetup: needsWizardDictationSetup,
                              active: wizardDictationActive,
                              activeQuestionId: wizardDictationQuestionId,
                              interim: wizardDictationInterim,
                              error: wizardDictationError,
                              onStart: (qid, m) => handleStartWizardDictation(qid, m),
                              onStop: handleStopWizardDictation,
                              onOpenSetup: () => setActiveTab('settings'),
                            }}
                          />
                        );
                      })}
                    </div>

                    <div className="flex justify-end gap-3">
                      {(!phaseHasRequired || (phaseStatus.requiredAnswered && phaseStatus.optionalUnanswered)) && (
                        <button
                          onClick={handleSkipPhase}
                          disabled={saving || wizardDictationActive}
                          className="px-6 py-3 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 disabled:bg-slate-100 font-medium"
                        >
                          {saving
                            ? 'Speichere...'
                            : phaseHasRequired
                            ? 'Optionale Fragen überspringen'
                            : 'Phase überspringen'}
                        </button>
                      )}
                      <button
                        onClick={handleSaveAnswers}
                        disabled={saving || Object.keys(answers).length === 0 || wizardDictationActive}
                        className="px-6 py-3 bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:bg-slate-400 font-medium"
                      >
                        {saving ? 'Speichere...' : 'Antworten speichern'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'draft' && (
          <div className="space-y-6">
            {renderVersionInfoHeader()}

            {!version && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                <p className="text-yellow-800">Keine Version vorhanden</p>
              </div>
            )}

            {version && (
              <>
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">End-to-End Definition</h2>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="font-medium text-slate-700">Trigger:</dt>
                      <dd className="text-slate-600">
                        {version.endToEndDefinition.trigger || '(noch nicht erfasst)'}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-700">Kunde:</dt>
                      <dd className="text-slate-600">
                        {version.endToEndDefinition.customer || '(noch nicht erfasst)'}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-700">Ergebnis:</dt>
                      <dd className="text-slate-600">
                        {version.endToEndDefinition.outcome || '(noch nicht erfasst)'}
                      </dd>
                    </div>
                    {version.endToEndDefinition.doneCriteria && (
                      <div>
                        <dt className="font-medium text-slate-700">Done-Kriterium:</dt>
                        <dd className="text-slate-600">{version.endToEndDefinition.doneCriteria}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                {process && version && (
                  <div className="bg-white rounded-lg border border-slate-200 p-6">
                    <HappyPathCsvImport process={process} version={version} onSave={handleSaveDraftChanges} />
                  </div>
                )}

                {version && (
                  <div className="bg-white rounded-lg border border-slate-200 p-6">
                    <CatalogCsvImport version={version} onSave={handleSaveDraftChanges} />
                  </div>
                )}

                {version && (
                  <CatalogMergeTool
                    version={version}
                    onSave={handleSaveDraftChanges}
                    hasUnsavedStepEdits={Object.keys(stepEdits).length > 0}
                  />
                )}

                {version.sidecar.captureDraft && version.sidecar.captureDraft.happyPath.length > 0 && (
                  <>
                    <div className="bg-white rounded-lg border border-slate-200 p-6">
                      <h2 className="text-lg font-semibold text-slate-900 mb-4">
                        Happy Path ({version.sidecar.captureDraft.happyPath.length} Schritte)
                      </h2>
                      <ol className="space-y-2 text-sm">
                        {version.sidecar.captureDraft.happyPath.map((step) => (
                          <li key={step.stepId} className="flex">
                            <span className="font-medium text-slate-700 mr-3">{step.order}.</span>
                            <span className="text-slate-600">{step.label}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    {!enrichmentOpen && (
                      <div className="bg-gradient-to-br from-green-50 to-white border border-green-200 rounded-lg p-6">
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">
                          Geführte Schritt-Anreicherung (optional)
                        </h3>
                        <p className="text-sm text-slate-600 mb-4">
                          Hilft Einsteigern, Rolle/System/Arbeitstyp Schritt für Schritt zuzuordnen.
                        </p>
                        <button
                          onClick={() => setEnrichmentOpen(true)}
                          className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
                        >
                          Starten
                        </button>
                      </div>
                    )}

                    {enrichmentOpen && (
                      <StepEnrichmentFlow
                        steps={version.sidecar.captureDraft.happyPath}
                        roles={version.sidecar.roles}
                        systems={version.sidecar.systems}
                        stepEdits={stepEdits}
                        onPatchStep={patchStepEdit}
                        onSaveAll={handleSaveStepDetails}
                        saving={savingStepDetails}
                        onClose={() => setEnrichmentOpen(false)}
                      />
                    )}

                    <div className="bg-white rounded-lg border border-slate-200 p-6">
                      <h2 className="text-lg font-semibold text-slate-900 mb-4">Schritt-Details</h2>

                      <div className="mb-6 bg-slate-50 border border-slate-200 rounded-md p-4">
                        <h3 className="text-sm font-medium text-slate-700 mb-3">Quick Actions</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex gap-2">
                            <select
                              value={quickActionRole}
                              onChange={(e) => setQuickActionRole(e.target.value)}
                              className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm"
                            >
                              <option value="">Rolle wählen...</option>
                              {version.sidecar.roles.map((role) => (
                                <option key={role.id} value={role.id}>
                                  {role.name}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={handleSetRoleForAll}
                              disabled={!quickActionRole}
                              className="px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 disabled:bg-slate-300 text-sm whitespace-nowrap"
                            >
                              Für alle setzen
                            </button>
                          </div>

                          <div className="flex gap-2">
                            <select
                              value={quickActionSystem}
                              onChange={(e) => setQuickActionSystem(e.target.value)}
                              className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm"
                            >
                              <option value="">System wählen...</option>
                              {version.sidecar.systems.map((system) => (
                                <option key={system.id} value={system.id}>
                                  {system.name}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={handleSetSystemForAll}
                              disabled={!quickActionSystem}
                              className="px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 disabled:bg-slate-300 text-sm whitespace-nowrap"
                            >
                              Für alle setzen
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200">
                              <th className="text-left py-2 px-3 font-medium text-slate-700 w-12">#</th>
                              <th className="text-left py-2 px-3 font-medium text-slate-700">Schritt</th>
                              <th className="text-left py-2 px-3 font-medium text-slate-700 w-40">Rolle</th>
                              <th className="text-left py-2 px-3 font-medium text-slate-700 w-40">System</th>
                              <th className="text-left py-2 px-3 font-medium text-slate-700 w-40">Arbeitstyp</th>
                              <th className="text-left py-2 px-3 font-medium text-slate-700 w-56">Kennzahlen (grob)</th>
                              <th className="text-left py-2 px-3 font-medium text-slate-700 w-48">Pain-Point</th>
                              <th className="text-left py-2 px-3 font-medium text-slate-700 w-64">To-Be Hinweis</th>
                              <th className="text-left py-2 px-3 font-medium text-slate-700 w-64">Quelle (Snippet)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {version.sidecar.captureDraft.happyPath.map((step) => {
                              const edit = stepEdits[step.stepId] || {};
                              return (
                                <tr id={`step-${step.stepId}`} key={step.stepId} className="border-b border-slate-100">
                                  <td className="py-3 px-3 text-slate-600">{step.order}</td>
                                  <td className="py-3 px-3 text-slate-900 font-medium">{step.label}</td>
                                  <td className="py-3 px-3">
                                    <select
                                      value={edit.roleId || ''}
                                      onChange={(e) =>
                                        setStepEdits((prev) => ({
                                          ...prev,
                                          [step.stepId]: {
                                            ...prev[step.stepId],
                                            roleId: e.target.value || null,
                                          },
                                        }))
                                      }
                                      className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                                    >
                                      <option value="">(keine)</option>
                                      {version.sidecar.roles.map((role) => (
                                        <option key={role.id} value={role.id}>
                                          {role.name}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-3 px-3">
                                    <select
                                      value={edit.systemId || ''}
                                      onChange={(e) =>
                                        setStepEdits((prev) => ({
                                          ...prev,
                                          [step.stepId]: {
                                            ...prev[step.stepId],
                                            systemId: e.target.value || null,
                                          },
                                        }))
                                      }
                                      className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                                    >
                                      <option value="">(keine)</option>
                                      {version.sidecar.systems.map((system) => (
                                        <option key={system.id} value={system.id}>
                                          {system.name}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-3 px-3">
                                    <select
                                      value={edit.workType || 'unknown'}
                                      onChange={(e) =>
                                        setStepEdits((prev) => ({
                                          ...prev,
                                          [step.stepId]: {
                                            ...prev[step.stepId],
                                            workType: e.target.value as WorkType,
                                          },
                                        }))
                                      }
                                      className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                                    >
                                      <option value="unknown">Unklar</option>
                                      <option value="manual">Manuell</option>
                                      <option value="user_task">User-Task (IT-unterstützt)</option>
                                      <option value="service_task">Service-Task (System/Integration)</option>
                                      <option value="ai_assisted">KI-unterstützt</option>
                                    </select>
                                  </td>
                                  <td className="py-3 px-3">
                                    <div className="space-y-1">
                                      <div>
                                        <label className="block text-xs text-slate-600 mb-0.5">Status</label>
                                        <select
                                          value={edit.status ?? step.status ?? 'unclear'}
                                          onChange={(e) =>
                                            patchStepEdit(step.stepId, { status: e.target.value as CaptureElementStatus })
                                          }
                                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                                        >
                                          <option value="unclear">Unklar</option>
                                          <option value="confirmed">Bestätigt</option>
                                          <option value="derived">Abgeleitet</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-xs text-slate-600 mb-0.5">Bearbeitungszeit</label>
                                        <select
                                          value={edit.processingTime ?? step.processingTime ?? 'unknown'}
                                          onChange={(e) =>
                                            patchStepEdit(step.stepId, { processingTime: e.target.value as StepLeadTimeBucket })
                                          }
                                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                                        >
                                          <option value="unknown">Unbekannt</option>
                                          <option value="minutes">Minuten</option>
                                          <option value="hours">Stunden</option>
                                          <option value="1_day">Bis 1 Tag</option>
                                          <option value="2_5_days">2 bis 5 Tage</option>
                                          <option value="1_2_weeks">1 bis 2 Wochen</option>
                                          <option value="over_2_weeks">Mehr als 2 Wochen</option>
                                          <option value="varies">Variiert stark</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-xs text-slate-600 mb-0.5">Wartezeit</label>
                                        <select
                                          value={edit.waitingTime ?? step.waitingTime ?? 'unknown'}
                                          onChange={(e) =>
                                            patchStepEdit(step.stepId, { waitingTime: e.target.value as StepLeadTimeBucket })
                                          }
                                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                                        >
                                          <option value="unknown">Unbekannt</option>
                                          <option value="minutes">Minuten</option>
                                          <option value="hours">Stunden</option>
                                          <option value="1_day">Bis 1 Tag</option>
                                          <option value="2_5_days">2 bis 5 Tage</option>
                                          <option value="1_2_weeks">1 bis 2 Wochen</option>
                                          <option value="over_2_weeks">Mehr als 2 Wochen</option>
                                          <option value="varies">Variiert stark</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-xs text-slate-600 mb-0.5">Volumen</label>
                                        <select
                                          value={edit.volume ?? step.volume ?? 'unknown'}
                                          onChange={(e) =>
                                            patchStepEdit(step.stepId, { volume: e.target.value as StepLevelBucket })
                                          }
                                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                                        >
                                          <option value="unknown">Unbekannt</option>
                                          <option value="low">Niedrig</option>
                                          <option value="medium">Mittel</option>
                                          <option value="high">Hoch</option>
                                          <option value="varies">Variiert stark</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-xs text-slate-600 mb-0.5">Rework</label>
                                        <select
                                          value={edit.rework ?? step.rework ?? 'unknown'}
                                          onChange={(e) =>
                                            patchStepEdit(step.stepId, { rework: e.target.value as StepLevelBucket })
                                          }
                                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                                        >
                                          <option value="unknown">Unbekannt</option>
                                          <option value="low">Niedrig</option>
                                          <option value="medium">Mittel</option>
                                          <option value="high">Hoch</option>
                                          <option value="varies">Variiert stark</option>
                                        </select>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-3">
                                    <input
                                      type="text"
                                      value={edit.painPointHint || ''}
                                      onChange={(e) =>
                                        setStepEdits((prev) => ({
                                          ...prev,
                                          [step.stepId]: {
                                            ...prev[step.stepId],
                                            painPointHint: e.target.value,
                                          },
                                        }))
                                      }
                                      placeholder="optional"
                                      className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                                    />
                                  </td>
                                  <td className="py-3 px-3">
                                    <textarea
                                      value={edit.toBeHint ?? step.toBeHint ?? ''}
                                      onChange={(e) =>
                                        setStepEdits((prev) => ({
                                          ...prev,
                                          [step.stepId]: {
                                            ...prev[step.stepId],
                                            toBeHint: e.target.value,
                                          },
                                        }))
                                      }
                                      rows={3}
                                      placeholder="optional (z.B. Automatisierungsidee, Vereinfachung, Kontrolle)"
                                      className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                                    />
                                    <div className="mt-1 text-xs text-slate-500">
                                      Verknüpfte Maßnahmen: {
                                        (version.sidecar.improvementBacklog ?? []).filter(
                                          (item) => item.scope === 'step' && item.relatedStepId === step.stepId
                                        ).length
                                      }
                                    </div>
                                    <button
                                      onClick={() => handleCopyImprovementsToStep(step.stepId)}
                                      disabled={
                                        (version.sidecar.improvementBacklog ?? []).filter(
                                          (item) => item.scope === 'step' && item.relatedStepId === step.stepId
                                        ).length === 0
                                      }
                                      className="mt-1 px-2 py-1 bg-slate-600 text-white rounded text-xs hover:bg-slate-700 disabled:bg-slate-300"
                                    >
                                      Aus Maßnahmen übernehmen
                                    </button>
                                  </td>
                                  <td className="py-3 px-3">
                                    <div className="mb-2">
                                      <label className="block text-xs text-slate-600 mb-1">Quelle (Label)</label>
                                      <input
                                        type="text"
                                        value={getEvidenceRefId(step, edit)}
                                        onChange={(e) => patchEvidenceRefId(step.stepId, e.target.value)}
                                        placeholder="z.B. Workshop 17.02.2026, SOP v3"
                                        className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                                      />
                                    </div>
                                    <textarea
                                      value={getEvidenceSnippet(step, edit)}
                                      onChange={(e) => patchEvidenceSnippet(step.stepId, e.target.value)}
                                      rows={2}
                                      placeholder="optional (z.B. Zitat aus Workshop)"
                                      className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                                    />
                                    <button
                                      onClick={() => {
                                        const snippet = getEvidenceSnippet(step, edit);
                                        const refId = getEvidenceRefId(step, edit);
                                        if (snippet || refId) {
                                          setEvidenceModalTitle(`${step.order}. ${step.label}`);
                                          setEvidenceModalText(snippet);
                                          setEvidenceModalRefId(refId);
                                          setEvidenceModalOpen(true);
                                        }
                                      }}
                                      disabled={!getEvidenceSnippet(step, edit) && !getEvidenceRefId(step, edit)}
                                      className="mt-1 px-2 py-1 bg-slate-600 text-white rounded text-xs hover:bg-slate-700 disabled:bg-slate-300"
                                    >
                                      Quelle anzeigen
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-6 flex justify-end">
                        <button
                          onClick={handleSaveStepDetails}
                          disabled={savingStepDetails}
                          className="px-6 py-3 bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:bg-slate-400 font-medium"
                        >
                          {savingStepDetails ? 'Speichere...' : 'Schritt-Details speichern'}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {version.sidecar.captureDraft && process && (
                  <div className="bg-white rounded-lg border border-slate-200 p-6">
                    <DraftDecisionsEditor
                      process={process}
                      version={version}
                      onSave={handleSaveDraftChanges}
                    />
                  </div>
                )}

                {version.sidecar.captureDraft && process && (
                  <div className="bg-white rounded-lg border border-slate-200 p-6">
                    <DraftExceptionsEditor
                      process={process}
                      version={version}
                      onSave={handleSaveDraftChanges}
                    />
                  </div>
                )}

                {version.sidecar.roles.length > 0 && (
                  <div className="bg-white rounded-lg border border-slate-200 p-6">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">
                      Rollen ({version.sidecar.roles.length})
                    </h2>
                    <ul className="flex flex-wrap gap-2">
                      {version.sidecar.roles.map((role) => (
                        <li
                          key={role.id}
                          className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm"
                        >
                          {role.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">BPMN Export</h2>

                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <button
                        onClick={handleGenerateBpmn}
                        disabled={generatingBpmn}
                        className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:bg-slate-400"
                      >
                        {generatingBpmn ? 'Generiere...' : 'BPMN generieren'}
                      </button>

                      <button
                        onClick={handleDownloadBpmn}
                        disabled={!version.bpmn.bpmnXml}
                        className="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600 disabled:bg-slate-400"
                      >
                        Download .bpmn
                      </button>

                      <button
                        onClick={() => {
                          if (version.bpmn.bpmnXml) {
                            setBpmnPreviewOpen(true);
                          } else {
                            setStatusMessage('Kein BPMN XML vorhanden. Bitte erst generieren.');
                          }
                        }}
                        disabled={!version.bpmn.bpmnXml}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-400"
                      >
                        Vorschau
                      </button>
                    </div>

                    {!version.bpmn.bpmnXml && (
                      <div className="text-sm text-slate-500">
                        Bitte erst generieren.
                      </div>
                    )}

                    {version.bpmn.lastExportedAt && (
                      <div className="text-sm text-slate-600">
                        Letzte Generierung: {new Date(version.bpmn.lastExportedAt).toLocaleString('de-DE')}
                      </div>
                    )}

                    {bpmnWarnings.length > 0 && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                        <h3 className="font-medium text-yellow-900 mb-2">Warnungen:</h3>
                        <ul className="space-y-1 text-sm text-yellow-800">
                          {bpmnWarnings.map((warning, idx) => (
                            <li key={idx}>• {warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {version.bpmn.bpmnXml && (
                      <div>
                        <h3 className="font-medium text-slate-700 mb-2 text-sm">XML Vorschau:</h3>
                        <textarea
                          readOnly
                          value={version.bpmn.bpmnXml}
                          className="w-full h-64 px-3 py-2 border border-slate-300 rounded-md font-mono text-xs bg-slate-50"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'review' && (
          <div className="space-y-6">
            {renderVersionInfoHeader()}

            {!version && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                <p className="text-yellow-800">Keine Version vorhanden</p>
              </div>
            )}

            {version && process && (
              <>
                <EvidenceCoveragePanel version={version} onGoToDraft={() => setActiveTab('draft')} />

                {(() => {
                  const assessment = assessProcess(process, version);

                  const downloadAssessment = () => {
                    const blob = new Blob([JSON.stringify(assessment, null, 2)], {
                      type: 'application/json',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `assessment-${process.title.replace(/[^a-z0-9]/gi, '-')}-${new Date()
                      .toISOString()
                      .slice(0, 10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  };

                  const levelColors = {
                    low: 'bg-red-100 text-red-800 border-red-200',
                    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
                    high: 'bg-green-100 text-green-800 border-green-200',
                  };

                  return (
                    <div className="bg-white rounded-lg border border-slate-200 p-6">
                      <div className="flex items-start justify-between mb-6">
                        <div>
                          <h2 className="text-xl font-semibold text-slate-900 mb-2">
                            Bewertung: Digitalisierung & Automatisierung
                          </h2>
                          <p className="text-sm text-slate-600">{assessment.summary}</p>
                        </div>
                        <button
                          onClick={downloadAssessment}
                          className="px-4 py-2 bg-slate-900 text-white text-sm rounded-md hover:bg-slate-800"
                        >
                          JSON Download
                        </button>
                      </div>

                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-700">Gesamtbewertung</span>
                          <span className="text-sm font-semibold text-slate-900">
                            {assessment.overallScore0to100}/100
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-3">
                          <div
                            className={`h-3 rounded-full ${
                              assessment.overallScore0to100 >= 70
                                ? 'bg-green-500'
                                : assessment.overallScore0to100 >= 40
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${assessment.overallScore0to100}%` }}
                          />
                        </div>
                      </div>

                      <div className="space-y-6">
                        {assessment.dimensions.map((dim) => (
                          <div key={dim.key} className="border-t border-slate-200 pt-6">
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="text-base font-semibold text-slate-900">{dim.label}</h3>
                              <span
                                className={`px-3 py-1 text-xs font-medium rounded-full border ${
                                  levelColors[dim.level]
                                }`}
                              >
                                {dim.level === 'high' ? 'Hoch' : dim.level === 'medium' ? 'Mittel' : 'Niedrig'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm text-slate-600">Score</span>
                              <span className="text-sm font-medium text-slate-700">{dim.score0to100}/100</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2 mb-4">
                              <div
                                className={`h-2 rounded-full ${
                                  dim.level === 'high'
                                    ? 'bg-green-500'
                                    : dim.level === 'medium'
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                                }`}
                                style={{ width: `${dim.score0to100}%` }}
                              />
                            </div>

                            {dim.rationale.length > 0 && (
                              <div className="mb-3">
                                <h4 className="text-sm font-medium text-slate-700 mb-2">Begründung:</h4>
                                <ul className="list-disc list-inside space-y-1">
                                  {dim.rationale.map((reason, idx) => (
                                    <li key={idx} className="text-sm text-slate-600">
                                      {reason}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {dim.recommendations.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium text-slate-700 mb-2">Empfehlungen:</h4>
                                <ul className="list-disc list-inside space-y-1">
                                  {dim.recommendations.map((rec, idx) => (
                                    <li key={idx} className="text-sm text-slate-600">
                                      {rec}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {assessment.nextSteps.length > 0 && (
                        <div className="border-t border-slate-200 pt-6 mt-6">
                          <h3 className="text-base font-semibold text-slate-900 mb-3">Nächste Schritte</h3>
                          <ul className="space-y-2">
                            {assessment.nextSteps.map((step, idx) => (
                              <li key={idx} className="flex items-start">
                                <span className="font-medium text-slate-700 text-sm mr-2">{idx + 1}.</span>
                                <span className="text-slate-600 text-sm">{step}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {assessment.automationHints.length > 0 && (
                        <div className="border-t border-slate-200 pt-6 mt-6">
                          <h3 className="text-base font-semibold text-slate-900 mb-3">
                            Automatisierungshinweise
                          </h3>
                          <ul className="space-y-2">
                            {assessment.automationHints.map((hint, idx) => (
                              <li key={idx} className="text-sm text-slate-600">
                                {hint}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">
                    Benennungshinweise ({version.quality.namingFindings.length})
                  </h2>
                  {version.quality.namingFindings.length === 0 && (
                    <p className="text-sm text-slate-500">Keine Auffälligkeiten erkannt</p>
                  )}
                  {version.quality.namingFindings.length > 0 && (
                    <ul className="space-y-3">
                      {version.quality.namingFindings.map((finding, idx) => (
                        <li
                          key={idx}
                          className={`p-3 rounded-md text-sm ${
                            finding.severity === 'warn'
                              ? 'bg-yellow-50 border border-yellow-200 text-yellow-800'
                              : 'bg-blue-50 border border-blue-200 text-blue-800'
                          }`}
                        >
                          <div className="font-medium">{finding.message}</div>
                          {finding.exampleFix && (
                            <div className="text-xs mt-1 opacity-80">Vorschlag: {finding.exampleFix}</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">
                    KI-Import Hinweise (persistiert)
                  </h2>
                  {(!version.sidecar.aiImportNotes || version.sidecar.aiImportNotes.length === 0) && (
                    <p className="text-sm text-slate-500">Keine Import-Hinweise gespeichert</p>
                  )}
                  {version.sidecar.aiImportNotes && version.sidecar.aiImportNotes.length > 0 && (
                    <ul className="space-y-2">
                      {[...version.sidecar.aiImportNotes]
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .map((note) => (
                          <li
                            key={note.id}
                            className={`p-3 border rounded-md text-sm ${
                              note.severity === 'warn'
                                ? 'bg-yellow-50 border-yellow-200'
                                : 'bg-blue-50 border-blue-200'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="text-slate-700">{note.message}</div>
                                {note.sourceRefId && (
                                  <div className="text-xs text-slate-500 mt-1">
                                    Quelle: {note.sourceRefId}
                                  </div>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 whitespace-nowrap">
                                {new Date(note.createdAt).toLocaleDateString('de-DE')}
                              </div>
                            </div>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>

                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-900">
                      Semantische Prüffragen ({version.quality.semanticQuestions.length})
                    </h2>
                  </div>
                  {version.quality.semanticQuestions.length === 0 && (
                    <p className="text-sm text-slate-500">Keine Fragen generiert</p>
                  )}
                  {version.quality.semanticQuestions.length > 0 && (
                    <>
                      <SemanticQuestionsChecklistEditor
                        process={process}
                        version={version}
                        onSave={handleSaveDraftChanges}
                      />
                      <div className="mt-6 pt-6 border-t border-slate-200">
                        <h3 className="text-base font-semibold text-slate-900 mb-3">
                          KI-Analyse der offenen Fragen
                        </h3>
                        <SemanticQuestionsAiPanel process={process} version={version} settings={settings} />
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-6">
            {renderVersionInfoHeader()}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-lg font-semibold text-blue-900">Datenschutz-Hinweis</h2>
                <InfoPopover title="Ihre Daten bleiben bei Ihnen">
                  <div className="text-sm space-y-2">
                    <p>Standard: Copy/Paste – Sie kopieren Prompts manuell und haben volle Kontrolle.</p>
                    <p>Optional: API-Modus – Daten werden an Ihren konfigurierten Endpoint gesendet. Nutzen Sie nur vertrauenswürdige Services.</p>
                  </div>
                </InfoPopover>
              </div>
              <p className="text-sm text-blue-800">
                Die App sendet keine Daten automatisch. Sie kopieren den Prompt manuell in Claude
                und fügen die JSON-Antwort hier ein. Sie behalten volle Kontrolle über Ihre Daten.
              </p>
{settings.dataHandlingMode === 'external' && settings.ai.mode === 'api' && settings.ai.api.endpointUrl.trim() && (
                <p className="text-sm text-blue-800 mt-2">
                  API-Modus ist aktiv. Beim Klick auf „Per API senden" wird der Prompt an den konfigurierten Endpoint übertragen.
                </p>
              )}
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Erfassungsmodus</h2>
                <InfoPopover title="Welchen Modus wählen?">
                  <div className="text-sm space-y-2">
                    <p><strong>Prozessbeschreibung:</strong> Für SOPs, Handbücher, Dokumentationen.</p>
                    <p><strong>Ein Fall:</strong> Letzten konkreten Durchlauf beschreiben. KI leitet typischen Ablauf ab.</p>
                    <p><strong>Mehrere Fälle:</strong> 3–5 echte Fälle. KI konsolidiert zu Standard-Path + Varianten.</p>
                  </div>
                </InfoPopover>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setAiCaptureMode('artifact')}
                  className={`px-4 py-2 rounded-md font-medium transition-colors ${
                    aiCaptureMode === 'artifact'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Prozessbeschreibung / Artefakt
                </button>
                <button
                  onClick={() => setAiCaptureMode('case')}
                  className={`px-4 py-2 rounded-md font-medium transition-colors ${
                    aiCaptureMode === 'case'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Letzten konkreten Fall erzählen (ein Fall)
                </button>
                <button
                  onClick={() => setAiCaptureMode('cases')}
                  className={`px-4 py-2 rounded-md font-medium transition-colors ${
                    aiCaptureMode === 'cases'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Mehrere konkrete Fälle (3–5)
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Evidence-Quelle (Label)</h2>
                <InfoPopover title="Nachvollziehbarkeit">
                  <p className="text-sm">
                    Dokumentieren Sie die Quelle Ihrer Informationen (z.B. "Workshop 17.02.2026", "SOP v3.2").
                    Wichtig für Audit Trail und Transparenz.
                  </p>
                </InfoPopover>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Optionales Label für die Quelle. Wird automatisch gesetzt bei Dateiimport.
              </p>
              <input
                type="text"
                value={aiEvidenceSourceLabel}
                onChange={(e) => setAiEvidenceSourceLabel(e.target.value)}
                placeholder="z.B. Workshop 17.02.2026 (optional)"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              />
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Schritt 1: Quelltext eingeben
              </h2>
              <p className="text-sm text-slate-600 mb-3">
                {aiCaptureMode === 'artifact'
                  ? 'Fügen Sie hier eine Prozessbeschreibung ein (Text, SOP, Mail, Tabelle, etc.)'
                  : aiCaptureMode === 'case'
                  ? 'Tipp: Beschreiben Sie den letzten konkreten Vorgang von Anfang bis Ende. Die KI leitet daraus einen typischen Happy Path ab und markiert Sonderfälle als Ausnahmen.'
                  : 'Tipp: Erfassen Sie 3–5 kurze, konkrete Fälle (real passiert). Die KI konsolidiert daraus den Standard-Happy-Path und modelliert Varianten als Entscheidungen/Ausnahmen.'}
              </p>
              {aiCaptureMode === 'case' && (
                <button
                  onClick={handleInsertCaseTemplate}
                  className="mb-3 px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 text-sm"
                >
                  Vorlage einfügen
                </button>
              )}
              {aiCaptureMode === 'cases' && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-600">
                    Fälle erkannt: <span className="font-medium">{caseBlocks.length}</span> (Empfehlung: 3–5)
                  </div>
                  <button
                    type="button"
                    onClick={handleInsertMultiCaseBlock}
                    className="px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 text-sm"
                  >
                    Fall hinzufügen (Vorlage)
                  </button>
                </div>
              )}

              {needsAiDictationSetup && (
                <div className="mb-3 bg-slate-50 border border-slate-200 rounded-md p-3 text-sm text-slate-700 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">Spracheingabe (optional)</div>
                    <div className="text-xs text-slate-600">
                      Aktivieren Sie im Setup den Modus „Externer Dienst" und wählen Sie den STT-Provider „Web Speech API".
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('settings')}
                    className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 flex items-center gap-2"
                  >
                    <Settings2 className="w-4 h-4" />
                    Setup öffnen
                  </button>
                </div>
              )}

              {settings.dataHandlingMode === 'external' && settings.transcription.providerId === 'web_speech' && (
                <div className="mb-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    {!aiDictationActive ? (
                      <button
                        type="button"
                        onClick={handleStartAiDictation}
                        disabled={!canUseAiDictation}
                        className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-400 flex items-center gap-2"
                      >
                        <Mic className="w-4 h-4" />
                        Diktat starten
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStopAiDictation}
                        className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 flex items-center gap-2"
                      >
                        <Square className="w-4 h-4" />
                        Stop
                      </button>
                    )}

                    <span className="text-xs text-slate-500">
                      Sprache: {settings.transcription.language}
                    </span>

                    {aiRawText.trim() && !aiDictationActive && (
                      <span className="text-xs text-slate-500">
                        Hinweis: Diktat wird ans Ende angehängt.
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-600">
                    Hinweis: Web Speech API kann je nach Browser über einen externen Dienst laufen. Start erfolgt nur durch Ihren Klick.
                  </div>
                </div>
              )}

              {aiDictationError && (
                <div className="mb-3 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
                  {aiDictationError}
                </div>
              )}

              {aiDictationActive && aiDictationInterim && (
                <div className="mb-3 bg-slate-50 border border-slate-200 rounded-md p-3 text-sm text-slate-700">
                  <span className="font-medium">Live:</span> {aiDictationInterim}
                </div>
              )}

              <input
                ref={aiFileInputRef}
                type="file"
                accept=".txt,.md,.csv,.json,.log,.pdf,.docx,.html,.htm,.zip,text/*,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html,application/zip,application/x-zip-compressed"
                onChange={handleAiFileSelect}
                onClick={(e) => { (e.currentTarget as HTMLInputElement).value = ''; }}
                className="hidden"
              />

              <div className="mb-3 bg-slate-50 border border-slate-200 rounded-md p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm text-slate-700 flex-1">
                    <div className="font-medium flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Datei importieren (lokal)
                      <InfoPopover title="Dateiimport">
                        <div className="text-sm space-y-2">
                          <p>Unterstützte Formate: TXT, MD, CSV, JSON, LOG, DOCX, PDF (nur Textlayer), HTML, HTML ZIP.</p>
                          <p><strong>CSV-Modi:</strong> Rohtext, Jira-Tickets oder ServiceNow-Tickets.</p>
                          <p><strong>HTML-Modi:</strong> Rohtext oder strukturierte Ticket-Extraktion (Jira/ServiceNow).</p>
                        </div>
                      </InfoPopover>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Unterstützt: TXT/MD/CSV/JSON/LOG sowie DOCX und PDF (nur Textlayer, keine OCR für Scans), HTML (z.B. Wiki/Confluence Export) und HTML ZIP (z.B. Confluence/Wiki Export als ZIP-Bundle).
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-slate-500 font-medium">CSV-Modus:</span>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="aiCsvImportMode"
                          value="raw"
                          checked={aiCsvImportMode === 'raw'}
                          onChange={() => setAiCsvImportMode('raw')}
                          className="accent-slate-700"
                        />
                        <span className="text-xs text-slate-700">Rohtext</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="aiCsvImportMode"
                          value="jira"
                          checked={aiCsvImportMode === 'jira'}
                          onChange={() => setAiCsvImportMode('jira')}
                          className="accent-slate-700"
                        />
                        <span className="text-xs text-slate-700">Jira CSV (Tickets)</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="aiCsvImportMode"
                          value="servicenow"
                          checked={aiCsvImportMode === 'servicenow'}
                          onChange={() => setAiCsvImportMode('servicenow')}
                          className="accent-slate-700"
                        />
                        <span className="text-xs text-slate-700">ServiceNow CSV (Tickets)</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-slate-500 font-medium">HTML-Modus:</span>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="aiHtmlImportMode"
                        value="raw"
                        checked={aiHtmlImportMode === 'raw'}
                        onChange={() => setAiHtmlImportMode('raw')}
                        className="accent-slate-700"
                      />
                      <span className="text-xs text-slate-700">Rohtext (bereinigt)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="aiHtmlImportMode"
                        value="jira"
                        checked={aiHtmlImportMode === 'jira'}
                        onChange={() => setAiHtmlImportMode('jira')}
                        className="accent-slate-700"
                      />
                      <span className="text-xs text-slate-700">Jira HTML (Tickets)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="aiHtmlImportMode"
                        value="servicenow"
                        checked={aiHtmlImportMode === 'servicenow'}
                        onChange={() => setAiHtmlImportMode('servicenow')}
                        className="accent-slate-700"
                      />
                      <span className="text-xs text-slate-700">ServiceNow HTML (Tickets)</span>
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => aiFileInputRef.current?.click()}
                    disabled={aiDictationActive}
                    className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:bg-slate-400 flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Datei wählen
                  </button>
                </div>
              </div>

              {aiImportHint && (
                <div className="mb-3 bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-medium">
                        Erkannte Datei: Vorschlag{' '}
                        {aiImportHint.suggestedMode === 'jira' && 'Jira CSV'}
                        {aiImportHint.suggestedMode === 'servicenow' && 'ServiceNow CSV'}
                        {aiImportHint.suggestedMode === 'htmlzip' && 'HTML ZIP'}
                        {aiImportHint.suggestedMode === 'raw' && 'Rohtext CSV'}
                        {aiImportHint.suggestedMode === 'jira_html' && 'Jira HTML (Tickets)'}
                        {aiImportHint.suggestedMode === 'servicenow_html' && 'ServiceNow HTML (Tickets)'}
                        {' '}
                        <span className="font-normal text-blue-600">
                          (Konfidenz: {aiImportHint.confidence === 'high' ? 'hoch' : aiImportHint.confidence === 'medium' ? 'mittel' : 'niedrig'})
                        </span>
                      </div>
                      <div className="text-xs text-blue-700 mt-0.5">{aiImportHint.reason}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {aiImportHint.kind === 'csv' && (
                        <button
                          type="button"
                          onClick={() => {
                            setAiCsvImportMode(aiImportHint.suggestedMode as 'jira' | 'servicenow' | 'raw');
                            setAiImportHint(null);
                          }}
                          className="px-2 py-1 rounded bg-blue-700 text-white text-xs hover:bg-blue-800"
                        >
                          Vorschlag übernehmen
                        </button>
                      )}
                      {aiImportHint.kind === 'zip' && aiImportHint.suggestedMode === 'htmlzip' && (
                        <button
                          type="button"
                          onClick={() => {
                            setAiZipImportMode('htmlzip');
                            setAiImportHint(null);
                          }}
                          className="px-2 py-1 rounded bg-blue-700 text-white text-xs hover:bg-blue-800"
                        >
                          Als HTML ZIP importieren
                        </button>
                      )}
                      {aiImportHint.kind === 'html' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (aiImportHint.suggestedMode === 'jira_html') {
                              setAiHtmlImportMode('jira');
                            } else if (aiImportHint.suggestedMode === 'servicenow_html') {
                              setAiHtmlImportMode('servicenow');
                            }
                            setAiImportHint(null);
                            setStatusMessage('Importmodus umgestellt. Bitte Datei erneut wählen, um den Import anzuwenden.');
                          }}
                          className="px-2 py-1 rounded bg-blue-700 text-white text-xs hover:bg-blue-800"
                        >
                          Vorschlag übernehmen
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setAiImportHint(null)}
                        className="p-1 rounded text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                        title="Hinweis schliessen"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {aiFileError && (
                <div className="mb-3 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
                  {aiFileError}
                </div>
              )}

              {aiFilePending && (
                <div className="mb-3 bg-slate-50 border border-slate-200 rounded-md p-3 text-sm text-slate-700">
                  <div className="font-medium">
                    Datei "{aiFilePending.name}" gelesen. Soll der Text ersetzt oder angehängt werden?
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      onClick={handleAiApplyFileReplace}
                      className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800"
                    >
                      Ersetzen
                    </button>
                    <button
                      type="button"
                      onClick={handleAiApplyFileAppend}
                      className="px-3 py-2 rounded-md bg-slate-700 text-white text-sm hover:bg-slate-600"
                    >
                      Anhängen
                    </button>
                    <button
                      type="button"
                      onClick={handleAiCancelFilePending}
                      className="px-3 py-2 rounded-md bg-slate-200 text-slate-700 text-sm hover:bg-slate-300 flex items-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Abbrechen
                    </button>
                  </div>
                  <div className="text-xs text-slate-600 mt-2">
                    {aiCaptureMode === 'cases'
                      ? 'Tipp: Laden Sie mehrere Fälle nacheinander und wählen Sie „Anhängen". Jeder Import wird als eigener Fallblock geführt.'
                      : 'Tipp: Wenn Sie mehrere Artefakte haben, laden Sie sie nacheinander und wählen Sie „Anhängen".'}
                  </div>
                </div>
              )}

              {aiCaptureMode === 'cases' ? (
                <div className="space-y-3">
                  {caseBlocks.length === 0 && (
                    <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-md p-3">
                      Noch keine Fälle erfasst. Klicken Sie oben auf „Fall hinzufügen (Vorlage)".
                    </div>
                  )}

                  {caseBlocks.map((block, idx) => (
                    <div key={idx} className="border border-slate-200 rounded-md p-4 bg-white">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {normalizeCaseHeader(block.header, idx)}
                          </div>
                          {block.header.includes('Datei:') && (
                            <div className="text-xs text-slate-500 mt-1">{block.header}</div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCaseBlock(idx)}
                          className="px-3 py-2 rounded-md bg-slate-200 text-slate-700 text-sm hover:bg-slate-300"
                        >
                          Fall löschen
                        </button>
                      </div>

                      <textarea
                        value={block.body}
                        onChange={(e) => updateCaseBody(idx, e.target.value)}
                        placeholder="Beschreiben Sie diesen konkreten Fall (chronologisch, kurz, anonymisiert)."
                        className="mt-3 w-full h-40 px-3 py-2 border border-slate-300 rounded-md font-mono text-sm"
                      />
                    </div>
                  ))}

                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-slate-700">
                      Rohtext anzeigen (optional)
                    </summary>
                    <div className="mt-2">
                      <textarea
                        readOnly
                        value={aiRawText}
                        className="w-full h-40 px-3 py-2 border border-slate-300 rounded-md font-mono text-xs bg-slate-50"
                      />
                      <div className="text-xs text-slate-500 mt-1">
                        Hinweis: Rohtext ist read-only. Änderungen erfolgen über die Fallkarten.
                      </div>
                    </div>
                  </details>
                </div>
              ) : (
                <textarea
                  value={aiRawText}
                  onChange={(e) => setAiRawText(e.target.value)}
                  placeholder={
                    aiCaptureMode === 'artifact'
                      ? 'Beispiel: Der Prozess beginnt wenn ein Kunde eine Anfrage stellt...'
                      : 'Beschreiben Sie den letzten konkreten Fall...'
                  }
                  className="w-full h-48 px-3 py-2 border border-slate-300 rounded-md font-mono text-sm"
                />
              )}

              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Optional: Übersetzung (Zwischenschritt)
                  </h3>
                  <InfoPopover title="Übersetzung">
                    <div className="text-sm space-y-2">
                      <p>Die App übersetzt nicht automatisch. Sie entscheiden, ob und wie Sie übersetzen.</p>
                      <p>Wenn Sie eine Übersetzung hinzufügen, nutzt die KI beide Texte gemeinsam für bessere Ergebnisse.</p>
                      <p><strong>Datenschutz:</strong> Nutzen Sie einen Übersetzer Ihrer Wahl (z.B. lokal, intern).</p>
                    </div>
                  </InfoPopover>
                </div>
                <p className="text-xs text-slate-600 mb-3">
                  Wenn der Originaltext nicht deutsch ist (oder stark gemischt), können Sie hier eine Übersetzung einfügen.
                  Der Prompt nutzt dann Original + Übersetzung gemeinsam.
                </p>

                <textarea
                  value={aiTranslatedText}
                  onChange={(e) => setAiTranslatedText(e.target.value)}
                  placeholder="Hier optional die Übersetzung einfügen (z.B. Deutsch)."
                  className="w-full h-32 px-3 py-2 border border-slate-300 rounded-md font-mono text-sm"
                />

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => { setAiTranslatedText(''); setStatusMessage('Übersetzung geleert.'); }}
                    disabled={!aiTranslatedText.trim()}
                    className="px-3 py-2 rounded-md bg-slate-200 text-slate-700 text-sm hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    Übersetzung leeren
                  </button>
                </div>
              </div>

              <button
                onClick={handleGenerateAiPrompt}
                disabled={!aiRawText.trim() || aiDictationActive}
                className="mt-3 px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:bg-slate-400"
              >
                Claude-Prompt erzeugen
              </button>
            </div>

            {aiGeneratedPrompt && (
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">
                  Schritt 2: Prompt kopieren und in Claude einfügen
                </h2>
                <p className="text-sm text-slate-600 mb-3">
                  Kopieren Sie diesen Prompt, öffnen Sie Claude (claude.ai oder Claude Desktop), und
                  fügen Sie ihn dort ein.
                </p>
                <textarea
                  readOnly
                  value={aiGeneratedPrompt}
                  className="w-full h-64 px-3 py-2 border border-slate-300 rounded-md font-mono text-xs bg-slate-50"
                />
                <button
                  onClick={handleCopyPrompt}
                  className="mt-3 px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600"
                >
                  Prompt kopieren
                </button>
              </div>
            )}

            {settings.dataHandlingMode === 'external' && settings.ai.mode === 'api' && (
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">API (optional)</h2>
                  <InfoPopover title="API-Modus">
                    <div className="text-sm space-y-2">
                      <p>Sendet Prompts automatisch an Ihren konfigurierten Endpoint.</p>
                      <p><strong>Datenschutz:</strong> Prompt enthält Ihre Prozessdaten. Nutzen Sie nur vertrauenswürdige, sichere APIs.</p>
                      <p>Bestätigung erforderlich vor jedem Aufruf.</p>
                    </div>
                  </InfoPopover>
                </div>

                {settings.ai.api.endpointUrl.trim() ? (
                  <p className="text-sm text-slate-600 mb-3">
                    Endpoint: <span className="font-mono text-xs">{settings.ai.api.endpointUrl}</span>
                  </p>
                ) : (
                  <p className="text-sm text-yellow-700 mb-3">
                    Kein Endpoint konfiguriert. Bitte konfigurieren Sie einen Endpoint im Arbeitsbereich.
                  </p>
                )}

                <div className="mb-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={aiApiConsent}
                      onChange={(e) => setAiApiConsent(e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-slate-700">
                      Ich verstehe, dass der Prompt an einen externen Dienst gesendet wird.
                    </span>
                  </label>
                </div>

                {aiApiLastRequestPreview && (
                  <details className="mb-3">
                    <summary className="text-sm font-medium text-slate-700 cursor-pointer">
                      Request Preview
                    </summary>
                    <pre className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded text-xs font-mono overflow-x-auto">
                      {aiApiLastRequestPreview}
                    </pre>
                  </details>
                )}

                <button
                  onClick={handleRunAiExtractionViaApi}
                  disabled={
                    !aiApiConsent ||
                    !settings.ai.api.endpointUrl.trim() ||
                    !aiRawText.trim() ||
                    aiDictationActive ||
                    aiApiRunning ||
                    aiImporting
                  }
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-400"
                >
                  {aiApiRunning ? 'Sende...' : 'Per API senden (Antwort übernehmen)'}
                </button>

                {aiApiError && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-sm text-red-800 font-medium">API Fehler:</p>
                    <p className="text-sm text-red-700 mt-1">{aiApiError}</p>
                  </div>
                )}
              </div>
            )}

            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Schritt 3: Claude-Antwort (JSON) einfügen
              </h2>
              <p className="text-sm text-slate-600 mb-3">
                Kopieren Sie die komplette Antwort von Claude (inkl. JSON) und fügen Sie sie hier
                ein.
              </p>
              <textarea
                value={aiResponseJson}
                onChange={(e) => setAiResponseJson(e.target.value)}
                placeholder='{"schemaVersion": "ai-capture-v1", ...}'
                className="w-full h-48 px-3 py-2 border border-slate-300 rounded-md font-mono text-sm"
              />
              <button
                onClick={handleImportAiResponse}
                disabled={aiImporting || !aiResponseJson.trim() || !process || !version}
                className="mt-3 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-slate-400"
              >
                {aiImporting ? 'Importiere...' : 'Als neue Version importieren'}
              </button>

              {!process || !version ? (
                <p className="mt-3 text-sm text-yellow-700">
                  Hinweis: Bitte erst im Arbeitsbereich einen Prozess und eine Version erstellen/laden.
                </p>
              ) : null}

              {aiImportWarnings.length > 0 && (
                <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <h3 className="font-medium text-yellow-900 mb-2">Import-Hinweise:</h3>
                  <ul className="space-y-1 text-sm text-yellow-800">
                    {aiImportWarnings.map((warning, idx) => (
                      <li key={idx}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'report' && (
          <div className="space-y-6">
            {!process || !version ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                <p className="text-yellow-800">Bitte erst im Arbeitsbereich einen Prozess und eine Version erstellen/laden</p>
              </div>
            ) : (
              <ProcessReport process={process} version={version} />
            )}
          </div>
        )}

        {activeTab === 'changes' && (
          <div className="space-y-6">
            {renderVersionInfoHeader()}
            {!process || !version ? (
              <div className="bg-white rounded-lg border border-slate-200 p-6 text-sm text-slate-600">
                Bitte zuerst einen Prozess und eine Version laden.
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <VersionChangesView process={process} currentVersion={version} allVersions={versions} settings={settings} />
              </div>
            )}
          </div>
        )}

        {activeTab === 'improvements' && (
          <div className="space-y-6">
            {renderVersionInfoHeader()}
            {!process || !version ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                <p className="text-yellow-800">Bitte erst im Arbeitsbereich einen Prozess und eine Version erstellen/laden</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <ImprovementBacklogEditor
                  process={process}
                  version={version}
                  onSave={handleSaveDraftChanges}
                  settings={settings}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'mining' && (
          <div className="space-y-6">
            {renderVersionInfoHeader()}
            {!process || !version ? (
              <div className="bg-white rounded-lg border border-slate-200 p-6 text-sm text-slate-600">
                Bitte zuerst einen Prozess und eine Version laden.
              </div>
            ) : settings.uiMode === 'assisted' ? (
              <ErrorBoundary
                title="Assistiertes Process Mining"
                hint="Ein unerwarteter Fehler ist aufgetreten. Bitte neu laden."
              >
                <AssistedProcessMiningPanel
                  key={version.id}
                  process={process}
                  version={version}
                  settings={settings}
                  onSave={handleSaveDraftChanges}
                />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary
                title="Experten-Mining"
                hint="Ein unerwarteter Fehler im Process-Mining-Panel. Bitte das Event Log prüfen und ggf. neu importieren."
              >
                <ProcessMiningLitePanel
                  key={version.id}
                  process={process}
                  version={version}
                  onSave={handleSaveDraftChanges}
                  mappingSearchPreset={miningMappingSearchPreset}
                  onConsumedMappingSearchPreset={() => setMiningMappingSearchPreset('')}
                  settings={settings}
                  onGoToImprovement={(itemId) => goToTabAndScroll('improvements', `improvement-${itemId}`)}
                  onCreateVersionFromMining={handleCreateVersionFromMining}
                  miningView={miningWorkspaceView}
                  onMiningViewChange={setMiningWorkspaceView}
                />
              </ErrorBoundary>
            )}
          </div>
        )}

        {activeTab === 'issues' && (
          <div className="space-y-6">
            {renderVersionInfoHeader()}
            {!process || !version ? (
              <div className="bg-white rounded-lg border border-slate-200 p-6 text-sm text-slate-600">
                Bitte zuerst einen Prozess und eine Version laden.
              </div>
            ) : (
              <OpenIssuesDashboard
                version={version}
                onGoToReview={() => setActiveTab('review')}
                onGoToDraft={() => setActiveTab('draft')}
                onGoToMining={() => setActiveTab('mining')}
                onGoToStep={(stepId) => goToTabAndScroll('draft', `step-${stepId}`)}
                onGoToDecision={(decisionId) => goToTabAndScroll('draft', `decision-${decisionId}`)}
                onGoToException={(exceptionId) => goToTabAndScroll('draft', `exception-${exceptionId}`)}
                onGoToMiningActivity={(activityKey) => {
                  const mining = version.sidecar.processMining;
                  if (!mining) {
                    setActiveTab('mining');
                    return;
                  }
                  const m = mining.activityMappings.find((a) => a.activityKey === activityKey);
                  setMiningMappingSearchPreset(m?.example ?? activityKey);
                  setActiveTab('mining');
                }}
                onOpenSearchWithQuery={(q) => {
                  setGlobalSearchQuery(q);
                  setGlobalSearchOpen(true);
                }}
              />
            )}
          </div>
        )}
          </div>
        )}

            {activeTab === 'workshop' && (
              <div className="w-full px-4 lg:px-6 pb-6">
                {!process || !version ? (
                  <div className="bg-white rounded-lg border border-slate-200 p-6 text-sm text-slate-600">
                    Bitte zuerst einen Prozess und eine Version laden.
                  </div>
                ) : (
                  <WorkshopModeView
                    process={process}
                    version={version}
                    settings={settings}
                    onSave={handleSaveDraftChanges}
                    onGoToDraft={() => setActiveTab('draft')}
                    onGoToReview={() => setActiveTab('review')}
                    onGoToMining={() => setActiveTab('mining')}
                    onOpenSearchWithQuery={(q) => {
                      setGlobalSearchQuery(q);
                      setGlobalSearchOpen(true);
                    }}
                    onGoToStep={(stepId) => goToTabAndScroll('draft', `step-${stepId}`)}
                    onSetMiningFilter={(text) => {
                      setMiningMappingSearchPreset(text);
                    }}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {evidenceModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg border border-slate-200 w-full max-w-2xl p-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Evidence</div>
                <div className="text-xs text-slate-600 mt-1">{evidenceModalTitle}</div>
              </div>
              <button
                type="button"
                onClick={() => setEvidenceModalOpen(false)}
                className="px-3 py-2 rounded-md bg-slate-200 text-slate-700 text-sm hover:bg-slate-300"
              >
                Schließen
              </button>
            </div>

            {evidenceModalRefId && (
              <div className="mt-3">
                <div className="text-xs font-medium text-slate-700 mb-1">Quelle:</div>
                <div className="bg-blue-50 border border-blue-200 rounded-md p-2 text-sm text-blue-900">
                  {evidenceModalRefId}
                </div>
              </div>
            )}

            {evidenceModalText && (
              <div className="mt-3">
                <div className="text-xs font-medium text-slate-700 mb-1">Snippet:</div>
                <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-sm text-slate-800 whitespace-pre-wrap">
                  {evidenceModalText}
                </div>
              </div>
            )}

            {(() => {
              if (!evidenceModalRefId || !version?.sidecar.evidenceSources) return null;

              const source = version.sidecar.evidenceSources.find((s) => s.refId === evidenceModalRefId);

              if (!source) {
                return (
                  <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
                    Kein Quelltext für diese Quelle gespeichert.
                  </div>
                );
              }

              if (!evidenceModalText.trim()) {
                return (
                  <div className="mt-3 bg-slate-50 border border-slate-200 rounded-md p-3 text-sm text-slate-600">
                    Snippet leer – kann keine Fundstellen anzeigen.
                  </div>
                );
              }

              const matches = findEvidenceContexts(source.text, evidenceModalText, 3);

              if (matches.length === 0) {
                return (
                  <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
                    Snippet im Quelltext nicht gefunden (evtl. paraphrasiert).
                  </div>
                );
              }

              return (
                <div className="mt-3">
                  <div className="text-xs font-medium text-slate-700 mb-2">
                    Fundstellen im Quelltext ({matches.length}):
                  </div>
                  <div className="space-y-2">
                    {matches.map((m, idx) => (
                      <div key={idx} className="bg-green-50 border border-green-200 rounded-md p-3 text-sm">
                        <div className="text-xs text-green-800 mb-1">
                          Zeile {m.line}, Position {m.charIndex}
                        </div>
                        <div className="text-slate-800">
                          <span className="text-slate-500">{m.contextBefore}</span>
                          <mark className="bg-yellow-200 font-semibold">{m.match}</mark>
                          <span className="text-slate-500">{m.contextAfter}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="mt-3 text-xs text-slate-600">
              Hinweis: Evidence ist rein textbasiert. Audio-Quellen (Zeitmarken/Sprecher) folgen später.
            </div>
          </div>
        </div>
      )}

      {globalSearchOpen && process && version && (
        <GlobalSearchModal
          process={process}
          version={version}
          query={globalSearchQuery}
          setQuery={setGlobalSearchQuery}
          onClose={() => setGlobalSearchOpen(false)}
          onGoToStep={(stepId) => goToTabAndScroll('draft', `step-${stepId}`)}
          onGoToDecision={(decisionId) => goToTabAndScroll('draft', `decision-${decisionId}`)}
          onGoToException={(exceptionId) => goToTabAndScroll('draft', `exception-${exceptionId}`)}
          onGoToImprovement={(itemId) => goToTabAndScroll('improvements', `improvement-${itemId}`)}
          onGoToReview={() => {
            setActiveTab('review');
            setGlobalSearchOpen(false);
          }}
          onGoToMiningActivity={(activityKey) => {
            if (!version?.sidecar.processMining) {
              setActiveTab('mining');
              setGlobalSearchOpen(false);
              return;
            }
            const m = version.sidecar.processMining.activityMappings.find((a) => a.activityKey === activityKey);
            setMiningMappingSearchPreset(m?.example ?? activityKey);
            setActiveTab('mining');
            setGlobalSearchOpen(false);
          }}
        />
      )}

      {globalSearchOpen && (!process || !version) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg border border-slate-200 p-6 max-w-md">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Suche nicht verfügbar</h2>
            <p className="text-sm text-slate-600 mb-4">
              Bitte zuerst einen Prozess und eine Version laden.
            </p>
            <button
              onClick={() => setGlobalSearchOpen(false)}
              className="w-full px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800"
            >
              Schließen
            </button>
          </div>
        </div>
      )}

      {bpmnPreviewOpen && version?.bpmn.bpmnXml && (
        <BpmnViewerModal
          title="BPMN Vorschau"
          bpmnXml={version.bpmn.bpmnXml}
          onClose={() => setBpmnPreviewOpen(false)}
          onGoToStep={(stepId) => {
            goToTabAndScroll('draft', `step-${stepId}`);
          }}
        />
      )}
    </div>
  );
}

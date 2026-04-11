import { useState, useRef, useCallback } from 'react';
import {
  Upload,
  FileText,
  Table,
  AlertTriangle,
  CheckCircle2,
  X,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Loader,
  Sparkles,
  Info,
} from 'lucide-react';
import type { ProcessMiningObservationCase, ProcessMiningObservation, DerivationSummary } from '../../domain/process';
import { extractTextFromPdf } from '../../import/extractTextFromPdf';
import { extractTextFromDocx } from '../../import/extractTextFromDocx';
import { extractTablesFromXlsx } from '../../import/extractTextFromXlsx';
import type { XlsxSheet } from '../../import/extractTextFromXlsx';
import { parseCsvForImport } from './fileImport';
import { deriveProcessArtifactsFromText } from './documentDerivation';
import { runTableEventPipeline } from './tableEventPipeline';
import { getAnalysisModeLabel } from './pmShared';
import type { DerivationResult } from './documentDerivation';
import { HelpPopover } from '../components/HelpPopover';
import { LocalEngineProfilePanel } from './LocalEngineProfilePanel';
import { analyzeTableSource } from '../../import/tableSourceAnalysis';

type FileType = 'docx' | 'pdf' | 'csv' | 'xlsx';
type ImportPhase = 'idle' | 'loading' | 'deriving' | 'preview-doc' | 'preview-derived' | 'config-table' | 'done';

interface Props {
  onImport: (
    cases: ProcessMiningObservationCase[],
    observations: ProcessMiningObservation[],
    derivationSummary?: DerivationSummary,
  ) => void;
}

function ConfidenceBadge({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const map = {
    high: { label: 'Hohe Verlässlichkeit', cls: 'bg-green-100 text-green-800' },
    medium: { label: 'Mittlere Verlässlichkeit', cls: 'bg-amber-100 text-amber-800' },
    low: { label: 'Niedrige Verlässlichkeit', cls: 'bg-red-100 text-red-800' },
  };
  const { label, cls } = map[confidence];
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function MethodBadge({ method }: { method: DerivationResult['method'] }) {
  const map = {
    'structured': 'Strukturiert erkannt',
    'semi-structured': 'Halbstrukturiert erkannt',
    'narrative-fallback': 'Aus Freitext extrahiert',
  };
  return <span className="text-xs text-slate-500">{map[method]}</span>;
}

function DocKindBadge({ kind }: { kind: DerivationResult['documentKind'] }) {
  if (kind === 'procedure-document') return <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded">Verfahrensbeschreibung erkannt</span>;
  if (kind === 'semi-structured-procedure-document') return <span className="text-xs font-medium bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">Semistrukturiertes Verfahrensdokument</span>;
  if (kind === 'case-narrative') return <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Fallbeschreibung erkannt</span>;
  if (kind === 'mixed-document') return <span className="text-xs font-medium bg-violet-50 text-violet-700 px-2 py-0.5 rounded">Mischdokument erkannt</span>;
  if (kind === 'weak-material') return <span className="text-xs font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded">Schwaches Ausgangsmaterial</span>;
  return <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded">Unbekannter Dokumenttyp</span>;
}

function routingClassLabel(value: string) {
  const labels: Record<string, string> = {
    'structured-procedure': 'structured-procedure',
    'semi-structured-procedure': 'semi-structured-procedure',
    'narrative-case': 'narrative-case',
    'mixed-document': 'mixed-document',
    'eventlog-table': 'eventlog-table',
    'weak-raw-table': 'weak-raw-table',
  };
  return labels[value] ?? value;
}

function DerivationResultCard({
  result,
  fileName,
  onAccept,
  onCancel,
}: {
  result: DerivationResult;
  fileName: string;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const [showSteps, setShowSteps] = useState(true);
  const [showText, setShowText] = useState(false);

  return (
    <div className="border border-slate-200 rounded-xl p-5 space-y-4 bg-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="font-semibold text-sm text-slate-700">{fileName}</span>
          <DocKindBadge kind={result.documentKind} />
        </div>
        <button type="button" onClick={onCancel}><X className="w-4 h-4 text-slate-400 hover:text-slate-600" /></button>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-blue-500" />
          <span className="font-semibold text-slate-700">{result.derivedSteps.length} Schritte erkannt</span>
        </div>
        {result.roles.length > 0 && (
          <div className="text-slate-500">
            Rollen: {result.roles.slice(0, 4).join(', ')}{result.roles.length > 4 ? ', …' : ''}
          </div>
        )}
        {result.systems.length > 0 && (
          <div className="text-slate-500">
            Systeme: {result.systems.slice(0, 4).join(', ')}{result.systems.length > 4 ? ', …' : ''}
          </div>
        )}
        <ConfidenceBadge confidence={result.confidence} />
        <MethodBadge method={result.method} />
      </div>

      <div className="text-xs text-slate-500">{getAnalysisModeLabel(result.summary.analysisMode)}</div>

      {result.summary.documentSummary && (
        <div className="text-xs text-slate-500 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          {result.summary.documentSummary}
        </div>
      )}

      <LocalEngineProfilePanel summary={result.summary} />

      {result.summary.repairNotes && result.summary.repairNotes.length > 0 && (
        <div className="space-y-1">
          {result.summary.repairNotes.map((note, index) => (
            <div key={index} className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">
              {note}
            </div>
          ))}
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{result.warnings.join(' ')}</span>
        </div>
      )}

      {result.issueSignals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.issueSignals.slice(0, 5).map((signal, index) => (
            <span key={index} className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded">{signal}</span>
          ))}
        </div>
      )}

      {result.derivedSteps.length > 0 && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowSteps(s => !s)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800"
          >
            {showSteps ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Erkannte Prozessschritte
          </button>
          {showSteps && (
            <ol className="space-y-1 pl-1">
              {result.derivedSteps.slice(0, 10).map((s, i) => (
                <li key={i} className="flex gap-2 text-xs text-slate-700">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold">{i + 1}</span>
                  <span className="leading-relaxed">{s.label}{s.role ? <span className="text-slate-400"> ({s.role})</span> : ''}</span>
                </li>
              ))}
              {result.derivedSteps.length > 10 && (
                <li className="text-xs text-slate-400 pl-7">… und {result.derivedSteps.length - 10} weitere</li>
              )}
            </ol>
          )}
        </div>
      )}

      {result.observations.length === 0 && (
        <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Keine Prozessschritte erkennbar. Der Text wird als Fallbeschreibung gespeichert und kann anschließend manuell ergänzt werden.</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowText(s => !s)}
        className="text-xs text-slate-400 underline hover:text-slate-600"
      >
        {showText ? 'Textvorschau ausblenden' : 'Originaltext anzeigen'}
      </button>

      {showText && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-3 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto">
          {result.cases[0]?.rawText || result.cases[0]?.narrative || 'Keine Textvorschau verfügbar.'}
        </div>
      )}

      <div className="flex gap-2 flex-wrap pt-1">
        <button
          type="button"
          onClick={onAccept}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          Prozess übernehmen
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50 transition-colors">
          Abbrechen
        </button>
      </div>
    </div>
  );
}

function TableImportConfig({
  headers,
  rows,
  fileName,
  sheets,
  activeSheet,
  onSheetChange,
  onImport,
  onCancel,
}: {
  headers: string[];
  rows: string[][];
  fileName: string;
  sheets?: XlsxSheet[];
  activeSheet: number;
  onSheetChange: (i: number) => void;
  onImport: (headers: string[], rows: string[][]) => void;
  onCancel: () => void;
}) {
  const tableSourceType = fileName.toLowerCase().endsWith('.xlsx') ? 'xlsx-row' : 'csv-row';
  const analysis = analyzeTableSource({ headers, rows, sourceType: tableSourceType });
  const acceptedMappings = analysis.acceptedColumnMappings;
  const rejectedMappings = analysis.rejectedColumnMappings.filter(mapping => mapping.confidence >= 0.4);

  return (
    <div className="border border-slate-200 rounded-xl p-5 space-y-4 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Table className="w-4 h-4 text-slate-400" />
            <span className="font-semibold text-sm text-slate-700">{fileName}</span>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-slate-700">Tabellendatei analysieren</p>
            <HelpPopover helpKey="pmv2.fileimport.table" ariaLabel="Hilfe: Tabellendatei analysieren" />
          </div>
          <p className="text-xs text-slate-500">
            Die Tabelle wird automatisch profiliert, auf Eventlog-Mindeststruktur geprüft und dann entweder als echtes Eventlog oder defensiv als weak-raw-table importiert.
          </p>
        </div>
        <button type="button" onClick={onCancel}><X className="w-4 h-4 text-slate-400 hover:text-slate-600" /></button>
      </div>

      {sheets && sheets.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {sheets.map((s, i) => (
            <button key={i} type="button" onClick={() => onSheetChange(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeSheet === i ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >{s.name}</button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-cyan-900">Quellen-Router</span>
          <span className="rounded-full border border-cyan-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-cyan-800">
            {routingClassLabel(analysis.routingContext.routingClass)}
          </span>
          <span className="rounded-full border border-cyan-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-cyan-800">
            {analysis.routingContext.routingConfidence}
          </span>
          <span className="rounded-full border border-cyan-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-cyan-800">
            {analysis.pipelineMode}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-cyan-900">
          Finaler Tabellenpfad: {analysis.pipelineMode === 'eventlog-table' ? 'echtes Eventlog-Mining' : 'defensiver weak-raw-table-Modus'}.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {analysis.routingContext.routingSignals.slice(0, 6).map(signal => (
            <span key={signal} className="rounded-full border border-cyan-200 bg-white px-2 py-0.5 text-[11px] text-cyan-800">
              {signal}
            </span>
          ))}
        </div>
        {analysis.routingContext.fallbackReason && (
          <p className="text-[11px] leading-relaxed text-cyan-900">
            Defensive Einordnung: {analysis.routingContext.fallbackReason}
          </p>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-x-auto">
        <p className="text-xs font-semibold text-slate-500 mb-2">{headers.length} Spalten · {rows.length} Zeilen</p>
        <table className="text-xs text-slate-600 w-full">
          <thead><tr>{headers.map((h, i) => <th key={i} className="text-left px-1 py-0.5 font-semibold">{h || `S${i + 1}`}</th>)}</tr></thead>
          <tbody>{rows.slice(0, 3).map((row, ri) => <tr key={ri}>{headers.map((_, ci) => <td key={ci} className="px-1 py-0.5 truncate max-w-[100px]">{row[ci] ?? ''}</td>)}</tr>)}</tbody>
        </table>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-700">Akzeptierte Spaltenmappings</p>
          <div className="space-y-1.5">
            {acceptedMappings.length > 0 ? acceptedMappings.map(mapping => (
              <div key={`${mapping.columnIndex}-${mapping.inferredSemanticType}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{mapping.header}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600">{mapping.inferredSemanticType}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600">{mapping.confidence.toFixed(2)}</span>
                </div>
                {mapping.supportingSignals.length > 0 && (
                  <p className="mt-1 text-[11px] text-slate-500">{mapping.supportingSignals.slice(0, 3).join(' · ')}</p>
                )}
              </div>
            )) : (
              <p className="text-xs text-slate-500">Keine belastbaren Kern- oder Stützspalten erkannt.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-700">Eventlog-Mindeststruktur</p>
          <div className="space-y-1.5">
            {analysis.eventlogEligibility.minimumCriteria?.map(criteria => (
              <div key={criteria.key} className={`rounded-lg border px-3 py-2 text-xs ${criteria.passed ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                <div className="font-semibold">{criteria.key}</div>
                <div className="mt-0.5">{criteria.detail}</div>
              </div>
            ))}
          </div>
          {rejectedMappings.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {rejectedMappings.length} weitere Spalten wurden nicht als belastbares Kernmapping akzeptiert.
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => onImport(headers, rows)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          {analysis.pipelineMode === 'eventlog-table' ? 'Tabellenanalyse übernehmen' : 'Defensiv als weak-raw-table importieren'}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50 transition-colors">
          Abbrechen
        </button>
      </div>
    </div>
  );
}

export function FileImportPanel({ onImport }: Props) {
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [parsedFile, setParsedFile] = useState<{
    name: string;
    type: FileType;
    text?: string;
    csvHeaders?: string[];
    csvRows?: string[][];
    xlsxSheets?: XlsxSheet[];
    warnings: string[];
  } | null>(null);
  const [derivationResult, setDerivationResult] = useState<DerivationResult | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [doneInfo, setDoneInfo] = useState<{ caseCount: number; stepCount: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function getFileType(name: string): FileType | null {
    const lower = name.toLowerCase();
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.endsWith('.docx')) return 'docx';
    if (lower.endsWith('.csv')) return 'csv';
    if (lower.endsWith('.xlsx')) return 'xlsx';
    return null;
  }

  async function handleFile(file: File) {
    setError('');
    const type = getFileType(file.name);
    if (!type) {
      setError('Nicht unterstütztes Format. Bitte lade eine DOCX-, PDF-, CSV- oder XLSX-Datei hoch.');
      return;
    }
    setPhase('loading');
    try {
      if (type === 'pdf') {
        let text: string;
        try {
          const r = await extractTextFromPdf(file);
          text = r.text;
        } catch (e) {
          const msg = e instanceof Error ? e.message : '';
          if (msg.includes('keinen extrahierbaren Text') || msg.toLowerCase().includes('scan')) {
            setError('Dieses PDF enthält keinen lesbaren Textlayer und kann nicht direkt ausgewertet werden.');
          } else {
            setError(`PDF konnte nicht gelesen werden: ${msg}`);
          }
          setPhase('idle');
          return;
        }
        setParsedFile({ name: file.name, type, text, warnings: [] });
        setPhase('deriving');
        const result = deriveProcessArtifactsFromText({ text, fileName: file.name, sourceType: 'pdf' });
        setDerivationResult(result);
        setPhase('preview-derived');

      } else if (type === 'docx') {
        const r = await extractTextFromDocx(file);
        setParsedFile({ name: file.name, type, text: r.text, warnings: r.warnings });
        setPhase('deriving');
        const result = deriveProcessArtifactsFromText({ text: r.text, fileName: file.name, sourceType: 'docx' });
        setDerivationResult(result);
        setPhase('preview-derived');

      } else if (type === 'csv') {
        const text = await file.text();
        const { headers, rows } = parseCsvForImport(text);
        setParsedFile({ name: file.name, type, csvHeaders: headers, csvRows: rows, warnings: [] });
        setPhase('config-table');

      } else if (type === 'xlsx') {
        const r = await extractTablesFromXlsx(file);
        if (r.sheets.length === 0) {
          setError('Die XLSX-Datei enthält keine lesbaren Tabellen.');
          setPhase('idle');
          return;
        }
        setParsedFile({ name: file.name, type, xlsxSheets: r.sheets, warnings: r.warnings });
        setActiveSheet(0);
        setPhase('config-table');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Die Datei konnte nicht gelesen werden.');
      setPhase('idle');
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  function handleTableImport(headers: string[], rows: string[][]) {
    if (!parsedFile) return;
    const tableSourceType = parsedFile.type === 'xlsx' ? 'xlsx-row' : 'csv-row';
    const result = runTableEventPipeline({
      fileName: parsedFile.name,
      sourceType: tableSourceType,
      headers,
      rows,
    });
    onImport(result.cases, result.observations, result.summary);
    setDoneInfo({
      caseCount: result.cases.length,
      stepCount: result.observations.filter(item => item.kind === 'step').length,
    });
    setPhase('done');
  }

  function handleSheetChange(idx: number) {
    setActiveSheet(idx);
  }

  function reset() {
    setPhase('idle');
    setParsedFile(null);
    setDerivationResult(null);
    setError('');
    setActiveSheet(0);
    setDoneInfo(null);
  }

  const currentHeaders = parsedFile?.csvHeaders ?? parsedFile?.xlsxSheets?.[activeSheet]?.headers ?? [];
  const currentRows = parsedFile?.csvRows ?? parsedFile?.xlsxSheets?.[activeSheet]?.rows ?? [];

  if (phase === 'done') {
    return (
      <div className="border border-green-200 rounded-xl bg-green-50 p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <div>
            <p className="font-semibold text-green-800 text-sm">Import erfolgreich</p>
            {doneInfo && (
              <p className="text-xs text-green-700">
                {doneInfo.caseCount} {doneInfo.caseCount === 1 ? 'Fall' : 'Fälle'} importiert · {doneInfo.stepCount} Schritte automatisch erkannt
              </p>
            )}
          </div>
        </div>
        <button type="button" onClick={reset} className="text-xs text-green-700 underline hover:text-green-800 shrink-0">
          Weitere Datei importieren
        </button>
      </div>
    );
  }

  if (phase === 'loading' || phase === 'deriving') {
    return (
      <div className="border border-slate-200 rounded-xl p-8 flex flex-col items-center gap-3 bg-white">
        <Loader className="w-6 h-6 text-blue-500 animate-spin" />
        <p className="text-sm text-slate-500">
          {phase === 'loading' ? 'Datei wird gelesen…' : 'Prozessschritte werden automatisch erkannt…'}
        </p>
      </div>
    );
  }

  if (phase === 'preview-derived' && derivationResult && parsedFile) {
    return (
      <DerivationResultCard
        result={derivationResult}
        fileName={parsedFile.name}
        onAccept={() => {
          onImport(derivationResult.cases, derivationResult.observations, derivationResult.summary);
          setDoneInfo({ caseCount: derivationResult.cases.length, stepCount: derivationResult.derivedSteps.length });
          setPhase('done');
        }}
        onCancel={reset}
      />
    );
  }

  if (phase === 'config-table' && parsedFile) {
    return (
      <TableImportConfig
        headers={currentHeaders}
        rows={currentRows}
        fileName={parsedFile.name}
        sheets={parsedFile.xlsxSheets}
        activeSheet={activeSheet}
        onSheetChange={handleSheetChange}
        onImport={handleTableImport}
        onCancel={reset}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-slate-800">Dokument hochladen</p>
        <HelpPopover helpKey="pmv2.observations.upload" ariaLabel="Hilfe: Dokument hochladen" />
      </div>

      {error && (
        <div className="flex gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-300 hover:bg-blue-50/30'
        }`}
      >
        <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.csv,.xlsx" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
        <div className="flex flex-col items-center gap-3">
          <Upload className="w-8 h-8 text-slate-300" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-600">Datei hierher ziehen oder klicken zum Auswählen</p>
            <p className="text-xs text-slate-400">DOCX und PDF werden automatisch ausgewertet · CSV und XLSX werden tabellarisch importiert</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {([
          { fmt: 'DOCX', desc: 'Automatisch auswerten' },
          { fmt: 'PDF', desc: 'Automatisch auswerten' },
          { fmt: 'CSV', desc: 'Tabelle importieren' },
          { fmt: 'XLSX', desc: 'Tabelle importieren' },
        ] as const).map(({ fmt, desc }) => (
          <div key={fmt} className="flex flex-col bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-700">{fmt}</span>
            </div>
            <span className="text-xs text-slate-400 mt-0.5">{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { FileText, Download, Upload, AlertTriangle } from 'lucide-react';
import type { Process, ProcessVersion, ProcessRole, ProcessSystem } from '../domain/process';
import type { WorkType, StepLeadTimeBucket, StepLevelBucket } from '../domain/capture';
import { createInitialCaptureDraft } from '../domain/capture';
import { parseCsvText } from '../import/csv';
import { normalizeCatalogToken } from '../utils/catalogAliases';

interface HappyPathCsvImportProps {
  process: Process;
  version: ProcessVersion;
  onSave: (patch: Partial<ProcessVersion>) => Promise<void>;
}

interface PreviewRow {
  order?: number;
  label: string;
  role?: string;
  system?: string;
  workType?: WorkType;
  processingTime?: StepLeadTimeBucket;
  waitingTime?: StepLeadTimeBucket;
  volume?: StepLevelBucket;
  rework?: StepLevelBucket;
  painPointHint?: string;
  toBeHint?: string;
}

type ImportMode = 'replace' | 'append';

export function HappyPathCsvImport({ version, onSave }: HappyPathCsvImportProps) {
  const [parseError, setParseError] = useState<string>('');
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>('replace');
  const [importRoles, setImportRoles] = useState(true);
  const [importSystems, setImportSystems] = useState(true);
  const [acknowledgeReplaceWarning, setAcknowledgeReplaceWarning] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [importing, setImporting] = useState(false);

  const stepScopedImprovementCount =
    (version.sidecar.improvementBacklog ?? []).filter((i) => i.scope === 'step').length;

  const hasDecisionsOrExceptions =
    (version.sidecar.captureDraft?.decisions?.length ?? 0) > 0 ||
    (version.sidecar.captureDraft?.exceptions?.length ?? 0) > 0;

  const hasStepScopedImprovements = stepScopedImprovementCount > 0;

  const needsWarningAcknowledgment =
    importMode === 'replace' && (hasDecisionsOrExceptions || hasStepScopedImprovements);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setParseError('');
    setPreview([]);
    setSuccessMessage('');
    setAcknowledgeReplaceWarning(false);

    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseCsvText(text);

      const labelCol = findColumn(parsed.headers, ['label', 'schritt', 'bezeichnung', 'aktivitaet', 'aktivität']);
      if (labelCol === -1) {
        setParseError('Keine Label-Spalte gefunden. Erforderlich: "label", "schritt", "bezeichnung" oder ähnlich.');
        return;
      }

      const orderCol = findColumn(parsed.headers, ['order', 'nr', 'nummer', 'reihenfolge']);
      const roleCol = findColumn(parsed.headers, ['role', 'rolle']);
      const systemCol = findColumn(parsed.headers, ['system', 'it', 'applikation']);
      const workTypeCol = findColumn(parsed.headers, ['workType', 'work_type', 'typ']);
      const processingTimeCol = findColumn(parsed.headers, ['processingTime', 'bearbeitungszeit', 'bearbeitungszeit_bucket', 'processing_time']);
      const waitingTimeCol = findColumn(parsed.headers, ['waitingTime', 'wartezeit', 'liegezeit', 'waiting_time']);
      const volumeCol = findColumn(parsed.headers, ['volume', 'haeufigkeit', 'häufigkeit', 'volumen', 'frequency_step']);
      const reworkCol = findColumn(parsed.headers, ['rework', 'nacharbeit', 'rework_rate', 'rework_bucket']);
      const painPointCol = findColumn(parsed.headers, ['painPointHint', 'painpoint', 'problem', 'schmerzpunkt']);
      const toBeCol = findColumn(parsed.headers, ['toBeHint', 'tobe', 'to_be', 'zukunft', 'to-be']);

      const rows: PreviewRow[] = [];

      for (const row of parsed.rows) {
        const labelValue = row[labelCol]?.trim() || '';
        if (!labelValue) {
          continue;
        }

        const previewRow: PreviewRow = {
          label: labelValue,
        };

        if (orderCol !== -1) {
          const orderValue = parseInt(row[orderCol], 10);
          if (!isNaN(orderValue)) {
            previewRow.order = orderValue;
          }
        }

        if (roleCol !== -1) {
          const roleValue = row[roleCol]?.trim();
          if (roleValue) previewRow.role = roleValue;
        }

        if (systemCol !== -1) {
          const systemValue = row[systemCol]?.trim();
          if (systemValue) previewRow.system = systemValue;
        }

        if (workTypeCol !== -1) {
          const workTypeValue = mapWorkType(row[workTypeCol]?.trim());
          if (workTypeValue) previewRow.workType = workTypeValue;
        }

        if (processingTimeCol !== -1) {
          const processingTimeValue = mapStepLeadTimeBucket(row[processingTimeCol]?.trim());
          if (processingTimeValue) previewRow.processingTime = processingTimeValue;
        }

        if (waitingTimeCol !== -1) {
          const waitingTimeValue = mapStepLeadTimeBucket(row[waitingTimeCol]?.trim());
          if (waitingTimeValue) previewRow.waitingTime = waitingTimeValue;
        }

        if (volumeCol !== -1) {
          const volumeValue = mapStepLevelBucket(row[volumeCol]?.trim());
          if (volumeValue) previewRow.volume = volumeValue;
        }

        if (reworkCol !== -1) {
          const reworkValue = mapStepLevelBucket(row[reworkCol]?.trim());
          if (reworkValue) previewRow.rework = reworkValue;
        }

        if (painPointCol !== -1) {
          const painValue = row[painPointCol]?.trim();
          if (painValue) previewRow.painPointHint = painValue;
        }

        if (toBeCol !== -1) {
          const toBeValue = row[toBeCol]?.trim();
          if (toBeValue) previewRow.toBeHint = toBeValue;
        }

        rows.push(previewRow);
      }

      if (rows.length === 0) {
        setParseError('Keine gültigen Zeilen mit Label gefunden.');
        return;
      }

      setPreview(rows);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Fehler beim Lesen der Datei.');
    }
  };

  const handleImport = async () => {
    if (preview.length === 0) return;
    if (needsWarningAcknowledgment && !acknowledgeReplaceWarning) {
      setParseError('Bitte bestätigen Sie die Warnung.');
      return;
    }

    setImporting(true);
    setParseError('');
    setSuccessMessage('');

    try {
      const draft = version.sidecar.captureDraft ?? createInitialCaptureDraft();
      const updatedRoles = [...(version.sidecar.roles || [])];
      const updatedSystems = [...(version.sidecar.systems || [])];

      const roleKeyToId = new Map<string, string>();
      updatedRoles.forEach((role) => {
        roleKeyToId.set(normalizeCatalogToken(role.name), role.id);
        (role.aliases || []).forEach((alias) => {
          roleKeyToId.set(normalizeCatalogToken(alias), role.id);
        });
      });

      const systemKeyToId = new Map<string, string>();
      updatedSystems.forEach((system) => {
        systemKeyToId.set(normalizeCatalogToken(system.name), system.id);
        (system.aliases || []).forEach((alias) => {
          systemKeyToId.set(normalizeCatalogToken(alias), system.id);
        });
      });

      const sortedRows = [...preview];
      if (sortedRows.some((r) => r.order !== undefined)) {
        sortedRows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      }

      let startOrder = 1;
      if (importMode === 'append') {
        const maxOrder = Math.max(0, ...(draft.happyPath || []).map((s) => s.order));
        startOrder = maxOrder + 1;
      }

      const importedSteps = sortedRows.map((row, idx) => {
        const stepId = crypto.randomUUID();

        let roleId: string | undefined;
        if (importRoles && row.role) {
          const key = normalizeCatalogToken(row.role);
          roleId = roleKeyToId.get(key);

          if (!roleId) {
            const newRole: ProcessRole = {
              id: crypto.randomUUID(),
              name: row.role,
              kind: 'role',
            };
            updatedRoles.push(newRole);
            roleId = newRole.id;
            roleKeyToId.set(key, roleId);
          }
        }

        let systemId: string | undefined;
        if (importSystems && row.system) {
          const key = normalizeCatalogToken(row.system);
          systemId = systemKeyToId.get(key);

          if (!systemId) {
            const newSystem: ProcessSystem = {
              id: crypto.randomUUID(),
              name: row.system,
            };
            updatedSystems.push(newSystem);
            systemId = newSystem.id;
            systemKeyToId.set(key, systemId);
          }
        }

        return {
          stepId,
          order: startOrder + idx,
          label: row.label,
          roleId,
          systemId,
          workType: row.workType,
          processingTime: row.processingTime,
          waitingTime: row.waitingTime,
          volume: row.volume,
          rework: row.rework,
          painPointHint: row.painPointHint,
          toBeHint: row.toBeHint,
        };
      });

      const newHappyPath = importMode === 'replace' ? importedSteps : [...(draft.happyPath || []), ...importedSteps];

      await onSave({
        sidecar: {
          ...version.sidecar,
          roles: updatedRoles,
          systems: updatedSystems,
          captureDraft: {
            ...draft,
            happyPath: newHappyPath,
          },
        },
        captureProgress: {
          ...version.captureProgress,
          phaseStates: {
            ...version.captureProgress.phaseStates,
            happy_path: newHappyPath.length >= 5 ? 'done' : 'in_progress',
          },
          lastTouchedAt: new Date().toISOString(),
        },
      });

      setSuccessMessage(`Import abgeschlossen: ${importedSteps.length} Schritte übernommen.`);
      setPreview([]);
      setAcknowledgeReplaceWarning(false);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Fehler beim Import.');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const template = `sep=;
order;label;role;system;workType;processingTime;waitingTime;volume;rework;painPointHint;toBeHint
1;Kundenanfrage erfassen;Service Agent;Ticket-System;user_task;minutes;hours;high;low;Manuelle Erfassung in mehreren Systemen;Automatische Erfassung über Webformular
2;Anfrage prüfen;Backoffice;ERP-System;user_task;hours;1_day;medium;medium;;
3;Angebot erstellen;Vertrieb;CRM;user_task;1_day;2_5_days;low;low;;
`;

    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'happy-path-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-semibold text-slate-900">Happy Path CSV-Import</h3>
        </div>
        <button
          onClick={handleDownloadTemplate}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
        >
          <Download className="w-4 h-4" />
          CSV-Vorlage herunterladen
        </button>
      </div>

      <div className="text-sm text-slate-600 space-y-1">
        <p>Importieren Sie Happy Path Schritte aus einer CSV-Datei (Excel-kompatibel).</p>
        <p className="text-xs">
          <strong>Pflichtspalte:</strong> label (oder: schritt, bezeichnung)
          <br />
          <strong>Optionale Spalten:</strong> order, role, system, workType, processingTime, waitingTime, volume, rework, painPointHint, toBeHint
        </p>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer">
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

        {preview.length > 0 && (
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={importMode === 'replace'}
                onChange={() => setImportMode('replace')}
                className="w-4 h-4"
              />
              Ersetzen
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={importMode === 'append'}
                onChange={() => setImportMode('append')}
                className="w-4 h-4"
              />
              Anhängen
            </label>
          </div>
        )}
      </div>

      {preview.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={importRoles}
                onChange={(e) => setImportRoles(e.target.checked)}
                className="w-4 h-4"
              />
              Rollen aus CSV anlegen/zuordnen
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={importSystems}
                onChange={(e) => setImportSystems(e.target.checked)}
                className="w-4 h-4"
              />
              Systeme aus CSV anlegen/zuordnen
            </label>
          </div>

          {needsWarningAcknowledgment && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm text-yellow-800">
                    <strong>Achtung:</strong> Beim Ersetzen werden neue Schritt-IDs erzeugt. Dadurch können bestehende
                    Verknüpfungen in Decisions/Exceptions und schrittbezogenen Maßnahmen ({stepScopedImprovementCount}{' '}
                    vorhanden) ungültig werden.
                  </p>
                  <label className="flex items-center gap-2 text-sm text-yellow-800">
                    <input
                      type="checkbox"
                      checked={acknowledgeReplaceWarning}
                      onChange={(e) => setAcknowledgeReplaceWarning(e.target.checked)}
                      className="w-4 h-4"
                    />
                    Ich verstehe, dass Schritt-IDs sich ändern können.
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="border border-slate-200 rounded-md overflow-hidden">
            <div className="px-4 py-2 bg-slate-100 border-b border-slate-200">
              <p className="text-sm font-medium text-slate-700">
                Vorschau ({Math.min(preview.length, 15)} von {preview.length} Zeilen)
              </p>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-slate-700">Order</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-700">Label</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-700">Role</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-700">System</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-700">WorkType</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-700">PainPoint</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-700">ToBe</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 15).map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="py-2 px-3 text-slate-600">{row.order ?? '-'}</td>
                      <td className="py-2 px-3 text-slate-900">{row.label}</td>
                      <td className="py-2 px-3 text-slate-600">{row.role || '-'}</td>
                      <td className="py-2 px-3 text-slate-600">{row.system || '-'}</td>
                      <td className="py-2 px-3 text-slate-600">{row.workType || '-'}</td>
                      <td className="py-2 px-3 text-slate-600 text-xs">{row.painPointHint || '-'}</td>
                      <td className="py-2 px-3 text-slate-600 text-xs">{row.toBeHint || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button
            onClick={handleImport}
            disabled={importing || (needsWarningAcknowledgment && !acknowledgeReplaceWarning)}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-slate-400"
          >
            {importing ? 'Importiere...' : `${preview.length} Schritte importieren`}
          </button>
        </div>
      )}

      {parseError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{parseError}</p>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-800">{successMessage}</p>
        </div>
      )}
    </div>
  );
}

function findColumn(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) => h.toLowerCase().replace(/[_\s-]/g, ''));
  const normalizedCandidates = candidates.map((c) => c.toLowerCase().replace(/[_\s-]/g, ''));

  for (const candidate of normalizedCandidates) {
    const index = normalized.indexOf(candidate);
    if (index !== -1) return index;
  }

  return -1;
}

function mapWorkType(value?: string): WorkType | undefined {
  if (!value) return undefined;

  const lower = value.toLowerCase().trim();

  if (lower === 'manual' || lower === 'manuell') return 'manual';
  if (lower === 'user_task' || lower === 'user' || lower === 'it-unterstützt') return 'user_task';
  if (lower === 'service_task' || lower === 'service' || lower === 'integration') return 'service_task';
  if (lower === 'ai_assisted' || lower === 'ki' || lower === 'ai') return 'ai_assisted';
  if (lower === 'unknown' || lower === 'unklar' || lower === '') return 'unknown';

  return undefined;
}

function mapStepLeadTimeBucket(value?: string): StepLeadTimeBucket | undefined {
  if (!value) return undefined;

  const lower = value.toLowerCase().trim();

  if (lower === 'minutes' || lower === 'minuten') return 'minutes';
  if (lower === 'hours' || lower === 'stunden') return 'hours';
  if (lower === '1_day' || lower === 'bis 1 tag' || lower === '1 tag') return '1_day';
  if (lower === '2_5_days' || lower === '2 bis 5 tage' || lower === '2-5 tage') return '2_5_days';
  if (lower === '1_2_weeks' || lower === '1 bis 2 wochen' || lower === '1-2 wochen') return '1_2_weeks';
  if (lower === 'over_2_weeks' || lower === 'mehr als 2 wochen' || lower === '>2 wochen') return 'over_2_weeks';
  if (lower === 'varies' || lower === 'variiert' || lower === 'variiert stark') return 'varies';
  if (lower === 'unknown' || lower === 'unbekannt') return 'unknown';

  return undefined;
}

function mapStepLevelBucket(value?: string): StepLevelBucket | undefined {
  if (!value) return undefined;

  const lower = value.toLowerCase().trim();

  if (lower === 'low' || lower === 'niedrig') return 'low';
  if (lower === 'medium' || lower === 'mittel') return 'medium';
  if (lower === 'high' || lower === 'hoch') return 'high';
  if (lower === 'varies' || lower === 'variiert' || lower === 'variiert stark') return 'varies';
  if (lower === 'unknown' || lower === 'unbekannt') return 'unknown';

  return undefined;
}

import { useState } from 'react';
import { FileText, Upload, AlertTriangle } from 'lucide-react';
import type {
  Process,
  ProcessVersion,
  ImprovementBacklogItem,
  ImprovementCategory,
  ImprovementStatus,
  Level3,
  ImprovementScope,
  AutomationApproach,
  AutomationLevel,
  ControlType
} from '../domain/process';
import { parseCsvText } from '../import/csv';

interface ImprovementBacklogCsvImportProps {
  process: Process;
  version: ProcessVersion;
  currentItems: ImprovementBacklogItem[];
  onApply: (nextItems: ImprovementBacklogItem[]) => void;
}

interface PreviewRow {
  title: string;
  status?: string;
  category?: string;
  scope?: string;
  step?: string;
  owner?: string;
  dueDate?: string;
  impact?: string;
  effort?: string;
  risk?: string;
}

type ImportMode = 'replace' | 'append';

function findColumn(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) => h.toLowerCase().trim().replace(/[-_\s]/g, ''));
  const candidatesNormalized = candidates.map((c) => c.toLowerCase().replace(/[-_\s]/g, ''));

  for (let i = 0; i < candidatesNormalized.length; i++) {
    const idx = normalized.indexOf(candidatesNormalized[i]);
    if (idx !== -1) return idx;
  }

  return -1;
}

function mapCategory(input: string | undefined): ImprovementCategory | undefined {
  if (!input) return undefined;
  const normalized = input.toLowerCase().trim();

  const keyMap: Record<string, ImprovementCategory> = {
    'standardize': 'standardize',
    'standardisierung': 'standardize',
    'digitize': 'digitize',
    'digitalisierung': 'digitize',
    'automate': 'automate',
    'automatisierung': 'automate',
    'ai': 'ai',
    'kieinsatz': 'ai',
    'ki-einsatz': 'ai',
    'data': 'data',
    'daten': 'data',
    'governance': 'governance',
    'customer': 'customer',
    'kundennutzen': 'customer',
    'compliance': 'compliance',
    'kpi': 'kpi',
    'messungkpi': 'kpi',
    'messung/kpi': 'kpi',
  };

  return keyMap[normalized.replace(/[-_\s/]/g, '')];
}

function mapStatus(input: string | undefined): ImprovementStatus | undefined {
  if (!input) return undefined;
  const normalized = input.toLowerCase().trim();

  const keyMap: Record<string, ImprovementStatus> = {
    'idea': 'idea',
    'idee': 'idea',
    'planned': 'planned',
    'geplant': 'planned',
    'inprogress': 'in_progress',
    'in_progress': 'in_progress',
    'inarbeit': 'in_progress',
    'done': 'done',
    'erledigt': 'done',
    'discarded': 'discarded',
    'verworfen': 'discarded',
  };

  return keyMap[normalized.replace(/[-_\s]/g, '')];
}

function mapLevel3(input: string | undefined): Level3 | undefined {
  if (!input) return undefined;
  const normalized = input.toLowerCase().trim();

  const keyMap: Record<string, Level3> = {
    'low': 'low',
    'niedrig': 'low',
    'medium': 'medium',
    'mittel': 'medium',
    'high': 'high',
    'hoch': 'high',
  };

  return keyMap[normalized.replace(/[-_\s]/g, '')];
}

function mapScope(input: string | undefined): ImprovementScope | undefined {
  if (!input) return undefined;
  const normalized = input.toLowerCase().trim();

  const keyMap: Record<string, ImprovementScope> = {
    'process': 'process',
    'prozess': 'process',
    'step': 'step',
    'schritt': 'step',
  };

  return keyMap[normalized.replace(/[-_\s]/g, '')];
}

function mapApproach(input: string | undefined): AutomationApproach | undefined {
  if (!input) return undefined;
  const normalized = input.toLowerCase().trim();

  const keyMap: Record<string, AutomationApproach> = {
    'workflow': 'workflow',
    'workflowprozessengine': 'workflow',
    'workflow/prozess-engine': 'workflow',
    'rpa': 'rpa',
    'rpauiautomatisierung': 'rpa',
    'rpa(ui-automatisierung)': 'rpa',
    'apiintegration': 'api_integration',
    'api_integration': 'api_integration',
    'api-integration': 'api_integration',
    'erpconfig': 'erp_config',
    'erp_config': 'erp_config',
    'erp/standard-konfiguration': 'erp_config',
    'lowcode': 'low_code',
    'low_code': 'low_code',
    'low-code/formular-app': 'low_code',
    'aiassistant': 'ai_assistant',
    'ai_assistant': 'ai_assistant',
    'ki-assistent(mitarbeiterunterstützt)': 'ai_assistant',
    'aidocumentprocessing': 'ai_document_processing',
    'ai_document_processing': 'ai_document_processing',
    'ki:dokumente/extraktion': 'ai_document_processing',
    'aiclassification': 'ai_classification',
    'ai_classification': 'ai_classification',
    'ki:klassifikation/entscheidungshilfe': 'ai_classification',
    'processmining': 'process_mining',
    'process_mining': 'process_mining',
    'other': 'other',
    'sonstiges': 'other',
  };

  return keyMap[normalized.replace(/[-_\s:/()]/g, '')];
}

function mapAutomationLevel(input: string | undefined): AutomationLevel | undefined {
  if (!input) return undefined;
  const normalized = input.toLowerCase().trim();

  const keyMap: Record<string, AutomationLevel> = {
    'assist': 'assist',
    'assistiert': 'assist',
    'partial': 'partial',
    'teilautomatisiert': 'partial',
    'straightthrough': 'straight_through',
    'straight_through': 'straight_through',
    'vollautomatisiert(straight-through)': 'straight_through',
  };

  return keyMap[normalized.replace(/[-_\s()]/g, '')];
}

function mapControl(input: string): ControlType | undefined {
  const normalized = input.toLowerCase().trim();

  const keyMap: Record<string, ControlType> = {
    'audittrail': 'audit_trail',
    'audit_trail': 'audit_trail',
    'audit trail': 'audit_trail',
    'approval': 'approval',
    'freigabe': 'approval',
    'freigabe/approval': 'approval',
    'monitoring': 'monitoring',
    'dataprivacy': 'data_privacy',
    'data_privacy': 'data_privacy',
    'datenschutz': 'data_privacy',
    'fallbackmanual': 'fallback_manual',
    'fallback_manual': 'fallback_manual',
    'manuellesfallback': 'fallback_manual',
    'manuelles fallback': 'fallback_manual',
  };

  return keyMap[normalized.replace(/[-_\s/]/g, '')];
}

function parseYesNo(input: string | undefined): boolean {
  if (!input) return false;
  const normalized = input.toLowerCase().trim();
  return normalized === 'ja' || normalized === 'yes' || normalized === 'true';
}

export function ImprovementBacklogCsvImport({ version, currentItems, onApply }: ImprovementBacklogCsvImportProps) {
  const [parseError, setParseError] = useState<string>('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [parsedData, setParsedData] = useState<{
    headers: string[];
    rows: string[][];
  } | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('append');
  const [acknowledgeReplace, setAcknowledgeReplace] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [importing, setImporting] = useState(false);

  const needsWarningAcknowledgment = importMode === 'replace' && currentItems.length > 0;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setParseError('');
    setWarnings([]);
    setPreview([]);
    setParsedData(null);
    setSuccessMessage('');
    setAcknowledgeReplace(false);

    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseCsvText(text);

      const titleCol = findColumn(parsed.headers, ['maßnahme', 'massnahme', 'title', 'massname']);
      if (titleCol === -1) {
        setParseError('Keine "Maßnahme"-Spalte gefunden. Diese Spalte ist erforderlich.');
        return;
      }

      const statusCol = findColumn(parsed.headers, ['status']);
      const categoryCol = findColumn(parsed.headers, ['kategorie', 'category']);
      const scopeCol = findColumn(parsed.headers, ['scope']);
      const stepCol = findColumn(parsed.headers, ['schritt', 'step']);
      const ownerCol = findColumn(parsed.headers, ['verantwortlich', 'owner']);
      const dueDateCol = findColumn(parsed.headers, ['fälligam', 'faelligam', 'duedate', 'due_date']);
      const impactCol = findColumn(parsed.headers, ['impact']);
      const effortCol = findColumn(parsed.headers, ['effort']);
      const riskCol = findColumn(parsed.headers, ['risiko', 'risk']);

      const previewRows: PreviewRow[] = [];

      for (const row of parsed.rows.slice(0, 15)) {
        const title = row[titleCol]?.trim() || '';
        if (!title) continue;

        previewRows.push({
          title,
          status: statusCol !== -1 ? row[statusCol]?.trim() : undefined,
          category: categoryCol !== -1 ? row[categoryCol]?.trim() : undefined,
          scope: scopeCol !== -1 ? row[scopeCol]?.trim() : undefined,
          step: stepCol !== -1 ? row[stepCol]?.trim() : undefined,
          owner: ownerCol !== -1 ? row[ownerCol]?.trim() : undefined,
          dueDate: dueDateCol !== -1 ? row[dueDateCol]?.trim() : undefined,
          impact: impactCol !== -1 ? row[impactCol]?.trim() : undefined,
          effort: effortCol !== -1 ? row[effortCol]?.trim() : undefined,
          risk: riskCol !== -1 ? row[riskCol]?.trim() : undefined,
        });
      }

      if (previewRows.length === 0) {
        setParseError('Keine gültigen Maßnahmen in der CSV gefunden.');
        return;
      }

      setPreview(previewRows);
      setParsedData({
        headers: parsed.headers,
        rows: parsed.rows,
      });

    } catch (err) {
      if (err instanceof Error) {
        setParseError(err.message);
      } else {
        setParseError('CSV konnte nicht gelesen werden.');
      }
    }
  };

  const handleImport = async () => {
    if (!parsedData) return;

    if (needsWarningAcknowledgment && !acknowledgeReplace) {
      setParseError('Bitte bestätigen Sie die Warnung.');
      return;
    }

    setImporting(true);
    setParseError('');
    setSuccessMessage('');
    const importWarnings: string[] = [];

    try {
      const { headers, rows } = parsedData;

      const titleCol = findColumn(headers, ['maßnahme', 'massnahme', 'title', 'massname']);
      const statusCol = findColumn(headers, ['status']);
      const categoryCol = findColumn(headers, ['kategorie', 'category']);
      const scopeCol = findColumn(headers, ['scope']);
      const stepCol = findColumn(headers, ['schritt', 'step']);
      const ownerCol = findColumn(headers, ['verantwortlich', 'owner']);
      const dueDateCol = findColumn(headers, ['fälligam', 'faelligam', 'duedate', 'due_date']);
      const impactCol = findColumn(headers, ['impact']);
      const effortCol = findColumn(headers, ['effort']);
      const riskCol = findColumn(headers, ['risiko', 'risk']);
      const approachCol = findColumn(headers, ['ansatz', 'approach']);
      const levelCol = findColumn(headers, ['zielgrad', 'level', 'automationlevel']);
      const hitlCol = findColumn(headers, ['humanintheloop', 'human-in-the-loop', 'hitl']);
      const systemsCol = findColumn(headers, ['systeme', 'systems']);
      const dataObjectsCol = findColumn(headers, ['datenobjekte', 'dataobjects']);
      const kpisCol = findColumn(headers, ['kpis']);
      const controlsCol = findColumn(headers, ['kontrollen', 'controls']);
      const descriptionCol = findColumn(headers, ['beschreibung', 'description']);
      const createdAtCol = findColumn(headers, ['erstelltam', 'createdat', 'created_at']);

      const happyPathSteps = version.sidecar.captureDraft?.happyPath || [];
      const stepById = new Map(happyPathSteps.map(s => [s.stepId, s]));
      const stepByOrder = new Map(happyPathSteps.map(s => [s.order, s]));
      const stepByLabel = new Map(happyPathSteps.map(s => [s.label.toLowerCase().trim(), s]));

      const systemByName = new Map(
        version.sidecar.systems.map(sys => [sys.name.toLowerCase().trim(), sys.id])
      );
      const dataObjectByName = new Map(
        version.sidecar.dataObjects.map(obj => [obj.name.toLowerCase().trim(), obj.id])
      );
      const kpiByName = new Map(
        version.sidecar.kpis.map(kpi => [kpi.name.toLowerCase().trim(), kpi.id])
      );

      const importedItems: ImprovementBacklogItem[] = [];

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        const title = row[titleCol]?.trim() || '';
        if (!title) continue;

        const statusRaw = statusCol !== -1 ? row[statusCol]?.trim() : undefined;
        const categoryRaw = categoryCol !== -1 ? row[categoryCol]?.trim() : undefined;
        const scopeRaw = scopeCol !== -1 ? row[scopeCol]?.trim() : undefined;
        const stepRaw = stepCol !== -1 ? row[stepCol]?.trim() : undefined;
        const ownerRaw = ownerCol !== -1 ? row[ownerCol]?.trim() : undefined;
        const dueDateRaw = dueDateCol !== -1 ? row[dueDateCol]?.trim() : undefined;
        const impactRaw = impactCol !== -1 ? row[impactCol]?.trim() : undefined;
        const effortRaw = effortCol !== -1 ? row[effortCol]?.trim() : undefined;
        const riskRaw = riskCol !== -1 ? row[riskCol]?.trim() : undefined;
        const approachRaw = approachCol !== -1 ? row[approachCol]?.trim() : undefined;
        const levelRaw = levelCol !== -1 ? row[levelCol]?.trim() : undefined;
        const hitlRaw = hitlCol !== -1 ? row[hitlCol]?.trim() : undefined;
        const systemsRaw = systemsCol !== -1 ? row[systemsCol]?.trim() : undefined;
        const dataObjectsRaw = dataObjectsCol !== -1 ? row[dataObjectsCol]?.trim() : undefined;
        const kpisRaw = kpisCol !== -1 ? row[kpisCol]?.trim() : undefined;
        const controlsRaw = controlsCol !== -1 ? row[controlsCol]?.trim() : undefined;
        const descriptionRaw = descriptionCol !== -1 ? row[descriptionCol]?.trim() : undefined;
        const createdAtRaw = createdAtCol !== -1 ? row[createdAtCol]?.trim() : undefined;

        const status = mapStatus(statusRaw) || 'idea';
        const category = mapCategory(categoryRaw) || 'automate';
        let scope: ImprovementScope = mapScope(scopeRaw) || 'process';
        let relatedStepId: string | undefined = undefined;

        if (scope === 'step' && stepRaw) {
          if (stepById.has(stepRaw)) {
            relatedStepId = stepRaw;
          } else {
            const orderMatch = stepRaw.match(/^(\d+)\./);
            const labelPart = stepRaw.replace(/^\d+\.\s*/, '').trim();

            if (orderMatch) {
              const order = parseInt(orderMatch[1], 10);
              const stepByOrderMatch = stepByOrder.get(order);

              if (stepByOrderMatch && labelPart && stepByOrderMatch.label.toLowerCase().includes(labelPart.toLowerCase())) {
                relatedStepId = stepByOrderMatch.stepId;
              } else if (stepByOrderMatch) {
                relatedStepId = stepByOrderMatch.stepId;
              } else if (labelPart) {
                const stepByLabelMatch = stepByLabel.get(labelPart.toLowerCase());
                if (stepByLabelMatch) {
                  relatedStepId = stepByLabelMatch.stepId;
                }
              }
            } else if (labelPart) {
              const stepByLabelMatch = stepByLabel.get(labelPart.toLowerCase());
              if (stepByLabelMatch) {
                relatedStepId = stepByLabelMatch.stepId;
              }
            }

            if (!relatedStepId) {
              importWarnings.push(`Zeile ${rowIndex + 2} („${title}"): Schritt „${stepRaw}" nicht gefunden. Scope auf Prozess gesetzt.`);
              scope = 'process';
            }
          }
        }

        const impact = mapLevel3(impactRaw) || 'medium';
        const effort = mapLevel3(effortRaw) || 'medium';
        const risk = mapLevel3(riskRaw) || 'medium';

        const owner = ownerRaw || undefined;
        let dueDate: string | undefined = undefined;

        if (dueDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw)) {
          dueDate = dueDateRaw;
        } else if (dueDateRaw) {
          importWarnings.push(`Zeile ${rowIndex + 2} („${title}"): Ungültiges Datumsformat „${dueDateRaw}". Erwartet YYYY-MM-DD.`);
        }

        const description = descriptionRaw || undefined;

        const createdAt = createdAtRaw || new Date().toISOString();
        const updatedAt = new Date().toISOString();

        let automationBlueprint = undefined;

        const hasAnyBlueprintField = approachRaw || levelRaw || hitlRaw || systemsRaw || dataObjectsRaw || kpisRaw || controlsRaw;

        if (hasAnyBlueprintField) {
          const approach = mapApproach(approachRaw) || 'other';
          const level = mapAutomationLevel(levelRaw) || 'partial';
          const humanInTheLoop = parseYesNo(hitlRaw);

          const systemIds: string[] = [];
          if (systemsRaw) {
            systemsRaw.split(',').forEach(name => {
              const trimmed = name.trim();
              const id = systemByName.get(trimmed.toLowerCase());
              if (id) {
                systemIds.push(id);
              } else if (trimmed) {
                importWarnings.push(`Zeile ${rowIndex + 2} („${title}"): System „${trimmed}" nicht gefunden.`);
              }
            });
          }

          const dataObjectIds: string[] = [];
          if (dataObjectsRaw) {
            dataObjectsRaw.split(',').forEach(name => {
              const trimmed = name.trim();
              const id = dataObjectByName.get(trimmed.toLowerCase());
              if (id) {
                dataObjectIds.push(id);
              } else if (trimmed) {
                importWarnings.push(`Zeile ${rowIndex + 2} („${title}"): Datenobjekt „${trimmed}" nicht gefunden.`);
              }
            });
          }

          const kpiIds: string[] = [];
          if (kpisRaw) {
            kpisRaw.split(',').forEach(name => {
              const trimmed = name.trim();
              const id = kpiByName.get(trimmed.toLowerCase());
              if (id) {
                kpiIds.push(id);
              } else if (trimmed) {
                importWarnings.push(`Zeile ${rowIndex + 2} („${title}"): KPI „${trimmed}" nicht gefunden.`);
              }
            });
          }

          const controls: ControlType[] = [];
          if (controlsRaw) {
            controlsRaw.split(',').forEach(name => {
              const trimmed = name.trim();
              const control = mapControl(trimmed);
              if (control) {
                controls.push(control);
              } else if (trimmed) {
                importWarnings.push(`Zeile ${rowIndex + 2} („${title}"): Kontrolle „${trimmed}" nicht erkannt.`);
              }
            });
          }

          automationBlueprint = {
            approach,
            level,
            humanInTheLoop,
            ...(systemIds.length > 0 && { systemIds }),
            ...(dataObjectIds.length > 0 && { dataObjectIds }),
            ...(kpiIds.length > 0 && { kpiIds }),
            ...(controls.length > 0 && { controls }),
          };
        }

        const item: ImprovementBacklogItem = {
          id: crypto.randomUUID(),
          title,
          category,
          status,
          scope,
          ...(relatedStepId && { relatedStepId }),
          impact,
          effort,
          risk,
          ...(owner && { owner }),
          ...(dueDate && { dueDate }),
          ...(description && { description }),
          ...(automationBlueprint && { automationBlueprint }),
          createdAt,
          updatedAt,
        };

        importedItems.push(item);
      }

      const nextItems = importMode === 'replace' ? importedItems : [...currentItems, ...importedItems];

      onApply(nextItems);

      setSuccessMessage(`Import angewendet: ${importedItems.length} Maßnahmen. Bitte Änderungen speichern.`);
      setWarnings(importWarnings);
      setPreview([]);
      setParsedData(null);

    } catch (err) {
      if (err instanceof Error) {
        setParseError(`Import fehlgeschlagen: ${err.message}`);
      } else {
        setParseError('Import fehlgeschlagen.');
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-2">
          <FileText className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-slate-900">CSV-Import</h3>
        </div>
      </div>

      {parseError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{parseError}</p>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-800 font-medium">{successMessage}</p>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800 mb-1">Import-Warnungen:</p>
              <ul className="text-sm text-yellow-800 list-disc list-inside space-y-1">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

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
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-700">Modus:</label>
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as ImportMode)}
                className="px-3 py-2 border border-slate-300 rounded-md text-sm"
              >
                <option value="append">Anhängen</option>
                <option value="replace">Ersetzen</option>
              </select>
            </div>

            <button
              onClick={handleImport}
              disabled={importing || (needsWarningAcknowledgment && !acknowledgeReplace)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
            >
              {importing ? 'Importiere...' : 'Import anwenden'}
            </button>
          </div>
        )}
      </div>

      {preview.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              Vorschau: {preview.length} von {parsedData?.rows.length || 0} Zeilen
            </p>
          </div>

          {needsWarningAcknowledgment && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm text-yellow-800">
                    <strong>Achtung:</strong> Beim Ersetzen werden alle bestehenden Maßnahmen ({currentItems.length}{' '}
                    vorhanden) überschrieben.
                  </p>
                  <label className="flex items-center gap-2 text-sm text-yellow-800">
                    <input
                      type="checkbox"
                      checked={acknowledgeReplace}
                      onChange={(e) => setAcknowledgeReplace(e.target.checked)}
                      className="h-4 w-4 rounded border-yellow-300"
                    />
                    <span>Ich verstehe, dass bestehende Maßnahmen überschrieben werden.</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-md">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Kategorie</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Maßnahme</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Scope</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Schritt</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Owner</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Fällig</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Impact</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Effort</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Risk</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {preview.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-900">{row.status || '—'}</td>
                    <td className="px-3 py-2 text-slate-900">{row.category || '—'}</td>
                    <td className="px-3 py-2 text-slate-900 max-w-xs truncate">{row.title}</td>
                    <td className="px-3 py-2 text-slate-900">{row.scope || '—'}</td>
                    <td className="px-3 py-2 text-slate-900">{row.step || '—'}</td>
                    <td className="px-3 py-2 text-slate-900">{row.owner || '—'}</td>
                    <td className="px-3 py-2 text-slate-900">{row.dueDate || '—'}</td>
                    <td className="px-3 py-2 text-slate-900">{row.impact || '—'}</td>
                    <td className="px-3 py-2 text-slate-900">{row.effort || '—'}</td>
                    <td className="px-3 py-2 text-slate-900">{row.risk || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { FileText, Upload, AlertTriangle } from 'lucide-react';
import type { ProcessVersion, ProcessRole, ProcessSystem, ProcessDataObject, ProcessKPI } from '../domain/process';
import { parseCsvText } from '../import/csv';
import { normalizeCatalogToken, parseAliasesCell, mergeAliases } from '../utils/catalogAliases';

interface CatalogCsvImportProps {
  version: ProcessVersion;
  onSave: (patch: Partial<ProcessVersion>) => Promise<void>;
}

type CatalogType = 'roles' | 'systems' | 'dataObjects' | 'kpis';

interface PreviewRow {
  [key: string]: string;
}

function findColumn(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) => h.toLowerCase().trim().replace(/[-_\s]/g, ''));
  const candidatesNormalized = candidates.map((c) => c.toLowerCase().replace(/[-_\s]/g, ''));

  for (let i = 0; i < candidatesNormalized.length; i++) {
    const idx = normalized.indexOf(candidatesNormalized[i]);
    if (idx !== -1) return idx;
  }

  return -1;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function parseKindRole(input: string | undefined): ProcessRole['kind'] {
  if (!input) return 'role';
  const normalized = input.toLowerCase().trim();

  const keyMap: Record<string, ProcessRole['kind']> = {
    'person': 'person',
    'role': 'role',
    'orgunit': 'org_unit',
    'org_unit': 'org_unit',
    'system': 'system',
  };

  return keyMap[normalized.replace(/[-_\s]/g, '')] || 'role';
}

function parseKindDataObject(input: string | undefined): ProcessDataObject['kind'] {
  if (!input) return 'other';
  const normalized = input.toLowerCase().trim();

  const keyMap: Record<string, ProcessDataObject['kind']> = {
    'document': 'document',
    'dokument': 'document',
    'dataset': 'dataset',
    'datensatz': 'dataset',
    'form': 'form',
    'formular': 'form',
    'other': 'other',
    'sonstiges': 'other',
  };

  return keyMap[normalized.replace(/[-_\s]/g, '')] || 'other';
}

export function CatalogCsvImport({ version, onSave }: CatalogCsvImportProps) {
  const [catalogType, setCatalogType] = useState<CatalogType>('roles');
  const [parseError, setParseError] = useState<string>('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [parsedData, setParsedData] = useState<{
    headers: string[];
    rows: string[][];
  } | null>(null);
  const [importing, setImporting] = useState(false);

  const catalogConfig = {
    roles: {
      label: 'Rollen',
      requiredColumns: ['name', 'rolle', 'role'],
      optionalColumns: {
        kind: ['kind', 'typ', 'art'],
        aliases: ['aliases', 'alias', 'synonyms', 'synonyme', 'aka']
      },
      previewColumns: ['Name', 'Typ', 'Aliases'],
    },
    systems: {
      label: 'Systeme',
      requiredColumns: ['name', 'system', 'applikation', 'it'],
      optionalColumns: {
        systemType: ['typ', 'systemtyp', 'systemtype'],
        aliases: ['aliases', 'alias', 'synonyms', 'synonyme', 'aka']
      },
      previewColumns: ['Name', 'Systemtyp', 'Aliases'],
    },
    dataObjects: {
      label: 'Datenobjekte',
      requiredColumns: ['name', 'datenobjekt', 'dataobject', 'objekt'],
      optionalColumns: {
        kind: ['kind', 'typ', 'art'],
        aliases: ['aliases', 'alias', 'synonyms', 'synonyme', 'aka']
      },
      previewColumns: ['Name', 'Typ', 'Aliases'],
    },
    kpis: {
      label: 'KPIs',
      requiredColumns: ['name', 'kpi', 'kennzahl'],
      optionalColumns: {
        definition: ['definition', 'beschreibung'],
        unit: ['einheit', 'unit'],
        target: ['ziel', 'target'],
        aliases: ['aliases', 'alias', 'synonyms', 'synonyme', 'aka']
      },
      previewColumns: ['Name', 'Definition', 'Einheit', 'Ziel', 'Aliases'],
    },
  };

  const config = catalogConfig[catalogType];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setParseError('');
    setWarnings([]);
    setPreviewRows([]);
    setParsedData(null);
    setSuccessMessage('');

    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseCsvText(text);

      const nameCol = findColumn(parsed.headers, config.requiredColumns);
      if (nameCol === -1) {
        setParseError(`Keine "${config.requiredColumns[0]}"-Spalte gefunden. Diese Spalte ist erforderlich.`);
        return;
      }

      const optionalCols: Record<string, number> = {};
      Object.entries(config.optionalColumns).forEach(([key, candidates]) => {
        optionalCols[key] = findColumn(parsed.headers, candidates as string[]);
      });

      const previewData: PreviewRow[] = [];

      for (const row of parsed.rows.slice(0, 15)) {
        const name = row[nameCol]?.trim() || '';
        if (!name) continue;

        const previewRow: PreviewRow = { Name: name };

        if (catalogType === 'roles' && optionalCols.kind !== -1) {
          previewRow.Typ = row[optionalCols.kind]?.trim() || '';
        } else if (catalogType === 'systems' && optionalCols.systemType !== -1) {
          previewRow.Systemtyp = row[optionalCols.systemType]?.trim() || '';
        } else if (catalogType === 'dataObjects' && optionalCols.kind !== -1) {
          previewRow.Typ = row[optionalCols.kind]?.trim() || '';
        } else if (catalogType === 'kpis') {
          if (optionalCols.definition !== -1) {
            previewRow.Definition = row[optionalCols.definition]?.trim() || '';
          }
          if (optionalCols.unit !== -1) {
            previewRow.Einheit = row[optionalCols.unit]?.trim() || '';
          }
          if (optionalCols.target !== -1) {
            previewRow.Ziel = row[optionalCols.target]?.trim() || '';
          }
        }

        if (optionalCols.aliases !== -1) {
          previewRow.Aliases = row[optionalCols.aliases]?.trim() || '';
        }

        previewData.push(previewRow);
      }

      if (previewData.length === 0) {
        setParseError('Keine gültigen Zeilen gefunden.');
        return;
      }

      setPreviewRows(previewData);
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

    setImporting(true);
    setParseError('');
    setSuccessMessage('');
    const importWarnings: string[] = [];

    try {
      const { headers, rows } = parsedData;

      const nameCol = findColumn(headers, config.requiredColumns);

      const optionalCols: Record<string, number> = {};
      Object.entries(config.optionalColumns).forEach(([key, candidates]) => {
        optionalCols[key] = findColumn(headers, candidates as string[]);
      });

      const updatedSidecar = { ...version.sidecar };
      const updatedProgress = {
        ...version.captureProgress,
        phaseStates: { ...version.captureProgress.phaseStates },
      };

      let newCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      if (catalogType === 'roles') {
        const updatedRoles: ProcessRole[] = [...version.sidecar.roles];

        const keyToIndex = new Map<string, number>();
        updatedRoles.forEach((role, index) => {
          keyToIndex.set(normalizeCatalogToken(role.name), index);
          (role.aliases || []).forEach(alias => {
            keyToIndex.set(normalizeCatalogToken(alias), index);
          });
        });

        for (const row of rows) {
          const name = normalizeName(row[nameCol] || '');
          if (!name) {
            importWarnings.push(`Leerer Name übersprungen.`);
            skippedCount++;
            continue;
          }

          const incomingAliases = optionalCols.aliases !== -1 ? parseAliasesCell(row[optionalCols.aliases]) : [];
          const nameKey = normalizeCatalogToken(name);

          const existingIndex = keyToIndex.get(nameKey);

          if (existingIndex !== undefined) {
            const existing = updatedRoles[existingIndex];
            const mergedAliases = mergeAliases({
              canonicalName: existing.name,
              existing: existing.aliases,
              incoming: [name, ...incomingAliases]
            });

            const hadChange = JSON.stringify(existing.aliases) !== JSON.stringify(mergedAliases);
            if (hadChange) {
              existing.aliases = mergedAliases;
              if (mergedAliases) {
                mergedAliases.forEach(alias => {
                  keyToIndex.set(normalizeCatalogToken(alias), existingIndex);
                });
              }
              updatedCount++;
            } else {
              skippedCount++;
            }
          } else {
            const kindRaw = optionalCols.kind !== -1 ? row[optionalCols.kind]?.trim() : undefined;
            const kind = parseKindRole(kindRaw);

            const newRole: ProcessRole = {
              id: crypto.randomUUID(),
              name,
              kind,
              aliases: mergeAliases({ canonicalName: name, incoming: incomingAliases })
            };

            const newIndex = updatedRoles.length;
            updatedRoles.push(newRole);
            keyToIndex.set(nameKey, newIndex);
            if (newRole.aliases) {
              newRole.aliases.forEach(alias => {
                keyToIndex.set(normalizeCatalogToken(alias), newIndex);
              });
            }
            newCount++;
          }
        }

        updatedSidecar.roles = updatedRoles;
        if (updatedRoles.length > 0) {
          updatedProgress.phaseStates.roles = 'done';
        }
      } else if (catalogType === 'systems') {
        const updatedSystems: ProcessSystem[] = [...version.sidecar.systems];

        const keyToIndex = new Map<string, number>();
        updatedSystems.forEach((sys, index) => {
          keyToIndex.set(normalizeCatalogToken(sys.name), index);
          (sys.aliases || []).forEach(alias => {
            keyToIndex.set(normalizeCatalogToken(alias), index);
          });
        });

        for (const row of rows) {
          const name = normalizeName(row[nameCol] || '');
          if (!name) {
            importWarnings.push(`Leerer Name übersprungen.`);
            skippedCount++;
            continue;
          }

          const incomingAliases = optionalCols.aliases !== -1 ? parseAliasesCell(row[optionalCols.aliases]) : [];
          const nameKey = normalizeCatalogToken(name);

          const existingIndex = keyToIndex.get(nameKey);

          if (existingIndex !== undefined) {
            const existing = updatedSystems[existingIndex];
            const mergedAliases = mergeAliases({
              canonicalName: existing.name,
              existing: existing.aliases,
              incoming: [name, ...incomingAliases]
            });

            const hadChange = JSON.stringify(existing.aliases) !== JSON.stringify(mergedAliases);
            if (hadChange) {
              existing.aliases = mergedAliases;
              if (mergedAliases) {
                mergedAliases.forEach(alias => {
                  keyToIndex.set(normalizeCatalogToken(alias), existingIndex);
                });
              }
              updatedCount++;
            } else {
              skippedCount++;
            }
          } else {
            const systemType = optionalCols.systemType !== -1 ? row[optionalCols.systemType]?.trim() : undefined;

            const newSystem: ProcessSystem = {
              id: crypto.randomUUID(),
              name,
              ...(systemType && { systemType }),
              aliases: mergeAliases({ canonicalName: name, incoming: incomingAliases })
            };

            const newIndex = updatedSystems.length;
            updatedSystems.push(newSystem);
            keyToIndex.set(nameKey, newIndex);
            if (newSystem.aliases) {
              newSystem.aliases.forEach(alias => {
                keyToIndex.set(normalizeCatalogToken(alias), newIndex);
              });
            }
            newCount++;
          }
        }

        updatedSidecar.systems = updatedSystems;
        if (updatedSystems.length > 0 || updatedSidecar.dataObjects.length > 0) {
          updatedProgress.phaseStates.data_it = 'done';
        }
      } else if (catalogType === 'dataObjects') {
        const updatedDataObjects: ProcessDataObject[] = [...version.sidecar.dataObjects];

        const keyToIndex = new Map<string, number>();
        updatedDataObjects.forEach((obj, index) => {
          keyToIndex.set(normalizeCatalogToken(obj.name), index);
          (obj.aliases || []).forEach(alias => {
            keyToIndex.set(normalizeCatalogToken(alias), index);
          });
        });

        for (const row of rows) {
          const name = normalizeName(row[nameCol] || '');
          if (!name) {
            importWarnings.push(`Leerer Name übersprungen.`);
            skippedCount++;
            continue;
          }

          const incomingAliases = optionalCols.aliases !== -1 ? parseAliasesCell(row[optionalCols.aliases]) : [];
          const nameKey = normalizeCatalogToken(name);

          const existingIndex = keyToIndex.get(nameKey);

          if (existingIndex !== undefined) {
            const existing = updatedDataObjects[existingIndex];
            const mergedAliases = mergeAliases({
              canonicalName: existing.name,
              existing: existing.aliases,
              incoming: [name, ...incomingAliases]
            });

            const hadChange = JSON.stringify(existing.aliases) !== JSON.stringify(mergedAliases);
            if (hadChange) {
              existing.aliases = mergedAliases;
              if (mergedAliases) {
                mergedAliases.forEach(alias => {
                  keyToIndex.set(normalizeCatalogToken(alias), existingIndex);
                });
              }
              updatedCount++;
            } else {
              skippedCount++;
            }
          } else {
            const kindRaw = optionalCols.kind !== -1 ? row[optionalCols.kind]?.trim() : undefined;
            const kind = parseKindDataObject(kindRaw);

            const newDataObject: ProcessDataObject = {
              id: crypto.randomUUID(),
              name,
              kind,
              aliases: mergeAliases({ canonicalName: name, incoming: incomingAliases })
            };

            const newIndex = updatedDataObjects.length;
            updatedDataObjects.push(newDataObject);
            keyToIndex.set(nameKey, newIndex);
            if (newDataObject.aliases) {
              newDataObject.aliases.forEach(alias => {
                keyToIndex.set(normalizeCatalogToken(alias), newIndex);
              });
            }
            newCount++;
          }
        }

        updatedSidecar.dataObjects = updatedDataObjects;
        if (updatedSidecar.systems.length > 0 || updatedDataObjects.length > 0) {
          updatedProgress.phaseStates.data_it = 'done';
        }
      } else if (catalogType === 'kpis') {
        const updatedKpis: ProcessKPI[] = [...version.sidecar.kpis];

        const keyToIndex = new Map<string, number>();
        updatedKpis.forEach((kpi, index) => {
          keyToIndex.set(normalizeCatalogToken(kpi.name), index);
          (kpi.aliases || []).forEach(alias => {
            keyToIndex.set(normalizeCatalogToken(alias), index);
          });
        });

        for (const row of rows) {
          const name = normalizeName(row[nameCol] || '');
          if (!name) {
            importWarnings.push(`Leerer Name übersprungen.`);
            skippedCount++;
            continue;
          }

          const incomingAliases = optionalCols.aliases !== -1 ? parseAliasesCell(row[optionalCols.aliases]) : [];
          const nameKey = normalizeCatalogToken(name);

          const existingIndex = keyToIndex.get(nameKey);

          if (existingIndex !== undefined) {
            const existing = updatedKpis[existingIndex];
            const mergedAliases = mergeAliases({
              canonicalName: existing.name,
              existing: existing.aliases,
              incoming: [name, ...incomingAliases]
            });

            const hadChange = JSON.stringify(existing.aliases) !== JSON.stringify(mergedAliases);
            if (hadChange) {
              existing.aliases = mergedAliases;
              if (mergedAliases) {
                mergedAliases.forEach(alias => {
                  keyToIndex.set(normalizeCatalogToken(alias), existingIndex);
                });
              }
              updatedCount++;
            } else {
              skippedCount++;
            }
          } else {
            const definition = optionalCols.definition !== -1 ? row[optionalCols.definition]?.trim() || '' : '';
            const unit = optionalCols.unit !== -1 ? row[optionalCols.unit]?.trim() : undefined;
            const target = optionalCols.target !== -1 ? row[optionalCols.target]?.trim() : undefined;

            const newKpi: ProcessKPI = {
              id: crypto.randomUUID(),
              name,
              definition,
              ...(unit && { unit }),
              ...(target && { target }),
              aliases: mergeAliases({ canonicalName: name, incoming: incomingAliases })
            };

            const newIndex = updatedKpis.length;
            updatedKpis.push(newKpi);
            keyToIndex.set(nameKey, newIndex);
            if (newKpi.aliases) {
              newKpi.aliases.forEach(alias => {
                keyToIndex.set(normalizeCatalogToken(alias), newIndex);
              });
            }
            newCount++;
          }
        }

        updatedSidecar.kpis = updatedKpis;
        if (updatedKpis.length > 0) {
          updatedProgress.phaseStates.kpis = 'done';
        }
      }

      updatedProgress.lastTouchedAt = new Date().toISOString();

      await onSave({
        sidecar: updatedSidecar,
        captureProgress: updatedProgress,
      });

      const parts = [];
      if (newCount > 0) parts.push(`${newCount} neu`);
      if (updatedCount > 0) parts.push(`${updatedCount} Aliases ergänzt`);
      if (skippedCount > 0) parts.push(`${skippedCount} übersprungen`);
      setSuccessMessage(`Import abgeschlossen: ${parts.join(', ')}.`);
      setWarnings(importWarnings);
      setPreviewRows([]);
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
          <h3 className="font-semibold text-slate-900">Kataloge importieren (CSV)</h3>
        </div>
      </div>

      <p className="text-sm text-slate-600">
        Importieren Sie Rollen, Systeme, Datenobjekte oder KPIs aus CSV-Dateien. Der Import ergänzt bestehende Einträge (Merge-only).
      </p>

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
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-700 font-medium">Katalogtyp:</label>
          <select
            value={catalogType}
            onChange={(e) => {
              setCatalogType(e.target.value as CatalogType);
              setPreviewRows([]);
              setParsedData(null);
              setParseError('');
              setWarnings([]);
              setSuccessMessage('');
            }}
            className="px-3 py-2 border border-slate-300 rounded-md text-sm"
          >
            <option value="roles">Rollen</option>
            <option value="systems">Systeme</option>
            <option value="dataObjects">Datenobjekte</option>
            <option value="kpis">KPIs</option>
          </select>
        </div>

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

        {previewRows.length > 0 && (
          <button
            onClick={handleImport}
            disabled={importing}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
          >
            {importing ? 'Importiere...' : 'Import anwenden'}
          </button>
        )}
      </div>

      {previewRows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              Vorschau: {previewRows.length} von {parsedData?.rows.length || 0} Zeilen
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-md">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {config.previewColumns.map((col) => (
                    <th key={col} className="px-3 py-2 text-left text-xs font-medium text-slate-700">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {previewRows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    {config.previewColumns.map((col) => (
                      <td key={col} className="px-3 py-2 text-slate-900">
                        {row[col] || '—'}
                      </td>
                    ))}
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

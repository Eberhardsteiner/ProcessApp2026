import { useState } from 'react';
import type { ProcessVersion, ProcessRole, ProcessSystem, ProcessDataObject, ProcessKPI } from '../domain/process';
import { mergeAliases } from '../utils/catalogAliases';
import { AlertCircle, GitMerge } from 'lucide-react';

interface CatalogMergeToolProps {
  version: ProcessVersion;
  onSave: (patch: Partial<ProcessVersion>) => Promise<void>;
  hasUnsavedStepEdits?: boolean;
}

type MergeType = 'roles' | 'systems' | 'dataObjects' | 'kpis';

export function CatalogMergeTool({ version, onSave, hasUnsavedStepEdits }: CatalogMergeToolProps) {
  const [mergeType, setMergeType] = useState<MergeType>('roles');
  const [sourceId, setSourceId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [merging, setMerging] = useState(false);

  const roles = version.sidecar.roles || [];
  const systems = version.sidecar.systems || [];
  const dataObjects = version.sidecar.dataObjects || [];
  const kpis = version.sidecar.kpis || [];

  const items =
    mergeType === 'roles' ? roles :
    mergeType === 'systems' ? systems :
    mergeType === 'dataObjects' ? dataObjects :
    kpis;

  const getPreviewCounts = () => {
    if (!sourceId || !targetId || sourceId === targetId) {
      return { stepsAffected: 0, blueprintsAffected: 0, aliasesToMerge: [] };
    }

    const draft = version.sidecar.captureDraft;
    const backlog = version.sidecar.improvementBacklog || [];

    let stepsAffected = 0;
    let blueprintsAffected = 0;
    let aliasesToMerge: string[] = [];

    if (mergeType === 'roles') {
      const source = roles.find((r) => r.id === sourceId);
      const target = roles.find((r) => r.id === targetId);

      if (source && target) {
        aliasesToMerge = [source.name, ...(source.aliases || [])].filter(
          (alias) => alias.toLowerCase() !== target.name.toLowerCase()
        );

        if (draft) {
          stepsAffected = draft.happyPath.filter((step) => step.roleId === sourceId).length;
        }
      }
    } else if (mergeType === 'systems') {
      const source = systems.find((s) => s.id === sourceId);
      const target = systems.find((s) => s.id === targetId);

      if (source && target) {
        aliasesToMerge = [source.name, ...(source.aliases || [])].filter(
          (alias) => alias.toLowerCase() !== target.name.toLowerCase()
        );

        if (draft) {
          stepsAffected = draft.happyPath.filter((step) => step.systemId === sourceId).length;
        }

        blueprintsAffected = backlog.filter((item) => {
          const systemIds = item.automationBlueprint?.systemIds || [];
          return systemIds.includes(sourceId);
        }).length;
      }
    } else if (mergeType === 'dataObjects') {
      const source = dataObjects.find((d) => d.id === sourceId);
      const target = dataObjects.find((d) => d.id === targetId);

      if (source && target) {
        aliasesToMerge = [source.name, ...(source.aliases || [])].filter(
          (alias) => alias.toLowerCase() !== target.name.toLowerCase()
        );

        if (draft) {
          stepsAffected = draft.happyPath.filter((step) => {
            const dataIn = step.dataIn || [];
            const dataOut = step.dataOut || [];
            return dataIn.includes(sourceId) || dataOut.includes(sourceId);
          }).length;
        }

        blueprintsAffected = backlog.filter((item) => {
          const dataObjectIds = item.automationBlueprint?.dataObjectIds || [];
          return dataObjectIds.includes(sourceId);
        }).length;
      }
    } else if (mergeType === 'kpis') {
      const source = kpis.find((k) => k.id === sourceId);
      const target = kpis.find((k) => k.id === targetId);

      if (source && target) {
        aliasesToMerge = [source.name, ...(source.aliases || [])].filter(
          (alias) => alias.toLowerCase() !== target.name.toLowerCase()
        );

        blueprintsAffected = backlog.filter((item) => {
          const kpiIds = item.automationBlueprint?.kpiIds || [];
          return kpiIds.includes(sourceId);
        }).length;
      }
    }

    return { stepsAffected, blueprintsAffected, aliasesToMerge };
  };

  const mergeRoles = async (sourceId: string, targetId: string) => {
    const source = roles.find((r) => r.id === sourceId);
    const target = roles.find((r) => r.id === targetId);

    if (!source) throw new Error(`Quell-Rolle nicht gefunden: ${sourceId}`);
    if (!target) throw new Error(`Ziel-Rolle nicht gefunden: ${targetId}`);

    const mergedAliases = mergeAliases({
      canonicalName: target.name,
      existing: target.aliases,
      incoming: [source.name, ...(source.aliases ?? [])],
    });

    const updatedRoles = roles
      .filter((r) => r.id !== sourceId)
      .map((r) => (r.id === targetId ? { ...r, aliases: mergedAliases } : r));

    const draft = version.sidecar.captureDraft;
    const updatedHappyPath = draft?.happyPath.map((step) =>
      step.roleId === sourceId ? { ...step, roleId: targetId } : step
    );

    await onSave({
      sidecar: {
        ...version.sidecar,
        roles: updatedRoles,
        ...(draft ? { captureDraft: { ...draft, happyPath: updatedHappyPath! } } : {}),
      },
    });
  };

  const mergeSystems = async (sourceId: string, targetId: string) => {
    const source = systems.find((s) => s.id === sourceId);
    const target = systems.find((s) => s.id === targetId);

    if (!source) throw new Error(`Quell-System nicht gefunden: ${sourceId}`);
    if (!target) throw new Error(`Ziel-System nicht gefunden: ${targetId}`);

    const mergedAliases = mergeAliases({
      canonicalName: target.name,
      existing: target.aliases,
      incoming: [source.name, ...(source.aliases ?? [])],
    });

    const updatedSystems = systems
      .filter((s) => s.id !== sourceId)
      .map((s) => (s.id === targetId ? { ...s, aliases: mergedAliases } : s));

    const draft = version.sidecar.captureDraft;
    const updatedHappyPath = draft?.happyPath.map((step) =>
      step.systemId === sourceId ? { ...step, systemId: targetId } : step
    );

    const backlog = version.sidecar.improvementBacklog ?? [];
    const updatedBacklog = backlog.map((item) => {
      const bp = item.automationBlueprint;
      const ids = bp?.systemIds;
      if (!ids || ids.length === 0) return item;

      const replaced = ids.map((id) => (id === sourceId ? targetId : id));
      const deduped = Array.from(new Set(replaced));

      const changed = deduped.length !== ids.length || deduped.some((v, i) => v !== ids[i]);
      if (!changed) return item;

      return {
        ...item,
        updatedAt: new Date().toISOString(),
        automationBlueprint: { ...bp, systemIds: deduped },
      };
    });

    await onSave({
      sidecar: {
        ...version.sidecar,
        systems: updatedSystems,
        improvementBacklog: updatedBacklog,
        ...(draft ? { captureDraft: { ...draft, happyPath: updatedHappyPath! } } : {}),
      },
    });
  };

  const mergeDataObjects = async (sourceId: string, targetId: string) => {
    const source = dataObjects.find((d) => d.id === sourceId);
    const target = dataObjects.find((d) => d.id === targetId);

    if (!source) throw new Error(`Quell-Datenobjekt nicht gefunden: ${sourceId}`);
    if (!target) throw new Error(`Ziel-Datenobjekt nicht gefunden: ${targetId}`);

    const mergedAliases = mergeAliases({
      canonicalName: target.name,
      existing: target.aliases,
      incoming: [source.name, ...(source.aliases ?? [])],
    });

    const updatedDataObjects = dataObjects
      .filter((d) => d.id !== sourceId)
      .map((d) => (d.id === targetId ? { ...d, aliases: mergedAliases } : d));

    const draft = version.sidecar.captureDraft;
    const updatedHappyPath = draft?.happyPath.map((step) => {
      const mapArr = (arr?: string[]) => {
        if (!arr || arr.length === 0) return arr;
        const replaced = arr.map((id) => (id === sourceId ? targetId : id));
        const deduped = Array.from(new Set(replaced));
        return deduped;
      };

      const newDataIn = mapArr(step.dataIn);
      const newDataOut = mapArr(step.dataOut);

      const changed =
        (step.dataIn?.join('|') ?? '') !== (newDataIn?.join('|') ?? '') ||
        (step.dataOut?.join('|') ?? '') !== (newDataOut?.join('|') ?? '');

      return changed ? { ...step, dataIn: newDataIn, dataOut: newDataOut } : step;
    });

    const backlog = version.sidecar.improvementBacklog ?? [];
    const updatedBacklog = backlog.map((item) => {
      const bp = item.automationBlueprint;
      const ids = bp?.dataObjectIds;
      if (!ids || ids.length === 0) return item;

      const replaced = ids.map((id) => (id === sourceId ? targetId : id));
      const deduped = Array.from(new Set(replaced));

      const changed = deduped.length !== ids.length || deduped.some((v, i) => v !== ids[i]);
      if (!changed) return item;

      return {
        ...item,
        updatedAt: new Date().toISOString(),
        automationBlueprint: { ...bp, dataObjectIds: deduped },
      };
    });

    await onSave({
      sidecar: {
        ...version.sidecar,
        dataObjects: updatedDataObjects,
        improvementBacklog: updatedBacklog,
        ...(draft ? { captureDraft: { ...draft, happyPath: updatedHappyPath! } } : {}),
      },
    });
  };

  const mergeKpis = async (sourceId: string, targetId: string) => {
    const source = kpis.find((k) => k.id === sourceId);
    const target = kpis.find((k) => k.id === targetId);

    if (!source) throw new Error(`Quell-KPI nicht gefunden: ${sourceId}`);
    if (!target) throw new Error(`Ziel-KPI nicht gefunden: ${targetId}`);

    const mergedAliases = mergeAliases({
      canonicalName: target.name,
      existing: target.aliases,
      incoming: [source.name, ...(source.aliases ?? [])],
    });

    const updatedKpis = kpis
      .filter((k) => k.id !== sourceId)
      .map((k) => (k.id === targetId ? { ...k, aliases: mergedAliases } : k));

    const backlog = version.sidecar.improvementBacklog ?? [];
    const updatedBacklog = backlog.map((item) => {
      const bp = item.automationBlueprint;
      const ids = bp?.kpiIds;
      if (!ids || ids.length === 0) return item;

      const replaced = ids.map((id) => (id === sourceId ? targetId : id));
      const deduped = Array.from(new Set(replaced));

      const changed = deduped.length !== ids.length || deduped.some((v, i) => v !== ids[i]);
      if (!changed) return item;

      return {
        ...item,
        updatedAt: new Date().toISOString(),
        automationBlueprint: { ...bp, kpiIds: deduped },
      };
    });

    await onSave({
      sidecar: {
        ...version.sidecar,
        kpis: updatedKpis,
        improvementBacklog: updatedBacklog,
      },
    });
  };

  const handleMerge = async () => {
    if (!sourceId || !targetId || sourceId === targetId) return;

    const source = items.find((i) => i.id === sourceId);
    const target = items.find((i) => i.id === targetId);

    if (!source || !target) return;

    const preview = getPreviewCounts();
    const typeLabel =
      mergeType === 'roles' ? 'Rolle' :
      mergeType === 'systems' ? 'System' :
      mergeType === 'dataObjects' ? 'Datenobjekt' :
      'KPI';

    let message = `${typeLabel} zusammenführen?\n\n`;
    message += `Quelle: ${source.name}\n`;
    message += `Ziel: ${target.name}\n\n`;
    message += `Betroffene Schritte: ${preview.stepsAffected}\n`;

    if (preview.blueprintsAffected > 0) {
      const blueprintFieldName =
        mergeType === 'systems' ? 'systemIds' :
        mergeType === 'dataObjects' ? 'dataObjectIds' :
        'kpiIds';
      message += `Betroffene Maßnahmen (Blueprint ${blueprintFieldName}): ${preview.blueprintsAffected}\n`;
    }

    if (preview.aliasesToMerge.length > 0) {
      message += `\nAliases die übernommen werden: ${preview.aliasesToMerge.slice(0, 3).join(', ')}`;
      if (preview.aliasesToMerge.length > 3) {
        message += ` (+${preview.aliasesToMerge.length - 3} weitere)`;
      }
    }

    if (!window.confirm(message)) return;

    setMerging(true);
    try {
      if (mergeType === 'roles') {
        await mergeRoles(sourceId, targetId);
      } else if (mergeType === 'systems') {
        await mergeSystems(sourceId, targetId);
      } else if (mergeType === 'dataObjects') {
        await mergeDataObjects(sourceId, targetId);
      } else {
        await mergeKpis(sourceId, targetId);
      }

      setSourceId('');
      setTargetId('');
    } catch (error) {
      alert(`Fehler beim Zusammenführen: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    } finally {
      setMerging(false);
    }
  };

  const preview = getPreviewCounts();
  const canMerge =
    !hasUnsavedStepEdits &&
    sourceId &&
    targetId &&
    sourceId !== targetId &&
    !merging;

  const formatItemLabel = (item: ProcessRole | ProcessSystem | ProcessDataObject | ProcessKPI) => {
    const idShort = item.id.slice(0, 8);
    const aliasCount = (item.aliases || []).length;
    const aliasInfo = aliasCount > 0 ? ` (${aliasCount} Alias${aliasCount > 1 ? 'e' : ''})` : '';
    return `${item.name}${aliasInfo} [${idShort}]`;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <GitMerge className="w-5 h-5 text-slate-700" />
        <h3 className="text-lg font-semibold text-slate-900">Katalog bereinigen (Merge)</h3>
      </div>

      {hasUnsavedStepEdits && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Es gibt ungespeicherte Schritt-Edits. Bitte zuerst „Schritt-Details speichern", dann
              mergen.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Typ</label>
          <select
            value={mergeType}
            onChange={(e) => {
              setMergeType(e.target.value as MergeType);
              setSourceId('');
              setTargetId('');
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="roles">Rollen</option>
            <option value="systems">Systeme</option>
            <option value="dataObjects">Datenobjekte</option>
            <option value="kpis">KPIs</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Quelle</label>
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Bitte wählen</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatItemLabel(item)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Ziel</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Bitte wählen</option>
              {items.map((item) => (
                <option key={item.id} value={item.id} disabled={item.id === sourceId}>
                  {formatItemLabel(item)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {sourceId && targetId && sourceId !== targetId && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
            <h4 className="text-sm font-semibold text-slate-900">Vorschau</h4>
            <div className="text-sm text-slate-700 space-y-1">
              <p>Betroffene Schritte: <strong>{preview.stepsAffected}</strong></p>
              {preview.blueprintsAffected > 0 && (
                <p>
                  Betroffene Maßnahmen (Blueprint{' '}
                  {mergeType === 'systems' ? 'systemIds' :
                   mergeType === 'dataObjects' ? 'dataObjectIds' :
                   'kpiIds'}):{' '}
                  <strong>{preview.blueprintsAffected}</strong>
                </p>
              )}
              {preview.aliasesToMerge.length > 0 && (
                <div>
                  <p className="font-medium">Aliases die ins Ziel übernommen werden:</p>
                  <p className="text-xs text-slate-600 mt-1">
                    {preview.aliasesToMerge.slice(0, 6).join(', ')}
                    {preview.aliasesToMerge.length > 6 && ` (+${preview.aliasesToMerge.length - 6} weitere)`}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <button
          onClick={handleMerge}
          disabled={!canMerge}
          className="w-full px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          {merging ? 'Wird zusammengeführt...' : 'Zusammenführen'}
        </button>
      </div>
    </div>
  );
}

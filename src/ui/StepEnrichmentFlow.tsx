import { useState } from 'react';
import { ArrowLeft, ArrowRight, X, Save } from 'lucide-react';
import type { CaptureDraftStep, WorkType } from '../domain/capture';
import type { ProcessRole, ProcessSystem } from '../domain/process';

interface StepEnrichmentFlowProps {
  steps: CaptureDraftStep[];
  roles: ProcessRole[];
  systems: ProcessSystem[];
  stepEdits: Record<string, Partial<CaptureDraftStep>>;
  onPatchStep: (stepId: string, patch: Partial<CaptureDraftStep>) => void;
  onSaveAll: () => Promise<void>;
  saving: boolean;
  onClose: () => void;
}

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  unknown: 'Noch nicht festgelegt',
  manual: 'Manuell (ohne IT)',
  user_task: 'Mit IT-Unterstützung',
  service_task: 'Vollautomatisch',
  ai_assisted: 'KI-unterstützt',
};

export function StepEnrichmentFlow({
  steps,
  roles,
  systems,
  stepEdits,
  onPatchStep,
  onSaveAll,
  saving,
  onClose,
}: StepEnrichmentFlowProps) {
  const [index, setIndex] = useState(0);

  if (steps.length === 0) {
    return (
      <div className="border border-slate-200 rounded-lg p-6 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Geführte Zuordnung</h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded"
            title="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-600">Keine Schritte vorhanden. Erfassen Sie zuerst den Happy Path.</p>
      </div>
    );
  }

  const currentStep = steps[index];
  const currentEdit = stepEdits[currentStep.stepId] ?? {};

  const effectiveRoleId = currentEdit.roleId !== undefined ? currentEdit.roleId : currentStep.roleId;
  const effectiveSystemId = currentEdit.systemId !== undefined ? currentEdit.systemId : currentStep.systemId;
  const effectiveWorkType = currentEdit.workType ?? currentStep.workType ?? 'unknown';

  const handleRoleChange = (value: string) => {
    onPatchStep(currentStep.stepId, { roleId: value || null });
  };

  const handleSystemChange = (value: string) => {
    onPatchStep(currentStep.stepId, { systemId: value || null });
  };

  const handleWorkTypeChange = (value: string) => {
    onPatchStep(currentStep.stepId, { workType: value as WorkType });
  };

  const canGoBack = index > 0;
  const canGoForward = index < steps.length - 1;

  return (
    <div className="border border-slate-300 rounded-lg p-6 bg-gradient-to-br from-blue-50 to-white shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Geführte Zuordnung</h3>
          <p className="text-sm text-slate-600 mt-1">
            Schritt {index + 1} von {steps.length}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-600 rounded"
          title="Schließen"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="mb-4 w-full bg-slate-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${((index + 1) / steps.length) * 100}%` }}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="text-sm text-slate-500 mb-1">Aktueller Schritt:</div>
        <div className="text-lg font-medium text-slate-900">
          {currentStep.order}. {currentStep.label}
        </div>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Rolle / Verantwortlicher
          </label>
          <select
            value={effectiveRoleId || ''}
            onChange={(e) => handleRoleChange(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">(keine)</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          {roles.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              Keine Rollen erfasst. Bitte zuerst Rollen im Wizard definieren.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            System / Anwendung
          </label>
          <select
            value={effectiveSystemId || ''}
            onChange={(e) => handleSystemChange(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">(keines)</option>
            {systems.map((system) => (
              <option key={system.id} value={system.id}>
                {system.name}
              </option>
            ))}
          </select>
          {systems.length === 0 && (
            <p className="text-xs text-slate-500 mt-1">
              Keine Systeme erfasst. Optional: Systeme im Wizard definieren.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Arbeitstyp
          </label>
          <select
            value={effectiveWorkType}
            onChange={(e) => handleWorkTypeChange(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {(Object.keys(WORK_TYPE_LABELS) as WorkType[]).map((workType) => (
              <option key={workType} value={workType}>
                {WORK_TYPE_LABELS[workType]}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">
            Hilft bei der Automatisierungsanalyse.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <div className="flex gap-2">
          <button
            onClick={() => setIndex(index - 1)}
            disabled={!canGoBack}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Zurück
          </button>
          <button
            onClick={() => setIndex(index + 1)}
            disabled={!canGoForward}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            Weiter
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col items-end gap-1">
          <button
            onClick={onSaveAll}
            disabled={saving}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Speichert...' : 'Speichern'}
          </button>
          <p className="text-xs text-slate-500">Speichert alle Schritt-Details</p>
        </div>
      </div>
    </div>
  );
}

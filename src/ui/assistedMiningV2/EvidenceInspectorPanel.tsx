import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BadgeInfo, FileCheck2, FileText, Layers3, Monitor, Timer, UserRound } from 'lucide-react';
import type { ProcessMiningObservation, ProcessMiningObservationCase } from '../../domain/process';
import { inferStepFamily } from './semanticStepFamilies';
import { CollapsibleCard } from '../components/CollapsibleCard';

interface Props {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  onFocusCase?: (caseId: string) => void;
}

function getSourceLabel(caseItem?: ProcessMiningObservationCase): string {
  if (!caseItem?.sourceType || caseItem.sourceType === 'narrative') return 'Freitext';
  if (caseItem.sourceType === 'pdf') return 'PDF';
  if (caseItem.sourceType === 'docx') return 'DOCX';
  if (caseItem.sourceType === 'csv-row') return 'CSV';
  if (caseItem.sourceType === 'xlsx-row') return 'XLSX';
  if (caseItem.sourceType === 'eventlog') return 'Ereignistabelle';
  return 'Quelle';
}

function getConfidenceLabel(observation: ProcessMiningObservation): {
  label: string;
  tone: string;
} {
  const hasEvidence = Boolean(observation.evidenceSnippet?.trim());
  const hasContext = Boolean(observation.role?.trim() || observation.system?.trim());
  if (hasEvidence && hasContext) {
    return { label: 'gut belegt', tone: 'bg-green-100 text-green-800 border-green-200' };
  }
  if (hasEvidence) {
    return { label: 'brauchbar belegt', tone: 'bg-amber-100 text-amber-800 border-amber-200' };
  }
  return { label: 'noch dünn belegt', tone: 'bg-slate-100 text-slate-700 border-slate-200' };
}

export function EvidenceInspectorPanel({ cases, observations, onFocusCase }: Props) {
  const stepObservations = useMemo(
    () => observations
      .filter(observation => observation.kind === 'step')
      .sort((a, b) => {
        if ((a.sourceCaseId ?? '') !== (b.sourceCaseId ?? '')) {
          return (a.sourceCaseId ?? '').localeCompare(b.sourceCaseId ?? '');
        }
        return a.sequenceIndex - b.sequenceIndex;
      }),
    [observations],
  );
  const caseOptions = useMemo(
    () => cases.filter(caseItem => stepObservations.some(observation => observation.sourceCaseId === caseItem.id)),
    [cases, stepObservations],
  );

  const [selectedCaseId, setSelectedCaseId] = useState<string>(caseOptions[0]?.id ?? '');
  const caseStepOptions = useMemo(
    () => stepObservations.filter(observation => observation.sourceCaseId === selectedCaseId),
    [selectedCaseId, stepObservations],
  );
  const [selectedObservationId, setSelectedObservationId] = useState<string>(caseStepOptions[0]?.id ?? '');

  useEffect(() => {
    if (caseOptions.length === 0) {
      setSelectedCaseId('');
      return;
    }
    if (!caseOptions.some(caseItem => caseItem.id === selectedCaseId)) {
      setSelectedCaseId(caseOptions[0].id);
    }
  }, [caseOptions, selectedCaseId]);

  useEffect(() => {
    if (caseStepOptions.length === 0) {
      setSelectedObservationId('');
      return;
    }
    if (!caseStepOptions.some(observation => observation.id === selectedObservationId)) {
      setSelectedObservationId(caseStepOptions[0].id);
    }
  }, [caseStepOptions, selectedObservationId]);

  if (stepObservations.length === 0) return null;

  const selectedObservation = caseStepOptions.find(observation => observation.id === selectedObservationId) ?? caseStepOptions[0];
  const selectedCase = cases.find(caseItem => caseItem.id === selectedObservation?.sourceCaseId);
  const family = selectedObservation ? inferStepFamily(selectedObservation.label) : null;
  const confidence = selectedObservation ? getConfidenceLabel(selectedObservation) : null;

  return (
    <CollapsibleCard
      title="Beleg-Inspektor"
      helpKey="pmv2.evidence"
      description="Zeigt an einem konkreten Schritt, welche Textstelle die App verwendet und warum der Schritt so benannt wurde."
      defaultOpen={false}
      right={
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
          optionaler Qualitätsblick
        </span>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">1. Quelle wählen</p>
            <select
              value={selectedCaseId}
              onChange={event => setSelectedCaseId(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
            >
              {caseOptions.map(caseItem => (
                <option key={caseItem.id} value={caseItem.id}>
                  {caseItem.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">2. Schritt ansehen</p>
            <select
              value={selectedObservationId}
              onChange={event => setSelectedObservationId(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
            >
              {caseStepOptions.map((observation, index) => (
                <option key={observation.id} value={observation.id}>
                  {index + 1}. {observation.label}
                </option>
              ))}
            </select>
          </div>

          {selectedCase && (
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                <span>{selectedCase.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Layers3 className="h-3.5 w-3.5 text-slate-500" />
                <span>{getSourceLabel(selectedCase)}</span>
              </div>
              {selectedCase.sourceNote && <p className="leading-relaxed">{selectedCase.sourceNote}</p>}
              {selectedCase.id && onFocusCase && (
                <button
                  type="button"
                  onClick={() => onFocusCase(selectedCase.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Quelle im Detail öffnen
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {selectedObservation && confidence && (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold text-slate-900">{selectedObservation.label}</p>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${confidence.tone}`}>
                {confidence.label}
              </span>
              {family && (
                <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-800">
                  Schrittfamilie erkannt
                </span>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-slate-500">
                  <BadgeInfo className="h-4 w-4" />
                  <p className="text-xs">Einordnung</p>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-800">{family ? family.label : 'Originalformulierung als Schritt'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-slate-500">
                  <UserRound className="h-4 w-4" />
                  <p className="text-xs">Rolle</p>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-800">{selectedObservation.role || 'noch nicht ergänzt'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-slate-500">
                  <Monitor className="h-4 w-4" />
                  <p className="text-xs">System</p>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-800">{selectedObservation.system || 'noch nicht ergänzt'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-slate-500">
                  <Timer className="h-4 w-4" />
                  <p className="text-xs">Zeitbezug</p>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {selectedObservation.timestampRaw || (selectedObservation.timestampQuality === 'real' ? 'echte Zeit erkannt' : selectedObservation.timestampQuality === 'synthetic' ? 'relative Zeit' : 'keine Zeitangabe')}
                </p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
              <div className="space-y-2 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                <div className="flex items-center gap-2 text-cyan-900">
                  <FileCheck2 className="h-4 w-4" />
                  <p className="text-sm font-semibold">Belegstelle</p>
                </div>
                <p className="text-sm leading-relaxed text-slate-800">
                  {selectedObservation.evidenceSnippet?.trim()
                    ? selectedObservation.evidenceSnippet
                    : 'Zu diesem Schritt liegt noch keine konkrete Belegstelle vor. Eine kurze Nachschärfung in der Detailkarte verbessert Vertrauen und Datenreife.'}
                </p>
              </div>

              <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50 p-4">
                <div className="flex items-center gap-2 text-violet-900">
                  <BadgeInfo className="h-4 w-4" />
                  <p className="text-sm font-semibold">Warum die App diesen Schritt so sieht</p>
                </div>
                <ul className="space-y-2 text-sm leading-relaxed text-slate-800">
                  <li>
                    {family
                      ? `Die Formulierung passt zu einer bekannten Schrittfamilie und wird deshalb vereinheitlicht als „${family.label}“ geführt.`
                      : 'Die App konnte keine feste Schrittfamilie ableiten und verwendet deshalb die gefundene Formulierung direkt als Prozessschritt.'}
                  </li>
                  <li>
                    {selectedObservation.evidenceSnippet?.trim()
                      ? 'Die Belegstelle ist direkt mit dem Schritt verknüpft. Das erleichtert Prüfung, Korrektur und Vertrauen in die Ableitung.'
                      : 'Für diesen Schritt fehlt noch ein klarer Textbeleg. Das ist kein Fehler, aber ein sinnvoller Prüfpunkt.'}
                  </li>
                  <li>
                    {selectedObservation.role || selectedObservation.system
                      ? 'Rollen- oder Systemkontext ist bereits vorhanden und macht spätere Übergabe- oder Hotspot-Analysen robuster.'
                      : 'Noch fehlt ergänzender Rollen- oder Systemkontext. Wenn Sie ihn nachtragen, werden spätere Analysen stabiler.'}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}

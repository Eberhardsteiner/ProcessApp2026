import { useState } from 'react';
import { Sparkles, Plus, Info, CheckCircle2 } from 'lucide-react';
import type { ProcessMiningObservationCase, ProcessMiningObservation, DerivationSummary } from '../../domain/process';
import { deriveProcessArtifactsFromText } from './documentDerivation';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  existingCaseCount: number;
  onAddCase: (caseItem: ProcessMiningObservationCase) => void;
  onAddDerived: (
    caseItem: ProcessMiningObservationCase,
    observations: ProcessMiningObservation[],
    summary?: DerivationSummary,
  ) => void;
}

const EXAMPLE_NARRATIVE = `Beispiel: Am Montag öffnet die Sachbearbeiterin das Ticket. Sie prüft die Angaben — das dauert etwa 10 Minuten. Falls Unterlagen fehlen, schreibt sie eine E-Mail und wartet bis zu 2 Tage. Danach leitet sie den Vorgang weiter. Am Ende informiert sie den Kunden per E-Mail.`;

export function ObservationIntakePanel({ existingCaseCount, onAddCase, onAddDerived }: Props) {
  const [name, setName] = useState('');
  const [narrative, setNarrative] = useState('');
  const [showExtra, setShowExtra] = useState(false);
  const [caseRef, setCaseRef] = useState('');
  const [dateHints, setDateHints] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const [deriving, setDeriving] = useState(false);
  const [lastResult, setLastResult] = useState<{ stepCount: number; confidence: string } | null>(null);

  function buildCase(): ProcessMiningObservationCase {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      name: name.trim() || `Fall ${existingCaseCount + 1}`,
      narrative: narrative.trim(),
      rawText: narrative.trim(),
      inputKind: 'narrative',
      sourceType: 'narrative',
      caseRef: caseRef.trim() || undefined,
      dateHints: dateHints.trim() || undefined,
      sourceNote: sourceNote.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
  }

  function reset() {
    setName('');
    setNarrative('');
    setCaseRef('');
    setDateHints('');
    setSourceNote('');
    setLastResult(null);
  }

  function handleRawSave() {
    if (!narrative.trim()) return;
    onAddCase(buildCase());
    reset();
  }

  function handleAutoDerive() {
    if (!narrative.trim()) return;
    setDeriving(true);
    const caseItem = buildCase();
    const result = deriveProcessArtifactsFromText({
      text: narrative.trim(),
      fileName: caseItem.name,
      sourceType: 'narrative',
    });
    caseItem.id = result.cases[0]?.id ?? caseItem.id;
    const caseToUse = result.cases[0] ?? caseItem;
    setDeriving(false);
    setLastResult({ stepCount: result.observations.length, confidence: result.confidence });
    onAddDerived(caseToUse, result.observations, result.summary);
    reset();
  }

  const canSubmit = narrative.trim().length > 10;

  return (
    <div className="border border-blue-200 rounded-xl bg-blue-50/40 p-5 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <label className="block text-sm font-semibold text-slate-700">
            Prozessfall beschreiben
          </label>
          <HelpPopover helpKey="pmv2.observations.describe" ariaLabel="Hilfe: Prozessfall beschreiben" />
        </div>
        <p className="text-xs text-slate-500">
          Beschreibe einen konkreten Ablauf so, wie er in der Praxis passiert. Die App erkennt die Prozessschritte automatisch.
        </p>
      </div>

      {lastResult && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{lastResult.stepCount} Schritte automatisch erkannt · Verlässlichkeit: {lastResult.confidence === 'high' ? 'hoch' : lastResult.confidence === 'medium' ? 'mittel' : 'niedrig'}</span>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Bezeichnung (optional)</label>
          <input
            type="text"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder={`Fall ${existingCaseCount + 1}`}
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Beschreibung <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={5}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
            placeholder={EXAMPLE_NARRATIVE}
            value={narrative}
            onChange={e => setNarrative(e.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={() => setShowExtra(s => !s)}
          className="text-xs text-slate-400 hover:text-slate-600 underline"
        >
          {showExtra ? 'Zusatzfelder ausblenden' : 'Zusatzfelder einblenden (Fall-ID, Datum, Quelle)'}
        </button>

        {showExtra && (
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Fall-ID / Ticket-Nr.</label>
              <input type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="z.B. TKT-1234" value={caseRef} onChange={e => setCaseRef(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Zeitraum / Datum</label>
              <input type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="z.B. Januar 2024" value={dateHints} onChange={e => setDateHints(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Quelle / Notiz</label>
              <input type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="z.B. Workshop" value={sourceNote} onChange={e => setSourceNote(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex gap-2 text-xs text-slate-500">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          „Prozess automatisch erkennen" analysiert den Text und extrahiert Prozessschritte. Je konkreter die Beschreibung, desto besser das Ergebnis.
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={!canSubmit || deriving}
          onClick={handleAutoDerive}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          {deriving ? 'Wird erkannt…' : 'Prozess automatisch erkennen'}
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleRawSave}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nur als Rohtext speichern
        </button>
      </div>
    </div>
  );
}

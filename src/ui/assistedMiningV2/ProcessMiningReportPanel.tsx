import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Download,
  FileText,
  RefreshCw,
  Send,
  Users,
} from 'lucide-react';
import type {
  ProcessMiningHandoverDraft,
  ProcessMiningReportSnapshot,
} from '../../domain/process';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  report?: ProcessMiningReportSnapshot;
  handovers?: ProcessMiningHandoverDraft[];
  onGenerate: () => void;
  onSaveEvidence: (text: string, key: string) => void;
  onAdoptSummary: (text: string) => void;
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function sanitizeFilename(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9äöüÄÖÜß _-]+/g, '')
    .replace(/\s+/g, '_')
    .trim() || 'mining_report';
}

function getAudienceTone(audience: ProcessMiningHandoverDraft['audience']): string {
  if (audience === 'management') return 'border-cyan-200 bg-cyan-50';
  if (audience === 'process_owner') return 'border-violet-200 bg-violet-50';
  if (audience === 'operations') return 'border-amber-200 bg-amber-50';
  return 'border-emerald-200 bg-emerald-50';
}

export function ProcessMiningReportPanel({
  report,
  handovers = [],
  onGenerate,
  onSaveEvidence,
  onAdoptSummary,
}: Props) {
  const [copiedKey, setCopiedKey] = useState<string>('');
  const [savedKey, setSavedKey] = useState<string>('');
  const [openAudience, setOpenAudience] = useState<Set<string>>(new Set(['management']));

  const generatedLabel = useMemo(
    () => (report?.generatedAt ? new Date(report.generatedAt).toLocaleString('de-DE') : ''),
    [report?.generatedAt],
  );

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(current => (current === key ? '' : current)), 1800);
  }

  function toggleAudience(audience: string) {
    setOpenAudience(prev => {
      const next = new Set(prev);
      if (next.has(audience)) next.delete(audience);
      else next.add(audience);
      return next;
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-slate-800">
            <FileText className="w-4 h-4 text-cyan-600" />
            <h3 className="text-sm font-semibold">Berichte und Übergaben</h3>
            <HelpPopover helpKey="pmv2.reporting" ariaLabel="Hilfe: Berichte und Übergaben" />
            {report && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                Zuletzt erzeugt: {generatedLabel}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Erzeugen Sie lokal einen gut lesbaren Bericht, eine verständliche Prozessgeschichte und
            sofort nutzbare Übergabetexte für Management, Prozessverantwortung, operatives Team
            oder den nächsten Workshop.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onGenerate}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-cyan-700 transition-colors"
          >
            {report ? <RefreshCw className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            {report ? 'Bericht neu erzeugen' : 'Bericht lokal erzeugen'}
          </button>
          {report && (
            <>
              <button
                type="button"
                onClick={() => onAdoptSummary(report.executiveSummary)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <Send className="w-4 h-4" />
                Kurzfassung übernehmen
              </button>
              <button
                type="button"
                onClick={() => copyText(report.markdown, 'report-markdown')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                {copiedKey === 'report-markdown' ? <Check className="w-4 h-4 text-green-600" /> : <ClipboardCopy className="w-4 h-4" />}
                Bericht kopieren
              </button>
              <button
                type="button"
                onClick={() => downloadTextFile(`${sanitizeFilename(report.title)}.txt`, report.markdown)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <Download className="w-4 h-4" />
                Als Text laden
              </button>
            </>
          )}
        </div>
      </div>

      {!report ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600 leading-relaxed">
          Noch kein Bericht erzeugt. Sobald Sie den Bericht lokal erzeugen, erhalten Sie eine
          Management-Kurzfassung, eine erzählende Einordnung des aktuell erkannten Prozesses und
          direkt nutzbare Übergaben für verschiedene Zielgruppen.
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-cyan-900">
                <FileText className="w-4 h-4" />
                <p className="text-sm font-semibold">Management-Kurzfassung</p>
              </div>
              <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">{report.executiveSummary}</p>
            </div>

            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-violet-900">Was die App daraus erzählt</p>
                <p className="mt-2 text-sm text-slate-800 leading-relaxed whitespace-pre-line">{report.processStory}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <p className="text-sm font-semibold text-slate-800">Wichtigste Befunde</p>
              <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
                {report.keyFindings.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <p className="text-sm font-semibold text-slate-800">Nächste sinnvolle Schritte</p>
              <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
                {report.nextActions.map(item => <li key={item}>{item}</li>)}
              </ul>
              {report.cautionNotes.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 leading-relaxed">
                  <span className="font-semibold">Wichtige Einordnung:</span> {report.cautionNotes[0]}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-slate-800">
              <Users className="w-4 h-4 text-cyan-600" />
              <p className="text-sm font-semibold">Übergabetexte für unterschiedliche Zielgruppen</p>
              <HelpPopover helpKey="pmv2.handover" ariaLabel="Hilfe: Übergaben" />
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {handovers.map(entry => {
                const isOpen = openAudience.has(entry.audience);
                const tone = getAudienceTone(entry.audience);
                const saveKey = `handover-${entry.audience}`;
                return (
                  <div key={entry.audience} className={`rounded-xl border p-4 ${tone}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{entry.label}</p>
                        <p className="mt-1 text-xs text-slate-600 leading-relaxed">{entry.summary}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleAudience(entry.audience)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/70 bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-white"
                      >
                        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        {isOpen ? 'Ausblenden' : 'Anzeigen'}
                      </button>
                    </div>

                    {isOpen && (
                      <>
                        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-white/70 bg-white/70 p-3 text-xs leading-relaxed text-slate-700 font-sans">
                          {entry.text}
                        </pre>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => copyText(entry.text, entry.audience)}
                            className="inline-flex items-center gap-2 rounded-lg border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
                          >
                            {copiedKey === entry.audience ? <Check className="w-3.5 h-3.5 text-green-600" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                            Kopieren
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onSaveEvidence(entry.text, saveKey);
                              setSavedKey(saveKey);
                              setTimeout(() => setSavedKey(current => (current === saveKey ? '' : current)), 1800);
                            }}
                            className="inline-flex items-center gap-2 rounded-lg border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
                          >
                            {savedKey === saveKey ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Download className="w-3.5 h-3.5" />}
                            Als Evidenz merken
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

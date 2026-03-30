import { useState, useEffect } from 'react';
import type { Process, ProcessVersion, SemanticQuestion } from '../domain/process';
import { CheckCircle2, Circle, Download, Copy } from 'lucide-react';

interface SemanticQuestionsChecklistEditorProps {
  process: Process;
  version: ProcessVersion;
  onSave: (patch: Partial<ProcessVersion>) => Promise<void>;
}

export function SemanticQuestionsChecklistEditor({
  process,
  version,
  onSave,
}: SemanticQuestionsChecklistEditorProps) {
  const [localQuestions, setLocalQuestions] = useState<SemanticQuestion[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setLocalQuestions(structuredClone(version.quality.semanticQuestions || []));
  }, [version.versionId, version.updatedAt, version.quality.semanticQuestions]);

  const openCount = localQuestions.filter((q) => q.status !== 'done').length;
  const doneCount = localQuestions.filter((q) => q.status === 'done').length;

  const visibleQuestions = showDone
    ? localQuestions
    : localQuestions.filter((q) => q.status !== 'done');

  const handleToggleStatus = (id: string) => {
    setLocalQuestions((prev) =>
      prev.map((q) =>
        q.id === id ? { ...q, status: q.status === 'done' ? 'open' : 'done' } : q
      )
    );
  };

  const handleAnswerChange = (id: string, answer: string) => {
    setLocalQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, answer } : q)));
  };

  const handleStepChange = (id: string, stepId: string) => {
    setLocalQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, relatedStepId: stepId || undefined } : q))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await onSave({
        quality: {
          ...version.quality,
          semanticQuestions: localQuestions,
        },
      });
      setMessage('Gespeichert');
      setTimeout(() => setMessage(''), 2000);
    } catch (err) {
      setMessage(`Fehler: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyMarkdown = () => {
    const openQuestions = localQuestions.filter((q) => q.status !== 'done');
    const versionShort = version.versionId.slice(0, 8);
    const dateStr = new Date().toLocaleDateString('de-DE');
    const stepLookup = new Map<string, string>();
    (version.sidecar.captureDraft?.happyPath || []).forEach((step) => {
      stepLookup.set(step.stepId, `Schritt ${step.order}: ${step.label}`);
    });

    let md = `# Offene Prüffragen: ${process.title}\n\n`;
    md += `**Version:** ${versionShort}\n`;
    md += `**Datum:** ${dateStr}\n`;
    md += `**Anzahl offen:** ${openQuestions.length}\n\n`;
    md += `---\n\n`;

    openQuestions.forEach((q, idx) => {
      md += `## ${idx + 1}. ${q.question}\n\n`;
      if (q.relatedStepId && stepLookup.has(q.relatedStepId)) {
        md += `**Zugeordnet zu:** ${stepLookup.get(q.relatedStepId)}\n\n`;
      } else if (q.relatedStepHint) {
        md += `**Bezug:** ${q.relatedStepHint}\n\n`;
      }
      if (q.answer?.trim()) {
        md += `**Notiz:** ${q.answer}\n\n`;
      }
      md += `---\n\n`;
    });

    navigator.clipboard.writeText(md).then(() => {
      setMessage('Markdown in Zwischenablage kopiert');
      setTimeout(() => setMessage(''), 2000);
    });
  };

  const handleDownloadCsv = () => {
    const openQuestions = localQuestions.filter((q) => q.status !== 'done');

    const escapeCsv = (val: string) => {
      if (val.includes(';') || val.includes('\n') || val.includes('"')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    let csv = 'status;question;relatedStepHint;relatedStepId;answer\n';
    openQuestions.forEach((q) => {
      csv += `${escapeCsv(q.status || 'open')};`;
      csv += `${escapeCsv(q.question)};`;
      csv += `${escapeCsv(q.relatedStepHint || '')};`;
      csv += `${escapeCsv(q.relatedStepId || '')};`;
      csv += `${escapeCsv(q.answer || '')}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `offene-fragen-${process.title.replace(/[^a-z0-9]/gi, '-')}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const steps = version.sidecar.captureDraft?.happyPath || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">{openCount}</span> offen
            <span className="mx-2">·</span>
            <span className="font-medium text-slate-900">{doneCount}</span> erledigt
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="rounded border-slate-300"
            />
            Erledigte anzeigen
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyMarkdown}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-md hover:bg-slate-50 flex items-center gap-2"
            title="Offene Fragen als Markdown kopieren"
          >
            <Copy className="w-4 h-4" />
            Markdown
          </button>
          <button
            onClick={handleDownloadCsv}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-md hover:bg-slate-50 flex items-center gap-2"
            title="Offene Fragen als CSV herunterladen"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-400"
          >
            {saving ? 'Speichere...' : 'Änderungen speichern'}
          </button>
        </div>
      </div>

      {message && (
        <div className="text-sm text-slate-700 bg-slate-100 border border-slate-200 rounded px-3 py-2">
          {message}
        </div>
      )}

      {visibleQuestions.length === 0 && (
        <div className="text-center py-8 text-slate-500">
          {showDone ? 'Keine Fragen vorhanden' : 'Keine offenen Fragen'}
        </div>
      )}

      <div className="space-y-4">
        {visibleQuestions.map((q) => (
          <div
            key={q.id}
            className={`border rounded-lg p-4 ${
              q.status === 'done' ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <button
                onClick={() => handleToggleStatus(q.id)}
                className="mt-0.5 text-slate-400 hover:text-slate-600"
                title={q.status === 'done' ? 'Als offen markieren' : 'Als erledigt markieren'}
              >
                {q.status === 'done' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <Circle className="w-5 h-5" />
                )}
              </button>
              <div className="flex-1 space-y-3">
                <div
                  className={`font-medium ${
                    q.status === 'done' ? 'text-slate-500 line-through' : 'text-slate-900'
                  }`}
                >
                  {q.question}
                </div>

                {q.relatedStepHint && (
                  <div className="text-xs text-slate-500">Bezug: {q.relatedStepHint}</div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Zu Schritt zuordnen:
                    </label>
                    <select
                      value={q.relatedStepId || ''}
                      onChange={(e) => handleStepChange(q.id, e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md"
                      disabled={q.status === 'done'}
                    >
                      <option value="">(nicht zugeordnet)</option>
                      {steps.map((step) => (
                        <option key={step.stepId} value={step.stepId}>
                          Schritt {step.order}: {step.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Antwort / Notiz:
                  </label>
                  <textarea
                    value={q.answer || ''}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    placeholder="Notizen, Antworten, Klärungen..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                    rows={2}
                    disabled={q.status === 'done'}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import type { Process, ProcessVersion } from '../domain/process';
import { computeVersionDiff } from '../versioning/versionDiff';
import { Wand2, Copy, Check, Download, Send } from 'lucide-react';
import { buildClaudeVersionDiffExplanationPrompt } from '../ai/claudeVersionDiffExplanationPrompt';
import { runAiProxyRequest } from '../ai/aiApiClient';
import type { AppSettings } from '../settings/appSettings';

interface VersionChangesViewProps {
  process: Process;
  currentVersion: ProcessVersion;
  allVersions: ProcessVersion[];
  settings: AppSettings;
}

export function VersionChangesView({ process, currentVersion, allVersions, settings }: VersionChangesViewProps) {
  const sorted = useMemo(() => {
    return [...allVersions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allVersions]);

  const [baselineVersionId, setBaselineVersionId] = useState<string>('');
  const [aiExplainOpen, setAiExplainOpen] = useState(false);
  const [aiExplainPrompt, setAiExplainPrompt] = useState('');
  const [aiExplainPromptCopied, setAiExplainPromptCopied] = useState(false);
  const [aiExplainResponse, setAiExplainResponse] = useState('');
  const [aiExplainError, setAiExplainError] = useState('');
  const [aiExplainStatus, setAiExplainStatus] = useState('');

  const [aiApiConsent, setAiApiConsent] = useState(false);
  const [aiApiRunning, setAiApiRunning] = useState(false);
  const [aiApiError, setAiApiError] = useState('');
  const [aiApiRequestPreview, setAiApiRequestPreview] = useState('');

  const apiModeActive = settings.dataHandlingMode === 'external' && settings.ai.mode === 'api';
  const apiEndpoint = settings.ai.api.endpointUrl.trim();

  useEffect(() => {
    if (!baselineVersionId && sorted.length >= 2) {
      const currentIndex = sorted.findIndex(v => v.versionId === currentVersion.versionId);
      if (currentIndex >= 0 && currentIndex < sorted.length - 1) {
        setBaselineVersionId(sorted[currentIndex + 1].versionId);
      } else if (currentIndex === 0 && sorted.length > 1) {
        setBaselineVersionId(sorted[1].versionId);
      }
    }
  }, [baselineVersionId, sorted, currentVersion.versionId]);

  const baseline = sorted.find(v => v.versionId === baselineVersionId) || null;

  const diff = useMemo(() => {
    return baseline ? computeVersionDiff(baseline, currentVersion) : null;
  }, [baseline, currentVersion]);

  const handleCopySummary = async () => {
    if (!diff) return;

    const lines: string[] = [];
    lines.push(`Prozess: ${process.title}`);
    lines.push(`Baseline: ${diff.fromVersionId.slice(0, 8)}... | Aktuell: ${diff.toVersionId.slice(0, 8)}...`);
    lines.push('');
    lines.push(`End-to-End geändert: ${diff.endToEndChanges.length}`);
    lines.push(`Happy Path: +${diff.stepsAdded.length} / -${diff.stepsRemoved.length} / ~${diff.stepsModified.length}`);
    lines.push(`Entscheidungen: +${diff.decisionsAdded.length} / -${diff.decisionsRemoved.length}`);
    lines.push(`Ausnahmen: +${diff.exceptionsAdded.length} / -${diff.exceptionsRemoved.length}`);
    lines.push(`Backlog: +${diff.backlogAdded.length} / -${diff.backlogRemoved.length} / ~${diff.backlogModified.length}`);

    if (diff.endToEndChanges.length > 0) {
      lines.push('');
      lines.push('End-to-End Änderungen:');
      diff.endToEndChanges.forEach(ch => {
        lines.push(`  ${ch.field}: "${ch.before}" → "${ch.after}"`);
      });
    }

    if (diff.stepsAdded.length > 0) {
      lines.push('');
      lines.push('Schritte hinzugefügt:');
      diff.stepsAdded.slice(0, 10).forEach(s => {
        lines.push(`  + ${s.order}. ${s.label}`);
      });
      if (diff.stepsAdded.length > 10) {
        lines.push(`  ... und ${diff.stepsAdded.length - 10} weitere`);
      }
    }

    if (diff.stepsRemoved.length > 0) {
      lines.push('');
      lines.push('Schritte entfernt:');
      diff.stepsRemoved.slice(0, 10).forEach(s => {
        lines.push(`  - ${s.order}. ${s.label}`);
      });
      if (diff.stepsRemoved.length > 10) {
        lines.push(`  ... und ${diff.stepsRemoved.length - 10} weitere`);
      }
    }

    if (diff.stepsModified.length > 0) {
      lines.push('');
      lines.push('Schritte geändert:');
      diff.stepsModified.slice(0, 10).forEach(s => {
        lines.push(`  ~ ${s.before.order}. ${s.before.label} → ${s.after.label} (${s.changedFields.join(', ')})`);
      });
      if (diff.stepsModified.length > 10) {
        lines.push(`  ... und ${diff.stepsModified.length - 10} weitere`);
      }
    }

    const text = lines.join('\n');

    try {
      await navigator.clipboard.writeText(text);
      alert('Änderungszusammenfassung in Zwischenablage kopiert');
    } catch {
      alert('Kopieren nicht möglich, bitte manuell markieren.');
    }
  };

  function sanitizeFilename(name: string): string {
    const clean = (name || '')
      .replace(/[^a-zA-Z0-9_\-äöüÄÖÜß ]/g, '')
      .replace(/\s+/g, '_')
      .trim();
    return clean || 'prozess';
  }

  function downloadTextFile(filename: string, content: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const handleStartAiExplain = () => {
    if (!baseline) return;

    setAiExplainOpen(true);
    setAiExplainError('');
    setAiExplainStatus('');
    setAiExplainPromptCopied(false);
    setAiExplainResponse('');
    setAiApiConsent(false);
    setAiApiError('');
    setAiApiRunning(false);

    try {
      const prompt = buildClaudeVersionDiffExplanationPrompt({
        process,
        baseline,
        current: currentVersion,
      });
      setAiExplainPrompt(prompt);
      setAiExplainStatus('Prompt erzeugt. Bitte in Claude einfügen und die Markdown-Antwort hier einfügen.');
      const promptPreview = prompt.length > 4000 ? prompt.slice(0, 4000) + '\n\n… (gekürzt)' : prompt;
      setAiApiRequestPreview(JSON.stringify({ schemaVersion: 'process-ai-proxy-v1', prompt: promptPreview }, null, 2));
    } catch (err) {
      setAiExplainError('Fehler beim Erstellen des Prompts: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleCopyAiExplainPrompt = async () => {
    try {
      await navigator.clipboard.writeText(aiExplainPrompt);
      setAiExplainPromptCopied(true);
      setTimeout(() => setAiExplainPromptCopied(false), 2000);
    } catch {
      setAiExplainError('Prompt konnte nicht kopiert werden. Bitte manuell markieren und kopieren.');
    }
  };

  const handleCopyAiExplainResponse = async () => {
    try {
      await navigator.clipboard.writeText(aiExplainResponse);
      setAiExplainStatus('Antwort in Zwischenablage kopiert.');
    } catch {
      setAiExplainError('Antwort konnte nicht kopiert werden. Bitte manuell markieren und kopieren.');
    }
  };

  const handleDownloadAiExplainMd = () => {
    const base = baseline ? baseline.versionId.slice(0, 8) : 'baseline';
    const cur = currentVersion.versionId.slice(0, 8);
    const name = `changes_ai_${sanitizeFilename(process.title)}_${base}_to_${cur}.md`;
    downloadTextFile(name, aiExplainResponse, 'text/markdown;charset=utf-8');
    setAiExplainStatus('Markdown heruntergeladen.');
  };

  const handleCloseAiExplain = () => {
    setAiExplainOpen(false);
    setAiExplainPrompt('');
    setAiExplainPromptCopied(false);
    setAiExplainResponse('');
    setAiExplainError('');
    setAiExplainStatus('');
  };

  const handleApiSendDiffExplanation = async () => {
    setAiApiRunning(true);
    setAiApiError('');
    try {
      const text = await runAiProxyRequest({
        endpointUrl: apiEndpoint,
        authMode: settings.ai.api.authMode,
        apiKey: settings.ai.api.apiKey,
        timeoutMs: settings.ai.api.timeoutMs,
        prompt: aiExplainPrompt,
      });
      setAiExplainResponse(text);
      setAiExplainStatus('API-Antwort übernommen.');
    } catch (err) {
      setAiApiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiApiRunning(false);
    }
  };

  if (sorted.length < 2) {
    return (
      <div className="text-sm text-slate-600">
        Für einen Vergleich werden mindestens zwei Versionen benötigt.
      </div>
    );
  }

  const otherVersions = sorted.filter(v => v.versionId !== currentVersion.versionId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Änderungen zwischen Versionen</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Vergleichen mit (Baseline)
          </label>
          <select
            value={baselineVersionId}
            onChange={(e) => setBaselineVersionId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            <option value="">Bitte Version wählen...</option>
            {otherVersions.map(v => (
              <option key={v.versionId} value={v.versionId}>
                {new Date(v.createdAt).toLocaleString('de-DE')} · {v.status} · {v.versionId.slice(0, 8)}...
              </option>
            ))}
          </select>
        </div>

        {diff && (
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={handleCopySummary}
              className="px-4 py-2 bg-slate-700 text-white rounded-md text-sm hover:bg-slate-800"
            >
              Änderungszusammenfassung kopieren
            </button>
            <button
              onClick={handleStartAiExplain}
              className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 flex items-center gap-2"
            >
              <Wand2 size={16} />
              <span>KI: Diff erklären</span>
            </button>
          </div>
        )}
      </div>

      {diff && (
        <>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Zusammenfassung</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-600">End-to-End:</span>
                <span className="ml-2 font-medium">{diff.endToEndChanges.length} geändert</span>
              </div>
              <div>
                <span className="text-slate-600">Happy Path:</span>
                <span className="ml-2 font-medium">
                  +{diff.stepsAdded.length} / -{diff.stepsRemoved.length} / ~{diff.stepsModified.length}
                </span>
              </div>
              <div>
                <span className="text-slate-600">Entscheidungen:</span>
                <span className="ml-2 font-medium">
                  +{diff.decisionsAdded.length} / -{diff.decisionsRemoved.length}
                </span>
              </div>
              <div>
                <span className="text-slate-600">Ausnahmen:</span>
                <span className="ml-2 font-medium">
                  +{diff.exceptionsAdded.length} / -{diff.exceptionsRemoved.length}
                </span>
              </div>
              <div>
                <span className="text-slate-600">Maßnahmen-Backlog:</span>
                <span className="ml-2 font-medium">
                  +{diff.backlogAdded.length} / -{diff.backlogRemoved.length} / ~{diff.backlogModified.length}
                </span>
              </div>
            </div>
          </div>

          {aiExplainOpen && (
            <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">KI-Erklärung des Version-Diffs</h3>
              <p className="text-xs text-slate-600 mb-3">
                Die App überträgt keine Daten automatisch.
                {apiModeActive
                  ? ' Standard ist Copy/Paste. API-Modus sendet nur auf Klick mit Consent.'
                  : ' Kopieren Sie den Prompt manuell in Claude und fügen Sie die Markdown-Antwort hier ein.'}
              </p>

              {aiExplainError && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
                  {aiExplainError}
                </div>
              )}

              {aiExplainStatus && (
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
                  {aiExplainStatus}
                </div>
              )}

              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-700 mb-1">Prompt für Claude</label>
                <textarea
                  value={aiExplainPrompt}
                  readOnly
                  rows={10}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs font-mono bg-slate-50"
                />
                <button
                  onClick={handleCopyAiExplainPrompt}
                  className="mt-2 px-3 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 text-sm font-medium flex items-center gap-2"
                >
                  {aiExplainPromptCopied ? <Check size={16} /> : <Copy size={16} />}
                  <span>{aiExplainPromptCopied ? 'Kopiert!' : 'Prompt kopieren'}</span>
                </button>
              </div>

              {apiModeActive && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-semibold text-blue-900 mb-3">API-Modus</h4>

                  {apiEndpoint ? (
                    <p className="text-xs text-blue-800 mb-2">
                      Endpoint: <span className="font-mono">{apiEndpoint}</span>
                    </p>
                  ) : (
                    <div className="bg-yellow-50 border border-yellow-300 rounded p-2 mb-2">
                      <p className="text-xs text-yellow-800">Kein Endpoint konfiguriert. Bitte in den Einstellungen festlegen.</p>
                    </div>
                  )}

                  <label className="flex items-start gap-2 text-xs text-blue-900 mb-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aiApiConsent}
                      onChange={(e) => setAiApiConsent(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>Ich stimme der Übertragung an den konfigurierten Endpoint zu.</span>
                  </label>

                  <details className="mb-3">
                    <summary className="text-xs text-blue-800 cursor-pointer mb-1">Request Preview</summary>
                    <pre className="text-xs bg-white border border-blue-200 rounded p-2 overflow-auto max-h-32 font-mono">
                      {aiApiRequestPreview}
                    </pre>
                  </details>

                  {aiApiError && (
                    <div className="bg-red-50 border border-red-200 rounded p-2 mb-3">
                      <p className="text-xs text-red-800">{aiApiError}</p>
                    </div>
                  )}

                  <button
                    onClick={handleApiSendDiffExplanation}
                    disabled={!aiApiConsent || !apiEndpoint || aiApiRunning || !aiExplainPrompt.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 text-sm transition-colors"
                  >
                    <Send size={14} />
                    {aiApiRunning ? 'Sende...' : 'Per API senden (Antwort übernehmen)'}
                  </button>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-700 mb-1">Markdown-Antwort von Claude</label>
                <textarea
                  value={aiExplainResponse}
                  onChange={(e) => setAiExplainResponse(e.target.value)}
                  placeholder="Markdown-Antwort hier einfügen..."
                  rows={12}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs font-mono"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={handleCopyAiExplainResponse}
                    disabled={!aiExplainResponse.trim()}
                    className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Copy size={16} />
                    <span>Antwort kopieren</span>
                  </button>

                  <button
                    onClick={handleDownloadAiExplainMd}
                    disabled={!aiExplainResponse.trim()}
                    className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download size={16} />
                    <span>Markdown exportieren</span>
                  </button>

                  <button
                    onClick={handleCloseAiExplain}
                    className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 text-sm font-medium"
                  >
                    Schließen
                  </button>
                </div>
              </div>
            </div>
          )}

          {diff.endToEndChanges.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">End-to-End Änderungen</h3>
              <div className="space-y-2">
                {diff.endToEndChanges.map((ch, idx) => (
                  <div key={idx} className="text-sm">
                    <span className="font-medium text-slate-700">{ch.field}:</span>
                    <div className="ml-4 mt-1">
                      <div className="text-red-700">
                        <span className="font-mono">-</span> {ch.before || '(leer)'}
                      </div>
                      <div className="text-green-700">
                        <span className="font-mono">+</span> {ch.after || '(leer)'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(diff.stepsAdded.length > 0 || diff.stepsRemoved.length > 0 || diff.stepsModified.length > 0) && (
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Happy Path Änderungen</h3>

              {diff.stepsAdded.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-green-700 mb-2">Hinzugefügt ({diff.stepsAdded.length})</h4>
                  <div className="space-y-1">
                    {diff.stepsAdded.slice(0, 20).map(s => (
                      <div key={s.stepId} className="text-sm text-green-700">
                        <span className="font-mono">+</span> {s.order}. {s.label}
                      </div>
                    ))}
                    {diff.stepsAdded.length > 20 && (
                      <div className="text-xs text-slate-500 italic">
                        ... und {diff.stepsAdded.length - 20} weitere
                      </div>
                    )}
                  </div>
                </div>
              )}

              {diff.stepsRemoved.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-red-700 mb-2">Entfernt ({diff.stepsRemoved.length})</h4>
                  <div className="space-y-1">
                    {diff.stepsRemoved.slice(0, 20).map(s => (
                      <div key={s.stepId} className="text-sm text-red-700">
                        <span className="font-mono">-</span> {s.order}. {s.label}
                      </div>
                    ))}
                    {diff.stepsRemoved.length > 20 && (
                      <div className="text-xs text-slate-500 italic">
                        ... und {diff.stepsRemoved.length - 20} weitere
                      </div>
                    )}
                  </div>
                </div>
              )}

              {diff.stepsModified.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-blue-700 mb-2">Geändert ({diff.stepsModified.length})</h4>
                  <div className="space-y-2">
                    {diff.stepsModified.slice(0, 20).map(s => (
                      <div key={s.id} className="text-sm">
                        <div className="font-medium text-slate-700">
                          {s.before.order}. {s.before.label}
                        </div>
                        <div className="ml-4 text-blue-700">
                          <span className="font-mono">~</span> {s.after.order}. {s.after.label}
                        </div>
                        <div className="ml-4 text-xs text-slate-500">
                          Geänderte Felder: {s.changedFields.join(', ')}
                        </div>
                      </div>
                    ))}
                    {diff.stepsModified.length > 20 && (
                      <div className="text-xs text-slate-500 italic">
                        ... und {diff.stepsModified.length - 20} weitere
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {(diff.decisionsAdded.length > 0 || diff.decisionsRemoved.length > 0) && (
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Entscheidungen</h3>

              {diff.decisionsAdded.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-green-700 mb-2">Hinzugefügt ({diff.decisionsAdded.length})</h4>
                  <div className="space-y-1">
                    {diff.decisionsAdded.map(d => (
                      <div key={d.decisionId} className="text-sm text-green-700">
                        <span className="font-mono">+</span> {d.question}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diff.decisionsRemoved.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-red-700 mb-2">Entfernt ({diff.decisionsRemoved.length})</h4>
                  <div className="space-y-1">
                    {diff.decisionsRemoved.map(d => (
                      <div key={d.decisionId} className="text-sm text-red-700">
                        <span className="font-mono">-</span> {d.question}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(diff.exceptionsAdded.length > 0 || diff.exceptionsRemoved.length > 0) && (
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Ausnahmen</h3>

              {diff.exceptionsAdded.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-green-700 mb-2">Hinzugefügt ({diff.exceptionsAdded.length})</h4>
                  <div className="space-y-1">
                    {diff.exceptionsAdded.map(e => (
                      <div key={e.exceptionId} className="text-sm text-green-700">
                        <span className="font-mono">+</span> {e.description}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diff.exceptionsRemoved.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-red-700 mb-2">Entfernt ({diff.exceptionsRemoved.length})</h4>
                  <div className="space-y-1">
                    {diff.exceptionsRemoved.map(e => (
                      <div key={e.exceptionId} className="text-sm text-red-700">
                        <span className="font-mono">-</span> {e.description}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(diff.backlogAdded.length > 0 || diff.backlogRemoved.length > 0 || diff.backlogModified.length > 0) && (
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Maßnahmen-Backlog</h3>

              {diff.backlogAdded.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-green-700 mb-2">Hinzugefügt ({diff.backlogAdded.length})</h4>
                  <div className="space-y-1">
                    {diff.backlogAdded.map(b => (
                      <div key={b.id} className="text-sm text-green-700">
                        <span className="font-mono">+</span> {b.title} <span className="text-xs">({b.category} · {b.status})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diff.backlogRemoved.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-red-700 mb-2">Entfernt ({diff.backlogRemoved.length})</h4>
                  <div className="space-y-1">
                    {diff.backlogRemoved.map(b => (
                      <div key={b.id} className="text-sm text-red-700">
                        <span className="font-mono">-</span> {b.title} <span className="text-xs">({b.category} · {b.status})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diff.backlogModified.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-blue-700 mb-2">Geändert ({diff.backlogModified.length})</h4>
                  <div className="space-y-2">
                    {diff.backlogModified.map(b => (
                      <div key={b.id} className="text-sm">
                        <div className="font-medium text-slate-700">{b.before.title}</div>
                        <div className="ml-4 text-xs text-slate-500">
                          Geänderte Felder: {b.changedFields.join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

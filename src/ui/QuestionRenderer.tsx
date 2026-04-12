import { useEffect, useState } from 'react';
import type { WizardQuestion } from '../capture/wizardTypes';
import { Mic, Square, Settings2 } from 'lucide-react';

type DictationAppendMode = 'space' | 'newline';

interface QuestionDictationUi {
  enabled: boolean;
  needsSetup: boolean;
  active: boolean;
  activeQuestionId: string | null;
  interim: string;
  error: string;
  onStart: (questionId: string, mode: DictationAppendMode) => void;
  onStop: () => void;
  onOpenSetup: () => void;
}

interface QuestionRendererProps {
  question: WizardQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  dictation?: QuestionDictationUi;
}

export function QuestionRenderer({ question, value, onChange, error, dictation }: QuestionRendererProps) {
  const [localValue, setLocalValue] = useState<string>(
    typeof value === 'string' ? value : Array.isArray(value) ? value.join('\n') : ''
  );

  useEffect(() => {
    const next =
      typeof value === 'string'
        ? value
        : Array.isArray(value)
        ? value.join('\n')
        : '';
    setLocalValue(next);
  }, [value]);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    onChange(newValue);
  };

  const dictationApplicable =
    Boolean(dictation) &&
    (question.type === 'short_text' || question.type === 'long_text' || question.type === 'list');

  const dictationIsActiveHere =
    dictationApplicable && dictation!.active && dictation!.activeQuestionId === question.id;

  const showDictationErrorHere =
    dictationApplicable && dictation!.activeQuestionId === question.id && Boolean(dictation!.error);

  const showDictationInterimHere =
    dictationApplicable && dictation!.activeQuestionId === question.id && dictation!.active && Boolean(dictation!.interim);

  const appendMode: DictationAppendMode =
    question.type === 'list' ? 'newline' : 'space';

  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-white">
      <div className="mb-3">
        <div className="flex items-start justify-between mb-1">
          <label className="text-sm font-medium text-slate-900">
            {question.title}
            {question.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          {dictationApplicable && (
            <div className="flex items-center gap-2">
              {!dictationIsActiveHere ? (
                <button
                  type="button"
                  onClick={() => dictation!.onStart(question.id, appendMode)}
                  disabled={!dictation!.enabled}
                  className="p-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
                  aria-label="Diktat starten"
                  title={dictation!.enabled ? 'Diktat starten' : 'Spracheingabe im Setup aktivieren'}
                >
                  <Mic className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={dictation!.onStop}
                  className="p-2 rounded-md border border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                  aria-label="Diktat stoppen"
                  title="Diktat stoppen"
                >
                  <Square className="w-4 h-4" />
                </button>
              )}

              {dictation!.needsSetup && (
                <button
                  type="button"
                  onClick={dictation!.onOpenSetup}
                  className="px-3 py-2 rounded-md bg-slate-900 text-white text-xs hover:bg-slate-800 flex items-center gap-2"
                  title="Zu Setup"
                >
                  <Settings2 className="w-4 h-4" />
                  Setup
                </button>
              )}
            </div>
          )}
        </div>
        <p className="text-sm text-slate-600 mb-2">{question.prompt}</p>
        {question.help && (
          <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-200">
            💡 {question.help}
          </p>
        )}
      </div>

      {question.examples && question.examples.length > 0 && (
        <div className="mb-3 text-xs text-slate-500">
          <span className="font-medium">Beispiele:</span>
          <ul className="list-disc list-inside ml-2 mt-1">
            {question.examples.map((ex, idx) => (
              <li key={idx}>{ex}</li>
            ))}
          </ul>
        </div>
      )}

      {showDictationErrorHere && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
          {dictation!.error}
        </div>
      )}

      {showDictationInterimHere && (
        <div className="mb-3 bg-slate-50 border border-slate-200 rounded-md p-3 text-sm text-slate-700">
          <span className="font-medium">Live:</span> {dictation!.interim}
        </div>
      )}

      <div>
        {question.type === 'short_text' && (
          <input
            type="text"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
            placeholder={question.examples?.[0] || ''}
          />
        )}

        {question.type === 'long_text' && (
          <textarea
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
            placeholder={question.examples?.[0] || ''}
          />
        )}

        {question.type === 'list' && (
          <textarea
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 font-mono text-sm"
            placeholder="Ein Eintrag pro Zeile..."
          />
        )}

        {question.type === 'single_select' && question.options && (
          <select
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            <option value="">Bitte wählen...</option>
            {question.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {question.type === 'boolean' && (
          <div className="flex items-center space-x-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name={question.id}
                value="true"
                checked={localValue === 'true'}
                onChange={(e) => handleChange(e.target.value)}
                className="mr-2"
              />
              <span className="text-sm">Ja</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name={question.id}
                value="false"
                checked={localValue === 'false'}
                onChange={(e) => handleChange(e.target.value)}
                className="mr-2"
              />
              <span className="text-sm">Nein</span>
            </label>
          </div>
        )}

        {question.type === 'number' && (
          <input
            type="number"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
            min={question.validation?.min}
            max={question.validation?.max}
          />
        )}
      </div>

      {error && (
        <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}

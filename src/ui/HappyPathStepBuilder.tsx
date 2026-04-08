import { useRef, useState } from 'react';
import { Plus, ArrowUp, ArrowDown, Trash2, ClipboardPaste } from 'lucide-react';
import type { WizardQuestion } from '../capture/wizardTypes';

interface HappyPathStepBuilderProps {
  question: WizardQuestion;
  steps: string[];
  onChange: (next: string[]) => void;
  error?: string;
}

function normalizeStepLabel(s: string): string {
  let cleaned = s.trim();
  cleaned = cleaned.replace(/\s+/g, ' ');

  cleaned = cleaned.replace(/^\s*[•\-*]+\s*/, '');

  cleaned = cleaned.replace(/^\s*\d{1,3}\s*(?:[.)]|-)\s+/, '');

  return cleaned.trim().replace(/\s+/g, ' ');
}

function parseStepsFromText(text: string): string[] {
  return text
    .split('\n')
    .map((line) => normalizeStepLabel(line))
    .filter((line) => line.length > 0);
}

export function HappyPathStepBuilder({ question, steps, onChange, error }: HappyPathStepBuilderProps) {
  const [nextStep, setNextStep] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stepCount = steps.length;
  const statusColor = stepCount < 5 ? 'text-red-600' : stepCount > 30 ? 'text-amber-600' : 'text-slate-600';
  const statusMessage =
    stepCount < 5 ? `${stepCount} Schritte (empfohlen: mindestens 5)` :
    stepCount > 30 ? `${stepCount} Schritte (viele – Unterprozess prüfen?)` :
    `${stepCount} Schritte (Richtwert: 10–30)`;

  const handleAddStep = () => {
    const cleaned = normalizeStepLabel(nextStep);
    if (!cleaned) return;
    onChange([...steps, cleaned]);
    setNextStep('');
    inputRef.current?.focus();
  };

  const handleUpdateStep = (index: number, value: string) => {
    const updated = [...steps];
    updated[index] = value;
    onChange(updated);
  };

  const handleBlurStep = (index: number) => {
    const cleaned = normalizeStepLabel(steps[index]);
    if (cleaned !== steps[index]) {
      handleUpdateStep(index, cleaned);
    }
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...steps];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    onChange(updated);
  };

  const handleMoveDown = (index: number) => {
    if (index === steps.length - 1) return;
    const updated = [...steps];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    onChange(updated);
  };

  const handleDelete = (index: number) => {
    const updated = steps.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handlePasteReplace = () => {
    const parsed = parseStepsFromText(pasteText);
    onChange(parsed);
    setPasteText('');
    setShowPaste(false);
  };

  const handlePasteAppend = () => {
    const parsed = parseStepsFromText(pasteText);
    onChange([...steps, ...parsed]);
    setPasteText('');
    setShowPaste(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddStep();
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-white">
      <div className="mb-3">
        <div className="flex items-start justify-between mb-1">
          <label className="text-sm font-medium text-slate-900">
            {question.title}
            {question.required && <span className="text-red-500 ml-1">*</span>}
          </label>
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

      <div className={`mb-3 text-sm font-medium ${statusColor}`}>
        {statusMessage}
      </div>

      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={nextStep}
            onChange={(e) => setNextStep(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="z.B. Kundenanfrage erfassen"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
          />
          <button
            onClick={handleAddStep}
            className="px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Hinzufügen
          </button>
        </div>

        {steps.length > 0 && (
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div key={index} className="flex gap-2 items-center">
                <span className="text-sm font-medium text-slate-500 w-8 text-right">{index + 1}.</span>
                <input
                  type="text"
                  value={step}
                  onChange={(e) => handleUpdateStep(index, e.target.value)}
                  onBlur={() => handleBlurStep(index)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm"
                />
                <div className="flex gap-1">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Nach oben"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === steps.length - 1}
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Nach unten"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(index)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                    title="Löschen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-slate-200 pt-4">
          <button
            onClick={() => setShowPaste(!showPaste)}
            className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-2"
          >
            <ClipboardPaste className="w-4 h-4" />
            {showPaste ? 'Einfügen ausblenden' : 'Aus Text einfügen'}
          </button>

          {showPaste && (
            <div className="mt-3 space-y-2">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={4}
                placeholder="Ein Schritt pro Zeile. Nummerierungen werden automatisch entfernt."
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm font-mono"
              />
              <p className="text-xs text-slate-500">
                Ein Eintrag pro Zeile. Nummerierungen werden automatisch entfernt.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handlePasteReplace}
                  disabled={!pasteText.trim()}
                  className="px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Ersetzen
                </button>
                <button
                  onClick={handlePasteAppend}
                  disabled={!pasteText.trim()}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Anhängen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}

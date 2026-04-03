import { useState } from 'react';
import { ChevronDown, ChevronRight, CreditCard as Edit3 } from 'lucide-react';
import type { StepAnnotation } from './augmentation';

interface Field {
  key: keyof Omit<StepAnnotation, 'stepLabel'>;
  label: string;
  placeholder: string;
}

const FIELDS: Field[] = [
  { key: 'roles', label: 'Rollen', placeholder: 'Wer ist beteiligt? z.B. Sachbearbeiter, Teamleiter' },
  { key: 'systems', label: 'Systeme / Tools', placeholder: 'Welche Systeme werden genutzt? z.B. SAP, E-Mail' },
  { key: 'dataObjects', label: 'Dokumente / Daten', placeholder: 'Welche Unterlagen oder Daten werden verwendet?' },
  { key: 'rootCause', label: 'Vermutete Ursache / Erklärung', placeholder: 'Warum läuft es so? Was erklärt dieses Verhalten?' },
  { key: 'risks', label: 'Risiken / Compliance-Hinweise', placeholder: 'Gibt es Risiken, Fehlerquellen oder Compliance-Anforderungen?' },
  { key: 'caseTypeNotes', label: 'Falltyp / Kundensegment', placeholder: 'Gilt das nur für bestimmte Fälle oder Kundengruppen?' },
  { key: 'evidenceNote', label: 'Evidenz / Quelle', placeholder: 'Woher stammt diese Information? z.B. Workshop, Interview' },
];

interface Props {
  stepLabel: string;
  annotation: Partial<StepAnnotation>;
  onChange: (patch: Partial<Omit<StepAnnotation, 'stepLabel'>>) => void;
}

export function StepAnnotationEditor({ stepLabel, annotation, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const filledCount = FIELDS.filter(f => !!annotation[f.key]).length;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        )}
        <Edit3 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="text-sm font-medium text-slate-700 flex-1 truncate">{stepLabel}</span>
        {filledCount > 0 && (
          <span className="text-xs bg-teal-100 text-teal-700 font-semibold px-2 py-0.5 rounded-full shrink-0">
            {filledCount} {filledCount === 1 ? 'Feld' : 'Felder'} ausgefüllt
          </span>
        )}
      </button>

      {open && (
        <div className="p-4 space-y-4 bg-white">
          <div className="grid sm:grid-cols-2 gap-4">
            {FIELDS.map(field => (
              <div key={field.key} className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">{field.label}</label>
                <textarea
                  rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-y"
                  placeholder={field.placeholder}
                  value={(annotation[field.key] as string) ?? ''}
                  onChange={e => onChange({ [field.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

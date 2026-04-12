interface ModeToggleProps {
  value: 'assisted' | 'expert';
  onChange: (mode: 'assisted' | 'expert') => void;
}

export function ModeToggle({ value, onChange }: ModeToggleProps) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 border border-slate-200 p-1">
      <button
        type="button"
        onClick={() => onChange('assisted')}
        className={`
          rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200
          ${value === 'assisted'
            ? 'bg-white shadow-sm text-slate-900'
            : 'text-slate-600 hover:text-slate-800'
          }
        `}
      >
        Assistierter Modus
      </button>
      <button
        type="button"
        onClick={() => onChange('expert')}
        className={`
          rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200
          ${value === 'expert'
            ? 'bg-white shadow-sm text-slate-900'
            : 'text-slate-600 hover:text-slate-800'
          }
        `}
      >
        Expertenmodus
      </button>
    </div>
  );
}

import type { ProcessMiningOperatingMode } from '../../domain/process';
import type { OperatingModeProfile } from './operatingMode';
import { HelpPopover } from '../components/HelpPopover';
import { OPERATING_MODE_PROFILES } from './operatingMode';

interface Props {
  value: ProcessMiningOperatingMode;
  onChange: (mode: ProcessMiningOperatingMode) => void;
}

export function OperatingModePanel({ value, onChange }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-800">Betriebsmodus</p>
            <HelpPopover helpKey="pmv2.operatingMode" ariaLabel="Hilfe: Betriebsmodus" />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 max-w-3xl">
            Der Betriebsmodus ändert nicht Ihre Daten. Er steuert nur, wie viel Tiefe die App standardmäßig zeigt und welche Bereiche für den aktuellen Einsatzzweck offen im Vordergrund stehen.
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${OPERATING_MODE_PROFILES[value].badgeClass}`}>
          Aktiv: {OPERATING_MODE_PROFILES[value].label}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {(Object.values(OPERATING_MODE_PROFILES) as OperatingModeProfile[]).map(profile => {
          const active = profile.key === value;
          return (
            <button
              key={profile.key}
              type="button"
              onClick={() => onChange(profile.key)}
              className={`rounded-xl border p-4 text-left transition-colors ${active ? 'border-cyan-300 bg-white shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">{profile.label}</p>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${profile.badgeClass}`}>
                  {profile.shortLabel}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{profile.summary}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{profile.detail}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

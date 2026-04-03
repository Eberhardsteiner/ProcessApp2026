import { CheckCircle2, CircleDot, Map, Rocket } from 'lucide-react';
import { COMPLETED_PHASES, NEXT_PHASES } from '../../config/productRoadmap';
import { APP_VERSION_LABEL, APP_RELEASE_TITLE } from '../../config/release';
import { InfoPopover } from './InfoPopover';

interface ReleaseRoadmapPopoverProps {
  ariaLabel?: string;
  dark?: boolean;
}

export function ReleaseRoadmapPopover({
  ariaLabel = 'Produktstand und Roadmap',
  dark = false,
}: ReleaseRoadmapPopoverProps) {
  return (
    <InfoPopover
      title="Produktstand und Roadmap"
      ariaLabel={ariaLabel}
      buttonClassName={dark ? 'border-white/15 bg-white/5 hover:border-white/25 hover:bg-white/10' : ''}
      iconClassName={dark ? 'text-white/80' : ''}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-slate-800 font-semibold">
            <Map className="h-4 w-4 text-cyan-600" />
            Aktueller Stand {APP_VERSION_LABEL}
          </div>
          <p className="mt-1 text-slate-600">{APP_RELEASE_TITLE}</p>
        </div>

        <div>
          <div className="flex items-center gap-2 font-semibold text-slate-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Bisher umgesetzt
          </div>
          <ul className="mt-2 space-y-2">
            {COMPLETED_PHASES.map(entry => (
              <li key={`${entry.versionLabel}-${entry.phase}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-xs font-semibold text-slate-500">
                  {entry.versionLabel} · {entry.phase}
                </p>
                <p className="text-sm font-medium text-slate-800 mt-0.5">{entry.title}</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{entry.summary}</p>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="flex items-center gap-2 font-semibold text-slate-800">
            <Rocket className="h-4 w-4 text-violet-600" />
            Als Nächstes geplant
          </div>
          <ul className="mt-2 space-y-2">
            {NEXT_PHASES.map(entry => (
              <li key={entry.phase} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-start gap-2">
                  <CircleDot className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-500">{entry.phase}</p>
                    <p className="text-sm font-medium text-slate-800 mt-0.5">{entry.title}</p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{entry.summary}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </InfoPopover>
  );
}

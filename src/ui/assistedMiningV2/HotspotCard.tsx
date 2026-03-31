import { useState } from 'react';
import {
  Clock,
  RefreshCw,
  GitBranch,
  AlertTriangle,
  ArrowRightLeft,
  Bookmark,
  Check,
} from 'lucide-react';
import type { V2Hotspot, HotspotKind } from './enhancement';

const KIND_CONFIG: Record<
  HotspotKind,
  { icon: React.ReactNode; bg: string; text: string; border: string }
> = {
  timing: {
    icon: <Clock className="w-4 h-4" />,
    bg: 'bg-red-50',
    text: 'text-red-800',
    border: 'border-red-200',
  },
  rework: {
    icon: <RefreshCw className="w-4 h-4" />,
    bg: 'bg-orange-50',
    text: 'text-orange-800',
    border: 'border-orange-200',
  },
  instability: {
    icon: <GitBranch className="w-4 h-4" />,
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
  },
  handoff: {
    icon: <ArrowRightLeft className="w-4 h-4" />,
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    border: 'border-blue-200',
  },
  exception: {
    icon: <AlertTriangle className="w-4 h-4" />,
    bg: 'bg-yellow-50',
    text: 'text-yellow-800',
    border: 'border-yellow-200',
  },
};

const KIND_LABEL: Record<HotspotKind, string> = {
  timing: 'Zeitproblem',
  rework: 'Rücksprung',
  instability: 'Uneinheitlichkeit',
  handoff: 'Übergabeproblem',
  exception: 'Häufige Ausnahme',
};

interface Props {
  hotspot: V2Hotspot;
  onSaveNote: (hotspot: V2Hotspot) => void;
}

export function HotspotCard({ hotspot, onSaveNote }: Props) {
  const [noted, setNoted] = useState(hotspot.savedAsNote);
  const cfg = KIND_CONFIG[hotspot.kind];

  function handleSave() {
    setNoted(true);
    onSaveNote({ ...hotspot, savedAsNote: true });
  }

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 shrink-0 ${cfg.text}`}>{cfg.icon}</div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold uppercase tracking-wide opacity-60 ${cfg.text}`}>
              {KIND_LABEL[hotspot.kind]}
            </span>
            {hotspot.isTimeBased && (
              <span className="text-[10px] bg-white/60 border border-current/20 rounded px-1.5 py-0.5 font-medium text-slate-500">
                zeitbasiert
              </span>
            )}
            <span className={`text-xs font-semibold ml-auto ${cfg.text}`}>
              {hotspot.affectedCases <= 1
                ? `${hotspot.affectedCases} Fall`
                : `${hotspot.affectedCasePct} % der Fälle (${hotspot.affectedCases})`}
            </span>
          </div>
          <p className={`font-semibold text-sm ${cfg.text}`}>{hotspot.headline}</p>
          <p className={`text-sm leading-relaxed opacity-80 ${cfg.text}`}>{hotspot.detail}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={noted}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            noted
              ? 'bg-green-100 text-green-700 cursor-default'
              : 'bg-white/70 border border-current/20 hover:bg-white text-slate-600 hover:text-slate-800'
          }`}
        >
          {noted ? (
            <><Check className="w-3.5 h-3.5" /> Als Verbesserungshinweis gemerkt</>
          ) : (
            <><Bookmark className="w-3.5 h-3.5" /> Als Verbesserungshinweis merken</>
          )}
        </button>
      </div>
    </div>
  );
}

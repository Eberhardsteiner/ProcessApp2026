interface PageLoadingStateProps {
  title: string;
  description?: string;
}

interface SectionLoadingStateProps {
  title: string;
  description?: string;
  compact?: boolean;
}

interface OverlayLoadingStateProps {
  title: string;
  description?: string;
}

function LoadingIndicator() {
  return (
    <div className="inline-flex items-center gap-2 text-sm text-slate-600">
      <span className="h-2.5 w-2.5 rounded-full bg-cyan-500 animate-pulse" />
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse [animation-delay:180ms]" />
      <span className="h-2.5 w-2.5 rounded-full bg-sky-500 animate-pulse [animation-delay:360ms]" />
    </div>
  );
}

export function PageLoadingState({ title, description }: PageLoadingStateProps) {
  return (
    <div
      className="min-h-[60vh] flex items-center justify-center p-6"
      style={{
        background: 'linear-gradient(135deg, rgba(224,242,254,0.55) 0%, rgba(204,251,241,0.45) 40%, rgba(219,234,254,0.5) 100%)',
      }}
    >
      <div className="max-w-xl w-full rounded-2xl border border-white/60 bg-white/85 backdrop-blur-md shadow-xl p-8 text-center">
        <div className="flex justify-center mb-4">
          <LoadingIndicator />
        </div>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {description ? <p className="mt-3 text-sm text-slate-600 leading-relaxed">{description}</p> : null}
      </div>
    </div>
  );
}

export function SectionLoadingState({ title, description, compact = false }: SectionLoadingStateProps) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${compact ? 'p-4' : 'p-6'}`}>
      <div className="flex items-center gap-3">
        <LoadingIndicator />
        <div>
          <h3 className={`font-semibold text-slate-900 ${compact ? 'text-sm' : 'text-base'}`}>{title}</h3>
          {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function OverlayLoadingState({ title, description }: OverlayLoadingStateProps) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-2xl border border-white/60 bg-white shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-3">
          <LoadingIndicator />
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>
        {description ? <p className="text-sm text-slate-600">{description}</p> : null}
      </div>
    </div>
  );
}

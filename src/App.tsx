import { Suspense, lazy, useState } from 'react';
import { LandingPage } from './ui/LandingPage';
import { APP_RELEASE_TITLE, APP_VERSION_LABEL } from './config/release';
import { ReleaseRoadmapPopover } from './ui/components/ReleaseRoadmapPopover';
import { PageLoadingState } from './ui/components/LoadingState';
import { QA_SURFACES_ENABLED } from './config/runtimeMode';

type ViewMode = 'home' | 'landscape' | 'wizard' | 'selftest';

const LazyProcessLandscape = lazy(async () => {
  const module = await import('./ui/ProcessLandscape');
  return { default: module.ProcessLandscape };
});

const LazyWizardPlayground = lazy(async () => {
  const module = await import('./ui/WizardPlayground');
  return { default: module.WizardPlayground };
});

const LazySelfTestView = QA_SURFACES_ENABLED
  ? lazy(async () => {
      const module = await import('./ui/SelfTestView');
      return { default: module.SelfTestView };
    })
  : null;

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [selectedProcessId, setSelectedProcessId] = useState<string | undefined>(undefined);

  const handleOpenProcess = (processId: string) => {
    setSelectedProcessId(processId);
    setViewMode('wizard');
  };

  if (viewMode === 'landscape') {
    return (
      <div>
        <Suspense
          fallback={
            <PageLoadingState
              title="Prozesslandkarte wird geladen"
              description="Wir laden die Projektübersicht und bereiten den Einstieg in Ihre Prozesse vor."
            />
          }
        >
          <LazyProcessLandscape onOpenProcess={handleOpenProcess} />
        </Suspense>
        <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
          <button
            onClick={() => setViewMode('home')}
            className="px-4 py-2 bg-white/90 backdrop-blur-sm border-2 border-cyan-300 text-cyan-700 rounded-lg hover:bg-cyan-50 hover:shadow-xl text-sm font-medium shadow-lg transition-all"
          >
            Info
          </button>
          {QA_SURFACES_ENABLED && (
            <button
              onClick={() => setViewMode('selftest')}
              className="px-4 py-2 bg-white/90 backdrop-blur-sm border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 hover:shadow-xl text-sm font-medium shadow-lg transition-all"
            >
              Test
            </button>
          )}
        </div>
      </div>
    );
  }

  if (viewMode === 'wizard') {
    return (
      <div>
        <div className="bg-gradient-to-r from-cyan-700 to-emerald-700 text-white p-4 shadow-lg">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold">Prozessaufnahme-App</h1>
              <span className="px-2 py-0.5 rounded-full bg-white/15 text-xs font-medium tracking-wide">{APP_VERSION_LABEL}</span>
              <span className="hidden lg:inline text-xs text-cyan-50/80">{APP_RELEASE_TITLE}</span>
              <ReleaseRoadmapPopover ariaLabel="Produktstand und Roadmap öffnen" dark />
            </div>
            <button
              onClick={() => {
                setViewMode('landscape');
                setSelectedProcessId(undefined);
              }}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg text-sm transition-all"
            >
              ← Zurück zur Prozesslandkarte
            </button>
          </div>
        </div>
        <Suspense
          fallback={
            <PageLoadingState
              title="Arbeitsbereich wird geladen"
              description="Die geführte Arbeitsumgebung wird vorbereitet. Größere Analysebereiche werden dabei jetzt bewusst erst bei Bedarf nachgeladen."
            />
          }
        >
          <LazyWizardPlayground initialProcessId={selectedProcessId} />
        </Suspense>
      </div>
    );
  }

  if (viewMode === 'selftest' && QA_SURFACES_ENABLED && LazySelfTestView) {
    return (
      <Suspense
        fallback={
          <PageLoadingState
            title="Testbereich wird geladen"
            description="Wir laden den lokalen Selbsttest mit den Prüfroutinen für Speicher und Wizard-Logik."
          />
        }
      >
        <LazySelfTestView onBack={() => setViewMode('landscape')} />
      </Suspense>
    );
  }

  return <LandingPage onStart={() => setViewMode('landscape')} />;
}

export default App;

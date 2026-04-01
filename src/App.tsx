import { useState } from 'react';
import { runStorageSelfTest } from './storage/_selfTest';
import { WizardPlayground } from './ui/WizardPlayground';
import { ProcessLandscape } from './ui/ProcessLandscape';
import { LandingPage } from './ui/LandingPage';
import { APP_RELEASE_TITLE, APP_VERSION_LABEL } from './config/release';
import { ReleaseRoadmapPopover } from './ui/components/ReleaseRoadmapPopover';

type ViewMode = 'home' | 'landscape' | 'wizard' | 'selftest';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [selectedProcessId, setSelectedProcessId] = useState<string | undefined>(undefined);
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<string>('');

  const handleRunTest = async () => {
    setTestRunning(true);
    setTestResult('');

    try {
      await runStorageSelfTest();
      setTestResult('Self-Test erfolgreich abgeschlossen. Details in Browser-Konsole.');
    } catch (error) {
      setTestResult(`Fehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
      console.error('Self-Test fehlgeschlagen:', error);
    } finally {
      setTestRunning(false);
    }
  };

  const handleOpenProcess = (processId: string) => {
    setSelectedProcessId(processId);
    setViewMode('wizard');
  };

  if (viewMode === 'landscape') {
    return (
      <div>
        <ProcessLandscape onOpenProcess={handleOpenProcess} />
        <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
          <button
            onClick={() => setViewMode('home')}
            className="px-4 py-2 bg-white/90 backdrop-blur-sm border-2 border-cyan-300 text-cyan-700 rounded-lg hover:bg-cyan-50 hover:shadow-xl text-sm font-medium shadow-lg transition-all"
          >
            Info
          </button>
          <button
            onClick={() => setViewMode('selftest')}
            className="px-4 py-2 bg-white/90 backdrop-blur-sm border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 hover:shadow-xl text-sm font-medium shadow-lg transition-all"
          >
            Test
          </button>
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
        <WizardPlayground initialProcessId={selectedProcessId} />
      </div>
    );
  }

  if (viewMode === 'selftest') {
    return (
      <div className="min-h-screen relative flex items-center justify-center p-8" style={{
        background: 'linear-gradient(135deg, #e0f2fe 0%, #ccfbf1 35%, #d1fae5 70%, #dbeafe 100%)'
      }}>
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
        />
        <div className="relative z-10 max-w-2xl w-full bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 p-8">
          <button
            onClick={() => setViewMode('landscape')}
            className="mb-4 text-sm text-cyan-700 hover:text-cyan-900 font-medium"
          >
            ← Zurück zur Prozesslandkarte
          </button>

          <h1 className="text-2xl font-semibold text-slate-900 mb-2">Storage Self-Test</h1>
          <p className="text-slate-600 mb-6">
            Testet alle Repository-Funktionen und die Wizard-Engine. Details in der Browser-Konsole.
          </p>

          <button
            onClick={handleRunTest}
            disabled={testRunning}
            className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-emerald-600 text-white rounded-lg text-sm font-medium hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {testRunning ? 'Test läuft...' : 'Self-Test ausführen'}
          </button>

          {testResult && (
            <div
              className={`mt-4 p-3 rounded-md text-sm ${
                testResult.startsWith('Fehler')
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : 'bg-green-50 text-green-800 border border-green-200'
              }`}
            >
              {testResult}
            </div>
          )}
        </div>
      </div>
    );
  }

  return <LandingPage onStart={() => setViewMode('landscape')} />;
}

export default App;

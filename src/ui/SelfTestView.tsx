import { useState } from 'react';
import { runStorageSelfTest } from '../storage/_selfTest';

interface SelfTestViewProps {
  onBack: () => void;
}

export function SelfTestView({ onBack }: SelfTestViewProps) {
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

  return (
    <div
      className="min-h-screen relative flex items-center justify-center p-8"
      style={{
        background: 'linear-gradient(135deg, #e0f2fe 0%, #ccfbf1 35%, #d1fae5 70%, #dbeafe 100%)',
      }}
    >
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div className="relative z-10 max-w-2xl w-full bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 p-8">
        <button onClick={onBack} className="mb-4 text-sm text-cyan-700 hover:text-cyan-900 font-medium">
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

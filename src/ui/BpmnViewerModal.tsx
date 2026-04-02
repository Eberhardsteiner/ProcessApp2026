import { useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';

interface BpmnViewerModalProps {
  title: string;
  bpmnXml: string;
  onClose: () => void;
  onGoToStep?: (stepId: string) => void;
}

type BpmnCanvas = {
  zoom: (arg?: 'fit-viewport' | number) => number;
};

type EventBus = {
  on: (event: string, cb: (e: { element?: { id?: unknown } }) => void) => void;
  off?: (event: string, cb: (e: { element?: { id?: unknown } }) => void) => void;
};

export function BpmnViewerModal({ title, bpmnXml, onClose, onGoToStep }: BpmnViewerModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<{ destroy: () => void } | null>(null);
  const canvasRef = useRef<BpmnCanvas | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    let cleanupEventBus: (() => void) | null = null;

    async function loadViewer() {
      if (!containerRef.current) return;

      try {
        setLoading(true);
        setError(null);

        const mod = await import('bpmn-js/lib/NavigatedViewer');
        const Viewer = mod.default;

        if (!mounted) return;

        const viewer = new Viewer({ container: containerRef.current });
        viewerRef.current = viewer;

        const result = await viewer.importXML(bpmnXml);

        if (!mounted) return;

        if (result.warnings && Array.isArray(result.warnings) && result.warnings.length > 0) {
          const warningMessages = result.warnings
            .slice(0, 10)
            .map((w) => {
              if (typeof w === 'object' && w !== null && 'message' in w) {
                return String((w as { message: unknown }).message);
              }
              return String(w);
            });
          setImportWarnings(warningMessages);
        }

        const canvas = viewer.get('canvas') as BpmnCanvas;
        canvasRef.current = canvas;
        canvas.zoom('fit-viewport');

        const eventBus = viewer.get('eventBus') as EventBus;
        const handleElementClick = (e: { element?: { id?: unknown } }) => {
          const element = e?.element;
          const id = element?.id;
          if (typeof id !== 'string') return;

          if (id.startsWith('Task_')) {
            const stepId = id.slice('Task_'.length);
            if (stepId && onGoToStep) {
              onGoToStep(stepId);
              onClose();
            }
          }
        };

        eventBus.on('element.click', handleElementClick);

        if (eventBus.off) {
          cleanupEventBus = () => eventBus.off?.('element.click', handleElementClick);
        }

        setLoading(false);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Unbekannter Fehler beim Laden des BPMN Viewers');
        setLoading(false);
      }
    }

    loadViewer();

    return () => {
      mounted = false;
      if (cleanupEventBus) {
        cleanupEventBus();
      }
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [bpmnXml, onClose, onGoToStep]);

  function handleZoomIn() {
    if (!canvasRef.current) return;
    const currentZoom = canvasRef.current.zoom();
    canvasRef.current.zoom(currentZoom + 0.1);
  }

  function handleZoomOut() {
    if (!canvasRef.current) return;
    const currentZoom = canvasRef.current.zoom();
    canvasRef.current.zoom(Math.max(0.2, currentZoom - 0.1));
  }

  function handleFit() {
    if (!canvasRef.current) return;
    canvasRef.current.zoom('fit-viewport');
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg border border-slate-200 w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col">
        <div className="border-b border-slate-200 p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {!error && (
          <div className="border-b border-slate-200 p-3 flex items-center gap-2 bg-slate-50">
            <button
              onClick={handleFit}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Fit to viewport"
            >
              <Maximize2 className="w-4 h-4" />
              Fit
            </button>
            <button
              onClick={handleZoomIn}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
          </div>
        )}

        {importWarnings.length > 0 && (
          <div className="p-3 bg-yellow-50 border-b border-yellow-200">
            <div className="text-xs font-medium text-yellow-800 mb-1">Import Warnungen:</div>
            <ul className="text-xs text-yellow-700 space-y-1">
              {importWarnings.map((warning, idx) => (
                <li key={idx}>• {warning}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex-1 overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-10">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
                <div className="mt-2 text-sm text-slate-600">Lade BPMN Viewer...</div>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-2xl">
                <div className="text-lg font-semibold text-red-900 mb-2">Fehler beim Laden</div>
                <div className="text-sm text-red-700 whitespace-pre-wrap">{error}</div>
                <button
                  onClick={onClose}
                  className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Schließen
                </button>
              </div>
            </div>
          )}

          <div ref={containerRef} className="w-full h-[70vh] bg-white" />
        </div>
      </div>
    </div>
  );
}

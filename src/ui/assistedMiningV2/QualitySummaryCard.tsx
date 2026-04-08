import { AlertTriangle, CheckCircle2, Info, TrendingUp } from 'lucide-react';
import type { ProcessMiningQualitySummary } from '../../domain/process';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  summary: ProcessMiningQualitySummary;
}

interface Metric {
  label: string;
  value: string | number;
  note?: string;
  status: 'good' | 'warn' | 'neutral';
}

interface Warning {
  text: string;
  severity: 'warn' | 'info';
}

function buildWarnings(s: ProcessMiningQualitySummary): Warning[] {
  const warnings: Warning[] = [];

  if (s.totalObservations === 0) {
    warnings.push({
      text: 'Noch keine erkannten Schritte vorhanden. Werten Sie mindestens einen Fall oder ein Dokument aus, um fortzufahren.',
      severity: 'warn',
    });
  }

  if (s.stepObservationCount > 0 && s.stepObservationCount < 4) {
    warnings.push({
      text: 'Noch sehr wenige Hauptschritte erkannt. Prüfen Sie die automatische Ableitung oder ergänzen Sie weitere Fälle, damit Discovery und Soll-Ist-Abgleich tragfähiger werden.',
      severity: 'info',
    });
  }

  if (s.totalObservations > 0 && s.observationsWithRealTime === 0) {
    warnings.push({
      text: 'Zeitbasierte Engpassanalyse ist noch nicht belastbar, weil keine echten Zeitangaben vorliegen. Für Durchlaufzeiten oder Wartezeiten werden Datums- oder Uhrzeitangaben benötigt.',
      severity: 'warn',
    });
  }

  if (s.totalCases > 0 && s.casesWithOrdering < s.totalCases) {
    const missing = s.totalCases - s.casesWithOrdering;
    if (missing > 0) {
      warnings.push({
        text: `${missing} ${missing === 1 ? 'Quelle liefert' : 'Quellen liefern'} bislang nur einen einzelnen Schritt. Mehrere zusammenhängende Schritte pro Fall verbessern Discovery und Abweichungsanalyse erheblich.`,
        severity: 'info',
      });
    }
  }

  if (s.unclearLabelCount > 0) {
    warnings.push({
      text: `${s.unclearLabelCount} ${s.unclearLabelCount === 1 ? 'Schrittbezeichnung wirkt' : 'Schrittbezeichnungen wirken'} noch unklar oder sehr knapp. Eine kurze Prüfung der automatisch erkannten Schritte verbessert die Ergebnisqualität.`,
      severity: 'info',
    });
  }

  if (s.totalCases === 1) {
    warnings.push({
      text: 'Derzeit liegt nur ein Dokument bzw. ein Fall vor. Das reicht für einen gut prüfbaren Prozessentwurf, aber noch nicht für belastbare Varianten- oder Mengenvergleiche.',
      severity: 'info',
    });
  }

  return warnings;
}

function buildMetrics(s: ProcessMiningQualitySummary): Metric[] {
  const realTimePct =
    s.totalObservations > 0
      ? Math.round((s.observationsWithRealTime / s.totalObservations) * 100)
      : 0;

  return [
    {
      label: 'Quellen / Fälle',
      value: s.totalCases,
      status: s.totalCases >= 5 ? 'good' : s.totalCases > 0 ? 'warn' : 'neutral',
      note: s.totalCases < 5 ? 'Für Fallvergleich oder Mining helfen mehrere Fälle' : undefined,
    },
    {
      label: 'Erkannte Hauptschritte',
      value: s.stepObservationCount,
      status: s.stepObservationCount >= 6 ? 'good' : s.stepObservationCount > 0 ? 'warn' : 'neutral',
    },
    {
      label: 'Reibungssignale',
      value: s.issueObservationCount,
      status: s.issueObservationCount >= 3 ? 'good' : s.issueObservationCount > 0 ? 'warn' : 'neutral',
      note: s.issueObservationCount === 0 && s.totalObservations > 0 ? 'Noch keine klaren Friktionen erkannt' : undefined,
    },
    {
      label: 'Quellen mit Reihenfolge',
      value: `${s.casesWithOrdering} / ${s.totalCases}`,
      status: s.casesWithOrdering === s.totalCases && s.totalCases > 0 ? 'good' : 'warn',
    },
    {
      label: 'Echte Zeitangaben',
      value: `${realTimePct} %`,
      status: realTimePct >= 50 ? 'good' : realTimePct > 0 ? 'warn' : 'neutral',
      note: realTimePct === 0 ? 'Nur relative oder keine Zeiten' : undefined,
    },
  ];
}

const STATUS_ICON = {
  good: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  warn: <AlertTriangle className="w-4 h-4 text-amber-400" />,
  neutral: <Info className="w-4 h-4 text-slate-300" />,
};

const STATUS_BG = {
  good: 'bg-green-50 border-green-200',
  warn: 'bg-amber-50 border-amber-200',
  neutral: 'bg-slate-50 border-slate-200',
};

export function QualitySummaryCard({ summary }: Props) {
  const metrics = buildMetrics(summary);
  const warnings = buildWarnings(summary);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-blue-600" />
        <h3 className="font-semibold text-slate-800 text-sm">Datenstärke auf einen Blick</h3>
        <HelpPopover helpKey="pmv2.quality" ariaLabel="Hilfe: Datenstärke" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {metrics.map(metric => (
          <div
            key={metric.label}
            className={`border rounded-xl p-3 space-y-1 ${STATUS_BG[metric.status]}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{metric.label}</span>
              {STATUS_ICON[metric.status]}
            </div>
            <p className="text-xl font-bold text-slate-800">{metric.value}</p>
            {metric.note && <p className="text-[10px] text-slate-500">{metric.note}</p>}
          </div>
        ))}
      </div>

      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((warning, index) => (
            <div
              key={index}
              className={`flex gap-2.5 rounded-xl px-4 py-3 text-sm ${
                warning.severity === 'warn'
                  ? 'bg-amber-50 border border-amber-200 text-amber-800'
                  : 'bg-blue-50 border border-blue-200 text-blue-800'
              }`}
            >
              {warning.severity === 'warn' ? (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <p>{warning.text}</p>
            </div>
          ))}
        </div>
      )}

      {warnings.length === 0 && summary.totalObservations > 0 && (
        <div className="flex gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <p>Die Datenbasis ist tragfähig genug, um mit Discovery und Soll-Ist-Abgleich weiterzuarbeiten.</p>
        </div>
      )}

      <details className="text-xs text-slate-400">
        <summary className="cursor-pointer hover:text-slate-600 transition-colors">
          Was passiert intern mit den erkannten Schritten?
        </summary>
        <p className="mt-2 text-slate-500 leading-relaxed">
          Die Anwendung speichert erkannte Schritte und Reibungssignale intern in einer geordneten Form,
          damit im nächsten Schritt typische Abläufe, Varianten und Abweichungen berechnet werden können.
          Diese interne Struktur ist ein technisches Hilfsmittel. In der Oberfläche arbeiten Sie weiter mit
          verständlichen Schritten, Fällen und Dokumenten.
        </p>
      </details>
    </div>
  );
}

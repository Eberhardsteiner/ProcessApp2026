import {
  ArrowRight,
  LayoutTemplate,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { APP_RELEASE_TITLE, APP_VERSION_LABEL } from '../config/release';

interface LandingPageProps {
  onStart: () => void;
}

const VALUE_CARDS = [
  {
    icon: LayoutTemplate,
    title: 'Prozesse sauber erfassen',
    text: 'Geführte Eingabe, Dokumentimport und klare Struktur helfen dabei, auch unscharfe Prozesse greifbar zu machen.',
    tone: 'bg-cyan-50 border-cyan-200 text-cyan-800',
  },
  {
    icon: SearchCheck,
    title: 'Lokal analysieren',
    text: 'Die App erkennt Schritte, Rollen, Reibungen und erste Soll-Abweichungen auch ohne KI direkt in der Anwendung.',
    tone: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  },
  {
    icon: Sparkles,
    title: 'Optional mit KI verfeinern',
    text: 'Wenn im Setup gewünscht, lassen sich Prompts erzeugen, Ergebnisse übernehmen oder die API direkt anbinden.',
    tone: 'bg-violet-50 border-violet-200 text-violet-800',
  },
] as const;

const WORKFLOW_STEPS = [
  'Prozess beschreiben oder Dokument hochladen',
  'Lokale Auswertung prüfen und schärfen',
  'Discovery, Soll-Abgleich und Verbesserungshebel nutzen',
] as const;

export function LandingPage({ onStart }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
        <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-950 via-cyan-950 to-emerald-950 text-white shadow-2xl overflow-hidden">
          <div className="grid lg:grid-cols-[1.2fr_0.95fr] gap-0">
            <div className="p-8 sm:p-10 lg:p-12">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 font-medium text-white/90 backdrop-blur-sm">
                  <Workflow className="h-4 w-4" />
                  Prozessaufnahme-App
                </span>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-white/80">
                  {APP_VERSION_LABEL}
                </span>
              </div>

              <div className="mt-8 max-w-3xl space-y-6">
                <div className="space-y-4">
                  <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                    Prozesse verständlich erfassen,
                    <span className="block text-cyan-300">lokal auswerten und gezielt verbessern</span>
                  </h1>
                  <p className="max-w-2xl text-lg leading-relaxed text-slate-200">
                    Die App unterstützt bei der strukturierten Prozessaufnahme, der lokalen Analyse ohne KI und der optionalen
                    KI-Verfeinerung. So bleibt der Nutzen auch dann hoch, wenn keine externe KI eingesetzt werden soll.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={onStart}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
                  >
                    Zur Prozesslandkarte
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <div className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/85 backdrop-blur-sm">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                    {APP_RELEASE_TITLE}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 bg-white/5 p-8 backdrop-blur-sm lg:border-l lg:border-t-0 sm:p-10 lg:p-12">
              <div className="space-y-6">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200">So arbeiten Sie</p>
                  <ol className="mt-4 space-y-3">
                    {WORKFLOW_STEPS.map((step, index) => (
                      <li key={step} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-400/20 text-sm font-semibold text-cyan-200">
                          {index + 1}
                        </span>
                        <span className="text-sm leading-relaxed text-slate-100">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-5">
                  <p className="text-sm font-semibold text-white">Wofür die App besonders geeignet ist</p>
                  <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-200">
                    <li>Dokumente, Narrative und erste Fallspuren in einen verständlichen Prozessentwurf überführen</li>
                    <li>Reibungen, fehlende Angaben, Übergaben und Varianten sichtbar machen</li>
                    <li>Verbesserungshinweise nachvollziehbar in der App halten, auch ohne KI</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {VALUE_CARDS.map(card => {
            const Icon = card.icon;
            return (
              <div key={card.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border ${card.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-slate-900">{card.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{card.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

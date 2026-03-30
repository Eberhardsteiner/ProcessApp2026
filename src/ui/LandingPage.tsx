import { Circle, Square, Diamond, GitBranch, ArrowRight, Workflow, Route, Waypoints, GitMerge, Network, Share2, Zap, Repeat, ArrowRightCircle } from 'lucide-react';

interface LandingPageProps {
  onStart: () => void;
}

export function LandingPage({ onStart }: LandingPageProps) {
  return (
    <div className="landing-page-container">
      <div className="landing-gradient-bg" />
      <div className="landing-grid-overlay" />

      <div className="landing-floating-elements">
        <Circle className="floating-element floating-1 text-cyan-500 opacity-30" size={56} strokeWidth={2} />
        <Square className="floating-element floating-2 text-emerald-500 opacity-25" size={64} strokeWidth={2} />
        <Diamond className="floating-element floating-3 text-teal-600 opacity-35" size={48} strokeWidth={2.5} />
        <GitBranch className="floating-element floating-4 text-blue-500 opacity-28" size={60} strokeWidth={2} />
        <ArrowRight className="floating-element floating-5 text-cyan-600 opacity-32" size={72} strokeWidth={2} />
        <Workflow className="floating-element floating-6 text-emerald-600 opacity-30" size={52} strokeWidth={2} />
        <Circle className="floating-element floating-7 text-teal-500 opacity-22" size={40} strokeWidth={2} />
        <Square className="floating-element floating-8 text-blue-600 opacity-26" size={56} strokeWidth={2} />
        <Route className="floating-element floating-9 text-cyan-500 opacity-28" size={68} strokeWidth={2} />
        <Waypoints className="floating-element floating-10 text-emerald-500 opacity-24" size={58} strokeWidth={2} />
        <GitMerge className="floating-element floating-11 text-teal-600 opacity-33" size={50} strokeWidth={2.5} />
        <Network className="floating-element floating-12 text-blue-500 opacity-27" size={62} strokeWidth={2} />
        <Diamond className="floating-element floating-13 text-cyan-600 opacity-20" size={44} strokeWidth={2} />
        <Share2 className="floating-element floating-14 text-emerald-600 opacity-31" size={54} strokeWidth={2} />
        <Zap className="floating-element floating-15 text-teal-500 opacity-29" size={46} strokeWidth={2.5} />
        <Repeat className="floating-element floating-16 text-blue-600 opacity-25" size={60} strokeWidth={2} />
        <ArrowRightCircle className="floating-element floating-17 text-cyan-500 opacity-34" size={50} strokeWidth={2} />
        <GitBranch className="floating-element floating-18 text-emerald-500 opacity-23" size={48} strokeWidth={2} />
      </div>

      <div className="landing-content-wrapper">
        <div className="landing-card">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 mb-6 rounded-2xl bg-gradient-to-br from-cyan-500 to-emerald-500 shadow-xl">
              <Workflow className="text-white" size={40} strokeWidth={2} />
            </div>
          </div>

          <h1 className="landing-title">
            Prozesse klar strukturieren
          </h1>

          <p className="landing-subtitle">
            Methodische Erfassung von Geschäftsprozessen mit strukturierter Bewertung und kontinuierlicher Verbesserung
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onStart}
              className="landing-primary-button group"
            >
              <span>Zur Prozesslandkarte</span>
              <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={20} />
            </button>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
              <div className="feature-item">
                <div className="feature-icon bg-cyan-100 text-cyan-700">
                  <Circle size={24} />
                </div>
                <h3 className="feature-title">Strukturiert</h3>
                <p className="feature-text">3×3 Matrix nach Management-Ebene und Kategorie</p>
              </div>
              <div className="feature-item">
                <div className="feature-icon bg-emerald-100 text-emerald-700">
                  <GitBranch size={24} />
                </div>
                <h3 className="feature-title">Methodisch</h3>
                <p className="feature-text">Geführte Erfassung mit Wizard und Templates</p>
              </div>
              <div className="feature-item">
                <div className="feature-icon bg-teal-100 text-teal-700">
                  <Workflow size={24} />
                </div>
                <h3 className="feature-title">Verbesserung</h3>
                <p className="feature-text">Integrierte Bewertung und Maßnahmenplanung</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

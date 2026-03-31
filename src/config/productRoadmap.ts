export type RoadmapPhase = {
  versionLabel?: string;
  phase: string;
  title: string;
  summary: string;
};

export const COMPLETED_PHASES: RoadmapPhase[] = [
  {
    versionLabel: 'v0.1',
    phase: 'Phase 1',
    title: 'Einstieg, Sprache und Orientierung vereinfacht',
    summary: 'Geführter Einstieg, klarere Begriffe und ehrlichere Readiness-Hinweise im Assisted Process Mining.',
  },
  {
    versionLabel: 'v0.2',
    phase: 'Phase 2',
    title: 'Lokale Analyseengine gestärkt',
    summary: 'Robustere Schrittfamilien, bessere Verdichtung aus Narrativen und sauberere Trennung von Schritten und Reibungen.',
  },
  {
    versionLabel: 'v0.3',
    phase: 'Phase 3',
    title: 'Prüfwerkstatt für erkannte Schritte',
    summary: 'Schnelle Korrekturen wie Vereinheitlichen, Aufteilen und Umklassifizieren direkt in der App.',
  },
  {
    versionLabel: 'v0.4',
    phase: 'Phase 4',
    title: 'Analyse-Navigator und Einordnung',
    summary: 'Bessere Einordnung der Datenlage, nächste sinnvolle Schritte und verständlichere Ergebnisinterpretation.',
  },
  {
    versionLabel: 'v0.5',
    phase: 'Phase 5',
    title: 'Lokale Sofortauswertung und weniger Klickstrecke',
    summary: 'Hauptlinie, Soll-Hinweis, Hotspot und Datenlage direkt sichtbar; mehrere Analysen starten automatisch.',
  },
  {
    versionLabel: 'v0.6',
    phase: 'Phase 6',
    title: 'Startseite repariert und KI-Verfeinerung geklärt',
    summary: 'Ruhigerer Einstieg, klarere KI-Führung und bessere Vorschau vor dem Übernehmen von KI-Ergebnissen.',
  },
  {
    versionLabel: 'v0.7',
    phase: 'Phase 7',
    title: 'Arbeitsbereich, Quellenübersicht und nächste Aktion',
    summary: 'Kompakter Überblick im PM-Flow, bessere Quellensteuerung und geführtere nächste Schritte.',
  },
  {
    versionLabel: 'v0.8',
    phase: 'Phase 8',
    title: 'Hilfetexte, Info-Icons und Roadmap',
    summary: 'Kontext-Hilfe mit i-Icon an zentralen Funktionen sowie sichtbarer Produktstand und Ausblick.',
  },
  {
    versionLabel: 'v0.9',
    phase: 'Phase 9',
    title: 'Qualitäts- und Datenreife-Werkstatt',
    summary: 'Datenlücken, Belegstellen, Reihenfolge, Rollen, Zeitangaben und Soll-Basis werden systematisch sichtbar und direkt reparierbar.',
  },
];

export const NEXT_PHASES: RoadmapPhase[] = [
  {
    phase: 'Phase 10',
    title: 'Stärkere lokale Analystik durch Domänenregeln',
    summary: 'Mehr branchenspezifische Signalpakete, bessere Ursachenmuster und stabilere lokale Ableitung ohne KI.',
  },
  {
    phase: 'Phase 11',
    title: 'Berichte, Storytelling und Übergaben',
    summary: 'Management-Zusammenfassungen, sauberere Exporte und bessere Kommunikation der Ergebnisse an Stakeholder.',
  },
  {
    phase: 'Phase 12',
    title: 'Technische Härtung und Konsistenz',
    summary: 'Regressionstests, Goldfälle, Expertenmodus-Bereinigung und Performance-Verbesserungen ohne UX-Rückschritte.',
  },
];

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
  {
    versionLabel: 'v0.10',
    phase: 'Phase 10',
    title: 'Fachliche Muster ohne KI',
    summary: 'Lokale Domänenregeln für Reklamationsmanagement und Service-Störungen liefern fachnähere Hinweise, ohne die Bedienung zu verkomplizieren.',
  },
  {
    versionLabel: 'v0.11',
    phase: 'Phase 11',
    title: 'Berichte, Storytelling und Übergaben',
    summary: 'Lokal erzeugte Management-Zusammenfassungen, Prozessgeschichten und Zielgruppen-Übergaben direkt im Assisted Process Mining.',
  },
  {
    versionLabel: 'v0.12',
    phase: 'Phase 12',
    title: 'Technische Härtung und konsistente Führung',
    summary: 'Analyseketten werden bei Basisänderungen automatisch sauber neu aufgebaut, Schritte klarer freigegeben und lokale Beispielpakete erleichtern den Einstieg.',
  },
  {
    versionLabel: 'v0.13',
    phase: 'Phase 13',
    title: 'Goldfälle, Evidenz und Regression',
    summary: 'Feste Referenzfälle prüfen die lokale Analyseengine, ein Beleg-Inspektor macht Ableitungen nachvollziehbarer und ein lokaler Regression-Check stärkt Vertrauen ohne KI.',
  },
  {
    versionLabel: 'v0.14',
    phase: 'Phase 14',
    title: 'UI-Konsolidierung und ruhigerer Arbeitsfluss',
    summary: 'Große Bereiche wurden klar gebündelt, optionale Vertiefungen einklappbar gemacht und die Navigationslogik über mehrere Schritte beruhigt und vereinheitlicht.',
  },
];

export const NEXT_PHASES: RoadmapPhase[] = [
  {
    phase: 'Phase 15',
    title: 'Lokale Analyseengine 3.0',
    summary: 'Dokumentklassifikation, Abschnittserkennung, Schrittfamilien und Mehrfallvergleich ohne KI noch robuster und präziser machen.',
  },
  {
    phase: 'Phase 16',
    title: 'Prüfwerkstatt 2.0',
    summary: 'Schnellere Reparaturwege mit Mehrfachauswahl, besseren Vorschlägen, Undo/Redo und stärkerer Normalisierung von Rollen, Systemen und Synonymen.',
  },
  {
    phase: 'Phase 17',
    title: 'Berichte, Exporte und Vergleichbarkeit',
    summary: 'Management-taugliche Berichte, strukturiertere Exporte und sauberere Vergleiche zwischen Versionen und Analysezuständen.',
  },
  {
    phase: 'Phase 18',
    title: 'Technische Härtung für Pilotbetrieb',
    summary: 'Mehr Tests, Performance- und Bundle-Pflege, Regression gegen Goldfälle und robustere Fehlerbehandlung für größere Materialien.',
  },
];

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
  {
    versionLabel: 'v0.15',
    phase: 'Phase 15',
    title: 'Lokale Analyseengine 3.0',
    summary: 'Stärkere Materialprofile, bessere Abschnittsselektion, robustere Kurzfall-Ableitung und klarere Mehrfallmuster machen die lokale Analyse ohne KI deutlich präziser und nachvollziehbarer.',
  },
  {
    versionLabel: 'v0.16',
    phase: 'Phase 16',
    title: 'Prüfwerkstatt 2.0 und Datenreparatur',
    summary: 'Mehrfachauswahl, sichere Rückgängig-/Wiederholen-Schritte und gemerkte Vereinheitlichungsregeln für Begriffe, Rollen und Systeme machen die lokale Nachschärfung deutlich robuster und schneller.',
  },
  {
    versionLabel: 'v0.17',
    phase: 'Phase 17',
    title: 'Berichte, Übergaben und lokale Storyline',
    summary: 'Lokal erzeugte Berichte, Management-Kurzfassungen und verständliche Übergaben machen die Ergebnisse auch ohne KI direkt weitergabefähig.',
  },
  {
    versionLabel: 'v0.18',
    phase: 'Phase 18',
    title: 'Pilot-Härtung und Arbeitsstand-Sicherung',
    summary: 'Pilot-Readiness, sicherer JSON-Arbeitsstand, Wiederherstellung, Startanleitung und ein lokaler Pilot-Check machen den PM-Flow robuster für echte Tests.',
  },
  {
    versionLabel: 'v0.19',
    phase: 'Phase 19',
    title: 'Performance und Bundle-Pflege',
    summary: 'Schwere Bereiche werden jetzt gezielt erst bei Bedarf geladen, Build-Chunks sauberer getrennt und ein lokaler Bundle-Überblick erleichtert weitere Pflege ohne die Bedienlogik zu zerstören.',
  },
  {
    versionLabel: 'v0.20',
    phase: 'Phase 20',
    title: 'Mehr Goldfälle und breitere Fachpakete',
    summary: 'Die lokale Referenzbibliothek deckt jetzt Reklamationen, Service, Retouren und Mischdokumente besser ab. Zusätzliche Goldfälle und ein drittes Fachpaket machen die Analyse ohne KI belastbarer.',
  },
];

export const NEXT_PHASES: RoadmapPhase[] = [
  {
    phase: 'Phase 21',
    title: 'Mehr Testtiefe und stabile Referenzbibliothek',
    summary: 'Weitere Goldfälle, gezielte Regressionstests und feinere Qualitätsgrenzen sollen lokale Verbesserungen messbarer und verlässlicher machen.',
  },
  {
    phase: 'Phase 22',
    title: 'UI-Feinschliff und Vergleichsansichten',
    summary: 'Berichte, Benchmarks und Arbeitsstände sollen ruhiger, vergleichbarer und für Entscheider noch schneller lesbar werden.',
  },
  {
    phase: 'Phase 23',
    title: 'Governance, Nachvollziehbarkeit und Teamarbeit',
    summary: 'Auditierbare Entscheidungen, stärkerer Evidenzbezug und bessere Zusammenarbeit an demselben Analysearbeitsstand stehen im Vordergrund.',
  },
  {
    phase: 'Phase 24',
    title: 'Weitere Fachpakete und Betriebsmodus',
    summary: 'Zusätzliche Domänenpakete, stabilere Betriebschecks und optionale Integrationen sollen den Weg in einen breiteren Praxiseinsatz öffnen.',
  },
];

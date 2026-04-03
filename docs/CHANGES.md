# Release-Stand

## v0.20 · Phase 20
- Referenzbibliothek für die lokale Analyse deutlich verbreitert: zusätzliche Goldfälle für Mischdokumente und Retouren/Garantie sowie ein drittes lokales Beispielpaket
- Benchmark deckt jetzt Reklamationen, Service, Retouren und Mischdokumente sichtbar ab und zeigt diese Fachfelder in der App und im CLI-Benchmark
- lokale Analyseengine um Retouren-, Garantie-, RMA- und Wareneingangsbegriffe erweitert, ohne die Bedienlogik zu verkomplizieren
- sichtbare Roadmap mit neuem Ausblick auf die Phasen 21 bis 24 ergänzt

## v0.19 · Phase 19
- schwere Ansichten und optionale Bereiche wie Prozesslandkarte, Wizard, Experten-Mining, Bericht, Workshop, globale Suche und BPMN-Vorschau werden jetzt gezielt erst bei Bedarf nachgeladen
- neue Ladezustände halten die Oberfläche während des Nachladens verständlich und ruhig, statt leere oder sprunghafte Bereiche zu zeigen
- Build-Chunks werden für React, Icons, PDF, BPMN und ZIP sauberer getrennt, damit Start und Wiederaufruf leichter bleiben
- neuer Befehl `npm run bundle:summary` zeigt nach dem Build die größten Artefakte und erleichtert weitere Performance-Pflege

## v0.18 · Phase 18
- neue Pilot-Readiness-Karte bündelt Materialbasis, Beleglage, Analysekette, Bericht und Vergleichsbasis in einer verständlichen Pilot-Einordnung
- Assisted-Process-Mining-Arbeitsstand kann jetzt als JSON gesichert und später wieder vollständig geladen werden
- neuer lokaler Pilot-Check (`npm run pilot:check`) prüft Beispielpakete, Berichtserzeugung und Snapshot-Roundtrip außerhalb der UI
- Startanleitung (`START_HERE.md`) und Pilot-Checkliste ergänzt, damit lokale Inbetriebnahme und Pilotvorbereitung weniger fehleranfällig werden

## v0.14 · Phase 14
- ruhigere Bedienlogik im Assisted Process Mining: große Arbeitsbereiche wie Datenreife, Prüfwerkstatt, Quellenübersicht, Detailbearbeitung, Goldfälle und optionale KI sind jetzt klar gebündelt und einklappbar
- neuer Schnellzugriff führt direkt zu den wichtigsten Arbeitsbereichen, ohne die Oberfläche mit zusätzlichen Pflichtschritten zu überladen
- konsistente Schritt-Navigation durch vereinheitlichte Aktionsleisten in Discovery, Soll-Abgleich und Verbesserungsanalyse
- Fokus weiter auf lokaler, nachvollziehbarer Analyse ohne KI: die Hauptstrecke bleibt jetzt sichtbarer und ruhiger

## v0.13 · Phase 13
- Goldfälle und lokale Regression ergänzt: feste Referenzfälle prüfen die lokale Analyseengine direkt in der App
- neuer Beleg-Inspektor zeigt an einzelnen Schritten, auf welche Textstelle sich die App stützt und wie die Einordnung zustande kommt
- lokaler Regression-Check auch als npm-Skript (`npm run benchmark:pm`) ergänzt
- Roadmap auf die Phasen 14 bis 18 fortgeschrieben

## v0.12 · Phase 12
- Assisted Process Mining technisch gehärtet: Änderungen an Quellen, Schritten oder Discovery setzen nachgelagerte Analysen und Berichte automatisch konsistent zurück
- neuer Ablaufstatus im Arbeitsbereich zeigt verständlich, welcher Schritt bereit ist, worauf andere Schritte noch warten und wo direkt weitergearbeitet werden kann
- klare Guardrails in Discovery, Soll-Abgleich, Verbesserungsanalyse und Bericht: keine Sackgassen mehr bei fehlender Basis
- lokale Beispielpakete für Reklamationen und Service-Störungen ergänzt, damit Onboarding und schneller Funktionscheck ohne eigenes Material möglich sind
- eigener Reset nur für den PM-Arbeitsstand der aktuellen Version ergänzt, ohne andere Bereiche der Version anzutasten

## v0.11 · Phase 11
- lokal erzeugte Berichte, Management-Kurzfassungen und Prozessgeschichten im Assisted Process Mining ergänzt
- neue Übergabetexte für Management, Prozessverantwortung, operatives Team und Workshop direkt aus den lokalen Analyseergebnissen
- Mining-Zusammenfassung enger mit dem Bericht verknüpft, damit Ergebnisse schneller weitergegeben und gespeichert werden können
- Statusanzeige im Arbeitsbereich um Hinweis auf vorhandenen Bericht erweitert

## v0.10 · Phase 10
- lokale Domänenregeln für Reklamationsmanagement und Service-Störfälle ergänzt
- fachlichere Muster, Reibungssignale und Hinweise ohne KI direkt in der App
- kompakter Bereich „Fachliche Muster ohne KI“ in die lokale Analyse integriert

## v0.9 · Phase 9
- neue Qualitäts- und Datenreife-Werkstatt im Assisted Process Mining ergänzt
- direkte Hinweise auf Datenlücken, Belegstellen, Reihenfolge, Rollen/Systeme, Zeitangaben und Soll-Basis
- lokale Standard-Reparatur für erkannte Schritte als direkt nutzbare Onboard-Funktion ergänzt
- Überblick um Datenreife-Badge erweitert, ohne die bestehende Bedienlogik umzubauen

## v0.8 · Phase 8
- Hilfetexte mit Info-Icons an den zentralen Funktionen im Assisted Process Mining ergänzt
- Produktstand und Roadmap in Landing Page sowie App-Kopf sichtbar gemacht
- keine Funktionsverbreiterung, sondern bewusst mehr Orientierung, Verständlichkeit und sichere Führung

## v0.7 · Phase 7
- Assisted Process Mining um einen kompakten Arbeitsbereich auf einen Blick ergänzt, inklusive klarer nächster Aktion und einblendbarem Analyse-Überblick
- Schritt 1 durch Schnellstart, Quellenübersicht und einklappbare Detailkarten deutlich übersichtlicher gemacht
- optionale KI-Verfeinerung standardmäßig zurückgenommen und klar als freiwillige Zusatzfunktion markiert
- Discovery, Soll-Abgleich und Verbesserungsanalyse um eine verständliche Kernaussage plus empfohlene nächste Aktion ergänzt

## v0.6 · Phase 6
- Startseite vollständig beruhigt und mit klarerem Einstieg repariert
- lokale Sofortauswertung im Assisted Process Mining ergänzt: Hauptlinie, Soll-Hinweis, Reibungspunkt und Datenlage auf einen Blick
- Discovery, Soll-Abgleich und Verbesserungsanalyse laufen beim Öffnen nun automatisch an, wenn genug Material vorhanden ist
- optionale KI-Verfeinerung deutlich verständlicher gemacht: Fokuswahl, strukturierter Prompt, API/Copy-Paste, Vorschau und sichere Übernahme

## v0.5 · Phase 5
- lokale Sofortauswertung und geführtere nächste Schritte im Assisted Process Mining ergänzt
- weniger Klickstrecke durch automatische Ausführung geeigneter lokaler Analysen
- Einstieg in „Prozess auswerten“ klarer und verständlicher gestaltet

## v0.4 · Phase 4
- Analyse-Navigator mit klaren nächsten Schritten, Leistungsgrenzen und Datenreife ergänzt
- verständlichere Ergebnisinterpretation in Discovery, Soll-Abgleich und Verbesserungsanalyse
- lokale Signalerkennung mit besseren Evidenz-Snippets für Reibung, fehlende Angaben und Koordinationsprobleme gestärkt
- semantische Schrittfamilien erweitert, damit lokale Ableitung und Soll-Abgleich robuster werden

## v0.3 · Phase 3
- Prüfwerkstatt für erkannte Schritte ergänzt
- lokale Reparatur- und Vereinheitlichungslogik direkt nach der Ableitung
- bequemere manuelle Korrektur mit Split, Reclassify und Schritt-Ergänzung
- verständlichere Führung rund um erkannte Schritte und nächste sinnvolle Aktionen

## v0.2 · Phase 2
- lokale Analyseengine für narrative Dokumente gestärkt
- semantische Kanonisierung ähnlicher Prozessschritte
- robustere Verdichtung von Rollen, Systemen und Reibungssignalen
- bessere Datenstärke-Anzeige im Assisted Process Mining

## v0.1 · Phase 1
- Guided-Einstieg und Sprache im Assisted Process Mining vereinfacht
- Analysearten klarer voneinander getrennt
- ehrlichere Ergebnisführung und Readiness-Hinweise

## Nächster Schwerpunkt
- Mehr Testtiefe, UI-Vergleichsansichten, Governance/Nachvollziehbarkeit und weitere Fachpakete für größere Pilotumfänge

# Versionsvergleich (Änderungen)

## Zweck

Der Änderungs-Tab ermöglicht den deterministischen Vergleich zweier Prozessversionen, typischerweise zwischen As-Is (Baseline) und To-Be (aktuelle Version). Dies hilft, Verbesserungen und Änderungen nachvollziehbar zu dokumentieren.

## Nutzung

1. **Version duplizieren**: Im Setup-Tab eine bestehende Version (As-Is) duplizieren, um eine Arbeitskopie für To-Be-Modellierung zu erstellen
2. **Änderungen vornehmen**: In der duplizierten Version Prozessänderungen durchführen (Schritte hinzufügen/ändern/entfernen, Maßnahmen aktualisieren, etc.)
3. **Änderungen-Tab öffnen**: Zum "Änderungen"-Tab wechseln
4. **Baseline wählen**: Im Dropdown die Baseline-Version (meist die ältere, ursprüngliche Version) auswählen
5. **Änderungen prüfen**: Die Zusammenfassung zeigt:
   - End-to-End Änderungen (Trigger, Kunde, Ergebnis, Fertig-Kriterium)
   - Happy Path: hinzugefügte (+), entfernte (-), geänderte (~) Schritte
   - Entscheidungen: hinzugefügt/entfernt
   - Ausnahmen: hinzugefügt/entfernt
   - Maßnahmen-Backlog: hinzugefügt/entfernt/geändert
6. **Zusammenfassung kopieren**: Mit dem Button "Änderungszusammenfassung kopieren" eine textuelle Zusammenfassung in die Zwischenablage kopieren
7. **KI-Erklärung (optional)**:
   - Button "KI: Diff erklären" klicken
   - **Standard Copy/Paste:** Prompt in Claude einfügen und Markdown-Antwort zurück in die App kopieren
   - **Optional API-Modus:** Button „Per API senden" übernimmt Antwort automatisch (nur external mode, nur nach Consent)
   - Optional: Antwort kopieren oder als Markdown exportieren
   - Hinweis: Keine automatische Datenübertragung

## Vergleichslogik

Der Vergleich erfolgt **deterministisch** anhand von IDs:
- Schritte werden über `stepId` identifiziert
- Entscheidungen über `decisionId`
- Ausnahmen über `exceptionId`
- Backlog-Items über `id`

Dies bedeutet:
- Wenn ein Schritt dupliziert wird, behält er seine ID und wird als "unverändert" erkannt
- Nur neue Schritte (neue ID) werden als "hinzugefügt" markiert
- Gelöschte Schritte (ID nicht mehr vorhanden) werden als "entfernt" markiert
- Schritte mit gleicher ID aber geänderten Feldern werden als "geändert" markiert

## Hinweise

- Mindestens zwei Versionen sind erforderlich
- Der Vergleich funktioniert offline ohne Backend oder KI
- Bei langen Listen werden die ersten 20 Einträge angezeigt, der Rest wird zusammengefasst
- Die Änderungszusammenfassung ist in einfachem Deutsch für Nicht-Experten verständlich

## Anwendungsfall: As-Is zu To-Be

Typischer Workflow:
1. As-Is-Prozess erfassen (Version 1)
2. Version 1 duplizieren → Version 2 (To-Be)
3. In Version 2 Verbesserungen modellieren:
   - Schritte optimieren/automatisieren
   - Unnötige Schritte entfernen
   - Neue Entscheidungspunkte hinzufügen
   - Maßnahmen aus dem Backlog umsetzen
4. Im Änderungen-Tab: Version 1 als Baseline, Version 2 als aktuell
5. Änderungszusammenfassung für Stakeholder kopieren


---

## v0.15 · Phase 15 · Lokale Analyseengine 3.0

### Schwerpunkt
Die lokale Analyse ohne KI wurde auf der Engine-Ebene präziser und nachvollziehbarer gemacht.

### Wichtige Änderungen
- neues lokales Engine-Profil mit Materialerkennung, Extraktionsfokus und Stabilität
- stärkere Abschnittsselektion für Mischdokumente, Fallgeschichten und signalreiche Texte
- verbesserte Kurzfall-Ableitung durch Aufspaltung knapper, komma-getrennter Prozessbeschreibungen in belastbarere Handlungseinheiten
- robusterer Mehrfallvergleich mit stabilen und variablen Mustern über mehrere Quellen
- verständlichere Signalbezeichnungen für Reklamations- und Servicefälle
- Engine-Profil im Assisted Process Mining sichtbar gemacht
- Benchmark und Beispielpakete auf die stärkere Mehrfalllogik angehoben

### Ergebnis
- lokale Analyseengine: pm-local-engine-v3.0
- PM-Benchmark: 90/100
- alle drei Goldfälle bestehen aktuell lokal ohne KI


---

## v0.16 · Phase 16 · Prüfwerkstatt 2.0

### Schwerpunkt
Die lokale Prüfwerkstatt wurde robuster, schneller und sicherer gemacht, ohne die Bedienung zu verkomplizieren.

### Wichtige Änderungen
- Mehrfachauswahl direkt auf Prüfkarten für schnelle Sammelkorrekturen
- Rückgängig/Wiederholen für explizite Reparaturschritte in der Prüfwerkstatt
- gemerkte Vereinheitlichungsregeln für Schrittbezeichnungen, Rollen und Systeme
- neue Reparaturhistorie, damit lokale Änderungen nachvollziehbar bleiben
- Review-Zustand wird jetzt zusammen mit dem Assisted-Process-Mining-Arbeitsstand gespeichert

### Ergebnis
- lokale Prüfwerkstatt deutlich belastbarer für mehrere Quellen und wiederkehrende Begriffsvarianten
- bessere Onboard-Analysestärke ohne KI, weil die App lokale Normalisierung dauerhaft mitführen kann

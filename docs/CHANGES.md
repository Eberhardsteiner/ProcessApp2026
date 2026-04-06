## v0.40 · Qualitätsreport und exportierbare Testauswertung

- neuer Gesamtreport `npm run quality:report` bündelt Technik, Referenzdokumente, Benchmark und Produktreife in einem JSON-, Markdown- und CSV-Output
- fünf Referenzdokumente unterschiedlicher Güte sind jetzt als feste Qualitätsroutine im Report abgebildet
- Reports werden in `reports/` als aktuelle und zeitgestempelte Archivdateien geschrieben
- neue Doku `docs/QUALITY_REPORT.md` und Startanleitung um den Qualitätsreport ergänzt

## v0.38 · Phase 38 · Sicherheit, Datenschutz und Deployment-Reife

- neuer Bereich „Sicherheit, Datenschutz und Deployment“ direkt in Schritt 5 mit Datenklassifikation, Betriebsziel, Aufbewahrung, Backup- und Deployment-Notizen
- lokaler Security-Readiness-Score mit sichtbaren Hinweisen zu sensiblen Markern, externen Wegen und letzter Sicherheitsprüfung
- exportierbares Security-/Deployment-Profil als JSON sowie Kurzbriefing für Datenschutz, IT oder Pilotleitung
- neuer lokaler Security-Check `npm run security:check` und zusätzlicher Baustein im `npm run release:check`
- Produktstand auf v0.38 fortgeschrieben

## v0.37 · Phase 37 · Reale Integrationsschicht

- neue Integrationswerkbank mit strukturierten Verträgen, Pflichtfeldern und Exchange Packages für kontrollierte Connector-Wege
- externe Rückmeldungen aus Zielsystemen oder Proxies können jetzt als Receipt wieder in den Arbeitsstand übernommen werden
- Connector-Verträge und Rückmeldungen fließen in Überblick, Auditspur und Collaboration-Ziele mit ein
- neuer lokaler Adapter-Check `npm run adapter:check` und zusätzlicher Baustein im `npm run release:check`
- Produktstand auf v0.37 fortgeschrieben

## v0.36 · Phase 36 · Zusammenarbeit, Kommentare und Auditierbarkeit

- neuer Bereich für Kommentare, Team-Notizen und Auditspur direkt im Assisted Process Mining
- Kommentare können sich auf Arbeitsstand, Bericht, Governance, Entscheidungen, Quellen oder Kernschritte beziehen
- neue nachvollziehbare Auditspur für Kommentare, Berichtserzeugung sowie wichtige Governance-Aktionen
- kompakter Überblick zu Zusammenarbeit und Auditspur jetzt auch im Arbeitsbereich sichtbar
- neuer lokaler Check `npm run collaboration:check` sowie zusätzlicher Baustein im `npm run release:check`
- Produktstand auf v0.36 fortgeschrieben

## v0.35 · Phase 35 · Domänenbibliothek 2.0 und Qualitätsmetriken

- Rechnung & Zahlungsklärung sowie Stammdaten & Änderungen sind jetzt vollständig gemessene Fachpakete im lokalen Benchmark
- die Domänenbibliothek zeigt pro Fachfeld nun Score, Goldfälle, Beispielpakete, starke und schwächere Qualitätsdimensionen sowie einen kompakten Pflegehinweis
- Benchmark und Verlauf führen jetzt feinere Domänenmetriken mit, damit Unterschiede zwischen Fachfeldern besser sichtbar werden
- Produktstand auf v0.35 fortgeschrieben

## v0.33 · Phase 33 · UI-Konsolidierung und Bedienlogik

- Schrittkopf, Stepper und Speichern-Status wurden zu einem ruhigeren gemeinsamen Rahmen zusammengezogen.
- Discovery, Soll-Abgleich, Verbesserungsanalyse und Schritt 5 nutzen jetzt ein konsistenteres Muster für Schrittziel, Kennzahlen und nächste Aktion.
- Schnellzugriffe zeigen Hinweise nur noch bei Bedarf, damit die Oberfläche ruhiger bleibt.
- Produktstand auf v0.33 fortgeschrieben.

## v0.31 · Phase 31 · Freigabe-Assistenz und Governance-Auswertung

- neue Freigabe-Assistenz im Governance-Bereich: Governance-Reife, priorisierte offene Punkte, Review-Dauer und Freigabezustand werden jetzt in einer ruhigen Steuerungssicht zusammengeführt
- neue Governance-Auswertung mit Kurzbrief, Trend zum letzten gemerkten Governance-Stand und klarer Priorisierung überfälliger oder unklarer Entscheidungen
- neuer lokaler Governance-Check per `npm run governance:check` und zusätzlicher Governance-Baustein im `npm run release:check`
- Roadmap mit Phase 31 abgeschlossen und Produktstand auf 0.31.0 aktualisiert

## v0.27 · Phase 27 · Feinschliff für Freigabe- und Review-Prozesse

- neuer Review- und Freigabepfad im Governance-Bereich mit klaren Statusstufen von Analysebasis bis Weitergabe
- gemerkte Governance-Stände mit Vergleich zum aktuellen Arbeitsstand, damit Review- und Freigabestände nachvollziehbar bleiben
- neue Review-Vorlagen für Team-Review, Management-Freigabe und Pilot-Weitergabe
- ruhigere Freigabeführung mit dokumentierter Freigabe, Freigabe-Notiz und schneller erneuter Bestätigung nach Änderungen
- Versionierung auf 0.27.0 aktualisiert

## v0.26 · Phase 26 · Betriebsreife, Importpfade und optionale Integrationen

- neue Import-Gesundheit im Assisted Process Mining
- neue Sicht auf Betriebsgrenzen und optionale Integrationswege
- vorbereitete JSON-Profile für Connector-Kurzprofil und Handover
- neuer lokaler Integrationscheck per `npm run integration:check`
- Versionierung auf 0.26.0 aktualisiert

# Release-Stand

## v0.25 · Phase 25
- neues Pilot-Toolkit bündelt Bericht, Governance-Review, offene Punkte, Workshop-Fahrplan und den vollständigen PM-Arbeitsstand in einer ruhigen Exportform
- Governance-Exporte erweitert: offene Entscheidungen und Review-Paket lassen sich jetzt zusätzlich direkt laden
- Pilot-Paket kann als ZIP oder JSON exportiert werden und enthält auch einen wiederherstellbaren PM-Arbeitsstand
- Arbeitsbereich zeigt jetzt kompakt, wann zuletzt ein Pilot-Paket erzeugt wurde und wann es nach Änderungen neu erstellt werden sollte

## v0.24 · Phase 24
- neue lokale Fachpakete für Einkauf & Freigaben sowie Onboarding & Zugänge in Beispielpaketen, Goldfällen und Benchmark-Abdeckung ergänzt
- wählbarer Betriebsmodus im Assisted Process Mining: Kurztest, Standard und Pilotlauf steuern jetzt ruhig, wie viel Tiefe standardmäßig sichtbar ist
- lokale Engine um zusätzliche Rollen-, System-, Signal- und Schrittmuster für Beschaffung und Onboarding erweitert
- Roadmap nach Phase 24 fortgeschrieben und Ausblick auf die Phasen 25 bis 28 aktualisiert

## v0.22 · Phase 22
- neue Vergleichsansichten für Berichte: Berichtsgrundlage, Vergleich zum vorherigen Bericht und Abgleich zwischen aktuellem Arbeitsstand und letztem Bericht direkt im PM-Flow
- Benchmark-Verlauf ruhiger gemacht: die letzten lokalen Prüfungen sind jetzt auf einen Blick sichtbar und leichter vergleichbar
- Arbeitsbereich zeigt jetzt deutlicher, ob ein Bericht noch aktuell ist oder nach Änderungen an Quellen und Schritten erneut erzeugt werden sollte
- Report-Historie wird im Assisted-Process-Mining-Arbeitsstand mitgeführt und bleibt auch in Snapshot-Sicherungen erhalten

## v0.21 · Phase 21
- Referenzbibliothek erweitert: zusätzliche Goldfälle und ein neues Beispielpaket für Mischdokumente verbreitern die lokale Regression über mehrere Materialarten und Fachfelder
- Benchmark-Verlauf wird jetzt im Assisted Process Mining gespeichert und mit dem letzten Lauf verglichen
- neue Qualitätsdimensionen und Fachfeld-Scores machen Stärken und Schwächen der lokalen Engine deutlich lesbarer
- neuer strenger Qualitätscheck sowie Skript `npm run benchmark:pm:strict` sichern die lokale Regression über den einfachen Benchmark hinaus ab

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
- Betriebsreife, optionale Integrationen und robustere Übergabepfade für längere Test- und Pilotläufe

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

---

## v0.23 · Phase 23 · Governance, Nachvollziehbarkeit und Teamarbeit

### Schwerpunkt
Die Analyse wurde um eine ruhige Governance-Schicht ergänzt, damit Review, Weitergabe und Teamabstimmung nachvollziehbarer werden, ohne den Hauptfluss zu überladen.

### Wichtige Änderungen
- neuer Governance-Bereich im Assisted Process Mining mit Entscheidungslog, Review-Checkliste und Teamabstimmung
- nachvollziehbare Governance-Notiz mit Copy-, Text- und JSON-Export
- Governance-Stand jetzt auch kompakt im Arbeitsbereich sichtbar
- Berichte und Übergaben nehmen Governance-Hinweise wie offene Entscheidungen oder nächste Review-Termine jetzt mit auf
- neue Hilfetexte für Governance und nachvollziehbare Weitergabe

### Ergebnis
- offener Review- und Freigabebedarf ist jetzt direkt in der App sichtbar
- Teamarbeit bleibt auch ohne externes Kollaborationstool nachvollziehbar dokumentiert
- die lokale Analyse bleibt führend, wird aber besser review- und pilotfähig

---

## v0.28 · Phase 28 · Domänenbibliothek und Fachpaket-Ausbau

### Schwerpunkt
Die lokale Analyse ohne KI wurde fachlich breiter und zugleich besser erklärbar gemacht. Eine neue Domänenbibliothek zeigt jetzt sichtbar, welche Fachpakete bereits gemessen sind und welche als Vorschau bereitstehen.

### Wichtige Änderungen
- neue Domänenbibliothek direkt im Assisted Process Mining
- gemessene Fachpakete und explorative Vorschau-Pakete in einer ruhigen Vergleichsansicht
- neue Vorschau-Pakete für Rechnung & Zahlungsklärung sowie Stammdaten & Änderungen
- zusätzliche lokale Rollen-, System-, Signal- und Schrittmuster für diese beiden neuen Fachfelder
- neue Dokumentation zur Domänenbibliothek in `docs/DOMAINS.md`
- Produkt-Roadmap und Release-Stand auf v0.28 fortgeschrieben

### Ergebnis
- lokale Analyse bleibt im Hauptfluss schlank, wird aber fachlich deutlich breiter erklärbar
- neue Fachfelder können direkt mit lokalen Beispielpaketen getestet werden, ohne den Benchmark-Kern zu destabilisieren
- die App zeigt klarer, welche Pakete schon belastbar gemessen sind und welche noch bewusst explorativ bleiben

## v0.29 · Phase 29 · Optionale Betriebs- und Connector-Pakete

- Neue Connector-Pakete im Assisted Process Mining für Ticket-Handover, BI/Reporting, KI-/API-Proxy und Governance-Archiv.
- Connector-Pakete bleiben bewusst optional und exportieren strukturierte JSON- und Textprofile statt stiller Live-Kopplung.
- Neuer Connector-Check (`npm run connector:check`) ergänzt die lokalen Betriebs- und Integrationsprüfungen.
- Überblick und Hilfe wurden um Connector-Status, letzte Exporte und Betriebshinweise erweitert.
- Produkt-Roadmap und Release-Stand auf v0.29 fortgeschrieben.

## v0.30 · Phase 30 · Freigabe, Stabilisierung und Pilotbetrieb 2.0

- Neuer roter Faden in Schritt 5: Bericht, Governance, Pilot-Paket, Connector-Pakete und Arbeitsstand-Sicherung werden jetzt in einem klaren Freigabefluss gebündelt.
- Neue Freigabe- und Stabilisierungskarte mit ruhigen Statusgates, nächster sinnvoller Aktion und Sprungmarken zu den relevanten Bereichen.
- Neuer lokaler Release-Check (`npm run release:check`) bündelt Benchmark, Pilotlauf, Integration und Connector-Pakete zu einer gemeinsamen Stabilitätsprüfung.
- Roadmap bereinigt: Phase 30 ist abgeschlossen, als nächste verbindliche Phase bleibt nur noch Phase 31.
- Release-Stand auf v0.30 fortgeschrieben.


## v0.32 · Phase 32 · Produkt-Härtung und Fehlerabbau

- Neue Arbeitsstand-Härtung für Assisted Process Mining: beschädigte, veraltete oder widersprüchliche Zustände werden beim Laden und Wiederherstellen automatisch stabilisiert.
- Neue sichtbare Härtungskarte im Arbeitsbereich mit Reparaturhinweisen und Integritätsstatus.
- Save-Fehler im PM-Arbeitsstand werden jetzt klar angezeigt und können direkt erneut gespeichert werden.
- Neuer lokaler Hardening-Check (`npm run hardening:check`) ergänzt die Release-Prüfungen um Recovery- und Snapshot-Szenarien.
- `npm run release:check` berücksichtigt jetzt zusätzlich Arbeitsstand-Härtung und Recovery.
- Produktstand auf v0.32 fortgeschrieben.

## v0.33 · Phase 33 · UI-Konsolidierung und Bedienlogik

- Schrittköpfe, Hilfe, Speicherstatus und Aktionsleisten im Assisted Process Mining folgen jetzt einem ruhigeren, einheitlicheren Muster.
- Discovery, Soll-Abgleich, Verbesserungsanalyse und Ergebnisanreicherung nutzen jetzt dieselbe Logik für Ziel, Kennzahlen und nächste Aktion.
- Schnellzugriffe und Statushinweise werden bei Bedarf kompakter eingeblendet, damit der Hauptfluss ruhiger bleibt.
- Produktstand auf v0.33 fortgeschrieben.

## v0.34 · Phase 34 · Lokale Analyseengine 4.0

- Material wird jetzt feiner klassifiziert: Prozesskern, Kommunikation, Reibung, Wissen, Maßnahme, Governance, Tabellencharakter und Nebengeräusch werden lokal klarer getrennt.
- Die Engine führt einen expliziten lokalen Ableitungsplan mit, der zeigt, welche Abschnitte primär für Prozessschritte und welche nur als Stütze oder Evidenz genutzt wurden.
- Mehrfallverdichtung und Materialprofile wurden um Stabilität, wiederkehrende Reibungssignale und prozessnahe Materialanteile erweitert.
- Das neue lokale Engine-Profil erklärt die Ableitung deutlich nachvollziehbarer, ohne KI vorauszusetzen.
- Produktstand auf v0.34 fortgeschrieben.


## v0.35 · Phase 35 · Domänenbibliothek 2.0 und Qualitätsmetriken

- Rechnungsklärung und Stammdatenänderungen sind jetzt gemessene Fachpakete.
- Die Domänenbibliothek zeigt zusätzlich Score, Goldfälle, Beispielpakete sowie starke und schwächere Qualitätsdimensionen je Fachfeld.
- Benchmark und strenger Qualitätscheck decken jetzt mehr Fachbereiche kontrolliert ab.

## v0.36 · Phase 36 · Zusammenarbeit, Kommentare und Auditierbarkeit

- Kommentare, Team-Notizen und Auditspur sind jetzt direkt im Assisted Process Mining verfügbar.
- Review, Governance und Freigabe werden dadurch nachvollziehbarer, ohne auf externe Listen ausweichen zu müssen.
- Ein zusätzlicher Collaboration-Check stärkt den Release-Blick auf Teamarbeit und Auditspur.

## v0.37 · Phase 37 · Reale Integrationsschicht

- Connector-Wege arbeiten jetzt mit strukturierten Verträgen, Exchange Packages und kontrollierten Receipts.
- Integrationshistorie und letzter Receipt-Stand sind im Arbeitsbereich sichtbar.
- Ein zusätzlicher Adapter-/Vertragscheck ergänzt den Release-Kontext.

## v0.38 · Phase 38 · Sicherheit, Datenschutz und Deployment-Reife

- Neuer Bereich in Schritt 5 für Sicherheitsprofil, Datenklassifikation, Aufbewahrung, Deployment-Ziel und Verantwortlichkeiten.
- Security-Readiness wird lokal bewertet, exportiert und im Release-Kontext mitgeführt.
- Zusätzliche Dokumentation zu Sicherheit und Deployment ergänzt den Betriebsrahmen.

## v0.39 · Phase 39 · Pilotbetrieb 3.0 und formale Abnahme

- Neuer Bereich für formale Abnahme mit Entscheidung, Checkliste, Risiken, Enablement und exportierbarer Entscheidungsvorlage.
- Gemerkte Abnahmestände machen sichtbar, ob die formale Entscheidung noch zur aktuellen Analysebasis passt.
- Neuer lokaler Acceptance-Check (`npm run acceptance:check`) ergänzt den Release-Check und schließt den aktuellen Kernplan kontrolliert ab.

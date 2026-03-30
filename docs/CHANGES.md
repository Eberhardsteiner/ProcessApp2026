# Release-Stand

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

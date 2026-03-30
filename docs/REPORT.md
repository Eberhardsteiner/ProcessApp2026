# Prozess-Report

## Überblick

Der Prozess-Report bietet eine umfassende, druckbare Zusammenfassung eines erfassten Prozesses. Er fasst alle wichtigen Informationen auf einer Seite zusammen und kann als PDF gespeichert oder ausgedruckt werden.

## Funktionen

Der Report enthält folgende Abschnitte:

### 1. Prozessprofil
- Kategorie (Kern-, Unterstützungs-, Steuerungsprozess)
- Management-Ebene (Strategisch, Fachlich, Technisch)
- Hierarchie-Ebene (Landkarte, Hauptprozess, Unterprozess)

### 2. End-to-End Definition
- Trigger (Prozessauslöser)
- Kunde (Prozessempfänger)
- Outcome (erwartetes Ergebnis)
- Done-Kriterium (optional)

### 3. Happy Path
Tabellarische Darstellung aller Prozessschritte mit:
- Schrittnummer und Bezeichnung
- Zugeordnete Rolle
- Genutztes IT-System
- Arbeitstyp (Manuell, Benutzeraufgabe, Systemaufgabe, KI-unterstützt)
- Pain Point Hinweise
- Eingangsdaten (Data In)
- Ausgangsdaten (Data Out)

### 4. Entscheidungen
Alle erfassten Entscheidungspunkte mit:
- Position im Prozess (nach welchem Schritt)
- Entscheidungsfrage
- Gateway-Typ (XOR, AND, OR)
- Verzweigungen mit Bedingungen

### 5. Ausnahmen
Erfasste Ausnahmefälle mit:
- Typ der Ausnahme
- Bezugsschritt
- Beschreibung
- Handling-Strategie

### 6. KPIs
Kennzahlen zur Prozesssteuerung:
- Name
- Definition
- Einheit
- Zielwert

### 7. KI-Reife Signale
Falls erfasst:
- Standardisierung (low/medium/high)
- Datenverfügbarkeit
- Variabilität
- Compliance-Risiko

### 8. Maßnahmen-Backlog
Erfasste Verbesserungsmaßnahmen mit:
- Prioritäts-Score (berechnet aus Impact, Aufwand, Risiko)
- Status (Idee, Geplant, In Arbeit, Erledigt, Verworfen)
- Kategorie (Standardisierung, Digitalisierung, Automatisierung, KI-Einsatz, etc.)
- Titel der Maßnahme
- Scope (Prozess oder spezifischer Schritt)
- Verantwortlicher
- Fälligkeitsdatum

**Automatisierungs-Steckbrief**: Für Maßnahmen der Kategorien "Automatisierung" und "KI-Einsatz" wird optional ein technischer Steckbrief angezeigt mit:
- Umsetzungsansatz (z.B. Workflow, RPA, KI-Assistent)
- Zielgrad der Automatisierung (Assistiert, Teilautomatisiert, Vollautomatisiert)
- Human-in-the-Loop Status
- Anzahl beteiligter Systeme und Datenobjekte

Dieser Steckbrief konkretisiert die technische Umsetzung und unterstützt die Planung von Automatisierungsinitiativen.

Hinweis: Der Backlog ist versioniert und ermöglicht die Nachverfolgung des Verbesserungsfortschritts über verschiedene Prozessversionen hinweg.

### 9. Qualitätsbefunde
- Benennungshinweise (Naming Findings)
- Semantische Prüffragen

### 10. Assessment & Empfehlungen
Automatische Bewertung des Prozesses hinsichtlich:
- Digitalisierungsgrad
- Automatisierungspotenzial
- Konkreten Handlungsempfehlungen
- Nächsten Schritten

## Nutzung

### Report aufrufen
1. Öffnen Sie das Wizard Playground
2. Laden Sie einen Prozess mit mindestens einer Version
3. Wechseln Sie zum Tab "Report"

### Als Markdown exportieren
1. Klicken Sie auf den Button "Markdown herunterladen" oben im Report
2. Die Markdown-Datei wird automatisch heruntergeladen
3. Verwenden Sie die Datei für:
   - Wiki-Systeme (Confluence, GitHub Wiki, etc.)
   - Dokumentations-Repositories
   - Markdown-Editoren und Viewer
   - Versionskontrolle (Git)

**Dateiname-Format:** `Prozessname__report__001__20260211.md`

**Inhalt:** Vollständiger Report mit allen Abschnitten in Markdown-Format, inkl. Tabellen für Happy Path, KPIs und Maßnahmen-Backlog.

### Als HTML exportieren
1. Klicken Sie auf den Button "HTML herunterladen" oben im Report
2. Die HTML-Datei wird automatisch heruntergeladen
3. Öffnen Sie die Datei in einem beliebigen Browser
4. Die HTML-Datei ist:
   - Eigenständig (kein Internet erforderlich)
   - Druckfreundlich gestaltet
   - Mit integriertem CSS (kein Tailwind erforderlich)
   - Über Browser-Druck als PDF speicherbar

**Dateiname-Format:** `Prozessname__report__001__20260211.html`

**Vorteile:**
- Kann offline geöffnet werden
- Enthält einen "Drucken"-Button für PDF-Export
- Saubere Tabellenformatierung
- Professionelles Layout ohne externe Abhängigkeiten

### Als PDF speichern (über Browser-Druck)

**Option 1: Direkt im Report-Tab**
1. Klicken Sie auf den Button "Drucken / als PDF speichern" oben im Report
2. Im Browser-Druckdialog wählen Sie:
   - Ziel: "Als PDF speichern" (Chrome) oder ähnlich
   - Layout: Portrait (Hochformat) empfohlen
   - Seitenränder: Standard oder Minimal
3. Speichern Sie die PDF-Datei

**Option 2: Aus exportiertem HTML**
1. Laden Sie zuerst die HTML-Datei herunter
2. Öffnen Sie die HTML-Datei im Browser
3. Klicken Sie auf "Drucken / als PDF speichern" in der HTML-Datei
4. Speichern Sie als PDF

### Drucken
1. Klicken Sie auf "Drucken / als PDF speichern"
2. Wählen Sie Ihren Drucker aus
3. Passen Sie bei Bedarf die Druckeinstellungen an
4. Drucken Sie den Report

## Print-Optimierung

Der Report ist für den Druck optimiert:
- Navigation und Buttons werden automatisch ausgeblendet
- Weißer Hintergrund für optimale Lesbarkeit
- Saubere Tabellenformatierung
- Seitenumbrüche an sinnvollen Stellen

## Datenschutz

Alle Daten bleiben lokal auf Ihrem Gerät. Es werden keine Informationen an externe Server übermittelt.

- Der Report wird clientseitig im Browser generiert
- Markdown-Export erfolgt komplett offline
- HTML-Export erfolgt komplett offline
- Die exportierten Dateien enthalten nur Ihre Prozessdaten
- Kein Server-Zugriff, kein Internet erforderlich

## Hinweise

- Der Report basiert auf der aktuell geladenen Version
- Änderungen am Prozess erfordern ein erneutes Laden/Export des Reports
- Leere Abschnitte werden als "nicht erfasst" gekennzeichnet
- Für beste Ergebnisse sollten alle Wizard-Phasen durchlaufen sein
- **Markdown-Format** eignet sich ideal für Wikis und Versionskontrolle
- **HTML-Format** ist optimal für Offline-Ansicht und PDF-Druck
- Beide Export-Formate enthalten identische Informationen, nur die Darstellung unterscheidet sich

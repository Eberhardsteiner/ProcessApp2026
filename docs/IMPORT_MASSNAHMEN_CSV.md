# CSV-Import für Maßnahmen-Backlog

Diese Anleitung erklärt, wie Sie Maßnahmen aus CSV-Dateien in den Maßnahmen-Backlog importieren können.

## Empfohlener Workflow

1. **CSV-Vorlage exportieren**: Exportieren Sie zunächst bestehende Maßnahmen aus der App, um die korrekte Spaltenstruktur zu erhalten
2. **CSV bearbeiten**: Nutzen Sie die exportierte Datei als Vorlage und fügen Sie Ihre Maßnahmen hinzu
3. **CSV importieren**: Importieren Sie die bearbeitete Datei über den CSV-Import-Bereich im Maßnahmen-Tab
4. **Vorschau prüfen**: Überprüfen Sie die Vorschau und eventuelle Warnungen
5. **Import anwenden**: Wenden Sie den Import an, um die Maßnahmen in den Editor zu übernehmen
6. **Änderungen speichern**: Speichern Sie die Änderungen, um die importierten Maßnahmen dauerhaft zu übernehmen

## CSV-Struktur

### Pflichtfelder

- **Maßnahme**: Titel der Maßnahme (erforderlich)

### Optionale Felder

Die folgenden Felder sind optional und werden aus dem Export generiert:

- **Status**: Idee, Geplant, In Arbeit, Erledigt, Verworfen
- **Kategorie**: Standardisierung, Digitalisierung, Automatisierung, KI-Einsatz, Daten, Governance, Kundennutzen, Compliance, Messung/KPI
- **Scope**: Prozess oder Schritt
- **Schritt**: Schrittbezeichnung (nur relevant wenn Scope=Schritt)
- **Verantwortlich**: Name der verantwortlichen Person
- **Fällig am**: Fälligkeitsdatum im Format YYYY-MM-DD
- **Impact**: Niedrig, Mittel, Hoch
- **Effort**: Niedrig, Mittel, Hoch
- **Risiko**: Niedrig, Mittel, Hoch
- **Ansatz**: Workflow/Prozess-Engine, RPA (UI-Automatisierung), API-Integration, ERP/Standard-Konfiguration, Low-Code/Formular-App, KI-Assistent (Mitarbeiter unterstützt), KI: Dokumente/Extraktion, KI: Klassifikation/Entscheidungshilfe, Process Mining, Sonstiges
- **Zielgrad**: Assistiert, Teilautomatisiert, Vollautomatisiert (Straight-Through)
- **Human-in-the-loop**: Ja oder Nein
- **Systeme**: Komma-getrennte Liste von Systemnamen
- **Datenobjekte**: Komma-getrennte Liste von Datenobjektnamen
- **KPIs**: Komma-getrennte Liste von KPI-Namen
- **Kontrollen**: Komma-getrennte Liste von Kontrollen (Audit Trail, Freigabe/Approval, Monitoring, Datenschutz, Manuelles Fallback)
- **Beschreibung**: Detaillierte Beschreibung der Maßnahme
- **Erstellt am**: Erstellungsdatum (ISO-Format)
- **Aktualisiert am**: Aktualisierungsdatum (ISO-Format)

## Schritt-Mapping

Wenn **Scope** auf "Schritt" gesetzt ist, versucht der Import, die Maßnahme mit einem Schritt aus dem Happy Path zu verknüpfen:

1. **Direkte ID**: Wenn der Wert in der Spalte "Schritt" eine gültige Schritt-ID ist, wird diese verwendet
2. **Format "Order. Label"**: Wenn der Wert im Format "3. Angebot erstellen" ist:
   - Zuerst wird versucht, Order + Label zu matchen
   - Falls kein Match, wird nur nach Order gesucht
   - Falls kein Match, wird nur nach Label gesucht
3. **Nur Label**: Wenn nur ein Label angegeben ist, wird nach diesem gesucht (case-insensitive)

**Wichtig**: Wenn kein passender Schritt gefunden wird, wird die Maßnahme automatisch auf Scope "Prozess" gesetzt und eine Warnung angezeigt.

## Systeme, Datenobjekte und KPIs

Beim Import werden Systeme, Datenobjekte und KPIs anhand ihrer **Namen** (case-insensitive) zugeordnet:

- Wenn ein Name in der CSV nicht in der Prozessdefinition gefunden wird, wird er ignoriert
- Eine Warnung wird angezeigt, welche Namen nicht gefunden wurden
- Die IDs werden nicht direkt übernommen, sondern per Lookup ermittelt

## Import-Modi

### Anhängen
- Fügt die importierten Maßnahmen zu den bestehenden hinzu
- Bestehende Maßnahmen bleiben unverändert

### Ersetzen
- Überschreibt alle bestehenden Maßnahmen mit den importierten
- Erfordert eine Bestätigung, wenn bereits Maßnahmen vorhanden sind

## Standardwerte

Wenn Felder in der CSV fehlen oder nicht erkannt werden, verwendet der Import folgende Standardwerte:

- **Status**: Idee
- **Kategorie**: Automatisierung
- **Scope**: Prozess
- **Impact**: Mittel
- **Effort**: Mittel
- **Risiko**: Mittel
- **Ansatz** (wenn Blueprint-Felder vorhanden): Sonstiges
- **Zielgrad** (wenn Blueprint-Felder vorhanden): Teilautomatisiert
- **Human-in-the-loop** (wenn Blueprint-Felder vorhanden): Nein

## Hinweise

- Die CSV-Datei kann verschiedene Trennzeichen verwenden (`;`, `,`, Tab)
- Die erste Zeile kann eine `sep=;` Deklaration enthalten (wird automatisch erkannt)
- Spaltennamen sind case-insensitive und können Leerzeichen, Bindestriche oder Unterstriche enthalten
- Die ersten 15 Zeilen werden als Vorschau angezeigt
- Der Import arbeitet offline und benötigt keine Internetverbindung
- **Nach dem Import müssen Sie "Änderungen speichern" klicken**, sonst gehen die Änderungen verloren

## Warnungen

Der Import zeigt Warnungen an, wenn:

- Ein Schritt nicht gefunden werden konnte (Scope wird auf Prozess gesetzt)
- Ein System, Datenobjekt oder KPI nicht gefunden wurde (wird ignoriert)
- Ein Datumsformat ungültig ist (wird ignoriert)
- Ein Wert nicht erkannt wurde (Standardwert wird verwendet)

Diese Warnungen helfen Ihnen, Probleme in der CSV-Datei zu identifizieren und zu korrigieren.

## Beispiel-CSV

```csv
sep=;
Maßnahme;Status;Kategorie;Scope;Schritt;Verantwortlich;Fällig am;Impact;Effort;Risiko
Angebotsprozess automatisieren;Geplant;Automatisierung;Schritt;3. Angebot erstellen;Max Mustermann;2026-06-30;Hoch;Mittel;Niedrig
Datenqualität verbessern;Idee;Daten;Prozess;;Maria Schmidt;;Mittel;Niedrig;Mittel
```

## Troubleshooting

**Problem**: CSV wird nicht importiert
- Prüfen Sie, ob die "Maßnahme"-Spalte vorhanden ist
- Stellen Sie sicher, dass die Datei als .csv gespeichert ist

**Problem**: Schritte werden nicht zugeordnet
- Verwenden Sie das Format "Order. Label" (z.B. "3. Angebot erstellen")
- Prüfen Sie die Schreibweise des Labels
- Stellen Sie sicher, dass der Schritt im Happy Path existiert

**Problem**: Systeme/Datenobjekte/KPIs werden nicht importiert
- Prüfen Sie die Schreibweise der Namen (Groß-/Kleinschreibung wird ignoriert)
- Stellen Sie sicher, dass die Objekte im Prozess definiert sind
- Verwenden Sie Kommas zur Trennung bei mehreren Werten

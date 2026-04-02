# Prozessmodell Export & Import

## Übersicht

Die Export/Import-Funktionalität ermöglicht es, Prozessmodelle vollständig zu sichern und zwischen verschiedenen Systemen zu übertragen. Dies ist besonders nützlich für:

- **Offline-Backup**: Lokale Sicherung der Prozessmodelle außerhalb der Browser-Datenbank
- **Transfer zwischen Systemen**: Austausch von Prozessmodellen zwischen verschiedenen Installationen
- **Versionskontrolle**: Externe Archivierung verschiedener Entwicklungsstände
- **Kollaboration**: Weitergabe von Prozessmodellen an andere Teammitglieder

## Was wird exportiert?

### Prozessmodell-Bundle (process-bundle-v1)

Ein Prozessmodell-Bundle enthält:

- **Prozess-Metadaten**: Titel, Kategorie, Management- und Hierarchie-Ebene
- **Alle Versionen**: Kompletter Versionsverlauf mit allen Capture-Daten
- **Schema-Version**: Identifikation des Exportformats für sichere Imports
- **Export-Zeitstempel**: Datum und Uhrzeit des Exports

### Projekt-Bundle (project-bundle-v1)

Ein Projekt-Bundle enthält:

- **Projekt-Metadaten**: Name, Beschreibung, Zeitstempel
- **Alle Prozesse**: Sämtliche Prozesse des Projekts
- **Alle Versionen**: Kompletter Versionsverlauf aller Prozesse
- **Schema-Version**: Identifikation des Exportformats (`project-bundle-v1`)
- **Export-Zeitstempel**: Datum und Uhrzeit des Exports

## Export

### Projekt-Export

#### Voraussetzungen

- Ein Projekt muss im WizardPlayground ausgewählt sein
- Das Projekt sollte mindestens einen Prozess enthalten (optional, aber sinnvoll)

#### Export durchführen

1. Öffnen Sie den **WizardPlayground**
2. Wechseln Sie zum **Setup-Tab**
3. Wählen Sie in **Schritt 1** das gewünschte Projekt aus
4. Scrollen Sie zur Sektion **"Export (Backup/Transfer)"**
5. Klicken Sie auf **"Projekt als JSON exportieren"**
6. Die Datei wird automatisch heruntergeladen

#### Dateiformat

Die exportierte Datei folgt diesem Namensschema:

```
{Projektname}__project_bundle__{YYYY-MM-DD}.json
```

Beispiel:
```
Vertriebsprozesse_2024__project_bundle__2024-01-31.json
```

#### Bundle-Struktur (project-bundle-v1)

```json
{
  "schemaVersion": "project-bundle-v1",
  "exportedAt": "2024-01-31T10:30:00.000Z",
  "project": {
    "projectId": "...",
    "name": "Vertriebsprozesse 2024",
    "createdAt": "...",
    ...
  },
  "processes": [
    {
      "processId": "...",
      "projectId": "...",
      "title": "Auftragsabwicklung",
      "category": "kern",
      ...
    },
    ...
  ],
  "versions": [
    {
      "versionId": "...",
      "processId": "...",
      "status": "draft",
      "createdAt": "...",
      "sidecar": { ... },
      ...
    },
    ...
  ]
}
```

Das Projekt-Bundle enthält:
- Das vollständige Projekt mit allen Metadaten
- Alle Prozesse des Projekts
- Alle Versionen aller Prozesse (chronologisch sortiert)

### Prozessmodell-Export

#### Voraussetzungen

- Ein Prozess muss im WizardPlayground geladen sein
- Mindestens eine Version sollte existieren (optional, aber sinnvoll)

#### Export durchführen

1. Öffnen Sie den gewünschten Prozess im WizardPlayground
2. Wechseln Sie zum **Setup-Tab**
3. Scrollen Sie zur Sektion **"Export (Backup/Transfer)"**
4. Klicken Sie auf **"Prozessmodell als JSON exportieren"**
5. Die Datei wird automatisch heruntergeladen

#### Dateiformat

Die exportierte Datei folgt diesem Namensschema:

```
{Prozessname}__bundle__{YYYY-MM-DD}.json
```

Beispiel:
```
Auftragsabwicklung__bundle__2024-01-31.json
```

#### Bundle-Struktur (process-bundle-v1)

```json
{
  "schemaVersion": "process-bundle-v1",
  "exportedAt": "2024-01-31T10:30:00.000Z",
  "process": {
    "processId": "...",
    "title": "Auftragsabwicklung",
    "category": "kern",
    "managementLevel": "fachlich",
    "hierarchyLevel": "hauptprozess",
    ...
  },
  "versions": [
    {
      "versionId": "...",
      "processId": "...",
      "status": "draft",
      "createdAt": "...",
      "sidecar": { ... },
      ...
    },
    ...
  ]
}
```

## Import

### Projekt-Import

#### Voraussetzungen

- Eine gültige **JSON-Bundle-Datei** im Format `project-bundle-v1`
- Kein bestehendes Projekt erforderlich (Import erstellt automatisch ein neues Projekt)

#### Import durchführen

1. **WizardPlayground öffnen**
   - Navigieren Sie zum WizardPlayground
   - Wechseln Sie zum **Setup-Tab**

2. **JSON-Datei auswählen**
   - Scrollen Sie zur Sektion **"Projekt-Import (Backup/Transfer)"**
   - Klicken Sie auf **"JSON-Datei auswählen"**
   - Wählen Sie Ihre exportierte Projekt-Bundle-Datei aus

3. **Preview prüfen**
   - Nach Auswahl der Datei erscheint eine **Preview** mit:
     - Dateiname
     - Schema-Version (`project-bundle-v1`)
     - Export-Zeitstempel
     - Projektname
     - Anzahl der Prozesse
     - Anzahl der Versionen (gesamt über alle Prozesse)
   - Prüfen Sie die angezeigten Informationen

4. **Import starten**
   - Klicken Sie auf **"Projekt-Bundle importieren (neues Projekt)"**
   - Der Import wird durchgeführt
   - Bei Erfolg wird das neue Projekt **automatisch ausgewählt**
   - Sie verbleiben im **Setup-Tab**

5. **Hinweise beachten**
   - Nach dem Import werden ggf. **Warnungen** angezeigt
   - Diese informieren über:
     - Namenskonflikte (bei gleichem Projektnamen wird "(Import YYYY-MM-DD)" angehängt)
     - Hierarchie-Wiederherstellung (parentProcessId)
     - BPMN-XML aus dem Quellsystem (ggf. neu generieren)
     - Fehlende Daten, die automatisch ergänzt wurden

6. **Importierte Daten ansehen**
   - Wechseln Sie zur **Prozesslandkarte**
   - Das importierte Projekt erscheint in der Liste
   - Alle Prozesse sind sofort verfügbar

#### Import-Verhalten

##### Neues Projekt wird angelegt

**Wichtig**: Der Import überschreibt **NIEMALS** bestehende Daten. Es wird **IMMER** ein neues Projekt mit neuer Projekt-ID angelegt.

- Alle Prozesse aus dem Bundle werden importiert (mit neuen Process-IDs)
- Alle Versionen werden den neuen Prozessen zugeordnet
- Die Versionshistorie bleibt vollständig erhalten
- Das neue Projekt ist sofort nutzbar

##### Namenskonflikte

Wenn bereits ein Projekt mit gleichem Namen existiert:

- Das importierte Projekt erhält automatisch den Zusatz `(Import YYYY-MM-DD)`
- Beispiel: `Vertriebsprozesse 2024 (Import 2024-01-31)`
- Eine Warnung informiert über die Umbenennung

##### Hierarchie-Wiederherstellung

Die Import-Funktion versucht, Prozess-Hierarchien (parentProcessId) wiederherzustellen:

- **Zweipassige Verarbeitung**: Erst werden alle Prozesse angelegt, dann wird die Hierarchie rekonstruiert
- **ID-Mapping**: Alte Process-IDs werden auf neue gemappt
- **Partielle Wiederherstellung**: Wenn ein Parent-Prozess fehlt, wird eine Warnung ausgegeben und die Verbindung entfernt
- **Vollständige Bundles**: Bei konsistenten Exporten bleibt die Hierarchie vollständig erhalten

##### BPMN-XML

Wenn Versionen BPMN-XML enthalten:

- Das XML wird vollständig übernommen
- **Hinweis**: IDs im BPMN-XML stammen aus dem Quellsystem
- **Empfehlung**: Bei Bedarf BPMN neu generieren (Review-Tab → "BPMN generieren")

##### Validierung

Die Import-Funktion validiert:

- **Schema-Version**: Muss `project-bundle-v1` sein
- **JSON-Format**: Muss valides JSON sein
- **Projekt-Struktur**: Name muss vorhanden sein
- **Prozesse-Array**: Muss ein Array sein (kann leer sein)
- **Versionen-Array**: Muss ein Array sein (kann leer sein)

Bei ungültigen Dateien wird eine Fehlermeldung angezeigt und der Import abgebrochen.

### Prozessmodell-Import

#### Voraussetzungen

Für den Import eines Prozessmodell-Bundles benötigen Sie:

- Ein **Zielprojekt** muss existieren
  - Erstellen Sie ein Projekt im WizardPlayground (Setup-Tab, Schritt 1)
  - Oder nutzen Sie ein bestehendes Projekt aus der Prozesslandkarte
- Eine gültige **JSON-Bundle-Datei** im Format `process-bundle-v1`

### Import durchführen

1. **WizardPlayground öffnen**
   - Navigieren Sie zum WizardPlayground
   - Wechseln Sie zum **Setup-Tab**

2. **Zielprojekt auswählen**
   - Erstellen Sie ein neues Projekt (Schritt 1) oder
   - Stellen Sie sicher, dass ein Projekt-ID bereits geladen ist

3. **JSON-Datei auswählen**
   - Scrollen Sie zur Sektion **"Import (Backup/Transfer)"**
   - Klicken Sie auf **"JSON-Datei auswählen"**
   - Wählen Sie Ihre exportierte Bundle-Datei aus

4. **Preview prüfen**
   - Nach Auswahl der Datei erscheint eine **Preview** mit:
     - Dateiname
     - Schema-Version
     - Export-Zeitstempel
     - Prozess-Metadaten (Titel, Kategorie, etc.)
     - Anzahl der Versionen
   - Prüfen Sie die angezeigten Informationen

5. **Import starten**
   - Klicken Sie auf **"Bundle importieren (neuer Prozess)"**
   - Der Import wird durchgeführt
   - Bei Erfolg wird der neue Prozess **automatisch geladen**
   - Sie werden zum **Wizard-Tab** weitergeleitet

6. **Hinweise beachten**
   - Nach dem Import werden ggf. **Warnungen** angezeigt
   - Diese informieren über:
     - Titelkonflikte (bei gleichem Namen wird "(Import YYYY-MM-DD)" angehängt)
     - BPMN-XML aus dem Quellsystem (ggf. neu generieren)
     - Fehlende Daten, die automatisch ergänzt wurden

### Import-Verhalten

#### Neuer Prozess wird angelegt

**Wichtig**: Der Import überschreibt **NIEMALS** bestehende Daten. Es wird **IMMER** ein neuer Prozess mit neuer Process-ID angelegt.

- Alle Versionen aus dem Bundle werden importiert
- Die Versionshistorie bleibt vollständig erhalten
- Der neue Prozess ist sofort nutzbar

#### Titelkonflikte

Wenn im Zielprojekt bereits ein Prozess mit gleichem Titel existiert:

- Der importierte Prozess erhält automatisch den Zusatz `(Import YYYY-MM-DD)`
- Beispiel: `Auftragsabwicklung (Import 2024-01-31)`
- Eine Warnung informiert über die Umbenennung

#### BPMN-XML

Wenn das Bundle BPMN-XML enthält:

- Das XML wird vollständig übernommen
- **Hinweis**: IDs im BPMN-XML stammen aus dem Quellsystem
- **Empfehlung**: Bei Bedarf BPMN neu generieren (Review-Tab → "BPMN generieren")

#### Leere Bundles

Wenn das Bundle keine Versionen enthält:

- Es wird automatisch eine leere **Draft-Version** angelegt
- Der Prozess kann sofort im Wizard bearbeitet werden
- Eine Warnung informiert über die fehlenden Versionen

### Validierung

Die Import-Funktion validiert:

- **Schema-Version**: Muss `process-bundle-v1` sein
- **JSON-Format**: Muss valides JSON sein
- **Prozess-Struktur**: Titel und Metadaten müssen vorhanden sein
- **Versionen-Array**: Muss ein Array sein (kann leer sein)

Bei ungültigen Dateien wird eine Fehlermeldung angezeigt und der Import abgebrochen.

## Datensicherheit

### Lokale Speicherung

- Alle Daten werden **ausschließlich lokal** in IndexedDB gespeichert
- Keine Cloud-Synchronisation
- Keine automatischen Backups
- Export-Dateien verbleiben auf Ihrem lokalen System

### Empfehlungen

1. **Regelmäßige Exports**: Erstellen Sie vor größeren Änderungen einen Export
2. **Sichere Aufbewahrung**: Speichern Sie wichtige Bundles an einem sicheren Ort
3. **Versionierung**: Nutzen Sie das Datum im Dateinamen zur Nachvollziehbarkeit
4. **Prüfung**: Öffnen Sie Export-Dateien gelegentlich zur Sicherstellung der Integrität

## Technische Details

### Schema-Version

Die aktuelle Schema-Version ist `process-bundle-v1`. Diese Version wird bei jedem Export gespeichert und ermöglicht beim Import die Validierung und ggf. Migration auf neuere Formate.

### Versionsreihenfolge

Versionen werden im Export chronologisch sortiert (älteste zuerst), um eine nachvollziehbare Historie zu gewährleisten.

### Format

- JSON mit Einrückung (2 Leerzeichen) für bessere Lesbarkeit
- UTF-8 Encoding
- Valides JSON nach RFC 8259

## Troubleshooting

### Export schlägt fehl

- **Problem**: "Kein Prozess geladen"
  - **Lösung**: Öffnen Sie einen Prozess aus der Prozesslandkarte

- **Problem**: "Prozess nicht gefunden"
  - **Lösung**: Der Prozess existiert nicht mehr in der Datenbank

### Datei wird nicht heruntergeladen

- Überprüfen Sie die Browser-Einstellungen für Downloads
- Stellen Sie sicher, dass Pop-ups nicht blockiert werden
- Prüfen Sie den verfügbaren Speicherplatz

## Zukünftige Erweiterungen

- Selektiver Import einzelner Versionen
- Merge-Funktionalität für Versionskonflikte
- Vergleich zwischen exportierten Bundles
- Inkrementeller Import (nur neue/geänderte Versionen)

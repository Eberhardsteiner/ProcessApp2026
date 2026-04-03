# Evidence (Quellennachweis)

## Überblick

Evidence (Quellennachweise) erhöhen das Vertrauen in erfasste Prozessdaten durch Nachvollziehbarkeit und Transparenz. Sie dokumentieren die Herkunft von Informationen und ermöglichen es, bei Rückfragen oder Diskussionen auf konkrete Quellen zurückzugreifen.

## Warum Evidence?

**Vertrauen und Akzeptanz:**
- Stakeholder können nachvollziehen, woher Prozess-Informationen stammen
- Besonders wichtig bei Freigabeprozessen und Management-Reviews
- Reduziert Diskussionen über "Wer hat das gesagt?" oder "Wo steht das?"

**Qualitätssicherung:**
- Workshop-Teilnehmer können ihre Aussagen später verifizieren
- Ermöglicht Korrektur von Missverständnissen oder Ungenauigkeiten
- Unterstützt iterative Verfeinerung von Prozessdokumentationen

**Wissensmanagement:**
- Dokumentiert implizites Wissen aus Workshops und Interviews
- Bewahrt Kontext, der sonst verloren gehen würde
- Erleichtert Einarbeitung neuer Teammitglieder

**Compliance und Audit:**
- Nachweisbare Dokumentation für regulierte Bereiche
- Audit Trail für Prozess-Governance
- Transparenz bei Änderungen und deren Begründung

## Datenmodell

### EvidenceRef

Jede Evidence-Referenz hat folgende Struktur:

```typescript
interface EvidenceRef {
  type: EvidenceType;        // 'text' | 'audio'
  refId?: string;            // später: attachment id / transcript id / file id
  snippet?: string;          // für text-evidence: kurzer Auszug
  startMs?: number;          // später für audio: Start-Zeitmarke
  endMs?: number;            // später für audio: End-Zeitmarke
  speaker?: string;          // später für diarization: Sprecher-ID
}
```

### Integration in CaptureDraftStep

Jeder Schritt im Happy Path kann optional ein Array von Evidence-Referenzen haben:

```typescript
interface CaptureDraftStep {
  stepId: string;
  order: number;
  label: string;
  // ... andere Felder
  evidence?: EvidenceRef[];
}
```

Das Array ermöglicht mehrere Quellen pro Schritt (z.B. mehrere Workshop-Zitate oder Audio-Clips).

## Phase F3-1: Text-Snippets (MVP)

In der ersten Ausbaustufe ist Evidence rein textbasiert:

**Verfügbar:**
- `type: 'text'`
- `snippet`: Freier Text (z.B. Zitat aus Workshop, Notiz, Verweis auf Dokument)

**Noch nicht verfügbar:**
- Audio-Evidence mit Zeitmarken
- Speaker-Zuordnung (Diarization)
- Verknüpfung mit Attachments-Store
- Automatische Evidence-Erzeugung aus KI-Tab

**Nutzung:**
1. Im Draft-Tab, Schritt-Details Tabelle
2. Spalte "Quelle (Snippet)" pro Schritt
3. Textarea für kurze Notizen oder Zitate
4. Button "Quelle anzeigen" öffnet Modal mit lesbarer Ansicht
5. Speichern über bestehenden "Schritt-Details speichern" Button

**Best Practices:**
- Kurze, prägnante Zitate verwenden (1-3 Sätze)
- Bei längeren Quellen: Verweis auf externes Dokument + Seitenzahl
- Format: "Workshop 2024-01-15: 'Schritt dauert ca. 2 Stunden wegen manueller Prüfung'"
- Bei mehreren Teilnehmern: "Max Müller (Workshop): '...'"

## Zukünftige Erweiterungen

### Phase F3-2: Evidence für Decisions und Exceptions

**Status: Verfügbar**

Erweiterung des Evidence-Modells auf:
- `CaptureDraftDecision.evidence?: EvidenceRef[]`
- `CaptureDraftException.evidence?: EvidenceRef[]`

**Nutzung:**
- Im Draft-Tab, Entscheidungen-Editor: Feld "Quelle (Snippet)" unterhalb der Frage
- Im Draft-Tab, Ausnahmen-Editor: Feld "Quelle (Snippet)" unterhalb des Handlings
- Button "Quelle anzeigen" öffnet Modal mit lesbarer Ansicht
- Snippet ist optional, kann leer bleiben
- Speichern über bestehende "Entscheidungen speichern" / "Ausnahmen speichern" Buttons

**Nutzen:**
- Nachvollziehbarkeit auch für Entscheidungspunkte und Ausnahmen
- Wichtig für Freigabeprozesse und Workshop-Nachbereitung
- Dokumentiert Begründungen und Diskussionsergebnisse
- Aktuell nur Text-Snippets (wie bei Happy-Path Steps)

### Phase F3-3: Audio-Evidence

**Audio-Zeitmarken:**
- `startMs` / `endMs`: Präzise Verknüpfung mit Audio-Aufnahmen
- Ermöglicht direktes Abspielen relevanter Workshop-Abschnitte
- Unterstützt Review und Freigabeprozesse

**Speaker-Zuordnung:**
- `speaker`: Identifikation wer etwas gesagt hat
- Wichtig für Verantwortlichkeit und Rückfragen
- Privacy-Hinweis: Pseudonymisierung möglich (z.B. "Speaker A")

### Phase F3-4: Attachments-Store

**Zentrale Datei-Verwaltung:**
- `refId`: Verknüpfung mit Attachments in IndexedDB
- Unterstützt: PDFs, Bilder, Audio-Files, Videos
- Versionierung von Anhängen
- Export/Import mit Process Bundle

### Phase F3-5: Automatische Evidence-Erzeugung

**Status: Verfügbar (F3-5A)**

**KI-gestützte Evidence:**
- Beim Import über KI-Tab: Claude kann optional `evidenceSnippet` pro Schritt liefern
- Import-Logik übernimmt evidenceSnippet automatisch als Text-Evidence in den Draft
- Nutzer kann Snippets im Draft prüfen und anpassen
- Snippets werden normalisiert und auf max. 240 Zeichen begrenzt
- Bei Duplikaten oder mehr als 2 Evidence-Einträgen pro Schritt werden ältere verworfen

**Nutzung:**
- Claude Prompt enthält Anforderung für `evidenceSnippet` pro Schritt (max. 180 Zeichen im Prompt)
- Nach Import erscheint Evidence bei "Quelle (Snippet)" in Schritt-Details
- Keine personenbezogenen Daten (Claude-Prompt enthält entsprechende Anweisung)
- Aktuell nur Text-Snippets, keine Audio-Evidence
- **Phase F3-5B:** Claude kann optional auch `evidenceSnippet` in decisions und exceptions liefern
- Import übernimmt Snippets automatisch in decision.evidence / exception.evidence
- Nutzen: Nachvollziehbarkeit auch für Entscheidungspunkte und Ausnahmen in Workshops/Freigaben

**Zukünftig:**
- Confidence-Score für automatisch erzeugte Evidence
- Evidence-Vorschläge basierend auf Transkripten

## Technische Details

### Speicherung

Evidence wird direkt in der ProcessVersion gespeichert:
- Pfad: `version.sidecar.captureDraft.happyPath[i].evidence`
- Keine separate Datenhaltung erforderlich
- Export/Import funktioniert automatisch über Process Bundle

### Datengröße

**Text-Snippets (F3-1):**
- Empfohlene Länge: 50-500 Zeichen
- Maximum (soft): 2000 Zeichen
- Bei längeren Texten: Externes Dokument referenzieren

**Audio-Referenzen (F3-3+):**
- Speichern nur Metadaten (refId, Zeitmarken, Speaker)
- Eigentliche Audio-Dateien in Attachments-Store
- Kein direktes Embedding großer Binärdaten

### Datenschutz

**Hinweise für Audio-Evidence:**
- Workshop-Teilnehmer über Aufzeichnung informieren
- Einwilligung einholen gemäß DSGVO
- Option für Pseudonymisierung von Sprechern
- Möglichkeit zum Löschen von Evidence auf Anfrage

**Best Practice:**
- In F3-1: Text-Snippets anonymisieren wenn nötig
- Keine personenbezogenen Daten ohne Einwilligung
- Bei internen Workshops: Betriebsvereinbarung prüfen

## Grenzen

**Evidence ist nicht:**
- Vollständige Transkripte (nur Ausschnitte/Verweise)
- Ersatz für Prozessdokumentation (nur Ergänzung)
- Verpflichtend (optional für alle Schritte)

**Evidence sollte sein:**
- Fokussiert auf kritische/strittige Punkte
- Leicht nachvollziehbar
- Aktuell gehalten (bei Änderungen aktualisieren)

## Beispiele

### Text-Snippet für Happy-Path Schritt

```
Schritt: "Rechnung prüfen"
Evidence:
  type: 'text'
  snippet: 'Workshop 2024-01-15, Sarah (Buchhaltung): "Prüfung dauert 5-10 Min,
            außer bei Beträgen >10k EUR, dann zusätzliche Freigabe nötig"'
```

### Zukünftig: Audio-Evidence

```
Schritt: "Genehmigung einholen"
Evidence:
  type: 'audio'
  refId: 'attachment_abc123'
  startMs: 125000
  endMs: 145000
  speaker: 'Thomas (Abteilungsleiter)'
  snippet: 'Genehmigung erfolgt per E-Mail, bei Dringlichkeit auch telefonisch'
```

## Integration mit anderen Features

**Assessment:**
- Evidence kann Assessment-Qualität verbessern (bessere Datengrundlage)
- Hinweise auf manuelle Schritte werden durch Zitate belegt

**Improvement Backlog:**
- Maßnahmen können auf Evidence verweisen
- "Begründung aus Workshop XY" als Kontext

**Report Export:**
- Evidence wird im Report-Export (HTML/Markdown) im separaten Abschnitt "Quellen (Evidence)" ausgegeben
- Darstellung getrennt nach Happy Path, Entscheidungen und Ausnahmen
- Aktuell nur Text-Snippets (type='text')
- Wenn keine Evidence vorhanden: "Keine Quellen erfasst"
- Mehrzeilige Snippets werden als Blockquote formatiert für bessere Lesbarkeit
- Audio-Evidence und Attachments-Referenzen kommen in späteren Phasen

**BPMN Export:**
- Evidence wird (noch) nicht in BPMN exportiert
- Bleibt in ProcessVersion für interne Dokumentation

**Workshop Protocol:**
- Evidence könnte in Zukunft im Protokoll angezeigt werden
- Ermöglicht Nachvollziehbarkeit für Teilnehmer

## Zusammenfassung

**Verfügbar:**
- F3-1: Text-basierte Evidence für Happy-Path Schritte
- F3-2: Evidence für Decisions/Exceptions
- E3-3: Evidence im Report-Export (HTML/Markdown) sichtbar
- F3-5A: Automatische Evidence-Erzeugung aus KI-Import

**Erfassung:**
- Einfache Erfassung über Schritt-Details, Entscheidungen und Ausnahmen
- Modal zur besseren Lesbarkeit in Editoren
- Optional für alle Elemente
- Automatische Übernahme aus Claude AI-Import (evidenceSnippet)

**Export:**
- Separater Abschnitt "Quellen (Evidence)" im Report
- Strukturiert nach Happy Path, Entscheidungen, Ausnahmen
- Blockquote-Formatierung für mehrzeilige Snippets

**Nächste Schritte:**
- F3-3: Audio mit Zeitmarken und Speaker
- F3-4: Attachments-Store für Dateien
- F3-5B: Confidence-Score und erweiterte KI-Vorschläge

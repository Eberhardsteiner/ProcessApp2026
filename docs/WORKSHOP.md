# Workshop-Kurzprotokoll

## Zweck

Das Workshop-Kurzprotokoll bietet eine druckfreundliche Zusammenfassung der wichtigsten Prozessverbesserungsmaßnahmen, die im Maßnahmen-Backlog erfasst wurden. Es dient als Diskussionsgrundlage und Protokoll für Prozess-Workshops.

## Inhalte

Das Workshop-Protokoll gliedert sich in vier Hauptbereiche:

### 1. Top-Maßnahmen (offen)

- Zeigt die wichtigsten offenen Verbesserungsmaßnahmen, sortiert nach Prioritätsscore
- Prioritätsscore berechnet sich aus: `(Impact × 2) - Effort - Risk`
- Begrenzt auf maximal 10 Maßnahmen für bessere Übersichtlichkeit
- Enthält: Priorität, Titel, Kategorie, Scope, Verantwortlicher, Fälligkeit, Risiko

### 2. Verantwortliche

- Gruppierung aller offenen Maßnahmen nach Owner (Verantwortlichem)
- Pro Owner: Liste der zugeordneten Maßnahmen mit Priorität und Fälligkeit
- Maßnahmen ohne Owner werden am Ende unter "(nicht zugeordnet)" aufgeführt
- Sortierung: Alphabetisch, innerhalb der Owner nach Priorität

### 3. Fälligkeiten

- Übersicht aller offenen Maßnahmen mit Fälligkeitsdatum
- Chronologisch sortiert (nächste Fälligkeit zuerst)
- Maximal 10 Einträge
- Hilfreich für zeitkritische Planung und Nachverfolgung

### 4. Risiken

- Fokus auf Hochrisiko-Maßnahmen (risk=high) und Compliance-relevante Items
- Sortierung nach Risikostufe, dann nach Prioritätsscore
- Maximal 10 Einträge
- Hilft bei Identifikation kritischer Punkte, die besondere Aufmerksamkeit erfordern

## Nutzung

1. **Maßnahmen erfassen**: Im Tab "Maßnahmen" alle relevanten Verbesserungsideen dokumentieren
2. **Felder ausfüllen**: Besonders wichtig sind Owner, Fälligkeit (dueDate), Impact, Effort und Risk
3. **Workshop-Tab öffnen**: Hier erscheint die automatisch generierte Übersicht
4. **Drucken/PDF**: Button "Drucken / als PDF speichern" nutzen
   - Der Button ist auf dem Ausdruck nicht sichtbar (no-print)
   - PDF-Export über Browser-Druckfunktion ("Als PDF speichern")

## Vorteile

- **Druckfreundlich**: Seitenumbrüche an sinnvollen Stellen
- **Fokussiert**: Zeigt nur offene Items (Status ≠ done/discarded)
- **Automatisch sortiert**: Nach Priorität, Fälligkeit und Risiko
- **Keine doppelte Eingabe**: Nutzt bestehende Backlog-Daten
- **Workshop-ready**: Kompaktes Format für Besprechungen

## Hinweise

- Das Protokoll ist nur so gut wie die erfassten Daten im Backlog
- Status "done" und "discarded" werden automatisch ausgeblendet
- Die Prioritätseinstufung basiert auf Impact, Effort und Risk
- Fehlende Daten (z.B. kein Owner) werden mit "-" oder "(nicht zugeordnet)" dargestellt
- Bei leeren Backlogs erscheinen entsprechende Hinweistexte

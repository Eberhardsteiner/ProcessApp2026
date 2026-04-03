# XES Import

## Überblick

Der XES-Import erlaubt das direkte Einlesen von IEEE XES-Dateien (.xes) im Mining-Tab.
Die Datei wird lokal im Browser geparst – es werden keine externen Aufrufe gemacht.

## Was wird importiert?

| XES-Element       | Ziel                          |
|--------------------|-------------------------------|
| `<trace>`          | Case (caseId)                 |
| `concept:name` (Trace) | caseId                    |
| `<event>`          | EventLogEvent                 |
| `concept:name` (Event) | activity                  |
| `time:timestamp`   | timestamp                     |
| `org:resource`     | resource (optional)           |
| Sonstige Attribute | attributes (Record)           |

## Attribut-Normalisierung

- Alle Attribut-Keys werden `trim()` + `toLowerCase()` normalisiert.
- Trace-Attribute werden als Basis übernommen und von Event-Attributen überschrieben.
- Standard-Keys (`concept:name`, `time:timestamp`, `org:resource`) werden nicht in `attributes` dupliziert.

## timeMode – nur `real` zulässig

Process Mining darf ausschließlich auf realen Event Logs beruhen. Der Import setzt `timeMode='real'` nur,
wenn alle Events gültige, parsbare Timestamps enthalten. Fehlen Timestamps oder sind sie nicht parsbar,
wird der Import mit einem Fehler blockiert – keine stillen Fallbacks auf deterministische Reihenfolgen.

Ein XES-Log-Attribut `timeMode=synthetic` wird **nicht** akzeptiert: der Import bricht mit einer klaren
Fehlermeldung ab. Synthetische Timestamps sind für Process Mining unzulässig.

## Limitierungen

- **Nested Attributes** (`<list>`, `<container>`) werden ignoriert. Ein Hinweis wird angezeigt.
- **Max. Events**: 200.000 (Standard). Wird die Grenze erreicht, wird der Import **blockiert** (kein
  stilles Abschneiden). Filtern Sie das Log vor dem Import auf den gewünschten Zeitraum.
- **Keys**: Nur `string`, `date`, `int`, `float`, `boolean` Attribute werden gelesen (Wert immer als String).
- Kein vollständiges XES Feature-Set (Extensions, Global Scopes, Classifiers werden ignoriert).

## Ablauf

1. Datei auswählen (.xes / .xml)
2. Parser liest XML via DOMParser
3. Traces und Events werden extrahiert
4. Normalisierung über `normalizeAiEventLogToProcessMining` (gleicher Pfad wie KI-Import)
5. `processMining` wird gesetzt inkl. `activityMappings` via `buildActivityStats`
6. Segment-Filter kann danach auf importierte Attribute zugreifen

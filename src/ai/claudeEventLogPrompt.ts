export function buildClaudeEventLogPrompt(params: {
  sourceLabel: string;
  sourceText: string;
  guidance?: 'strict' | 'balanced';
  maxSourceChars?: number;
}): { prompt: string; warnings: string[] } {
  const defaultMax = 250000;
  const configured = params.maxSourceChars ?? defaultMax;
  const maxSourceChars = configured <= 0 ? null : configured;
  const warnings: string[] = [];

  let sourceText = params.sourceText;
  if (maxSourceChars !== null && sourceText.length > maxSourceChars) {
    sourceText = sourceText.slice(0, maxSourceChars);
    warnings.push(`Quelltext für die KI-Abfrage auf ${maxSourceChars.toLocaleString('de-DE')} Zeichen begrenzt.`);
  } else if (maxSourceChars === null && sourceText.length > defaultMax) {
    warnings.push(
      `Hinweis: Quelltext hat ${sourceText.length.toLocaleString('de-DE')} Zeichen. Ohne Kürzung kann das je nach KI-Kontextlimit fehlschlagen.`
    );
  }

  const prompt = `Du bist ein Experte für Process Mining. Extrahiere aus dem folgenden Quelltext ein Event Log für Process Mining.

AUSGABE: Antworte NUR mit einem JSON-Objekt (keine Erklärungen, kein Markdown außer dem JSON-Block).

JSON-Schema:
{
  "schemaVersion": "ai-event-log-v1",
  "language": "de",
  "timeMode": "real",
  "events": [
    {
      "caseId": "string (Ticket-Nr / Fall-ID / Vorgangsnummer DIREKT AUS DEM QUELLTEXT – KEINE generierten IDs)",
      "activity": "string (kurzer Schrittname: Verb + Objekt, z.B. 'Antrag prüfen')",
      "timestamp": "string (ISO 8601, PFLICHTFELD – nur echte Zeitstempel aus dem Quelltext)",
      "resource": "string (optional: Person/Rolle/System)",
      "attributes": { "priority": "high", "channel": "email", "org_unit": "..." }
    }
  ],
  "notes": ["optionale Hinweise"],
  "warnings": ["optionale Warnungen"]
}

VERBINDLICHE REGELN – Verstöße führen zur Ablehnung des gesamten Payloads:
1. KEINE Halluzination: Erfinde keine Daten, die nicht explizit im Quelltext stehen.
2. timeMode ist immer "real". Synthetische oder abgeleitete Zeitstempel sind NICHT erlaubt.
3. timestamp ist PFLICHTFELD für jedes einzelne Event.
   - Nur echte, im Quelltext direkt angegebene Zeitstempel verwenden (ISO 8601).
   - Wenn auch nur ein einziges Event keinen echten Zeitstempel hat: events=[] zurückgeben und eine Warning setzen:
     "Event Log abgelehnt: Nicht alle Events haben echte Zeitstempel – kein partielles Log wird akzeptiert."
   - Kein selektives Weglassen einzelner Events: entweder ALLE Events sind vollständig oder das gesamte Payload wird abgelehnt.
4. caseId ist PFLICHTFELD für jedes einzelne Event.
   - Nur Ticket-Nummern, Fall-IDs oder Vorgangsnummern verwenden, die DIREKT im Quelltext stehen.
   - KEINE generierten oder erfundenen IDs (z.B. CASE-1, CASE-2, ID-001 oder ähnliche Muster).
   - Wenn auch nur ein einziges Event keine identifizierbare echte Fall-ID hat: events=[] zurückgeben und eine Warning setzen:
     "Event Log abgelehnt: Nicht alle Events haben identifizierbare Fall-IDs – kein partielles Log wird akzeptiert."
   - Kein selektives Weglassen einzelner Events: entweder ALLE Events sind vollständig oder das gesamte Payload wird abgelehnt.
5. activity ist PFLICHTFELD für jedes Event. Kurzer, prägnanter Schrittname (Verb + Objekt). Konsistent für gleiche Tätigkeiten.
6. Kein Sampling, keine Verdichtung, keine repräsentative Auswahl: Entweder ALLE Events sind vollständig gültig (caseId, activity, timestamp vorhanden und echt) und werden zurückgegeben – oder das gesamte Payload wird abgelehnt (events=[]). Kein partielles Log.
7. resource: Person, Rolle oder System, falls im Text erkennbar.
8. attributes (optional): Wenn im Text erkennbare Event- oder Case-Attribute vorkommen (z.B. Priorität, Kanal, Standort, Produkt, Mandant, Kategorie), dann als key/value in attributes aufnehmen. Keys kurz und stabil halten (empfohlen: lowercase, z.B. "priority", "channel", "org_unit"). Max. 20 Keys pro Event.
9. Quelle: "${params.sourceLabel}"

INPUT:
${sourceText}`;

  return { prompt, warnings };
}

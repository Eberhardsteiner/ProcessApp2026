export const ACTIVITY_VERB_RE = /\b(pr[üu]f|erfass|anleg|bearbeit|freigeb|versend|validier|abschlie[ßs]|weiterleit|dokumentier|informier|eskalier|zuordn|bewert|bestell|übernehm|uebernehm|start|beend|genehmig|ablehn|aktualisier|abgleich|klär|klaer|mapp|merge|split|import|export|review|approve|reject|create|update|close|open|assign|submit)\w*/i;
const ACTIVITY_NOUN_RE = /\b(reklamationseingang|eingang|pr[üu]fung|priorisierung|priorit[äa]t|bewertung|r[üu]ckmeldung|freigabe|zugang|konto|antrag|wechsel|abschluss|dokumentation|sofortma[ßs]nahme|klassifizierung|kl[äa]rung|meldung|profilierung|gastkonto|netzlaufwerke|nachhalten|stammdatenkorrektur|gutschrift|storno|kulanz)\b/i;
export const ROLE_HINT_RE = /\b(team|abteilung|bereich|fachbereich|rolle|owner|zust[äa]ndig|verantwort|bearbeiter|sachbearbeiter|koordinator|manager|leitung|controller|buchhaltung|einkauf|vertrieb|hr|it|service|kunde|lieferant)\b/i;
export const PERSON_HINT_RE = /\b[a-z][a-z]+\.[a-z]+\b|[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+/;
export const SYSTEM_HINT_RE = /\b(system|tool|app|application|plattform|portal|workflow|crm|erp|sap|jira|servicenow|excel|outlook|mail|dms|mdm|srm|iam|ad|vpn|identity|cad|service desk|client mgmt|serviceportal|hr-system)\b/i;
export const STATUS_HINT_RE = /\b(open|offen|geschlossen|closed|done|fertig|pending|wartend|waiting|blocked|blockiert|fehler|error|neu|new|in bearbeitung|bearbeitung|erledigt|aktiv|inactive|abgelehnt|genehmigt|released|wartet auf info|wait)\b/i;
export const LIFECYCLE_HINT_RE = /\b(start|complete|completed|end|stop|resume|suspend|begin|opened|closed|assign|handover)\b/i;
export const LOCATION_HINT_RE = /\b(standort|werk|site|location|region|land|city|ort|filiale|niederlassung|lager|plant)\b/i;
export const COMMENT_HINT_RE = /\b(comment|kommentar|notiz|note|beschreibung|description|text|summary|details?|bemerkung|freitext|message|text_fragment)\b/i;
export const AMOUNT_HINT_RE = /\b(amount|betrag|summe|wert|price|kosten|euro|eur|qty|quantity|anzahl)\b/i;
export const CASE_HINT_RE = /(^id$|\b(case|fall|ticket|request|incident|trace|journey|instance|vorgang)(?:[_\s-]?(id|nr|nummer|hint|ref|key))?\b)/i;
export const RESOURCE_HINT_RE = /\b(resource|ressource|agent|user|operator|mitarbeiter|anwender)\b/i;
export const START_HINT_RE = /\b(start|begin|beginn|startzeit|opened)\b/i;
export const END_HINT_RE = /\b(end|ende|closed|abschluss|fertig)\b/i;
export const ORDER_HINT_RE = /\b(index|reihenfolge|order|seq|sequence|lfd|position|nr|row_id|zeile)\b/i;
export const CASE_HEADER_RE = /(^id$|\b(case|fall|ticket|request|incident|trace|journey|instance|vorgang)(?:[_\s-]?(id|nr|nummer|hint|ref|key))?\b)/i;
export const ACTIVITY_HEADER_RE = /\b(activity|aktion|schritt|event|task|t[äa]tigkeit|taetigkeit|prozessschritt|prozess(?:schritt)?|action)\b/i;
export const TIME_HEADER_RE = /\b(timestamp|zeit|datum|uhrzeit|created|occurred|logged|start|ende|end|time|date|date_hint|logged_at|created_at|updated_at)\b/i;
export const ROLE_HEADER_RE = /\b(rolle|bearbeiter|resource|ressource|owner|agent|user|zust[äa]ndig|role_hint)\b/i;
export const SYSTEM_HEADER_RE = /\b(system|system_hint|tool|app|application|anwendung|plattform|portal|application|systemname)\b/i;
export const DESCRIPTION_HEADER_RE = /\b(beschreibung|description|text|notiz|kommentar|summary|inhalt|ablauf|freitext|text_fragment|message|details?)\b/i;
export const PROCEDURE_HEADER_RE = /\b(schritt|prozess|verantwort|rolle|system|eingabe|ausgabe|entscheidung|regel)\b/i;
const CASE_IDENTIFIER_RE = /^(?:[A-Z]{1,10}\d{2,10}|[A-Z]{1,10}[-_/]\d{1,10}|[A-Z0-9]{2,12}(?:[-_/][A-Z0-9]{1,12}){1,3})$/i;
const ISO_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;
const ISO_SLASH_DATE_TIME_RE = /^(\d{4})\/(\d{2})\/(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const DE_DATE_TIME_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const US_DATE_TIME_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const MONTH_NAME_DATE_RE = /^(?:\d{1,2}\s+[A-Za-zÄÖÜäöüß]{3,10}\s+\d{4}|[A-Za-zÄÖÜäöüß]{3,10}\s+\d{1,2},\s*\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/i;

export function normalizeCell(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

export function ratio(part: number, total: number): number {
  if (!total) return 0;
  return part / total;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function looksNumeric(value: string): boolean {
  return /^-?\d+(?:[.,]\d+)?$/.test(value.trim());
}

export function looksInteger(value: string): boolean {
  return /^-?\d+$/.test(value.trim());
}

export function parseNumber(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function hasStructuredDatePattern(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized) return false;
  if (looksIdentifierLike(normalized)) return false;
  return ISO_DATE_TIME_RE.test(normalized)
    || ISO_SLASH_DATE_TIME_RE.test(normalized)
    || DE_DATE_TIME_RE.test(normalized)
    || US_DATE_TIME_RE.test(normalized)
    || MONTH_NAME_DATE_RE.test(normalized);
}

export function looksIdentifierLike(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized) return false;
  if (/\s/.test(normalized)) return false;
  if (!/[A-Za-z]/.test(normalized)) return false;
  if (looksNumeric(normalized) && normalized.length <= 3) return false;
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(normalized)) return false;
  return CASE_IDENTIFIER_RE.test(normalized);
}

export function looksCaseIdentifier(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized || hasStructuredDatePattern(normalized)) return false;
  if (normalized.split(/\s+/).length > 2) return false;
  if (looksIdentifierLike(normalized)) return true;
  return CASE_HINT_RE.test(normalized) && /\d/.test(normalized);
}

export function looksTimestamp(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized) return false;
  if (looksIdentifierLike(normalized)) return false;
  return hasStructuredDatePattern(normalized);
}

function toIsoUtc(year: string, month: string, day: string, hour?: string, minute?: string, second?: string): string {
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${(hour ?? '00').padStart(2, '0')}:${(minute ?? '00').padStart(2, '0')}:${(second ?? '00').padStart(2, '0')}Z`;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? iso : new Date(parsed).toISOString();
}

export function parseTimestampIso(value: string): string | undefined {
  const normalized = normalizeCell(value);
  if (!normalized || !hasStructuredDatePattern(normalized)) return undefined;

  const isoMatch = normalized.match(ISO_DATE_TIME_RE);
  if (isoMatch) {
    const [, year, month, day, hour, minute, second] = isoMatch;
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
      const parsed = Date.parse(normalized.replace(' ', 'T'));
      return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
    }
    return toIsoUtc(year, month, day, hour, minute, second);
  }

  const slashIsoMatch = normalized.match(ISO_SLASH_DATE_TIME_RE);
  if (slashIsoMatch) {
    const [, year, month, day, hour, minute, second] = slashIsoMatch;
    return toIsoUtc(year, month, day, hour, minute, second);
  }

  const deMatch = normalized.match(DE_DATE_TIME_RE);
  if (deMatch) {
    const [, day, month, year, hour, minute, second] = deMatch;
    return toIsoUtc(year, month, day, hour, minute, second);
  }

  const usMatch = normalized.match(US_DATE_TIME_RE);
  if (usMatch) {
    const [, month, day, year, hour, minute, second] = usMatch;
    return toIsoUtc(year, month, day, hour, minute, second);
  }

  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

export function looksRoleLike(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized || looksTimestamp(normalized) || looksNumeric(normalized) || looksIdentifierLike(normalized)) return false;
  return ROLE_HINT_RE.test(normalized);
}

export function looksPersonLike(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized) return false;
  return PERSON_HINT_RE.test(normalized);
}

export function looksSystemLike(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized || looksTimestamp(normalized) || looksNumeric(normalized)) return false;
  if (SYSTEM_HINT_RE.test(normalized)) return true;
  return /^[A-Z0-9_-]{2,16}$/.test(normalized) && !looksInteger(normalized) && !looksIdentifierLike(normalized);
}

export function looksStatusLike(value: string): boolean {
  return STATUS_HINT_RE.test(normalizeCell(value));
}

export function looksLifecycleLike(value: string): boolean {
  return LIFECYCLE_HINT_RE.test(normalizeCell(value));
}

export function looksLocationLike(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized || looksTimestamp(normalized) || looksNumeric(normalized) || looksIdentifierLike(normalized)) return false;
  return LOCATION_HINT_RE.test(normalized);
}

export function looksFreeTextLike(value: string): boolean {
  const normalized = normalizeCell(value);
  return normalized.length >= 80 || normalized.split(/\s+/).length >= 12;
}

export function looksActivityLike(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized || looksTimestamp(normalized) || looksNumeric(normalized) || looksIdentifierLike(normalized)) return false;
  const wordCount = normalized.split(/\s+/).length;
  if (wordCount > 8 || normalized.length > 80) return false;
  if (COMMENT_HINT_RE.test(normalized)) return false;
  if (looksStatusLike(normalized) || looksLifecycleLike(normalized)) return false;
  if (looksSystemLike(normalized) && !ACTIVITY_VERB_RE.test(normalized) && !ACTIVITY_NOUN_RE.test(normalized)) return false;
  if (looksRoleLike(normalized) && !ACTIVITY_VERB_RE.test(normalized)) return false;
  if (ACTIVITY_VERB_RE.test(normalized) || ACTIVITY_NOUN_RE.test(normalized)) return true;
  return /[A-Za-zÄÖÜäöüß]/.test(normalized) && wordCount >= 2 && wordCount <= 4 && !looksSystemLike(normalized) && !looksRoleLike(normalized);
}

export function headerSuggestsSupportNotActivity(header: string): boolean {
  const normalized = normalizeCell(header).toLowerCase();
  return SYSTEM_HEADER_RE.test(normalized)
    || ROLE_HEADER_RE.test(normalized)
    || DESCRIPTION_HEADER_RE.test(normalized)
    || CASE_HEADER_RE.test(normalized)
    || TIME_HEADER_RE.test(normalized)
    || /\b(source|channel|origin|herkunft|system_hint|role_hint|case_hint|date_hint|comment|note|text_fragment)\b/i.test(normalized);
}

export function headerSuggestsSupportNotTimestamp(header: string): boolean {
  const normalized = normalizeCell(header).toLowerCase();
  return CASE_HEADER_RE.test(normalized)
    || SYSTEM_HEADER_RE.test(normalized)
    || ROLE_HEADER_RE.test(normalized)
    || DESCRIPTION_HEADER_RE.test(normalized);
}

export function headerSuggestsCaseId(header: string): boolean {
  return CASE_HEADER_RE.test(normalizeCell(header));
}

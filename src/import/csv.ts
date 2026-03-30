export interface ParsedCsv {
  delimiter: ';' | ',' | '\t';
  headers: string[];
  rows: string[][];
}

export function parseCsvText(input: string): ParsedCsv {
  try {
    let text = input;

    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    if (!text.trim()) {
      throw new Error('CSV ist leer.');
    }

    let delimiter: ';' | ',' | '\t' = ';';
    let startIndex = 0;

    const firstNewline = text.indexOf('\n');
    const firstLine = (firstNewline === -1 ? text : text.slice(0, firstNewline)).trim();
    const sepMatch = firstLine.match(/^sep=([;,\t])$/i);
    if (sepMatch) {
      delimiter = sepMatch[1] as ';' | ',' | '\t';
      startIndex = firstNewline === -1 ? text.length : firstNewline + 1;
    } else {
      delimiter = detectDelimiter(firstLine);
    }

    const allRows = parseAllRows(text.slice(startIndex), delimiter);

    if (allRows.length === 0) {
      throw new Error('Keine gültigen Spaltenüberschriften gefunden.');
    }

    const headers = allRows[0].map((h) => h.trim());

    if (headers.length === 0) {
      throw new Error('Keine gültigen Spaltenüberschriften gefunden.');
    }

    const rows: string[][] = [];
    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (row.length > 0 && !(row.length === 1 && row[0].trim() === '')) {
        rows.push(row);
      }
    }

    return { delimiter, headers, rows };
  } catch (e) {
    if (e instanceof Error) {
      throw e;
    }
    throw new Error('CSV konnte nicht gelesen werden.');
  }
}

function detectDelimiter(line: string): ';' | ',' | '\t' {
  const semicolonCount = (line.match(/;/g) || []).length;
  const commaCount = (line.match(/,/g) || []).length;
  const tabCount = (line.match(/\t/g) || []).length;

  if (tabCount > semicolonCount && tabCount > commaCount) {
    return '\t';
  }
  if (commaCount > semicolonCount) {
    return ',';
  }
  return ';';
}

function parseAllRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let pos = 0;
  const len = text.length;

  while (pos <= len) {
    const { fields, nextPos } = parseRecord(text, pos, len, delimiter);
    if (nextPos === pos && pos === len) break;
    rows.push(fields);
    pos = nextPos;
  }

  return rows;
}

function parseRecord(
  text: string,
  start: number,
  len: number,
  delimiter: string
): { fields: string[]; nextPos: number } {
  const fields: string[] = [];
  let pos = start;

  while (true) {
    const { value, nextPos } = parseField(text, pos, len, delimiter);
    fields.push(value);
    pos = nextPos;

    if (pos >= len) {
      break;
    }

    const ch = text[pos];
    if (ch === delimiter) {
      pos++;
      continue;
    }

    if (ch === '\n') {
      pos++;
      break;
    }

    break;
  }

  return { fields, nextPos: pos };
}

function parseField(
  text: string,
  start: number,
  len: number,
  delimiter: string
): { value: string; nextPos: number } {
  if (start >= len) {
    return { value: '', nextPos: start };
  }

  if (text[start] === '"') {
    let pos = start + 1;
    let value = '';
    while (pos < len) {
      if (text[pos] === '"') {
        if (pos + 1 < len && text[pos + 1] === '"') {
          value += '"';
          pos += 2;
        } else {
          pos++;
          break;
        }
      } else {
        value += text[pos];
        pos++;
      }
    }
    return { value, nextPos: pos };
  }

  let pos = start;
  while (pos < len && text[pos] !== delimiter && text[pos] !== '\n') {
    pos++;
  }

  return { value: text.slice(start, pos).trim(), nextPos: pos };
}

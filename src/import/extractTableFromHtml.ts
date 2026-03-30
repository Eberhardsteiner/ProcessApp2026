export interface HtmlTableExtract {
  headers: string[];
  rows: string[][];
}

export interface HtmlTableExtractResult {
  bestTable: HtmlTableExtract | null;
  warnings: string[];
}

function normalizeHeader(h: string): string {
  return h.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
}

function cleanCell(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function matchesAlias(header: string, alias: string): boolean {
  const normAlias = normalizeHeader(alias);
  if (header === normAlias) return true;
  if (normAlias.length >= 4 && header.includes(normAlias)) return true;
  return false;
}

function headerMatchesBucket(header: string, aliases: string[]): boolean {
  return aliases.some((alias) => matchesAlias(header, alias));
}

function extractHeadersFromTable(table: Element): string[] {
  const thead = table.querySelector('thead');
  if (thead) {
    const cells = Array.from(thead.querySelectorAll('th, td'));
    if (cells.length > 0) {
      return cells.map((c) => normalizeHeader(c.textContent ?? ''));
    }
  }
  const firstRow = table.querySelector('tr');
  if (!firstRow) return [];
  const cells = Array.from(firstRow.querySelectorAll('th, td'));
  return cells.map((c) => normalizeHeader(c.textContent ?? ''));
}

function extractDataRows(table: Element, headerRowCount: number): string[][] {
  const allRows = Array.from(table.querySelectorAll('tr'));
  const dataRows = allRows.slice(headerRowCount);
  return dataRows
    .map((row) => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      return cells.map((c) => cleanCell(c.textContent ?? ''));
    })
    .filter((row) => row.some((cell) => cell.length > 0));
}

export function findBestHtmlTableByHeaders(params: {
  html: string;
  requiredAny: string[][];
  optional?: string[];
}): HtmlTableExtractResult {
  const { requiredAny, optional = [] } = params;
  const warnings: string[] = [];

  const doc = new DOMParser().parseFromString(params.html, 'text/html');
  doc.querySelectorAll('script,style,noscript').forEach((n) => n.remove());

  const tables = Array.from(doc.querySelectorAll('table'));
  if (tables.length === 0) {
    warnings.push('Keine HTML-Tabelle im Dokument gefunden.');
    return { bestTable: null, warnings };
  }

  let bestScore = -1;
  let bestExtract: HtmlTableExtract | null = null;

  for (const table of tables) {
    const headers = extractHeadersFromTable(table);
    if (headers.length === 0) continue;

    let isCandidate = true;
    for (const bucket of requiredAny) {
      const matched = headers.some((h) => headerMatchesBucket(h, bucket));
      if (!matched) {
        isCandidate = false;
        break;
      }
    }
    if (!isCandidate) continue;

    let score = 0;
    score += requiredAny.length * 5;
    for (const alias of optional) {
      if (headers.some((h) => matchesAlias(h, alias))) score += 1;
    }
    if (headers.length >= 4) score += 1;

    if (score > bestScore) {
      bestScore = score;
      const thead = table.querySelector('thead');
      const headerRowCount = thead ? 1 : 1;
      const rows = extractDataRows(table, headerRowCount);
      bestExtract = { headers, rows };
    }
  }

  if (!bestExtract) {
    warnings.push('Keine Ticket-Tabelle erkannt. Keine Tabelle enthält die erforderlichen Spalten.');
  }

  return { bestTable: bestExtract, warnings };
}

import JSZip from 'jszip';

export interface XlsxSheet {
  name: string;
  headers: string[];
  rows: string[][];
}

export interface XlsxImportResult {
  sheetNames: string[];
  sheets: XlsxSheet[];
  flattenedTextPreview: string;
  warnings: string[];
}

function unescapeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function getAttr(el: Element, name: string): string {
  return el.getAttribute(name) ?? '';
}

function parseSharedStrings(xml: string): string[] {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  const items = Array.from(parsed.getElementsByTagName('si'));
  return items.map(si => {
    const ts = Array.from(si.getElementsByTagName('t'));
    return ts.map(t => t.textContent ?? '').join('');
  });
}

function columnLetterToIndex(col: string): number {
  let n = 0;
  for (const c of col.toUpperCase()) {
    n = n * 26 + (c.charCodeAt(0) - 64);
  }
  return n - 1;
}

function parseCellRef(ref: string): { col: number; row: number } | null {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  return { col: columnLetterToIndex(m[1]), row: parseInt(m[2], 10) - 1 };
}

function parseSheetXml(xml: string, sharedStrings: string[]): { headers: string[]; rows: string[][] } {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  const cells = Array.from(parsed.getElementsByTagName('c'));

  const rowMap = new Map<number, Map<number, string>>();

  for (const cell of cells) {
    const ref = getAttr(cell, 'r');
    const type = getAttr(cell, 't');
    const pos = parseCellRef(ref);
    if (!pos) continue;

    let value = '';
    const vEl = cell.getElementsByTagName('v')[0];
    const isEl = cell.getElementsByTagName('is')[0];

    if (isEl) {
      value = Array.from(isEl.getElementsByTagName('t')).map(t => t.textContent ?? '').join('');
    } else if (vEl) {
      const raw = vEl.textContent ?? '';
      if (type === 's') {
        const idx = parseInt(raw, 10);
        value = sharedStrings[idx] ?? '';
      } else if (type === 'b') {
        value = raw === '1' ? 'true' : 'false';
      } else {
        value = raw;
      }
    }

    if (!rowMap.has(pos.row)) rowMap.set(pos.row, new Map());
    rowMap.get(pos.row)!.set(pos.col, unescapeXml(value));
  }

  if (rowMap.size === 0) return { headers: [], rows: [] };

  const sortedRowNums = Array.from(rowMap.keys()).sort((a, b) => a - b);
  const maxCol = Math.max(...Array.from(rowMap.values()).flatMap(m => Array.from(m.keys())));

  function getRow(rowNum: number): string[] {
    const m = rowMap.get(rowNum) ?? new Map();
    const result: string[] = [];
    for (let c = 0; c <= maxCol; c++) {
      result.push(m.get(c) ?? '');
    }
    return result;
  }

  const firstRow = getRow(sortedRowNums[0]);
  const headers = firstRow;
  const rows = sortedRowNums.slice(1).map(getRow);

  return { headers, rows };
}

export async function extractTablesFromXlsx(file: File): Promise<XlsxImportResult> {
  const warnings: string[] = [];
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  let sharedStrings: string[] = [];
  const ssFile = zip.file('xl/sharedStrings.xml');
  if (ssFile) {
    try {
      const ssXml = await ssFile.async('string');
      sharedStrings = parseSharedStrings(ssXml);
    } catch {
      warnings.push('Freigegebene Zeichenketten konnten nicht gelesen werden.');
    }
  }

  const wbFile = zip.file('xl/workbook.xml');
  if (!wbFile) {
    throw new Error('Ungültige XLSX-Datei: xl/workbook.xml fehlt.');
  }
  const wbXml = await wbFile.async('string');
  const wbParsed = new DOMParser().parseFromString(wbXml, 'application/xml');
  const sheetEls = Array.from(wbParsed.getElementsByTagName('sheet'));
  const sheetNames = sheetEls.map(s => s.getAttribute('name') ?? 'Tabelle');
  const sheetRIds = sheetEls.map(s => s.getAttribute('r:id') ?? s.getAttribute('id') ?? '');

  const relsMap = new Map<string, string>();
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (relsFile) {
    try {
      const relsXml = await relsFile.async('string');
      const relsParsed = new DOMParser().parseFromString(relsXml, 'application/xml');
      for (const rel of Array.from(relsParsed.getElementsByTagName('Relationship'))) {
        const id = rel.getAttribute('Id') ?? '';
        const target = rel.getAttribute('Target') ?? '';
        relsMap.set(id, target);
      }
    } catch {
      warnings.push('Beziehungsdatei konnte nicht gelesen werden — Fallback auf direkte Sheet-Pfade.');
    }
  }

  const sheets: XlsxSheet[] = [];
  const maxSheets = Math.min(sheetNames.length, 5);

  for (let i = 0; i < maxSheets; i++) {
    const name = sheetNames[i];
    const rId = sheetRIds[i];
    let sheetPath = '';

    if (rId && relsMap.has(rId)) {
      const target = relsMap.get(rId)!;
      sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    } else {
      sheetPath = `xl/worksheets/sheet${i + 1}.xml`;
    }

    const sheetFile = zip.file(sheetPath);
    if (!sheetFile) {
      warnings.push(`Sheet "${name}" konnte nicht gelesen werden (Pfad: ${sheetPath}).`);
      continue;
    }

    try {
      const sheetXml = await sheetFile.async('string');
      const { headers, rows } = parseSheetXml(sheetXml, sharedStrings);
      if (headers.length > 0) {
        sheets.push({ name, headers, rows: rows.slice(0, 2000) });
      }
    } catch (e) {
      warnings.push(`Sheet "${name}": ${e instanceof Error ? e.message : 'Unbekannter Fehler'}`);
    }
  }

  const previewLines: string[] = [];
  for (const sheet of sheets.slice(0, 2)) {
    previewLines.push(`=== ${sheet.name} ===`);
    previewLines.push(sheet.headers.join(' | '));
    for (const row of sheet.rows.slice(0, 5)) {
      previewLines.push(row.join(' | '));
    }
  }

  return {
    sheetNames,
    sheets,
    flattenedTextPreview: previewLines.join('\n'),
    warnings,
  };
}

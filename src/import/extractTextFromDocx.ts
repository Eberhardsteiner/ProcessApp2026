import JSZip from 'jszip';

function extractParagraphText(p: Element): string {
  return Array.from(p.getElementsByTagName('w:t'))
    .map(t => t.textContent ?? '')
    .join('')
    .trim();
}

function extractTableText(tbl: Element): string {
  const rows = Array.from(tbl.getElementsByTagName('w:tr'));
  const tableLines = rows.map(tr => {
    const cells = Array.from(tr.getElementsByTagName('w:tc'));
    const cellTexts = cells.map(tc => {
      const paragraphs = Array.from(tc.getElementsByTagName('w:p'));
      const parts = paragraphs
        .map(p => extractParagraphText(p))
        .filter(s => s.length > 0);
      return parts.join(' / ');
    }).filter(s => s.length > 0);
    if (cellTexts.length === 0) return '';
    return '| ' + cellTexts.join(' | ') + ' |';
  }).filter(line => line.length > 0);
  return tableLines.join('\n');
}

export async function extractTextFromDocx(file: File): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];

  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const doc = zip.file('word/document.xml');
  if (!doc) {
    throw new Error('DOCX enthält keine word/document.xml');
  }

  const xml = await doc.async('string');
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');

  const parserError = parsed.querySelector('parsererror');
  if (parserError) {
    warnings.push('XML-Parser Warnung: ' + parserError.textContent?.slice(0, 100));
  }

  const body = parsed.getElementsByTagName('w:body')[0];

  let text: string;

  if (body) {
    const blocks: string[] = [];
    for (const child of Array.from(body.childNodes)) {
      if (!(child instanceof Element)) continue;
      const localName = child.localName;
      if (localName === 'p') {
        const t = extractParagraphText(child);
        if (t) blocks.push(t);
      } else if (localName === 'tbl') {
        const t = extractTableText(child);
        if (t) blocks.push(t);
      }
    }
    text = blocks.join('\n').replace(/\r\n/g, '\n').trim();
  } else {
    const paragraphs = Array.from(parsed.getElementsByTagName('w:p'));
    const parts: string[] = [];
    if (paragraphs.length > 0) {
      paragraphs.forEach(p => {
        const t = extractParagraphText(p);
        if (t) parts.push(t);
      });
    } else {
      Array.from(parsed.getElementsByTagName('w:t')).forEach(t => {
        const content = (t.textContent ?? '').trim();
        if (content) parts.push(content);
      });
    }
    text = parts.join('\n').replace(/\r\n/g, '\n').trim();
  }

  if (!text) {
    throw new Error('DOCX enthält keinen extrahierbaren Text.');
  }

  return { text, warnings };
}

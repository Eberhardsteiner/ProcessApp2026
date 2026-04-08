let cachedWorkerUrl: string | null = null;

type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

async function ensurePdfWorkerUrl(pdfjs: { GlobalWorkerOptions?: { workerSrc?: string } }) {
  if (!cachedWorkerUrl) {
    const mod = await import('pdfjs-dist/legacy/build/pdf.worker.mjs?url');
    cachedWorkerUrl = (mod as { default: string }).default;
  }
  if (cachedWorkerUrl && pdfjs.GlobalWorkerOptions && pdfjs.GlobalWorkerOptions.workerSrc !== cachedWorkerUrl) {
    pdfjs.GlobalWorkerOptions.workerSrc = cachedWorkerUrl;
  }
}

function groupItemsIntoLines(items: PdfTextItem[]): PdfTextItem[][] {
  const sorted = items
    .filter(item => typeof item.str === 'string' && item.str.trim().length > 0 && Array.isArray(item.transform))
    .sort((a, b) => {
      const ay = a.transform?.[5] ?? 0;
      const by = b.transform?.[5] ?? 0;
      if (Math.abs(by - ay) > 2) return by - ay;
      const ax = a.transform?.[4] ?? 0;
      const bx = b.transform?.[4] ?? 0;
      return ax - bx;
    });

  const lines: PdfTextItem[][] = [];
  for (const item of sorted) {
    const y = item.transform?.[5] ?? 0;
    const current = lines[lines.length - 1];
    const currentY = current?.[0]?.transform?.[5] ?? 0;
    if (!current || Math.abs(currentY - y) > 3) {
      lines.push([item]);
    } else {
      current.push(item);
    }
  }
  return lines;
}

function lineToText(items: PdfTextItem[]): string {
  const sorted = [...items].sort((a, b) => (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0));
  const cells: string[] = [];
  let current = '';
  let prevEnd = -Infinity;

  for (const item of sorted) {
    const text = item.str?.trim() ?? '';
    if (!text) continue;
    const x = item.transform?.[4] ?? 0;
    const width = item.width ?? Math.max(text.length * 4, 8);
    const gap = x - prevEnd;
    if (current && gap > 24) {
      cells.push(current.trim());
      current = text;
    } else {
      current = current ? `${current} ${text}` : text;
    }
    prevEnd = x + width;
  }
  if (current.trim()) cells.push(current.trim());

  const looksTabular = cells.length >= 3 || cells.some(cell => /^(nr\.?|schritt|rolle|verantwortung|ergebnis|system|entscheidung)$/i.test(cell));
  return looksTabular ? `| ${cells.join(' | ')} |` : cells.join(' ');
}

export async function extractTextFromPdf(file: File): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];
  const arrayBuffer = await file.arrayBuffer();
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  await ensurePdfWorkerUrl(pdfjs);

  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const lines = groupItemsIntoLines(content.items as PdfTextItem[])
      .map(line => lineToText(line))
      .map(line => line.trim())
      .filter(Boolean);
    if (lines.length > 0) {
      pages.push(lines.join('\n'));
    }
  }

  let text = pages.join('\n\n').replace(/\r\n/g, '\n').trim();
  if (!text) {
    throw new Error('PDF enthält keinen extrahierbaren Text (möglicherweise Scan ohne Textlayer).');
  }

  return { text, warnings };
}

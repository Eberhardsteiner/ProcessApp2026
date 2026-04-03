let cachedWorkerUrl: string | null = null;

async function ensurePdfWorkerUrl(pdfjs: { GlobalWorkerOptions?: { workerSrc?: string } }) {
  if (!cachedWorkerUrl) {
    const mod = await import('pdfjs-dist/legacy/build/pdf.worker.mjs?url');
    cachedWorkerUrl = (mod as { default: string }).default;
  }
  if (cachedWorkerUrl && pdfjs.GlobalWorkerOptions && pdfjs.GlobalWorkerOptions.workerSrc !== cachedWorkerUrl) {
    pdfjs.GlobalWorkerOptions.workerSrc = cachedWorkerUrl;
  }
}

export async function extractTextFromPdf(file: File): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];

  const arrayBuffer = await file.arrayBuffer();

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  await ensurePdfWorkerUrl(pdfjs);

  const loadingTask = pdfjs.getDocument({
    data: arrayBuffer,
  });

  const pdf = await loadingTask.promise;

  const pages: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    const pageText = content.items
      .map((item) => {
        if (typeof item === 'object' && item !== null && 'str' in item && typeof item.str === 'string') {
          return item.str;
        }
        return '';
      })
      .filter(Boolean)
      .join(' ');

    if (pageText.trim()) {
      pages.push(pageText.trim());
    }
  }

  let text = pages.join('\n\n');
  text = text.replace(/\r\n/g, '\n').trim();

  if (!text) {
    throw new Error('PDF enthält keinen extrahierbaren Text (möglicherweise Scan ohne Textlayer).');
  }

  return { text, warnings };
}

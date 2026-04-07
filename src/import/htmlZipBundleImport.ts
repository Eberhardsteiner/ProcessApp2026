import JSZip from 'jszip';
import { extractTextFromHtml } from './extractTextFromHtml';

export interface HtmlZipBundleImportParams {
  zipData: ArrayBuffer;
  captureMode: 'artifact' | 'case' | 'cases';
  startingCaseNo: number;
  maxPages?: number;
  maxCharsPerPage?: number;
}

export interface HtmlZipBundleImportResult {
  text: string;
  warnings: string[];
  importedCount: number;
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

function getTitleFromHtml(html: string, fallback: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (
    doc.querySelector('title')?.textContent?.trim() ||
    doc.querySelector('h1')?.textContent?.trim() ||
    fallback
  );
}

const IGNORE_PATH_SEGMENTS = ['/attachments/', '/images/', '/static/'];

export async function htmlZipBundleToText(
  params: HtmlZipBundleImportParams
): Promise<HtmlZipBundleImportResult> {
  const maxPages = params.maxPages ?? 25;
  const maxCharsPerPage = params.maxCharsPerPage ?? 8000;

  const warnings: string[] = [];
  const zip = await JSZip.loadAsync(params.zipData);

  const allKeys = Object.keys(zip.files);

  const htmlKeys = allKeys.filter((k) => {
    const lower = k.toLowerCase();
    if (!lower.endsWith('.html') && !lower.endsWith('.htm')) return false;
    if (IGNORE_PATH_SEGMENTS.some((seg) => lower.includes(seg))) return false;
    return true;
  });

  const hasPages = htmlKeys.some((k) => k.toLowerCase().includes('/pages/'));
  const filtered = hasPages
    ? htmlKeys.filter((k) => k.toLowerCase().includes('/pages/'))
    : htmlKeys;

  const sorted = [...filtered].sort((a, b) => a.localeCompare(b));

  const totalFound = sorted.length;
  if (totalFound === 0) {
    return { text: '', warnings: [], importedCount: 0 };
  }

  const limited = sorted.slice(0, maxPages);
  if (totalFound > maxPages) {
    warnings.push(
      `ZIP enthält ${totalFound} HTML-Seiten, importiere nur die ersten ${maxPages}.`
    );
  }

  const blocks: string[] = [];
  let importedCount = 0;

  for (const name of limited) {
    const zipFile = zip.file(name);
    if (!zipFile) continue;

    const html = await zipFile.async('string');
    const title = getTitleFromHtml(html, basename(name));
    const r = extractTextFromHtml(html);

    if (!r.text.trim()) {
      if (warnings.length < 20) {
        warnings.push(`"${basename(name)}" ergab keinen Text (übersprungen).`);
      }
      continue;
    }

    let blockText = r.text;
    if (blockText.length > maxCharsPerPage) {
      blockText = blockText.slice(0, maxCharsPerPage);
      if (warnings.length < 20) {
        warnings.push(
          `"${basename(name)}" wurde auf ${maxCharsPerPage} Zeichen gekürzt.`
        );
      }
    }

    for (const w of r.warnings) {
      if (warnings.length < 20) {
        warnings.push(`[${basename(name)}] ${w}`);
      }
    }

    const header = `=== PAGE: ${title} (Datei: ${basename(name)}) ===`;

    if (params.captureMode === 'artifact') {
      blocks.push(`${header}\n\n${blockText}`);
      importedCount++;
      continue;
    }

    if (params.captureMode === 'case') {
      blocks.push(`FALL 1 (HTML ZIP: ${title})\n\n${blockText}`);
      importedCount++;
      break;
    }

    const fallNo = params.startingCaseNo + importedCount;
    blocks.push(`FALL ${fallNo} (HTML ZIP: ${title})\n\n${blockText}`);
    importedCount++;
  }

  const text = blocks.join('\n\n---\n\n');
  return { text, warnings, importedCount };
}

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

function decodeXml(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&');
}

function extractTextRuns(xml) {
  return Array.from(xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g))
    .map(match => decodeXml(match[1] ?? ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractTextFromDocxFile(filePath) {
  const buffer = await readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) {
    throw new Error(`DOCX enthält keine word/document.xml: ${filePath}`);
  }

  const blockRe = /<w:(p|tbl)\b[\s\S]*?<\/w:\1>/g;
  const blocks = [];

  for (const match of documentXml.matchAll(blockRe)) {
    const blockXml = match[0];
    if (match[1] === 'p') {
      const text = extractTextRuns(blockXml);
      if (text) blocks.push(text);
      continue;
    }

    const rows = Array.from(blockXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g))
      .map(rowMatch => {
        const cells = Array.from(rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g))
          .map(cellMatch => {
            const cellText = Array.from(cellMatch[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g))
              .map(paragraphMatch => extractTextRuns(paragraphMatch[0]))
              .filter(Boolean)
              .join(' / ');
            return cellText.trim();
          })
          .filter(Boolean);
        return cells.length > 0 ? `| ${cells.join(' | ')} |` : '';
      })
      .filter(Boolean);
    if (rows.length > 0) {
      blocks.push(rows.join('\n'));
    }
  }

  const text = blocks.join('\n\n').trim();
  if (!text) {
    throw new Error(`Quelle enthält keinen extrahierbaren Text: ${filePath}`);
  }
  return text;
}

export async function readStructuredSourceText(sourcePath) {
  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === '.docx') {
    return extractTextFromDocxFile(sourcePath);
  }
  return (await readFile(sourcePath, 'utf8')).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

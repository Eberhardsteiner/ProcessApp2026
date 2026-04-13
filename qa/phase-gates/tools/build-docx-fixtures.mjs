import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const phaseGatesDir = path.resolve(scriptDir, '..');
const sourceDir = path.join(phaseGatesDir, 'fixture-sources');
const fixtureDir = path.join(phaseGatesDir, 'fixtures');

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeParagraphLine(value) {
  return value
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\s*[-*]\s+/, '')
    .trim();
}

function isTableLine(value) {
  return /^\s*\|.+\|\s*$/.test(value);
}

function isSeparatorRow(cells) {
  return cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

function parseMarkdownToBlocks(markdown) {
  const blocks = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      blocks.push({ type: 'paragraph', text: normalizeParagraphLine(line) });
      index += 1;
      continue;
    }

    if (isTableLine(line)) {
      const tableLines = [];
      while (index < lines.length && isTableLine(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      const rows = tableLines
        .map(parseTableRow)
        .filter(cells => cells.length > 0 && !isSeparatorRow(cells));
      if (rows.length > 0) {
        blocks.push({ type: 'table', rows });
      }
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length && lines[index].trim() && !isTableLine(lines[index]) && !/^#{1,6}\s+/.test(lines[index])) {
      paragraphLines.push(normalizeParagraphLine(lines[index]));
      index += 1;
    }
    const text = paragraphLines.join(' ').trim();
    if (text) {
      blocks.push({ type: 'paragraph', text });
    }
  }

  return blocks;
}

function paragraphXml(text) {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function tableXml(rows) {
  const rowXml = rows.map(cells => {
    const cellXml = cells.map(cell => `<w:tc><w:tcPr/><w:p><w:r><w:t xml:space="preserve">${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`).join('');
    return `<w:tr>${cellXml}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${rowXml}</w:tbl>`;
}

function buildDocumentXml(markdown) {
  const blocks = parseMarkdownToBlocks(markdown);
  const body = blocks.map(block => (
    block.type === 'table'
      ? tableXml(block.rows)
      : paragraphXml(block.text)
  )).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

async function buildDocxFromMarkdown(markdown, targetPath) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
  zip.folder('docProps')?.file('core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>ProcessApp2026 QA Fixture</dc:title>
  <dc:creator>Codex QA Scaffold</dc:creator>
  <cp:lastModifiedBy>Codex QA Scaffold</cp:lastModifiedBy>
</cp:coreProperties>`);
  zip.folder('docProps')?.file('app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>ProcessApp2026 QA</Application>
</Properties>`);
  zip.folder('word')?.file('document.xml', buildDocumentXml(markdown));

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await writeFile(targetPath, buffer);
}

await mkdir(fixtureDir, { recursive: true });
const sourceFiles = (await readdir(sourceDir)).filter(name => name.endsWith('.md')).sort();

for (const sourceFile of sourceFiles) {
  const sourcePath = path.join(sourceDir, sourceFile);
  const targetPath = path.join(fixtureDir, sourceFile.replace(/\.md$/i, '.docx'));
  const markdown = await readFile(sourcePath, 'utf8');
  await buildDocxFromMarkdown(markdown, targetPath);
  console.log(`Built ${path.relative(phaseGatesDir, targetPath)}`);
}

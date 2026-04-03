export type AiCsvImportMode = 'raw' | 'jira' | 'servicenow';

export interface DetectedImportHint {
  kind: 'csv' | 'zip' | 'html';
  suggestedMode: string;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
}

export function detectCsvMode(csvText: string): DetectedImportHint | null {
  const rawLines = csvText.split('\n').slice(0, 8);
  const lines = rawLines
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.toLowerCase().startsWith('sep='));

  if (lines.length === 0) return null;

  const best = lines.reduce<{ line: string; score: number }>(
    (acc, line) => {
      const score =
        (line.split(',').length - 1) +
        (line.split(';').length - 1) +
        (line.split('\t').length - 1);
      return score > acc.score ? { line, score } : acc;
    },
    { line: '', score: 0 }
  );

  if (best.score < 2) return null;

  const h = best.line.toLowerCase();

  const hasIssueKey = h.includes('issue key') || h.includes('issuekey') || /\bkey\b/.test(h);
  const hasSummary = h.includes('summary') || h.includes('zusammenfassung');
  const hasNumber = /\bnumber\b/.test(h);
  const hasShortDesc = h.includes('short description') || h.includes('short_description');

  if (hasIssueKey && hasSummary) {
    return {
      kind: 'csv',
      suggestedMode: 'jira',
      confidence: 'high',
      reason: 'Header enthält "Issue Key" und "Summary" – typisches Jira CSV.',
    };
  }

  if (hasNumber && hasShortDesc) {
    return {
      kind: 'csv',
      suggestedMode: 'servicenow',
      confidence: 'high',
      reason: 'Header enthält "Number" und "Short Description" – typisches ServiceNow CSV.',
    };
  }

  if (h.includes('jira')) {
    return {
      kind: 'csv',
      suggestedMode: 'jira',
      confidence: 'medium',
      reason: 'Header enthält "jira" – wahrscheinlich Jira CSV.',
    };
  }

  if (h.includes('status') && h.includes('issue type')) {
    return {
      kind: 'csv',
      suggestedMode: 'jira',
      confidence: 'medium',
      reason: 'Header enthält "Status" und "Issue Type" – typische Jira-Spalten.',
    };
  }

  if (h.includes('state') && h.includes('work notes')) {
    return {
      kind: 'csv',
      suggestedMode: 'servicenow',
      confidence: 'medium',
      reason: 'Header enthält "State" und "Work Notes" – typische ServiceNow-Spalten.',
    };
  }

  return null;
}

export function detectZipLooksLikeHtmlBundle(zipFileNames: string[]): DetectedImportHint | null {
  if (zipFileNames.length === 0) return null;

  const lower = zipFileNames.map((n) => n.toLowerCase());
  const htmlCount = lower.filter((n) => n.endsWith('.html') || n.endsWith('.htm')).length;
  const hasPages = lower.some((n) => n.includes('/pages/') || n.includes('\\pages\\'));
  const hasIndexHtml = lower.some((n) => n === 'index.html' || n.endsWith('/index.html'));

  if (htmlCount >= 3 && (hasPages || hasIndexHtml)) {
    return {
      kind: 'zip',
      suggestedMode: 'htmlzip',
      confidence: 'high',
      reason: `ZIP enthält ${htmlCount} HTML-Dateien mit Wiki/Confluence-Struktur.`,
    };
  }

  if (htmlCount >= 2) {
    return {
      kind: 'zip',
      suggestedMode: 'htmlzip',
      confidence: 'medium',
      reason: `ZIP enthält ${htmlCount} HTML-Dateien – möglicherweise ein HTML-Bundle.`,
    };
  }

  return null;
}

export function detectHtmlMode(html: string): DetectedImportHint | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript').forEach((n) => n.remove());

  const tables = Array.from(doc.querySelectorAll('table'));
  if (tables.length === 0) return null;

  function extractHeaders(table: Element): string[] {
    const thead = table.querySelector('thead');
    const firstRow = thead
      ? thead.querySelector('tr')
      : table.querySelector('tr');
    if (!firstRow) return [];
    return Array.from(firstRow.querySelectorAll('th,td'))
      .map((cell) => (cell.textContent ?? '').toLowerCase().trim().replace(/\s+/g, ' '));
  }

  function colCount(table: Element): number {
    const firstRow = table.querySelector('tr');
    return firstRow ? Array.from(firstRow.querySelectorAll('th,td')).length : 0;
  }

  interface TableCandidate {
    headers: string[];
    cols: number;
    jiraScore: boolean;
    snScore: boolean;
  }

  const candidates: TableCandidate[] = tables.map((t) => {
    const headers = extractHeaders(t);
    const hasKey = headers.some((h) => h === 'key' || h === 'issue key' || h === 'issuekey' || h === 'schlüssel');
    const hasSummary = headers.some((h) => h === 'summary' || h === 'zusammenfassung' || h === 'title' || h === 'titel');
    const hasNumber = headers.some((h) => h === 'number' || h === 'nummer' || h === 'incident' || h === 'request');
    const hasShortDesc = headers.some((h) => h.includes('short description') || h.includes('short_description') || h.includes('kurzbeschreibung') || h === 'summary' || h === 'title');
    return {
      headers,
      cols: colCount(t),
      jiraScore: hasKey && hasSummary,
      snScore: hasNumber && hasShortDesc,
    };
  });

  const jiraCandidates = candidates.filter((c) => c.jiraScore);
  const snCandidates = candidates.filter((c) => c.snScore);

  if (jiraCandidates.length > 0) {
    const best = jiraCandidates.reduce((a, b) => (b.cols > a.cols ? b : a));
    const keyHeader = best.headers.find((h) => h === 'key' || h === 'issue key' || h === 'issuekey' || h === 'schlüssel') ?? 'key';
    const summaryHeader = best.headers.find((h) => h === 'summary' || h === 'zusammenfassung' || h === 'title' || h === 'titel') ?? 'summary';
    return {
      kind: 'html',
      suggestedMode: 'jira_html',
      confidence: 'high',
      reason: `Tabelle enthält Spalten "${keyHeader}" und "${summaryHeader}" – erkannt als Jira Ticket-Liste.`,
    };
  }

  if (snCandidates.length > 0) {
    const best = snCandidates.reduce((a, b) => (b.cols > a.cols ? b : a));
    const numHeader = best.headers.find((h) => h === 'number' || h === 'nummer' || h === 'incident' || h === 'request') ?? 'number';
    const descHeader = best.headers.find((h) => h.includes('short description') || h.includes('kurzbeschreibung') || h === 'summary' || h === 'title') ?? 'short description';
    return {
      kind: 'html',
      suggestedMode: 'servicenow_html',
      confidence: 'high',
      reason: `Tabelle enthält Spalten "${numHeader}" und "${descHeader}" – erkannt als ServiceNow Ticket-Liste.`,
    };
  }

  return null;
}

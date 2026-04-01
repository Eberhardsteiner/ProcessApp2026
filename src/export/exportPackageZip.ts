import type { Process, ProcessVersion, ImprovementBacklogItem, Level3, ImprovementCategory, ImprovementStatus, ImprovementScope, AutomationApproach, AutomationLevel, ControlType } from '../domain/process';
import { exportProcessBundle } from '../storage/processBundle';
import { buildBpmnXmlFromDraft } from '../bpmn/exportBpmn';
import { buildReportMarkdown, buildReportHtml } from './reportExport';

const CSV_DELIM = ';';

function sanitizeFilename(name: string): string {
  const clean = name
    .replace(/[^a-zA-Z0-9_\-äöüÄÖÜß ]/g, '')
    .replace(/\s+/g, '_')
    .trim();
  return clean || 'prozess';
}

function escapeCsvCell(value: string): string {
  const v = value ?? '';
  const mustQuote =
    v.includes(CSV_DELIM) || v.includes('\n') || v.includes('\r') || v.includes('"');

  const escaped = v.replace(/"/g, '""');
  return mustQuote ? `"${escaped}"` : escaped;
}

function rowsToCsv(rows: string[][]): string {
  const lines = rows.map((r) => r.map(escapeCsvCell).join(CSV_DELIM));
  return `\ufeffsep=${CSV_DELIM}\n` + lines.join('\n');
}

function levelWeight(level: Level3): number {
  switch (level) {
    case 'low': return 1;
    case 'medium': return 2;
    case 'high': return 3;
  }
}

function computePriorityScore(item: ImprovementBacklogItem): number {
  return levelWeight(item.impact) * 2 - levelWeight(item.effort) - levelWeight(item.risk);
}

function getPriorityLabel(score: number): string {
  if (score >= 3) return 'Hoch';
  if (score >= 1) return 'Mittel';
  return 'Niedrig';
}

function getCategoryLabel(category: ImprovementCategory): string {
  const labels: Record<ImprovementCategory, string> = {
    standardize: 'Standardisierung',
    digitize: 'Digitalisierung',
    automate: 'Automatisierung',
    ai: 'KI-Einsatz',
    data: 'Daten',
    governance: 'Governance',
    customer: 'Kundennutzen',
    compliance: 'Compliance',
    kpi: 'Messung/KPI',
  };
  return labels[category];
}

function getStatusLabel(status: ImprovementStatus): string {
  const labels: Record<ImprovementStatus, string> = {
    idea: 'Idee',
    planned: 'Geplant',
    in_progress: 'In Arbeit',
    done: 'Erledigt',
    discarded: 'Verworfen',
  };
  return labels[status];
}

function getLevelLabel(level: Level3): string {
  const labels: Record<Level3, string> = {
    low: 'Niedrig',
    medium: 'Mittel',
    high: 'Hoch',
  };
  return labels[level];
}

function getApproachLabel(approach: AutomationApproach): string {
  const labels: Record<AutomationApproach, string> = {
    workflow: 'Workflow / Prozess-Engine',
    rpa: 'RPA (UI-Automatisierung)',
    api_integration: 'API-Integration',
    erp_config: 'ERP/Standard-Konfiguration',
    low_code: 'Low-Code / Formular-App',
    ai_assistant: 'KI-Assistent (Mitarbeiter unterstützt)',
    ai_document_processing: 'KI: Dokumente/Extraktion',
    ai_classification: 'KI: Klassifikation/Entscheidungshilfe',
    process_mining: 'Process Mining',
    other: 'Sonstiges',
  };
  return labels[approach];
}

function getAutomationLevelLabel(level: AutomationLevel): string {
  const labels: Record<AutomationLevel, string> = {
    assist: 'Assistiert',
    partial: 'Teilautomatisiert',
    straight_through: 'Vollautomatisiert (Straight-Through)',
  };
  return labels[level];
}

function getControlLabel(control: ControlType): string {
  const labels: Record<ControlType, string> = {
    audit_trail: 'Audit Trail',
    approval: 'Freigabe/Approval',
    monitoring: 'Monitoring',
    data_privacy: 'Datenschutz',
    fallback_manual: 'Manuelles Fallback',
  };
  return labels[control];
}

function getScopeLabel(scope: ImprovementScope): string {
  return scope === 'process' ? 'Gesamtprozess' : 'Prozessschritt';
}

export async function buildAndDownloadProcessExportZip(params: {
  process: Process;
  version: ProcessVersion;
}): Promise<{ filename: string; warnings: string[] }> {
  const { process, version } = params;
  const warnings: string[] = [];

  const baseName = sanitizeFilename(process.title);
  const versionShort = version.versionId.replace('v', '').padStart(3, '0');
  const dateStamp = new Date().toISOString().split('T')[0].replace(/-/g, '');

  const bundle = await exportProcessBundle(process.processId);
  const bundleJson = JSON.stringify(bundle, null, 2);

  const bpmnResult = buildBpmnXmlFromDraft(process, version);
  const bpmnXml = bpmnResult.xml;
  if (bpmnResult.warnings.length > 0) {
    warnings.push(...bpmnResult.warnings);
  }

  const reportMarkdown = buildReportMarkdown(process, version);
  const reportHtml = buildReportHtml(process, version);

  const happyPath = version.sidecar.captureDraft?.happyPath || [];
  const roles = version.sidecar.roles || [];
  const systems = version.sidecar.systems || [];
  const dataObjects = version.sidecar.dataObjects || [];
  const kpis = version.sidecar.kpis || [];
  const items = version.sidecar.improvementBacklog || [];

  const roleMap = new Map(roles.map((r) => [r.id, r.name]));
  const systemMap = new Map(systems.map((s) => [s.id, s.name]));
  const dataObjectMap = new Map(dataObjects.map((d) => [d.id, d.name]));
  const kpiMap = new Map(kpis.map((k) => [k.id, k.name]));

  const stepMap = new Map(happyPath.map((step) => [step.stepId, `${step.order}. ${step.label}`]));

  const happyPathCsvRows: string[][] = [
    ['order', 'label', 'role', 'system', 'workType', 'processingTime', 'waitingTime', 'volume', 'rework', 'painPointHint', 'toBeHint']
  ];
  happyPath.forEach((step) => {
    happyPathCsvRows.push([
      step.order.toString(),
      step.label,
      step.roleId ? roleMap.get(step.roleId) || '' : '',
      step.systemId ? systemMap.get(step.systemId) || '' : '',
      step.workType || '',
      step.processingTime || '',
      step.waitingTime || '',
      step.volume || '',
      step.rework || '',
      step.painPointHint || '',
      step.toBeHint || '',
    ]);
  });
  const happyPathCsv = rowsToCsv(happyPathCsvRows);

  const rollenCsvRows: string[][] = [['name', 'kind', 'aliases']];
  roles.forEach((role) => {
    rollenCsvRows.push([
      role.name,
      role.kind,
      role.aliases?.join(' | ') || ''
    ]);
  });
  const rollenCsv = rowsToCsv(rollenCsvRows);

  const systemeCsvRows: string[][] = [['name', 'systemType', 'aliases']];
  systems.forEach((sys) => {
    systemeCsvRows.push([
      sys.name,
      sys.systemType || '',
      sys.aliases?.join(' | ') || ''
    ]);
  });
  const systemeCsv = rowsToCsv(systemeCsvRows);

  const datenobjekteCsvRows: string[][] = [['name', 'kind', 'aliases']];
  dataObjects.forEach((obj) => {
    datenobjekteCsvRows.push([
      obj.name,
      obj.kind,
      obj.aliases?.join(' | ') || ''
    ]);
  });
  const datenobjekteCsv = rowsToCsv(datenobjekteCsvRows);

  const kpisCsvRows: string[][] = [['name', 'definition', 'unit', 'target', 'aliases']];
  kpis.forEach((kpi) => {
    kpisCsvRows.push([
      kpi.name,
      kpi.definition,
      kpi.unit || '',
      kpi.target || '',
      kpi.aliases?.join(' | ') || ''
    ]);
  });
  const kpisCsv = rowsToCsv(kpisCsvRows);

  const massnahmenCsvRows: string[][] = [
    [
      'Priorität Score',
      'Priorität',
      'Status',
      'Kategorie',
      'Maßnahme',
      'Scope',
      'Schritt',
      'Verantwortlich',
      'Fällig am',
      'Impact',
      'Effort',
      'Risiko',
      'Ansatz',
      'Zielgrad',
      'Human-in-the-loop',
      'Systeme',
      'Datenobjekte',
      'KPIs',
      'Kontrollen',
      'Beschreibung',
      'Betroffene Fälle (%)',
      'Einsparung pro Fall (Min)',
      'Schätzung Notiz',
      'Erstellt am',
      'Aktualisiert am',
    ]
  ];

  items.forEach((item) => {
    const score = computePriorityScore(item);
    const priorityLabel = getPriorityLabel(score);
    const categoryLabel = getCategoryLabel(item.category);
    const statusLabel = getStatusLabel(item.status);
    const scopeLabel = getScopeLabel(item.scope);
    const stepLabel = item.relatedStepId ? stepMap.get(item.relatedStepId) || item.relatedStepId : '';
    const owner = item.owner || '';
    const dueDate = item.dueDate || '';
    const impactLabel = getLevelLabel(item.impact);
    const effortLabel = getLevelLabel(item.effort);
    const riskLabel = getLevelLabel(item.risk);

    const blueprint = item.automationBlueprint;
    const approachLabel = blueprint?.approach ? getApproachLabel(blueprint.approach) : '';
    const targetLevelLabel = blueprint?.level ? getAutomationLevelLabel(blueprint.level) : '';
    const humanInLoop = blueprint?.humanInTheLoop ? 'Ja' : '';

    const blueprintSystemNames = (blueprint?.systemIds || []).map((sid) => systemMap.get(sid) || sid).join(', ');
    const blueprintDataObjectNames = (blueprint?.dataObjectIds || []).map((did) => dataObjectMap.get(did) || did).join(', ');
    const blueprintKpiNames = (blueprint?.kpiIds || []).map((kid) => kpiMap.get(kid) || kid).join(', ');
    const blueprintControls = (blueprint?.controls || []).map(getControlLabel).join(', ');

    const description = item.description || '';
    const affected = item.impactEstimate?.affectedCaseSharePct?.toString() || '';
    const savingMin = item.impactEstimate?.leadTimeSavingMinPerCase?.toString() || '';
    const notes = item.impactEstimate?.notes || '';
    const createdAt = item.createdAt || '';
    const updatedAt = item.updatedAt || '';

    massnahmenCsvRows.push([
      score.toString(),
      priorityLabel,
      statusLabel,
      categoryLabel,
      item.title,
      scopeLabel,
      stepLabel,
      owner,
      dueDate,
      impactLabel,
      effortLabel,
      riskLabel,
      approachLabel,
      targetLevelLabel,
      humanInLoop,
      blueprintSystemNames,
      blueprintDataObjectNames,
      blueprintKpiNames,
      blueprintControls,
      description,
      affected,
      savingMin,
      notes,
      createdAt,
      updatedAt,
    ]);
  });
  const massnahmenCsv = rowsToCsv(massnahmenCsvRows);

  const openItems = items.filter((i) => i.status !== 'done' && i.status !== 'discarded');
  const sortedOpen = openItems
    .map((i) => ({ item: i, score: computePriorityScore(i), updatedAt: new Date(i.updatedAt).getTime() }))
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
    .slice(0, 10);

  const highRiskItems = openItems.filter((i) => i.risk === 'high' || i.category === 'compliance');

  const byOwner: Record<string, ImprovementBacklogItem[]> = {};
  openItems.forEach((i) => {
    const owner = i.owner || 'Nicht zugewiesen';
    if (!byOwner[owner]) byOwner[owner] = [];
    byOwner[owner].push(i);
  });

  let workshopSummary = '';
  workshopSummary += `Prozess: ${process.title}\n`;
  workshopSummary += `Version: ${version.versionId}\n`;
  workshopSummary += `Exportdatum: ${new Date().toISOString().split('T')[0]}\n`;
  workshopSummary += `\n`;
  workshopSummary += `========================================\n`;
  workshopSummary += `Top 10 offene Maßnahmen (nach Priorität)\n`;
  workshopSummary += `========================================\n`;
  sortedOpen.forEach(({ item, score }) => {
    workshopSummary += `[${getPriorityLabel(score)}] ${item.title} (${getCategoryLabel(item.category)}, ${getStatusLabel(item.status)})\n`;
    if (item.owner) workshopSummary += `  Verantwortlich: ${item.owner}\n`;
    if (item.dueDate) workshopSummary += `  Fällig am: ${item.dueDate}\n`;
    workshopSummary += `\n`;
  });

  if (highRiskItems.length > 0) {
    workshopSummary += `\n========================================\n`;
    workshopSummary += `Risiken / Compliance-Maßnahmen\n`;
    workshopSummary += `========================================\n`;
    highRiskItems.forEach((item) => {
      workshopSummary += `- ${item.title} (${getCategoryLabel(item.category)}, Risiko: ${getLevelLabel(item.risk)})\n`;
      if (item.description) workshopSummary += `  ${item.description}\n`;
      workshopSummary += `\n`;
    });
  }

  workshopSummary += `\n========================================\n`;
  workshopSummary += `Offene Maßnahmen nach Owner\n`;
  workshopSummary += `========================================\n`;
  Object.keys(byOwner).sort().forEach((owner) => {
    workshopSummary += `${owner}: ${byOwner[owner].length} Maßnahme(n)\n`;
    byOwner[owner].forEach((item) => {
      workshopSummary += `  - ${item.title}\n`;
    });
    workshopSummary += `\n`;
  });

  const readmeContent = `# Prozess-Exportpaket

Prozess: ${process.title}
Version: ${version.versionId}
Exportdatum: ${new Date().toISOString().split('T')[0]}

## Enthaltene Dateien

### bundle/
- **process_bundle.json**: Vollständiges JSON-Bundle für Import in die Anwendung

### bpmn/
- **process.bpmn**: BPMN 2.0 XML (frisch generiert aus dem Draft)
- **warnings.txt**: Warnungen bei der BPMN-Generierung (falls vorhanden)

### csv/
- **happy_path.csv**: Happy Path Schritte
- **katalog_rollen.csv**: Rollen-Katalog
- **katalog_systeme.csv**: Systeme-Katalog
- **katalog_datenobjekte.csv**: Datenobjekte-Katalog
- **katalog_kpis.csv**: KPI-Katalog
- **massnahmen.csv**: Verbesserungsmaßnahmen (Improvement Backlog)

### workshop/
- **workshop_summary.txt**: Zusammenfassung mit Top-Maßnahmen, Risiken, Verantwortlichkeiten

### report/
- **process_report.md**: Report als Markdown (für Wiki/Repo)
- **process_report.html**: Druckfreundlicher Report als eigenständiges HTML (offline), inkl. Print-Button

## Verwendung

Die CSV-Dateien sind Excel-freundlich formatiert (UTF-8 BOM + sep=;).
Das BPMN kann in BPMN-Editoren wie Camunda Modeler geöffnet werden.
Das JSON-Bundle kann in der Anwendung im Setup-Tab importiert werden.
`;

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  const rootFolder = `${baseName}__export__${versionShort}__${dateStamp}/`;

  zip.file(`${rootFolder}README.md`, readmeContent);
  zip.file(`${rootFolder}bundle/process_bundle.json`, bundleJson);
  zip.file(`${rootFolder}bpmn/process.bpmn`, bpmnXml);
  if (bpmnResult.warnings.length > 0) {
    zip.file(`${rootFolder}bpmn/warnings.txt`, bpmnResult.warnings.join('\n'));
  }
  zip.file(`${rootFolder}csv/happy_path.csv`, happyPathCsv);
  zip.file(`${rootFolder}csv/katalog_rollen.csv`, rollenCsv);
  zip.file(`${rootFolder}csv/katalog_systeme.csv`, systemeCsv);
  zip.file(`${rootFolder}csv/katalog_datenobjekte.csv`, datenobjekteCsv);
  zip.file(`${rootFolder}csv/katalog_kpis.csv`, kpisCsv);
  zip.file(`${rootFolder}csv/massnahmen.csv`, massnahmenCsv);
  zip.file(`${rootFolder}workshop/workshop_summary.txt`, workshopSummary);
  zip.file(`${rootFolder}report/process_report.md`, reportMarkdown);
  zip.file(`${rootFolder}report/process_report.html`, reportHtml);

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filename = `${baseName}__export__${versionShort}__${dateStamp}.zip`;
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { filename, warnings };
}

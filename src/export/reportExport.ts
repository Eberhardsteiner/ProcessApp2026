import type { Process, ProcessVersion, ImprovementBacklogItem, Level3, ImprovementCategory, ImprovementStatus, ProcessCategory, ProcessManagementLevel, ProcessHierarchyLevel, ProcessStatus } from '../domain/process';
import { assessProcess } from '../assessment/processAssessment';
import type { WorkType, ExceptionType, GatewayType, CaptureDraftStep, EvidenceRef, CaptureElementStatus } from '../domain/capture';

function sanitizeFilename(name: string): string {
  const clean = name
    .replace(/[^a-zA-Z0-9_\-äöüÄÖÜß ]/g, '')
    .replace(/\s+/g, '_')
    .trim();
  return clean || 'prozess';
}

function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateTimeDe(iso: string): string {
  return new Date(iso).toLocaleString('de-DE');
}

function mdEscapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/[\n\r]+/g, ' ').trim();
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

function getCaptureStatusLabel(status: CaptureElementStatus | undefined): string {
  switch (status) {
    case 'confirmed': return 'Bestätigt';
    case 'unclear': return 'Unklar';
    case 'derived': return 'Abgeleitet';
    default: return 'Unklar';
  }
}

function getWorkTypeLabel(workType: WorkType | null | undefined): string {
  switch (workType) {
    case 'manual': return 'Manuell';
    case 'user_task': return 'Benutzeraufgabe';
    case 'service_task': return 'Systemaufgabe';
    case 'ai_assisted': return 'KI-unterstützt';
    case 'unknown': return 'Unklar';
    default: return 'Unklar';
  }
}

function getExceptionTypeLabel(type: ExceptionType): string {
  switch (type) {
    case 'timeout': return 'Zeitüberschreitung';
    case 'error': return 'Fehler';
    case 'missing_data': return 'Fehlende Daten';
    case 'cancellation': return 'Abbruch';
    case 'compliance': return 'Compliance';
    case 'other': return 'Ausnahme';
  }
}

function getGatewayTypeLabel(type: GatewayType): string {
  switch (type) {
    case 'xor': return 'XOR (exklusiv)';
    case 'or': return 'OR (inklusiv)';
    case 'and': return 'AND (parallel)';
  }
}

function getTextEvidenceInfo(evidence?: EvidenceRef[]): { refId: string | null; snippet: string | null } {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return { refId: null, snippet: null };
  }
  const ev = evidence.find((e) => e && e.type === 'text');
  if (!ev) return { refId: null, snippet: null };

  const refId = (ev.refId && ev.refId.trim()) ? ev.refId.trim() : null;
  const snippet = (ev.snippet && ev.snippet.trim()) ? ev.snippet.trim() : null;
  return { refId, snippet };
}

function getProcessCategoryLabel(cat: ProcessCategory): string {
  switch (cat) {
    case 'kern': return 'Kernprozess';
    case 'unterstuetzung': return 'Unterstützungsprozess';
    case 'steuerung': return 'Steuerungsprozess';
  }
}

function getProcessManagementLevelLabel(level: ProcessManagementLevel): string {
  switch (level) {
    case 'strategisch': return 'Strategisch';
    case 'fachlich': return 'Fachlich';
    case 'technisch': return 'Technisch';
  }
}

function getProcessHierarchyLevelLabel(level: ProcessHierarchyLevel): string {
  switch (level) {
    case 'landkarte': return 'Prozesslandkarte';
    case 'hauptprozess': return 'Hauptprozess';
    case 'unterprozess': return 'Unterprozess';
  }
}

function getLevel3Label(level: Level3): string {
  switch (level) {
    case 'low': return 'Niedrig';
    case 'medium': return 'Mittel';
    case 'high': return 'Hoch';
  }
}

function getProcessStatusLabel(status: ProcessStatus): string {
  switch (status) {
    case 'draft': return 'Entwurf';
    case 'in_review': return 'In Prüfung';
    case 'published': return 'Veröffentlicht';
  }
}

function getFrequencyLabel(v?: string): string {
  switch (v) {
    case 'daily': return 'Täglich';
    case 'weekly': return 'Wöchentlich';
    case 'monthly': return 'Monatlich';
    case 'quarterly': return 'Quartalsweise';
    case 'yearly': return 'Jährlich';
    case 'ad_hoc': return 'Ad hoc / unregelmäßig';
    case 'unknown': return 'Unbekannt';
    default: return '(nicht erfasst)';
  }
}

function getLeadTimeLabel(v?: string): string {
  switch (v) {
    case 'minutes': return 'Minuten';
    case 'hours': return 'Stunden';
    case '1_day': return 'Bis 1 Tag';
    case '2_5_days': return '2 bis 5 Tage';
    case '1_2_weeks': return '1 bis 2 Wochen';
    case 'over_2_weeks': return 'Mehr als 2 Wochen';
    case 'varies': return 'Variiert stark';
    case 'unknown': return 'Unbekannt';
    default: return '(nicht erfasst)';
  }
}

function getStepLevelBucketLabel(v?: string): string {
  switch (v) {
    case 'low': return 'Niedrig';
    case 'medium': return 'Mittel';
    case 'high': return 'Hoch';
    case 'varies': return 'Variiert stark';
    case 'unknown': return 'Unbekannt';
    default: return '(nicht erfasst)';
  }
}

function formatSignedScore(score: number): string {
  return score >= 0 ? `+${score}` : `${score}`;
}

function formatStepRef(step: CaptureDraftStep): string {
  return `${step.order}. ${step.label}`;
}

export function buildReportMarkdown(process: Process, version: ProcessVersion): string {
  const lines: string[] = [];
  const sidecar = version.sidecar;
  const draft = sidecar.captureDraft;
  const assessment = assessProcess(process, version);

  const roleById = new Map(sidecar.roles.map((r) => [r.id, r.name]));
  const systemById = new Map(sidecar.systems.map((s) => [s.id, s.name]));
  const stepById = draft ? new Map(draft.happyPath.map((step) => [step.stepId, step])) : new Map();

  lines.push(`# ${process.title}`);
  lines.push('');
  lines.push(`**Version:** ${version.versionId} | **Status:** ${getProcessStatusLabel(version.status)} | **Erstellt am:** ${formatDateTimeDe(version.createdAt)}`);
  lines.push('');

  lines.push('## Prozessprofil');
  lines.push('');
  lines.push(`- **Kategorie:** ${getProcessCategoryLabel(process.category)}`);
  lines.push(`- **Management-Ebene:** ${getProcessManagementLevelLabel(process.managementLevel)}`);
  lines.push(`- **Hierarchie-Ebene:** ${getProcessHierarchyLevelLabel(process.hierarchyLevel)}`);
  lines.push(`- **Häufigkeit:** ${getFrequencyLabel(sidecar.operationalContext?.frequency)}`);
  lines.push(`- **Typische Durchlaufzeit:** ${getLeadTimeLabel(sidecar.operationalContext?.typicalLeadTime)}`);
  lines.push('');

  lines.push('## End-to-End Definition');
  lines.push('');
  lines.push(`**Trigger (Auslöser):** ${version.endToEndDefinition.trigger || '(nicht erfasst)'}`);
  lines.push('');
  lines.push(`**Kunde (Prozessempfänger):** ${version.endToEndDefinition.customer || '(nicht erfasst)'}`);
  lines.push('');
  lines.push(`**Ergebnis (Output):** ${version.endToEndDefinition.outcome || '(nicht erfasst)'}`);
  lines.push('');
  if (version.endToEndDefinition.doneCriteria) {
    lines.push(`**Done-Kriterium:** ${version.endToEndDefinition.doneCriteria}`);
    lines.push('');
  }

  lines.push('## Happy Path');
  lines.push('');
  if (!draft || draft.happyPath.length === 0) {
    lines.push('Kein Happy Path erfasst');
    lines.push('');
  } else {
    lines.push('| # | Schritt | Status | Rolle | System | Arbeitstyp | Pain Point | Data In | Data Out |');
    lines.push('|---|---------|--------|-------|--------|------------|------------|---------|----------|');
    draft.happyPath.forEach((step) => {
      const roleName = step.roleId ? roleById.get(step.roleId) || step.roleId : '-';
      const systemName = step.systemId ? systemById.get(step.systemId) || step.systemId : '-';
      const workType = getWorkTypeLabel(step.workType);
      const status = getCaptureStatusLabel(step.status);
      const painPoint = step.painPointHint || '-';
      const dataIn = step.dataIn && step.dataIn.length > 0 ? step.dataIn.join(', ') : '-';
      const dataOut = step.dataOut && step.dataOut.length > 0 ? step.dataOut.join(', ') : '-';

      lines.push(`| ${step.order} | ${mdEscapeCell(step.label)} | ${mdEscapeCell(status)} | ${mdEscapeCell(roleName)} | ${mdEscapeCell(systemName)} | ${mdEscapeCell(workType)} | ${mdEscapeCell(painPoint)} | ${mdEscapeCell(dataIn)} | ${mdEscapeCell(dataOut)} |`);
    });
    lines.push('');
  }

  lines.push('## Schritt-Kennzahlen (grob)');
  lines.push('');
  if (!draft || draft.happyPath.length === 0) {
    lines.push('Keine Schritte erfasst');
    lines.push('');
  } else {
    lines.push('| # | Schritt | Bearbeitungszeit | Wartezeit | Volumen | Rework |');
    lines.push('|---|---------|------------------|-----------|---------|--------|');
    draft.happyPath.forEach((step) => {
      const processingTime = getLeadTimeLabel(step.processingTime);
      const waitingTime = getLeadTimeLabel(step.waitingTime);
      const volume = getStepLevelBucketLabel(step.volume);
      const rework = getStepLevelBucketLabel(step.rework);

      lines.push(`| ${step.order} | ${mdEscapeCell(step.label)} | ${mdEscapeCell(processingTime)} | ${mdEscapeCell(waitingTime)} | ${mdEscapeCell(volume)} | ${mdEscapeCell(rework)} |`);
    });
    lines.push('');
  }

  lines.push('## To-Be Hinweise');
  lines.push('');
  const stepsWithToBe = draft ? draft.happyPath.filter((step) => step.toBeHint) : [];
  if (stepsWithToBe.length === 0) {
    lines.push('Keine To-Be Hinweise erfasst');
    lines.push('');
  } else {
    stepsWithToBe.forEach((step) => {
      lines.push(`### ${step.order}. ${step.label}`);
      lines.push('');
      step.toBeHint!.split('\n').forEach((line) => {
        lines.push(`- ${line}`);
      });
      lines.push('');
    });
  }

  lines.push('## Entscheidungen');
  lines.push('');
  if (!draft || draft.decisions.length === 0) {
    lines.push('Keine Entscheidungen erfasst');
    lines.push('');
  } else {
    draft.decisions.forEach((decision) => {
      const afterStep = stepById.get(decision.afterStepId);
      lines.push(`### Nach Schritt: ${afterStep ? `${afterStep.order}. ${afterStep.label}` : decision.afterStepId}`);
      lines.push('');
      lines.push(`**Status:** ${getCaptureStatusLabel(decision.status)}`);
      lines.push('');
      lines.push(`**Frage:** ${decision.question}`);
      lines.push('');
      lines.push(`**Gateway-Typ:** ${getGatewayTypeLabel(decision.gatewayType)}`);
      lines.push('');
      lines.push('**Verzweigungen:**');
      lines.push('');
      decision.branches.forEach((branch) => {
        const nextStep = branch.nextStepId ? stepById.get(branch.nextStepId) : null;
        const target = nextStep ? `${nextStep.order}. ${nextStep.label}` : branch.nextStepId || 'Prozessende';
        lines.push(`- ${branch.conditionLabel} → ${target}`);
      });
      lines.push('');
    });
  }

  lines.push('## Ausnahmen');
  lines.push('');
  if (!draft || draft.exceptions.length === 0) {
    lines.push('Keine Ausnahmen erfasst');
    lines.push('');
  } else {
    draft.exceptions.forEach((exception) => {
      const relatedStep = exception.relatedStepId ? stepById.get(exception.relatedStepId) : null;
      lines.push(`### ${getExceptionTypeLabel(exception.type)}`);
      lines.push('');
      lines.push(`**Status:** ${getCaptureStatusLabel(exception.status)}`);
      lines.push('');
      if (relatedStep) {
        lines.push(`**Bezugsschritt:** ${relatedStep.order}. ${relatedStep.label}`);
        lines.push('');
      }
      if (exception.type === 'timeout') {
        lines.push(`**Timeout-Dauer:** ${exception.timeoutDurationIso || '(nicht gesetzt – Export nutzt Default/Ableitung)'}`);
        lines.push('');
        lines.push(`**Timer-Verhalten:** ${exception.timeoutInterrupting === false ? 'Nicht unterbrechend' : 'Unterbrechend'}`);
        lines.push('');
      }
      lines.push(`**Beschreibung:** ${exception.description}`);
      lines.push('');
      lines.push(`**Handling:** ${exception.handling || '(nicht erfasst)'}`);
      lines.push('');
    });
  }

  lines.push('## Quellen (Evidence)');
  lines.push('');

  const stepEvidence = draft ? draft.happyPath
    .map((s) => ({ step: s, info: getTextEvidenceInfo(s.evidence) }))
    .filter((x) => x.info.refId || x.info.snippet) : [];

  const decisionEvidence = draft ? draft.decisions
    .map((d) => ({ decision: d, info: getTextEvidenceInfo(d.evidence) }))
    .filter((x) => x.info.refId || x.info.snippet) : [];

  const exceptionEvidence = draft ? draft.exceptions
    .map((ex) => ({ exception: ex, info: getTextEvidenceInfo(ex.evidence) }))
    .filter((x) => x.info.refId || x.info.snippet) : [];

  const hasAnyEvidence =
    stepEvidence.length > 0 || decisionEvidence.length > 0 || exceptionEvidence.length > 0;

  if (!hasAnyEvidence) {
    lines.push('Keine Quellen erfasst');
    lines.push('');
  } else {
    if (stepEvidence.length > 0) {
      lines.push('### Happy Path');
      lines.push('');
      stepEvidence.forEach((x) => {
        lines.push(`#### ${x.step.order}. ${x.step.label}`);
        lines.push('');
        if (x.info.refId) {
          lines.push(`**Quelle:** ${x.info.refId}`);
          lines.push('');
        }
        if (x.info.snippet) {
          const quote = x.info.snippet.split('\n').map((l) => `> ${l}`).join('\n');
          lines.push(quote);
          lines.push('');
        } else if (x.info.refId) {
          lines.push('_(kein Snippet)_');
          lines.push('');
        }
      });
    }

    if (decisionEvidence.length > 0) {
      lines.push('### Entscheidungen');
      lines.push('');
      decisionEvidence.forEach((x) => {
        const afterStep = stepById.get(x.decision.afterStepId);
        const ref = afterStep ? `${afterStep.order}. ${afterStep.label}` : x.decision.afterStepId;
        lines.push(`#### Nach Schritt: ${ref}`);
        lines.push('');
        lines.push(`**Frage:** ${x.decision.question || '(ohne Frage)'}`);
        lines.push('');
        if (x.info.refId) {
          lines.push(`**Quelle:** ${x.info.refId}`);
          lines.push('');
        }
        if (x.info.snippet) {
          const quote = x.info.snippet.split('\n').map((l) => `> ${l}`).join('\n');
          lines.push(quote);
          lines.push('');
        } else if (x.info.refId) {
          lines.push('_(kein Snippet)_');
          lines.push('');
        }
      });
    }

    if (exceptionEvidence.length > 0) {
      lines.push('### Ausnahmen');
      lines.push('');
      exceptionEvidence.forEach((x) => {
        lines.push(`#### ${getExceptionTypeLabel(x.exception.type)}`);
        lines.push('');
        if (x.exception.relatedStepId) {
          const rs = stepById.get(x.exception.relatedStepId);
          lines.push(`**Bezugsschritt:** ${rs ? `${rs.order}. ${rs.label}` : x.exception.relatedStepId}`);
          lines.push('');
        }
        if (x.info.refId) {
          lines.push(`**Quelle:** ${x.info.refId}`);
          lines.push('');
        }
        if (x.info.snippet) {
          const quote = x.info.snippet.split('\n').map((l) => `> ${l}`).join('\n');
          lines.push(quote);
          lines.push('');
        } else if (x.info.refId) {
          lines.push('_(kein Snippet)_');
          lines.push('');
        }
      });
    }
  }

  lines.push('## KPIs');
  lines.push('');
  if (sidecar.kpis.length === 0) {
    lines.push('Keine KPIs erfasst');
    lines.push('');
  } else {
    lines.push('| Name | Definition | Einheit | Zielwert |');
    lines.push('|------|------------|---------|----------|');
    sidecar.kpis.forEach((kpi) => {
      lines.push(`| ${mdEscapeCell(kpi.name)} | ${mdEscapeCell(kpi.definition || '-')} | ${mdEscapeCell(kpi.unit || '-')} | ${mdEscapeCell(kpi.target || '-')} |`);
    });
    lines.push('');
  }

  if (sidecar.aiReadinessSignals) {
    lines.push('## KI-Reife Signale');
    lines.push('');
    lines.push(`- **Standardisierung:** ${getLevel3Label(sidecar.aiReadinessSignals.standardization)}`);
    lines.push(`- **Datenverfügbarkeit:** ${getLevel3Label(sidecar.aiReadinessSignals.dataAvailability)}`);
    lines.push(`- **Variabilität:** ${getLevel3Label(sidecar.aiReadinessSignals.variability)}`);
    lines.push(`- **Compliance-Risiko:** ${getLevel3Label(sidecar.aiReadinessSignals.complianceRisk)}`);
    lines.push('');
  }

  lines.push('## Maßnahmen-Backlog');
  lines.push('');
  if (!sidecar.improvementBacklog || sidecar.improvementBacklog.length === 0) {
    lines.push('Keine Maßnahmen erfasst');
    lines.push('');
  } else {
    const itemsWithScores = sidecar.improvementBacklog.map((item) => ({
      item,
      score: computePriorityScore(item),
      updatedAt: new Date(item.updatedAt).getTime(),
    }));
    const sortedItems = itemsWithScores.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);
    const top20 = sortedItems.slice(0, 20);

    lines.push('### Top 20 (nach Priorität)');
    lines.push('');
    top20.forEach(({ item, score }) => {
      const priorityLabel = getPriorityLabel(score);
      const categoryLabel = getCategoryLabel(item.category);
      const statusLabel = getStatusLabel(item.status);
      const step = item.relatedStepId ? stepById.get(item.relatedStepId) : null;
      const scopeText = item.scope === 'process' ? 'Prozess' : (step ? formatStepRef(step) : item.relatedStepId || 'Schritt');
      const owner = item.owner || '-';
      const dueDate = item.dueDate ? new Date(item.dueDate).toLocaleDateString('de-DE') : '-';

      lines.push(`**[${priorityLabel} ${formatSignedScore(score)}] ${item.title}**`);
      lines.push(`Status: ${statusLabel} | Kategorie: ${categoryLabel} | Scope: ${scopeText} | Verantwortlich: ${owner} | Fällig: ${dueDate}`);

      if (item.automationBlueprint) {
        const bp = item.automationBlueprint;
        const approachLabels: Record<string, string> = {
          workflow: 'Workflow',
          rpa: 'RPA',
          api_integration: 'API-Integration',
          erp_config: 'ERP-Konfiguration',
          low_code: 'Low-Code',
          ai_assistant: 'KI-Assistent',
          ai_document_processing: 'KI-Dokumente',
          ai_classification: 'KI-Klassifikation',
          process_mining: 'Process Mining',
          other: 'Sonstiges',
        };
        const levelLabels: Record<string, string> = {
          assist: 'Assistiert',
          partial: 'Teilautomatisiert',
          straight_through: 'Vollautomatisiert',
        };
        const approach = approachLabels[bp.approach] || bp.approach;
        const level = levelLabels[bp.level] || bp.level;
        const hitl = bp.humanInTheLoop ? 'Ja' : 'Nein';
        lines.push(`  *Umsetzung: ${approach} | Zielgrad: ${level} | HITL: ${hitl}*`);
      }
      if (item.impactEstimate && (item.impactEstimate.affectedCaseSharePct !== undefined || item.impactEstimate.leadTimeSavingMinPerCase !== undefined)) {
        const affected = item.impactEstimate.affectedCaseSharePct ?? 100;
        const saving = item.impactEstimate.leadTimeSavingMinPerCase ?? 0;
        lines.push(`  *Impact-Schätzung: ${affected}% betroffen, ${saving} min pro Fall*`);
        if (item.impactEstimate.notes) {
          lines.push(`  *Notiz: ${item.impactEstimate.notes}*`);
        }
      }
      lines.push('');
    });
  }

  lines.push('## Qualität: Benennungshinweise');
  lines.push('');
  if (version.quality.namingFindings.length === 0) {
    lines.push('Keine Auffälligkeiten');
    lines.push('');
  } else {
    version.quality.namingFindings.forEach((finding) => {
      lines.push(`- [${finding.severity.toUpperCase()}] ${finding.message}`);
      if (finding.exampleFix) {
        lines.push(`  *Vorschlag: ${finding.exampleFix}*`);
      }
    });
    lines.push('');
  }

  lines.push('## Qualität: Semantische Prüffragen');
  lines.push('');
  if (version.quality.semanticQuestions.length === 0) {
    lines.push('Keine Fragen generiert');
    lines.push('');
  } else {
    version.quality.semanticQuestions.forEach((question) => {
      lines.push(`- ${question.question}`);
      if (question.relatedStepHint) {
        lines.push(`  *Bezug: ${question.relatedStepHint}*`);
      }
    });
    lines.push('');
  }

  lines.push('## Assessment: Digitalisierung & Automatisierung');
  lines.push('');
  lines.push(`**Gesamtbewertung:** ${assessment.overallScore0to100}/100`);
  lines.push('');
  lines.push(assessment.summary);
  lines.push('');

  lines.push('### Top 10 Dimensionen');
  lines.push('');
  assessment.dimensions.slice(0, 10).forEach((dim) => {
    const levelLabel = dim.level === 'high' ? 'Hoch' : dim.level === 'medium' ? 'Mittel' : 'Niedrig';
    lines.push(`**${dim.label}:** ${dim.score0to100}/100 (${levelLabel})`);
    lines.push('');
    if (dim.recommendations.length > 0) {
      dim.recommendations.slice(0, 3).forEach((rec) => {
        lines.push(`- ${rec}`);
      });
      lines.push('');
    }
  });

  if (assessment.nextSteps.length > 0) {
    lines.push('### Nächste Schritte');
    lines.push('');
    assessment.nextSteps.slice(0, 10).forEach((step, idx) => {
      lines.push(`${idx + 1}. ${step}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

export function buildReportHtml(process: Process, version: ProcessVersion): string {
  const sidecar = version.sidecar;
  const draft = sidecar.captureDraft;
  const assessment = assessProcess(process, version);

  const roleById = new Map(sidecar.roles.map((r) => [r.id, r.name]));
  const systemById = new Map(sidecar.systems.map((s) => [s.id, s.name]));
  const stepById = draft ? new Map(draft.happyPath.map((step) => [step.stepId, step])) : new Map();

  const css = `
    body {
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
      color: #0f172a;
      margin: 24px;
      line-height: 1.6;
    }
    h1 {
      font-size: 26px;
      margin: 0 0 8px 0;
      font-weight: 700;
    }
    h2 {
      font-size: 18px;
      margin: 24px 0 10px;
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
      font-weight: 600;
    }
    h3 {
      font-size: 16px;
      margin: 16px 0 8px;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin: 12px 0;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 6px 8px;
      vertical-align: top;
      text-align: left;
    }
    th {
      background: #f8fafc;
      font-weight: 600;
    }
    .muted {
      color: #475569;
      font-size: 12px;
    }
    .no-print {
      margin-left: 8px;
    }
    .meta {
      color: #64748b;
      font-size: 14px;
      margin-bottom: 24px;
    }
    .section {
      margin: 24px 0;
    }
    dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px 16px;
      font-size: 14px;
    }
    dt {
      font-weight: 600;
    }
    dd {
      margin: 0;
    }
    ul {
      margin: 8px 0;
      padding-left: 24px;
    }
    li {
      margin: 4px 0;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-high { background: #dcfce7; color: #166534; }
    .badge-medium { background: #fef3c7; color: #92400e; }
    .badge-low { background: #fee2e2; color: #991b1b; }
    blockquote {
      margin: 10px 0;
      padding: 10px 12px;
      border-left: 4px solid #e2e8f0;
      background: #f8fafc;
      white-space: pre-wrap;
    }
    @media print {
      .no-print {
        display: none !important;
      }
      body {
        margin: 12mm;
      }
      h2 {
        page-break-before: auto;
      }
      table {
        page-break-inside: avoid;
      }
    }
  `;

  let html = '<!DOCTYPE html>\n<html lang="de">\n<head>\n';
  html += '<meta charset="UTF-8">\n';
  html += '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
  html += `<title>${escapeHtml(process.title)} - Prozessreport</title>\n`;
  html += `<style>${css}</style>\n`;
  html += '</head>\n<body>\n';

  html += '<div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:24px;">\n';
  html += `<div><h1>${escapeHtml(process.title)}</h1>\n`;
  html += `<p class="meta">Version: ${escapeHtml(version.versionId)} · Status: ${escapeHtml(getProcessStatusLabel(version.status))} · Erstellt am: ${escapeHtml(formatDateTimeDe(version.createdAt))}</p></div>\n`;
  html += '<button class="no-print" onclick="window.print()" style="padding:12px 24px; background:#0f172a; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Drucken / als PDF speichern</button>\n';
  html += '</div>\n';

  html += '<div class="section">\n<h2>Prozessprofil</h2>\n';
  html += '<dl>\n';
  html += `<dt>Kategorie</dt><dd>${escapeHtml(getProcessCategoryLabel(process.category))}</dd>\n`;
  html += `<dt>Management-Ebene</dt><dd>${escapeHtml(getProcessManagementLevelLabel(process.managementLevel))}</dd>\n`;
  html += `<dt>Hierarchie-Ebene</dt><dd>${escapeHtml(getProcessHierarchyLevelLabel(process.hierarchyLevel))}</dd>\n`;
  html += `<dt>Häufigkeit</dt><dd>${escapeHtml(getFrequencyLabel(sidecar.operationalContext?.frequency))}</dd>\n`;
  html += `<dt>Typische Durchlaufzeit</dt><dd>${escapeHtml(getLeadTimeLabel(sidecar.operationalContext?.typicalLeadTime))}</dd>\n`;
  html += '</dl>\n</div>\n';

  html += '<div class="section">\n<h2>End-to-End Definition</h2>\n';
  html += '<dl>\n';
  html += `<dt>Trigger (Auslöser)</dt><dd>${escapeHtml(version.endToEndDefinition.trigger || '(nicht erfasst)')}</dd>\n`;
  html += `<dt>Kunde (Prozessempfänger)</dt><dd>${escapeHtml(version.endToEndDefinition.customer || '(nicht erfasst)')}</dd>\n`;
  html += `<dt>Ergebnis (Output)</dt><dd>${escapeHtml(version.endToEndDefinition.outcome || '(nicht erfasst)')}</dd>\n`;
  if (version.endToEndDefinition.doneCriteria) {
    html += `<dt>Done-Kriterium</dt><dd>${escapeHtml(version.endToEndDefinition.doneCriteria)}</dd>\n`;
  }
  html += '</dl>\n</div>\n';

  html += '<div class="section">\n<h2>Happy Path</h2>\n';
  if (!draft || draft.happyPath.length === 0) {
    html += '<p class="muted">Kein Happy Path erfasst</p>\n';
  } else {
    html += '<table>\n<thead>\n<tr>\n';
    html += '<th>#</th><th>Schritt</th><th>Status</th><th>Rolle</th><th>System</th><th>Arbeitstyp</th><th>Pain Point</th><th>Data In</th><th>Data Out</th>\n';
    html += '</tr>\n</thead>\n<tbody>\n';
    draft.happyPath.forEach((step) => {
      const roleName = step.roleId ? roleById.get(step.roleId) || step.roleId : '-';
      const systemName = step.systemId ? systemById.get(step.systemId) || step.systemId : '-';
      const workType = getWorkTypeLabel(step.workType);
      const status = getCaptureStatusLabel(step.status);
      const painPoint = step.painPointHint || '-';
      const dataIn = step.dataIn && step.dataIn.length > 0 ? step.dataIn.join(', ') : '-';
      const dataOut = step.dataOut && step.dataOut.length > 0 ? step.dataOut.join(', ') : '-';

      html += `<tr><td>${step.order}</td><td>${escapeHtml(step.label)}</td><td>${escapeHtml(status)}</td><td>${escapeHtml(roleName)}</td><td>${escapeHtml(systemName)}</td><td>${escapeHtml(workType)}</td><td>${escapeHtml(painPoint)}</td><td>${escapeHtml(dataIn)}</td><td>${escapeHtml(dataOut)}</td></tr>\n`;
    });
    html += '</tbody>\n</table>\n';
  }
  html += '</div>\n';

  html += '<div class="section">\n<h2>Schritt-Kennzahlen (grob)</h2>\n';
  if (!draft || draft.happyPath.length === 0) {
    html += '<p class="muted">Keine Schritte erfasst</p>\n';
  } else {
    html += '<table>\n<thead>\n<tr>\n';
    html += '<th>#</th><th>Schritt</th><th>Bearbeitungszeit</th><th>Wartezeit</th><th>Volumen</th><th>Rework</th>\n';
    html += '</tr>\n</thead>\n<tbody>\n';
    draft.happyPath.forEach((step) => {
      const processingTime = getLeadTimeLabel(step.processingTime);
      const waitingTime = getLeadTimeLabel(step.waitingTime);
      const volume = getStepLevelBucketLabel(step.volume);
      const rework = getStepLevelBucketLabel(step.rework);

      html += `<tr><td>${step.order}</td><td>${escapeHtml(step.label)}</td><td>${escapeHtml(processingTime)}</td><td>${escapeHtml(waitingTime)}</td><td>${escapeHtml(volume)}</td><td>${escapeHtml(rework)}</td></tr>\n`;
    });
    html += '</tbody>\n</table>\n';
  }
  html += '</div>\n';

  html += '<div class="section">\n<h2>To-Be Hinweise</h2>\n';
  const stepsWithToBe = draft ? draft.happyPath.filter((step) => step.toBeHint) : [];
  if (stepsWithToBe.length === 0) {
    html += '<p class="muted">Keine To-Be Hinweise erfasst</p>\n';
  } else {
    stepsWithToBe.forEach((step) => {
      html += `<h3>${step.order}. ${escapeHtml(step.label)}</h3>\n`;
      html += '<ul>\n';
      step.toBeHint!.split('\n').forEach((line) => {
        html += `<li>${escapeHtml(line)}</li>\n`;
      });
      html += '</ul>\n';
    });
  }
  html += '</div>\n';

  html += '<div class="section">\n<h2>Entscheidungen</h2>\n';
  if (!draft || draft.decisions.length === 0) {
    html += '<p class="muted">Keine Entscheidungen erfasst</p>\n';
  } else {
    draft.decisions.forEach((decision) => {
      const afterStep = stepById.get(decision.afterStepId);
      html += `<h3>Nach Schritt: ${escapeHtml(afterStep ? `${afterStep.order}. ${afterStep.label}` : decision.afterStepId)}</h3>\n`;
      html += '<dl>\n';
      html += `<dt>Status</dt><dd>${escapeHtml(getCaptureStatusLabel(decision.status))}</dd>\n`;
      html += `<dt>Frage</dt><dd>${escapeHtml(decision.question)}</dd>\n`;
      html += `<dt>Gateway-Typ</dt><dd>${escapeHtml(getGatewayTypeLabel(decision.gatewayType))}</dd>\n`;
      html += '<dt>Verzweigungen</dt><dd><ul>\n';
      decision.branches.forEach((branch) => {
        const nextStep = branch.nextStepId ? stepById.get(branch.nextStepId) : null;
        const target = nextStep ? `${nextStep.order}. ${nextStep.label}` : branch.nextStepId || 'Prozessende';
        html += `<li>${escapeHtml(branch.conditionLabel)} → ${escapeHtml(target)}</li>\n`;
      });
      html += '</ul></dd>\n';
      html += '</dl>\n';
    });
  }
  html += '</div>\n';

  html += '<div class="section">\n<h2>Ausnahmen</h2>\n';
  if (!draft || draft.exceptions.length === 0) {
    html += '<p class="muted">Keine Ausnahmen erfasst</p>\n';
  } else {
    draft.exceptions.forEach((exception) => {
      const relatedStep = exception.relatedStepId ? stepById.get(exception.relatedStepId) : null;
      html += `<h3>${escapeHtml(getExceptionTypeLabel(exception.type))}</h3>\n`;
      html += '<dl>\n';
      html += `<dt>Status</dt><dd>${escapeHtml(getCaptureStatusLabel(exception.status))}</dd>\n`;
      if (relatedStep) {
        html += `<dt>Bezugsschritt</dt><dd>${escapeHtml(`${relatedStep.order}. ${relatedStep.label}`)}</dd>\n`;
      }
      if (exception.type === 'timeout') {
        html += `<dt>Timeout-Dauer</dt><dd>${escapeHtml(exception.timeoutDurationIso || '(nicht gesetzt – Export nutzt Default/Ableitung)')}</dd>\n`;
        html += `<dt>Timer-Verhalten</dt><dd>${escapeHtml(exception.timeoutInterrupting === false ? 'Nicht unterbrechend' : 'Unterbrechend')}</dd>\n`;
      }
      html += `<dt>Beschreibung</dt><dd>${escapeHtml(exception.description)}</dd>\n`;
      html += `<dt>Handling</dt><dd>${escapeHtml(exception.handling || '(nicht erfasst)')}</dd>\n`;
      html += '</dl>\n';
    });
  }
  html += '</div>\n';

  html += '<div class="section">\n<h2>Quellen (Evidence)</h2>\n';

  const stepEvidenceHtml = draft ? draft.happyPath
    .map((s) => ({ step: s, info: getTextEvidenceInfo(s.evidence) }))
    .filter((x) => x.info.refId || x.info.snippet) : [];

  const decisionEvidenceHtml = draft ? draft.decisions
    .map((d) => ({ decision: d, info: getTextEvidenceInfo(d.evidence) }))
    .filter((x) => x.info.refId || x.info.snippet) : [];

  const exceptionEvidenceHtml = draft ? draft.exceptions
    .map((ex) => ({ exception: ex, info: getTextEvidenceInfo(ex.evidence) }))
    .filter((x) => x.info.refId || x.info.snippet) : [];

  const hasAnyEvidenceHtml =
    stepEvidenceHtml.length > 0 || decisionEvidenceHtml.length > 0 || exceptionEvidenceHtml.length > 0;

  if (!hasAnyEvidenceHtml) {
    html += '<p class="muted">Keine Quellen erfasst</p>\n';
  } else {
    if (stepEvidenceHtml.length > 0) {
      html += '<h3>Happy Path</h3>\n';
      stepEvidenceHtml.forEach((x) => {
        html += `<h4>${x.step.order}. ${escapeHtml(x.step.label)}</h4>\n`;
        if (x.info.refId) {
          html += `<p><strong>Quelle:</strong> ${escapeHtml(x.info.refId)}</p>\n`;
        }
        if (x.info.snippet) {
          html += `<blockquote>${escapeHtml(x.info.snippet)}</blockquote>\n`;
        } else if (x.info.refId) {
          html += '<p class="muted">(kein Snippet)</p>\n';
        }
      });
    }

    if (decisionEvidenceHtml.length > 0) {
      html += '<h3>Entscheidungen</h3>\n';
      decisionEvidenceHtml.forEach((x) => {
        const afterStep = stepById.get(x.decision.afterStepId);
        const ref = afterStep ? `${afterStep.order}. ${afterStep.label}` : x.decision.afterStepId;
        html += `<h4>Nach Schritt: ${escapeHtml(ref)}</h4>\n`;
        html += `<p><strong>Frage:</strong> ${escapeHtml(x.decision.question || '(ohne Frage)')}</p>\n`;
        if (x.info.refId) {
          html += `<p><strong>Quelle:</strong> ${escapeHtml(x.info.refId)}</p>\n`;
        }
        if (x.info.snippet) {
          html += `<blockquote>${escapeHtml(x.info.snippet)}</blockquote>\n`;
        } else if (x.info.refId) {
          html += '<p class="muted">(kein Snippet)</p>\n';
        }
      });
    }

    if (exceptionEvidenceHtml.length > 0) {
      html += '<h3>Ausnahmen</h3>\n';
      exceptionEvidenceHtml.forEach((x) => {
        html += `<h4>${escapeHtml(getExceptionTypeLabel(x.exception.type))}</h4>\n`;
        if (x.exception.relatedStepId) {
          const rs = stepById.get(x.exception.relatedStepId);
          html += `<p><strong>Bezugsschritt:</strong> ${escapeHtml(rs ? `${rs.order}. ${rs.label}` : x.exception.relatedStepId)}</p>\n`;
        }
        if (x.info.refId) {
          html += `<p><strong>Quelle:</strong> ${escapeHtml(x.info.refId)}</p>\n`;
        }
        if (x.info.snippet) {
          html += `<blockquote>${escapeHtml(x.info.snippet)}</blockquote>\n`;
        } else if (x.info.refId) {
          html += '<p class="muted">(kein Snippet)</p>\n';
        }
      });
    }
  }
  html += '</div>\n';

  html += '<div class="section">\n<h2>KPIs</h2>\n';
  if (sidecar.kpis.length === 0) {
    html += '<p class="muted">Keine KPIs erfasst</p>\n';
  } else {
    html += '<table>\n<thead>\n<tr><th>Name</th><th>Definition</th><th>Einheit</th><th>Zielwert</th></tr>\n</thead>\n<tbody>\n';
    sidecar.kpis.forEach((kpi) => {
      html += `<tr><td>${escapeHtml(kpi.name)}</td><td>${escapeHtml(kpi.definition || '-')}</td><td>${escapeHtml(kpi.unit || '-')}</td><td>${escapeHtml(kpi.target || '-')}</td></tr>\n`;
    });
    html += '</tbody>\n</table>\n';
  }
  html += '</div>\n';

  if (sidecar.aiReadinessSignals) {
    html += '<div class="section">\n<h2>KI-Reife Signale</h2>\n';
    html += '<dl>\n';
    html += `<dt>Standardisierung</dt><dd>${escapeHtml(getLevel3Label(sidecar.aiReadinessSignals.standardization))}</dd>\n`;
    html += `<dt>Datenverfügbarkeit</dt><dd>${escapeHtml(getLevel3Label(sidecar.aiReadinessSignals.dataAvailability))}</dd>\n`;
    html += `<dt>Variabilität</dt><dd>${escapeHtml(getLevel3Label(sidecar.aiReadinessSignals.variability))}</dd>\n`;
    html += `<dt>Compliance-Risiko</dt><dd>${escapeHtml(getLevel3Label(sidecar.aiReadinessSignals.complianceRisk))}</dd>\n`;
    html += '</dl>\n</div>\n';
  }

  html += '<div class="section">\n<h2>Maßnahmen-Backlog</h2>\n';
  if (!sidecar.improvementBacklog || sidecar.improvementBacklog.length === 0) {
    html += '<p class="muted">Keine Maßnahmen erfasst</p>\n';
  } else {
    const itemsWithScores = sidecar.improvementBacklog.map((item) => ({
      item,
      score: computePriorityScore(item),
      updatedAt: new Date(item.updatedAt).getTime(),
    }));
    const sortedItems = itemsWithScores.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);
    const top20 = sortedItems.slice(0, 20);

    html += '<h3>Top 20 (nach Priorität)</h3>\n';
    html += '<table>\n<thead>\n<tr><th>Priorität</th><th>Status</th><th>Kategorie</th><th>Maßnahme</th><th>Scope</th><th>Verantwortlich</th><th>Fällig</th></tr>\n</thead>\n<tbody>\n';
    top20.forEach(({ item, score }) => {
      const priorityLabel = getPriorityLabel(score);
      const badgeClass = score >= 3 ? 'badge-high' : score >= 1 ? 'badge-medium' : 'badge-low';
      const categoryLabel = getCategoryLabel(item.category);
      const statusLabel = getStatusLabel(item.status);
      const step = item.relatedStepId ? stepById.get(item.relatedStepId) : null;
      const scopeText = item.scope === 'process' ? 'Prozess' : (step ? formatStepRef(step) : item.relatedStepId || 'Schritt');
      const owner = item.owner || '-';
      const dueDate = item.dueDate ? new Date(item.dueDate).toLocaleDateString('de-DE') : '-';

      html += `<tr><td><span class="badge ${badgeClass}">${priorityLabel} ${formatSignedScore(score)}</span></td><td>${escapeHtml(statusLabel)}</td><td>${escapeHtml(categoryLabel)}</td><td>${escapeHtml(item.title)}`;

      if (item.automationBlueprint) {
        const bp = item.automationBlueprint;
        const approachLabels: Record<string, string> = {
          workflow: 'Workflow',
          rpa: 'RPA',
          api_integration: 'API-Integration',
          erp_config: 'ERP-Konfiguration',
          low_code: 'Low-Code',
          ai_assistant: 'KI-Assistent',
          ai_document_processing: 'KI-Dokumente',
          ai_classification: 'KI-Klassifikation',
          process_mining: 'Process Mining',
          other: 'Sonstiges',
        };
        const levelLabels: Record<string, string> = {
          assist: 'Assistiert',
          partial: 'Teilautomatisiert',
          straight_through: 'Vollautomatisiert',
        };
        const approach = approachLabels[bp.approach] || bp.approach;
        const level = levelLabels[bp.level] || bp.level;
        const hitl = bp.humanInTheLoop ? 'Ja' : 'Nein';
        html += `<br><span class="muted">Umsetzung: ${escapeHtml(approach)} · Zielgrad: ${escapeHtml(level)} · HITL: ${hitl}</span>`;
      }
      if (item.impactEstimate && (item.impactEstimate.affectedCaseSharePct !== undefined || item.impactEstimate.leadTimeSavingMinPerCase !== undefined)) {
        const affected = item.impactEstimate.affectedCaseSharePct ?? 100;
        const saving = item.impactEstimate.leadTimeSavingMinPerCase ?? 0;
        html += `<br><span class="muted">Impact-Schätzung: ${affected}% betroffen, ${saving} min pro Fall</span>`;
        if (item.impactEstimate.notes) {
          html += `<br><span class="muted">Notiz: ${escapeHtml(item.impactEstimate.notes)}</span>`;
        }
      }

      html += `</td><td>${escapeHtml(scopeText)}</td><td>${escapeHtml(owner)}</td><td>${escapeHtml(dueDate)}</td></tr>\n`;
    });
    html += '</tbody>\n</table>\n';
  }
  html += '</div>\n';

  html += '<div class="section">\n<h2>Qualität: Benennungshinweise</h2>\n';
  if (version.quality.namingFindings.length === 0) {
    html += '<p class="muted">Keine Auffälligkeiten</p>\n';
  } else {
    html += '<ul>\n';
    version.quality.namingFindings.forEach((finding) => {
      html += `<li><strong>[${finding.severity.toUpperCase()}]</strong> ${escapeHtml(finding.message)}`;
      if (finding.exampleFix) {
        html += `<br><span class="muted">Vorschlag: ${escapeHtml(finding.exampleFix)}</span>`;
      }
      html += '</li>\n';
    });
    html += '</ul>\n';
  }
  html += '</div>\n';

  html += '<div class="section">\n<h2>Qualität: Semantische Prüffragen</h2>\n';
  if (version.quality.semanticQuestions.length === 0) {
    html += '<p class="muted">Keine Fragen generiert</p>\n';
  } else {
    html += '<ul>\n';
    version.quality.semanticQuestions.forEach((question) => {
      html += `<li>${escapeHtml(question.question)}`;
      if (question.relatedStepHint) {
        html += `<br><span class="muted">Bezug: ${escapeHtml(question.relatedStepHint)}</span>`;
      }
      html += '</li>\n';
    });
    html += '</ul>\n';
  }
  html += '</div>\n';

  html += '<div class="section">\n<h2>Assessment: Digitalisierung & Automatisierung</h2>\n';
  html += `<p><strong>Gesamtbewertung:</strong> ${assessment.overallScore0to100}/100</p>\n`;
  html += `<p>${escapeHtml(assessment.summary)}</p>\n`;

  html += '<h3>Top 10 Dimensionen</h3>\n';
  assessment.dimensions.slice(0, 10).forEach((dim) => {
    const levelLabel = dim.level === 'high' ? 'Hoch' : dim.level === 'medium' ? 'Mittel' : 'Niedrig';
    const badgeClass = dim.level === 'high' ? 'badge-high' : dim.level === 'medium' ? 'badge-medium' : 'badge-low';
    html += `<h3>${escapeHtml(dim.label)} <span class="badge ${badgeClass}">${levelLabel}</span></h3>\n`;
    html += `<p><strong>Score:</strong> ${dim.score0to100}/100</p>\n`;
    if (dim.recommendations.length > 0) {
      html += '<ul>\n';
      dim.recommendations.slice(0, 3).forEach((rec) => {
        html += `<li>${escapeHtml(rec)}</li>\n`;
      });
      html += '</ul>\n';
    }
  });

  if (assessment.nextSteps.length > 0) {
    html += '<h3>Nächste Schritte</h3>\n';
    html += '<ol>\n';
    assessment.nextSteps.slice(0, 10).forEach((step) => {
      html += `<li>${escapeHtml(step)}</li>\n`;
    });
    html += '</ol>\n';
  }
  html += '</div>\n';

  html += '</body>\n</html>';

  return html;
}

export function downloadReportMarkdown(process: Process, version: ProcessVersion): { filename: string } {
  const content = buildReportMarkdown(process, version);
  const baseName = sanitizeFilename(process.title);
  const versionShort = version.versionId.replace('v', '').padStart(3, '0');
  const dateStamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const filename = `${baseName}__report__${versionShort}__${dateStamp}.md`;
  downloadTextFile(filename, content, 'text/markdown;charset=utf-8');
  return { filename };
}

export function downloadReportHtml(process: Process, version: ProcessVersion): { filename: string } {
  const content = buildReportHtml(process, version);
  const baseName = sanitizeFilename(process.title);
  const versionShort = version.versionId.replace('v', '').padStart(3, '0');
  const dateStamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const filename = `${baseName}__report__${versionShort}__${dateStamp}.html`;
  downloadTextFile(filename, content, 'text/html;charset=utf-8');
  return { filename };
}

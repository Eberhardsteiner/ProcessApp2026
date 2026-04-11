import type { ProcessMiningObservationCase, SourceRoutingContext } from '../domain/process';

const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\.\d{2}\.\d{4}\b/i;
const CASE_RE = /\b(case|fall|ticket|incident|request|vorgang|id)\b/i;
const ACTIVITY_RE = /\b(pr[üu]fen|erfassen|anlegen|bearbeiten|freigeben|versenden|prüfen|validieren|abschlie[ßs]en|weiterleiten|dokumentieren|informieren|eskalieren|zuordnen|bewerten|bestellen)\b/i;

function ratio(part: number, total: number): number {
  if (!total) return 0;
  return part / total;
}

function confidenceFromScore(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.75) return 'high';
  if (score >= 0.45) return 'medium';
  return 'low';
}

export function routeSourceMaterial(input: {
  text: string;
  sourceType: ProcessMiningObservationCase['sourceType'];
}): SourceRoutingContext {
  const normalized = input.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
  const total = Math.max(lines.length, 1);
  const shortOrCommentLines = lines.filter(line => line.length < 5 || /^[-*#\/]{1,3}$/.test(line)).length;

  const pipeRows = lines.filter(line => /\|/.test(line) && line.split('|').length >= 4).length;
  const csvRows = lines.filter(line => /,|;|\t/.test(line) && line.split(/[,;\t]/).length >= 4).length;
  const tabularRows = Math.max(pipeRows, csvRows);

  const numberedListRows = lines.filter(line => /^\d+[.)\-]\s+/.test(line)).length;
  const headingRows = lines.filter(line => /^\d+[.)]\s+.{4,}|^#+\s+.{4,}|^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\s]{5,}:$/.test(line)).length;
  const timelineRows = lines.filter(line => TIME_RE.test(line)).length;
  const narrativeRows = lines.filter(line => /\b(ich|wir|dann|anschließend|danach|zuerst|später|kunde meldet|als nächstes)\b/i.test(line)).length;
  const activityRows = lines.filter(line => ACTIVITY_RE.test(line)).length;
  const caseRows = lines.filter(line => CASE_RE.test(line)).length;
  const avgLineLen = lines.reduce((sum, line) => sum + line.length, 0) / total;

  const tabularShare = ratio(tabularRows, total);
  const listShare = ratio(numberedListRows + headingRows, total);
  const narrativeShare = ratio(narrativeRows + timelineRows, total);
  const weakShare = ratio(shortOrCommentLines, total);
  const activityShare = ratio(activityRows, total);
  const caseShare = ratio(caseRows, total);

  const eventlogScore = (tabularShare * 0.45) + (ratio(timelineRows, total) * 0.2) + (caseShare * 0.2) + (activityShare * 0.15);
  const structuredScore = (listShare * 0.45) + (activityShare * 0.3) + (ratio(headingRows, total) * 0.25);
  const semiStructuredScore = (tabularShare * 0.35) + (listShare * 0.35) + (activityShare * 0.3);
  const narrativeScore = (narrativeShare * 0.5) + (activityShare * 0.2) + (ratio(avgLineLen >= 60 ? 1 : 0, 1) * 0.3);

  const signals = [
    `tabularShare=${tabularShare.toFixed(2)}`,
    `listShare=${listShare.toFixed(2)}`,
    `narrativeShare=${narrativeShare.toFixed(2)}`,
    `activityShare=${activityShare.toFixed(2)}`,
    `caseShare=${caseShare.toFixed(2)}`,
    `weakShare=${weakShare.toFixed(2)}`,
  ];

  if (weakShare >= 0.45 || lines.length < 4) {
    return {
      routingClass: 'weak-raw-table',
      routingConfidence: 'low',
      routingSignals: [...signals, 'defensiveDowngrade=weak-material'],
      fallbackReason: 'Zu wenig belastbare Struktur- oder Inhaltsdichte für einen starken Analysepfad.',
    };
  }

  if (eventlogScore >= 0.7 && tabularShare >= 0.45 && caseShare >= 0.15 && ratio(timelineRows, total) >= 0.15) {
    return {
      routingClass: 'eventlog-table',
      routingConfidence: confidenceFromScore(eventlogScore),
      routingSignals: [...signals, `eventlogScore=${eventlogScore.toFixed(2)}`],
    };
  }

  if (structuredScore >= 0.6 && listShare >= 0.3) {
    return {
      routingClass: 'structured-procedure',
      routingConfidence: confidenceFromScore(structuredScore),
      routingSignals: [...signals, `structuredScore=${structuredScore.toFixed(2)}`],
    };
  }

  if (semiStructuredScore >= 0.55 && tabularShare >= 0.2) {
    return {
      routingClass: 'semi-structured-procedure',
      routingConfidence: confidenceFromScore(semiStructuredScore),
      routingSignals: [...signals, `semiStructuredScore=${semiStructuredScore.toFixed(2)}`],
    };
  }

  if (narrativeScore >= 0.55 && narrativeShare >= 0.2 && tabularShare < 0.35) {
    return {
      routingClass: 'narrative-case',
      routingConfidence: confidenceFromScore(narrativeScore),
      routingSignals: [...signals, `narrativeScore=${narrativeScore.toFixed(2)}`],
    };
  }

  if (tabularShare >= 0.15 && narrativeShare >= 0.15) {
    return {
      routingClass: 'mixed-document',
      routingConfidence: 'medium',
      routingSignals: [...signals, 'mixedSignals=table+text'],
    };
  }

  return {
    routingClass: 'weak-raw-table',
    routingConfidence: 'low',
    routingSignals: [...signals, 'defensiveDowngrade=ambiguous'],
    fallbackReason: 'Signale sind widersprüchlich oder zu schwach für einen stabilen Klassenpfad.',
  };
}

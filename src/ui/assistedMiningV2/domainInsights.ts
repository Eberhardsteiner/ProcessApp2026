import type {
  DerivationSummary,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
} from '../../domain/process';
import { normalizeLabel, normalizeWhitespace, sentenceCase, uniqueStrings } from './pmShared';
import { inferStepFamily } from './semanticStepFamilies';

export type DomainPackId = 'complaint-management' | 'service-case' | 'generic';
export type DomainInsightSeverity = 'high' | 'medium' | 'low';

export interface DomainFinding {
  id: string;
  title: string;
  detail: string;
  severity: DomainInsightSeverity;
  category:
    | 'intake'
    | 'priority'
    | 'knowledge'
    | 'systems'
    | 'coordination'
    | 'approval'
    | 'communication'
    | 'other';
  evidence: string[];
  recommendedAction?: string;
  relatedCaseCount: number;
}

export interface DomainMissingField {
  key: string;
  label: string;
  importance: 'critical' | 'important';
  status: 'present' | 'missing' | 'unclear';
  evidence?: string;
}

export interface DomainRoleAction {
  role: string;
  actions: string[];
}

export interface DomainInsightResult {
  packId: DomainPackId;
  packLabel: string;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  findings: DomainFinding[];
  missingFields: DomainMissingField[];
  topRecommendations: string[];
  roleActions: DomainRoleAction[];
  matchedSignals: string[];
  systems: string[];
  roles: string[];
}

interface DomainContext {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  lastDerivationSummary?: DerivationSummary;
}

interface RequiredFieldDefinition {
  key: string;
  label: string;
  importance: 'critical' | 'important';
  presentPatterns: RegExp[];
  missingPatterns: RegExp[];
}

const COMPLAINT_KEYWORDS: RegExp[] = [
  /reklamat/i,
  /qualit[aä]tsabweichung/i,
  /stillstand/i,
  /seriennummer/i,
  /auftragsnummer/i,
  /kulanz/i,
  /ersatzteil/i,
  /remote/i,
  /fehlermeldung/i,
  /defekt/i,
  /schichtplanung/i,
  /sensor/i,
];

const SERVICE_KEYWORDS: RegExp[] = [
  /service/i,
  /st[öo]rung/i,
  /incident/i,
  /ticket/i,
  /support/i,
  /kunde/i,
  /eskalat/i,
  /wartung/i,
];

const COMPLAINT_STEP_FAMILIES = new Set([
  'complaint_intake',
  'context_assembly',
  'prioritize_and_request',
  'technical_assessment',
  'knowledge_lookup',
  'customer_update',
  'solution_coordination',
  'approval',
  'execution',
  'documentation_followup',
]);

const REQUIRED_COMPLAINT_FIELDS: RequiredFieldDefinition[] = [
  {
    key: 'serial_number',
    label: 'Seriennummer',
    importance: 'critical',
    presentPatterns: [/seriennummer/i],
    missingPatterns: [/keine seriennummer/i, /fehl(?:t|en|ende)\s+.*seriennummer/i, /ohne seriennummer/i],
  },
  {
    key: 'order_reference',
    label: 'Auftrags- oder Lieferreferenz',
    importance: 'critical',
    presentPatterns: [/auftragsnummer/i, /lieferschein/i, /bestellnummer/i, /lieferung/i],
    missingPatterns: [/keine genaue auftragsnummer/i, /fehl(?:t|en|ende)\s+.*auftragsnummer/i, /ohne auftragsnummer/i],
  },
  {
    key: 'machine_status',
    label: 'Tatsächlicher Maschinenstatus',
    importance: 'critical',
    presentPatterns: [/maschine .* l[aä]uft/i, /komplett steht/i, /tats[aä]chlicher stillstand/i, /stillstand/i],
    missingPatterns: [/keine klare aussage.*(l[aä]uft|steht)/i, /ob die maschine noch l[aä]uft oder komplett steht/i],
  },
  {
    key: 'operating_duration',
    label: 'Betriebsdauer bis zur Störung',
    importance: 'important',
    presentPatterns: [/betriebsdauer/i, /bis zur st[öo]rung/i],
    missingPatterns: [/fehl(?:t|en|ende)\s+.*betriebsdauer/i, /genaue betriebsdauer/i],
  },
  {
    key: 'maintenance_context',
    label: 'Letzte Wartung oder Servicehistorie',
    importance: 'important',
    presentPatterns: [/letzte wartung/i, /servicehistorie/i, /wartung/i],
    missingPatterns: [/fehl(?:t|en|ende)\s+.*wartung/i, /letzte wartung/i],
  },
  {
    key: 'error_evidence',
    label: 'Fehlerbild mit Foto oder Meldung',
    importance: 'important',
    presentPatterns: [/handyfotos?/i, /fehlermeldung/i, /display/i, /heißgelaufenes bauteil/i, /heissgelaufenes bauteil/i],
    missingPatterns: [/kein foto/i, /ohne foto/i, /keine fehlermeldung/i],
  },
];

function collectText(ctx: DomainContext): string {
  return normalizeWhitespace([
    ...ctx.cases.map(caseItem => caseItem.rawText || caseItem.narrative || ''),
    ...ctx.observations.map(observation => [observation.label, observation.evidenceSnippet, observation.role, observation.system].filter(Boolean).join(' ')),
    ctx.lastDerivationSummary?.documentSummary,
    ...(ctx.lastDerivationSummary?.issueSignals ?? []),
  ].filter(Boolean).join('\n'));
}

function splitEvidenceChunks(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(chunk => normalizeWhitespace(chunk))
    .filter(chunk => chunk.length >= 12);
}

function firstMatchingEvidence(chunks: string[], patterns: RegExp[]): string | undefined {
  for (const chunk of chunks) {
    if (patterns.some(pattern => pattern.test(chunk))) {
      return chunk.slice(0, 220);
    }
  }
  return undefined;
}

function detectPack(ctx: DomainContext, combinedText: string): DomainInsightResult['packId'] {
  const familyHits = ctx.observations
    .filter(observation => observation.kind === 'step')
    .map(observation => inferStepFamily(observation.label)?.id)
    .filter((id): id is string => Boolean(id));

  const complaintScore =
    COMPLAINT_KEYWORDS.filter(pattern => pattern.test(combinedText)).length +
    familyHits.filter(id => COMPLAINT_STEP_FAMILIES.has(id)).length;

  const serviceScore =
    SERVICE_KEYWORDS.filter(pattern => pattern.test(combinedText)).length +
    ctx.observations.filter(observation => observation.role || observation.system).length * 0.1;

  if (complaintScore >= 4) return 'complaint-management';
  if (serviceScore >= 3) return 'service-case';
  return 'generic';
}

function inferConfidence(packId: DomainPackId, findings: DomainFinding[], missingFields: DomainMissingField[]): DomainInsightResult['confidence'] {
  if (packId === 'generic') return findings.length >= 2 ? 'medium' : 'low';
  const criticalMissing = missingFields.filter(field => field.status === 'missing' && field.importance === 'critical').length;
  const severeFindings = findings.filter(finding => finding.severity === 'high').length;
  if (severeFindings >= 2 || criticalMissing >= 2) return 'high';
  if (findings.length >= 2 || criticalMissing >= 1) return 'medium';
  return 'low';
}

function mapPresentOrMissing(chunks: string[], def: RequiredFieldDefinition): DomainMissingField {
  const missingEvidence = firstMatchingEvidence(chunks, def.missingPatterns);
  if (missingEvidence) {
    return {
      key: def.key,
      label: def.label,
      importance: def.importance,
      status: 'missing',
      evidence: missingEvidence,
    };
  }

  const presentEvidence = firstMatchingEvidence(chunks, def.presentPatterns);
  if (presentEvidence) {
    return {
      key: def.key,
      label: def.label,
      importance: def.importance,
      status: 'present',
      evidence: presentEvidence,
    };
  }

  return {
    key: def.key,
    label: def.label,
    importance: def.importance,
    status: def.importance === 'critical' ? 'missing' : 'unclear',
  };
}

function detectRoles(ctx: DomainContext): string[] {
  return uniqueStrings([
    ...ctx.observations.map(observation => observation.role),
    ...(ctx.lastDerivationSummary?.roles ?? []),
  ]);
}

function detectSystems(ctx: DomainContext): string[] {
  return uniqueStrings([
    ...ctx.observations.map(observation => observation.system),
    ...(ctx.lastDerivationSummary?.systems ?? []),
  ]);
}

function addFinding(
  findings: DomainFinding[],
  params: Omit<DomainFinding, 'id'>,
) {
  if (findings.some(existing => normalizeLabel(existing.title) === normalizeLabel(params.title))) return;
  findings.push({ id: crypto.randomUUID(), ...params });
}

function buildComplaintInsights(ctx: DomainContext, combinedText: string): DomainInsightResult {
  const chunks = splitEvidenceChunks(combinedText);
  const missingFields = REQUIRED_COMPLAINT_FIELDS.map(def => mapPresentOrMissing(chunks, def));
  const systems = detectSystems(ctx);
  const roles = detectRoles(ctx);
  const findings: DomainFinding[] = [];

  const missingCritical = missingFields.filter(field => field.status === 'missing' && field.importance === 'critical');
  const missingImportant = missingFields.filter(field => field.status === 'missing' && field.importance === 'important');

  if (missingCritical.length > 0 || missingImportant.length > 1) {
    addFinding(findings, {
      title: 'Pflichtangaben fehlen oder sind zu spät verfügbar',
      detail:
        missingCritical.length > 0
          ? `Für einen belastbaren Fallstart fehlen vor allem ${missingCritical.map(field => field.label).join(', ')}.`
          : `Wichtige Kontextangaben wie ${missingImportant.slice(0, 2).map(field => field.label).join(' und ')} sind aktuell nicht sauber belegt.`,
      severity: missingCritical.length > 0 ? 'high' : 'medium',
      category: 'intake',
      evidence: uniqueStrings(missingFields.filter(field => field.evidence).map(field => field.evidence)),
      recommendedAction: 'Pflichtangaben in einer gebündelten Rückfrage oder Eingabemaske absichern.',
      relatedCaseCount: Math.max(ctx.cases.length, 1),
    });
  }

  const escalationEvidence = firstMatchingEvidence(chunks, [/dringend/i, /stillstand/i, /schichtplanung/i, /strategisch wichtig/i, /eskalat/i]);
  if (escalationEvidence) {
    addFinding(findings, {
      title: 'Hoher Eskalations- und Priorisierungsdruck',
      detail: 'Das Material enthält Hinweise auf Stillstand, Dringlichkeit oder geschäftskritische Auswirkungen. Priorisierung und Erwartungsmanagement sollten deshalb früh abgesichert werden.',
      severity: 'high',
      category: 'priority',
      evidence: [escalationEvidence],
      recommendedAction: 'Prioritätsentscheidung mit klarer Begründung und nächstem Zwischenstand absichern.',
      relatedCaseCount: Math.max(ctx.cases.length, 1),
    });
  }

  const knowledgeEvidence = firstMatchingEvidence(chunks, [/aehnlich(?:e|en)?/i, /ähnlich(?:e|en)?/i, /wissensspeicher/i, /postfach/i, /erinnerung/i, /historie/i]);
  if (knowledgeEvidence) {
    addFinding(findings, {
      title: 'Erfahrungswissen ist nur verteilt auffindbar',
      detail: 'Ähnliche Fälle und Ursachenwissen liegen eher in E-Mails, persönlicher Erinnerung oder verstreuten Historien als in einer direkt nutzbaren Fallsicht.',
      severity: 'medium',
      category: 'knowledge',
      evidence: [knowledgeEvidence],
      recommendedAction: 'Ähnliche Reklamationen, Ursachen und Maßnahmen in einer gemeinsamen Fallansicht bündeln.',
      relatedCaseCount: Math.max(ctx.cases.length, 1),
    });
  }

  const multiSystemEvidence = firstMatchingEvidence(chunks, [/crm/i, /erp/i, /dokumentenmanagement/i, /dms/i, /e-?mail/i, /zwischen fenstern/i, /mehreren systemen/i]);
  if (multiSystemEvidence || systems.length >= 3) {
    addFinding(findings, {
      title: 'Kontext muss über mehrere Systeme zusammengesucht werden',
      detail:
        systems.length >= 3
          ? `Im Material tauchen mehrere Systeme auf (${systems.join(', ')}). Das spricht für Suchaufwand und Fehlzuordnungsrisiko.`
          : 'Wichtige Informationen liegen verteilt in mehreren Systemen und müssen manuell verdichtet werden.',
      severity: systems.length >= 4 ? 'high' : 'medium',
      category: 'systems',
      evidence: uniqueStrings([multiSystemEvidence, ...systems.map(system => `System erkannt: ${system}`)]),
      recommendedAction: 'Kunden-, Auftrags- und Produktkontext in einer Fallansicht zusammenführen.',
      relatedCaseCount: Math.max(ctx.cases.length, 1),
    });
  }

  const coordinationEvidence = firstMatchingEvidence(chunks, [/teamleitung/i, /vertrieb/i, /logistik/i, /technik/i, /qualit[aä]tsmanagement/i, /kleine [üu]bergaben/i, /drehscheibe/i, /abstimm/i]);
  if (coordinationEvidence || roles.length >= 4) {
    addFinding(findings, {
      title: 'Viele kleine Übergaben erzeugen Koordinationsaufwand',
      detail:
        roles.length >= 4
          ? `Am Vorgang sind mehrere Rollen beteiligt (${roles.join(', ')}). Das erhöht den Bedarf an klarer Verdichtung und To-do-Führung.`
          : 'Der Fall erfordert mehrere kleine Übergaben zwischen Fachbereichen und damit zusätzliche Abstimmung.',
      severity: roles.length >= 5 ? 'high' : 'medium',
      category: 'coordination',
      evidence: uniqueStrings([coordinationEvidence, ...roles.map(role => `Beteiligte Rolle: ${role}`)]),
      recommendedAction: 'Eine rollenklare Zwischenübersicht mit offenen Punkten und nächstem Verantwortlichen bereitstellen.',
      relatedCaseCount: Math.max(ctx.cases.length, 1),
    });
  }

  const approvalEvidence = firstMatchingEvidence(chunks, [/freigabe/i, /kulanz/i, /genehmig/i, /kosten/i]);
  if (approvalEvidence) {
    addFinding(findings, {
      title: 'Freigaben und Kulanz können die Umsetzung verzögern',
      detail: 'Die technische Lösung steht teilweise schon, wird aber noch durch Freigaben, Kostenklärung oder Kulanzargumentation gebremst.',
      severity: 'medium',
      category: 'approval',
      evidence: [approvalEvidence],
      recommendedAction: 'Freigabepunkt, Begründung und benötigte Entscheidungsträger früh im Fall mitführen.',
      relatedCaseCount: Math.max(ctx.cases.length, 1),
    });
  }

  const communicationEvidence = firstMatchingEvidence(chunks, [/zwischenmeldung/i, /abschlussmail/i, /kommunikation/i, /mehrfachdokumentation/i, /kernaussage/i, /report/i, /kundenf[aä]hig/i]);
  if (communicationEvidence) {
    addFinding(findings, {
      title: 'Hohe Kommunikationslast und Mehrfachdokumentation',
      detail: 'Ein relevanter Teil der Arbeit steckt in Zwischenmeldungen, Übersetzung in kundenfähige Sprache und mehrfacher Dokumentation desselben Sachverhalts.',
      severity: 'medium',
      category: 'communication',
      evidence: [communicationEvidence],
      recommendedAction: 'Zwischenstand, Kundenmail und interne Dokumentation aus einer gemeinsamen Fallzusammenfassung ableiten.',
      relatedCaseCount: Math.max(ctx.cases.length, 1),
    });
  }

  const topRecommendations = uniqueStrings([
    ...findings.map(finding => finding.recommendedAction),
    missingCritical.length > 0 ? 'Für Reklamationsfälle eine feste Mindestdatenprüfung direkt am Eingang nutzen.' : undefined,
  ]).slice(0, 5);

  const roleActions: DomainRoleAction[] = [];
  if (roles.some(role => /service/i.test(role))) {
    roleActions.push({
      role: 'Service',
      actions: uniqueStrings([
        missingCritical.length > 0 ? 'Fehlende Pflichtangaben gesammelt beim Kunden nachfordern.' : undefined,
        'Zwischenstand aktiv steuern und keine stillen Wartezeiten entstehen lassen.',
      ]),
    });
  }
  if (roles.some(role => /qualit/i.test(role) || /technik/i.test(role))) {
    roleActions.push({
      role: 'Qualität / Technik',
      actions: uniqueStrings([
        'Fehlerbild gegen ähnliche Fälle und bekannte Ursachen spiegeln.',
        missingFields.some(field => field.key === 'serial_number' && field.status === 'missing') ? 'Ohne eindeutige Gerätezuordnung noch keine harte Ursachenfestlegung treffen.' : undefined,
      ]),
    });
  }
  if (roles.some(role => /logistik/i.test(role))) {
    roleActions.push({
      role: 'Logistik',
      actions: ['Expressfähigkeit und Ersatzteilverfügbarkeit früh abklären.'],
    });
  }
  if (roles.some(role => /vertrieb/i.test(role) || /teamleitung/i.test(role) || /key account/i.test(role))) {
    roleActions.push({
      role: 'Vertrieb / Führung',
      actions: ['Kulanz- und Freigabeentscheidungen vorbereiten, sobald eine pragmatische Lösung erkennbar ist.'],
    });
  }

  const confidence = inferConfidence('complaint-management', findings, missingFields);
  const summary =
    findings.length > 0
      ? `Lokales Fachpaket „Reklamationsmanagement“ erkannt. ${findings[0].title}${missingCritical.length > 0 ? ` Kritisch sind derzeit vor allem ${missingCritical.map(field => field.label).join(', ')}.` : ''}`
      : 'Lokales Fachpaket „Reklamationsmanagement“ erkannt. Es liegen noch zu wenige belastbare Signale für konkrete Schwerpunktbefunde vor.';

  return {
    packId: 'complaint-management',
    packLabel: 'Reklamationsmanagement',
    confidence,
    summary,
    findings: findings.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity)),
    missingFields,
    topRecommendations,
    roleActions,
    matchedSignals: uniqueStrings(findings.map(finding => finding.title)),
    systems,
    roles,
  };
}

function buildServiceInsights(ctx: DomainContext, combinedText: string): DomainInsightResult {
  const chunks = splitEvidenceChunks(combinedText);
  const systems = detectSystems(ctx);
  const roles = detectRoles(ctx);
  const findings: DomainFinding[] = [];

  const unclearIntakeEvidence = firstMatchingEvidence(chunks, [/fehl(?:t|en|ende)/i, /unklar/i, /r[üu]ckfrage/i, /nachfordern/i]);
  if (unclearIntakeEvidence) {
    addFinding(findings, {
      title: 'Eingangsinformationen sind noch lückenhaft',
      detail: 'Der Fall kann lokal zwar ausgewertet werden, aber wichtige Startinformationen sind noch unvollständig oder müssen nachgefragt werden.',
      severity: 'medium',
      category: 'intake',
      evidence: [unclearIntakeEvidence],
      recommendedAction: 'Die wichtigsten Startangaben in einer strukturierten Rückfrage bündeln.',
      relatedCaseCount: Math.max(ctx.cases.length, 1),
    });
  }

  const coordinationEvidence = firstMatchingEvidence(chunks, [/abstimm/i, /[üu]bergab/i, /mehreren systemen/i, /warten/i, /freigabe/i]);
  if (coordinationEvidence || roles.length >= 4 || systems.length >= 3) {
    addFinding(findings, {
      title: 'Koordination und Kontextsuche dominieren den Aufwand',
      detail: 'Der Prozess ist weniger durch lineare Schritte als durch Abstimmung, Suche und Zusammenführung geprägt.',
      severity: roles.length >= 4 || systems.length >= 3 ? 'high' : 'medium',
      category: 'coordination',
      evidence: uniqueStrings([coordinationEvidence, ...roles.map(role => `Beteiligte Rolle: ${role}`), ...systems.map(system => `System erkannt: ${system}`)]),
      recommendedAction: 'Offene Punkte, Verantwortung und nächste Aktion in einer kompakten Fallübersicht zusammenführen.',
      relatedCaseCount: Math.max(ctx.cases.length, 1),
    });
  }

  const communicationEvidence = firstMatchingEvidence(chunks, [/kommunikation/i, /zwischenmeldung/i, /dokumentier/i, /report/i]);
  if (communicationEvidence) {
    addFinding(findings, {
      title: 'Kommunikations- und Dokumentationsarbeit ist ein eigener Prozessanteil',
      detail: 'Nicht nur die fachliche Lösung, sondern auch Zwischenstände, Rückfragen und interne Nachvollziehbarkeit prägen den Ablauf.',
      severity: 'medium',
      category: 'communication',
      evidence: [communicationEvidence],
      recommendedAction: 'Aus einem lokalen Fallbild mehrere Kommunikationsformate ableiten.',
      relatedCaseCount: Math.max(ctx.cases.length, 1),
    });
  }

  const confidence = inferConfidence('service-case', findings, []);
  return {
    packId: 'service-case',
    packLabel: 'Service- und Störfallbearbeitung',
    confidence,
    summary:
      findings[0]
        ? `Lokales Fachpaket „Service- und Störfallbearbeitung“ erkannt. ${findings[0].title}.`
        : 'Lokales Fachpaket „Service- und Störfallbearbeitung“ erkannt.',
    findings: findings.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity)),
    missingFields: [],
    topRecommendations: uniqueStrings(findings.map(finding => finding.recommendedAction)).slice(0, 4),
    roleActions: roles.length > 0 ? [{ role: 'Beteiligte Rollen', actions: ['Verantwortung, offene Fragen und nächsten Schritt je Rolle verdichten.'] }] : [],
    matchedSignals: uniqueStrings(findings.map(finding => finding.title)),
    systems,
    roles,
  };
}

function buildGenericInsights(ctx: DomainContext): DomainInsightResult {
  const roles = detectRoles(ctx);
  const systems = detectSystems(ctx);
  const summary =
    ctx.observations.length > 0
      ? 'Es liegt noch kein klares Fachpaket vor. Die App arbeitet daher mit allgemeinen lokalen Mustern zu Schritten, Reibungen, Rollen und Systemen.'
      : 'Noch keine ausreichende Grundlage für fachliche Mustererkennung.';

  return {
    packId: 'generic',
    packLabel: 'Allgemeine Muster',
    confidence: ctx.observations.length >= 6 ? 'medium' : 'low',
    summary,
    findings: [],
    missingFields: [],
    topRecommendations: ctx.observations.length > 0 ? ['Weitere Quellen oder klarere Fallbeschreibungen erhöhen die lokale Analystik.'] : [],
    roleActions: [],
    matchedSignals: [],
    systems,
    roles,
  };
}

function severityWeight(severity: DomainInsightSeverity): number {
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  return 1;
}

export function computeDomainInsights(ctx: DomainContext): DomainInsightResult {
  const combinedText = collectText(ctx);
  const packId = detectPack(ctx, combinedText);
  if (packId === 'complaint-management') return buildComplaintInsights(ctx, combinedText);
  if (packId === 'service-case') return buildServiceInsights(ctx, combinedText);
  return buildGenericInsights(ctx);
}

export function buildDomainIssueObservations(params: {
  caseId: string;
  existingObservations: ProcessMiningObservation[];
  insights: DomainInsightResult;
  startIndex?: number;
}): ProcessMiningObservation[] {
  const existingLabels = new Set(
    params.existingObservations
      .filter(observation => observation.kind === 'issue')
      .map(observation => normalizeLabel(observation.label)),
  );

  const startIndex = params.startIndex ?? params.existingObservations.length;
  const additions = params.insights.findings
    .filter(finding => finding.severity !== 'low')
    .filter(finding => !existingLabels.has(normalizeLabel(finding.title)))
    .slice(0, 4)
    .map((finding, index) => ({
      id: crypto.randomUUID(),
      sourceCaseId: params.caseId,
      label: sentenceCase(finding.title),
      evidenceSnippet: finding.evidence[0] ?? finding.detail,
      kind: 'issue' as const,
      sequenceIndex: startIndex + index,
      timestampQuality: 'missing' as const,
      createdAt: new Date().toISOString(),
    }));

  return additions;
}

export function formatMissingFieldCount(missingFields: DomainMissingField[]): string {
  const critical = missingFields.filter(field => field.status === 'missing' && field.importance === 'critical').length;
  const important = missingFields.filter(field => field.status === 'missing' && field.importance === 'important').length;
  if (critical > 0 && important > 0) return `${critical} kritische, ${important} weitere Lücken`;
  if (critical > 0) return `${critical} kritische Lücken`;
  if (important > 0) return `${important} weitere Lücken`;
  return 'keine klaren Pflichtlücken';
}

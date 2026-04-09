import type { DerivationSourceProfile, ProcessMiningDomainKey } from '../../domain/process';
import { normalizeWhitespace, uniqueStrings } from './pmShared';

export interface LabeledEvidence {
  label: string;
  snippet: string;
}

export interface DomainIsolationScore {
  key: ProcessMiningDomainKey;
  label: string;
  score: number;
}

export interface DomainIsolationResult {
  primaryDomainKey?: ProcessMiningDomainKey;
  primaryDomainLabel?: string;
  secondaryDomainKeys: ProcessMiningDomainKey[];
  secondaryDomainLabels: string[];
  scoreBoard: DomainIsolationScore[];
  note?: string;
}

type RuleKind = 'generic' | 'domain-specific';

interface DomainSpec {
  label: string;
  scorePatterns: RegExp[];
  roleLabels: string[];
  systemLabels: string[];
}

const DOMAIN_SPECS: Record<Exclude<ProcessMiningDomainKey, 'mixed'>, DomainSpec> = {
  complaints: {
    label: 'Reklamationen',
    scorePatterns: [
      /reklamation|reklamationsbearbeitung|mangel|falschlieferung|fehlerbild|seriennummer|auftragsnummer|kulanz|ersatzteil|fieldst[öo]rung|feldst[öo]rung/i,
      /reklamationseingang|mindestdaten|sofortma[ßs]nahme|kundenkommunikation|wissen sichern/i,
    ],
    roleLabels: ['Service', 'Qualitätsmanagement', 'Technik', 'Vertrieb', 'Logistik', 'Kunde', 'Teamleitung'],
    systemLabels: ['CRM', 'ERP', 'DMS', 'E-Mail', 'Telefon'],
  },
  service: {
    label: 'Service & Störung',
    scorePatterns: [
      /st[öo]rung|ticket|sla|leitstand|monitoring|remote|einsatzplanung|ferndiagnose|diagnose|sensorfehler/i,
      /dispatcher|service desk|ticketsystem|stillstand|field service/i,
    ],
    roleLabels: ['Service', 'Dispatcher', 'Technik', 'Kunde', 'Teamleitung'],
    systemLabels: ['Ticketsystem', 'Monitoring', 'Leitstand', 'Remote-Support', 'Telefon', 'E-Mail'],
  },
  returns: {
    label: 'Retouren & Garantie',
    scorePatterns: [
      /retoure|r[üu]cksendung|rma|garantie|ersatzlieferung|wareneingang/i,
      /retourenfall|garantiepr[üu]fung|gutschrift/i,
    ],
    roleLabels: ['Service', 'Qualitätsmanagement', 'Logistik', 'Vertrieb', 'Kunde'],
    systemLabels: ['CRM', 'ERP', 'RMA-Referenz', 'DMS', 'E-Mail'],
  },
  procurement: {
    label: 'Einkauf & Freigaben',
    scorePatterns: [
      /bedarf|bestellanforderung|vergleichsangebot|angebotsvergleich|budget|kostenstelle|beschaffung|einkauf/i,
      /lieferantenportal|srm|bestellung ausl[öo]sen|angebote abstimmen/i,
    ],
    roleLabels: ['Einkauf', 'Fachbereich', 'Controlling', 'Buchhaltung', 'Lieferant', 'Teamleitung'],
    systemLabels: ['ERP', 'SRM/Einkaufssystem', 'E-Mail', 'DMS'],
  },
  onboarding: {
    label: 'Onboarding & Zugänge',
    scorePatterns: [
      /onboarding|eintritt|starttermin|personalnummer|zug[aä]nge|equipment|notebook|schulung/i,
      /iam|active directory|hr-system|serviceportal|rollenzuweisung/i,
    ],
    roleLabels: ['HR', 'IT', 'Führungskraft', 'Fachbereich'],
    systemLabels: ['HR-System', 'IAM/Active Directory', 'Serviceportal', 'E-Mail', 'Workflow'],
  },
  billing: {
    label: 'Rechnung & Zahlungsklärung',
    scorePatterns: [
      /rechnung|rechnungsdifferenz|zahlung|zahlungssperre|gutschrift|rechnungsworkflow|bestellbezug/i,
      /kreditor|debitor|zahlungskl[aä]rung|rechnungskl[aä]rung|freigabe/i,
    ],
    roleLabels: ['Finanzbuchhaltung', 'Buchhaltung', 'Fachbereich', 'Vertrieb', 'Lieferant', 'Kunde', 'Teamleitung'],
    systemLabels: ['ERP', 'Rechnungsworkflow', 'DMS', 'E-Mail', 'Telefon'],
  },
  masterdata: {
    label: 'Stammdaten & Änderungen',
    scorePatterns: [
      /stammdaten|[äa]nderungsantrag|dublette|bankdaten|rechnungsadresse|mdm|master data/i,
      /validierung|systemnachlauf|stammdatenformular/i,
    ],
    roleLabels: ['Stammdatenmanagement', 'Fachbereich', 'Compliance', 'IT'],
    systemLabels: ['MDM', 'ERP', 'Workflow', 'Stammdatenformular', 'DMS'],
  },
};

const GENERIC_ROLE_LABELS = new Set(['Kunde', 'Lieferant', 'Teamleitung', 'Fachbereich', 'Führungskraft', 'Sachbearbeitung']);
const GENERIC_SYSTEM_LABELS = new Set(['ERP', 'DMS', 'E-Mail', 'Telefon', 'Chat', 'Workflow', 'Reporting']);

const ISSUE_DOMAIN_RULES: Record<string, { kind: RuleKind; domains?: ProcessMiningDomainKey[] }> = {
  'Fehlende Pflichtangaben': { kind: 'generic' },
  'Informationen müssen aus mehreren Systemen zusammengeführt werden': { kind: 'generic' },
  'Priorisierung erfolgt unter Unsicherheit': { kind: 'generic' },
  'Wartezeiten und Koordinationsaufwand belasten den Ablauf': { kind: 'generic' },
  'Erfahrungswissen liegt verstreut und schwer nutzbar vor': { kind: 'generic' },
  'Kommunikation muss Unsicherheit professionell abfedern': { kind: 'generic' },
  'Mehrfachdokumentation und Medienbrüche erhöhen den Aufwand': { kind: 'generic' },
  'Freigaben verlangsamen die Umsetzung': { kind: 'generic' },
  'Implizite Koordination bindet viele Beteiligte': { kind: 'generic' },
  'SLA-Druck prägt die Priorisierung': { kind: 'domain-specific', domains: ['service'] },
  'Remote-Diagnose und Fernunterstützung sind Teil des Falls': { kind: 'domain-specific', domains: ['service'] },
  'Wiederkehrender Sensorfehler oder Konfigurationsproblem': { kind: 'domain-specific', domains: ['service'] },
  'Retouren- und Garantieklärung erzeugen zusätzlichen Abstimmungsaufwand': { kind: 'domain-specific', domains: ['returns'] },
  'Beschaffung startet mit unvollständigen Bedarfs- oder Budgetdaten': { kind: 'domain-specific', domains: ['procurement'] },
  'Lieferantenabstimmung und Angebotsvergleich erzeugen zusätzlichen Aufwand': { kind: 'domain-specific', domains: ['procurement'] },
  'Bestellung, Wareneingang und Rechnung müssen über mehrere Stellen abgestimmt werden': { kind: 'domain-specific', domains: ['procurement', 'billing'] },
  'Onboarding scheitert schnell an fehlenden Stammdaten und Terminklarheit': { kind: 'domain-specific', domains: ['onboarding'] },
  'Zugänge und Equipment hängen von mehreren Systemen und Freigaben ab': { kind: 'domain-specific', domains: ['onboarding'] },
  'Onboarding erfordert enge Abstimmung zwischen HR, IT und Fachbereich': { kind: 'domain-specific', domains: ['onboarding'] },
  'Rechnungsklärung verlangt Abgleich zwischen Belegen, Bestellung und Freigaben': { kind: 'domain-specific', domains: ['billing'] },
  'Stammdatenänderungen brauchen Validierung, Nachweise und sauberen Systemnachlauf': { kind: 'domain-specific', domains: ['masterdata'] },
};

function countPatternHits(text: string, patterns: RegExp[]): number {
  const normalized = normalizeWhitespace(text).toLowerCase();
  if (!normalized) return 0;
  return patterns.reduce((sum, pattern) => (pattern.test(normalized) ? sum + 1 : sum), 0);
}

function buildScoreBoard(params: {
  text: string;
  stepLabels: string[];
  fileHints?: string;
  roles?: string[];
  systems?: string[];
  sourceProfile?: DerivationSourceProfile;
}): DomainIsolationScore[] {
  const stepText = params.stepLabels.join(' \n ');
  const roleSet = new Set(params.roles ?? []);
  const systemSet = new Set(params.systems ?? []);

  const scores = Object.entries(DOMAIN_SPECS).map(([key, spec]) => {
    let score = 0;
    score += countPatternHits(params.text, spec.scorePatterns) * 4;
    score += countPatternHits(stepText, spec.scorePatterns) * 3;
    score += countPatternHits(params.fileHints ?? '', spec.scorePatterns);
    score += spec.roleLabels.filter(label => roleSet.has(label)).length * 2;
    score += spec.systemLabels.filter(label => systemSet.has(label)).length * 2;
    if (params.sourceProfile?.documentClass === 'mixed-document' && key === 'mixed') {
      score += 2;
    }
    return {
      key: key as Exclude<ProcessMiningDomainKey, 'mixed'>,
      label: spec.label,
      score,
    };
  });

  return scores.sort((a, b) => b.score - a.score);
}

export function detectDomainIsolation(params: {
  text: string;
  stepLabels: string[];
  roles?: string[];
  systems?: string[];
  fileHints?: string;
  sourceProfile?: DerivationSourceProfile;
}): DomainIsolationResult {
  const scoreBoard = buildScoreBoard(params);
  const strongest = scoreBoard[0];
  const second = scoreBoard[1];

  if (!strongest || strongest.score < 4) {
    return {
      secondaryDomainKeys: [],
      secondaryDomainLabels: [],
      scoreBoard,
      note: 'Noch keine belastbare Primärdomäne erkannt. Signale werden vorsichtig behandelt.',
    };
  }

  const secondary = scoreBoard
    .filter(item => item.key !== strongest.key && item.score >= 4 && item.score >= strongest.score - 3)
    .slice(0, 2);

  const noteParts = [`Primärdomäne: ${strongest.label}.`];
  if (secondary.length > 0) {
    noteParts.push(`Sekundär berücksichtigt: ${secondary.map(item => item.label).join(', ')}.`);
  } else if (second && second.score >= 3) {
    noteParts.push(`Weitere Domänenhinweise bleiben schwach und werden nicht aktiv in Signale übernommen.`);
  }

  return {
    primaryDomainKey: strongest.key,
    primaryDomainLabel: strongest.label,
    secondaryDomainKeys: secondary.map(item => item.key),
    secondaryDomainLabels: secondary.map(item => item.label),
    scoreBoard,
    note: noteParts.join(' '),
  };
}

function domainsAllowedFor(result: DomainIsolationResult, domains: ProcessMiningDomainKey[]): boolean {
  if (domains.length === 0) return true;
  if (!result.primaryDomainKey) return false;
  const allowed = new Set<ProcessMiningDomainKey>([
    result.primaryDomainKey,
    ...result.secondaryDomainKeys,
  ]);
  return domains.some(domain => allowed.has(domain));
}

function hasStrongForeignEvidence(params: { label: string; snippet?: string; rawText: string }): boolean {
  const rule = ISSUE_DOMAIN_RULES[params.label];
  if (!rule || rule.kind === 'generic' || !rule.domains || rule.domains.length === 0) return false;
  return rule.domains.some(domain => {
    const spec = DOMAIN_SPECS[domain as Exclude<ProcessMiningDomainKey, 'mixed'>];
    const snippetHits = countPatternHits(params.snippet ?? '', spec.scorePatterns);
    const rawHits = countPatternHits(params.rawText, spec.scorePatterns);
    return snippetHits >= 1 && rawHits >= 2;
  });
}

export function shouldKeepIssueSignal(params: {
  label: string;
  snippet?: string;
  rawText: string;
  domainResult: DomainIsolationResult;
}): boolean {
  const rule = ISSUE_DOMAIN_RULES[params.label];
  if (!rule || rule.kind === 'generic') return true;
  if (rule.domains && domainsAllowedFor(params.domainResult, rule.domains)) return true;
  return hasStrongForeignEvidence({ label: params.label, snippet: params.snippet, rawText: params.rawText });
}

function labelAllowedByDomain(label: string, domainResult: DomainIsolationResult, kind: 'role' | 'system'): boolean {
  if (!domainResult.primaryDomainKey) return true;
  if (kind === 'role' && GENERIC_ROLE_LABELS.has(label)) return true;
  if (kind === 'system' && GENERIC_SYSTEM_LABELS.has(label)) return true;

  const allowedDomains = [domainResult.primaryDomainKey, ...domainResult.secondaryDomainKeys].filter(Boolean) as Exclude<ProcessMiningDomainKey, 'mixed'>[];
  if (allowedDomains.length === 0) return true;

  return allowedDomains.some(domainKey => {
    const spec = DOMAIN_SPECS[domainKey];
    return kind === 'role' ? spec.roleLabels.includes(label) : spec.systemLabels.includes(label);
  });
}

export function filterRolesByDomain(labels: string[], domainResult: DomainIsolationResult): string[] {
  return uniqueStrings(labels.filter(label => labelAllowedByDomain(label, domainResult, 'role')));
}

export function filterSystemsByDomain(labels: string[], domainResult: DomainIsolationResult): string[] {
  return uniqueStrings(labels.filter(label => labelAllowedByDomain(label, domainResult, 'system')));
}

export function filterIssueEvidenceByDomain(params: {
  issueEvidence: LabeledEvidence[];
  rawText: string;
  domainResult: DomainIsolationResult;
}): { kept: LabeledEvidence[]; droppedLabels: string[] } {
  const kept: LabeledEvidence[] = [];
  const droppedLabels = new Set<string>();

  for (const entry of params.issueEvidence) {
    if (shouldKeepIssueSignal({ label: entry.label, snippet: entry.snippet, rawText: params.rawText, domainResult: params.domainResult })) {
      kept.push(entry);
    } else {
      droppedLabels.add(entry.label);
    }
  }

  return {
    kept,
    droppedLabels: Array.from(droppedLabels),
  };
}

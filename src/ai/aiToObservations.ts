// Adapter: ai-capture-v1 (Anthropic-Extraktion) -> DerivationResult.
//
// ZWECK: KI-Extraktionsergebnisse in EXAKT die Form bringen, die auch
// deriveProcessArtifactsFromText liefert (ProcessMiningAssistedV2State-kompatibel).
// Dadurch ist der Tausch in den operativen Triggern (Prompt 5) ein echter Drop-in:
// statt deriveProcessArtifactsFromText(...) wird adaptAiCaptureToDerivation(...).result
// verwendet; alles Nachgelagerte (onAddDerived -> mergeState -> computeQualitySummary)
// bleibt unverändert.
//
// WIEDERVERWENDUNG statt Nachbau:
//   - extractJsonFromText + validateAiCapture aus aiImport.ts (Low-Level, KEIN
//     importAiCaptureToNewVersion — das baut eine Version/captureDraft, was hier
//     ausdrücklich NICHT gewollt ist).
//   - dieselben Evidenz-/Kandidaten-Helfer wie der Narrative-Pfad (evidenceModel).
//
// BEWUSST KEIN finalizeDerivationResult: dieses würde Domain-Isolation + Step-Gating
// auf die (vertrauenswürdige) KI-Ausgabe anwenden, Schritte verwerfen und Rollen/
// Systeme/Issues still unterdrücken. Stattdessen wird das Ergebnis direkt in der
// identischen Skelettform (vgl. buildEmptyResult) zusammengebaut.

import type {
  DerivationSummary,
  ExtractionCandidate,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
  SourceRoutingContext,
} from '../domain/process';
import type { DerivationInput, DerivationResult } from '../ui/assistedMiningV2/documentDerivation';
import {
  buildContextWindow,
  buildEvidenceSourceRef,
  buildExtractionCandidateReview,
  createObservationFromStepCandidate,
  createStepCandidate,
  createSupportCandidate,
  reviewExtractionCandidates,
} from '../ui/assistedMiningV2/evidenceModel';
import { uniqueStrings } from '../ui/assistedMiningV2/pmShared';
import { extractJsonFromText, validateAiCapture } from './aiImport';
import type { AiCaptureResultV1 } from './aiTypes';

/** Derselbe sourceType wie bei deriveProcessArtifactsFromText. */
export type SourceType = DerivationInput['sourceType'];

export interface AiToObservationsInput {
  aiText: string;          // roher Modelltext (kann Codeblöcke/Prosa enthalten)
  originalText?: string;   // ursprünglicher Eingabetext (für Kontext/sourceMaterial)
  sourceName: string;      // Datei-/Quellenname
  sourceType: SourceType;  // derselbe Typ wie bei deriveProcessArtifactsFromText
}

export interface AiToObservationsResult {
  ok: boolean;
  result?: DerivationResult; // FORMGLEICH zu deriveProcessArtifactsFromText
  warnings: string[];
  error?: string;            // bei JSON-/Schemafehler (für UI), KEIN throw
}

/** Engine-Marker für KI-Extraktion (statt LOCAL_MINING_ENGINE_VERSION). */
export const AI_ENGINE_MARKER = 'ai-capture-v1';

const VALID_WORK_TYPES = ['manual', 'user_task', 'service_task', 'ai_assisted', 'unknown'] as const;

function describeWorkType(workType: string): string {
  switch (workType) {
    case 'manual':
      return 'manuell';
    case 'user_task':
      return 'Anwendertätigkeit';
    case 'service_task':
      return 'Systemtätigkeit';
    case 'ai_assisted':
      return 'KI-unterstützt';
    case 'unknown':
      return 'unbekannt';
    default:
      return workType;
  }
}

function buildAiRoutingContext(): SourceRoutingContext {
  return {
    routingClass: 'narrative-case',
    routingConfidence: 'high',
    routingSignals: [`engine:${AI_ENGINE_MARKER}`],
  };
}

/**
 * Wandelt ein ai-capture-v1-Ergebnis in ein DerivationResult um.
 * Wirft NIE: JSON-/Schemafehler werden als { ok:false, error } zurückgegeben.
 */
export function adaptAiCaptureToDerivation(input: AiToObservationsInput): AiToObservationsResult {
  // 1) Pipeline: roher Text -> JSON -> validiertes ai-capture-v1 (kein throw nach außen).
  let aiData: AiCaptureResultV1;
  try {
    aiData = extractJsonFromText(input.aiText);
    validateAiCapture(aiData);
  } catch (err) {
    return {
      ok: false,
      warnings: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const warnings: string[] = [];
  const nowIso = new Date().toISOString();
  const caseId = crypto.randomUUID();
  const sourceName = input.sourceName?.trim() || 'KI-Extraktion';
  const routingContext = buildAiRoutingContext();

  const happyPath = aiData.happyPath;

  // stepDetails nach Schrittnummer (1-basiert) indizieren.
  const detailByStep = new Map<number, NonNullable<AiCaptureResultV1['stepDetails']>[number]>();
  (aiData.stepDetails ?? []).forEach((detail) => {
    if (typeof detail.step === 'number') detailByStep.set(detail.step, detail);
  });

  const observations: ProcessMiningObservation[] = [];
  const candidates: ExtractionCandidate[] = [];
  const stepCandidateIdByStepNo = new Map<number, string>();

  // 2) happyPath[i] -> geordnete Schritt-Observation (kind 'step'), sequenceIndex=i.
  happyPath.forEach((rawLabel, index) => {
    const stepNo = index + 1;
    const label = (rawLabel ?? '').trim();
    const detail = detailByStep.get(stepNo);
    const snippet = detail?.evidenceSnippet?.trim();
    const role = detail?.role?.trim() || undefined;
    const system = detail?.system?.trim() || undefined;

    // Evidenzanker = stepDetails-Snippet, sonst Schritttext; confidence entsprechend.
    const evidenceAnchor = snippet && snippet.length > 0 ? snippet : label;
    const confidence: ExtractionCandidate['confidence'] = snippet ? 'high' : 'medium';

    // Felder ohne eigenes Observation-Modell (workType/dataIn/dataOut/painPoint)
    // werden im Kontextfenster mitgeführt (nichts still verwerfen, keine Felder erfinden).
    const descriptorParts = [
      role ? `Rolle: ${role}` : undefined,
      system ? `System: ${system}` : undefined,
      detail?.workType ? `Art: ${describeWorkType(detail.workType)}` : undefined,
      detail?.dataIn && detail.dataIn.length > 0 ? `Eingaben: ${detail.dataIn.join(', ')}` : undefined,
      detail?.dataOut && detail.dataOut.length > 0 ? `Ausgaben: ${detail.dataOut.join(', ')}` : undefined,
      detail?.painPointHint?.trim() ? `Schmerzpunkt: ${detail.painPointHint.trim()}` : undefined,
    ].filter((part): part is string => Boolean(part));

    const contextWindow = buildContextWindow([
      happyPath[index - 1],
      label,
      happyPath[index + 1],
      ...descriptorParts,
    ]);

    if (detail?.workType && !VALID_WORK_TYPES.includes(detail.workType as typeof VALID_WORK_TYPES[number])) {
      warnings.push(`Schritt ${stepNo}: unbekannter workType "${detail.workType}" – nur als Kontext geführt.`);
    }

    const sourceRef = buildEvidenceSourceRef(caseId, `ai-step:${stepNo}`);
    const candidate = createStepCandidate({
      rawLabel: label,
      normalizedLabel: label,
      preserveOriginalLabel: true, // KI-Labels sind bereits "Substantiv + Verb" -> nicht erneut kanonisieren
      originalStepLabel: label,
      stepWasPreserved: true,
      primaryRole: role,
      primarySystem: system,
      evidenceAnchor,
      contextWindow,
      confidence,
      originChannel: 'imported-observation',
      sourceFragmentType: 'text-span',
      routingContext,
      sourceRef,
      index,
    });
    candidates.push(candidate);
    stepCandidateIdByStepNo.set(stepNo, candidate.candidateId);

    observations.push(
      createObservationFromStepCandidate({
        candidate,
        caseId,
        sequenceIndex: index,
        role,
        system,
        timestampQuality: 'missing',
      }),
    );
  });

  // 3) exceptions[] -> Issue-Signal, verankert am relatedStep.
  const issueSignals: string[] = [];
  const issueEvidence: NonNullable<DerivationSummary['issueEvidence']> = [];
  (aiData.exceptions ?? []).forEach((exc, idx) => {
    const description = exc.description?.trim();
    if (!description) return;
    const anchor = exc.evidenceSnippet?.trim() || description;
    const contextWindow = buildContextWindow([
      description,
      exc.handling?.trim() ? `Umgang: ${exc.handling.trim()}` : undefined,
      exc.type ? `Typ: ${exc.type}` : undefined,
    ]);
    const relatedCandidateId = exc.relatedStep ? stepCandidateIdByStepNo.get(exc.relatedStep) : undefined;

    candidates.push(
      createSupportCandidate({
        candidateType: 'signal',
        rawLabel: description,
        evidenceAnchor: anchor,
        contextWindow,
        confidence: 'medium',
        originChannel: 'imported-observation',
        sourceFragmentType: 'text-span',
        routingContext,
        sourceRef: buildEvidenceSourceRef(caseId, `ai-exception:${idx + 1}`),
        relatedCandidateId,
        supportClass: 'issue-signal',
      }),
    );
    issueSignals.push(description);
    issueEvidence.push({
      label: description,
      snippet: anchor,
      evidenceAnchor: anchor,
      contextWindow,
      originChannel: 'imported-observation',
      sourceFragmentType: 'text-span',
      confidence: 'medium',
      status: 'support-only',
    });
  });

  // 4) decisions[] -> Varianten-/Signalspur, verankert am afterStep (kein Kernschritt).
  (aiData.decisions ?? []).forEach((dec, idx) => {
    const question = dec.question?.trim();
    if (!question) return;
    const branchText = (dec.branches ?? [])
      .map((branch) => branch.conditionLabel?.trim())
      .filter((value): value is string => Boolean(value))
      .join(' | ');
    const anchor = dec.evidenceSnippet?.trim() || question;
    const contextWindow = buildContextWindow([
      question,
      branchText ? `Verzweigungen: ${branchText}` : undefined,
      dec.gatewayType ? `Gateway: ${dec.gatewayType}` : undefined,
    ]);
    const relatedCandidateId = dec.afterStep ? stepCandidateIdByStepNo.get(dec.afterStep) : undefined;

    candidates.push(
      createSupportCandidate({
        candidateType: 'signal',
        rawLabel: `Entscheidung: ${question}`,
        evidenceAnchor: anchor,
        contextWindow,
        confidence: 'low',
        originChannel: 'imported-observation',
        sourceFragmentType: 'text-span',
        routingContext,
        sourceRef: buildEvidenceSourceRef(caseId, `ai-decision:${idx + 1}`),
        relatedCandidateId,
        supportClass: 'support-evidence',
      }),
    );
  });

  // 5) roles[]/systems[] -> in die roles/systems-Listen (aus Top-Level + stepDetails).
  const roles = uniqueStrings([
    ...(aiData.roles ?? []),
    ...observations.map((obs) => obs.role).filter((value): value is string => Boolean(value)),
  ]);
  const systems = uniqueStrings([
    ...(aiData.systems ?? []),
    ...observations.map((obs) => obs.system).filter((value): value is string => Boolean(value)),
  ]);

  // 6) endToEnd -> documentSummary-Kontext.
  const e2e = aiData.endToEnd;
  const documentSummary = [
    `Auslöser: ${e2e.trigger.trim()}`,
    `Kunde: ${e2e.customer.trim()}`,
    `Ergebnis: ${e2e.outcome.trim()}`,
    e2e.doneCriteria?.trim() ? `Abschluss: ${e2e.doneCriteria.trim()}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  // 7) notes/assumptions/warnings/kpis/dataObjects/aiReadinessSignals -> warnings (nichts verwerfen).
  (aiData.notes ?? []).forEach((note) => warnings.push(`KI-Hinweis: ${note}`));
  (aiData.assumptions ?? []).forEach((assumption) => warnings.push(`KI-Annahme: ${assumption}`));
  (aiData.warnings ?? []).forEach((warning) => warnings.push(`KI-Warnung: ${warning}`));
  if (aiData.kpis && aiData.kpis.length > 0) {
    warnings.push(`KI-KPIs (nicht im Schrittmodell abgebildet): ${aiData.kpis.map((kpi) => kpi.name).join(', ')}.`);
  }
  if (aiData.dataObjects && aiData.dataObjects.length > 0) {
    warnings.push(`KI-Datenobjekte: ${aiData.dataObjects.join(', ')}.`);
  }
  if (aiData.aiReadinessSignals) {
    const s = aiData.aiReadinessSignals;
    warnings.push(
      `KI-Reife-Signale: Standardisierung ${s.standardization}, Datenverfügbarkeit ${s.dataAvailability}, ` +
        `Variabilität ${s.variability}, Compliance-Risiko ${s.complianceRisk}.`,
    );
  }

  // 8) Kandidatenstatus über denselben Review-Pfad wie die lokale Engine setzen.
  const reviewedCandidates = reviewExtractionCandidates(candidates);
  const candidateReview = buildExtractionCandidateReview(reviewedCandidates);

  // 9) Abgeleitete Schritt-Liste (formgleich zu finalizeDerivationResult.derivedSteps).
  const stepLabels = uniqueStrings(observations.map((obs) => obs.originalStepLabel ?? obs.label));
  const derivedSteps = observations.map((obs) => ({
    label: obs.originalStepLabel ?? obs.label,
    role: obs.role,
    primaryRole: obs.primaryRole ?? obs.role,
    primarySystem: obs.primarySystem ?? obs.system,
    roles: obs.roles,
    systems: obs.systems,
    evidenceSnippet: obs.evidenceSnippet,
    originalStepLabel: obs.originalStepLabel,
    canonicalStepFamily: obs.canonicalStepFamily,
    stepWasPreserved: obs.stepWasPreserved,
    mergeSkippedBecauseStructured: obs.mergeSkippedBecauseStructured,
    explicitRoles: obs.explicitRoles,
    explicitSystems: obs.explicitSystems,
    inferredRoles: obs.inferredRoles,
    inferredSystems: obs.inferredSystems,
    supportOnlyRoles: obs.supportOnlyRoles,
    supportOnlySystems: obs.supportOnlySystems,
    suppressedInferredRoles: obs.suppressedInferredRoles,
    suppressedInferredSystems: obs.suppressedInferredSystems,
  }));

  const evidenceCount = observations.filter((obs) => Boolean(obs.evidenceSnippet?.trim())).length;
  const confidence: DerivationResult['confidence'] =
    observations.length >= 5 && evidenceCount >= Math.ceil(observations.length / 2) ? 'high' : 'medium';

  // 10) Fall (endToEnd -> Fallname/Titel + Kontext).
  const caseItem: ProcessMiningObservationCase = {
    id: caseId,
    name: sourceName,
    narrative: input.originalText?.trim() || documentSummary,
    rawText: input.originalText?.trim() || undefined,
    inputKind: input.sourceType === 'narrative' ? 'narrative' : 'document',
    sourceType: input.sourceType,
    sourceNote: `KI-Extraktion (${AI_ENGINE_MARKER}) aus: ${sourceName}`,
    derivedStepLabels: stepLabels,
    routingContext,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // 11) Summary (Skelettform vgl. buildEmptyResult; provenance/engineVersion kennzeichnen KI).
  const summary: DerivationSummary = {
    sourceLabel: sourceName,
    method: 'narrative-fallback',
    documentKind: 'unknown',
    analysisMode: 'process-draft',
    caseCount: 1,
    observationCount: observations.length,
    warnings,
    confidence,
    stepLabels,
    roles,
    systems,
    issueSignals,
    issueEvidence,
    documentSummary,
    routingContext,
    extractionCandidates: reviewedCandidates,
    candidateStats: {
      total: reviewedCandidates.length,
      mergedCoreSteps: candidateReview.mergedCoreSteps,
      supportOnly: candidateReview.supportOnlyCandidates,
      rejected: candidateReview.rejectedCoreSteps,
    },
    candidateReview,
    engineVersion: AI_ENGINE_MARKER,
    provenance: 'ai',
    updatedAt: nowIso,
  };

  // 12) Ergebnis – exakt dieselben Top-Level-Schlüssel wie deriveProcessArtifactsFromText.
  const result: DerivationResult = {
    cases: [caseItem],
    observations,
    method: 'narrative-fallback',
    documentKind: 'unknown',
    warnings,
    confidence,
    derivedSteps,
    roles,
    systems,
    issueSignals,
    summary,
    routingContext,
    extractionCandidates: reviewedCandidates,
  };

  return { ok: true, result, warnings };
}

export interface StepAnnotation {
  stepLabel: string;
  roles?: string;
  systems?: string;
  dataObjects?: string;
  rootCause?: string;
  risks?: string;
  caseTypeNotes?: string;
  evidenceNote?: string;
}

export interface DeviationAnnotation {
  deviationDescription: string;
  roles?: string;
  rootCause?: string;
  risks?: string;
  evidenceNote?: string;
}

export interface HotspotAnnotation {
  hotspotHeadline: string;
  rootCause?: string;
  roles?: string;
  risks?: string;
  evidenceNote?: string;
}

export interface V2AugmentationState {
  stepAnnotations: StepAnnotation[];
  deviationAnnotations: DeviationAnnotation[];
  hotspotAnnotations: HotspotAnnotation[];
  managementSummary?: string;
  savedAt?: string;
}

export function createEmptyAugmentation(): V2AugmentationState {
  return {
    stepAnnotations: [],
    deviationAnnotations: [],
    hotspotAnnotations: [],
  };
}

export function upsertStepAnnotation(
  state: V2AugmentationState,
  label: string,
  patch: Partial<Omit<StepAnnotation, 'stepLabel'>>,
): V2AugmentationState {
  const existing = state.stepAnnotations.find(a => a.stepLabel === label);
  if (existing) {
    return {
      ...state,
      stepAnnotations: state.stepAnnotations.map(a =>
        a.stepLabel === label ? { ...a, ...patch } : a,
      ),
    };
  }
  return {
    ...state,
    stepAnnotations: [...state.stepAnnotations, { stepLabel: label, ...patch }],
  };
}

export function upsertDeviationAnnotation(
  state: V2AugmentationState,
  description: string,
  patch: Partial<Omit<DeviationAnnotation, 'deviationDescription'>>,
): V2AugmentationState {
  const existing = state.deviationAnnotations.find(a => a.deviationDescription === description);
  if (existing) {
    return {
      ...state,
      deviationAnnotations: state.deviationAnnotations.map(a =>
        a.deviationDescription === description ? { ...a, ...patch } : a,
      ),
    };
  }
  return {
    ...state,
    deviationAnnotations: [...state.deviationAnnotations, { deviationDescription: description, ...patch }],
  };
}

export function upsertHotspotAnnotation(
  state: V2AugmentationState,
  headline: string,
  patch: Partial<Omit<HotspotAnnotation, 'hotspotHeadline'>>,
): V2AugmentationState {
  const existing = state.hotspotAnnotations.find(a => a.hotspotHeadline === headline);
  if (existing) {
    return {
      ...state,
      hotspotAnnotations: state.hotspotAnnotations.map(a =>
        a.hotspotHeadline === headline ? { ...a, ...patch } : a,
      ),
    };
  }
  return {
    ...state,
    hotspotAnnotations: [...state.hotspotAnnotations, { hotspotHeadline: headline, ...patch }],
  };
}

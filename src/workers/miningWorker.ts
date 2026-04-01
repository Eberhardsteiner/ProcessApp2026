import type {
  MiningWorkerRequestWithId,
  MiningWorkerResponse,
  VariantsResult,
} from '../mining/miningWorkerProtocol';
import { computeVariants } from '../mining/processMiningLite';
import { buildDirectlyFollowsGraph, type BuildDfgResult } from '../mining/discoveryDfg';
import { computeCaseDurationStats } from '../mining/performanceAnalytics';
import { computeAlignmentConformance } from '../mining/alignmentConformance';

self.onmessage = (event: MessageEvent<MiningWorkerRequestWithId>) => {
  const request = event.data;
  const { id, kind, cacheKey } = request;

  try {
    switch (kind) {
      case 'variants': {
        const variants = computeVariants(request.events);
        const result: VariantsResult[] = variants.map((v) => ({
          variant: v.variant,
          count: v.count,
          share: v.share,
        }));
        const response: MiningWorkerResponse = {
          id,
          ok: true,
          cacheKey,
          result,
        };
        self.postMessage(response);
        break;
      }

      case 'dfg': {
        const activityKeyToStepId = new Map<string, string>();
        const stepIdToLabel = new Map<string, string>();
        const stepIdToOrder = new Map<string, number>();
        const activityKeyToLabel = new Map<string, string>();

        if (request.activityMappings) {
          for (const mapping of request.activityMappings) {
            if (mapping.stepId) {
              activityKeyToStepId.set(mapping.activityKey, mapping.stepId);
            }
            if (mapping.example) {
              activityKeyToLabel.set(mapping.activityKey, mapping.example);
            }
          }
        }

        if (request.draftSteps) {
          for (const step of request.draftSteps) {
            stepIdToLabel.set(step.stepId, step.label);
            stepIdToOrder.set(step.stepId, step.order);
          }
        }

        const dfgResult: BuildDfgResult = buildDirectlyFollowsGraph({
          events: request.events,
          mode: request.mode,
          activityKeyToStepId,
          stepIdToLabel,
          stepIdToOrder,
          activityKeyToLabel,
          timeMode: request.timeMode,
        });

        const response: MiningWorkerResponse = {
          id,
          ok: true,
          cacheKey,
          result: dfgResult,
        };
        self.postMessage(response);
        break;
      }

      case 'caseDurationStats': {
        const statsResult = computeCaseDurationStats({
          events: request.events,
          maxCases: request.maxCases,
          timeMode: request.timeMode,
        });

        const response: MiningWorkerResponse = {
          id,
          ok: true,
          cacheKey,
          result: statsResult,
        };
        self.postMessage(response);
        break;
      }

      case 'alignmentConformance': {
        const alignmentResult = computeAlignmentConformance({
          events: request.events,
          activityMappings: request.activityMappings,
          draftSteps: request.draftSteps,
          maxCases: request.maxCases,
          maxMatrixSize: request.maxMatrixSize,
        });

        const response: MiningWorkerResponse = {
          id,
          ok: true,
          cacheKey,
          result: alignmentResult,
        };
        self.postMessage(response);
        break;
      }

      default: {
        const exhaustiveCheck: never = kind;
        throw new Error(`Unknown mining task kind: ${exhaustiveCheck}`);
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const response: MiningWorkerResponse = {
      id,
      ok: false,
      cacheKey,
      error: errorMessage,
    };
    self.postMessage(response);
  }
};

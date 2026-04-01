export type BpmnDiagramType = 'process' | 'collaboration';

export interface BpmnModelRef {
  diagramType: BpmnDiagramType;
  bpmnXml?: string;
  lastExportedAt?: string;
}

export function createInitialBpmnModelRef(
  diagramType: BpmnDiagramType = 'process'
): BpmnModelRef {
  return {
    diagramType,
  };
}

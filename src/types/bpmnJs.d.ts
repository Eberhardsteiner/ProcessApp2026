declare module 'bpmn-js/lib/NavigatedViewer' {
  export interface NavigatedViewerOptions {
    container: HTMLElement;
  }

  export default class NavigatedViewer {
    constructor(options: NavigatedViewerOptions);
    importXML(xml: string): Promise<{ warnings?: unknown[] }>;
    get(service: string): unknown;
    destroy(): void;
  }
}

// Reine, testbare Resolver-Funktionen für den Analyse-Modus.
//
// Dieser Modul ÄNDERT KEIN Extraktionsverhalten. Er liest nur die Einstellungen
// und leitet daraus ab, WIE die Analyse laufen würde:
//   - 'heuristic'      : lokale Vorschau ohne KI (Default)
//   - 'ai-copy-paste'  : KI gewünscht, aber automatischer Versand nicht möglich
//                        (kein externer Modus / keine API / kein Endpoint / keine Zustimmung)
//   - 'ai-api'         : KI automatisch über den konfigurierten Endpoint (Proxy → Anthropic)
//
// Die Verdrahtung in die operativen Trigger erfolgt erst in einem späteren Schritt.

import type { AppSettings } from '../settings/appSettings';

export type AnalysisMode = 'ai-api' | 'ai-copy-paste' | 'heuristic';

/**
 * Leitet den effektiven Analyse-Modus aus den Einstellungen ab.
 *
 * - useForAnalysis !== true                       -> 'heuristic'
 * - API voll nutzbar UND Zustimmung vorhanden     -> 'ai-api'
 *   (dataHandlingMode 'external' + ai.mode 'api' + endpointUrl gesetzt + Consent gesetzt)
 * - sonst (KI gewünscht, aber API nicht/ohne Consent) -> 'ai-copy-paste'
 */
export function resolveAnalysisMode(settings: AppSettings): AnalysisMode {
  if (settings.ai.useForAnalysis !== true) {
    return 'heuristic';
  }

  if (isAiApiReady(settings)) {
    return 'ai-api';
  }

  return 'ai-copy-paste';
}

/** True, sobald die Analyse KI nutzt (egal ob automatisch oder per Copy/Paste). */
export function canUseAiForAnalysis(settings: AppSettings): boolean {
  return resolveAnalysisMode(settings) !== 'heuristic';
}

/** Deutsches Klartext-Label für einen Analyse-Modus. */
export function describeAnalysisMode(mode: AnalysisMode): string {
  switch (mode) {
    case 'ai-api':
      return 'KI automatisch (über Endpoint)';
    case 'ai-copy-paste':
      return 'KI über Kopieren & Einfügen';
    case 'heuristic':
      return 'Lokale Vorschau ohne KI';
  }
}

// --- Begründungslogik: WAS fehlt für den automatischen API-Versand ----------

/** Einzelne Voraussetzung für den automatischen KI-Versand über die API. */
export type AiApiRequirement = 'dataHandlingExternal' | 'apiMode' | 'endpoint' | 'consent';

export interface AiApiReadiness {
  /** True, wenn alle Voraussetzungen für 'ai-api' erfüllt sind. */
  ready: boolean;
  /** Maschinenlesbare Liste der fehlenden Voraussetzungen (leer, wenn ready). */
  missing: AiApiRequirement[];
  /** Dieselben fehlenden Voraussetzungen als deutsche Klartext-Labels. */
  missingLabels: string[];
}

/** Deutsches Klartext-Label für eine einzelne Voraussetzung. */
export function describeAiApiRequirement(requirement: AiApiRequirement): string {
  switch (requirement) {
    case 'dataHandlingExternal':
      return 'Datenmodus „Externer Dienst"';
    case 'apiMode':
      return 'KI-Modus „API (Endpoint)"';
    case 'endpoint':
      return 'Endpoint-URL';
    case 'consent':
      return 'Zustimmung zum externen Versand';
  }
}

/**
 * Erklärt, welche Voraussetzungen für den automatischen API-Versand noch fehlen.
 * Unabhängig von useForAnalysis – die UI nutzt dies, wenn KI gewünscht ist,
 * der effektive Modus aber (noch) nicht 'ai-api' lautet.
 */
export function getAiApiReadiness(settings: AppSettings): AiApiReadiness {
  const missing: AiApiRequirement[] = [];

  if (settings.dataHandlingMode !== 'external') missing.push('dataHandlingExternal');
  if (settings.ai.mode !== 'api') missing.push('apiMode');
  if (settings.ai.api.endpointUrl.trim().length === 0) missing.push('endpoint');
  if (!settings.ai.externalConsentGivenAt) missing.push('consent');

  return {
    ready: missing.length === 0,
    missing,
    missingLabels: missing.map(describeAiApiRequirement),
  };
}

/** Interne Hilfsfunktion: sind alle API-Voraussetzungen erfüllt? */
function isAiApiReady(settings: AppSettings): boolean {
  return getAiApiReadiness(settings).ready;
}

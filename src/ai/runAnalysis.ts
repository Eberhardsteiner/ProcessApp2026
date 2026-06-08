// Zentrale Analyse-Funktion: das "Brain" der Weiche zwischen lokaler Heuristik,
// KI über Copy/Paste und KI über den API-Proxy.
//
// Diese Funktion ist FREI VON UI-POLITIK:
//   - Sie entscheidet NUR anhand der Einstellungen, WIE analysiert wird.
//   - Sie macht KEINEN stillen Fallback auf die Heuristik. Bei 'blocked'/'needs-paste'/
//     'error' entscheidet später die UI (Prompt 6), was angeboten wird.
//   - Sie wirft NICHT nach außen: jeder Fehler wird als AnalysisOutcome zurückgegeben.
//
// Der KI-Pfad läuft bewusst NICHT durch finalizeDerivationResult (gewollte Differenz);
// die Formparität liefert adaptAiCaptureToDerivation.

import type { AppSettings } from '../settings/appSettings';
import type { DerivationResult } from '../ui/assistedMiningV2/documentDerivation';
import { deriveProcessArtifactsFromText } from '../ui/assistedMiningV2/documentDerivation';
import { runAiProxyRequest } from './aiApiClient';
import { buildClaudeExtractionPrompt } from './claudePrompt';
import { adaptAiCaptureToDerivation, type SourceType } from './aiToObservations';
import { resolveAnalysisMode, type AnalysisMode } from './analysisMode';

export type AnalysisOutcome =
  | { kind: 'result'; mode: AnalysisMode; result: DerivationResult; warnings: string[] }
  | { kind: 'needs-paste'; prompt: string; reason: string } // ai-copy-paste
  | { kind: 'blocked'; reason: string } // Budget überschritten
  | { kind: 'error'; mode: AnalysisMode; error: string }; // ai-api fehlgeschlagen

export interface RunAnalysisInput {
  text: string;
  sourceName: string;
  sourceType: SourceType;
  settings: AppSettings;
  captureMode?: 'artifact' | 'case' | 'cases'; // Default 'case'
  translatedText?: string;
}

/** Dependency-Injection NUR für Testbarkeit; Defaults = echte Funktionen. */
export interface RunAnalysisDeps {
  transport?: typeof runAiProxyRequest;
  derive?: typeof deriveProcessArtifactsFromText;
}

export async function runProcessAnalysis(
  input: RunAnalysisInput,
  deps?: RunAnalysisDeps,
): Promise<AnalysisOutcome> {
  const { text, sourceName, sourceType, settings } = input;
  const captureMode = input.captureMode ?? 'case';
  const translatedText = input.translatedText?.trim() ? input.translatedText : undefined;

  // 1) Modus aus den Einstellungen ableiten.
  const mode = resolveAnalysisMode(settings);

  // 2) Budget-Prüfung (nur für KI-Modi; die lokale Heuristik kennt kein Budget).
  const softWarnings: string[] = [];
  if (mode !== 'heuristic') {
    const length = text.length;
    const maxChars = settings.ai.maxInputChars;
    const warnChars = settings.ai.warnInputChars;

    if (length > maxChars) {
      return {
        kind: 'blocked',
        reason:
          `Der Analysetext ist ${length.toLocaleString('de-DE')} Zeichen lang und überschreitet ` +
          `das Budget von ${maxChars.toLocaleString('de-DE')} Zeichen. ` +
          `Bitte den Text kürzen oder das Budget in den Einstellungen erhöhen.`,
      };
    }

    if (length > warnChars) {
      softWarnings.push(
        `Der Analysetext ist mit ${length.toLocaleString('de-DE')} Zeichen recht lang ` +
          `(Warnschwelle ${warnChars.toLocaleString('de-DE')} Zeichen). Das kann Laufzeit und Kosten erhöhen.`,
      );
    }
  }

  // 3) Lokale Heuristik.
  if (mode === 'heuristic') {
    const derive = deps?.derive ?? deriveProcessArtifactsFromText;
    const result = derive({ text, fileName: sourceName, sourceType });
    return { kind: 'result', mode: 'heuristic', result, warnings: [...softWarnings] };
  }

  // 4) KI über Copy/Paste: Prompt erzeugen, Versand übernimmt der Nutzer.
  if (mode === 'ai-copy-paste') {
    const prompt = buildClaudeExtractionPrompt({
      rawText: text,
      translatedText,
      captureMode,
      processTitleHint: sourceName,
    });
    return {
      kind: 'needs-paste',
      prompt,
      reason:
        'KI ist für die Analyse aktiviert, aber der automatische Versand ist nicht möglich ' +
        '(keine aktive API-Konfiguration oder fehlende Zustimmung). ' +
        'Bitte den Prompt kopieren, in die KI einfügen und die Antwort zurückspielen.',
    };
  }

  // 5) KI über den API-Proxy: Prompt -> Transport -> Adapter.
  try {
    const prompt = buildClaudeExtractionPrompt({
      rawText: text,
      translatedText,
      captureMode,
      processTitleHint: sourceName,
    });

    const transport = deps?.transport ?? runAiProxyRequest;
    const aiText = await transport({
      endpointUrl: settings.ai.api.endpointUrl,
      authMode: settings.ai.api.authMode,
      apiKey: settings.ai.api.apiKey,
      timeoutMs: settings.ai.api.timeoutMs,
      prompt,
    });

    const adapted = adaptAiCaptureToDerivation({
      aiText,
      originalText: text,
      sourceName,
      sourceType,
    });

    if (!adapted.ok || !adapted.result) {
      return { kind: 'error', mode: 'ai-api', error: adapted.error ?? 'KI-Antwort unbrauchbar' };
    }

    return {
      kind: 'result',
      mode: 'ai-api',
      result: adapted.result,
      warnings: [...adapted.warnings, ...softWarnings],
    };
  } catch (error) {
    return {
      kind: 'error',
      mode: 'ai-api',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

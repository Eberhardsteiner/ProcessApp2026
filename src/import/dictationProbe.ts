// src/import/dictationProbe.ts  (nur Mess-/Diagnosezweck)
import { deriveProcessArtifactsFromText } from '../ui/assistedMiningV2/documentDerivation';
import { adaptAiCaptureToDerivation } from '../ai/aiToObservations';
import { segmentDictatedText, toNumberedStepList, buildDictationCapture } from './freeTextSegmenter';

type Src = 'pdf' | 'docx' | 'narrative' | 'csv-row' | 'xlsx-row';

const DIKTAT =
  'der Wecker klingelt um 6:30 Uhr Punkt ich stehe auf Stelle den Wecker ab und gehe in die Küche schalte die Kaffeemaschine ein Stelle eine Tasse unter die Kaffeemaschine und lasse mir einen Kaffee zubereiten währenddessen lege ich eine Semmel in den Ofen Stelle auf 240° und 15 Minuten Backzeit ein danach gehe ich unter die Dusche Dusche und nach dem Duschen trockne ich mich ab rasiere mich und zieh mich an und gehe dann in die Küche zurück hole den inzwischen fertiggestellten Kaffee von der Kaffeemaschine gieße Milch aus dem Kühlschrank drüber nehme die Semmel aus dem Backofen teile sie mit einem Messer in zwei Hälften und schmiere etwas Konfitüre auf die Semmel ich gehe dann zurück ins Schlafzimmer nehme den Kaffee und deine Teller mit dem mit der Semmel mit und lese die Zeitung digital über die App das dauert etwa 45 Minuten danach gehe ich noch mal in das Badezimmer rasiere mich mache mich fertig nehme dann mein Notebook packe es in den Rucksack schaue ich sonst noch Unterlagen mitnehmen muss geh dann zu meinem Auto in die Garage fahre mit dem Auto Richtung Autobahn wenn ich noch tanken muss tanke ich noch an einer Tankstelle wenn ich nicht tanken muss fahre ich direkt weiter die Fahrzeit bis zur Hochschule beträgt etwa 25 Minuten wenn ich bei der Hochschule ankomme fahre ich in die Garageneinfahrt öffne das Garagentor mit meiner Arbeit ID Karte und suche mir einen Parkplatz wenn ich in der Garage keinen Parkplatz finde fahre ich wieder aus der Garage heraus und suche mir auf der Straße einen Parkplatz gehe dann entweder von der Garage in das Gebäude und fahre mit dem Aufzug in den zweiten Stock oder ich trete das Gebäude im Erdgeschoss und gehe zu Fuß in den zweiten Stock dort hole ich mir in der Professoren Lounge einen Kaffee diese Milch in den Kaffee und gehe dann in meinen Vorlesungssaal im ersten Stock dort stecke ich meinen Notebook an die Beamer Anschluss und an die Steckdose dann beginnt meine Vorlesung';

function probe(label: string, text: string, sourceType: Src = 'narrative') {
  // sourceType: 'narrative' — GENAU wie der gefuehrte Intake (ObservationIntakePanel) ihn setzt.
  // Die 'docx'-Zeilen sind reine Diagnose (kein Narrativ-Bias im Router).
  const r = deriveProcessArtifactsFromText({ text, fileName: 'Diktat-Test', sourceType });
  const routingClass = r.cases?.[0]?.routingContext?.routingClass ?? '(unbekannt)';
  return { label, routingClass, obs: r.observations.length, derivedSteps: r.derivedSteps.length };
}

// Option B: Segmenter -> ai-capture-v1 -> adaptAiCaptureToDerivation (umgeht das Step-Gating).
function probeOptionB() {
  const sentences = segmentDictatedText(DIKTAT).split('\n').map(s => s.trim()).filter(Boolean);
  const capture = buildDictationCapture(sentences);
  const r = adaptAiCaptureToDerivation({
    aiText: JSON.stringify(capture),
    originalText: DIKTAT,
    sourceName: 'Diktat-Test',
    sourceType: 'narrative',
  });
  const steps = r.ok && r.result ? r.result.observations.length : 0;
  // erste 5 Schritt-Label zur Qualitaetssicht (Feldname je nach Observation-Typ; ggf. .label/.title)
  const sample = r.ok && r.result
    ? r.result.observations.slice(0, 5).map(o => (o as { label?: string; title?: string }).label ?? (o as { title?: string }).title ?? '(?)')
    : [];
  const summary = (r.result as { summary?: { roles?: string[]; systems?: string[]; issueSignals?: string[] } } | undefined)?.summary;
  const rolesList = summary?.roles ?? (r.result as { roles?: string[] } | undefined)?.roles ?? [];
  const systemsList = summary?.systems ?? (r.result as { systems?: string[] } | undefined)?.systems ?? [];
  const friction = summary?.issueSignals?.length ?? (r.result as { issueSignals?: string[] } | undefined)?.issueSignals?.length ?? 0;
  return {
    label: 'OPTION B (angereichert)',
    ok: r.ok, error: r.error, steps, sample,
    roles: rolesList.length, systems: systemsList.length, friction,
    rolesList, systemsList,
  };
}

export function runDictationProbe() {
  return {
    rows: [
      probe('RAW (Strom) · narrative', DIKTAT),
      probe('SENTENCES · narrative', segmentDictatedText(DIKTAT)),
      probe('NUMBERED · narrative', toNumberedStepList(DIKTAT)),
      // Diagnose: identische Eingaben unter Dokument-sourceType (ohne Narrativ-Bias +0.08):
      probe('NUMBERED · docx (Diag.)', toNumberedStepList(DIKTAT), 'docx'),
      probe('SENTENCES · docx (Diag.)', segmentDictatedText(DIKTAT), 'docx'),
    ],
    optionB: probeOptionB(),
  };
}

// src/import/dictationProbe.ts  (nur Mess-/Diagnosezweck)
import { deriveProcessArtifactsFromText } from '../ui/assistedMiningV2/documentDerivation';
import { adaptAiCaptureToDerivation } from '../ai/aiToObservations';
import { segmentDictatedText, toNumberedStepList, buildDictationCapture, splitNarrativeIntoSteps, hasTimelineStructure } from './freeTextSegmenter';

type Src = 'pdf' | 'docx' | 'narrative' | 'csv-row' | 'xlsx-row';

// HIS: Referenz-Diktat (1. Person / Imperativ).
const DIKTAT =
  'der Wecker klingelt um 6:30 Uhr Punkt ich stehe auf Stelle den Wecker ab und gehe in die Küche schalte die Kaffeemaschine ein Stelle eine Tasse unter die Kaffeemaschine und lasse mir einen Kaffee zubereiten währenddessen lege ich eine Semmel in den Ofen Stelle auf 240° und 15 Minuten Backzeit ein danach gehe ich unter die Dusche Dusche und nach dem Duschen trockne ich mich ab rasiere mich und zieh mich an und gehe dann in die Küche zurück hole den inzwischen fertiggestellten Kaffee von der Kaffeemaschine gieße Milch aus dem Kühlschrank drüber nehme die Semmel aus dem Backofen teile sie mit einem Messer in zwei Hälften und schmiere etwas Konfitüre auf die Semmel ich gehe dann zurück ins Schlafzimmer nehme den Kaffee und deine Teller mit dem mit der Semmel mit und lese die Zeitung digital über die App das dauert etwa 45 Minuten danach gehe ich noch mal in das Badezimmer rasiere mich mache mich fertig nehme dann mein Notebook packe es in den Rucksack schaue ich sonst noch Unterlagen mitnehmen muss geh dann zu meinem Auto in die Garage fahre mit dem Auto Richtung Autobahn wenn ich noch tanken muss tanke ich noch an einer Tankstelle wenn ich nicht tanken muss fahre ich direkt weiter die Fahrzeit bis zur Hochschule beträgt etwa 25 Minuten wenn ich bei der Hochschule ankomme fahre ich in die Garageneinfahrt öffne das Garagentor mit meiner Arbeit ID Karte und suche mir einen Parkplatz wenn ich in der Garage keinen Parkplatz finde fahre ich wieder aus der Garage heraus und suche mir auf der Straße einen Parkplatz gehe dann entweder von der Garage in das Gebäude und fahre mit dem Aufzug in den zweiten Stock oder ich trete das Gebäude im Erdgeschoss und gehe zu Fuß in den zweiten Stock dort hole ich mir in der Professoren Lounge einen Kaffee diese Milch in den Kaffee und gehe dann in meinen Vorlesungssaal im ersten Stock dort stecke ich meinen Notebook an die Beamer Anschluss und an die Steckdose dann beginnt meine Vorlesung';

// HELD-OUT: Organisationsprozess (3. Person) — fester Regressionstest fuer die Generalisierung.
const HELDOUT =
  'die Bestellanforderung trifft per E-Mail beim Einkauf ein der Sachbearbeiter prüft die Anforderung auf Vollständigkeit und erfasst sie im SAP danach holt er bei drei Lieferanten Angebote ein vergleicht die Preise und erstellt eine Vergabeempfehlung wenn der Auftragswert über zehntausend Euro liegt leitet er die Empfehlung an die Geschäftsführung zur Freigabe weiter sobald die Freigabe vorliegt löst der Einkauf die Bestellung im System aus die Fachabteilung bestätigt später den Wareneingang anschließend prüft die Buchhaltung die Rechnung gleicht sie mit Bestellung und Lieferschein ab und überweist den Betrag falls Abweichungen auftreten klärt die Buchhaltung diese mit dem Lieferanten';

function probe(label: string, text: string, sourceType: Src = 'narrative') {
  // sourceType: 'narrative' — GENAU wie der gefuehrte Intake (ObservationIntakePanel) ihn setzt.
  // Die 'docx'-Zeilen sind reine Diagnose (kein Narrativ-Bias im Router).
  const r = deriveProcessArtifactsFromText({ text, fileName: 'Diktat-Test', sourceType });
  const routingClass = r.cases?.[0]?.routingContext?.routingClass ?? '(unbekannt)';
  return { label, routingClass, obs: r.observations.length, derivedSteps: r.derivedSteps.length };
}

// Option B: Segmenter -> ai-capture-v1 -> adaptAiCaptureToDerivation (umgeht das Step-Gating).
function probeOptionB(label: string, text: string) {
  const sentences = segmentDictatedText(text).split('\n').map(s => s.trim()).filter(Boolean);
  const capture = buildDictationCapture(sentences);
  const r = adaptAiCaptureToDerivation({
    aiText: JSON.stringify(capture),
    originalText: text,
    sourceName: label,
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
    label,
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
    optionB: [
      probeOptionB('HIS (Referenz-Diktat, 1. Person)', DIKTAT),
      probeOptionB('HELD-OUT (Arbeitsprozess, 3. Person)', HELDOUT),
    ],
  };
}

// --- Paket 9: 10 graded fixtures für den lokalen Pfad ---
const FIXTURES: Record<string, string> = {
  T1: 'Eine eingehende Rechnung wird zunächst von der Poststelle digitalisiert und im DMS abgelegt. Die Buchhaltung prüft die Rechnung sachlich und rechnerisch und gleicht sie mit der Bestellung ab. Bei Übereinstimmung kontiert die Buchhaltung den Beleg und gibt ihn zur Zahlung frei. Die Zahlung wird anschließend im nächsten Zahlungslauf ausgeführt. Zum Abschluss archiviert die Buchhaltung den Vorgang revisionssicher.',
  T2: 'Wenn bei uns eine Stelle zu besetzen ist, schickt mir die Fachabteilung meistens eine kurze Mail mit dem Wunschprofil, aber oft ist das so knapp, dass ich erst nachfragen muss, welche Aufgaben und welche Erfahrung wirklich gemeint sind. Sobald ich die Ausschreibung erstellt habe, stelle ich sie ins Bewerberportal und parallel auf zwei, drei Jobbörsen, weil über eine allein kaum genug Bewerbungen reinkommen. Die eingehenden Bewerbungen sichte ich zusammen mit der Fachabteilung, was sich oft zieht, weil alle gerade keine Zeit haben. Die Gespräche koordiniere ich dann per Mail über mehrere Kalender, und gerade in der Urlaubszeit dauert es manchmal Wochen, bis wir einen Termin finden. Nach der Zusage kümmert sich die Personalabteilung um den Vertrag, und ich pflege parallel noch eine eigene Excel-Liste, weil ich im System sonst den Überblick über den Stand verliere.',
  T3: 'Reisekostenantrag im Portal anlegen. Belege scannen und hochladen. Antrag an Vorgesetzten zur Genehmigung senden. Nach Freigabe Antrag an die Buchhaltung weiterleiten. Buchhaltung prüft sachlich und erstattet den Betrag. Erstattung auf das Gehaltskonto anweisen.',
  T4: 'eine Kundin ruft im Servicecenter an und schildert ihr Problem der Mitarbeiter legt einen Vorgang im CRM an und prüft zunächst ob er selbst helfen kann wenn er nicht weiterkommt leitet er den Fall an die Fachabteilung weiter die Fachabteilung bearbeitet den Vorgang und meldet sich direkt bei der Kundin zurück zum Schluss schließt der Mitarbeiter den Vorgang im System und vermerkt die Lösung',
  T5: [
    '- Ein Entwickler erstellt einen Merge Request im Repository',
    '- Ein Kollege reviewt den Code und gibt ihn frei',
    '- Die Pipeline baut das Artefakt und führt die Tests aus',
    '- Bei grünen Tests deployt der Release-Manager auf die Staging-Umgebung',
    '- Nach der Abnahme erfolgt das Deployment auf die Produktion',
    '- Das Team beobachtet anschließend das Monitoring auf Fehler',
  ].join('\n'),
  T6: [
    '1. Der Versicherungsnehmer meldet den Schaden telefonisch oder über das Online-Portal.',
    '2. Der Sachbearbeiter erfasst die Schadensmeldung im System und vergibt eine Schadennummer.',
    '3. Bei Schäden über 10.000 Euro wird zusätzlich ein Gutachter beauftragt.',
    '4. Der Sachbearbeiter prüft die Deckung und fordert fehlende Unterlagen an.',
    '5. Nach abgeschlossener Prüfung wird die Entschädigung berechnet und ausgezahlt.',
    '6. Der Vorgang wird im System geschlossen und archiviert.',
  ].join('\n'),
  T7: [
    'Prozessbeschreibung: Urlaubsantrag',
    'Version 2.1 — gültig ab 01.01.2026',
    'Verantwortlich: Personalabteilung',
    '',
    'Der Mitarbeiter stellt seinen Urlaubsantrag im Self-Service-Portal. Die Führungskraft erhält eine Benachrichtigung und genehmigt oder lehnt den Antrag ab. Bei Genehmigung trägt das System den Urlaub automatisch im Kalender ein. Die Personalabteilung aktualisiert den Urlaubsanspruch und informiert die Lohnbuchhaltung.',
  ].join('\n'),
  T8: [
    '08:14 Uhr | Monitoring meldet eine erhöhte Fehlerrate im Bestellsystem',
    '08:20 Uhr | Der First-Level-Support nimmt die Störung auf und informiert den Bereitschaftsdienst',
    '08:35 Uhr | Die Bereitschaft analysiert die Logs und identifiziert eine überlastete Datenbank',
    '09:05 Uhr | Die Datenbank wird neu gestartet, die Fehlerrate sinkt',
    '09:30 Uhr | Der Second-Level prüft die Ursache und legt ein Problem-Ticket an',
    '10:00 Uhr | Der Incident wird geschlossen und ein Nachbericht erstellt',
  ].join('\n'),
  T9: 'Die Probe trifft im Probeneingang ein und wird dort registriert. Eine MTA prüft die Probe auf Eignung und legt sie im LIMS an. Anschließend wird die Probe an das zuständige Analysegerät übergeben und vermessen. Der Laborleiter validiert die Messergebnisse und gibt den Befund frei. Der Befund wird im LIMS dokumentiert und an den einsendenden Arzt übermittelt.',
  T10: 'Also das mit den Verträgen ist bei uns ehrlich gesagt ein ziemliches Durcheinander – im Prinzip kommt der Entwurf vom Fachbereich, aber meistens halt als Word-Anhang per Mail, und dann muss ich erstmal schauen, ob überhaupt alles dabei ist, was die Rechtsabteilung braucht, was selten der Fall ist, also frage ich nach, das dauert. Wenn der Vertrag dann irgendwann vollständig ist, geht er zur rechtlichen Prüfung, parallel will aber oft auch der Einkauf noch draufschauen, gerade bei größeren Summen, und weil das nicht klar geregelt ist, kommt es vor, dass beide gleichzeitig Änderungen reinschreiben und ich am Ende drei Versionen habe, die ich irgendwie zusammenführen muss. Die finale Freigabe gibt eigentlich die Geschäftsführung, aber wenn die im Urlaub ist, bleibt das liegen, eine Vertretung gibt es da nicht. Unterschrieben wird dann mal digital, mal eingescannt, das ist auch nicht einheitlich, und am Schluss soll ich den Vertrag noch ins Vertragsregister eintragen, was ich oft vergesse, weil bis dahin schon wieder der nächste reinkommt.',
};

// Spiegelt ObservationIntakePanel.deriveLocal: Timeline → Engine, sonst Splitter → Capture → Adapter.
function probeLocalPath(key: string, text: string) {
  if (hasTimelineStructure(text)) {
    const r = deriveProcessArtifactsFromText({ text, fileName: key, sourceType: 'narrative' });
    const sample = r.derivedSteps.slice(0, 3).map(s => (s as { label?: string; title?: string }).label ?? (s as { title?: string }).title ?? '(?)');
    return { key, path: 'engine' as const, steps: r.derivedSteps.length, roles: 0, systems: 0, friction: 0, rolesList: [] as string[], systemsList: [] as string[], sample };
  }
  const steps = splitNarrativeIntoSteps(text);
  const capture = buildDictationCapture(steps);
  const r = adaptAiCaptureToDerivation({
    aiText: JSON.stringify(capture),
    originalText: text,
    sourceName: key,
    sourceType: 'narrative',
  });
  const res = r.ok ? r.result : undefined;
  const summary = (res as { summary?: { roles?: string[]; systems?: string[]; issueSignals?: string[] } } | undefined)?.summary;
  const rolesList = summary?.roles ?? (res as { roles?: string[] } | undefined)?.roles ?? [];
  const systemsList = summary?.systems ?? (res as { systems?: string[] } | undefined)?.systems ?? [];
  const friction = summary?.issueSignals?.length ?? (res as { issueSignals?: string[] } | undefined)?.issueSignals?.length ?? 0;
  const stepsN = res ? res.observations.length : 0;
  const sample = res ? res.observations.slice(0, 3).map(o => (o as { label?: string; title?: string }).label ?? (o as { title?: string }).title ?? '(?)') : [];
  return { key, path: 'local' as const, steps: stepsN, roles: rolesList.length, systems: systemsList.length, friction, rolesList, systemsList, sample };
}

// Harte Erwartungen (verifiziert). Schrittzahlen nur für die sauberen Listen-/Kopf-/Fließtext-Fälle.
const EXPECT_STEPS: Record<string, number> = { T1: 5, T2: 5, T3: 6, T5: 6, T6: 6, T7: 4, T9: 5 };
// Entitäten als Kleinbuchstaben-Fragmente (case-insensitive Teilstring-Treffer in der Liste).
const EXPECT_ROLES: Record<string, string[]> = {
  T5: ['entwickler', 'release'], T6: ['versicherungsnehmer', 'gutachter'],
  T7: ['personalabteilung', 'lohnbuchhaltung'], T9: ['mta', 'laborleiter', 'arzt'],
};
const EXPECT_SYS: Record<string, string[]> = {
  T1: ['dms'], T5: ['repository', 'pipeline', 'monitoring'], T7: ['kalender'], T9: ['lims', 'analysegerät'],
};
// T4/T8/T10 nur informativ (Segmenter- bzw. Engine-Pfad — Schrittzahl nicht hart geprüft).

export function runLocalPathFixtures() {
  const rows = Object.entries(FIXTURES).map(([k, t]) => probeLocalPath(k, t));
  const has = (list: string[], frag: string) => list.some(x => x.toLowerCase().includes(frag));
  const failures: string[] = [];
  for (const r of rows) {
    if (r.key in EXPECT_STEPS && r.steps !== EXPECT_STEPS[r.key]) {
      failures.push(`${r.key}: Schritte ${r.steps} ≠ erwartet ${EXPECT_STEPS[r.key]}`);
    }
    for (const frag of EXPECT_ROLES[r.key] ?? []) {
      if (!has(r.rolesList, frag)) failures.push(`${r.key}: Rolle "${frag}" fehlt (gefunden: ${r.rolesList.join(', ') || '–'})`);
    }
    for (const frag of EXPECT_SYS[r.key] ?? []) {
      if (!has(r.systemsList, frag)) failures.push(`${r.key}: System "${frag}" fehlt (gefunden: ${r.systemsList.join(', ') || '–'})`);
    }
  }
  return { rows, failures };
}

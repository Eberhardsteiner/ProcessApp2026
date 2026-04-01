import type { Process, ProcessVersion } from '../domain/process';

function sanitizeForPrompt(s: string): string {
  return (s || '').replace(/\r/g, '').trim();
}

function safeText(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || '(leer)';
}

function joinListLimited(lines: string[], limit: number): string {
  if (lines.length === 0) return '(keine)';
  const truncated = lines.length > limit;
  const slice = lines.slice(0, limit);
  const text = slice.join('\n') + (truncated ? `\n… (${lines.length - limit} weitere)` : '');
  return text;
}

function mapId<T extends { id: string; name: string }>(list: T[]): Map<string, string> {
  const m = new Map<string, string>();
  (list || []).forEach((x) => m.set(x.id, x.name));
  return m;
}

export function buildClaudeSemanticQuestionsAnalysisPrompt(input: {
  process: Process;
  version: ProcessVersion;
}): string {
  const { process, version } = input;

  const draft = version.sidecar.captureDraft;
  const steps = draft?.happyPath ?? [];
  const decisions = draft?.decisions ?? [];
  const exceptions = draft?.exceptions ?? [];
  const questions = version.quality.semanticQuestions ?? [];
  const oc = version.sidecar.operationalContext;
  const aiSig = version.sidecar.aiReadinessSignals;

  const roles = version.sidecar.roles || [];
  const systems = version.sidecar.systems || [];
  const dataObjects = version.sidecar.dataObjects || [];
  const kpis = version.sidecar.kpis || [];

  const roleById = mapId(roles);
  const systemById = mapId(systems);
  const dataById = mapId(dataObjects);

  const roleLabel = (id?: string | null) => (id ? (roleById.get(id) || id) : '(nicht gesetzt)');
  const systemLabel = (id?: string | null) => (id ? (systemById.get(id) || id) : '(nicht gesetzt)');

  const dataLabels = (ids?: string[]) => {
    const arr = (ids || []).map((id) => dataById.get(id) || id);
    return arr.length ? arr.join(', ') : '(keine)';
  };

  const stepLines = steps.slice(0, 25).map((s) => {
    return `${s.order}. ${s.label} (stepId: ${s.stepId}) | Rolle: ${roleLabel(s.roleId)} | System: ${systemLabel(s.systemId)} | workType: ${s.workType || 'unknown'} | dataIn: ${dataLabels(s.dataIn)} | dataOut: ${dataLabels(s.dataOut)}`;
  });

  const decisionLines = decisions.slice(0, 15).map((d) => {
    const branches = d.branches.map((b) => {
      const next = b.endsProcess ? 'endet' : `→ ${b.nextStepId}`;
      return `${b.conditionLabel} ${next}`;
    }).join('; ');
    return `nach Schritt ${d.afterStepId}: ${d.gatewayType} | Frage: ${d.question} | Branches: ${branches}`;
  });

  const exceptionLines = exceptions.slice(0, 15).map((e) => {
    return `${e.type} bei ${e.relatedStepId || '(global)'}: ${e.description} | Handling: ${e.handling}`;
  });

  const openQuestions = questions.filter(q => q.status !== 'done');

  const questionLines = openQuestions.slice(0, 30).map((q) => {
    const hint = q.relatedStepHint ? ` (Bezug: ${q.relatedStepHint})` : '';
    let answerNote = '';
    if (q.answer?.trim()) {
      const truncated = q.answer.length > 120 ? q.answer.slice(0, 120) + '…' : q.answer;
      answerNote = ` | Antwort/Notiz: ${truncated}`;
    }
    return `[id: ${q.id}] ${q.question}${hint}${answerNote}`;
  });

  const rolesText = roles.map((r) => `${r.name} (${r.kind})`).join(', ') || '(keine)';
  const systemsText = systems.map((s) => s.name).join(', ') || '(keine)';
  const dataObjectsText = dataObjects.map((d) => `${d.name} (${d.kind})`).join(', ') || '(keine)';
  const kpisText = kpis.map((k) => `${k.name} – ${k.definition}${k.unit ? ` [${k.unit}]` : ''}`).join('; ') || '(keine)';

  const prompt = `# Aufgabe: KI-Auswertung semantischer Prüffragen für Prozessautomatisierung

Du bist ein Experte für Geschäftsprozessanalyse und Automatisierung. Deine Aufgabe ist es, die vorliegenden semantischen Prüffragen zu analysieren und zu priorisieren, um die kritischsten Lücken für eine Automatisierung/Digitalisierung zu identifizieren.

## Kontext

**Prozess:** ${sanitizeForPrompt(process.title)}
**Kategorie:** ${process.category}
**Management-Level:** ${process.managementLevel}

**End-to-End-Definition:**
- Trigger: ${safeText(version.endToEndDefinition.trigger)}
- Kunde/Empfänger: ${safeText(version.endToEndDefinition.customer)}
- Ergebnis: ${safeText(version.endToEndDefinition.outcome)}
${version.endToEndDefinition.doneCriteria ? `- Done-Kriterien: ${safeText(version.endToEndDefinition.doneCriteria)}` : ''}

**Operationaler Kontext:**
- Häufigkeit: ${oc?.frequency || 'unbekannt'}
- Durchlaufzeit: ${oc?.typicalLeadTime || 'unbekannt'}

**KI-Reife-Signale:**
- Standardisierung: ${aiSig?.standardization || 'unbekannt'}
- Datenverfügbarkeit: ${aiSig?.dataAvailability || 'unbekannt'}
- Variabilität: ${aiSig?.variability || 'unbekannt'}
- Compliance-Risiko: ${aiSig?.complianceRisk || 'unbekannt'}

## Modell-Daten

### Rollen
${rolesText}

### Systeme
${systemsText}

### Datenobjekte
${dataObjectsText}

### KPIs
${kpisText}

### Happy-Path-Schritte (${steps.length} gesamt, max. 25 gezeigt)
${joinListLimited(stepLines, 25)}

### Entscheidungen (${decisions.length} gesamt, max. 15 gezeigt)
${joinListLimited(decisionLines, 15)}

### Ausnahmen (${exceptions.length} gesamt, max. 15 gezeigt)
${joinListLimited(exceptionLines, 15)}

### Semantische Prüffragen (${openQuestions.length} offen, ${questions.length} gesamt, max. 30 gezeigt)
${joinListLimited(questionLines, 30)}

## Deine Aufgabe

Analysiere die semantischen Prüffragen und erstelle eine strukturierte Auswertung. Gib **ausschließlich Markdown** aus (kein JSON, keine Codeblöcke).

Trenne strikt zwischen:
1. **Beobachtungen** (was steht in den Daten)
2. **Interpretationen** (was könnte das bedeuten)
3. **Empfehlungen** (was sollte getan werden)

Strukturiere deine Antwort wie folgt:

## Kurzfazit
(2-3 Sätze: Was ist der größte Automatisierungs-Blocker? Welche Kategorie dominiert?)

## Beobachtet
(Aus den Semantikfragen + Modellstand. Keine Interpretation, nur Fakten.)

## Priorisierte Blocker (Top 8)
Wähle die 8 kritischsten Fragen aus, die für Automatisierung/Digitalisierung am relevantesten sind.

Für jede Frage:
1. **Frage:** [id] Original-Fragetext
2. **Cluster:** (Regeln/Entscheidungen | Daten | Systeme | Rollen | Ausnahmen | Compliance/Kontrollen | KPIs)
3. **Warum kritisch für Automatisierung:** (1-2 Sätze)
4. **Risiko ohne Klärung:** (1 Satz)

## Mikro-Fragen je Top-Blocker
Für jeden der 8 Top-Blocker:

**[Frage-ID]**
- **Nächste konkrete Klärungsfrage:** (Die kleinste, interview-taugliche Frage, die als nächstes gestellt werden sollte)
- **Benötigte Quelle/Artefakt:** (z.B. vorhandene Dokumente, Screenshots, Beispieldaten, Workshop mit Team X)
- **Wer sollte gefragt werden:** (Rolle/Funktion, z.B. Fachbereichsleiter, IT-Verantwortlicher, Prozess-Owner)

## Welche Informationen fehlen noch für Automatisierung
Liste die Minimal-Anforderungen auf, die für eine fundierte Automatisierungsentscheidung noch fehlen:
- Regeln/Entscheidungskriterien
- Datenquellen/-strukturen
- Systemschnittstellen
- Compliance-Vorgaben
- etc.

## Nächste Schritte
(Konkrete, umsetzbare Aktionen für einen 30-60 Minuten Workshop. Z.B.: "Interview mit Rolle X zu Thema Y", "Dokumentenanalyse von Z", etc.)

---

**Wichtig:**
- Erfinde keine Details, die nicht in den Daten stehen.
- Wenn Informationen fehlen, formuliere klare offene Fragen.
- Fokussiere auf Automatisierungs- und Digitalisierungsrelevanz.
- Sei präzise und umsetzungsorientiert.
`;

  return prompt;
}

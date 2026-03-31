import type { Process, ProcessVersion } from '../domain/process';
import { assessProcess } from '../assessment/processAssessment';
import { downloadReportHtml, downloadReportMarkdown } from '../export/reportExport';

interface ProcessReportProps {
  process: Process;
  version: ProcessVersion;
}

export function ProcessReport({ process, version }: ProcessReportProps) {
  const sidecar = version.sidecar;
  const draft = sidecar.captureDraft;
  const assessment = assessProcess(process, version);

  const roleById = new Map(sidecar.roles.map((r) => [r.id, r]));
  const systemById = new Map(sidecar.systems.map((s) => [s.id, s]));
  const stepById = draft ? new Map(draft.happyPath.map((step) => [step.stepId, step])) : new Map();

  const getWorkTypeLabel = (workType: string | null | undefined) => {
    switch (workType) {
      case 'manual':
        return 'Manuell';
      case 'user_task':
        return 'Benutzeraufgabe';
      case 'service_task':
        return 'Systemaufgabe';
      case 'ai_assisted':
        return 'KI-unterstützt';
      case 'unknown':
        return 'Unklar';
      default:
        return 'Unklar';
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadMarkdown = () => {
    downloadReportMarkdown(process, version);
  };

  const handleDownloadHtml = () => {
    downloadReportHtml(process, version);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">{process.title}</h1>
          <p className="text-sm text-slate-600">
            Version: {version.versionId.slice(0, 8)}... · Status: {version.status} · Erstellt am:{' '}
            {new Date(version.createdAt).toLocaleString('de-DE')}
          </p>
        </div>
        <div className="no-print flex gap-2">
          <button
            onClick={handleDownloadMarkdown}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 font-medium border border-slate-300"
          >
            Markdown herunterladen
          </button>
          <button
            onClick={handleDownloadHtml}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 font-medium border border-slate-300"
          >
            HTML herunterladen
          </button>
          <button
            onClick={handlePrint}
            className="px-6 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 font-medium"
          >
            Drucken / als PDF speichern
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Prozessprofil</h2>
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="font-medium text-slate-700">Kategorie</dt>
            <dd className="text-slate-600 mt-1">{process.category}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Management-Ebene</dt>
            <dd className="text-slate-600 mt-1">{process.managementLevel}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Hierarchie-Ebene</dt>
            <dd className="text-slate-600 mt-1">{process.hierarchyLevel}</dd>
          </div>
        </dl>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">End-to-End Definition</h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-medium text-slate-700">Trigger (Auslöser)</dt>
            <dd className="text-slate-600 mt-1">
              {version.endToEndDefinition.trigger || '(nicht erfasst)'}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Kunde (Prozessempfänger)</dt>
            <dd className="text-slate-600 mt-1">
              {version.endToEndDefinition.customer || '(nicht erfasst)'}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Ergebnis (Output)</dt>
            <dd className="text-slate-600 mt-1">
              {version.endToEndDefinition.outcome || '(nicht erfasst)'}
            </dd>
          </div>
          {version.endToEndDefinition.doneCriteria && (
            <div>
              <dt className="font-medium text-slate-700">Done-Kriterium</dt>
              <dd className="text-slate-600 mt-1">{version.endToEndDefinition.doneCriteria}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Happy Path</h2>
        {!draft || draft.happyPath.length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 text-sm text-yellow-800">
            Kein Happy Path erfasst
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-300">
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">#</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">Schritt</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">Rolle</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">System</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">Arbeitstyp</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">Pain Point</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">Data In</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">Data Out</th>
                </tr>
              </thead>
              <tbody>
                {draft.happyPath.map((step) => (
                  <tr key={step.stepId} className="border-b border-slate-200">
                    <td className="py-3 px-3 text-slate-700 font-medium">{step.order}</td>
                    <td className="py-3 px-3 text-slate-900">{step.label}</td>
                    <td className="py-3 px-3 text-slate-600">
                      {step.roleId ? roleById.get(step.roleId)?.name || step.roleId : '-'}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {step.systemId ? systemById.get(step.systemId)?.name || step.systemId : '-'}
                    </td>
                    <td className="py-3 px-3 text-slate-600">{getWorkTypeLabel(step.workType)}</td>
                    <td className="py-3 px-3 text-slate-600">{step.painPointHint || '-'}</td>
                    <td className="py-3 px-3 text-slate-600">
                      {step.dataIn && step.dataIn.length > 0 ? step.dataIn.join(', ') : '-'}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {step.dataOut && step.dataOut.length > 0 ? step.dataOut.join(', ') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">To-Be Hinweise</h2>
        {!draft || draft.happyPath.filter((step) => step.toBeHint).length === 0 ? (
          <p className="text-sm text-slate-500">Keine To-Be Hinweise erfasst</p>
        ) : (
          <div className="space-y-4">
            {draft.happyPath
              .filter((step) => step.toBeHint)
              .map((step) => (
                <div key={step.stepId} className="border-l-4 border-slate-300 pl-4">
                  <div className="font-medium text-slate-900 mb-2">
                    {step.order}. {step.label}
                  </div>
                  <ul className="space-y-1 text-sm text-slate-700">
                    {step.toBeHint!.split('\n').map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Entscheidungen ({draft?.decisions.length || 0})
        </h2>
        {!draft || draft.decisions.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Entscheidungen erfasst</p>
        ) : (
          <div className="space-y-4">
            {draft.decisions.map((decision) => {
              const afterStep = stepById.get(decision.afterStepId);
              return (
                <div key={decision.decisionId} className="border border-slate-200 rounded-md p-4">
                  <div className="mb-2">
                    <span className="font-medium text-slate-700">Nach Schritt:</span>{' '}
                    <span className="text-slate-900">
                      {afterStep ? `${afterStep.order}. ${afterStep.label}` : decision.afterStepId}
                    </span>
                  </div>
                  <div className="mb-2">
                    <span className="font-medium text-slate-700">Frage:</span>{' '}
                    <span className="text-slate-900">{decision.question}</span>
                  </div>
                  <div className="mb-2">
                    <span className="font-medium text-slate-700">Gateway-Typ:</span>{' '}
                    <span className="text-slate-600 uppercase text-xs font-mono">
                      {decision.gatewayType}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">Verzweigungen:</span>
                    <ul className="mt-1 space-y-1 ml-4 list-disc list-inside text-sm">
                      {decision.branches.map((branch, idx) => {
                        const nextStep = branch.nextStepId ? stepById.get(branch.nextStepId) : null;
                        return (
                          <li key={idx} className="text-slate-600">
                            {branch.conditionLabel} →{' '}
                            {nextStep
                              ? `${nextStep.order}. ${nextStep.label}`
                              : branch.nextStepId || 'Prozessende'}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Ausnahmen ({draft?.exceptions.length || 0})
        </h2>
        {!draft || draft.exceptions.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Ausnahmen erfasst</p>
        ) : (
          <div className="space-y-4">
            {draft.exceptions.map((exception) => {
              const relatedStep = exception.relatedStepId
                ? stepById.get(exception.relatedStepId)
                : null;
              return (
                <div key={exception.exceptionId} className="border border-slate-200 rounded-md p-4">
                  <div className="mb-2">
                    <span className="font-medium text-slate-700">Typ:</span>{' '}
                    <span className="text-slate-900">{exception.type}</span>
                  </div>
                  {relatedStep && (
                    <div className="mb-2">
                      <span className="font-medium text-slate-700">Bezugsschritt:</span>{' '}
                      <span className="text-slate-900">
                        {relatedStep.order}. {relatedStep.label}
                      </span>
                    </div>
                  )}
                  <div className="mb-2">
                    <span className="font-medium text-slate-700">Beschreibung:</span>{' '}
                    <span className="text-slate-600">{exception.description}</span>
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">Handling:</span>{' '}
                    <span className="text-slate-600">{exception.handling || '(nicht erfasst)'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          KPIs ({sidecar.kpis.length})
        </h2>
        {sidecar.kpis.length === 0 ? (
          <p className="text-sm text-slate-500">Keine KPIs erfasst</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-300">
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">Name</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">Definition</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">Einheit</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">Zielwert</th>
                </tr>
              </thead>
              <tbody>
                {sidecar.kpis.map((kpi) => (
                  <tr key={kpi.id} className="border-b border-slate-200">
                    <td className="py-3 px-3 text-slate-900 font-medium">{kpi.name}</td>
                    <td className="py-3 px-3 text-slate-600">{kpi.definition || '-'}</td>
                    <td className="py-3 px-3 text-slate-600">{kpi.unit || '-'}</td>
                    <td className="py-3 px-3 text-slate-600">{kpi.target || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sidecar.aiReadinessSignals && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">KI-Reife Signale</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="font-medium text-slate-700">Standardisierung</dt>
              <dd className="text-slate-600 mt-1 capitalize">
                {sidecar.aiReadinessSignals.standardization}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Datenverfügbarkeit</dt>
              <dd className="text-slate-600 mt-1 capitalize">
                {sidecar.aiReadinessSignals.dataAvailability}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Variabilität</dt>
              <dd className="text-slate-600 mt-1 capitalize">
                {sidecar.aiReadinessSignals.variability}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Compliance-Risiko</dt>
              <dd className="text-slate-600 mt-1 capitalize">
                {sidecar.aiReadinessSignals.complianceRisk}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Maßnahmen-Backlog ({sidecar.improvementBacklog?.length || 0})
        </h2>
        {!sidecar.improvementBacklog || sidecar.improvementBacklog.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Maßnahmen erfasst</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-300">
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">Priorität</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">Status</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">Kategorie</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">Maßnahme</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">Scope/Schritt</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">Verantwortlich</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-900 bg-slate-50">Fällig</th>
                </tr>
              </thead>
              <tbody>
                {sidecar.improvementBacklog.map((item) => {
                  const levelWeight = (level: string): number => {
                    switch (level) {
                      case 'low':
                        return 1;
                      case 'medium':
                        return 2;
                      case 'high':
                        return 3;
                      default:
                        return 2;
                    }
                  };
                  const score = levelWeight(item.impact) * 2 - levelWeight(item.effort) - levelWeight(item.risk);
                  const priorityLabel = score >= 3 ? 'Hoch' : score >= 1 ? 'Mittel' : 'Niedrig';

                  const categoryLabels: Record<string, string> = {
                    standardize: 'Standardisierung',
                    digitize: 'Digitalisierung',
                    automate: 'Automatisierung',
                    ai: 'KI-Einsatz',
                    data: 'Daten',
                    governance: 'Governance',
                    customer: 'Kundennutzen',
                    compliance: 'Compliance',
                    kpi: 'Messung/KPI',
                  };

                  const statusLabels: Record<string, string> = {
                    idea: 'Idee',
                    planned: 'Geplant',
                    in_progress: 'In Arbeit',
                    done: 'Erledigt',
                    discarded: 'Verworfen',
                  };

                  const scopeText =
                    item.scope === 'process'
                      ? 'Prozess'
                      : item.relatedStepId
                      ? stepById.get(item.relatedStepId)?.label || item.relatedStepId
                      : 'Schritt';

                  const approachLabels: Record<string, string> = {
                    workflow: 'Workflow',
                    rpa: 'RPA',
                    api_integration: 'API-Integration',
                    erp_config: 'ERP-Konfiguration',
                    low_code: 'Low-Code',
                    ai_assistant: 'KI-Assistent',
                    ai_document_processing: 'KI-Dokumente',
                    ai_classification: 'KI-Klassifikation',
                    process_mining: 'Process Mining',
                    other: 'Sonstiges',
                  };

                  const levelLabels: Record<string, string> = {
                    assist: 'Assistiert',
                    partial: 'Teilautomatisiert',
                    straight_through: 'Vollautomatisiert',
                  };

                  const blueprint = item.automationBlueprint;
                  const systemCount = blueprint?.systemIds?.length || 0;
                  const dataObjectCount = blueprint?.dataObjectIds?.length || 0;

                  return (
                    <tr key={item.id} className="border-b border-slate-200">
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-900">
                          {score >= 0 ? '+' : ''}
                          {score}
                        </div>
                        <div
                          className={`text-xs ${
                            score >= 3 ? 'text-green-700' : score >= 1 ? 'text-yellow-700' : 'text-red-700'
                          }`}
                        >
                          {priorityLabel}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600">{statusLabels[item.status] || item.status}</td>
                      <td className="py-3 px-3 text-slate-600">{categoryLabels[item.category] || item.category}</td>
                      <td className="py-3 px-3">
                        <div className="text-slate-900">{item.title}</div>
                        {blueprint && (
                          <div className="text-xs text-slate-600 mt-1">
                            Umsetzung: {approachLabels[blueprint.approach] || blueprint.approach} · Zielgrad: {levelLabels[blueprint.level] || blueprint.level} · HITL: {blueprint.humanInTheLoop ? 'Ja' : 'Nein'}
                            {systemCount > 0 && ` · Systeme: ${systemCount}`}
                            {dataObjectCount > 0 && ` · Datenobjekte: ${dataObjectCount}`}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600">{scopeText}</td>
                      <td className="py-3 px-3 text-slate-600">{item.owner || '-'}</td>
                      <td className="py-3 px-3 text-slate-600">
                        {item.dueDate ? new Date(item.dueDate).toLocaleDateString('de-DE') : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Qualität: Benennungshinweise ({version.quality.namingFindings.length})
        </h2>
        {version.quality.namingFindings.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Auffälligkeiten</p>
        ) : (
          <ul className="space-y-2">
            {version.quality.namingFindings.map((finding, idx) => (
              <li
                key={idx}
                className={`p-3 rounded-md text-sm ${
                  finding.severity === 'warn'
                    ? 'bg-yellow-50 border border-yellow-200'
                    : 'bg-blue-50 border border-blue-200'
                }`}
              >
                <div className={finding.severity === 'warn' ? 'text-yellow-900' : 'text-blue-900'}>
                  {finding.message}
                </div>
                {finding.exampleFix && (
                  <div
                    className={`text-xs mt-1 ${
                      finding.severity === 'warn' ? 'text-yellow-700' : 'text-blue-700'
                    }`}
                  >
                    Vorschlag: {finding.exampleFix}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Qualität: Semantische Prüffragen ({version.quality.semanticQuestions.length})
        </h2>
        {version.quality.semanticQuestions.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Fragen generiert</p>
        ) : (
          <ul className="space-y-2">
            {version.quality.semanticQuestions.map((question) => (
              <li key={question.id} className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <div className="text-sm font-medium text-slate-900">{question.question}</div>
                {question.relatedStepHint && (
                  <div className="text-xs text-slate-500 mt-1">Bezug: {question.relatedStepHint}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        className="rounded-lg border-2 border-cyan-500 p-8 relative"
        style={{
          background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
          overflow: 'hidden'
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(20, 184, 166, 0.08) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(20, 184, 166, 0.08) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />

        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity: 0.06 }}
        >
          <defs>
            <pattern id="bpmPattern" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
              <circle cx="40" cy="40" r="30" fill="#14b8a6" />
              <rect x="120" y="20" width="50" height="50" rx="8" fill="#14b8a6" />
              <path d="M 40 140 L 60 160 L 40 180 L 20 160 Z" fill="#14b8a6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#bpmPattern)" />
        </svg>

        <div className="relative" style={{ zIndex: 10 }}>
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
            <span className="inline-block w-2 h-8 bg-gradient-to-b from-cyan-500 to-teal-600 rounded-full"></span>
            Assessment: Digitalisierung & Automatisierung
          </h2>

          <div className="mb-8 p-6 rounded-xl bg-white/80 backdrop-blur-sm border border-white/40 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Gesamtbewertung</span>
              <span className="text-3xl font-bold text-slate-900">{assessment.overallScore0to100}/100</span>
            </div>
            <div
              className="w-full rounded-full h-6 shadow-inner"
              style={{
                background: 'linear-gradient(to right, #e2e8f0, #cbd5e1)',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  width: `${assessment.overallScore0to100}%`,
                  height: '100%',
                  borderRadius: '9999px',
                  background: assessment.overallScore0to100 >= 70
                    ? 'linear-gradient(to right, #10b981, #059669)'
                    : assessment.overallScore0to100 >= 40
                    ? 'linear-gradient(to right, #f59e0b, #d97706)'
                    : 'linear-gradient(to right, #ef4444, #dc2626)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  transition: 'width 0.5s ease-out'
                }}
              />
            </div>
            <p className="text-sm text-slate-700 mt-3 font-medium">{assessment.summary}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
            {assessment.dimensions.slice(0, 9).map((dim, idx) => {
              const rowIndex = Math.floor(idx / 3);
              const normalizedScore = dim.score0to100 / 100;
              const opacity = 0.25 + (normalizedScore * 0.75);

              let baseColor = '';
              let shadowColor = '';
              if (rowIndex === 0) {
                baseColor = `rgba(59, 130, 246, ${opacity})`;
                shadowColor = 'rgba(59, 130, 246, 0.5)';
              } else if (rowIndex === 1) {
                baseColor = `rgba(34, 197, 94, ${opacity})`;
                shadowColor = 'rgba(34, 197, 94, 0.5)';
              } else {
                baseColor = `rgba(239, 68, 68, ${opacity})`;
                shadowColor = 'rgba(239, 68, 68, 0.5)';
              }

              return (
                <div
                  key={dim.key}
                  className="rounded-xl p-6 border-2 border-white/30 transition-all duration-300"
                  style={{
                    backgroundColor: baseColor,
                    boxShadow: `0 4px 20px ${shadowColor}, 0 0 0 1px rgba(255,255,255,0.1) inset`,
                    transform: 'translateY(0)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
                    e.currentTarget.style.boxShadow = `0 12px 30px ${shadowColor}, 0 0 0 1px rgba(255,255,255,0.2) inset`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = `0 4px 20px ${shadowColor}, 0 0 0 1px rgba(255,255,255,0.1) inset`;
                  }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-base font-bold text-white leading-tight pr-2" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
                      {dim.label}
                    </h3>
                    <div className="flex items-baseline gap-1 shrink-0">
                      <span className="text-3xl font-black text-white" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
                        {dim.score0to100}
                      </span>
                      <span className="text-sm text-white/90 font-semibold">/100</span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <span
                      className="inline-block px-3 py-1.5 text-xs font-bold rounded-full shadow-md"
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        color: dim.level === 'high' ? '#059669' : dim.level === 'medium' ? '#d97706' : '#dc2626'
                      }}
                    >
                      {dim.level === 'high' ? 'HOCH' : dim.level === 'medium' ? 'MITTEL' : 'NIEDRIG'}
                    </span>
                  </div>

                  {dim.recommendations.length > 0 && (
                    <div className="space-y-2">
                      {dim.recommendations.slice(0, 2).map((rec, recIdx) => (
                        <div
                          key={recIdx}
                          className="text-xs text-white font-medium leading-relaxed flex items-start gap-2"
                          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}
                        >
                          <span className="inline-block mt-0.5">▸</span>
                          <span>{rec}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {assessment.nextSteps.length > 0 && (
            <div className="p-6 rounded-xl bg-white/80 backdrop-blur-sm border border-white/40 shadow-lg">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <span className="inline-block w-1.5 h-6 bg-gradient-to-b from-teal-500 to-cyan-600 rounded-full"></span>
                Nächste Schritte
              </h3>
              <ol className="space-y-3">
                {assessment.nextSteps.slice(0, 10).map((step, idx) => (
                  <li key={idx} className="flex items-start text-sm">
                    <span
                      className="font-bold text-white mr-3 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs shadow-md"
                      style={{
                        background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)'
                      }}
                    >
                      {idx + 1}
                    </span>
                    <span className="text-slate-800 font-medium pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

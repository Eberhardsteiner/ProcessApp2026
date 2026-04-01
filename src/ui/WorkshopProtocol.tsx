import type { Process, ProcessVersion, ImprovementBacklogItem } from '../domain/process';

interface WorkshopProtocolProps {
  process: Process;
  version: ProcessVersion;
}

type LevelValue = 'low' | 'medium' | 'high';

function levelWeight(level: LevelValue | undefined): number {
  if (level === 'high') return 3;
  if (level === 'medium') return 2;
  if (level === 'low') return 1;
  return 0;
}

function computePriorityScore(item: ImprovementBacklogItem): number {
  return levelWeight(item.impact) * 2 - levelWeight(item.effort) - levelWeight(item.risk);
}

function priorityLabel(score: number): string {
  if (score >= 3) return 'hoch';
  if (score >= 1) return 'mittel';
  return 'niedrig';
}

function getStepLabel(item: ImprovementBacklogItem, version: ProcessVersion): string {
  if (item.scope === 'process') return 'Prozess';
  if (item.scope === 'step' && item.relatedStepId) {
    const draft = version.sidecar.captureDraft;
    if (draft) {
      const step = draft.happyPath.find((s) => s.stepId === item.relatedStepId);
      if (step) return `Schritt ${step.order}. ${step.label}`;
    }
    return `Schritt ${item.relatedStepId.substring(0, 8)}`;
  }
  return '-';
}

export function WorkshopProtocol({ process, version }: WorkshopProtocolProps) {
  const items = version.sidecar.improvementBacklog ?? [];
  const openItems = items.filter((i) => i.status !== 'done' && i.status !== 'discarded');

  const itemsWithScore = openItems.map((item) => ({
    item,
    score: computePriorityScore(item),
  }));

  const topItems = [...itemsWithScore]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.item.dueDate && b.item.dueDate) return a.item.dueDate.localeCompare(b.item.dueDate);
      if (a.item.dueDate) return -1;
      if (b.item.dueDate) return 1;
      return 0;
    })
    .slice(0, 10);

  const dueItems = [...openItems]
    .filter((i) => i.dueDate)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
    .slice(0, 10);

  const riskItems = [...itemsWithScore]
    .filter((i) => i.item.risk === 'high' || i.item.category === 'compliance')
    .sort((a, b) => {
      const riskCompare = levelWeight(b.item.risk) - levelWeight(a.item.risk);
      if (riskCompare !== 0) return riskCompare;
      return b.score - a.score;
    })
    .slice(0, 10);

  const ownerGroups: Record<string, ImprovementBacklogItem[]> = {};
  for (const item of openItems) {
    const ownerKey = item.owner?.trim() || '(nicht zugeordnet)';
    if (!ownerGroups[ownerKey]) ownerGroups[ownerKey] = [];
    ownerGroups[ownerKey].push(item);
  }

  const sortedOwners = Object.keys(ownerGroups).sort((a, b) => {
    if (a === '(nicht zugeordnet)') return 1;
    if (b === '(nicht zugeordnet)') return -1;
    return a.localeCompare(b);
  });

  for (const owner of sortedOwners) {
    ownerGroups[owner].sort((a, b) => {
      const scoreA = computePriorityScore(a);
      const scoreB = computePriorityScore(b);
      if (scoreB !== scoreA) return scoreB - scoreA;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });
  }

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('de-DE');
    } catch {
      return dateStr;
    }
  };

  const currentDate = new Date().toLocaleDateString('de-DE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{process.title}</h1>
          <p className="text-sm text-slate-600 mt-1">
            Workshop-Protokoll | Version: {version.versionId.substring(0, 8)} | {currentDate}
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="no-print px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800"
        >
          Drucken / als PDF speichern
        </button>
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Top-Maßnahmen (offen)</h2>
          {topItems.length === 0 ? (
            <p className="text-sm text-slate-500">Keine offenen Maßnahmen erfasst</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-300">
                    <th className="text-left py-2 px-3 font-semibold text-slate-900 bg-slate-50">Priorität</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900 bg-slate-50">Maßnahme</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900 bg-slate-50">Kategorie</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900 bg-slate-50">Scope</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900 bg-slate-50">Owner</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900 bg-slate-50">Fällig</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900 bg-slate-50">Risiko</th>
                  </tr>
                </thead>
                <tbody>
                  {topItems.map(({ item, score }) => (
                    <tr key={item.id} className="border-b border-slate-200">
                      <td className="py-2 px-3 text-slate-700">
                        {score} ({priorityLabel(score)})
                      </td>
                      <td className="py-2 px-3 text-slate-900">{item.title}</td>
                      <td className="py-2 px-3 text-slate-600 capitalize">{item.category}</td>
                      <td className="py-2 px-3 text-slate-600">{getStepLabel(item, version)}</td>
                      <td className="py-2 px-3 text-slate-600">{item.owner || '-'}</td>
                      <td className="py-2 px-3 text-slate-600">{formatDate(item.dueDate)}</td>
                      <td className="py-2 px-3 text-slate-600 capitalize">{item.risk || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="break-before-page">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Verantwortliche</h2>
          {sortedOwners.length === 0 ? (
            <p className="text-sm text-slate-500">Keine offenen Maßnahmen erfasst</p>
          ) : (
            <div className="space-y-4">
              {sortedOwners.map((owner) => (
                <div key={owner} className="border-l-4 border-slate-300 pl-4">
                  <h3 className="font-semibold text-slate-900 mb-2">{owner}</h3>
                  <ul className="space-y-1 text-sm text-slate-700">
                    {ownerGroups[owner].map((item) => {
                      const score = computePriorityScore(item);
                      return (
                        <li key={item.id}>
                          <span className="font-medium">{item.title}</span>
                          <span className="text-slate-500">
                            {' '}
                            (Priorität: {priorityLabel(score)}
                            {item.dueDate ? `, Fällig: ${formatDate(item.dueDate)}` : ''})
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="break-before-page">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Fälligkeiten</h2>
          {dueItems.length === 0 ? (
            <p className="text-sm text-slate-500">Keine offenen Maßnahmen mit Fälligkeitsdatum</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-300">
                    <th className="text-left py-2 px-3 font-semibold text-slate-900 bg-slate-50">Fällig</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900 bg-slate-50">Maßnahme</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900 bg-slate-50">Owner</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900 bg-slate-50">Kategorie</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900 bg-slate-50">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dueItems.map((item) => (
                    <tr key={item.id} className="border-b border-slate-200">
                      <td className="py-2 px-3 text-slate-700 font-medium">{formatDate(item.dueDate)}</td>
                      <td className="py-2 px-3 text-slate-900">{item.title}</td>
                      <td className="py-2 px-3 text-slate-600">{item.owner || '-'}</td>
                      <td className="py-2 px-3 text-slate-600 capitalize">{item.category}</td>
                      <td className="py-2 px-3 text-slate-600 capitalize">{item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="break-before-page">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Risiken</h2>
          {riskItems.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Hochrisiko- oder Compliance-Maßnahmen erfasst</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-300">
                    <th className="text-left py-2 px-3 font-semibold text-slate-900 bg-slate-50">Maßnahme</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900 bg-slate-50">Kategorie</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900 bg-slate-50">Risiko</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900 bg-slate-50">Owner</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-900 bg-slate-50">Hinweis</th>
                  </tr>
                </thead>
                <tbody>
                  {riskItems.map(({ item }) => (
                    <tr key={item.id} className="border-b border-slate-200">
                      <td className="py-2 px-3 text-slate-900">{item.title}</td>
                      <td className="py-2 px-3 text-slate-600 capitalize">{item.category}</td>
                      <td className="py-2 px-3 text-slate-600 capitalize">{item.risk || '-'}</td>
                      <td className="py-2 px-3 text-slate-600">{item.owner || '-'}</td>
                      <td className="py-2 px-3 text-slate-500 text-xs">
                        {item.category === 'compliance' ? 'Compliance prüfen' : 'Hohes Risiko beachten'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .break-before-page {
            break-before: page;
          }
          @page {
            margin: 1cm;
          }
        }
      `}</style>
    </div>
  );
}

import { useState, useEffect, useCallback, Fragment } from 'react';
import type { Project } from '../domain/process';
import type { Process, ProcessCategory, ProcessManagementLevel, ProcessHierarchyLevel, ProcessVersion } from '../domain/process';
import { createProject, listProjects } from '../storage/repositories/projectsRepo';
import { createProcess, listProcesses } from '../storage/repositories/processesRepo';
import { createVersion, getLatestVersion } from '../storage/repositories/versionsRepo';
import { Building2, Plus, ChevronRight, Layers, TrendingUp } from 'lucide-react';

interface ProcessWithVersion {
  process: Process;
  version: ProcessVersion | null;
}

interface ProcessLandscapeProps {
  onOpenProcess: (processId: string) => void;
}

export function ProcessLandscape({ onOpenProcess }: ProcessLandscapeProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [processesWithVersions, setProcessesWithVersions] = useState<ProcessWithVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({});
  const [newProcessData, setNewProcessData] = useState<{
    title: string;
    category: ProcessCategory;
    managementLevel: ProcessManagementLevel;
  } | null>(null);

  const loadProcesses = useCallback(async () => {
    if (!selectedProjectId) return;

    try {
      const processList = await listProcesses(selectedProjectId);
      const withVersions: ProcessWithVersion[] = await Promise.all(
        processList.map(async (process) => {
          const version = await getLatestVersion(process.processId);
          return { process, version };
        })
      );
      setProcessesWithVersions(withVersions);
    } catch (error) {
      console.error('Error loading processes:', error);
    }
  }, [selectedProjectId]);

  const loadProjects = useCallback(async () => {
    try {
      const projectList = await listProjects();
      setProjects(projectList);
      if (projectList.length > 0 && !selectedProjectId) {
        setSelectedProjectId(projectList[0].projectId);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (selectedProjectId) {
      loadProcesses();
    }
  }, [selectedProjectId, loadProcesses]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    setCreating(true);
    try {
      const project = await createProject(newProjectName.trim(), '');
      await loadProjects();
      setSelectedProjectId(project.projectId);
      setNewProjectName('');
      setShowProjectForm(false);
    } catch (error) {
      console.error('Error creating project:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleCreateProcess = async () => {
    if (!newProcessData || !selectedProjectId) return;

    setCreating(true);
    try {
      const process = await createProcess(selectedProjectId, {
        title: newProcessData.title,
        category: newProcessData.category,
        managementLevel: newProcessData.managementLevel,
        hierarchyLevel: 'landkarte',
      });

      await createVersion(process.processId, {
        status: 'draft',
        titleSnapshot: process.title,
        endToEndDefinition: { trigger: '', customer: '', outcome: '' },
      });

      await loadProcesses();
      setNewProcessData(null);
      onOpenProcess(process.processId);
    } catch (error) {
      console.error('Error creating process:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleOpenProcess = async (process: Process, version: ProcessVersion | null) => {
    if (version) {
      onOpenProcess(process.processId);
    } else {
      setCreating(true);
      try {
        await createVersion(process.processId, {
          status: 'draft',
          titleSnapshot: process.title,
          endToEndDefinition: { trigger: '', customer: '', outcome: '' },
        });
        await loadProcesses();
        onOpenProcess(process.processId);
      } catch (error) {
        console.error('Error creating version:', error);
      } finally {
        setCreating(false);
      }
    }
  };

  const toggleCellExpansion = (cellKey: string) => {
    setExpandedCells((prev) => ({
      ...prev,
      [cellKey]: !prev[cellKey],
    }));
  };

  const categoryLabels: Record<ProcessCategory, string> = {
    steuerung: 'Steuerung',
    kern: 'Kern',
    unterstuetzung: 'Unterstützung',
  };

  const managementLabels: Record<ProcessManagementLevel, string> = {
    strategisch: 'Strategisch',
    fachlich: 'Fachlich',
    technisch: 'Technisch',
  };

  const hierarchyLabels: Record<ProcessHierarchyLevel, string> = {
    landkarte: 'Landkarte',
    hauptprozess: 'Hauptprozess',
    unterprozess: 'Unterprozess',
  };

  const statusLabels = {
    draft: 'Entwurf',
    in_review: 'Review',
    published: 'Veröffentlicht',
  };

  const aiReadinessLabels = {
    low: 'Niedrig',
    medium: 'Mittel',
    high: 'Hoch',
  };

  const getProcessesForCell = (category: ProcessCategory, managementLevel: ProcessManagementLevel) => {
    return processesWithVersions.filter(
      (p) => p.process.category === category && p.process.managementLevel === managementLevel
    );
  };

  const getPhaseProgress = (version?: ProcessVersion) => {
    if (!version) return { done: 0, total: 9 };
    const phases = Object.values(version.captureProgress.phaseStates);
    const done = phases.filter((state) => state === 'done').length;
    return { done, total: 9 };
  };

  const getCellStyles = (category: ProcessCategory, managementLevel: ProcessManagementLevel) => {
    const baseStyles = 'rounded-xl border-2 p-4 min-h-[200px] shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5';

    const colorMap: Record<ProcessManagementLevel, Record<ProcessCategory, string>> = {
      strategisch: {
        steuerung: 'bg-blue-50/50 border-blue-200/60 hover:bg-blue-50/70',
        kern: 'bg-blue-100/70 border-blue-300/70 hover:bg-blue-100/90',
        unterstuetzung: 'bg-blue-200/80 border-blue-400/80 hover:bg-blue-200',
      },
      fachlich: {
        steuerung: 'bg-emerald-50/50 border-emerald-200/60 hover:bg-emerald-50/70',
        kern: 'bg-emerald-100/70 border-emerald-300/70 hover:bg-emerald-100/90',
        unterstuetzung: 'bg-emerald-200/80 border-emerald-400/80 hover:bg-emerald-200',
      },
      technisch: {
        steuerung: 'bg-rose-50/50 border-rose-200/60 hover:bg-rose-50/70',
        kern: 'bg-rose-100/70 border-rose-300/70 hover:bg-rose-100/90',
        unterstuetzung: 'bg-rose-200/80 border-rose-400/80 hover:bg-rose-200',
      },
    };

    return `${baseStyles} ${colorMap[managementLevel][category]}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Lade Projekte...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative bg-slate-50">
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      />
      <div className="relative z-10 bg-gradient-to-r from-cyan-700 to-emerald-700 text-white p-6 border-b border-cyan-800 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Building2 className="w-8 h-8" />
              <div>
                <h1 className="text-2xl font-bold">Prozesslandkarte</h1>
                <p className="text-slate-300 text-sm">Prozesse sammeln, einordnen und priorisieren</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">
        <div className="mb-6 bg-white/90 backdrop-blur-sm rounded-xl border border-white/50 p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Projektauswahl</h2>
            {!showProjectForm && (
              <button
                onClick={() => setShowProjectForm(true)}
                className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-emerald-600 text-white rounded-lg hover:shadow-lg transition-all text-sm font-medium flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Neues Projekt</span>
              </button>
            )}
          </div>

          {showProjectForm ? (
            <div className="flex items-center space-x-3">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Projektname eingeben"
                className="flex-1 px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
              />
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || creating}
                className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-emerald-600 text-white rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all"
              >
                {creating ? 'Erstelle...' : 'Erstellen'}
              </button>
              <button
                onClick={() => {
                  setShowProjectForm(false);
                  setNewProjectName('');
                }}
                className="px-4 py-2 bg-white border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium transition-all"
              >
                Abbrechen
              </button>
            </div>
          ) : projects.length === 0 ? (
            <p className="text-slate-600 text-sm">Noch keine Projekte vorhanden. Erstellen Sie Ihr erstes Projekt.</p>
          ) : (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            >
              {projects.map((project) => (
                <option key={project.projectId} value={project.projectId}>
                  {project.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedProjectId && (
          <>
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900 mb-2">Prozess-Matrix</h2>
              <p className="text-slate-600 text-sm">
                Prozesse nach Kategorie und Management-Ebene organisiert. Klicken Sie auf "Öffnen" oder "Wizard
                starten", um einen Prozess zu bearbeiten.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-1"></div>
              {(['steuerung', 'kern', 'unterstuetzung'] as ProcessCategory[]).map((category) => (
                <div key={category} className="text-center">
                  <h3 className="font-semibold text-slate-900 text-sm">{categoryLabels[category]}</h3>
                </div>
              ))}

              {(['strategisch', 'fachlich', 'technisch'] as ProcessManagementLevel[]).map((managementLevel) => {
                return (
                  <Fragment key={managementLevel}>
                    <div className="flex items-center justify-end pr-4">
                      <h3 className="font-semibold text-slate-900 text-sm">{managementLabels[managementLevel]}</h3>
                    </div>
                    {(['steuerung', 'kern', 'unterstuetzung'] as ProcessCategory[]).map((category) => {
                      const cellProcesses = getProcessesForCell(category, managementLevel);
                      const cellKey = `${managementLevel}:${category}`;
                      const expanded = expandedCells[cellKey] === true;
                      const visible = expanded ? cellProcesses : cellProcesses.slice(0, 8);

                      return (
                        <div
                          key={`${category}-${managementLevel}`}
                          className={getCellStyles(category, managementLevel)}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-xs font-medium text-slate-500">
                              {cellProcesses.length} Prozess{cellProcesses.length !== 1 ? 'e' : ''}
                            </div>
                            <button
                              onClick={() =>
                                setNewProcessData({
                                  title: '',
                                  category,
                                  managementLevel,
                                })
                              }
                              className="text-slate-400 hover:text-slate-600"
                              title="Neuer Prozess"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="space-y-2">
                            {visible.map(({ process, version }) => {
                              const progress = getPhaseProgress(version || undefined);
                              const accentColorMap: Record<ProcessManagementLevel, string> = {
                                strategisch: 'border-l-4 border-l-blue-500',
                                fachlich: 'border-l-4 border-l-emerald-500',
                                technisch: 'border-l-4 border-l-rose-500',
                              };
                              return (
                                <div
                                  key={process.processId}
                                  className={`bg-white rounded-lg p-3 shadow hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 ${accentColorMap[managementLevel]}`}
                                >
                                  <div className="flex items-start justify-between mb-2">
                                    <h4 className="font-medium text-slate-900 text-sm flex-1">{process.title}</h4>
                                  </div>

                                  <div className="flex flex-wrap gap-1 mb-2">
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs">
                                      {hierarchyLabels[process.hierarchyLevel]}
                                    </span>
                                    {version && (
                                      <span
                                        className={`px-2 py-0.5 rounded text-xs ${
                                          version.status === 'published'
                                            ? 'bg-green-100 text-green-800'
                                            : version.status === 'in_review'
                                            ? 'bg-blue-100 text-blue-800'
                                            : 'bg-slate-100 text-slate-700'
                                        }`}
                                      >
                                        {statusLabels[version.status]}
                                      </span>
                                    )}
                                  </div>

                                  {version && (
                                    <div className="space-y-2 mb-3">
                                      <div className="flex items-center space-x-2">
                                        <Layers className="w-3 h-3 text-slate-400" />
                                        <div className="flex-1">
                                          <div className="flex justify-between text-xs text-slate-600 mb-1">
                                            <span>Erfassung</span>
                                            <span>
                                              {progress.done}/{progress.total}
                                            </span>
                                          </div>
                                          <div className="w-full bg-slate-200 rounded-full h-1.5">
                                            <div
                                              className="bg-slate-900 h-1.5 rounded-full"
                                              style={{ width: `${(progress.done / progress.total) * 100}%` }}
                                            />
                                          </div>
                                        </div>
                                      </div>

                                      {version.sidecar.aiReadinessSignals && (
                                        <div className="flex items-start space-x-2">
                                          <TrendingUp className="w-3 h-3 text-slate-400 mt-0.5" />
                                          <div className="flex-1">
                                            <div className="text-xs text-slate-600 mb-1">AI-Reife</div>
                                            <div className="flex flex-wrap gap-1">
                                              {Object.entries(version.sidecar.aiReadinessSignals).map(([key, value]) => (
                                                <span
                                                  key={key}
                                                  className={`px-1.5 py-0.5 rounded text-xs ${
                                                    value === 'high'
                                                      ? 'bg-green-100 text-green-800'
                                                      : value === 'medium'
                                                      ? 'bg-yellow-100 text-yellow-800'
                                                      : 'bg-red-100 text-red-800'
                                                  }`}
                                                  title={key}
                                                >
                                                  {aiReadinessLabels[value as keyof typeof aiReadinessLabels]}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  <button
                                    onClick={() => handleOpenProcess(process, version)}
                                    disabled={creating}
                                    className="w-full px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-emerald-600 text-white rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium flex items-center justify-center space-x-1 transition-all"
                                  >
                                    <span>{version ? 'Öffnen' : 'Wizard starten'}</span>
                                    <ChevronRight className="w-3 h-3" />
                                  </button>
                                </div>
                              );
                            })}

                            {cellProcesses.length > 8 && (
                              <button
                                onClick={() => toggleCellExpansion(cellKey)}
                                className="w-full text-center text-xs text-slate-600 hover:text-slate-900 py-2"
                              >
                                {expanded ? 'Weniger anzeigen' : `Mehr anzeigen (+${cellProcesses.length - 8})`}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </Fragment>
                );
              })}
            </div>
          </>
        )}
      </div>

      {newProcessData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Neuen Prozess erstellen</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">Prozessname</label>
              <input
                type="text"
                value={newProcessData.title}
                onChange={(e) =>
                  setNewProcessData({
                    ...newProcessData,
                    title: e.target.value,
                  })
                }
                placeholder="z.B. Angebotserstellung"
                className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                autoFocus
              />
            </div>

            <div className="mb-4">
              <div className="text-sm text-slate-600">
                <div className="mb-2">
                  <span className="font-medium">Kategorie:</span> {categoryLabels[newProcessData.category]}
                </div>
                <div>
                  <span className="font-medium">Management-Ebene:</span>{' '}
                  {managementLabels[newProcessData.managementLevel]}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setNewProcessData(null)}
                className="px-4 py-2 bg-white border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium transition-all"
              >
                Abbrechen
              </button>
              <button
                onClick={handleCreateProcess}
                disabled={!newProcessData.title.trim() || creating}
                className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-emerald-600 text-white rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all"
              >
                {creating ? 'Erstelle...' : 'Erstellen & Öffnen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useProjects } from '@/contexts/ProjectsContext';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { StatusBadge } from '@/components/StatusBadge';
import type { ProjectSummary } from '@/types';

export function Sidebar() {
  const { state: projectsState } = useProjects();
  const { state: activeState, dispatch, focusChatInput } = useActiveProject();

  function handleSelectProject(project: ProjectSummary) {
    if (activeState.selectedProjectId !== project.id) {
      dispatch({ type: 'SELECT_PROJECT', payload: project.id });
    }
  }

  function handleNewProject() {
    focusChatInput();
  }

  return (
    <aside className="relative w-72 flex-shrink-0 border-r border-surface-800 bg-surface-900/80 backdrop-blur-xl flex flex-col h-full">
      {/* Header / branding */}
      <div className="p-4 border-b border-surface-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-6 w-6 flex-shrink-0 rounded-md bg-brand-gradient shadow-glow-violet" aria-hidden="true" />
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-surface-50 tracking-tight truncate">
              AI Pipeline
            </h1>
            <p className="text-[10px] text-surface-400 -mt-0.5 tracking-wide uppercase">
              Control Room
            </p>
          </div>
        </div>
        <button
          onClick={handleNewProject}
          className="flex-shrink-0 text-xs font-semibold text-white px-2.5 py-1.5 rounded-lg bg-brand-gradient bg-[length:200%_200%] hover:bg-right shadow-glow-violet hover:shadow-glow-cyan transition-all duration-300 active:scale-95"
          aria-label="New project"
        >
          + New
        </button>
      </div>

      {/* Project list */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1" aria-label="Project list">
        {projectsState.loading && (
          <div className="px-3 py-3 space-y-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-12 rounded-lg bg-surface-800/60 bg-gradient-shimmer animate-shimmer"
              />
            ))}
          </div>
        )}

        {projectsState.error && (
          <p className="px-3 py-2 text-sm text-status-failed-400" role="alert">
            {projectsState.error}
          </p>
        )}

        {!projectsState.loading &&
          !projectsState.error &&
          projectsState.projects.length === 0 && (
            <div className="px-3 py-6 text-center">
              <p className="text-sm text-surface-300">No projects yet.</p>
              <p className="text-xs text-surface-500 mt-1">
                Click <span className="text-brand-fuchsia font-medium">+ New</span> and tell the
                Communicator what to build.
              </p>
            </div>
          )}

        <ul className="space-y-1" role="list">
          {projectsState.projects.map((project) => {
            const isSelected = activeState.selectedProjectId === project.id;
            return (
              <li key={project.id} role="listitem">
                <button
                  onClick={() => handleSelectProject(project)}
                  aria-pressed={isSelected}
                  aria-label={`Select project ${project.name}`}
                  className={`group w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 border animate-fade-in-up ${
                    isSelected
                      ? 'bg-brand-gradient-subtle border-brand-violet/40 shadow-glow-violet'
                      : 'border-transparent hover:bg-surface-800/70 hover:border-surface-700'
                  }`}
                >
                  <div className="flex flex-col gap-1.5">
                    <span
                      className={`text-sm font-medium truncate transition-colors ${
                        isSelected ? 'text-surface-50' : 'text-surface-200 group-hover:text-surface-50'
                      }`}
                    >
                      {project.name}
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-surface-500 truncate">
                        {project.slug}
                      </span>
                      <StatusBadge status={project.status} />
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

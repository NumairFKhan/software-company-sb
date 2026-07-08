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
    <aside className="w-64 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h1 className="text-sm font-semibold text-gray-900">Projects</h1>
        <button
          onClick={handleNewProject}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
          aria-label="New project"
        >
          + New
        </button>
      </div>

      {/* Project list */}
      <nav className="flex-1 overflow-y-auto p-2" aria-label="Project list">
        {projectsState.loading && (
          <p className="px-3 py-2 text-sm text-gray-500">
            Loading projects…
          </p>
        )}

        {projectsState.error && (
          <p className="px-3 py-2 text-sm text-red-600" role="alert">
            {projectsState.error}
          </p>
        )}

        {!projectsState.loading &&
          !projectsState.error &&
          projectsState.projects.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-500">
              No projects yet. Click + New to start.
            </p>
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
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                    isSelected
                      ? 'bg-blue-50 border border-blue-200'
                      : 'hover:bg-gray-100 border border-transparent'
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {project.name}
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500 truncate">
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

/**
 * Tests for the Sidebar component.
 * The component consumes ProjectsContext and ActiveProjectContext, so we
 * render it inside those providers (using simple wrapper components that
 * seed the contexts with controlled state).
 */

import React, { useEffect } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '@/components/Sidebar';
import {
  ProjectsContext,
  type ProjectsContextValue,
} from '@/contexts/ProjectsContext';
import {
  ActiveProjectContext,
  type ActiveProjectContextValue,
  initialActiveProjectState,
} from '@/contexts/ActiveProjectContext';
import type { ProjectSummary } from '@/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeProject(id: string, status: ProjectSummary['status'] = 'planning'): ProjectSummary {
  return {
    id,
    name: `Project ${id}`,
    slug: `project-${id}`,
    status,
    pr_url: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

function renderSidebar({
  projects = [] as ProjectSummary[],
  loading = false,
  error = null as string | null,
  selectedProjectId = null as string | null,
  onDispatch = jest.fn(),
  onFocusChatInput = jest.fn(),
} = {}) {
  const projectsValue: ProjectsContextValue = {
    state: { projects, loading, error },
    dispatch: jest.fn(),
    refreshProjects: jest.fn(),
  };

  const chatInputRef = React.createRef<HTMLInputElement>();

  const activeValue: ActiveProjectContextValue = {
    state: { ...initialActiveProjectState, selectedProjectId },
    dispatch: onDispatch,
    chatInputRef,
    focusChatInput: onFocusChatInput,
  };

  return render(
    <ProjectsContext.Provider value={projectsValue}>
      <ActiveProjectContext.Provider value={activeValue}>
        <Sidebar />
      </ActiveProjectContext.Provider>
    </ProjectsContext.Provider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Sidebar', () => {
  it('renders the "Projects" heading', () => {
    renderSidebar();
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  it('renders the "+ New" button', () => {
    renderSidebar();
    expect(
      screen.getByRole('button', { name: /new project/i }),
    ).toBeInTheDocument();
  });

  it('calls focusChatInput when "+ New" is clicked', () => {
    const onFocusChatInput = jest.fn();
    renderSidebar({ onFocusChatInput });
    fireEvent.click(screen.getByRole('button', { name: /new project/i }));
    expect(onFocusChatInput).toHaveBeenCalledTimes(1);
  });

  it('shows "Loading…" text while loading', () => {
    renderSidebar({ loading: true });
    expect(screen.getByText(/loading projects/i)).toBeInTheDocument();
  });

  it('shows the error message when there is an error', () => {
    renderSidebar({ error: 'Failed to fetch' });
    expect(screen.getByText(/failed to fetch/i)).toBeInTheDocument();
  });

  it('shows empty-state message when no projects exist', () => {
    renderSidebar({ projects: [] });
    expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
  });

  it('renders a list item for each project', () => {
    const projects = [makeProject('p1'), makeProject('p2'), makeProject('p3')];
    renderSidebar({ projects });
    expect(screen.getByText('Project p1')).toBeInTheDocument();
    expect(screen.getByText('Project p2')).toBeInTheDocument();
    expect(screen.getByText('Project p3')).toBeInTheDocument();
  });

  it('renders project slug under the name', () => {
    const projects = [makeProject('p1')];
    renderSidebar({ projects });
    expect(screen.getByText('project-p1')).toBeInTheDocument();
  });

  it('dispatches SELECT_PROJECT when a project is clicked', () => {
    const onDispatch = jest.fn();
    const projects = [makeProject('p1')];
    renderSidebar({ projects, onDispatch });

    fireEvent.click(screen.getByRole('button', { name: /select project project p1/i }));

    expect(onDispatch).toHaveBeenCalledWith({
      type: 'SELECT_PROJECT',
      payload: 'p1',
    });
  });

  it('does NOT dispatch when clicking an already-selected project', () => {
    const onDispatch = jest.fn();
    const projects = [makeProject('p1')];
    renderSidebar({ projects, selectedProjectId: 'p1', onDispatch });

    fireEvent.click(screen.getByRole('button', { name: /select project project p1/i }));

    expect(onDispatch).not.toHaveBeenCalled();
  });

  it('marks the selected project button with aria-pressed="true"', () => {
    const projects = [makeProject('p1'), makeProject('p2')];
    renderSidebar({ projects, selectedProjectId: 'p1' });

    const p1Button = screen.getByRole('button', { name: /select project project p1/i });
    const p2Button = screen.getByRole('button', { name: /select project project p2/i });

    expect(p1Button).toHaveAttribute('aria-pressed', 'true');
    expect(p2Button).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders a StatusBadge for each project', () => {
    const projects = [
      makeProject('p1', 'building'),
      makeProject('p2', 'done'),
    ];
    renderSidebar({ projects });

    expect(screen.getByTestId('status-badge-building')).toBeInTheDocument();
    expect(screen.getByTestId('status-badge-done')).toBeInTheDocument();
  });
});

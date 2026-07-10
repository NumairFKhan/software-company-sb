'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
} from 'react';
import type { ProjectSummary } from '@/types';
import { getProjects } from '@/lib/api';

// ── State & Actions ────────────────────────────────────────────────────────────

export interface ProjectsState {
  projects: ProjectSummary[];
  loading: boolean;
  error: string | null;
}

export type ProjectsAction =
  | { type: 'SET_PROJECTS'; payload: ProjectSummary[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

export function projectsReducer(
  state: ProjectsState,
  action: ProjectsAction,
): ProjectsState {
  switch (action.type) {
    case 'SET_PROJECTS':
      return { ...state, projects: action.payload, loading: false, error: null };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

// ── Context ────────────────────────────────────────────────────────────────────

export interface ProjectsContextValue {
  state: ProjectsState;
  dispatch: React.Dispatch<ProjectsAction>;
  refreshProjects: () => Promise<void>;
}

export const ProjectsContext = createContext<ProjectsContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

const initialState: ProjectsState = {
  projects: [],
  loading: false,
  error: null,
};

export function ProjectsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(projectsReducer, initialState);

  const refreshProjects = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const response = await getProjects();
      dispatch({ type: 'SET_PROJECTS', payload: response });
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        payload:
          err instanceof Error ? err.message : 'Failed to load projects',
      });
    }
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  return (
    <ProjectsContext.Provider value={{ state, dispatch, refreshProjects }}>
      {children}
    </ProjectsContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useProjects(): ProjectsContextValue {
  const context = useContext(ProjectsContext);
  if (!context) {
    throw new Error('useProjects must be used within a ProjectsProvider');
  }
  return context;
}

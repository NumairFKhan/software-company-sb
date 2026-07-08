/**
 * Unit tests for the ProjectsContext reducer.
 * The reducer is a pure function so it can be tested without rendering.
 */

import {
  projectsReducer,
  type ProjectsState,
} from '@/contexts/ProjectsContext';
import type { ProjectSummary } from '@/types';

const makeProject = (id: string, name = 'Test'): ProjectSummary => ({
  id,
  name,
  slug: name.toLowerCase(),
  status: 'planning',
  pr_url: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
});

const initialState: ProjectsState = {
  projects: [],
  loading: false,
  error: null,
};

describe('projectsReducer', () => {
  it('SET_LOADING → true sets loading flag', () => {
    const next = projectsReducer(initialState, {
      type: 'SET_LOADING',
      payload: true,
    });
    expect(next.loading).toBe(true);
    expect(next.projects).toEqual([]);
    expect(next.error).toBeNull();
  });

  it('SET_LOADING → false clears loading flag', () => {
    const state: ProjectsState = { ...initialState, loading: true };
    const next = projectsReducer(state, { type: 'SET_LOADING', payload: false });
    expect(next.loading).toBe(false);
  });

  it('SET_PROJECTS stores projects and clears loading & error', () => {
    const state: ProjectsState = {
      projects: [],
      loading: true,
      error: 'previous error',
    };
    const projects = [makeProject('p1'), makeProject('p2')];
    const next = projectsReducer(state, { type: 'SET_PROJECTS', payload: projects });
    expect(next.projects).toEqual(projects);
    expect(next.loading).toBe(false);
    expect(next.error).toBeNull();
  });

  it('SET_ERROR stores the error message and clears loading', () => {
    const state: ProjectsState = { ...initialState, loading: true };
    const next = projectsReducer(state, {
      type: 'SET_ERROR',
      payload: 'Network error',
    });
    expect(next.error).toBe('Network error');
    expect(next.loading).toBe(false);
    expect(next.projects).toEqual([]);
  });

  it('SET_ERROR with null clears the error', () => {
    const state: ProjectsState = { ...initialState, error: 'oops' };
    const next = projectsReducer(state, { type: 'SET_ERROR', payload: null });
    expect(next.error).toBeNull();
  });

  it('unknown action returns state unchanged', () => {
    // @ts-expect-error — testing the default branch
    const next = projectsReducer(initialState, { type: 'UNKNOWN' });
    expect(next).toBe(initialState);
  });
});

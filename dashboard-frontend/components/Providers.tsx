'use client';

import { ProjectsProvider } from '@/contexts/ProjectsContext';
import { ActiveProjectProvider } from '@/contexts/ActiveProjectContext';

/**
 * Thin client boundary that wraps the app-wide context providers.
 * Imported by the root layout (a Server Component) so that only
 * the subtree under <Providers> is marked as a client bundle.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ProjectsProvider>
      <ActiveProjectProvider>{children}</ActiveProjectProvider>
    </ProjectsProvider>
  );
}

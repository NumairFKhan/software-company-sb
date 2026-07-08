import { Sidebar } from "@/components/Sidebar";
import { ProjectDetail } from "@/components/ProjectDetail";

/**
 * Main dashboard page.
 * Renders a two-column layout: the Sidebar (project list) on the left and the
 * ProjectDetail shell on the right.  Both are 'use client' components that
 * consume ProjectsContext and ActiveProjectContext.
 */
export default function DashboardPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <ProjectDetail />
      </main>
    </div>
  );
}

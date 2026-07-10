import { Sidebar } from "@/components/Sidebar";
import { ProjectDetail } from "@/components/ProjectDetail";
import { ChatPanel } from "@/components/ChatPanel";

/**
 * Main dashboard page.
 * Renders a two-column layout: the Sidebar (project list) on the left and the
 * ProjectDetail shell + ChatPanel on the right. Both are 'use client'
 * components that consume ProjectsContext and ActiveProjectContext.
 *
 * ChatPanel lives here (not inside ProjectDetail) deliberately: it talks to
 * the single global /ws/communicator session, not a per-project one, and is
 * the primary way to start a brand-new project — it must stay mounted even
 * when no project is selected yet, and must not reconnect every time the
 * selected project changes.
 */
export default function DashboardPage() {
  return (
    <div className="relative flex h-screen overflow-hidden bg-surface-950">
      {/* Subtle brand-colored glow anchored top-left, purely atmospheric. */}
      <div className="pointer-events-none absolute inset-0 bg-radial-glow" />
      <Sidebar />
      <main className="relative flex-1 overflow-hidden flex flex-col">
        <ProjectDetail />
        <ChatPanel />
      </main>
    </div>
  );
}

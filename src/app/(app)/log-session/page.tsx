import LogSessionForm from "./LogSessionForm";

export const metadata = {
  title: "Log Session – CourtCoach AI",
};

export default function LogSessionPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Log a session</h1>
        <p className="text-slate-400 text-sm mt-1">
          Record your training in under 90 seconds — only date, type, and
          duration are required.
        </p>
      </div>

      {/* Form (client component) */}
      <LogSessionForm />
    </div>
  );
}

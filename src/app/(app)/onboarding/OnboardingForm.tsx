"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PlayerProfile } from "@/types/database";

// ── Constants ───────────────────────────────────────────────────────────────

const LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "competitive", label: "Competitive (club / tournament)" },
  { value: "professional", label: "Professional" },
] as const;

const HANDEDNESS = [
  { value: "right", label: "Right-handed" },
  { value: "left", label: "Left-handed" },
] as const;

const BACKHAND_TYPES = [
  { value: "one_handed", label: "One-handed" },
  { value: "two_handed", label: "Two-handed" },
] as const;

const GOALS_OPTIONS = [
  "Improve consistency",
  "Develop net game",
  "Increase first-serve %",
  "Build physical fitness",
  "Win local tournaments",
  "Improve return of serve",
  "Master topspin forehand",
  "Better footwork & movement",
];

const FOCUS_OPTIONS = [
  "Forehand",
  "Backhand",
  "Serve",
  "Return",
  "Volley",
  "Slice",
  "Overhead",
  "Footwork",
  "Mental game",
  "Tactics",
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const SESSION_LENGTHS = [
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function Toggle({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
        selected
          ? "bg-green-600 border-green-500 text-white"
          : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500"
      }`}
    >
      {label}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-semibold text-white border-b border-slate-800 pb-2 mb-4">
      {children}
    </h2>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-400">{message}</p>;
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  existingProfile: PlayerProfile | null;
}

export default function OnboardingForm({ existingProfile }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(existingProfile?.known_injuries)
  );

  // Form state
  const [displayName, setDisplayName] = useState(
    existingProfile?.display_name ?? ""
  );
  const [level, setLevel] = useState(existingProfile?.level ?? "");
  const [handedness, setHandedness] = useState(
    existingProfile?.handedness ?? ""
  );
  const [backhandType, setBackhandType] = useState(
    existingProfile?.backhand_type ?? ""
  );
  const [goals, setGoals] = useState<string[]>(existingProfile?.goals ?? []);
  const [technicalFocus, setTechnicalFocus] = useState<string[]>(
    existingProfile?.technical_focus ?? []
  );
  const [availableDays, setAvailableDays] = useState<string[]>(
    existingProfile?.available_days ?? []
  );
  const [sessionLength, setSessionLength] = useState(
    existingProfile?.session_length_minutes ?? 60
  );
  const [knownInjuries, setKnownInjuries] = useState(
    existingProfile?.known_injuries ?? ""
  );

  function toggleItem(
    list: string[],
    item: string,
    setter: (v: string[]) => void
  ) {
    setter(
      list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
    );
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!displayName.trim()) errors.displayName = "Name is required.";
    if (!level) errors.level = "Please select your level.";
    if (!handedness) errors.handedness = "Please select your handedness.";
    if (!backhandType) errors.backhandType = "Please select backhand type.";
    if (availableDays.length === 0)
      errors.availableDays = "Select at least one available day.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;

    startTransition(async () => {
      try {
        const res = await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            display_name: displayName.trim(),
            level,
            handedness,
            backhand_type: backhandType,
            goals,
            technical_focus: technicalFocus,
            available_days: availableDays,
            session_length_minutes: sessionLength,
            known_injuries: knownInjuries.trim() || null,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setServerError(body.error ?? "Something went wrong. Please try again.");
          return;
        }

        router.push("/dashboard");
        router.refresh();
      } catch {
        setServerError("Network error. Please check your connection and try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-10">
      {/* ── Section 1: Basics ── */}
      <section>
        <SectionTitle>About you</SectionTitle>
        <div className="space-y-5">
          {/* Display name */}
          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Your name <span className="text-red-400">*</span>
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alex"
              className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
            />
            <FieldError message={fieldErrors.displayName} />
          </div>

          {/* Level */}
          <div>
            <p className="text-sm font-medium text-slate-300 mb-2">
              Playing level <span className="text-red-400">*</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {LEVELS.map(({ value, label }) => (
                <Toggle
                  key={value}
                  label={label}
                  selected={level === value}
                  onClick={() => setLevel(value)}
                />
              ))}
            </div>
            <FieldError message={fieldErrors.level} />
          </div>

          {/* Handedness */}
          <div>
            <p className="text-sm font-medium text-slate-300 mb-2">
              Handedness <span className="text-red-400">*</span>
            </p>
            <div className="flex gap-2">
              {HANDEDNESS.map(({ value, label }) => (
                <Toggle
                  key={value}
                  label={label}
                  selected={handedness === value}
                  onClick={() => setHandedness(value)}
                />
              ))}
            </div>
            <FieldError message={fieldErrors.handedness} />
          </div>

          {/* Backhand type */}
          <div>
            <p className="text-sm font-medium text-slate-300 mb-2">
              Backhand type <span className="text-red-400">*</span>
            </p>
            <div className="flex gap-2">
              {BACKHAND_TYPES.map(({ value, label }) => (
                <Toggle
                  key={value}
                  label={label}
                  selected={backhandType === value}
                  onClick={() => setBackhandType(value)}
                />
              ))}
            </div>
            <FieldError message={fieldErrors.backhandType} />
          </div>
        </div>
      </section>

      {/* ── Section 2: Goals & focus ── */}
      <section>
        <SectionTitle>Goals &amp; technical focus</SectionTitle>
        <div className="space-y-5">
          {/* Goals */}
          <div>
            <p className="text-sm font-medium text-slate-300 mb-1">
              What are you working towards?{" "}
              <span className="text-slate-500 font-normal">(optional)</span>
            </p>
            <p className="text-xs text-slate-500 mb-2">
              Select all that apply.
            </p>
            <div className="flex flex-wrap gap-2">
              {GOALS_OPTIONS.map((goal) => (
                <Toggle
                  key={goal}
                  label={goal}
                  selected={goals.includes(goal)}
                  onClick={() => toggleItem(goals, goal, setGoals)}
                />
              ))}
            </div>
          </div>

          {/* Technical focus */}
          <div>
            <p className="text-sm font-medium text-slate-300 mb-1">
              Technical focus areas{" "}
              <span className="text-slate-500 font-normal">(optional)</span>
            </p>
            <p className="text-xs text-slate-500 mb-2">
              What parts of your game do you most want to improve?
            </p>
            <div className="flex flex-wrap gap-2">
              {FOCUS_OPTIONS.map((focus) => (
                <Toggle
                  key={focus}
                  label={focus}
                  selected={technicalFocus.includes(focus)}
                  onClick={() =>
                    toggleItem(technicalFocus, focus, setTechnicalFocus)
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 3: Schedule ── */}
      <section>
        <SectionTitle>Schedule</SectionTitle>
        <div className="space-y-5">
          {/* Available days */}
          <div>
            <p className="text-sm font-medium text-slate-300 mb-2">
              Available days <span className="text-red-400">*</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => (
                <Toggle
                  key={day}
                  label={day}
                  selected={availableDays.includes(day)}
                  onClick={() =>
                    toggleItem(availableDays, day, setAvailableDays)
                  }
                />
              ))}
            </div>
            <FieldError message={fieldErrors.availableDays} />
          </div>

          {/* Session length */}
          <div>
            <label
              htmlFor="sessionLength"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Typical session length{" "}
              <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <select
              id="sessionLength"
              value={sessionLength}
              onChange={(e) => setSessionLength(Number(e.target.value))}
              className="rounded-lg bg-slate-800 border border-slate-700 text-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
            >
              {SESSION_LENGTHS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ── Section 4: Advanced (collapsible) ── */}
      <section>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-90" : ""}`}
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
          Advanced (optional)
        </button>

        {showAdvanced && (
          <div className="mt-4">
            <label
              htmlFor="knownInjuries"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Known injuries or physical limitations
            </label>
            <p className="text-xs text-slate-500 mb-2">
              CourtCoach will avoid recommending exercises that could aggravate
              these.
            </p>
            <textarea
              id="knownInjuries"
              value={knownInjuries}
              onChange={(e) => setKnownInjuries(e.target.value)}
              rows={3}
              placeholder="e.g. Tennis elbow (right), recovering from left knee surgery"
              className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition resize-none"
            />
          </div>
        )}
      </section>

      {/* ── Server error ── */}
      {serverError && (
        <div
          role="alert"
          className="rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm px-4 py-3"
        >
          {serverError}
        </div>
      )}

      {/* ── Submit ── */}
      <div className="pb-8">
        <button
          type="submit"
          disabled={isPending}
          className="w-full sm:w-auto bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-8 py-3 text-sm transition-colors"
        >
          {isPending
            ? "Saving…"
            : existingProfile
              ? "Save changes"
              : "Complete setup →"}
        </button>
      </div>
    </form>
  );
}

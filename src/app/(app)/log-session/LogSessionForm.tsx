"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { LogType } from "@/types/database";

// ── helpers ───────────────────────────────────────────────────────────────────

function todayLocal(): string {
  // Returns "YYYY-MM-DD" in the user's local time zone
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function yesterdayLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── types ─────────────────────────────────────────────────────────────────────

interface FormState {
  log_type: LogType;
  log_date: string;
  duration_mins: string;
  intensity: number | null;
  fatigue: number | null;
  pain_notes: string;
  free_notes: string;
  // Practice details
  focus_area: string;
  drill_notes: string;
  // Match details
  opponent_level: string;
  sets_score: string;
  surface: string;
  // Fitness details
  activity_type: string;
  gym_notes: string;
  // Recovery details
  sleep_quality: number | null;
  soreness_areas: string;
}

type ConfirmationState = {
  id: string;
  log_type: LogType;
  log_date: string;
  duration_mins: number;
};

// ── sub-components ────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<LogType, string> = {
  practice: "🎾 Practice",
  match: "🏆 Match",
  fitness: "💪 Fitness",
  recovery: "😴 Recovery",
};

function TypeSelector({
  value,
  onChange,
}: {
  value: LogType;
  onChange: (t: LogType) => void;
}) {
  const types: LogType[] = ["practice", "match", "fitness", "recovery"];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {types.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`py-2.5 px-3 rounded-lg text-sm font-medium transition-colors border ${
            value === t
              ? "bg-green-600 border-green-500 text-white"
              : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500"
          }`}
        >
          {TYPE_LABELS[t]}
        </button>
      ))}
    </div>
  );
}

function ScaleButtons({
  label,
  value,
  onChange,
  low,
  high,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  low: string;
  high: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-2">
        {label}{" "}
        <span className="text-slate-500 font-normal">(optional)</span>
      </label>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 w-12">{low}</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors border ${
              value === n
                ? "bg-green-600 border-green-500 text-white"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500"
            }`}
            aria-pressed={value === n}
            aria-label={`${label} ${n}`}
          >
            {n}
          </button>
        ))}
        <span className="text-xs text-slate-500 w-12 text-right">{high}</span>
      </div>
    </div>
  );
}

// ── Practice optional fields ───────────────────────────────────────────────────

function PracticeFields({
  state,
  onChange,
}: {
  state: FormState;
  onChange: (k: keyof FormState, v: string) => void;
}) {
  return (
    <>
      <div>
        <label
          htmlFor="focus_area"
          className="block text-sm font-medium text-slate-300 mb-1"
        >
          Focus area{" "}
          <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <input
          id="focus_area"
          type="text"
          value={state.focus_area}
          onChange={(e) => onChange("focus_area", e.target.value)}
          placeholder="e.g. Backhand cross-court"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
        />
      </div>
      <div>
        <label
          htmlFor="drill_notes"
          className="block text-sm font-medium text-slate-300 mb-1"
        >
          Drill notes{" "}
          <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <textarea
          id="drill_notes"
          rows={2}
          value={state.drill_notes}
          onChange={(e) => onChange("drill_notes", e.target.value)}
          placeholder="Describe drills or key exercises..."
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent resize-none"
        />
      </div>
    </>
  );
}

// ── Match optional fields ─────────────────────────────────────────────────────

const SURFACE_OPTIONS = ["Hard", "Clay", "Grass", "Carpet", "Indoor hard"];

function MatchFields({
  state,
  onChange,
}: {
  state: FormState;
  onChange: (k: keyof FormState, v: string) => void;
}) {
  return (
    <>
      <div>
        <label
          htmlFor="sets_score"
          className="block text-sm font-medium text-slate-300 mb-1"
        >
          Score{" "}
          <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <input
          id="sets_score"
          type="text"
          value={state.sets_score}
          onChange={(e) => onChange("sets_score", e.target.value)}
          placeholder="e.g. 6-4, 3-6, 7-5"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
        />
      </div>
      <div>
        <label
          htmlFor="surface"
          className="block text-sm font-medium text-slate-300 mb-1"
        >
          Surface{" "}
          <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <select
          id="surface"
          value={state.surface}
          onChange={(e) => onChange("surface", e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
        >
          <option value="">Select surface…</option>
          {SURFACE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label
          htmlFor="opponent_level"
          className="block text-sm font-medium text-slate-300 mb-1"
        >
          Opponent level{" "}
          <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <input
          id="opponent_level"
          type="text"
          value={state.opponent_level}
          onChange={(e) => onChange("opponent_level", e.target.value)}
          placeholder="e.g. Club player, 4.5 NTRP"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
        />
      </div>
    </>
  );
}

// ── Fitness optional fields ───────────────────────────────────────────────────

function FitnessFields({
  state,
  onChange,
}: {
  state: FormState;
  onChange: (k: keyof FormState, v: string) => void;
}) {
  return (
    <>
      <div>
        <label
          htmlFor="activity_type"
          className="block text-sm font-medium text-slate-300 mb-1"
        >
          Activity type{" "}
          <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <input
          id="activity_type"
          type="text"
          value={state.activity_type}
          onChange={(e) => onChange("activity_type", e.target.value)}
          placeholder="e.g. Strength training, Cardio"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
        />
      </div>
      <div>
        <label
          htmlFor="gym_notes"
          className="block text-sm font-medium text-slate-300 mb-1"
        >
          Notes{" "}
          <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <textarea
          id="gym_notes"
          rows={2}
          value={state.gym_notes}
          onChange={(e) => onChange("gym_notes", e.target.value)}
          placeholder="What did you work on?"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent resize-none"
        />
      </div>
    </>
  );
}

// ── Recovery optional fields ──────────────────────────────────────────────────

function RecoveryFields({
  state,
  onChange,
  onScaleChange,
}: {
  state: FormState;
  onChange: (k: keyof FormState, v: string) => void;
  onScaleChange: (k: "sleep_quality", v: number | null) => void;
}) {
  return (
    <>
      <ScaleButtons
        label="Sleep quality"
        value={state.sleep_quality}
        onChange={(v) => onScaleChange("sleep_quality", v)}
        low="Poor"
        high="Great"
      />
      <div>
        <label
          htmlFor="soreness_areas"
          className="block text-sm font-medium text-slate-300 mb-1"
        >
          Soreness areas{" "}
          <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <input
          id="soreness_areas"
          type="text"
          value={state.soreness_areas}
          onChange={(e) => onChange("soreness_areas", e.target.value)}
          placeholder="e.g. Right shoulder, hamstrings"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
        />
      </div>
    </>
  );
}

// ── Confirmation screen ───────────────────────────────────────────────────────

const TYPE_EMOJI: Record<LogType, string> = {
  practice: "🎾",
  match: "🏆",
  fitness: "💪",
  recovery: "😴",
};

function ConfirmationScreen({
  session,
  onLogAnother,
}: {
  session: ConfirmationState;
  onLogAnother: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center py-8 gap-6">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 text-4xl">
        {TYPE_EMOJI[session.log_type]}
      </div>
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Session logged!</h2>
        <p className="text-slate-400 text-sm">
          {session.duration_mins} min{" "}
          <span className="capitalize">{session.log_type}</span> on{" "}
          {session.log_date}
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        <Link
          href="/dashboard"
          className="flex-1 py-2.5 rounded-lg border border-slate-700 text-sm text-slate-300 hover:border-slate-500 hover:text-white transition-colors text-center"
        >
          ← Dashboard
        </Link>
        <button
          type="button"
          onClick={onLogAnother}
          className="flex-1 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors"
        >
          Log another
        </button>
      </div>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

const INITIAL_STATE: FormState = {
  log_type: "practice",
  log_date: todayLocal(),
  duration_mins: "",
  intensity: null,
  fatigue: null,
  pain_notes: "",
  free_notes: "",
  focus_area: "",
  drill_notes: "",
  opponent_level: "",
  sets_score: "",
  surface: "",
  activity_type: "",
  gym_notes: "",
  sleep_quality: null,
  soreness_areas: "",
};

export default function LogSessionForm() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(
    null
  );

  const setField = useCallback(
    (k: keyof FormState, v: string | number | null) => {
      setForm((prev) => ({ ...prev, [k]: v }));
    },
    []
  );

  const setStringField = useCallback(
    (k: keyof FormState, v: string) => setField(k, v),
    [setField]
  );

  const handleTypeChange = useCallback((t: LogType) => {
    setForm((prev) => ({ ...prev, log_type: t }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const durationNum = parseInt(form.duration_mins, 10);
    if (!form.duration_mins || isNaN(durationNum) || durationNum < 1) {
      setError("Please enter a valid duration (at least 1 minute).");
      return;
    }

    // Build type-specific details
    const details: Record<string, unknown> = {};
    if (form.log_type === "practice") {
      if (form.focus_area) details.focus_area = form.focus_area;
      if (form.drill_notes) details.drill_notes = form.drill_notes;
    } else if (form.log_type === "match") {
      if (form.opponent_level) details.opponent_level = form.opponent_level;
      if (form.sets_score) details.sets_score = form.sets_score;
      if (form.surface) details.surface = form.surface;
    } else if (form.log_type === "fitness") {
      if (form.activity_type) details.activity_type = form.activity_type;
      if (form.gym_notes) details.gym_notes = form.gym_notes;
    } else if (form.log_type === "recovery") {
      if (form.sleep_quality !== null)
        details.sleep_quality = form.sleep_quality;
      if (form.soreness_areas) details.soreness_areas = form.soreness_areas;
    }

    const body: Record<string, unknown> = {
      log_date: form.log_date,
      log_type: form.log_type,
      duration_mins: durationNum,
      details,
    };
    if (form.intensity !== null) body.intensity = form.intensity;
    if (form.fatigue !== null) body.fatigue = form.fatigue;
    if (form.pain_notes.trim()) body.pain_notes = form.pain_notes.trim();
    if (form.free_notes.trim()) body.free_notes = form.free_notes.trim();

    setSubmitting(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(
          (json as { error?: string }).error ?? "Failed to save session."
        );
        return;
      }

      const json = (await res.json()) as { session: { id: string } };
      setConfirmation({
        id: json.session.id,
        log_type: form.log_type,
        log_date: form.log_date,
        duration_mins: durationNum,
      });
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogAnother = useCallback(() => {
    setForm({ ...INITIAL_STATE, log_date: todayLocal() });
    setConfirmation(null);
    setError(null);
  }, []);

  // ── Confirmation screen ──────────────────────────────────────────────────
  if (confirmation) {
    return (
      <ConfirmationScreen
        session={confirmation}
        onLogAnother={handleLogAnother}
      />
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  const today = todayLocal();
  const yesterday = yesterdayLocal();
  const showIntensity =
    form.log_type === "practice" || form.log_type === "match" || form.log_type === "fitness";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
      {/* ── Type selector ── */}
      <section>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Session type
        </h2>
        <TypeSelector value={form.log_type} onChange={handleTypeChange} />
      </section>

      {/* ── Date & Duration ── */}
      <section className="grid sm:grid-cols-2 gap-4">
        {/* Date */}
        <div>
          <label
            htmlFor="log_date"
            className="block text-sm font-medium text-slate-300 mb-1"
          >
            Date
          </label>
          <div className="flex gap-2 items-center">
            <input
              id="log_date"
              type="date"
              required
              value={form.log_date}
              max={today}
              onChange={(e) => setField("log_date", e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
            />
          </div>
          {/* Quick: yesterday */}
          {form.log_date !== yesterday && (
            <button
              type="button"
              onClick={() => setField("log_date", yesterday)}
              className="mt-1.5 text-xs text-green-400 hover:text-green-300 transition-colors"
            >
              ← Yesterday
            </button>
          )}
          {form.log_date === yesterday && (
            <button
              type="button"
              onClick={() => setField("log_date", today)}
              className="mt-1.5 text-xs text-green-400 hover:text-green-300 transition-colors"
            >
              ← Today
            </button>
          )}
        </div>

        {/* Duration */}
        <div>
          <label
            htmlFor="duration_mins"
            className="block text-sm font-medium text-slate-300 mb-1"
          >
            Duration (minutes)
          </label>
          <input
            id="duration_mins"
            type="number"
            required
            min={1}
            max={480}
            inputMode="numeric"
            placeholder="e.g. 60"
            value={form.duration_mins}
            onChange={(e) => setField("duration_mins", e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
          />
        </div>
      </section>

      {/* ── Intensity (for practice, match, fitness) ── */}
      {showIntensity && (
        <section className="space-y-4">
          <ScaleButtons
            label="Intensity"
            value={form.intensity}
            onChange={(v) => setField("intensity", v)}
            low="Easy"
            high="Max"
          />
          <ScaleButtons
            label="Fatigue after"
            value={form.fatigue}
            onChange={(v) => setField("fatigue", v)}
            low="Fresh"
            high="Spent"
          />
        </section>
      )}

      {/* Fatigue only (recovery, when intensity hidden) */}
      {!showIntensity && (
        <section>
          <ScaleButtons
            label="Fatigue / tiredness"
            value={form.fatigue}
            onChange={(v) => setField("fatigue", v)}
            low="Fresh"
            high="Spent"
          />
        </section>
      )}

      {/* ── Type-specific optional fields ── */}
      {(form.log_type === "practice" ||
        form.log_type === "match" ||
        form.log_type === "fitness" ||
        form.log_type === "recovery") && (
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {form.log_type === "practice" && "Practice details"}
            {form.log_type === "match" && "Match details"}
            {form.log_type === "fitness" && "Fitness details"}
            {form.log_type === "recovery" && "Recovery details"}
          </h2>

          {form.log_type === "practice" && (
            <PracticeFields state={form} onChange={setStringField} />
          )}
          {form.log_type === "match" && (
            <MatchFields state={form} onChange={setStringField} />
          )}
          {form.log_type === "fitness" && (
            <FitnessFields state={form} onChange={setStringField} />
          )}
          {form.log_type === "recovery" && (
            <RecoveryFields
              state={form}
              onChange={setStringField}
              onScaleChange={(k, v) => setField(k, v)}
            />
          )}
        </section>
      )}

      {/* ── Notes ── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Notes
        </h2>
        <div>
          <label
            htmlFor="pain_notes"
            className="block text-sm font-medium text-slate-300 mb-1"
          >
            Pain / injury notes{" "}
            <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          <input
            id="pain_notes"
            type="text"
            value={form.pain_notes}
            onChange={(e) => setField("pain_notes", e.target.value)}
            placeholder="Any discomfort or niggles?"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
          />
        </div>
        <div>
          <label
            htmlFor="free_notes"
            className="block text-sm font-medium text-slate-300 mb-1"
          >
            General notes{" "}
            <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          <textarea
            id="free_notes"
            rows={3}
            value={form.free_notes}
            onChange={(e) => setField("free_notes", e.target.value)}
            placeholder="Anything else about this session…"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent resize-none"
          />
        </div>
      </section>

      {/* ── Error ── */}
      {error && (
        <p className="text-red-400 text-sm rounded-lg bg-red-900/20 border border-red-800/50 px-4 py-2">
          {error}
        </p>
      )}

      {/* ── Submit ── */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
      >
        {submitting ? "Saving…" : "Save session"}
      </button>
    </form>
  );
}

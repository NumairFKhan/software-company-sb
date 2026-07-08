"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { VALID_RADII } from "@/lib/searchCoaches";

interface CoachesFiltersProps {
  zip: string;
  radius: string;
  minRate: string;
  maxRate: string;
}

export default function CoachesFilters({
  zip: initialZip,
  radius: initialRadius,
  minRate: initialMinRate,
  maxRate: initialMaxRate,
}: CoachesFiltersProps) {
  const router = useRouter();
  const [zip, setZip] = useState(initialZip);
  const [radius, setRadius] = useState(initialRadius || "10");
  const [minRate, setMinRate] = useState(initialMinRate);
  const [maxRate, setMaxRate] = useState(initialMaxRate);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!zip.trim()) return;

    const params = new URLSearchParams({ zip: zip.trim(), radius, page: "1" });
    if (minRate) params.set("minRate", minRate);
    if (maxRate) params.set("maxRate", maxRate);

    router.push(`/coaches?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl bg-white p-4 shadow-md"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Zip code */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="zip"
            className="text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            Zip Code <span className="text-red-500">*</span>
          </label>
          <input
            id="zip"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 10001"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            maxLength={10}
            required
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Radius */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="radius"
            className="text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            Distance
          </label>
          <select
            id="radius"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {VALID_RADII.map((r) => (
              <option key={r} value={r}>
                {r} miles
              </option>
            ))}
          </select>
        </div>

        {/* Min rate */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="minRate"
            className="text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            Min Rate ($/hr)
          </label>
          <input
            id="minRate"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Any"
            value={minRate}
            onChange={(e) => setMinRate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Max rate */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="maxRate"
            className="text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            Max Rate ($/hr)
          </label>
          <input
            id="maxRate"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Any"
            value={maxRate}
            onChange={(e) => setMaxRate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="mt-4">
        <button
          type="submit"
          className="w-full rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors sm:w-auto"
        >
          Search coaches
        </button>
      </div>
    </form>
  );
}

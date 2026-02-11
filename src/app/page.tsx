"use client";

import { useState } from "react";

type EntityType = "client" | "appointment" | "sessionNote";

interface SyncResult {
  status: string;
  summary?: {
    runId: string;
    startedAt: string;
    completedAt: string;
    counts: {
      created: number;
      updated: number;
      skipped: number;
      failed: number;
    };
  };
  data?: {
    clients: number;
    appointments: number;
    sessionNotes: number;
  };
  error?: string;
  message?: string;
}

type SyncPreset = {
  label: string;
  description: string;
  entities: EntityType[];
  color: string;
  hoverColor: string;
  icon: string;
};

const PRESETS: SyncPreset[] = [
  {
    label: "Sync Everything",
    description: "Clients, appointments & session notes",
    entities: ["client", "appointment", "sessionNote"],
    color: "bg-teal-600",
    hoverColor: "hover:bg-teal-700",
    icon: "\u21BB",
  },
  {
    label: "Sync Notes Only",
    description: "Session notes for all clients",
    entities: ["sessionNote"],
    color: "bg-blue-600",
    hoverColor: "hover:bg-blue-700",
    icon: "\uD83D\uDCDD",
  },
  {
    label: "Sync Clients & Appointments",
    description: "Client records and calendar events",
    entities: ["client", "appointment"],
    color: "bg-indigo-600",
    hoverColor: "hover:bg-indigo-700",
    icon: "\uD83D\uDCC5",
  },
];

function Spinner() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-white inline-block"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced options
  const [selectedEntities, setSelectedEntities] = useState<EntityType[]>([
    "client",
    "appointment",
    "sessionNote",
  ]);
  const [dryRun, setDryRun] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const runSync = async (entities: EntityType[], presetLabel?: string) => {
    setLoading(true);
    setActivePreset(presetLabel ?? "custom");
    setResult(null);

    try {
      const response = await fetch("/api/sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entities,
          dryRun,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
      });
      const data = await response.json();

      // Handle 409 Conflict — sync already in progress
      if (response.status === 409) {
        setResult({
          status: "error",
          error: "Sync already in progress",
          message: data.message || "Please wait for the current sync to finish.",
        });
        return;
      }

      setResult(data);
    } catch (error) {
      setResult({
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setLoading(false);
      setActivePreset(null);
    }
  };

  const toggleEntity = (entity: EntityType) => {
    setSelectedEntities((prev) =>
      prev.includes(entity)
        ? prev.filter((e) => e !== entity)
        : [...prev, entity]
    );
  };

  const statusDot = result
    ? result.error || result.status === "completed_with_errors"
      ? "bg-red-400"
      : "bg-green-400"
    : "bg-gray-300";

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-16 px-4 font-[family-name:var(--font-geist-sans)]">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">Inti</h1>
            <span className={`w-2.5 h-2.5 rounded-full ${statusDot}`} />
          </div>
          <p className="text-sm text-gray-500">
            PlaySpace &rarr; Owl Practice sync
          </p>
        </div>

        {/* Quick Actions */}
        <div className="space-y-3 mb-6">
          {PRESETS.map((preset) => {
            const isActive = loading && activePreset === preset.label;
            return (
              <button
                key={preset.label}
                onClick={() => runSync(preset.entities, preset.label)}
                disabled={loading}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl text-white font-medium transition-all ${
                  loading
                    ? "opacity-50 cursor-not-allowed bg-gray-400"
                    : `${preset.color} ${preset.hoverColor} shadow-sm hover:shadow-md active:scale-[0.99]`
                }`}
              >
                <span className="text-xl w-7 text-center">
                  {isActive ? <Spinner /> : preset.icon}
                </span>
                <div className="text-left">
                  <div className="text-sm font-semibold">{preset.label}</div>
                  <div className="text-xs opacity-80">{preset.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Advanced Options Toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors mb-4 flex items-center gap-1"
        >
          <span
            className={`transition-transform inline-block ${
              showAdvanced ? "rotate-90" : ""
            }`}
          >
            &#9656;
          </span>
          Advanced options
        </button>

        {/* Advanced Options Panel */}
        {showAdvanced && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6 space-y-5">
            {/* Entity Checkboxes */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Entities
              </h3>
              <div className="flex gap-2">
                {(
                  [
                    ["client", "Clients"],
                    ["appointment", "Appointments"],
                    ["sessionNote", "Notes"],
                  ] as [EntityType, string][]
                ).map(([entity, label]) => (
                  <button
                    key={entity}
                    onClick={() => toggleEntity(entity)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      selectedEntities.includes(entity)
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dry Run */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 accent-gray-900"
              />
              <span className="text-xs text-gray-600">
                Dry run (preview only)
              </span>
            </label>

            {/* Date Range */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Date range
              </h3>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs flex-1 text-gray-700"
                />
                <span className="text-gray-300 self-center">&mdash;</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs flex-1 text-gray-700"
                />
              </div>
            </div>

            {/* Run Custom */}
            <button
              onClick={() => runSync(selectedEntities)}
              disabled={loading || selectedEntities.length === 0}
              className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                loading || selectedEntities.length === 0
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.99]"
              }`}
            >
              {loading && activePreset === "custom" ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner /> Running...
                </span>
              ) : dryRun ? (
                "Preview Custom Sync"
              ) : (
                "Run Custom Sync"
              )}
            </button>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">
                {result.error ? "Sync Failed" : "Sync Complete"}
              </h2>
              <button
                onClick={() => setResult(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            </div>

            {result.error ? (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-700">
                <p className="font-medium">{result.error}</p>
                {result.message && (
                  <p className="mt-1 text-red-600">{result.message}</p>
                )}
              </div>
            ) : (
              <>
                {/* Status Badge */}
                <div
                  className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium mb-4 ${
                    result.status === "completed"
                      ? "bg-green-50 text-green-700"
                      : "bg-yellow-50 text-yellow-700"
                  }`}
                >
                  {result.status === "completed"
                    ? "Success"
                    : result.status === "completed_with_errors"
                    ? "Completed with errors"
                    : result.status}
                </div>

                {/* Counts Grid */}
                {result.summary?.counts && (
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {[
                      {
                        label: "Created",
                        value: result.summary.counts.created,
                        color: "text-green-600",
                        bg: "bg-green-50",
                      },
                      {
                        label: "Updated",
                        value: result.summary.counts.updated,
                        color: "text-blue-600",
                        bg: "bg-blue-50",
                      },
                      {
                        label: "Skipped",
                        value: result.summary.counts.skipped,
                        color: "text-gray-500",
                        bg: "bg-gray-50",
                      },
                      {
                        label: "Failed",
                        value: result.summary.counts.failed,
                        color: "text-red-600",
                        bg: "bg-red-50",
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className={`${item.bg} rounded-lg p-2.5 text-center`}
                      >
                        <div className={`text-lg font-bold ${item.color}`}>
                          {item.value}
                        </div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wide">
                          {item.label}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Data Fetched */}
                {result.data && (
                  <div className="text-xs text-gray-500 mb-3">
                    Fetched: {result.data.clients} clients,{" "}
                    {result.data.appointments} appointments,{" "}
                    {result.data.sessionNotes} notes
                  </div>
                )}

                {/* Duration + Run ID */}
                {result.summary && (
                  <div className="text-[10px] text-gray-400 space-y-0.5">
                    {result.summary.startedAt && result.summary.completedAt && (
                      <div>
                        Duration:{" "}
                        {formatDuration(
                          result.summary.startedAt,
                          result.summary.completedAt
                        )}
                      </div>
                    )}
                    <div>Run: {result.summary.runId}</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

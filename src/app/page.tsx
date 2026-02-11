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

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [selectedEntities, setSelectedEntities] = useState<EntityType[]>([
    "client",
    "appointment",
    "sessionNote",
  ]);
  const [dryRun, setDryRun] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const toggleEntity = (entity: EntityType) => {
    setSelectedEntities((prev) =>
      prev.includes(entity)
        ? prev.filter((e) => e !== entity)
        : [...prev, entity]
    );
  };

  const runSync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entities: selectedEntities,
          dryRun,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
      });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  const entityLabels: Record<EntityType, string> = {
    client: "Clients",
    appointment: "Appointments",
    sessionNote: "Session Notes",
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-[family-name:var(--font-geist-sans)]">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Inti Sync</h1>
        <p className="text-gray-500 mb-8">
          PlaySpace → Owl Practice data sync
        </p>

        {/* Entity Selection */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Entities to sync</h2>
          <div className="flex flex-wrap gap-3">
            {(Object.keys(entityLabels) as EntityType[]).map((entity) => (
              <button
                key={entity}
                onClick={() => toggleEntity(entity)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedEntities.includes(entity)
                    ? "bg-teal-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {entityLabels[entity]}
              </button>
            ))}
          </div>
        </div>

        {/* Options */}
        <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <span className="text-sm font-medium text-gray-700">
              Dry run (preview only — no changes to Owl Practice)
            </span>
          </label>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Appointment date range (optional)
            </h3>
            <div className="flex gap-3">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                placeholder="From"
                className="border border-gray-300 rounded px-3 py-2 text-sm flex-1"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                placeholder="To"
                className="border border-gray-300 rounded px-3 py-2 text-sm flex-1"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Leave empty to sync all appointments, or set a range to limit.
            </p>
          </div>
        </div>

        {/* Run Button */}
        <button
          onClick={runSync}
          disabled={loading || selectedEntities.length === 0}
          className={`w-full py-3 rounded-lg text-white font-semibold text-base transition-colors ${
            loading || selectedEntities.length === 0
              ? "bg-gray-300 cursor-not-allowed"
              : "bg-teal-500 hover:bg-teal-600"
          }`}
        >
          {loading ? "Syncing..." : dryRun ? "Preview Sync" : "Run Sync"}
        </button>

        {/* Results */}
        {result && (
          <div className="mt-6 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">
              {result.error ? "Error" : "Sync Results"}
            </h2>

            {result.error ? (
              <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700 text-sm">
                <p className="font-medium">{result.error}</p>
                {result.message && <p className="mt-1">{result.message}</p>}
              </div>
            ) : (
              <>
                {/* Status */}
                <div
                  className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-4 ${
                    result.status === "completed"
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {result.status}
                </div>

                {/* Data fetched */}
                {result.data && (
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-gray-500 mb-2">
                      Data fetched from PlaySpace
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Clients: {result.data.clients}</div>
                      <div>Appointments: {result.data.appointments}</div>
                      <div>Session Notes: {result.data.sessionNotes}</div>
                    </div>
                  </div>
                )}

                {/* Sync counts */}
                {result.summary?.counts && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">
                      Sync results
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-green-600">
                        Created: {result.summary.counts.created}
                      </div>
                      <div className="text-blue-600">
                        Updated: {result.summary.counts.updated}
                      </div>
                      <div className="text-gray-500">
                        Skipped: {result.summary.counts.skipped}
                      </div>
                      <div className="text-red-600">
                        Failed: {result.summary.counts.failed}
                      </div>
                    </div>
                  </div>
                )}

                {/* Run ID */}
                {result.summary?.runId && (
                  <p className="mt-4 text-xs text-gray-400">
                    Run ID: {result.summary.runId}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

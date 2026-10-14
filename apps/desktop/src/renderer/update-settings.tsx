"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { request, useSnapshot } from "./app.tsx";
export function UpdateSettings() {
  const snapshot = useSnapshot(),
    query = useQueryClient(),
    incoming = snapshot.data?.updatesEnabled ?? true;
  const [enabled, setEnabled] = useState(incoming),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!busy) setEnabled(incoming);
  }, [incoming, busy]);
  async function change(value: boolean) {
    const previous = enabled;
    setEnabled(value);
    setBusy(true);
    setError("");
    try {
      await request({ command: "set-updates", enabled: value });
      await query.invalidateQueries({ queryKey: ["snapshot"] });
    } catch (error) {
      setEnabled(previous);
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-6 border-t border-line pt-5 space-y-3">
      <label className="flex gap-3 items-center">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(event) => void change(event.target.checked)}
        />
        Check for app updates
      </label>
      <p className="text-sm text-muted">
        Checks public GitHub releases at startup and once a day. Downloads open
        in your browser.
      </p>
      <p className="text-sm text-muted">
        Voidra Project {snapshot.data?.appVersion}
      </p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

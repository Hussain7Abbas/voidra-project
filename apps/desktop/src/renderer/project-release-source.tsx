"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { WorkspaceSnapshot } from "../shared/bridge.ts";
import { request } from "./app.tsx";
import { DraftNavigation, useFormDraft } from "./form-drafts.tsx";
import { Button } from "./ui/button.tsx";
import { Field } from "./ui/field.tsx";
import { useToast } from "./ui/toast.tsx";

export function ProjectReleaseSource({ data }: { data: WorkspaceSnapshot }) {
  const draft = useFormDraft("release-source", "", () => ({
    path: data.projectRelease.path,
    revision: data.metadataRevision ?? "",
  }));
  const path = draft.values.path;
  const setPath = (path: string) =>
    draft.set((previous) => ({ ...previous, path }));
  const [busy, setBusy] = useState(false);
  const query = useQueryClient(),
    toast = useToast();
  const disabled =
    busy ||
    data.readOnly ||
    data.lock.state !== "none" ||
    data.recoveries.length > 0 ||
    data.planning.pending.length > 0 ||
    !data.metadataRevision;
  async function save() {
    if (disabled || !data.metadataRevision) return;
    setBusy(true);
    try {
      await draft.flush();
      const result = await request({
        command: "set-release-package",
        path,
        revision: draft.values.revision,
      });
      await draft.submitted();
      if (result.kind === "workspace")
        await draft.fresh({
          path: result.workspace.projectRelease.path,
          revision: result.workspace.metadataRevision ?? "",
        });
      await query.invalidateQueries({ queryKey: ["workspace"] });
      toast.success("Project release source saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not select the package",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="card action-detail mb-5"
      aria-label="Project release source"
    >
      <p role="status" className="mb-3">
        {data.projectRelease.version
          ? `Current release ${data.projectRelease.version}`
          : "Current release unavailable"}
      </p>
      {data.projectRelease.message && (
        <p className="text-sm text-muted mb-3">
          {data.projectRelease.message}. Backlog capture remains available;
          tasks need a release before leaving Backlog.
        </p>
      )}
      <DraftNavigation form={draft} disabled={busy} />
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field
          label="Release package"
          hint="Project-relative package.json path. Choose the app package in a monorepo; package contents stay local."
          className="grow"
        >
          <input
            className="input"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            disabled={busy}
            required
          />
        </Field>
        <Button type="submit" loading={busy} disabled={disabled}>
          Use package
        </Button>
      </form>
    </section>
  );
}

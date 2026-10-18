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
    path: data.releaseDirectory ?? data.projectRelease.path,
    directory: data.releaseDirectory !== null,
    revision: data.metadataRevision ?? "",
  }));
  const path = draft.values.path;
  const directory = draft.values.directory ?? false;
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
        directory,
        revision: draft.values.revision,
      });
      await draft.submitted();
      if (result.kind === "workspace")
        await draft.fresh({
          path:
            result.workspace.releaseDirectory ??
            result.workspace.projectRelease.path,
          directory: result.workspace.releaseDirectory !== null,
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
  async function chooseFolder() {
    setBusy(true);
    try {
      const result = await request({ command: "choose-release-folder" });
      if (result.kind === "release-folder" && result.path !== null)
        draft.set((previous) => ({
          ...previous,
          path: result.path ?? ".",
          directory: true,
        }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not choose a folder",
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
      <p className="text-sm text-muted mb-3">
        {data.releaseDirectory !== null
          ? `Search folder: ${data.releaseDirectory} · Highest package version`
          : "Selected package"}
        {" · "}
        {data.projectRelease.path}
      </p>
      <DraftNavigation form={draft} disabled={busy} />
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label="Version source">
          <select
            className="input"
            disabled={busy}
            value={directory ? "folder" : "package"}
            onChange={(event) =>
              draft.set((previous) => ({
                ...previous,
                directory: event.target.value === "folder",
                path:
                  event.target.value === "folder"
                    ? (data.releaseDirectory ?? ".")
                    : data.projectRelease.path,
              }))
            }
          >
            <option value="folder">Highest version in folder</option>
            <option value="package">One package</option>
          </select>
        </Field>
        <Field
          label={directory ? "Release folder" : "Release package"}
          hint={
            directory
              ? "Search this project-relative folder and its subfolders, including app, apps and packages. Use . for the whole project."
              : "Project-relative package.json path. Package contents stay local."
          }
          className="grow"
        >
          <input
            className="input"
            name="release-source"
            spellCheck={false}
            autoCapitalize="off"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            disabled={busy}
            required
          />
        </Field>
        <Button
          type="button"
          disabled={disabled}
          onClick={() => void chooseFolder()}
        >
          Choose folder…
        </Button>
        <Button type="submit" loading={busy} disabled={disabled}>
          {directory ? "Use folder" : "Use package"}
        </Button>
      </form>
    </section>
  );
}

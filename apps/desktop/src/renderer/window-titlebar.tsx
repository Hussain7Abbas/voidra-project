"use client";
import { Maximize2, Minimize2, Minus, Settings, X } from "lucide-react";
import type { ReactNode } from "react";
import type { BridgeRequest, Snapshot } from "../shared/bridge.ts";
import { Button } from "./ui/button.tsx";

export function WindowTitlebar({
  state,
  title,
  onSettings,
  onControl,
  accessories,
}: {
  state: NonNullable<Snapshot["window"]>;
  title: string;
  accessories?: ReactNode;
  onSettings: () => void;
  onControl: (
    action: Extract<BridgeRequest, { command: "window-control" }>["action"],
  ) => void;
}) {
  const settings = (
    <Button
      variant="ghost"
      iconOnly
      aria-label="Settings"
      title="Settings"
      onClick={onSettings}
      icon={<Settings size={18} aria-hidden />}
    />
  );
  const close = (
    <Button
      variant="ghost"
      iconOnly
      className="window-close"
      aria-label="Close window"
      title="Close window"
      onClick={() => onControl("close")}
      icon={<X size={16} aria-hidden />}
    />
  );
  const controls = (
    <fieldset className="window-controls">
      <legend className="sr-only">Window controls</legend>
      {state.platform === "darwin" && close}
      <Button
        variant="ghost"
        iconOnly
        aria-label="Minimize window"
        title="Minimize window"
        onClick={() => onControl("minimize")}
        icon={<Minus size={16} aria-hidden />}
      />
      <Button
        variant="ghost"
        iconOnly
        aria-label={state.maximized ? "Restore window" : "Maximize window"}
        title={state.maximized ? "Restore window" : "Maximize window"}
        onClick={() => onControl("toggle-maximize")}
        icon={
          state.maximized ? (
            <Minimize2 size={16} aria-hidden />
          ) : (
            <Maximize2 size={16} aria-hidden />
          )
        }
      />
      {state.platform !== "darwin" && close}
    </fieldset>
  );
  const tools = (
    <div className="window-tools">
      {state.platform !== "darwin" && settings}
      {accessories}
      {state.platform === "darwin" && settings}
    </div>
  );
  return (
    <section className="window-titlebar" aria-label="Window titlebar">
      {state.platform === "darwin" ? controls : tools}
      <span className="window-title">{title}</span>
      {state.platform === "darwin" ? tools : controls}
    </section>
  );
}

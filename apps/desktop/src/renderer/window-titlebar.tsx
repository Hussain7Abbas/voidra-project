"use client";
import { Maximize2, Minimize2, Minus, Settings, X } from "lucide-react";
import type { BridgeRequest, Snapshot } from "../shared/bridge.ts";
import { Button } from "./ui/button.tsx";

export function WindowTitlebar({
  state,
  title,
  onSettings,
  onControl,
}: {
  state: NonNullable<Snapshot["window"]>;
  title: string;
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
  return (
    <section className="window-titlebar" aria-label="Window titlebar">
      {state.platform === "darwin" ? controls : settings}
      <span className="window-title">{title}</span>
      {state.platform === "darwin" ? settings : controls}
    </section>
  );
}

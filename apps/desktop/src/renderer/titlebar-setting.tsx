"use client";
import { useEffect, useState } from "react";
import { Field } from "./ui/field.tsx";

export function TitlebarSetting({
  enabled,
  disabled,
  onChange,
}: {
  enabled: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => Promise<void>;
}) {
  const [value, setValue] = useState(enabled);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!saving) setValue(enabled);
  }, [enabled, saving]);
  async function change(next: boolean) {
    setValue(next);
    setSaving(true);
    try {
      await onChange(next);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Field
      label="Custom titlebar"
      hint="Use styled window controls and a Settings shortcut. Changes apply when you reopen the window."
    >
      <input
        className="switch-input"
        type="checkbox"
        role="switch"
        aria-checked={value}
        checked={value}
        disabled={disabled || saving}
        onChange={(event) => {
          void change(event.target.checked);
        }}
      />
    </Field>
  );
}

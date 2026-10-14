"use client";
import { request, useSnapshot } from "./app.tsx";
import { Button } from "./ui/button.tsx";
import { useToast } from "./ui/toast.tsx";
export function UpdateNotice() {
  const snapshot = useSnapshot(),
    notice = snapshot.data?.update,
    toast = useToast();
  if (!notice) return null;
  return (
    <section aria-label="Update available" className="service-notice mb-5">
      <p className="font-semibold">
        Voidra Project {notice.version} is available
      </p>
      <p className="whitespace-pre-wrap text-sm mt-2">
        {notice.notes || notice.title}
      </p>
      <Button
        className="mt-3"
        aria-label={`Download version ${notice.version}`}
        onClick={() =>
          void request({
            command: "open-update",
            version: notice.version,
          }).catch((error) =>
            toast.error(error instanceof Error ? error.message : String(error)),
          )
        }
      >
        Download
      </Button>
    </section>
  );
}

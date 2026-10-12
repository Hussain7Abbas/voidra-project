/* Adapted from storylens dashboard; copyright 2026 Hussain Abbas. AGPL-3.0-or-later. */
import { CircleAlert, CircleCheck, X } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type Tone = "success" | "error";
type Toast = { id: number; tone: Tone; text: string };

const ToastContext = createContext<((tone: Tone, text: string) => void) | null>(
  null,
);

/** Brief, dismissible confirmations announced to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (tone: Tone, text: string) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current.slice(-2), { id, tone, text }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className="card pointer-events-auto flex w-full max-w-sm items-start gap-3 px-4 py-3 text-sm"
          >
            {toast.tone === "success" ? (
              <CircleCheck
                size={18}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0 text-success"
                aria-hidden
              />
            ) : (
              <CircleAlert
                size={18}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0 text-danger"
                aria-hidden
              />
            )}
            <p className="flex-1">{toast.text}</p>
            <button
              type="button"
              className="-m-1 rounded-md p-1 text-muted hover:text-ink"
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
            >
              <X size={16} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside ToastProvider");
  return {
    success: (text: string) => show("success", text),
    error: (text: string) => show("error", text),
  };
}

import { contextBridge, ipcRenderer } from "electron";
import {
  type DesktopBridge,
  eventSchema,
  requestSchema,
  responseSchema,
} from "../shared/bridge.ts";

const bridge: DesktopBridge = {
  sandboxed: process.sandboxed,
  async invoke(request) {
    const parsed = requestSchema.safeParse(request);
    if (!parsed.success)
      return {
        ok: false,
        error: { code: "invalid-request", message: "Invalid request" },
      };
    const response = responseSchema.safeParse(
      await ipcRenderer.invoke("voidra:request", parsed.data),
    );
    return response.success
      ? response.data
      : {
          ok: false,
          error: {
            code: "invalid-response",
            message: "Invalid response from the app",
          },
        };
  },
  subscribe(callback) {
    const listener = (
      _event: Electron.IpcRendererEvent,
      input: unknown,
    ): void => {
      const event = eventSchema.safeParse(input);
      if (event.success) callback(event.data);
    };
    ipcRenderer.on("voidra:event", listener);
    return () => ipcRenderer.removeListener("voidra:event", listener);
  },
};
contextBridge.exposeInMainWorld("voidra", bridge);

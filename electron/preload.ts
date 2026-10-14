import { contextBridge, clipboard, ipcRenderer } from "electron";

const apiToken = ipcRenderer.sendSync("netly-get-api-token");

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  apiToken: typeof apiToken === "string" ? apiToken : "",
  openBankConnect: (url: string) => ipcRenderer.invoke("netly-open-bank-connect", url),
  onBankAuthResult: (callback: (result: {
    code?: string;
    error?: string;
    errorDescription?: string;
    state?: string;
    publicToken?: string;
    exited?: boolean;
    plaidError?: string;
    plaidErrorMessage?: string;
  }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, result: {
      code?: string;
      error?: string;
      errorDescription?: string;
      state?: string;
      publicToken?: string;
      exited?: boolean;
      plaidError?: string;
      plaidErrorMessage?: string;
    }) => {
      callback(result);
    };
    ipcRenderer.on("netly-bank-auth-result", listener);
    return () => {
      ipcRenderer.removeListener("netly-bank-auth-result", listener);
    };
  },
  clipboard: {
    readText: () => clipboard.readText(),
  },
});

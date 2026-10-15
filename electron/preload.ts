import { contextBridge, clipboard, ipcRenderer } from "electron";

const apiToken = ipcRenderer.sendSync("netly-get-api-token");

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  apiToken: typeof apiToken === "string" ? apiToken : "",
  clipboard: {
    readText: () => clipboard.readText(),
  },
  openExternal: (url: string) => ipcRenderer.invoke("netly-open-external", url),
  activateOwner: () => ipcRenderer.invoke("netly-owner-activate"),
  stopOwner: () => ipcRenderer.invoke("netly-owner-stop"),
  revokeOwner: () => ipcRenderer.invoke("netly-owner-revoke"),
  installCommand: () => ipcRenderer.invoke("netly-install-command"),
});

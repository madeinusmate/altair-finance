import { contextBridge, clipboard, ipcRenderer } from "electron";

const apiToken = ipcRenderer.sendSync("altair-get-api-token");

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  apiToken: typeof apiToken === "string" ? apiToken : "",
  clipboard: {
    readText: () => clipboard.readText(),
  },
  openExternal: (url: string) => ipcRenderer.invoke("altair-open-external", url),
  activateOwner: () => ipcRenderer.invoke("altair-owner-activate"),
  stopOwner: () => ipcRenderer.invoke("altair-owner-stop"),
  revokeOwner: () => ipcRenderer.invoke("altair-owner-revoke"),
  installCommand: () => ipcRenderer.invoke("altair-install-command"),
});

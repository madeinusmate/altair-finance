import { contextBridge, clipboard, ipcRenderer } from "electron";

const apiToken = ipcRenderer.sendSync("netly-get-api-token");

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  apiToken: typeof apiToken === "string" ? apiToken : "",
  clipboard: {
    readText: () => clipboard.readText(),
  },
  openExternal: (url: string) => ipcRenderer.invoke("netly-open-external", url),
});

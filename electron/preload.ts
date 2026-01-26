import { contextBridge, clipboard } from "electron";

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  clipboard: {
    readText: () => clipboard.readText(),
  },
});

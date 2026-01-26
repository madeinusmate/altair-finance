import { app, Menu } from "electron";

export const createMenu = (): void => {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.getName(),
      submenu: [
        {
          label: `About ${app.getName()}`,
          role: "about",
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "Command+Q",
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "Command+Z", role: "undo" },
        { label: "Redo", accelerator: "Shift+Command+Z", role: "redo" },
        { type: "separator" },
        { label: "Cut", accelerator: "Command+X", role: "cut" },
        { label: "Copy", accelerator: "Command+C", role: "copy" },
        { label: "Paste", accelerator: "Command+V", role: "paste" },
        { label: "Paste and Match Style", accelerator: "Shift+Command+V", role: "pasteAndMatchStyle" },
        { label: "Select All", accelerator: "Command+A", role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Reload", accelerator: "Command+R", role: "reload" },
        { label: "Force Reload", accelerator: "Shift+Command+R", role: "forceReload" },
        { label: "Toggle Developer Tools", accelerator: "Alt+Command+I", role: "toggleDevTools" },
        { type: "separator" },
        { label: "Actual Size", accelerator: "Command+0", role: "resetZoom" },
        { label: "Zoom In", accelerator: "Command+=", role: "zoomIn" },
        { label: "Zoom Out", accelerator: "Command+-", role: "zoomOut" },
        { type: "separator" },
        { label: "Toggle Fullscreen", accelerator: "Control+Command+F", role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { label: "Minimize", accelerator: "Command+M", role: "minimize" },
        { label: "Close", accelerator: "Command+W", role: "close" },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

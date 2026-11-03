// What the owner console page can ask of the desktop app (src/owner/native.ts).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("swingscoreDesktop", {
  signInWithGoogle: () => ipcRenderer.invoke("sign-in-with-google"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url)
});

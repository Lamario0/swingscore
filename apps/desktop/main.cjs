// SwingScore Owner for Windows: a window onto the owner console, plus the two
// things the page can't do inside it: Google sign-in, and opening links in
// your normal browser.
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const crypto = require("crypto");
const http = require("http");
const path = require("path");

const OWNER_URL = process.env.SWINGSCORE_OWNER_URL || "https://swingscore-ab034.web.app/owner/";
const SITE_ORIGIN = new URL(OWNER_URL).origin;
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

const DONE_PAGE = `<!doctype html><meta charset="utf-8"><title>SwingScore Owner</title>
<body style="font-family:system-ui,sans-serif;background:#020617;color:#e2e8f0;text-align:center;padding-top:4rem">
<h1 style="font-size:1.25rem">You're signed in</h1><p style="color:#94a3b8">Return to SwingScore Owner. You can close this tab.</p>
<script>setTimeout(() => window.close(), 1500)</script></body>`;

let mainWindow = null;
let pendingSignIn = null;

const isSafeExternal = (url) => typeof url === "string" && /^(https?:|mailto:)/i.test(url);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 900,
    minWidth: 380,
    title: "SwingScore Owner",
    backgroundColor: "#020617",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Anything outside SwingScore opens in your normal browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternal(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin === SITE_ORIGIN) return;
    event.preventDefault();
    if (isSafeExternal(url)) shell.openExternal(url);
  });

  mainWindow.loadURL(OWNER_URL);
}

ipcMain.handle("open-external", (_event, url) => {
  if (isSafeExternal(url)) return shell.openExternal(url);
});

// Google won't sign in inside an app's own window. The app opens the owner
// console's sign-in page in your normal browser, which hands Google's sign-in
// back to a listener that only this computer can reach.
ipcMain.handle("sign-in-with-google", () => {
  pendingSignIn?.cancel();
  return new Promise((resolve, reject) => {
    const state = crypto.randomBytes(24).toString("hex");
    const finish = (error, idToken) => {
      clearTimeout(timer);
      server.close();
      pendingSignIn = null;
      if (error) {
        reject(error);
        return;
      }
      resolve(idToken);
      mainWindow?.show();
      mainWindow?.focus();
    };

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      const idToken = url.searchParams.get("idToken");
      if (url.pathname !== "/done" || url.searchParams.get("state") !== state || !idToken) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(DONE_PAGE);
      finish(null, idToken);
    });
    const timer = setTimeout(() => finish(new Error("Sign-in timed out. Please try again.")), SIGN_IN_TIMEOUT_MS);
    pendingSignIn = { cancel: () => finish(new Error("Sign-in was restarted.")) };

    server.listen(0, "127.0.0.1", () => {
      shell.openExternal(`${OWNER_URL}#desktop-sign-in?port=${server.address().port}&state=${state}`);
    });
  });
});

// One window, even if the app is opened twice.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app.whenReady().then(createWindow);
  app.on("window-all-closed", () => app.quit());
}

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createApp } from "./server/app";

async function startServer() {
  const app = createApp();

  // Vite integration middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      // Import vite.config.ts directly (tsx can load it) rather than bundling
      // it to a temp file, whose deletion would restart `tsx watch` endlessly.
      configLoader: "native",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

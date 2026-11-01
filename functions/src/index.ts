// The live API: the same app `npm run dev` serves, behind Firebase Hosting.
// `npm run build:functions` bundles this with server/ and src/utils into lib/.
import { onRequest } from "firebase-functions/v2/https";
import { createApp } from "../../server/app";

// maxInstances caps what a traffic spike can cost.
export const api = onRequest(
  { region: "us-central1", invoker: "public", memory: "512MiB", maxInstances: 10 },
  createApp()
);

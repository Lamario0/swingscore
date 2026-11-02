// The live API: the same app `npm run dev` serves, behind Firebase Hosting.
// `npm run build:functions` bundles this with server/ and src/utils into lib/.
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { createApp } from "../../server/app";
import { processSheetJob } from "../../server/results/sheetJobs";

// maxInstances caps what a traffic spike can cost.
export const api = onRequest(
  { region: "us-central1", invoker: "public", memory: "512MiB", maxInstances: 10 },
  createApp()
);

// Saves a published contest to its community's spreadsheet, apart from the
// request that published it, so publishing never waits on Google.
export const saveContestToSheet = onDocumentWritten(
  { document: "communities/{communityId}/sheetJobs/{heatId}", region: "us-central1", maxInstances: 5 },
  async (event) => {
    if (event.data?.after.data()?.status === "queued") {
      await processSheetJob(event.params.communityId, event.params.heatId);
    }
  }
);

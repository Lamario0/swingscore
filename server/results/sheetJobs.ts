import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firebaseAdmin";
import { communityRef } from "../gateway";
import { readCommunityState } from "../state";
import { buildContestSheet } from "./buildContestSheet";
import { getSheetsClient, saveContestSheet, SHEETS_SERVICE_ACCOUNT, SheetsError } from "./googleSheets";

const MAX_ATTEMPTS = 3;

export const integrationsRef = (communityId: string) => communityRef(communityId).collection("private").doc("integrations");
const jobRef = (communityId: string, heatId: string) => communityRef(communityId).collection("sheetJobs").doc(heatId);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function describeSheetsError(error: unknown): string {
  if (error instanceof SheetsError) {
    // Google can hold on to a share made before it recognizes the address.
    if (error.status === 403) return `SwingScore can't edit that sheet. Share it with ${SHEETS_SERVICE_ACCOUNT} as an Editor. If it's already shared, remove that address and add it again.`;
    if (error.status === 404) return "That spreadsheet can't be found. Check the link.";
  }
  return "Google Sheets couldn't be reached. Try again in a moment.";
}

// A problem with the sheet itself won't fix itself by trying again.
const isPermanent = (error: unknown) =>
  error instanceof SheetsError && error.status >= 400 && error.status < 500 && error.status !== 429;

// Publishing only records that a save is wanted, so it never waits on Google.
// Live, that record starts a background function. Locally nothing is listening,
// so the save runs here instead.
export async function enqueueSheetJobs(communityId: string, heatIds: string[]) {
  const integration = (await integrationsRef(communityId).get()).data();
  if (!integration?.spreadsheetId || heatIds.length === 0) return 0;

  const batch = adminDb.batch();
  heatIds.forEach((heatId) => {
    batch.set(jobRef(communityId, heatId), { heatId, status: "queued", error: null, requestedAt: Date.now() }, { merge: true });
  });
  await batch.commit();

  if (!process.env.K_SERVICE) {
    heatIds.forEach((heatId) => processSheetJob(communityId, heatId).catch((error) => console.error("Sheet save failed", error)));
  }
  return heatIds.length;
}

async function saveContest(communityId: string, heatId: string) {
  const [state, integrationDoc, job] = await Promise.all([
    readCommunityState(communityId, [heatId]),
    integrationsRef(communityId).get(),
    jobRef(communityId, heatId).get()
  ]);
  const spreadsheetId = integrationDoc.data()?.spreadsheetId;
  const contest = (state.settings.completedResults || []).find((c) => c.heatId === heatId);
  const heat = state.heats.find((h) => h.id === heatId);
  if (!spreadsheetId) throw new SheetsError(400, "No spreadsheet connected");
  if (!contest || !heat) throw new SheetsError(400, "This contest no longer exists");

  // A tab only counts if it's in the sheet connected now.
  const previous = job.data();
  const previousTabId = previous?.spreadsheetId === spreadsheetId ? previous?.tabId : undefined;
  const tabId = await saveContestSheet(getSheetsClient(), spreadsheetId, buildContestSheet(contest, heat, state), previousTabId);
  return { spreadsheetId, tabId };
}

// Claims a queued job, so a function started twice can't save the contest twice.
export async function processSheetJob(communityId: string, heatId: string) {
  const ref = jobRef(communityId, heatId);
  const isClaimed = await adminDb.runTransaction(async (tx) => {
    if ((await tx.get(ref)).data()?.status !== "queued") return false;
    tx.update(ref, { status: "saving" });
    return true;
  });
  if (!isClaimed) return;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const saved = await saveContest(communityId, heatId);
      await ref.update({ ...saved, status: "saved", error: FieldValue.delete(), savedAt: Date.now() });
      return;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS || isPermanent(error)) {
        console.error("Sheet save failed", error);
        await ref.update({ status: "failed", error: describeSheetsError(error) });
        return;
      }
      await wait(attempt * 2000);
    }
  }
}

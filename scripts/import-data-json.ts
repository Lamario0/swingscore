// Copies data.json into an existing community. data.json itself isn't changed.
//   npm run gateway:import -- <gatewayCode> [path/to/data.json]
// Uses the local emulators unless --live is passed.
import fs from "fs";
import path from "path";
import type { AppState } from "../src/types";

const args = process.argv.slice(2);
if (!args.includes("--live")) {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
}

const { gatewayCodeRef, normalizeGatewayCode } = await import("../server/gateway");
const { saveCommunityState } = await import("../server/state");

const [code, dataPath = "data.json"] = args.filter((arg) => !arg.startsWith("--"));
if (!code) throw new Error("Usage: npm run gateway:import -- <gatewayCode> [path/to/data.json]");

const gateway = (await gatewayCodeRef(normalizeGatewayCode(code)).get()).data();
if (!gateway) throw new Error("No gateway has that code");

const state: AppState = JSON.parse(fs.readFileSync(path.resolve(dataPath), "utf-8"));

// Scores for a contest that was deleted have nowhere to live, and its recorded
// results are kept separately, so they're left behind.
const heatIds = new Set(state.heats.map((h) => h.id));
const scores = state.scores.filter((s) => heatIds.has(s.heatId));

await saveCommunityState(gateway.communityId, { ...state, scores });
console.log(
  `Imported ${state.competitors.length} dancers, ${state.heats.length} contests, ${scores.length} scores ` +
  `(${state.scores.length - scores.length} left behind from deleted contests) and ` +
  `${(state.settings.completedResults || []).length} recorded results.`
);

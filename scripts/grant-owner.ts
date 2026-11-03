// Marks a Google account as the SwingScore platform owner, who can manage every
// gateway from the owner app. Sign in to the owner app with the account once
// first, so it exists.
//   npm run owner:grant -- you@example.com [--live]
//   npm run owner:grant -- you@example.com --revoke [--live]
// Uses the local emulators unless --live is passed.
const args = process.argv.slice(2);
// Without an extra `--`, npm keeps --live for itself and only leaves this behind.
const isLive = args.includes("--live") || !!process.env.npm_config_live;
if (!isLive) {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
}

const { adminAuth } = await import("../server/firebaseAdmin");

const email = args.find((arg) => !arg.startsWith("--"));
if (!email) throw new Error("Usage: npm run owner:grant -- you@example.com [--revoke] [--live]");

const user = await adminAuth.getUserByEmail(email).catch(() => null);
if (!user) throw new Error(`No account for ${email} yet. Sign in to the owner app with it once, then run this again.`);

const isRevoking = args.includes("--revoke");
const { platformOwner, ...otherClaims } = user.customClaims || {};
await adminAuth.setCustomUserClaims(user.uid, isRevoking ? otherClaims : { ...otherClaims, platformOwner: true });
// A revoked owner is signed out everywhere, rather than when their token expires.
if (isRevoking) await adminAuth.revokeRefreshTokens(user.uid);

const where = isLive ? "the LIVE site" : "the local emulators";
console.log(isRevoking
  ? `${email} is no longer the SwingScore owner on ${where}, and is signed out everywhere.`
  : `${email} is now the SwingScore owner on ${where}. Reload the owner app to continue.`);
process.exit(0);

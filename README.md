# SwingScore

West Coast Swing competition scoring for small communities. Each community has its own private gateway. The Admin signs in with the gateway code and sees the Central Gateway, then shows staff a QR code that signs them in to their portal, or shares a link and passcode.

## Run locally

**Prerequisites:** Node.js and Java 21 (for the Firebase emulators).

1. Install dependencies: `npm install`
2. Start the app and local database: `npm run dev`, then open http://localhost:3000
3. In a second terminal, create a gateway: `npm run gateway:create -- "My Community"`. It prints the gateway code, portal links and passcodes.
4. Optionally copy an old `data.json` into it: `npm run gateway:import -- <gatewayCode>`

Local development never touches the live database. Press Ctrl+C once to stop `npm run dev`, so it can save the local data to `emulator-data/`. The emulator dashboard is at http://localhost:4000.

Forgotten passcode: `npm run gateway:create -- --reset-passcode <gatewayCode> <admin|judge|coordinator|scoring|competitor> <newPasscode>` (`competitor` is the Registration portal)

## Owner app

The platform owner manages every gateway from the owner console at `/owner/`: create gateways, send their codes, make new codes or passcodes, lock them, and open their own community as Admin. It signs in with Google, and only an account marked as the owner gets in:

`npm run owner:grant -- you@example.com --live` (sign in to the console once first; `--revoke` removes it)

Two apps show the same console:
- **Windows** (`apps/desktop`, Electron): `npm install`, then `npm run build` makes a portable `dist/SwingScore Owner.exe`. Google sign-in opens in your normal browser and hands back to the app.
- **Android** (`apps/android`, Capacitor): `npm install`, put the Firebase Android app's `google-services.json` in `android/app/`, then `npm run build` makes `android/app/build/outputs/apk/debug/app-debug.apk`. It needs Android Studio's SDK, and Java from Android Studio.

Both apps load the console from the live site, so they update with every deploy.

## Tests

`npm test` runs the scoring, Security Rules and API tests against the emulators. Stop `npm run dev` first, because they use the same ports.

## How it fits together

- `server/` is the Express API. All writes except judges' scores go through it, and each request's community comes from its Firebase token.
- `firestore.rules` is the second wall: browsers read only their own community, and can write nothing but a judge's own score.
- Passcodes are checked against hashes in `communities/{id}/private/auth`. That document also keeps a readable copy for the Admin's Central Gateway, so only the server can read it.
- `src/hooks/useCommunityState.ts` is the live data the portals receive.
- Data lives under `communities/{communityId}`, with a contest's scores under `heats/{heatId}/scores`.

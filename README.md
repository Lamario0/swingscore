# SwingScore

West Coast Swing competition scoring for small communities. Each community has its own private gateway: devices join with a gateway code, and staff portals also need a passcode.

## Run locally

**Prerequisites:** Node.js and Java 21 (for the Firebase emulators).

1. Install dependencies: `npm install`
2. Start the app and local database: `npm run dev`, then open http://localhost:3000
3. In a second terminal, create a gateway: `npm run gateway:create -- "My Community"`. It prints the gateway code and passcodes once.
4. Optionally copy an old `data.json` into it: `npm run gateway:import -- <gatewayCode>`

Local development never touches the live database. Press Ctrl+C once to stop `npm run dev`, so it can save the local data to `emulator-data/`. The emulator dashboard is at http://localhost:4000.

Forgotten passcode: `npm run gateway:create -- --reset-passcode <gatewayCode> <admin|judge|coordinator|scoring|competitor> <newPasscode>` (`competitor` is the Registration portal)

## Tests

`npm test` runs the scoring, Security Rules and API tests against the emulators. Stop `npm run dev` first, because they use the same ports.

## How it fits together

- `server/` is the Express API. All writes except judges' scores go through it, and each request's community comes from its Firebase token.
- `firestore.rules` is the second wall: browsers read only their own community, and can write nothing but a judge's own score.
- `src/hooks/useCommunityState.ts` is the live data the portals receive.
- Data lives under `communities/{communityId}`, with a contest's scores under `heats/{heatId}/scores`.

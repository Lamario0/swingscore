// Creates a community by hand, until subscriptions create them automatically.
//   npm run gateway:create -- "Community Name"
//   npm run gateway:create -- --reset-passcode <gatewayCode> <role> <newPasscode>
// Uses the local emulators unless --live is passed.
const args = process.argv.slice(2);
// Without an extra `--`, npm keeps --live for itself and only leaves this behind.
const isLive = args.includes("--live") || !!process.env.npm_config_live;
if (!isLive) {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
}

const { FieldValue } = await import("firebase-admin/firestore");
const { communityRef, createCommunity, gatewayCodeRef, hashPasscode, normalizeGatewayCode, privateAuthRef, STAFF_ROLES } = await import("../server/gateway");

const positional = args.filter((arg) => !arg.startsWith("--"));

if (args.includes("--reset-passcode")) {
  const [code, role, passcode] = positional;
  if (!code || !STAFF_ROLES.includes(role as any) || !passcode) {
    throw new Error("Usage: --reset-passcode <gatewayCode> <admin|judge|coordinator|scoring|competitor> <newPasscode>");
  }
  const gateway = (await gatewayCodeRef(normalizeGatewayCode(code)).get()).data();
  if (!gateway) throw new Error("No gateway has that code");
  await privateAuthRef(gateway.communityId).update({
    [`passcodes.${role}`]: await hashPasscode(passcode),
    [`readablePasscodes.${role}`]: passcode,
    [`portalPasses.${role}`]: FieldValue.delete()
  });
  const community = (await communityRef(gateway.communityId).get()).data()!;
  await communityRef(gateway.communityId).update({ sessionEpoch: community.sessionEpoch + 1 });
  console.log(`Reset the ${role} passcode for ${community.name}. Every device in that community must reconnect.`);
} else {
  const [name] = positional;
  if (!name) throw new Error('Usage: npm run gateway:create -- "Community Name"');
  const { communityId, gatewayCode, slug, passcodes } = await createCommunity(name);
  console.log(`Created ${name}${isLive ? " on the LIVE database" : " on the local emulators. This code only works at http://localhost:3000"}`);
  console.log(`Community id:  ${communityId}`);
  console.log(`Gateway code:  ${gatewayCode}`);
  console.log(`Portal links:  /g/${slug}/<judge|coordinator|registration|scoring|results>`);
  console.log("Passcodes (also on the Central Gateway):");
  Object.entries(passcodes).forEach(([role, passcode]) => {
    console.log(`  ${(role === "competitor" ? "registration" : role).padEnd(12)} ${passcode}`);
  });
}

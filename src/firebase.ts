import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

// These values identify the project and aren't secret. Access is controlled by
// firestore.rules and the API.
const firebaseConfig = {
  apiKey: "AIzaSyC0UJHfQ0LEITeVL21nhHQ2mCTGZB2TTng",
  authDomain: "swingscore-ab034.firebaseapp.com",
  projectId: "swingscore-ab034",
  storageBucket: "swingscore-ab034.firebasestorage.app",
  messagingSenderId: "183309968220",
  appId: "1:183309968220:web:15c84455007d3b59281799"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// The local cache keeps a judge's scores on the device through a Wi-Fi drop,
// and sends them when it reconnects.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// Local development runs against the emulators, never the live database.
if (import.meta.env.DEV) {
  const host = window.location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
}

import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const FIREBASE_PROJECT_ID = "swingscore-ab034";

if (getApps().length === 0) {
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || FIREBASE_PROJECT_ID });
}

export const adminDb = getFirestore();
adminDb.settings({ ignoreUndefinedProperties: true });

export const adminAuth = getAuth();

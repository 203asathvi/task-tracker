
// Firebase v10 Modular SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 🔥 YOUR FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyAf5HZ3nKxxooGllmVw7BinGOsN45lBIH0",
  authDomain: "task-tracker-1e44a.firebaseapp.com",
  projectId: "task-tracker-1e44a",
  storageBucket: "task-tracker-1e44a.firebasestorage.app",
  messagingSenderId: "43258116904",
  appId: "1:43258116904:web:6e37747abcfe5495bd6e1d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// 🔐 AUTH
const auth = getAuth(app);

// Set persistence safely (no top-level await)
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Persistence error:", error);
});

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

// 🔥 FIRESTORE
const db = getFirestore(app);

// ☁️ CLOUD SAVE
// Supports saving either legacy array OR new payload object { meta, data }
async function cloudSave(uid, payloadOrArray) {
  try {
    await setDoc(doc(db, "users", uid), { taskData: payloadOrArray }, { merge: true });
  } catch (error) {
    console.error("Cloud save failed:", error);
    throw error;
  }
}

// ☁️ CLOUD LOAD
// Returns either:
// - payload object { meta, data } (new format)
// - array (legacy format)
// - null if none
async function cloudLoad(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;

    const stored = snap.data()?.taskData;

    // New payload format
    if (stored && typeof stored === "object" && !Array.isArray(stored) && "data" in stored) {
      return stored;
    }

    // Legacy array format
    if (Array.isArray(stored)) {
      return stored;
    }

    // Unexpected format -> treat as no data
    return null;
  } catch (error) {
    console.error("Cloud load failed:", error);
    return null;
  }
}

export { auth, provider, cloudSave, cloudLoad };

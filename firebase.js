
// Firebase v10 Modular SDK
import { initializeApp } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

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
// Replace with your real config from Firebase Console
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


// 🔐 AUTH SETUP
const auth = getAuth(app);

// Force persistent login (IMPORTANT for mobile)
await setPersistence(auth, browserLocalPersistence);

// Google provider
const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: "select_account"
});


// 🔥 FIRESTORE SETUP
const db = getFirestore(app);


// ☁️ CLOUD SAVE
async function cloudSave(uid, data) {
  try {
    const ref = doc(db, "users", uid);
    await setDoc(ref, { taskData: data });
    console.log("Cloud save successful");
  } catch (error) {
    console.error("Cloud save failed:", error);
    alert("Cloud save failed. Check console.");
  }
}


// ☁️ CLOUD LOAD
async function cloudLoad(uid) {
  try {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      console.log("Cloud load successful");
      return snap.data().taskData || [];
    } else {
      console.log("No cloud data found");
      return null;
    }
  } catch (error) {
    console.error("Cloud load failed:", error);
    alert("Cloud load failed. Check console.");
    return null;
  }
}


// Export everything
export { auth, provider, cloudSave, cloudLoad };

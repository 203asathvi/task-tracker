



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

// Set persistence safely (no await at top level)
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("Auth persistence set to LOCAL");
  })
  .catch((error) => {
    console.error("Persistence error:", error);
  });

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

// 🔥 FIRESTORE
const db = getFirestore(app);


// ☁️ CLOUD SAVE
async function cloudSave(uid, data) {
  try {
    await setDoc(doc(db, "users", uid), { taskData: data });
    console.log("Cloud save successful");
  } catch (error) {
    console.error("Cloud save failed:", error);
  }
}


// ☁️ CLOUD LOAD
async function cloudLoad(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      return snap.data().taskData || [];
    }
    return null;
  } catch (error) {
    console.error("Cloud load failed:", error);
    return null;
  }
}

export { auth, provider, cloudSave, cloudLoad };


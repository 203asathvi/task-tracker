import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAf5HZ3nKxxooGllmVw7BinGOsN45lBIH0",
  authDomain: "task-tracker-1e44a.firebaseapp.com",
  projectId: "task-tracker-1e44a",
  storageBucket: "task-tracker-1e44a.firebasestorage.app",
  messagingSenderId: "43258116904",
  appId: "1:43258116904:web:6e37747abcfe5495bd6e1d"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);

export async function cloudSave(uid, data) {
  await setDoc(doc(db, "users", uid), { data });
}

export async function cloudLoad(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data().data : null;
}


import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_APIKEY,
  authDomain: "edutube-b95dc.firebaseapp.com",
  projectId: "edutube-b95dc",
  storageBucket: "edutube-b95dc.firebasestorage.app",
  messagingSenderId: "824841221962",
  appId: "1:824841221962:web:7d0375524fde5ea43c73b3",
  measurementId: "G-X4WD2B1SG9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { auth, provider };

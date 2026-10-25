
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseApiKey = import.meta.env.VITE_FIREBASE_APIKEY?.trim();

const firebaseConfig = {
  apiKey: firebaseApiKey,
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
provider.setCustomParameters({ prompt: "select_account" });

export const isFirebaseConfigured = Boolean(
  firebaseApiKey && !/replace_with|placeholder|example/i.test(firebaseApiKey)
);

export const getGoogleAuthErrorMessage = (error) => {
  if (error.response?.data?.message) {
    return error.response.data.message;
  }

  const messages = {
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "The Firebase API key is invalid. Check VITE_FIREBASE_APIKEY in frontend/.env and restart the frontend.",
    "auth/invalid-api-key": "The Firebase API key is invalid. Check VITE_FIREBASE_APIKEY in frontend/.env and restart the frontend.",
    "auth/operation-not-allowed": "Google sign-in is disabled. Enable the Google provider in Firebase Console → Authentication → Sign-in method.",
    "auth/unauthorized-domain": "This site is not authorized for Google sign-in. Add localhost (local) or your exact site domain in Firebase Console → Authentication → Settings → Authorized domains.",
    "auth/popup-blocked": "The Google sign-in popup was blocked. Allow popups for this site and try again.",
    "auth/popup-closed-by-user": "The Google sign-in window was closed before completing sign-in.",
    "auth/cancelled-popup-request": "Another Google sign-in window is already open. Finish or close it, then try again.",
    "auth/network-request-failed": "Could not reach Firebase. Check your internet connection and try again.",
    "auth/configuration-not-found": "Firebase Authentication is not configured for this project. Enable Authentication and Google sign-in in Firebase Console."
  };

  return messages[error.code] || error.message || "Google sign-in failed. Check the Firebase settings and try again.";
};

export { auth, provider };

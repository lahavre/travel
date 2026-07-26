// Firebase web config — SAFE to commit to the public repo.
//
// This is the *public* client config. Security comes from Firestore/Storage
// security rules (enforced on Google's servers), NOT from hiding these values —
// the same reason the plan always favoured Firebase over a keyed weather API.
//
// To wire it up: Firebase console -> Project settings (gear icon) -> General ->
// "Your apps" -> the web app -> "SDK setup and configuration" -> Config, then
// paste the object's fields below.
//
// Until the real apiKey is in place, the site stays fully public: the sign-in
// button is hidden and nothing calls Firebase.
export const firebaseConfig = {
  apiKey: "AIzaSyA7krlffa7yk9hR0HGZdSjGy0NeWdvCDik",
  authDomain: "travel-planner-40c11.firebaseapp.com",
  projectId: "travel-planner-40c11",
  storageBucket: "travel-planner-40c11.firebasestorage.app",
  messagingSenderId: "310717734987",
  appId: "1:310717734987:web:842fcb1012281f4a5a6dce",
};

// Whether the config above has been filled in. The app checks this before
// loading Firebase, so a placeholder config leaves the public site untouched.
export const firebaseReady = !firebaseConfig.apiKey.startsWith("PASTE");

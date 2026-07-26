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
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
};

// Whether the config above has been filled in. The app checks this before
// loading Firebase, so a placeholder config leaves the public site untouched.
export const firebaseReady = !firebaseConfig.apiKey.startsWith("PASTE");

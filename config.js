// ============================================================
// Friday Decider — Firebase config
// ------------------------------------------------------------
// 1. Create a Firebase project on the FREE Spark plan.
// 2. Add a Web App, copy its config object, and paste it below,
//    replacing the placeholder values.
// 3. The web API key is SAFE to commit — it only identifies the
//    project. Access is controlled by the Firestore security
//    rules (see firestore.rules) + your shared household slug.
//
// Until you paste a real config, the app runs in LOCAL-ONLY mode:
// everything works on this device, but nothing syncs between phones.
// ============================================================

export const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
};

// True when the config above is still the placeholder.
export function isConfigured() {
  return (
    !!firebaseConfig.projectId &&
    !firebaseConfig.projectId.startsWith("PASTE") &&
    !firebaseConfig.apiKey.startsWith("PASTE")
  );
}

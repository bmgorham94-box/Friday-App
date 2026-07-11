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
  apiKey: "AIzaSyAOnfceSpWymfNcIwvceR45Sq0R37uceOI",
  authDomain: "friday-18134.firebaseapp.com",
  projectId: "friday-18134",
  storageBucket: "friday-18134.firebasestorage.app",
  messagingSenderId: "333876918078",
  appId: "1:333876918078:web:5c382062005f8cfed05e6f",
  measurementId: "G-L5VZC3WT2M",
};

// True when the config above is still the placeholder.
export function isConfigured() {
  return (
    !!firebaseConfig.projectId &&
    !firebaseConfig.projectId.startsWith("PASTE") &&
    !firebaseConfig.apiKey.startsWith("PASTE")
  );
}

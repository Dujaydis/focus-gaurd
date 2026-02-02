// Firebase Configuration for Focus Guard
// Replace these values with your own Firebase project config

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB78MyaUxEVem-3UyF_92kQEpxKjOVZSTA",
  authDomain: "focus-gaurd.firebaseapp.com",
  databaseURL: "https://focus-gaurd-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "focus-gaurd",
  storageBucket: "focus-gaurd.firebasestorage.app",
  messagingSenderId: "210112963076",
  appId: "1:210112963076:web:5f08e3b2dff64930a54b51",
  measurementId: "G-BSPFP9T706"
};

// Simple passphrase for authentication (change this to your secret code)
const SYNC_PASSPHRASE = "your-secret-passphrase-here";

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FIREBASE_CONFIG, SYNC_PASSPHRASE };
}

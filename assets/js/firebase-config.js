import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const FALLBACK_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_AUTH_DOMAIN',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_STORAGE_BUCKET',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID'
};

const firebaseConfig = window.GT_FIREBASE_CONFIG || FALLBACK_CONFIG;

if (!firebaseConfig || firebaseConfig.apiKey?.includes('YOUR_API_KEY')) {
  console.warn(
    '%cGraceTrack:',
    'color:#f3c969;font-weight:bold;',
    'Firebase config is using placeholder values. Update assets/js/firebase-config.js or set window.GT_FIREBASE_CONFIG before loading scripts.'
  );
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

window.GraceTrackFirebase = { app, auth, db };

export { app, auth, db };

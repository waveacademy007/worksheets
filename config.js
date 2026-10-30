// "offline" = app works only on this phone, no login, data saved on the phone.
// "online"  = login + Firebase database (fill firebaseConfig below first).
export const MODE = "online";

// ============================================================
//  Firebase web app config (needed only for MODE = "online").
//  Firebase console > Project settings > General > Your apps > Web app > Config
//  Until you do, the app runs in DEMO mode (data saved only in this browser).
// ============================================================
export const firebaseConfig = {
  apiKey: "AIzaSyCFZzJX7klih1iORG-UayM7r1efyyPhYgw",
  authDomain: "create-worksheets.firebaseapp.com",
  projectId: "create-worksheets",
  storageBucket: "create-worksheets.firebasestorage.app",
  messagingSenderId: "797465088368",
  appId: "1:797465088368:web:7084caa7a630ebf117bfb5"
};

// Shown to teachers on the login and "waiting for activation" screens.
export const APP = {
  name: "The Wave Academy Worksheets",
  owner: "Parmod Kumar",
  contactPhone: "9999715042",        // used for the call / WhatsApp buttons
  plansText: "Monthly and yearly plans available. Call or WhatsApp to activate your account."
};

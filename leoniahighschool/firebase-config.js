window.firebaseConfig = {
  apiKey: "AIzaSyDDzglkGZKA0VLzZH91lTSFdnAvb1murMo",
  authDomain: "yacht-5dab4.firebaseapp.com",
  databaseURL: "https://yacht-5dab4-default-rtdb.firebaseio.com",
  projectId: "yacht-5dab4",
  storageBucket: "yacht-5dab4.firebasestorage.app",
  messagingSenderId: "856163508826",
  appId: "1:856163508826:web:ec26955e0ca926d4d46e63",
  measurementId: "G-DQYX27EQZJ"
};

window.isFirebaseConfigured = function () {
  const c = window.firebaseConfig || {};
  return Boolean(
    c.apiKey &&
    c.projectId &&
    c.databaseURL &&
    !String(c.apiKey).startsWith("PASTE_") &&
    !String(c.projectId).startsWith("PASTE_") &&
    !String(c.databaseURL).includes("PASTE_")
  );
};

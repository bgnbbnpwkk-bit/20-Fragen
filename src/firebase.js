import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Firebase-Projekt "unser-einkaufszettel"
// Hinweis: Der apiKey eines Web-Clients ist KEIN Geheimnis – er liegt
// bauartbedingt offen im Browser-Bundle. Schutz kommt über die Security Rules.
const firebaseConfig = {
  apiKey: "AIzaSyBZbh9UjXGbTTPIO_jewU41sTKYe4pHvNY",
  authDomain: "unser-einkaufszettel.firebaseapp.com",
  databaseURL: "https://unser-einkaufszettel-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "unser-einkaufszettel",
  storageBucket: "unser-einkaufszettel.firebasestorage.app",
  messagingSenderId: "1091522338551",
  appId: "1:1091522338551:web:20bbe0ed444691eebcbdf2",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

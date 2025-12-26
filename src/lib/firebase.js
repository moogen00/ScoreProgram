import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// TODO: Replace with your actual Firebase config
// const firebaseConfig = {
//     apiKey: "YOUR_API_KEY",
//     authDomain: "YOUR_AUTH_DOMAIN",
//     projectId: "YOUR_PROJECT_ID",
//     storageBucket: "YOUR_STORAGE_BUCKET",
//     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
//     appId: "YOUR_APP_ID"
// };

const firebaseConfig = {
    apiKey: "AIzaSyBraLKtvxiTNPa-Xsplg9JCLeBqULY83WY",
    authDomain: "scoreprogram-f8fbb.firebaseapp.com",
    projectId: "scoreprogram-f8fbb",
    storageBucket: "scoreprogram-f8fbb.firebasestorage.app",
    messagingSenderId: "1003732883334",
    appId: "1:1003732883334:web:68f154503b302d1ab8fe07",
    measurementId: "G-NXDCB2DCX7"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

import { db } from './src/lib/firebase.js';
import { collection, getDocs, query, where } from 'firebase/firestore';

async function checkJudge() {
    const q = query(collection(db, 'judges'), where('email', '==', 'judge@example.com'));
    const snapshot = await getDocs(q);
    console.log(`Found ${snapshot.size} judges with email judge@example.com`);
    snapshot.forEach(doc => {
        console.log(doc.id, doc.data());
    });
    process.exit(0);
}

checkJudge();

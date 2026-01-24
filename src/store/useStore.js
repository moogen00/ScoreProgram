import { create } from 'zustand';
import { db } from '../lib/firebase';
import {
    collection,
    doc,
    setDoc,
    getDoc,
    onSnapshot,
    updateDoc,
    deleteDoc,
    query,
    getDocs,
    writeBatch,
    where
} from 'firebase/firestore';

const ROOT_ADMIN_EMAILS = (import.meta.env.VITE_ROOT_ADMIN_EMAILS || '').split(',').map(e => e.trim());
const ADMIN_EMAILS = []; // Deprecated/Unused for hardcoding, using DB 'admins' collection now

const useStore = create((set, get) => ({
    // Auth state
    admins: [], // [ { email, name } ]
    isInitialSyncComplete: false,
    isSyncInitialized: false,
    isInitializingDefaults: false,
    isResetting: false,
    resetStatus: '',
    isExporting: false,

    // Hierarchy & Settings
    competitionName: '...', // Loaded from DB
    competitions: [], // [ { id, name, locked, createdAt, categories: [ { id, name, order } ] } ]
    selectedCategoryId: '',
    activeView: null, // 'admin', 'leaderboard', 'scorer', null
    scoringItems: [],
    judgesByComp: {}, // { [compId]: [ { email, name } ] }
    participants: {}, // { [categoryId]: [ { id, number, name } ] }
    scores: {}, // { [categoryId]: { [participantId]: { [judgeEmail]: { [scoringItemId]: score } } } }

    adminTab: 'scoring',

    // Auth Actions
    login: (userData) => {
        // If userData has a role (e.g. from Spectator login), use it. Default to USER.
        const role = userData.role || 'USER';
        // Normalize email to lowercase
        const normalizedData = {
            ...userData,
            email: userData.email.toLowerCase(),
            role
        };
        const userToStore = { ...normalizedData, lastLoginAt: Date.now() };
        set({ currentUser: normalizedData });
        localStorage.setItem('score_program_user', JSON.stringify(userToStore));
        get().syncUserRole();

        // Force refresh scores to ensure we get data if rules were restrictive before login
        get().refreshScores();
    },
    logout: () => {
        set({ currentUser: null });
        localStorage.removeItem('score_program_user');
        // Optional: clear scores or unsubscribe
        const { unsubScores } = get();
        if (unsubScores) unsubScores();
        set({ scores: {}, unsubScores: null });
    },

    syncUserRole: () => {
        const { currentUser, judgesByComp, admins } = get();
        if (!currentUser) return;

        // If explicitly Spectator
        if (currentUser.email === 'guest@score.com') {
            if (currentUser.role !== 'SPECTATOR') {
                set({ currentUser: { ...currentUser, role: 'SPECTATOR' } });
            }
            return;
        }

        let role = ''; // Default to empty to detect if found
        let registeredName = null; // To store name from DB if found

        // 1. Root Admin Check
        const rootAdmins = (import.meta.env.VITE_ROOT_ADMIN_EMAILS || '').split(',').map(e => e.trim());
        if (rootAdmins.includes(currentUser.email)) {
            role = 'ROOT_ADMIN';
        }

        // 2. Admin Check
        // admins is [ { email, name, lastLoginAt } ]
        const adminEntry = admins.find(a => a.email === currentUser.email);
        if (adminEntry) {
            if (!role) role = 'ADMIN';
            registeredName = adminEntry.name;

            // Track Admin Login (Throttle: only update if > 1 hour)
            const lastLogin = adminEntry.lastLoginAt ? new Date(adminEntry.lastLoginAt).getTime() : 0;
            if (Date.now() - lastLogin > 3600000) {
                setDoc(doc(db, 'admins', currentUser.email), {
                    lastLoginAt: new Date().toISOString()
                }, { merge: true });
            }
        }

        // 3. Judge Check & Assigned Competitions Calculation
        const assignedCompetitions = [];
        let judgeEntry = null;

        Object.entries(judgesByComp).forEach(([yId, list]) => {
            const found = list.find(j => j.email === currentUser.email);
            if (found) {
                if (!role) role = 'JUDGE';
                assignedCompetitions.push(yId);
                // We pick the name from the first matched year entry as the canonical name
                if (!registeredName && !judgeEntry) {
                    judgeEntry = found;
                }

                // Track Judge Login (Update for this year)
                // Note: We use the lastLoginAt from the found judge record to check if we need to update
                // This prevents infinite loops of sync -> update -> sync -> update
                const lastLogin = found.lastLoginAt ? new Date(found.lastLoginAt).getTime() : 0;
                if (Date.now() - lastLogin > 3600000) { // 3600000 ms = 1 hour
                    setDoc(doc(db, 'judges', `${yId}_${currentUser.email}`), {
                        lastLoginAt: new Date().toISOString()
                    }, { merge: true });
                }
            }
        });

        if (!registeredName && judgeEntry) {
            registeredName = judgeEntry.name;
        }

        // 4. Default to USER if nothing found
        if (!role) role = 'USER';

        // Update if changed (role, assignedCompetitions, or name)
        const currentAssigned = currentUser.assignedCompetitions ? currentUser.assignedCompetitions.join(',') : '';
        const newAssigned = assignedCompetitions.join(',');

        // Determine final name: Registered Name > Current Name > Email Prefix
        const finalName = registeredName || currentUser.name || currentUser.email.split('@')[0];

        if (currentUser.role !== role || currentAssigned !== newAssigned || currentUser.name !== finalName) {
            const updatedUser = { ...currentUser, role, assignedCompetitions: assignedCompetitions, name: finalName };
            set({ currentUser: updatedUser });
            // Also update localStorage so it persists on refresh
            localStorage.setItem('score_program_user', JSON.stringify({ ...updatedUser, lastLoginAt: Date.now() }));
            console.log(`[Auth] User Synced: ${currentUser.email} -> Role: ${role}, Name: ${finalName}`);
        }
    },

    // Settings Actions
    setCompetitionName: async (name) => {
        await setDoc(doc(db, 'settings', 'general'), { competitionName: name }, { merge: true });
    },
    setSelectedCategoryId: (id) => {
        set({ selectedCategoryId: id });
        window.history.pushState({
            activeView: get().activeView,
            selectedCategoryId: id,
            adminTab: get().adminTab
        }, '');
    },
    setActiveView: (view) => {
        set({ activeView: view });
        window.history.pushState({
            activeView: view,
            selectedCategoryId: get().selectedCategoryId,
            adminTab: get().adminTab
        }, '');
    },
    setAdminTab: (tab) => {
        set({ adminTab: tab });
        window.history.pushState({
            activeView: get().activeView,
            selectedCategoryId: get().selectedCategoryId,
            adminTab: tab
        }, '');
    },
    resetNavigation: () => {
        set({ activeView: null, selectedCategoryId: '', adminTab: 'scoring' });
        window.history.pushState({
            activeView: null,
            selectedCategoryId: '',
            adminTab: 'scoring'
        }, '');
    },

    // Scorer Actions
    updateScore: async (categoryId, participantId, itemId, score) => {
        // ... (kept for backward compatibility or single updates if needed)
        const { currentUser, competitions } = get();
        // Permission check: Only JUDGE or ADMIN/ROOT_ADMIN can edit
        const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'ROOT_ADMIN';
        const isJudge = currentUser?.role === 'JUDGE';
        if (!isAdmin && !isJudge) return;

        // Derive granular info from competitions state
        let compName = '?';
        let genre = 'General';
        let category = 'None';

        for (const y of competitions) {
            const cat = (y.categories || []).find(c => c.id === categoryId);
            if (cat) {
                compName = y.name;
                genre = cat.genre || 'General';
                category = cat.category || cat.name;
                break;
            }
        }

        const docId = `${categoryId}_${participantId}_${currentUser.email.toLowerCase()}`;
        const scoreRef = doc(db, 'scores', docId);
        const snap = await getDoc(scoreRef);

        const currentValues = snap.exists() ? snap.data().values : {};
        await setDoc(scoreRef, {
            competition: compName,
            genre: genre,
            category: category,
            categoryId,
            participantId,
            judgeEmail: currentUser.email.toLowerCase(),
            values: {
                ...currentValues,
                [itemId]: parseFloat(score)
            },
            updatedAt: new Date().toISOString()
        }, { merge: true });
    },

    submitCategoryScores: async (categoryId, scoresMap) => {
        const { currentUser, competitions } = get();
        const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'ROOT_ADMIN';
        const isJudge = currentUser?.role === 'JUDGE';
        if (!isAdmin && !isJudge) return;

        // Find context
        let compId = '';
        let compName = '?';
        let genre = 'General';
        let category = 'None';

        for (const y of competitions) {
            const cat = (y.categories || []).find(c => c.id === categoryId);
            if (cat) {
                compId = y.id;
                compName = y.name;
                genre = cat.genre || 'General';
                category = cat.category || cat.name;
                break;
            }
        }
        if (!compId) return;

        const batch = writeBatch(db);
        const email = currentUser.email.toLowerCase();

        // 1. Update Scores
        // scoresMap is { [participantId]: { [itemId]: value } }
        for (const [pId, values] of Object.entries(scoresMap)) {
            const docId = `${categoryId}_${pId}_${email}`;
            const scoreRef = doc(db, 'scores', docId);

            // Note: We use set with merge, but since we are submitting "final" state locally, 
            // ensure we aren't overwriting other fields accidentally. 
            // We construct the full object similar to updateScore
            batch.set(scoreRef, {
                competition: compName,
                genre: genre,
                category: category,
                categoryId,
                participantId: pId,
                judgeEmail: email,
                values: values, // This overwrites the values map for this judge-participant
                updatedAt: new Date().toISOString()
            }, { merge: true });
        }

        // 2. Mark as Submitted in Judge's record
        // ID: compId_email
        const judgeRef = doc(db, 'judges', `${compId}_${email}`);

        // Reverting to set with merge: true after verifying it merges nested maps correctly.
        // This is safer than update() because it creates the doc/field if it doesn't exist,
        // preventing "Processing..." stuck states on new judges.
        batch.set(judgeRef, {
            submittedCategories: {
                [categoryId]: true
            }
        }, { merge: true });

        await batch.commit();
    },

    toggleJudgeSubmission: async (categoryId, isSubmitted) => {
        const { currentUser, competitions } = get();
        // Find context for compId
        let compId = '';
        for (const y of competitions) {
            const cat = (y.categories || []).find(c => c.id === categoryId);
            if (cat) {
                compId = y.id;
                break;
            }
        }
        if (!compId) {
            console.error('[Store] toggleJudgeSubmission: compId not found for category', categoryId);
            return;
        }

        const email = currentUser.email.toLowerCase();
        const judgeRef = doc(db, 'judges', `${compId}_${email}`);

        // Use batch for consistency with submitCategoryScores
        const batch = writeBatch(db);
        batch.set(judgeRef, {
            submittedCategories: {
                [categoryId]: isSubmitted
            }
        }, { merge: true });

        await batch.commit();
        console.log(`[Store] Judge submission toggled: ${categoryId} -> ${isSubmitted}`);
    },

    // Management Actions
    addScoringItem: async (label) => {
        const item = {
            id: Math.random().toString(36).substr(2, 9),
            label,
            order: get().scoringItems.length
        };
        await setDoc(doc(db, 'settings', 'scoring'), { items: [...get().scoringItems, item] });
    },

    removeScoringItem: async (id) => {
        const items = get().scoringItems.filter(item => item.id !== id);
        await setDoc(doc(db, 'settings', 'scoring'), { items });
    },

    updateScoringItemOrder: async (newItems) => {
        await setDoc(doc(db, 'settings', 'scoring'), { items: newItems });
    },

    // Hierarchy Actions
    addCompetition: async (name) => {
        const id = Math.random().toString(36).substr(2, 9);
        const comp = {
            id,
            name,
            locked: false,
            createdAt: new Date().toISOString(),
            categories: []
        };
        await setDoc(doc(db, 'competitions', id), comp);
    },

    updateCompetition: async (compId, newName) => {
        const batch = writeBatch(db);
        const compRef = doc(db, 'competitions', compId);
        const compSnap = await getDoc(compRef);
        if (!compSnap.exists()) return;

        const oldName = compSnap.data().name;
        batch.update(compRef, { name: newName });

        // Cascading update for participants in all categories of this competition
        const categories = compSnap.data().categories || [];
        for (const cat of categories) {
            const pQuery = query(collection(db, 'participants'), where('categoryId', '==', cat.id));
            const pSnap = await getDocs(pQuery);
            pSnap.docs.forEach(d => {
                batch.update(d.ref, { competition: newName });
            });

            const sQuery = query(collection(db, 'scores'), where('categoryId', '==', cat.id));
            const sSnap = await getDocs(sQuery);
            sSnap.docs.forEach(d => {
                batch.update(d.ref, { competition: newName });
            });
        }

        await batch.commit();
    },

    deleteCompetition: async (compId) => {
        try {
            console.log(`[Store] Deleting competition: ${compId}`);
            const batch = writeBatch(db);
            const compRef = doc(db, 'competitions', compId);
            const compSnap = await getDoc(compRef);
            if (!compSnap.exists()) {
                console.warn(`[Store] Competition ${compId} not found in DB.`);
                return;
            }

            const categories = compSnap.data().categories || [];

            // 1. Delete Judges
            const jSnap = await getDocs(query(collection(db, 'judges'), where('compId', '==', compId)));
            jSnap.docs.forEach(d => batch.delete(d.ref));

            // 2. Delete Categories, Participants, Scores
            for (const cat of categories) {
                const pSnap = await getDocs(query(collection(db, 'participants'), where('categoryId', '==', cat.id)));
                pSnap.docs.forEach(d => batch.delete(d.ref));

                const sSnap = await getDocs(query(collection(db, 'scores'), where('categoryId', '==', cat.id)));
                sSnap.docs.forEach(d => batch.delete(d.ref));
            }

            // 3. Delete Competition itself
            batch.delete(compRef);

            await batch.commit();
            console.log(`[Store] Competition ${compId} and associated data deleted successfully.`);
        } catch (error) {
            console.error('[Store] deleteCompetition failed:', error);
            alert('대회 삭제 중 오류가 발생했습니다: ' + error.message);
        }
    },

    addCategory: async (compId, name) => {
        const catId = Math.random().toString(36).substr(2, 9);
        const compRef = doc(db, 'competitions', compId);
        const compSnap = await getDoc(compRef);

        if (compSnap.exists()) {
            const data = compSnap.data();
            // Removed: const yearVal = data.name || compId;

            const parts = name.split(' ');
            const genre = parts.length > 1 ? parts[0] : 'General';
            const category = parts.length > 1 ? parts.slice(1).join(' ') : name;

            const newCategoryObj = {
                id: catId,
                name,
                // Removed: year: yearVal,
                genre,
                category,
                order: (data.categories?.length || 0),
                locked: false
            };

            const categories = [...(data.categories || []), newCategoryObj];
            await updateDoc(compRef, { categories });
        }
    },

    moveCategory: async (compId, catId, direction) => {
        const compRef = doc(db, 'competitions', compId);
        const compSnap = await getDoc(compRef);
        if (compSnap.exists()) {
            const categories = [...compSnap.data().categories].sort((a, b) => (a.order || 0) - (b.order || 0));
            const index = categories.findIndex(c => c.id === catId);
            const targetIndex = index + direction;
            if (targetIndex >= 0 && targetIndex < categories.length) {
                [categories[index], categories[targetIndex]] = [categories[targetIndex], categories[index]];
                // Update orders
                const updated = categories.map((c, i) => ({ ...c, order: i }));
                await updateDoc(compRef, { categories: updated });
            }
        }
    },

    sortCategoriesByName: async (compId, direction = 'asc') => {
        const compRef = doc(db, 'competitions', compId);
        const compSnap = await getDoc(compRef);
        if (compSnap.exists()) {
            const categories = [...compSnap.data().categories]
                .sort((a, b) => {
                    const res = a.name.localeCompare(b.name, 'ko');
                    return direction === 'asc' ? res : -res;
                })
                .map((c, i) => ({ ...c, order: i }));
            await updateDoc(compRef, { categories: categories });
        }
    },

    toggleCompetitionLock: async (compId, isLocked) => {
        const compRef = doc(db, 'competitions', compId);
        const compSnap = await getDoc(compRef);

        if (compSnap.exists()) {
            const data = compSnap.data();
            // Cascade: Update all categories to match the competition's lock status
            const updatedCategories = (data.categories || []).map(cat => ({
                ...cat,
                locked: isLocked
            }));

            await updateDoc(compRef, {
                locked: isLocked,
                categories: updatedCategories
            });
        }
    },

    updateCategory: async (compId, categoryId, newName) => {
        const batch = writeBatch(db);
        const compRef = doc(db, 'competitions', compId);
        const compSnap = await getDoc(compRef);
        if (compSnap.exists()) {
            const parts = newName.split(' ');
            const newGenre = parts.length > 1 ? parts[0] : 'General';
            const newCategory = parts.length > 1 ? parts.slice(1).join(' ') : newName;

            const categories = (compSnap.data().categories || []).map(c =>
                c.id === categoryId ? { ...c, name: newName, genre: newGenre, category: newCategory } : c
            );
            batch.update(compRef, { categories });

            // Cascading update for participants and scores
            const pSnap = await getDocs(query(collection(db, 'participants'), where('categoryId', '==', categoryId)));
            pSnap.docs.forEach(d => batch.update(d.ref, { genre: newGenre, category: newCategory }));

            const sSnap = await getDocs(query(collection(db, 'scores'), where('categoryId', '==', categoryId)));
            sSnap.docs.forEach(d => batch.update(d.ref, { genre: newGenre, category: newCategory }));

            await batch.commit();
        }
    },

    deleteCategory: async (compId, categoryId) => {
        console.log(`[Store] deleteCategory START: comp=${compId}, cat=${categoryId}`);
        const { currentUser } = get();
        if (!currentUser) {
            console.error('[Store] deleteCategory: No currentUser found');
            return;
        }

        try {
            // 1. Delete all scores for this category
            console.log('[Store] deleteCategory: deleting scores');
            const scoresQuery = query(collection(db, 'scores'), where('categoryId', '==', categoryId));
            const scoresSnap = await getDocs(scoresQuery);
            const scoreDeletes = scoresSnap.docs.map(d => deleteDoc(d.ref));
            await Promise.all(scoreDeletes);

            // 2. Delete all participants for this category
            console.log('[Store] deleteCategory: deleting participants');
            const partsQuery = query(collection(db, 'participants'), where('categoryId', '==', categoryId));
            const partsSnap = await getDocs(partsQuery);
            const partDeletes = partsSnap.docs.map(d => deleteDoc(d.ref));
            await Promise.all(partDeletes);

            // 3. Remove from competition's categories array
            console.log('[Store] deleteCategory: removing from competitions array');
            const compRef = doc(db, 'competitions', compId);
            const compSnap = await getDoc(compRef);
            if (compSnap.exists()) {
                const compData = compSnap.data();
                const updatedCategories = (compData.categories || []).filter(c => c.id !== categoryId);
                await updateDoc(compRef, { categories: updatedCategories });
                console.log('[Store] deleteCategory: updated competitions array');
            }

            // 4. If this was the active category, reset navigation
            if (get().selectedCategoryId === categoryId) {
                console.log('[Store] deleteCategory: resetting navigation');
                get().resetNavigation();
            }
            console.log('[Store] deleteCategory: END');
        } catch (error) {
            console.error('[Store] deleteCategory ERROR:', error);
            throw error;
        }
    },

    updateCategoriesOrder: async (compId, newCategories) => {
        const compRef = doc(db, 'competitions', compId);
        // Ensure to save normalized categories with correct order indexes
        const normalized = newCategories.map((cat, index) => ({
            ...cat,
            order: index
        }));
        await updateDoc(compRef, { categories: normalized });
    },



    toggleCategoryLock: async (compId, categoryId, isLocked) => {
        const compRef = doc(db, 'competitions', compId);
        const compSnap = await getDoc(compRef);
        if (compSnap.exists()) {
            const categories = (compSnap.data().categories || []).map(c =>
                c.id === categoryId ? { ...c, locked: isLocked } : c
            );
            await updateDoc(compRef, { categories });
        }
    },

    // Judge Actions
    addJudge: async (compId, email, name) => {
        const lowerEmail = email.toLowerCase();
        await setDoc(doc(db, 'judges', `${compId}_${lowerEmail}`), { compId, email: lowerEmail, name });
    },

    removeJudge: async (compId, email) => {
        await deleteDoc(doc(db, 'judges', `${compId}_${email.toLowerCase()}`));
    },

    updateJudgeName: async (compId, email, newName) => {
        const lowerEmail = email.toLowerCase();
        await updateDoc(doc(db, 'judges', `${compId}_${lowerEmail}`), { name: newName });
    },

    anonymizeJudge: async (compId, email) => {
        const lowerEmail = email.toLowerCase();
        const judgeRef = doc(db, 'judges', `${compId}_${lowerEmail}`);
        // Only update the name, keep everything else (email, compId, submitted status)
        await setDoc(judgeRef, { name: '알수 없음' }, { merge: true });
    },

    // Admin Management Actions
    addAdmin: async (email, name) => {
        const lowerEmail = email.toLowerCase();
        await setDoc(doc(db, 'admins', lowerEmail), { email: lowerEmail, name });
    },

    removeAdmin: async (email) => {
        await deleteDoc(doc(db, 'admins', email.toLowerCase()));
    },

    // Participant Actions
    addParticipant: async (categoryId, number, name) => {
        const id = Math.random().toString(36).substr(2, 9);
        const { competitions } = get();

        // Find info from state
        let compName = '?';
        let genre = 'General';
        let category = 'None';

        for (const y of competitions) {
            const cat = (y.categories || []).find(c => c.id === categoryId);
            if (cat) {
                compName = y.name;
                genre = cat.genre || 'General';
                category = cat.category || cat.name;
                break;
            }
        }

        await setDoc(doc(db, 'participants', `${categoryId}_${id}`), {
            id,
            categoryId,
            competition: compName,
            genre,
            category,
            number,
            name,
            createdAt: new Date().toISOString()
        });
    },

    getParticipantsByComp: (compId) => {
        const { participants } = get();
        const allByComp = [];
        Object.keys(participants).forEach(catId => {
            if (catId.startsWith(compId)) {
                allByComp.push(...participants[catId]);
            }
        });
        return allByComp;
    },

    // Data Management Actions
    exportData: async () => {
        set({ isExporting: true });
        try {
            console.log('[Store] Starting full export...');
            const collections = ['years', 'participants', 'judges', 'scores', 'admins'];
            const data = {};

            // Fetch all collections
            for (const collName of collections) {
                const snap = await getDocs(collection(db, collName === 'years' ? 'competitions' : collName));
                if (collName === 'judges') {
                    // Reconstruct judgesByComp map
                    data.judgesByComp = {};
                    snap.docs.forEach(doc => {
                        const j = doc.data();
                        const compId = j.compId || j.yearId; // Support legacy
                        if (!data.judgesByComp[compId]) data.judgesByComp[compId] = [];
                        data.judgesByComp[compId].push(j);
                    });
                } else if (collName === 'participants') {
                    // Reconstruct participants map
                    data.participants = {};
                    snap.docs.forEach(doc => {
                        const p = doc.data();
                        if (!data.participants[p.categoryId]) data.participants[p.categoryId] = [];
                        data.participants[p.categoryId].push(p);
                    });
                } else if (collName === 'scores') {
                    // Reconstruct scores map
                    data.scores = {};
                    snap.docs.forEach(doc => {
                        const s = doc.data();
                        // s.id is like catId_pId_email
                        // Structure: scores[catId][pId][email] = values
                        if (!data.scores[s.categoryId]) data.scores[s.categoryId] = {};
                        if (!data.scores[s.categoryId][s.participantId]) data.scores[s.categoryId][s.participantId] = {};
                        data.scores[s.categoryId][s.participantId][s.judgeEmail] = s.values;
                    });
                } else {
                    // competitions, admins
                    data[collName] = snap.docs.map(doc => doc.data());
                }
            }

            // Fetch Settings
            const settingsSnap = await getDocs(collection(db, 'settings'));
            data.settings = {};
            settingsSnap.docs.forEach(doc => {
                data.settings[doc.id] = doc.data();
            });

            // Construct final export object matching previous structure
            const exportObj = {
                version: "1.5", // Version bump for refactoring
                timestamp: new Date().toISOString(),
                competitions: data.years || data.competitions || [],
                participants: data.participants || {},
                judgesByComp: data.judgesByComp || {},
                admins: data.admins || [],
                scores: data.scores || {},
                settings: {
                    general: data.settings.general || { competitionName: get().competitionName },
                    scoring: data.settings.scoring || { items: get().scoringItems },
                    // Legacy support
                }
            };

            const dataStr = JSON.stringify(exportObj, null, 2);
            console.log('[Store] DEBUG: JSON string length:', dataStr.length);

            const blob = new Blob([dataStr], { type: "application/json" });
            console.log('[Store] DEBUG: Blob created, size:', blob.size);

            const url = URL.createObjectURL(blob);
            console.log('[Store] DEBUG: Blob URL generated:', url);

            const filename = `score_program_backup_FULL_${new Date().toISOString().split('T')[0]}.json`;
            console.log('[Store] DEBUG: Intended filename:', filename);

            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", url);
            downloadAnchorNode.setAttribute("download", filename);
            document.body.appendChild(downloadAnchorNode);

            console.log('[Store] DEBUG: Triggering click on anchor tag');
            downloadAnchorNode.click();

            console.log('[Store] DEBUG: Click triggered, removing anchor');
            downloadAnchorNode.remove();

            // Delay cleanup slightly to ensure browser registers the click
            setTimeout(() => {
                URL.revokeObjectURL(url);
                console.log('[Store] DEBUG: Blob URL revoked');
            }, 100);

            console.log('[Store] Full export complete.');
        } catch (error) {
            console.error('[Store] Export failed:', error);
            alert('데이터 내보내기 중 오류가 발생했습니다: ' + error.message);
        } finally {
            set({ isExporting: false });
        }
    },

    importData: async (jsonData, mode = 'merge') => {
        try {
            const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            const batch = writeBatch(db);

            // 1. Clear existing data if mode is 'replace'
            if (mode === 'replace') {
                const collections = ['competitions', 'years', 'participants', 'judges', 'scores', 'admins'];
                for (const collName of collections) {
                    const snap = await getDocs(collection(db, collName));
                    snap.docs.forEach(doc => batch.delete(doc.ref));
                }
            }

            // 2. Import Competitions & Categories
            const compList = data.competitions || data.years || [];
            compList.forEach(comp => {
                // Ensure no 'year' in categories
                const cleanedCategories = (comp.categories || []).map(({ year, ...rest }) => rest);
                const cleanedComp = { ...comp, categories: cleanedCategories };
                if (!cleanedComp.createdAt) cleanedComp.createdAt = new Date().toISOString();
                batch.set(doc(db, 'competitions', comp.id), cleanedComp);
            });

            // 3. Import Participants
            if (data.participants) {
                const pList = Array.isArray(data.participants)
                    ? data.participants
                    : Object.values(data.participants).flat();

                pList.forEach(p => {
                    if (!p.id || !p.categoryId) return;
                    const parts = p.categoryId.split('-');
                    const docId = `${p.categoryId}_${p.id}`;
                    const { year, ...rest } = p; // Remove year field
                    batch.set(doc(db, 'participants', docId), {
                        ...rest,
                        competition: p.competition || p.year || parts[0],
                        genre: p.genre || (parts.slice(1).join(' ').split(' ')[0] || 'General'),
                        category: p.category || (parts.slice(1).join(' ').split(' ').slice(1).join(' ') || parts.slice(1).join(' '))
                    });
                });
            }

            // 4. Import Judges
            const judgesSource = data.judgesByComp || data.judgesByYear;
            if (judgesSource) {
                Object.entries(judgesSource).forEach(([compId, judges]) => {
                    judges.forEach(j => {
                        const { yearId, ...rest } = j;
                        const finalId = rest.compId || compId;
                        batch.set(doc(db, 'judges', `${finalId}_${j.email.replace(/\./g, '_')}`), { ...rest, compId: finalId });
                    });
                });
            }

            // 5 & 6. Import Settings
            if (data.settings) {
                if (data.settings.general) batch.set(doc(db, 'settings', 'general'), data.settings.general);
                if (data.settings.scoring) batch.set(doc(db, 'settings', 'scoring'), data.settings.scoring);
            }

            // 7. Import Scores
            if (data.scores) {
                Object.entries(data.scores).forEach(([catId, pMap]) => {
                    Object.entries(pMap).forEach(([pId, judgeMap]) => {
                        Object.entries(judgeMap).forEach(([email, values]) => {
                            const scoreId = `${catId}_${pId}_${email.toLowerCase()}`;
                            batch.set(doc(db, 'scores', scoreId), {
                                categoryId: catId,
                                participantId: pId,
                                judgeEmail: email.toLowerCase(),
                                values: values,
                                updatedAt: new Date().toISOString()
                            });
                        });
                    });
                });
            }

            await batch.commit();
            return { success: true };
        } catch (error) {
            console.error("Import failed:", error);
            throw error;
        }
    },

    clearAllData: async () => {
        // Confirmation is handled in AdminPanel.jsx
        // if (!confirm('주의: 데이터베이스의 모든 정보(연도, 종목, 참가자, 점수, 심사위원, 관리자)가 영구적으로 삭제됩니다. 계속하시겠습니까?')) return;

        set({ isResetting: true, resetStatus: '초기화 준비 중...' });

        try {
            console.log('[Store] Full Database Reset initiated...');
            // Include legacy collections (scoringItems, test_collection) for a truly clean wipe
            const collections = ['competitions', 'years', 'participants', 'judges', 'scores', 'admins', 'settings', 'scoringItems', 'test_collection'];

            for (const collName of collections) {
                set({ resetStatus: `${collName} 컬렉션 삭제 중...` });
                const snap = await getDocs(collection(db, collName));

                // Firestore writeBatch has a limit of 500 operations.
                // We process in chunks of 400 to be safe.
                const docs = snap.docs;
                for (let i = 0; i < docs.length; i += 400) {
                    const chunk = docs.slice(i, i + 400);
                    const batch = writeBatch(db);
                    chunk.forEach(docSnap => batch.delete(docSnap.ref));
                    set({ resetStatus: `${collName} 삭제 중 (${i + chunk.length}/${docs.length})...` });
                    await batch.commit();
                }
            }

            set({ resetStatus: '설정 초기화 중...' });
            const settingsBatch = writeBatch(db);
            // Reset competition name to default
            settingsBatch.set(doc(db, 'settings', 'general'), { competitionName: 'Latin Dance Score System' });

            settingsBatch.set(doc(db, 'settings', 'scoring'), { items: [] });
            await settingsBatch.commit();

            set({ resetStatus: '데이터 정제 완료' });
            // Removed: await get().initDefaults(); - No longer creating default years/categories

            console.log('[Store] Full Database Reset complete.');
            set({ resetStatus: '완료!' });
            alert('데이터베이스가 성공적으로 초기화되었습니다.');
        } catch (error) {
            console.error('[Store] clearAllData failed:', error);
            alert('초기화 중 오류가 발생했습니다: ' + error.message);
        } finally {
            set({ isResetting: false, resetStatus: '' });
        }
    },

    normalizeDatabase: async () => {
        const batch = writeBatch(db);
        let updateCount = 0;

        const collections = [
            { coll: 'judges', idField: (data) => `${data.compId || data.yearId}_${data.email.toLowerCase()}`, emailField: 'email' },
            { coll: 'admins', idField: (data) => data.email.toLowerCase(), emailField: 'email' }
        ];

        for (const cfg of collections) {
            const snap = await getDocs(collection(db, cfg.coll));
            snap.docs.forEach(docSnap => {
                const data = docSnap.data();
                const lowerEmail = data[cfg.emailField].toLowerCase();
                const correctId = cfg.idField(data);

                if (docSnap.id !== correctId || data[cfg.emailField] !== lowerEmail) {
                    batch.delete(docSnap.ref);
                    batch.set(doc(db, cfg.coll, correctId), { ...data, [cfg.emailField]: lowerEmail });
                    updateCount++;
                }
            });
        }

        const scoresSnap = await getDocs(collection(db, 'scores'));
        scoresSnap.docs.forEach(docSnap => {
            const data = docSnap.data();
            const parts = docSnap.id.split('_');
            if (parts.length >= 3) {
                const lowerEmail = parts.slice(2).join('_').toLowerCase();
                const correctId = `${parts[0]}_${parts[1]}_${lowerEmail}`;
                if (docSnap.id !== correctId || data.judgeEmail !== lowerEmail) {
                    batch.delete(docSnap.ref);
                    batch.set(doc(db, 'scores', correctId), { ...data, judgeEmail: lowerEmail });
                    updateCount++;
                }
            }
        });

        if (updateCount > 0) await batch.commit();
        return updateCount;
    },

    fixLockedProperties: async () => {
        const batch = writeBatch(db);
        let updateCount = 0;
        const compSnap = await getDocs(collection(db, 'competitions'));

        compSnap.docs.forEach(docSnap => {
            const data = docSnap.data();
            let needsUpdate = false;
            let updates = {};

            if (data.locked === undefined) {
                updates.locked = false;
                needsUpdate = true;
            }

            const updatedCategories = (data.categories || []).map(cat => {
                if (cat.locked === undefined) {
                    needsUpdate = true;
                    return { ...cat, locked: false };
                }
                return cat;
            });

            if (needsUpdate) {
                updates.categories = updatedCategories;
                batch.update(docSnap.ref, updates);
                updateCount++;
            }
        });

        if (updateCount > 0) await batch.commit();
        return updateCount;
    },

    batchUpdateParticipants: async (categoryId, updates) => {
        const batch = writeBatch(db);
        updates.forEach(update => {
            batch.update(doc(db, 'participants', `${categoryId}_${update.id}`), update);
        });
        await batch.commit();
    },

    updateParticipant: async (categoryId, participantId, updates) => {
        await updateDoc(doc(db, 'participants', `${categoryId}_${participantId}`), updates);
    },

    removeParticipant: async (categoryId, participantId) => {
        await deleteDoc(doc(db, 'participants', `${categoryId}_${participantId}`));
    },

    moveParticipants: async (oldCategoryId, newCategoryId, participantIds) => {
        const batch = writeBatch(db);
        for (const pId of participantIds) {
            const oldRef = doc(db, 'participants', `${oldCategoryId}_${pId}`);
            const oldSnap = await getDoc(oldRef);
            if (oldSnap.exists()) {
                const data = oldSnap.data();
                const newRef = doc(db, 'participants', `${newCategoryId}_${pId}`);
                batch.set(newRef, { ...data, categoryId: newCategoryId });
                batch.delete(oldRef);
            }
        }
        await batch.commit();
    },

    seedRandomScores: async (compId) => {
        const { competitions, participants, scoringItems } = get();
        const comp = competitions.find(c => c.id === compId);
        if (!comp) return;

        const batch = writeBatch(db);
        const mockJudges = [
            { email: 'kylevamos00@gmail.com', name: '박시홍' },
            { email: 'ilrujer@gmail.com', name: '염은영' }
        ];

        for (const cat of comp.categories) {
            const catParticipants = participants[cat.id] || [];

            // Also ensure these judges are registered for the competition in the DB
            for (const judge of mockJudges) {
                const judgeRef = doc(db, 'judges', `${compId}_${judge.email}`);
                batch.set(judgeRef, { compId, email: judge.email, name: judge.name });
            }

            for (const p of catParticipants) {
                for (const judge of mockJudges) {
                    const docId = `${cat.id}_${p.id}_${judge.email}`;
                    const scoreRef = doc(db, 'scores', docId);
                    const values = {};
                    scoringItems.forEach(item => {
                        // Generate random score between 5.0 and 10.0 for realism
                        values[item.id] = parseFloat((Math.random() * 5 + 5).toFixed(1));
                    });
                    batch.set(scoreRef, { values });
                }
            }
        }
        await batch.commit();
    },

    clearCompetitionScores: async (compId) => {
        const { competitions } = get();
        const comp = competitions.find(c => c.id === compId);
        if (!comp) return;

        const batch = writeBatch(db);
        const categoryIds = (comp.categories || []).map(c => c.id);

        for (const catId of categoryIds) {
            const q = query(collection(db, 'scores'), where('categoryId', '==', catId));
            const snapshot = await getDocs(q);
            snapshot.docs.forEach(d => {
                batch.delete(d.ref);
            });
        }
        await batch.commit();
    },

    // Firebase Initialization & Sync
    // Sync state helpers
    unsubScores: null,

    refreshScores: () => {
        const { unsubScores, checkAllSynced } = get();
        if (unsubScores) unsubScores();

        console.log('[Sync] Starting Scores refresh...');
        const unsub = onSnapshot(collection(db, 'scores'),
            (snapshot) => {
                const scoresMap = {};
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const parts = doc.id.split('_');
                    if (parts.length < 3) return;

                    const catId = parts[0];
                    const pId = parts[1];
                    const jEmail = parts.slice(2).join('_').toLowerCase();

                    if (!scoresMap[catId]) scoresMap[catId] = {};
                    if (!scoresMap[catId][pId]) scoresMap[catId][pId] = {};
                    scoresMap[catId][pId][jEmail] = data.values;
                });
                set({ scores: scoresMap });
                console.log(`[Sync] Scores updated. Categories: ${Object.keys(scoresMap).length}`);

                // Helper to mark synced if checkAllSynced is available
                // Note: checkAllSynced is local to initSync scope, so we just set state directly if needed
                // or we rely on the implementation below.
            },
            (error) => {
                console.error('[Sync] Scores sync error:', error);
                if (error.code === 'permission-denied') {
                    console.warn('[Sync] Permission denied. Waiting for auth...');
                }
            }
        );
        set({ unsubScores: unsub });
    },

    initSync: () => {
        const { refreshScores, isSyncInitialized } = get();
        if (isSyncInitialized) return;
        set({ isSyncInitialized: true });

        // Restore session from localStorage
        const savedUser = localStorage.getItem('score_program_user');
        if (savedUser) {
            try {
                const userData = JSON.parse(savedUser);
                const TWELVE_HOURS = 12 * 60 * 60 * 1000;

                if (Date.now() - userData.lastLoginAt < TWELVE_HOURS) {
                    set({ currentUser: userData });
                    console.log(`[Auth] Session restored for ${userData.email}`);
                    // refreshScores will be called by login() usually, but here we do it manually after restoration
                    get().refreshScores();
                } else {
                    console.log('[Auth] Session expired');
                    localStorage.removeItem('score_program_user');
                }
            } catch (e) {
                console.error('[Auth] Failed to restore session', e);
                localStorage.removeItem('score_program_user');
            }
        }

        // Sync General Settings
        onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
            if (docSnap.exists()) {
                set({ competitionName: docSnap.data().competitionName || 'New Competition' });
            } else {
                setDoc(doc(db, 'settings', 'general'), { competitionName: 'Score System' });
            }
        });

        // Sync Scoring Items
        onSnapshot(doc(db, 'settings', 'scoring'), (docSnap) => {
            if (docSnap.exists()) {
                set({ scoringItems: docSnap.data().items || [] });
            } else {
                // Initialize with empty array if not exists
                setDoc(doc(db, 'settings', 'scoring'), { items: [] });
            }
        });

        // Local scoped sync tracker
        let collectionsSynced = { competitions: false, judgesByComp: false, participants: false, admins: false };
        const checkAllSynced = (key) => {
            collectionsSynced[key] = true;
            if (Object.values(collectionsSynced).every(v => v)) {
                set({ isInitialSyncComplete: true });
                get().syncUserRole();
            }
        };

        // Safety timeout
        setTimeout(() => {
            if (!get().isInitialSyncComplete) {
                console.warn('[Sync] Safety timeout reached. Forcing sync complete.');
                set({ isInitialSyncComplete: true });
                get().syncUserRole();
            }
        }, 5000);

        onSnapshot(collection(db, 'competitions'), (snapshot) => {
            const competitions = snapshot.docs.map(doc => doc.data());
            set({ competitions: competitions.sort((a, b) => b.name.localeCompare(a.name)) });
            checkAllSynced('competitions');
        });

        onSnapshot(collection(db, 'judges'), (snapshot) => {
            const grouped = {};
            snapshot.docs.forEach(doc => {
                const j = doc.data();
                const normalizedJudge = { ...j, email: j.email.toLowerCase() };
                const compId = j.compId || j.yearId;
                if (!grouped[compId]) grouped[compId] = [];
                grouped[compId].push(normalizedJudge);
            });
            set({ judgesByComp: grouped });
            get().syncUserRole();
            checkAllSynced('judgesByComp');
        });

        // Sync Participants
        const unsubParticipants = onSnapshot(collection(db, 'participants'),
            (snapshot) => {
                const participantsByCat = {};
                let errorCount = 0;

                snapshot.docs.forEach(doc => {
                    const p = doc.data();
                    const pId = doc.id;
                    let catId = p.categoryId;

                    // Support legacy or corrupt data where categoryId field might be missing
                    if (!catId && pId.includes('_')) {
                        catId = pId.split('_')[0];
                    }

                    if (catId) {
                        if (!participantsByCat[catId]) participantsByCat[catId] = [];

                        // Ensure granular fields are present even for legacy data
                        const parts = catId.split('-');
                        const participantData = {
                            ...p,
                            id: p.id || pId.split('_').pop(),
                            categoryId: catId,
                            competition: p.competition || p.year || parts[0],
                            genre: p.genre || (parts.slice(1).join(' ').split(' ')[0] || 'General'),
                            category: p.category || (parts.slice(1).join(' ').split(' ').slice(1).join(' ') || parts.slice(1).join(' '))
                        };

                        participantsByCat[catId].push(participantData);
                    } else {
                        errorCount++;
                    }
                });

                console.log(`[Sync] Participants updated. Count: ${snapshot.size}, Errors: ${errorCount}`);
                set({ participants: participantsByCat });
                checkAllSynced('participants');
            },
            (error) => {
                console.error('[Sync] Participants sync error:', error);
                if (error.code === 'permission-denied') {
                    console.warn('[Sync] Permission denied for participants. Check Firestore Rules.');
                }
                checkAllSynced('participants'); // Don't block app even if error
            }
        );

        // Sync Admins
        onSnapshot(collection(db, 'admins'), (snapshot) => {
            const admins = snapshot.docs.map(doc => {
                const data = doc.data();
                return { ...data, email: data.email.toLowerCase() };
            });
            set({ admins });
            get().syncUserRole();
            checkAllSynced('admins');
        });

        // Initial Score Sync
        refreshScores();
    },

    initDefaults: async () => {
        if (get().isInitializingDefaults) return;
        set({ isInitializingDefaults: true });

        try {
            // Check if any competitions exist
            const q = query(collection(db, 'competitions'));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                console.log('[Store] No competitions found. Initializing defaults...');
                const defaultCompId = 'comp-2024';

                // Initial Competition
                await setDoc(doc(db, 'competitions', defaultCompId), {
                    name: '2024 Latin Dance Festival',
                    locked: false,
                    createdAt: new Date().toISOString(),
                    categories: [
                        { id: 'cat-pro-latin', name: 'Professional Latin', genre: 'Professional', category: 'Latin', order: 0, locked: false },
                        { id: 'cat-pro-am-latin', name: 'Pro-Am Latin', genre: 'Pro-Am', category: 'Latin', order: 1, locked: false }
                    ]
                });
                console.log('[Store] Default competition initialized.');
            }
        } catch (error) {
            console.error('[Store] initDefaults failed:', error);
        } finally {
            set({ isInitializingDefaults: false });
        }
    }
}));

export default useStore;

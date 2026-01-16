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
    years: [], // [ { id, name, locked, categories: [ { id, name, order } ] } ]
    selectedCategoryId: '',
    activeView: null, // 'admin', 'leaderboard', 'scorer', null
    scoringItems: [],
    judgesByYear: {}, // { [yearId]: [ { email, name } ] }
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
        const { currentUser, judgesByYear, admins } = get();
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
            // Optional: Root Admin doesn't have a fixed name in DB usually, but we could enforce "Root Admin" if desired.
            // keeping existing name for now or could defaulting if missing.
        }

        // 2. Admin Check
        // admins is [ { email, name } ]
        const adminEntry = admins.find(a => a.email === currentUser.email);
        if (adminEntry) {
            if (!role) role = 'ADMIN';
            registeredName = adminEntry.name;
        }

        // 3. Judge Check & Assigned Years Calculation
        const assignedYears = [];
        let judgeEntry = null;

        Object.entries(judgesByYear).forEach(([yId, list]) => {
            const found = list.find(j => j.email === currentUser.email);
            if (found) {
                if (!role) role = 'JUDGE';
                assignedYears.push(yId);
                // We pick the name from the first matched year entry as the canonical name
                if (!registeredName && !judgeEntry) {
                    judgeEntry = found;
                }
            }
        });

        if (!registeredName && judgeEntry) {
            registeredName = judgeEntry.name;
        }

        // 4. Default to USER if nothing found
        if (!role) role = 'USER';

        // Update if changed (role, assignedYears, or name)
        const currentAssigned = currentUser.assignedYears ? currentUser.assignedYears.join(',') : '';
        const newAssigned = assignedYears.join(',');

        // Determine final name: Registered Name > Current Name > Email Prefix
        const finalName = registeredName || currentUser.name || currentUser.email.split('@')[0];

        if (currentUser.role !== role || currentAssigned !== newAssigned || currentUser.name !== finalName) {
            const updatedUser = { ...currentUser, role, assignedYears, name: finalName };
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
        const { currentUser, years } = get();
        // Permission check: Only JUDGE or ADMIN/ROOT_ADMIN can edit
        const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'ROOT_ADMIN';
        const isJudge = currentUser?.role === 'JUDGE';
        if (!isAdmin && !isJudge) return;

        // Derive granular info from years state
        let yearName = '?';
        let genre = 'General';
        let category = 'None';

        for (const y of years) {
            const cat = (y.categories || []).find(c => c.id === categoryId);
            if (cat) {
                yearName = y.name;
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
            year: yearName,
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
        const { currentUser, years } = get();
        const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'ROOT_ADMIN';
        const isJudge = currentUser?.role === 'JUDGE';
        if (!isAdmin && !isJudge) return;

        // Find context
        let yearId = '';
        let yearName = '?';
        let genre = 'General';
        let category = 'None';

        for (const y of years) {
            const cat = (y.categories || []).find(c => c.id === categoryId);
            if (cat) {
                yearId = y.id;
                yearName = y.name;
                genre = cat.genre || 'General';
                category = cat.category || cat.name;
                break;
            }
        }
        if (!yearId) return;

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
                year: yearName,
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
        // ID: yearId_email
        const judgeRef = doc(db, 'judges', `${yearId}_${email}`);
        batch.set(judgeRef, {
            submittedCategories: {
                [categoryId]: true
            }
        }, { merge: true });

        await batch.commit();
    },

    toggleJudgeSubmission: async (categoryId, isSubmitted) => {
        const { currentUser, years } = get();
        // Find context for yearId
        let yearId = '';
        for (const y of years) {
            const cat = (y.categories || []).find(c => c.id === categoryId);
            if (cat) {
                yearId = y.id;
                break;
            }
        }
        if (!yearId) return;

        const email = currentUser.email.toLowerCase();
        const judgeRef = doc(db, 'judges', `${yearId}_${email}`);

        await setDoc(judgeRef, {
            submittedCategories: {
                [categoryId]: isSubmitted
            }
        }, { merge: true });
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
    addYear: async (name) => {
        const id = Math.random().toString(36).substr(2, 9);
        const year = { id, name, categories: [] };
        await setDoc(doc(db, 'years', id), year);
    },

    updateYear: async (yearId, newName) => {
        const batch = writeBatch(db);
        const yearRef = doc(db, 'years', yearId);
        const yearSnap = await getDoc(yearRef);
        if (!yearSnap.exists()) return;

        const oldName = yearSnap.data().name;
        batch.update(yearRef, { name: newName });

        // Cascading update for participants in all categories of this year
        const categories = yearSnap.data().categories || [];
        for (const cat of categories) {
            const pQuery = query(collection(db, 'participants'), where('categoryId', '==', cat.id));
            const pSnap = await getDocs(pQuery);
            pSnap.docs.forEach(d => {
                batch.update(d.ref, { year: newName });
            });

            const sQuery = query(collection(db, 'scores'), where('categoryId', '==', cat.id));
            const sSnap = await getDocs(sQuery);
            sSnap.docs.forEach(d => {
                batch.update(d.ref, { year: newName });
            });
        }

        await batch.commit();
    },

    deleteYear: async (yearId) => {
        try {
            console.log(`[Store] Deleting year: ${yearId}`);
            const batch = writeBatch(db);
            const yearRef = doc(db, 'years', yearId);
            const yearSnap = await getDoc(yearRef);
            if (!yearSnap.exists()) {
                console.warn(`[Store] Year ${yearId} not found in DB.`);
                return;
            }

            const categories = yearSnap.data().categories || [];

            // 1. Delete Judges
            const jSnap = await getDocs(query(collection(db, 'judges'), where('yearId', '==', yearId)));
            jSnap.docs.forEach(d => batch.delete(d.ref));

            // 2. Delete Categories, Participants, Scores
            for (const cat of categories) {
                const pSnap = await getDocs(query(collection(db, 'participants'), where('categoryId', '==', cat.id)));
                pSnap.docs.forEach(d => batch.delete(d.ref));

                const sSnap = await getDocs(query(collection(db, 'scores'), where('categoryId', '==', cat.id)));
                sSnap.docs.forEach(d => batch.delete(d.ref));
            }

            // 3. Delete Year itself
            batch.delete(yearRef);

            await batch.commit();
            console.log(`[Store] Year ${yearId} and associated data deleted successfully.`);
        } catch (error) {
            console.error('[Store] deleteYear failed:', error);
            alert('연도 삭제 중 오류가 발생했습니다: ' + error.message);
        }
    },

    addCategory: async (yearId, name) => {
        const catId = Math.random().toString(36).substr(2, 9);
        const yearRef = doc(db, 'years', yearId);
        const yearSnap = await getDoc(yearRef);

        if (yearSnap.exists()) {
            const data = yearSnap.data();
            const yearVal = data.name || yearId;

            const parts = name.split(' ');
            const genre = parts.length > 1 ? parts[0] : 'General';
            const category = parts.length > 1 ? parts.slice(1).join(' ') : name;

            const newCategoryObj = {
                id: catId,
                name,
                year: yearVal,
                genre,
                category,
                order: (data.categories?.length || 0)
            };

            const categories = [...(data.categories || []), newCategoryObj];
            await updateDoc(yearRef, { categories });
        }
    },

    moveCategory: async (yearId, catId, direction) => {
        const yearRef = doc(db, 'years', yearId);
        const yearSnap = await getDoc(yearRef);
        if (yearSnap.exists()) {
            const categories = [...yearSnap.data().categories].sort((a, b) => (a.order || 0) - (b.order || 0));
            const index = categories.findIndex(c => c.id === catId);
            const targetIndex = index + direction;
            if (targetIndex >= 0 && targetIndex < categories.length) {
                [categories[index], categories[targetIndex]] = [categories[targetIndex], categories[index]];
                // Update orders
                const updated = categories.map((c, i) => ({ ...c, order: i }));
                await updateDoc(yearRef, { categories: updated });
            }
        }
    },

    sortCategoriesByName: async (yearId, direction = 'asc') => {
        const yearRef = doc(db, 'years', yearId);
        const yearSnap = await getDoc(yearRef);
        if (yearSnap.exists()) {
            const categories = [...yearSnap.data().categories]
                .sort((a, b) => {
                    const res = a.name.localeCompare(b.name, 'ko');
                    return direction === 'asc' ? res : -res;
                })
                .map((c, i) => ({ ...c, order: i }));
            await updateDoc(yearRef, { categories });
        }
    },

    toggleYearLock: async (yearId, isLocked) => {
        const yearRef = doc(db, 'years', yearId);
        const yearSnap = await getDoc(yearRef);

        if (yearSnap.exists()) {
            const data = yearSnap.data();
            // Cascade: Update all categories to match the year's lock status
            // Priority: Year Lock overrides individual category locks
            const updatedCategories = (data.categories || []).map(cat => ({
                ...cat,
                locked: isLocked
            }));

            await updateDoc(yearRef, {
                locked: isLocked,
                categories: updatedCategories
            });
        }
    },

    updateCategory: async (yearId, categoryId, newName) => {
        const batch = writeBatch(db);
        const yearRef = doc(db, 'years', yearId);
        const yearSnap = await getDoc(yearRef);
        if (yearSnap.exists()) {
            const parts = newName.split(' ');
            const newGenre = parts.length > 1 ? parts[0] : 'General';
            const newCategory = parts.length > 1 ? parts.slice(1).join(' ') : newName;

            const categories = (yearSnap.data().categories || []).map(c =>
                c.id === categoryId ? { ...c, name: newName, genre: newGenre, category: newCategory } : c
            );
            batch.update(yearRef, { categories });

            // Cascading update for participants and scores
            const pSnap = await getDocs(query(collection(db, 'participants'), where('categoryId', '==', categoryId)));
            pSnap.docs.forEach(d => batch.update(d.ref, { genre: newGenre, category: newCategory }));

            const sSnap = await getDocs(query(collection(db, 'scores'), where('categoryId', '==', categoryId)));
            sSnap.docs.forEach(d => batch.update(d.ref, { genre: newGenre, category: newCategory }));

            await batch.commit();
        }
    },

    deleteCategory: async (yearId, categoryId) => {
        try {
            const batch = writeBatch(db);
            const yearRef = doc(db, 'years', yearId);
            const yearSnap = await getDoc(yearRef);
            if (yearSnap.exists()) {
                const categories = (yearSnap.data().categories || []).filter(c => c.id !== categoryId);
                batch.update(yearRef, { categories });

                // Delete participants and scores
                const pSnap = await getDocs(query(collection(db, 'participants'), where('categoryId', '==', categoryId)));
                pSnap.docs.forEach(d => batch.delete(d.ref));

                const sSnap = await getDocs(query(collection(db, 'scores'), where('categoryId', '==', categoryId)));
                sSnap.docs.forEach(d => batch.delete(d.ref));

                await batch.commit();
            }
        } catch (error) {
            console.error('[Store] deleteCategory failed:', error);
            alert('종목 삭제 중 오류가 발생했습니다: ' + error.message);
        }
    },

    updateCategoriesOrder: async (yearId, newCategories) => {
        const yearRef = doc(db, 'years', yearId);
        // Ensure to save normalized categories with correct order indexes
        const normalized = newCategories.map((cat, index) => ({
            ...cat,
            order: index
        }));
        await updateDoc(yearRef, { categories: normalized });
    },



    toggleCategoryLock: async (yearId, categoryId, isLocked) => {
        const yearRef = doc(db, 'years', yearId);
        const yearSnap = await getDoc(yearRef);
        if (yearSnap.exists()) {
            const categories = (yearSnap.data().categories || []).map(c =>
                c.id === categoryId ? { ...c, locked: isLocked } : c
            );
            await updateDoc(yearRef, { categories });
        }
    },

    // Judge Actions
    addJudge: async (yearId, email, name) => {
        const lowerEmail = email.toLowerCase();
        await setDoc(doc(db, 'judges', `${yearId}_${lowerEmail}`), { yearId, email: lowerEmail, name });
    },

    removeJudge: async (yearId, email) => {
        await deleteDoc(doc(db, 'judges', `${yearId}_${email.toLowerCase()}`));
    },

    anonymizeJudge: async (yearId, email) => {
        const lowerEmail = email.toLowerCase();
        const judgeRef = doc(db, 'judges', `${yearId}_${lowerEmail}`);
        // Only update the name, keep everything else (email, yearId, submitted status)
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
        const { years } = get();

        // Find info from state
        let yearName = '?';
        let genre = 'General';
        let category = 'None';

        for (const y of years) {
            const cat = (y.categories || []).find(c => c.id === categoryId);
            if (cat) {
                yearName = y.name;
                genre = cat.genre || 'General';
                category = cat.category || cat.name;
                break;
            }
        }

        await setDoc(doc(db, 'participants', `${categoryId}_${id}`), {
            id,
            categoryId,
            year: yearName,
            genre,
            category,
            number,
            name,
            createdAt: new Date().toISOString()
        });
    },

    getParticipantsByYear: (year) => {
        const { participants } = get();
        const allByYear = [];
        Object.keys(participants).forEach(catId => {
            if (catId.startsWith(year)) {
                allByYear.push(...participants[catId]);
            }
        });
        return allByYear;
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
                const snap = await getDocs(collection(db, collName));
                if (collName === 'judges') {
                    // Reconstruct judgesByYear map
                    data.judgesByYear = {};
                    snap.docs.forEach(doc => {
                        const j = doc.data();
                        if (!data.judgesByYear[j.yearId]) data.judgesByYear[j.yearId] = [];
                        data.judgesByYear[j.yearId].push(j);
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
                    // years, admins
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
                version: "1.4", // Version bump for full async export
                timestamp: new Date().toISOString(),
                years: data.years || [],
                participants: data.participants || {},
                judgesByYear: data.judgesByYear || {},
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
                const collections = ['years', 'participants', 'judges', 'scores', 'admins'];
                for (const collName of collections) {
                    const snap = await getDocs(collection(db, collName));
                    snap.docs.forEach(doc => batch.delete(doc.ref));
                }
            }

            // 2. Import Years & Categories
            if (data.years) {
                data.years.forEach(year => {
                    batch.set(doc(db, 'years', year.id), year);
                });
            }

            // 3. Import Participants
            if (data.participants) {
                const pList = Array.isArray(data.participants)
                    ? data.participants
                    : Object.values(data.participants).flat();

                pList.forEach(p => {
                    if (!p.id || !p.categoryId) return;
                    const parts = p.categoryId.split('-');
                    const docId = `${p.categoryId}_${p.id}`;
                    batch.set(doc(db, 'participants', docId), {
                        ...p,
                        year: p.year || parts[0],
                        genre: p.genre || (parts.slice(1).join(' ').split(' ')[0] || 'General'),
                        category: p.category || (parts.slice(1).join(' ').split(' ').slice(1).join(' ') || parts.slice(1).join(' '))
                    });
                });
            }

            // 4. Import Judges
            if (data.judgesByYear) {
                Object.entries(data.judgesByYear).forEach(([yearId, judges]) => {
                    judges.forEach(j => {
                        batch.set(doc(db, 'judges', `${yearId}_${j.email.replace(/\./g, '_')}`), { ...j, yearId });
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
            const collections = ['years', 'participants', 'judges', 'scores', 'admins'];

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
            settingsBatch.set(doc(db, 'settings', 'general'), { competitionName: 'Korea Latin Dance Cup' });
            // Also reset scoring items to defaults
            const defaultScoring = [
                { id: 'tech', label: '기술점수', order: 0 },
                { id: 'art', label: '예술점수', order: 1 },
            ];
            settingsBatch.set(doc(db, 'settings', 'scoring'), { items: defaultScoring });
            await settingsBatch.commit();

            set({ resetStatus: '기본 데이터 생성 중...' });
            await get().initDefaults();

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
            { coll: 'judges', idField: (data) => `${data.yearId}_${data.email.toLowerCase()}`, emailField: 'email' },
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

    seedRandomScores: async (yearId) => {
        const { years, participants, scoringItems } = get();
        const year = years.find(y => y.id === yearId);
        if (!year) return;

        const batch = writeBatch(db);
        const mockJudges = [
            { email: 'kylevamos00@gmail.com', name: '박시홍' },
            { email: 'ilrujer@gmail.com', name: '염은영' }
        ];

        for (const cat of year.categories) {
            const catParticipants = participants[cat.id] || [];

            // Also ensure these judges are registered for the year in the DB
            for (const judge of mockJudges) {
                const judgeRef = doc(db, 'judges', `${yearId}_${judge.email}`);
                batch.set(judgeRef, { yearId, email: judge.email, name: judge.name });
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

    clearYearScores: async (yearId) => {
        const { years } = get();
        const year = years.find(y => y.id === yearId);
        if (!year) return;

        const batch = writeBatch(db);
        const categoryIds = (year.categories || []).map(c => c.id);

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
                setDoc(doc(db, 'settings', 'general'), { competitionName: 'Korea Latin Dance Cup' });
            }
        });

        // Sync Scoring Items
        onSnapshot(doc(db, 'settings', 'scoring'), (docSnap) => {
            if (docSnap.exists()) {
                set({ scoringItems: docSnap.data().items || [] });
            } else {
                // Initialize default scoring items if not exists
                const defaults = [
                    { id: 'tech', label: '기술점수', order: 0 },
                    { id: 'art', label: '예술점수', order: 1 },
                ];
                setDoc(doc(db, 'settings', 'scoring'), { items: defaults });
            }
        });

        // Local scoped sync tracker
        let collectionsSynced = { years: false, judges: false, participants: false, admins: false };
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

        onSnapshot(collection(db, 'years'), (snapshot) => {
            const years = snapshot.docs.map(doc => doc.data());
            set({ years: years.sort((a, b) => b.name.localeCompare(a.name)) });
            if (years.length === 0 && !get().isInitializingDefaults) {
                get().initDefaults();
            }
            checkAllSynced('years');
        });

        // Sync Judges
        onSnapshot(collection(db, 'judges'), (snapshot) => {
            const grouped = {};
            snapshot.docs.forEach(doc => {
                const j = doc.data();
                const normalizedJudge = { ...j, email: j.email.toLowerCase() };
                if (!grouped[j.yearId]) grouped[j.yearId] = [];
                grouped[j.yearId].push(normalizedJudge);
            });
            set({ judgesByYear: grouped });
            get().syncUserRole();
            checkAllSynced('judges');
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
                            year: p.year || parts[0],
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
        console.log('[Store] Initializing default data...');

        try {
            const defaultCats = [
                'Salsa Couple', 'Bachata Couple', 'Salsa Shine Solo Man',
                'Salsa Shine Solo Woman', 'Salsa Shine Duo', 'Bachata Shine Duo',
                'Salsa Group', 'Bachata Group', 'Senior 종합'
            ];
            const yearsList = ['2024', '2025', '2026'];

            const batch = writeBatch(db);

            for (const year of yearsList) {
                const yearId = Math.random().toString(36).substr(2, 9);
                const categories = defaultCats.map((name, i) => {
                    const parts = name.split(' ');
                    const genre = parts.length > 1 ? parts[0] : 'General';
                    const category = parts.length > 1 ? parts.slice(1).join(' ') : name;
                    return {
                        id: Math.random().toString(36).substr(2, 9),
                        name,
                        genre,
                        category,
                        year: year,
                        order: i
                    };
                });
                batch.set(doc(db, 'years', yearId), { id: yearId, name: year, categories, locked: false });
            }
            await batch.commit();
            console.log('[Store] Default data initialized.');
        } catch (error) {
            console.error('[Store] initDefaults failed:', error);
        } finally {
            set({ isInitializingDefaults: false });
        }
    }
}));

export default useStore;

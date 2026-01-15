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

        // 1. Root Admin Check
        const rootAdmins = (import.meta.env.VITE_ROOT_ADMIN_EMAILS || '').split(',').map(e => e.trim());
        if (rootAdmins.includes(currentUser.email)) {
            role = 'ROOT_ADMIN';
        }

        // 2. Admin Check
        if (!role && admins.some(a => a.email === currentUser.email)) {
            role = 'ADMIN';
        }

        // 3. Judge Check & Assigned Years Calculation
        const assignedYears = [];
        Object.entries(judgesByYear).forEach(([yId, list]) => {
            if (list.some(j => j.email === currentUser.email)) {
                if (!role) role = 'JUDGE';
                assignedYears.push(yId);
            }
        });

        // 4. Default to USER if nothing found
        if (!role) role = 'USER';

        // Update if changed (role or assignedYears)
        const currentAssigned = currentUser.assignedYears ? currentUser.assignedYears.join(',') : '';
        const newAssigned = assignedYears.join(',');

        if (currentUser.role !== role || currentAssigned !== newAssigned) {
            set({ currentUser: { ...currentUser, role, assignedYears } });
            console.log(`[Auth] User Role updated: ${currentUser.email} -> ${role}, Assigned: [${newAssigned}]`);
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
        const { currentUser, years } = get();
        // Permission check: Only JUDGE or ADMIN/ROOT_ADMIN can edit
        const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'ROOT_ADMIN';
        const isJudge = currentUser?.role === 'JUDGE';
        if (!isAdmin && !isJudge) return;

        // Check if year is locked
        const yearId = categoryId.split('-')[0];
        const year = years.find(y => y.id === yearId);
        if (year?.locked && !isAdmin) {
            console.error('Scoring is locked for this competition.');
            return;
        }

        const docId = `${categoryId}_${participantId}_${currentUser.email.toLowerCase()}`;
        const scoreRef = doc(db, 'scores', docId);
        const snap = await getDoc(scoreRef);

        // Derive granular info from categoryId (Legacy fallback)
        const parts = categoryId.split('-');
        const yearVal = parts[0];
        const genreAndCat = parts.slice(1).join(' ');

        const currentValues = snap.exists() ? snap.data().values : {};
        await setDoc(scoreRef, {
            year: yearVal,
            genre: genreAndCat.split(' ')[0] || 'General',
            category: genreAndCat.split(' ').slice(1).join(' ') || genreAndCat,
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
        const id = name.toLowerCase().replace(/\s+/g, '-');
        const year = { id, name, categories: [] };
        await setDoc(doc(db, 'years', id), year);
    },

    updateYear: async (yearId, newName) => {
        await updateDoc(doc(db, 'years', yearId), { name: newName });
    },

    deleteYear: async (yearId) => {
        await deleteDoc(doc(db, 'years', yearId));
    },

    addCategory: async (yearId, name) => {
        const catId = `${yearId}-${name.toLowerCase().replace(/\s+/g, '-')}`;
        const yearRef = doc(db, 'years', yearId);
        const yearSnap = await getDoc(yearRef);

        if (yearSnap.exists()) {
            const data = yearSnap.data();
            const yearVal = data.name || yearId;

            // Simple parser: assumes name format might be "Genre Category" or just "Category"
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

    toggleYearLock: async (yearId, locked) => {
        await updateDoc(doc(db, 'years', yearId), { locked });
    },

    updateCategory: async (yearId, categoryId, newName) => {
        const yearRef = doc(db, 'years', yearId);
        const yearSnap = await getDoc(yearRef);
        if (yearSnap.exists()) {
            const categories = (yearSnap.data().categories || []).map(c =>
                c.id === categoryId ? { ...c, name: newName } : c
            );
            await updateDoc(yearRef, { categories });
        }
    },

    deleteCategory: async (yearId, categoryId) => {
        const yearRef = doc(db, 'years', yearId);
        const yearSnap = await getDoc(yearRef);
        if (yearSnap.exists()) {
            const categories = (yearSnap.data().categories || []).filter(c => c.id !== categoryId);
            await updateDoc(yearRef, { categories });
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

    // Judge Actions
    addJudge: async (yearId, email, name) => {
        const lowerEmail = email.toLowerCase();
        await setDoc(doc(db, 'judges', `${yearId}_${lowerEmail}`), { yearId, email: lowerEmail, name });
    },

    removeJudge: async (yearId, email) => {
        await deleteDoc(doc(db, 'judges', `${yearId}_${email.toLowerCase()}`));
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

        // Derive granular info
        const parts = categoryId.split('-');
        const year = parts[0];
        const genreAndCat = parts.slice(1).join(' ');

        await setDoc(doc(db, 'participants', `${categoryId}_${id}`), {
            id,
            categoryId,
            year,
            genre: genreAndCat.split(' ')[0] || 'General',
            category: genreAndCat.split(' ').slice(1).join(' ') || genreAndCat,
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
    exportData: () => {
        const state = get();
        const exportObj = {
            version: "1.3", // Version bump
            timestamp: new Date().toISOString(),
            years: state.years,
            participants: state.participants,
            judgesByYear: state.judgesByYear,
            admins: state.admins,
            scores: state.scores,
            // Consolidate all settings
            settings: {
                general: { competitionName: state.competitionName },
                scoring: { items: state.scoringItems },
                // scoringItems is kept for backward compatibility if needed, but we use settings.scoring primary
                scoringItems: state.scoringItems
            }
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `score_program_backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    },

    importData: async (jsonData, mode = 'merge') => {
        try {
            const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            const batch = writeBatch(db);

            // 1. Clear existing data if mode is 'replace'
            if (mode === 'replace') {
                // DO NOT delete 'settings' blindly, as it contains scoring/general config that might not be in JSON
                const collections = ['years', 'participants', 'judges', 'scores', 'admins', 'scoringItems'];
                for (const collName of collections) {
                    const snap = await getDocs(collection(db, collName));
                    snap.docs.forEach(doc => batch.delete(doc.ref));
                }

                // Explicitly handle settings docs if needed, or leave them to be overwritten
                // If we want to ensure "clean slate" for settings, we should only delete if we have new data?
                // For now, let's play safe: Don't delete settings unless overwritten.
            }

            // 2. Import Years & Categories
            if (data.years) {
                data.years.forEach(year => {
                    batch.set(doc(db, 'years', year.id), year);
                });
            }

            // 3. Import Participants
            if (data.participants) {
                // Handle both flat array or object grouped by cat
                const pList = Array.isArray(data.participants)
                    ? data.participants
                    : Object.values(data.participants).flat();

                pList.forEach(p => {
                    if (!p.id || !p.categoryId) return;
                    const parts = p.categoryId.split('-');
                    const docId = `${p.categoryId}_${p.id}`;

                    // Ensure granular fields even if missing in JSON
                    const pData = {
                        ...p,
                        year: p.year || parts[0],
                        genre: p.genre || (parts.slice(1).join(' ').split(' ')[0] || 'General'),
                        category: p.category || (parts.slice(1).join(' ').split(' ').slice(1).join(' ') || parts.slice(1).join(' '))
                    };
                    batch.set(doc(db, 'participants', docId), pData);
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

            // 5 & 6. Import Settings (General & Scoring)
            if (data.settings) {
                // If it's the new nested structure
                if (data.settings.general) {
                    batch.set(doc(db, 'settings', 'general'), data.settings.general);
                }
                if (data.settings.scoring) {
                    batch.set(doc(db, 'settings', 'scoring'), data.settings.scoring);
                }
                // Handle competition settings
                if (data.settings.competition) {
                    batch.set(doc(db, 'settings', 'competition'), data.settings.competition);
                } else if (!data.settings.general && !data.settings.scoring) {
                    // Legacy structure where data.settings was the competition doc itself
                    batch.set(doc(db, 'settings', 'competition'), data.settings);
                }
            } else if (data.scoringItems) {
                // Backward compatibility for old JSON (v1.2 or earlier)
                batch.set(doc(db, 'settings', 'scoring'), { items: data.scoringItems });
            }



            // 7. Import Scores
            if (data.scores) {
                // scores map: { [catId]: { [pId]: { [email]: values } } }
                Object.entries(data.scores).forEach(([catId, pMap]) => {
                    Object.entries(pMap).forEach(([pId, judgeMap]) => {
                        Object.entries(judgeMap).forEach(([email, values]) => {
                            // Reconstruct ID: catId_pId_email
                            const scoreId = `${catId}_${pId}_${email.toLowerCase()}`;
                            const scoreData = {
                                categoryId: catId,
                                participantId: pId,
                                judgeEmail: email.toLowerCase(),
                                values: values,
                                updatedAt: new Date().toISOString()
                            };
                            batch.set(doc(db, 'scores', scoreId), scoreData);
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

    // Data Normalization Tool
    normalizeDatabase: async () => {
        const batch = writeBatch(db);
        let updateCount = 0;

        // 1. Normalize Judges
        const judgesSnap = await getDocs(collection(db, 'judges'));
        judgesSnap.docs.forEach(docSnap => {
            const data = docSnap.data();
            const lowerEmail = data.email.toLowerCase();
            const correctId = `${data.yearId}_${lowerEmail}`;

            if (docSnap.id !== correctId || data.email !== lowerEmail) {
                batch.delete(docSnap.ref);
                batch.set(doc(db, 'judges', correctId), {
                    ...data,
                    email: lowerEmail
                });
                updateCount++;
            }
        });

        // 2. Normalize Admins
        const adminsSnap = await getDocs(collection(db, 'admins'));
        adminsSnap.docs.forEach(docSnap => {
            const data = docSnap.data();
            const lowerEmail = data.email.toLowerCase();

            if (docSnap.id !== lowerEmail || data.email !== lowerEmail) {
                batch.delete(docSnap.ref);
                batch.set(doc(db, 'admins', lowerEmail), {
                    ...data,
                    email: lowerEmail
                });
                updateCount++;
            }
        });

        // 3. Normalize Scores
        const scoresSnap = await getDocs(collection(db, 'scores'));
        scoresSnap.docs.forEach(docSnap => {
            const data = docSnap.data();
            const parts = docSnap.id.split('_');

            if (parts.length >= 3) {
                const catId = parts[0];
                const pId = parts[1];
                const emailPart = parts.slice(2).join('_');
                const lowerEmail = emailPart.toLowerCase();
                const correctId = `${catId}_${pId}_${lowerEmail}`;

                // Check if ID is wrong OR internal field is wrong
                if (docSnap.id !== correctId || data.judgeEmail !== lowerEmail) {
                    batch.delete(docSnap.ref);
                    batch.set(doc(db, 'scores', correctId), {
                        ...data,
                        judgeEmail: lowerEmail
                    });
                    updateCount++;
                }
            }
        });

        if (updateCount > 0) {
            await batch.commit();
        }
        return updateCount;
    },

    clearAllData: async () => {
        if (!window.confirm("정말로 모든 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
        const batch = writeBatch(db);
        const collections = ['years', 'participants', 'judges', 'scores', 'admins', 'settings', 'scoringItems'];
        for (const collName of collections) {
            const snap = await getDocs(collection(db, collName));
            snap.docs.forEach(doc => batch.delete(doc.ref));
        }
        await batch.commit();
        alert("모든 데이터가 삭제되었습니다.");
    },

    batchUpdateParticipants: async (categoryId, updates) => {
        const batch = writeBatch(db);
        updates.forEach(update => {
            const ref = doc(db, 'participants', `${categoryId}_${update.id}`);
            batch.update(ref, update);
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

        // Note: Firestore doesn't have a direct "delete where" for collections.
        // For a full production app, we would use a Cloud Function.
        // For this test tool, we'll fetch and delete.
        const q = query(collection(db, 'scores'));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.docs.forEach(d => {
            if (d.id.startsWith(yearId)) {
                batch.delete(d.ref);
            }
        });
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

        // Sync Years
        onSnapshot(collection(db, 'years'), (snapshot) => {
            const years = snapshot.docs.map(doc => doc.data());
            set({ years: years.sort((a, b) => b.name.localeCompare(a.name)) });
            if (years.length === 0) get().initDefaults();
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
        const defaultCats = [
            'Salsa Couple', 'Bachata Couple', 'Salsa Shine Solo Man',
            'Salsa Shine Solo Woman', 'Salsa Shine Duo', 'Bachata Shine Duo',
            'Salsa Group', 'Bachata Group', 'Senior 종합'
        ];
        const years = ['2024', '2025', '2026'];

        for (const year of years) {
            const id = year;
            const categories = defaultCats.map((name, i) => ({
                id: `${id}-${name.toLowerCase().replace(/\s+/g, '-')}`,
                name,
                order: i
            }));
            await setDoc(doc(db, 'years', id), { id, name: year, categories, locked: false });
        }
    }
}));

export default useStore;

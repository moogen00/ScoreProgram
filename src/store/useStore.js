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
    selectedCompId: '', // Currently selected competition for dashboard/admin
    scoringItems: [],
    judgesByComp: {}, // { compId: [judgeObjs] }
    participants: {}, // { catId: [participantObjs] }
    scores: {}, // { catId: { pId: { email: values } } }

    adminTab: 'scoring',

    // 인증 관련 액션 (로그인 처리)
    login: (userData) => {
        // 사용자 데이터에 역할(role)이 있으면 사용 (예: Spectator), 없으면 기본값 USER
        const role = userData.role || 'USER';
        // Normalize email to lowercase and trim
        const normalizedData = {
            ...userData,
            email: userData.email.toLowerCase().trim(),
            role
        };
        const userToStore = { ...normalizedData, lastLoginAt: Date.now() };
        set({ currentUser: normalizedData });
        localStorage.setItem('score_program_user', JSON.stringify(userToStore));
        get().syncUserRole();

        // Force refresh scores to ensure we get data if rules were restrictive before login
        get().refreshScores();
        // Start syncing user permissions
        get().syncUserSpecificData();
    },
    // 로그아웃 처리
    logout: () => {
        set({ currentUser: null });
        localStorage.removeItem('score_program_user');

        // Clean up all subscriptions on logout
        const { unsubScores, unsubParticipants, unsubJudges } = get();
        if (unsubScores) unsubScores();
        if (unsubParticipants) unsubParticipants();
        if (unsubJudges) unsubJudges();

        set({
            scores: {},
            participants: {},
            judgesByComp: {},
            unsubScores: null,
            unsubParticipants: null,
            unsubJudges: null,
            currentSyncedCompId: null,
            currentSyncedCatId: null,

            // Reset Navigation to Default
            activeView: null,
            selectedCategoryId: '',
            adminTab: 'scoring'
        });

        // Also clear history state to prevent back-button confusion
        window.history.replaceState(null, '', window.location.pathname);
    },

    // 사용자 역할(Role) 동기화 및 권한 부여
    // 1. Root Admin 확인
    // 2. 일반 Admin 확인
    // 3. 심사위원(Judge) 확인 및 배정된 대회 목록 갱신
    syncUserRole: () => {
        const { currentUser, judgesByComp, admins, competitions } = get();
        if (!currentUser) return;

        // Dev Mode Mock Judge
        if (import.meta.env.DEV && currentUser.email === 'judge@example.com') {
            const mockRole = 'JUDGE';
            const mockAssigned = competitions.map(c => c.id);
            if (currentUser.role !== mockRole || (currentUser.assignedCompetitions || []).length !== mockAssigned.length) {
                set({ currentUser: { ...currentUser, role: mockRole, assignedCompetitions: mockAssigned, name: 'Mock Judge' } });
            }
            return;
        }

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
                    // Standardize ID: use underscores instead of dots in email
                    const safeEmail = currentUser.email.replace(/\./g, '_');
                    setDoc(doc(db, 'judges', `${yId}_${safeEmail}`), {
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
            console.log(`[Auth Sync] Email: "${currentUser.email}" (len: ${currentUser.email.length}) -> Found Role: ${role}, Name: ${finalName}`);
            console.log(`[Auth Sync] Debug: Admin Found: ${!!adminEntry}, Judge Found: ${assignedCompetitions.length > 0}`);
        }
    },

    // 설정 관련 액션
    // 대회명 설정
    setCompetitionName: async (name) => {
        await setDoc(doc(db, 'settings', 'general'), { competitionName: name }, { merge: true });
    },
    // 현재 선택된 종목 ID 설정 (URI 상태 동기화 포함)
    setSelectedCategoryId: (id) => {
        const prevId = get().selectedCategoryId;
        if (prevId === id) return;

        set({ selectedCategoryId: id });
        window.history.pushState({
            activeView: get().activeView,
            selectedCategoryId: id,
            adminTab: get().adminTab
        }, '');

        // Trigger Category-level Score Sync
        if (id) {
            get().syncCategoryScores(id);

            // Also ensure the parent competition data is synced
            const comp = get().competitions.find(c => (c.categories || []).some(cat => cat.id === id));
            if (comp) {
                get().syncCompetitionData(comp.id);
            }
        }
    },
    // 활성화된 뷰(화면) 설정 (URI 상태 동기화 포함)
    setActiveView: (view) => {
        set({ activeView: view });
        window.history.pushState({
            activeView: view,
            selectedCategoryId: get().selectedCategoryId,
            adminTab: get().adminTab
        }, '');
    },
    // 관리자 패널 탭 설정 (URI 상태 동기화 포함)
    setAdminTab: (tab) => {
        set({ adminTab: tab });
        window.history.pushState({
            activeView: get().activeView,
            selectedCategoryId: get().selectedCategoryId,
            adminTab: tab
        }, '');
    },

    setSelectedCompId: (id) => {
        set({ selectedCompId: id });
        if (id) {
            localStorage.setItem('score_program_selected_comp_id', id);
        } else {
            localStorage.removeItem('score_program_selected_comp_id');
        }
    },
    // 네비게이션 상태 초기화
    resetNavigation: () => {
        set({ activeView: null, selectedCategoryId: '', adminTab: 'scoring' });
        window.history.pushState({
            activeView: null,
            selectedCategoryId: '',
            adminTab: 'scoring'
        }, '');
    },

    // 점수 입력/수정 액션 (실시간 DB 업데이트)
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

    // 카테고리별 점수 일괄 제출 (저장 및 제출 상태 변경)
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

        if (!compId) {
            console.error('[Store] submitCategoryScores: compId not found for category', categoryId, 'in competitions:', competitions.length);
            return;
        }

        console.log(`[Store] submitCategoryScores START: ${categoryId}, email: ${currentUser.email}`);
        const batch = writeBatch(db);
        const email = currentUser.email.toLowerCase().trim();

        // 1. Update Scores
        // scoresMap is { [participantId]: { [itemId]: value } }
        const currentParticipants = get().participants[categoryId] || [];
        let opCount = 0;
        for (const [pId, values] of Object.entries(scoresMap)) {
            const pObj = currentParticipants.find(p => p.id === pId);

            // Critical Fix: Skip if participant is not in the current category list
            // This prevents "Zombie Scores" from previous categories from being saved
            if (!pObj) {
                console.warn(`[Store] Skipping orphan score for pId=${pId} in category=${categoryId}`);
                continue;
            }

            const pName = pObj.name;

            const docId = `${categoryId}_${pId}_${email}`;
            const scoreRef = doc(db, 'scores', docId);

            batch.set(scoreRef, {
                competition: compName,
                genre: genre,
                category: category,
                categoryId,
                participantId: pId,
                participantName: pName,
                judgeEmail: email,
                values: values,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            opCount++;
        }

        // 2. Mark as Submitted in Judge's record
        const safeEmail = email.replace(/\./g, '_');
        const judgeRef = doc(db, 'judges', `${compId}_${safeEmail}`);
        batch.set(judgeRef, {
            submittedCategories: {
                [categoryId]: true
            }
        }, { merge: true });
        opCount++;

        // Optimistic Update for UI responsiveness
        const { judgesByComp } = get();
        const currentJudges = judgesByComp[compId] || [];
        const updatedJudges = currentJudges.map(j => {
            if (j.email === email) {
                return {
                    ...j,
                    submittedCategories: {
                        ...(j.submittedCategories || {}),
                        [categoryId]: true
                    }
                };
            }
            return j;
        });
        set(state => ({
            judgesByComp: {
                ...state.judgesByComp,
                [compId]: updatedJudges
            }
        }));

        console.log(`[Store] Committing batch for ${opCount} operations...`);
        await batch.commit();
        console.log('[Store] submitCategoryScores SUCCESS');

        // 점수 제출 후 순위 재계산 및 DB 업데이트
        await get().updateCategoryRanks(categoryId);
    },

    // 심사위원 제출 상태 토글 (제출 취소 및 수정 모드 전환)
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

        console.log(`[Store] toggleJudgeSubmission START: ${categoryId} -> ${isSubmitted}`);
        const email = currentUser.email.toLowerCase().trim();
        const safeEmail = email.replace(/\./g, '_');
        const judgeRef = doc(db, 'judges', `${compId}_${safeEmail}`);

        // Use batch for consistency with submitCategoryScores
        const batch = writeBatch(db);
        batch.set(judgeRef, {
            submittedCategories: {
                [categoryId]: isSubmitted
            }
        }, { merge: true });

        // Optimistic Update for UI responsiveness
        const { judgesByComp: currentJudgesByComp } = get();
        const currentJudgesList = currentJudgesByComp[compId] || [];
        const updatedJudgesList = currentJudgesList.map(j => {
            if (j.email === email) {
                return {
                    ...j,
                    submittedCategories: {
                        ...(j.submittedCategories || {}),
                        [categoryId]: isSubmitted
                    }
                };
            }
            return j;
        });
        set(state => ({
            judgesByComp: {
                ...state.judgesByComp,
                [compId]: updatedJudgesList
            }
        }));

        await batch.commit();
        console.log(`[Store] toggleJudgeSubmission SUCCESS: ${categoryId} -> ${isSubmitted}`);

        // 제출 상태 변경 후 순위 재계산 및 DB 업데이트
        await get().updateCategoryRanks(categoryId);
    },

    // 관리 관련 액션
    // 새로운 채점 항목 추가 (대회별)
    addScoringItem: async (compId, label) => {
        const item = {
            id: Math.random().toString(36).substr(2, 9),
            label,
            order: 999 // Append to end, reordering handles exact order
        };

        const compRef = doc(db, 'competitions', compId);
        const compSnap = await getDoc(compRef);
        if (compSnap.exists()) {
            const currentItems = compSnap.data().scoringItems || [];
            item.order = currentItems.length;
            await updateDoc(compRef, { scoringItems: [...currentItems, item] });
        }
    },

    // 채점 항목 삭제 (대회별)
    removeScoringItem: async (compId, itemId) => {
        const compRef = doc(db, 'competitions', compId);
        const compSnap = await getDoc(compRef);
        if (compSnap.exists()) {
            const currentItems = compSnap.data().scoringItems || [];
            const newItems = currentItems.filter(item => item.id !== itemId);
            await updateDoc(compRef, { scoringItems: newItems });
        }
    },

    // 채점 항목 순서 변경 (대회별)
    updateScoringItemOrder: async (compId, newItems) => {
        const compRef = doc(db, 'competitions', compId);
        await updateDoc(compRef, { scoringItems: newItems });
    },

    // 계층 구조(대회) 관리 액션
    // 새 대회 추가
    addCompetition: async (name) => {
        const id = Math.random().toString(36).substr(2, 9);
        const comp = {
            id,
            name,
            locked: false,
            createdAt: new Date().toISOString(),
            categories: [],
            // Initialize with Default Scoring Items
            scoringItems: [
                { id: Math.random().toString(36).substr(2, 9), label: '베이직 턴 기술부분', order: 0 },
                { id: Math.random().toString(36).substr(2, 9), label: '음악 타이밍등 뮤지컬리티', order: 1 },
                { id: Math.random().toString(36).substr(2, 9), label: '안무 표현등의 예술부문', order: 2 }
            ]
        };
        await setDoc(doc(db, 'competitions', id), comp);
    },

    // 대회명 수정 (하위 데이터 일괄 업데이트 포함)
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

    // 대회 삭제 (하위 모든 데이터 - 심사위원, 참가자, 점수 포함 삭제)
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

    // 종목(Category) 추가
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

    // 종목 순서 이동 (위/아래)
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

    // 종목 이름순 정렬
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

    // 대회 잠금/해제 토글 (하위 모든 종목 잠금 상태 동기화)
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

            // Sync to database
            await updateDoc(compRef, {
                locked: isLocked,
                categories: updatedCategories
            });
        }
    },

    // 종목 잠금/해제 개별 토글
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

    // We need to correct the replacement to cover the range.


    // 종목 정보 수정 (이름 변경 등)
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

    // 종목 삭제 (관련된 점수, 참가자 데이터 삭제 포함)
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

    // 종목 순서 일괄 업데이트
    updateCategoriesOrder: async (compId, newCategories) => {
        const compRef = doc(db, 'competitions', compId);
        // Ensure to save normalized categories with correct order indexes
        const normalized = newCategories.map((cat, index) => ({
            ...cat,
            order: index
        }));
        await updateDoc(compRef, { categories: normalized });
    },




    // 심사위원 관련 액션
    // 심사위원 추가
    addJudge: async (compId, email, name) => {
        const lowerEmail = email.toLowerCase();
        const safeEmail = lowerEmail.replace(/\./g, '_');
        await setDoc(doc(db, 'judges', `${compId}_${safeEmail}`), { compId, email: lowerEmail, name });
    },

    // 심사위원 삭제
    removeJudge: async (compId, email) => {
        const safeEmail = email.toLowerCase().replace(/\./g, '_');
        await deleteDoc(doc(db, 'judges', `${compId}_${safeEmail}`));
    },

    // 심사위원 이름 수정
    updateJudgeName: async (compId, email, newName) => {
        const safeEmail = email.toLowerCase().replace(/\./g, '_');
        await updateDoc(doc(db, 'judges', `${compId}_${safeEmail}`), { name: newName });
    },

    // 심사위원 익명화 (점수 보존을 위해 삭제 대신 이름만 변경)
    anonymizeJudge: async (compId, email) => {
        const safeEmail = email.toLowerCase().replace(/\./g, '_');
        const judgeRef = doc(db, 'judges', `${compId}_${safeEmail}`);
        // Only update the name, keep everything else (email, compId, submitted status)
        await setDoc(judgeRef, { name: '알수 없음' }, { merge: true });
    },

    // 관리자(Admin) 관리 액션
    // 관리자 추가
    addAdmin: async (email, name) => {
        const lowerEmail = email.toLowerCase();
        await setDoc(doc(db, 'admins', lowerEmail), { email: lowerEmail, name });
    },

    // 관리자 삭제
    removeAdmin: async (email) => {
        await deleteDoc(doc(db, 'admins', email.toLowerCase()));
    },

    // 참가자 관련 액션
    // 참가자 추가
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
            totalScore: 0,      // Real-time Total Score
            calculatedRank: null, // Real-time Calculated Rank
            finalRank: null,      // Admin-confirmed Final Rank
            createdAt: new Date().toISOString()
        });
    },

    // 참가자 정보 수정 (이름, 번호, 순위 등)
    updateParticipant: async (categoryId, participantId, updates) => {
        const docRef = doc(db, 'participants', `${categoryId}_${participantId}`);
        const safeUpdates = { ...updates };

        // Ensure rank is handled correctly if present
        // (We don't need special parsing if we trust the input, but let's be safe if it comes from UI text input)
        if (safeUpdates.rank !== undefined) {
            if (safeUpdates.rank === '' || safeUpdates.rank === null) {
                safeUpdates.rank = null;
            } else {
                // Try to keep it as number if possible, or string if user really wants string?
                // Plan said Number.
                safeUpdates.rank = parseInt(safeUpdates.rank, 10);
            }
        }

        await updateDoc(docRef, safeUpdates);
    },

    // 특정 대회의 모든 참가자 가져오기
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

    // 데이터 관리 액션 (Import/Export)
    // 전체 데이터 내보내기 (JSON 다운로드)
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

    // 데이터 가져오기 (JSON 파일)
    importData: async (jsonData, mode = 'merge') => {
        try {
            const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            const batch = writeBatch(db);

            // 1. Clear existing data if mode is 'replace'
            // 1. Clear existing data if mode is 'replace'
            if (mode === 'replace') {
                const collections = ['competitions', 'years', 'participants', 'judges', 'scores'];
                // Clean standard collections
                for (const collName of collections) {
                    const snap = await getDocs(collection(db, collName));
                    const deletePromises = snap.docs.map(doc => deleteDoc(doc.ref));
                    await Promise.all(deletePromises);
                }

                // Special handling for 'admins': Preserve ROOT_ADMIN
                const adminSnap = await getDocs(collection(db, 'admins'));
                const { currentUser } = get();
                const rootEmail = 'baramnomad@gmail.com'; // Hardcoded backup or env
                const currentEmail = currentUser?.email?.toLowerCase();

                const adminDeletePromises = [];
                adminSnap.docs.forEach(doc => {
                    const adminEmail = doc.id.toLowerCase();
                    // Prevent deleting the Root Admin (hardcoded) or the Current User (if they are doing the reset)
                    // This prevents locking oneself out.
                    if (adminEmail === rootEmail || (currentEmail && adminEmail === currentEmail)) {
                        console.log(`[Store] Preserving Admin: ${adminEmail}`);
                        return;
                    }
                    adminDeletePromises.push(deleteDoc(doc.ref));
                });
                await Promise.all(adminDeletePromises);
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

            // 2.1 Import Settings (General Only)
            if (data.settings) {
                if (data.settings.general) {
                    batch.set(doc(db, 'settings', 'general'), data.settings.general);
                }
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



            // Restore Root Admin(s) from .env
            const rootEmails = (import.meta.env.VITE_ROOT_ADMIN_EMAILS || '').split(',').map(e => e.trim());
            for (const email of rootEmails) {
                if (email) {
                    settingsBatch.set(doc(db, 'admins', email), {
                        email: email,
                        role: 'ROOT_ADMIN',
                        createdAt: new Date().toISOString()
                    });
                }
            }

            await settingsBatch.commit();

            // Clear local state immediately to prevent sync logic from using stale data
            set({
                competitions: [],
                judgesByComp: {},
                participants: {},
                scores: {},
                activeView: null,
                selectedCategoryId: ''
            });

            set({ resetStatus: '데이터 정제 완료' });
            console.log('[Store] Full Database Reset complete.');
            set({ resetStatus: '완료!' });
            alert('데이터베이스가 성공적으로 초기화되었습니다. 안전한 데이터 갱신을 위해 페이지가 새로고침됩니다.');
            window.location.reload(); // Force reload for a clean slate
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
            { coll: 'judges', idField: (data) => `${data.compId || data.yearId}_${data.email.toLowerCase().trim()}`, emailField: 'email' },
            { coll: 'admins', idField: (data) => data.email.toLowerCase().trim(), emailField: 'email' }
        ];

        for (const cfg of collections) {
            const snap = await getDocs(collection(db, cfg.coll));
            snap.docs.forEach(docSnap => {
                const data = docSnap.data();
                const lowerEmail = (data[cfg.emailField] || '').toLowerCase().trim();
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
                const emailPart = parts.slice(2).join('_').toLowerCase().trim();
                const correctId = `${parts[0]}_${parts[1]}_${emailPart}`;
                if (docSnap.id !== correctId || (data.judgeEmail || '').toLowerCase().trim() !== emailPart) {
                    batch.delete(docSnap.ref);
                    batch.set(doc(db, 'scores', correctId), { ...data, judgeEmail: emailPart });
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

    // 종목 내 모든 참가자의 순위 재계산 및 업데이트 (제출 시 호출용)
    updateCategoryRanks: async (categoryId) => {
        const { participants, scores, judgesByComp, competitions } = get();
        const pList = participants[categoryId] || [];
        const catScores = scores[categoryId] || {};

        if (pList.length === 0) return;

        // Get compId for this category
        const comp = competitions.find(c => c.categories?.some(cat => cat.id === categoryId));
        const compId = comp?.id;
        const judges = judgesByComp[compId] || [];
        const activeJudgeEmails = judges.map(j => j.email.toLowerCase().trim());

        // 1. 각 참가자별 평균 점수 계산 (전체 등록된 심사위원 기준)
        const scored = pList.map(p => {
            const pScores = catScores[p.id] || {};

            // 등록된 전체 심사위원 목록을 기준으로 계산
            const totalSum = activeJudgeEmails.reduce((acc, email) => {
                const itemScores = pScores[email] || {};
                const judgeTotal = Object.values(itemScores).reduce((sum, val) => {
                    const num = parseFloat(val);
                    return isNaN(num) ? sum : sum + num;
                }, 0);
                return acc + judgeTotal;
            }, 0);

            // 분모를 '실제 채점한 심사위원 수'가 아닌 '등록된 전체 심사위원 수'로 설정
            const judgeCount = activeJudgeEmails.length;
            const average = judgeCount > 0 ? totalSum / judgeCount : 0;
            return { ...p, average };
        });

        // 2. 점수 내림차순 정렬 (자동 순위 결정용)
        scored.sort((a, b) => b.average - a.average);

        // 3. 순위 결정 (Standard Competition Ranking: 1224)
        // 3. 순위 결정 (Standard Competition Ranking: 1224)
        const newRanks = new Map();
        let currentRank = 1;
        scored.forEach((p, idx) => {
            if (idx > 0 && Math.abs(p.average - scored[idx - 1].average) > 0.0001) {
                currentRank = idx + 1;
            }
            newRanks.set(p.id, p.average > 0 ? Math.floor(currentRank) : null);
        });

        // 4. DB 업데이트 (Batch)
        const batch = writeBatch(db);
        scored.forEach(p => {
            const calcR = newRanks.get(p.id);
            const totS = parseFloat(p.average.toFixed(4));

            // finalRank가 없는(자동 순위) 경우에만 변경 사항 업데이트
            // (사실 calculatedRank와 totalScore는 항상 최신화 해두는 것이 리더보드 등에서 유리함)
            batch.update(doc(db, 'participants', `${categoryId}_${p.id}`), {
                calculatedRank: calcR,
                totalScore: totS
            });
        });

        await batch.commit();
        console.log(`[Store] Category ${categoryId} ranks updated successfully.`);
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
        const { competitions, participants } = get();
        const comp = competitions.find(c => c.id === compId);
        if (!comp) return;

        // Use competition's scoring items or defaults
        const currentScoringItems = (comp.scoringItems && comp.scoringItems.length > 0)
            ? comp.scoringItems
            : [
                { id: 'default_1', label: 'Tech' },
                { id: 'default_2', label: 'Music' },
                { id: 'default_3', label: 'Art' }
            ];

        const batch = writeBatch(db);
        const mockJudges = [
            { email: 'kylevamos00@gmail.com', name: '박시홍' },
            { email: 'ilrujer@gmail.com', name: '염은영' }
        ];

        for (const cat of comp.categories) {
            const catParticipants = participants[cat.id] || [];

            // Also ensure these judges are registered for the competition in the DB
            for (const judge of mockJudges) {
                const safeEmail = judge.email.toLowerCase().replace(/\./g, '_');
                const judgeRef = doc(db, 'judges', `${compId}_${safeEmail}`);
                batch.set(judgeRef, { compId, email: judge.email, name: judge.name });
            }

            for (const p of catParticipants) {
                for (const judge of mockJudges) {
                    const safeEmail = judge.email.toLowerCase().replace(/\./g, '_');
                    const docId = `${cat.id}_${p.id}_${safeEmail}`;
                    const scoreRef = doc(db, 'scores', docId);
                    const values = {};
                    currentScoringItems.forEach(item => {
                        // Generate random score between 5.5 and 9.9 for realism (matching UI limits)
                        values[item.id] = parseFloat((Math.random() * 4.4 + 5.5).toFixed(1));
                    });

                    batch.set(scoreRef, {
                        competition: comp.name,
                        genre: cat.genre || 'General',
                        category: cat.category || cat.name,
                        categoryId: cat.id,
                        participantId: p.id,
                        participantName: p.name || '',
                        judgeEmail: judge.email,
                        values,
                        updatedAt: new Date().toISOString()
                    });
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

    // Firebase Initialization & Sync (Optimized for Quota)
    // Subscription handles
    unsubScores: null,
    unsubCompScores: null, // Subscriptions for competition-wide score sync
    unsubParticipants: null,
    unsubJudges: null,
    currentSyncedCompId: null, // Track current competition sync
    currentSyncedCompScoresId: null, // Track current competition scores sync
    currentSyncedCatId: null,  // Track current category score sync

    // 1. Competition-level Sync: Judges & Participants
    syncCompetitionData: (compId) => {
        const { unsubParticipants, unsubJudges, currentSyncedCompId } = get();

        // Allow re-sync if ID matches but listeners are missing (e.g. categories loaded later)
        if (currentSyncedCompId === compId && unsubParticipants) return;

        console.log(`[Sync] Switching Competition Data sync to: ${compId}`);

        // Clean up previous competition-level subs
        if (unsubParticipants) unsubParticipants();
        if (unsubJudges) unsubJudges();

        // Sync ALL Judges for THIS competition (Admins Only to avoid permission errors for judges)
        const user = get().currentUser;
        const isAdmin = user?.role === 'ADMIN' || user?.role === 'ROOT_ADMIN';

        let unsubJ = () => { };
        if (isAdmin) {
            console.log(`[Sync] Triggering Competition-wide Judge sync for Admin: ${compId}`);
            const qJudges = query(collection(db, 'judges'), where('compId', '==', compId));
            unsubJ = onSnapshot(qJudges, (snapshot) => {
                const list = [];
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const email = (data.email || '').toLowerCase().trim();
                    const compId = data.compId || data.yearId;

                    // Filter Ghost Records
                    const safeEmail = email.replace(/\./g, '_');
                    const expectedId = `${compId}_${safeEmail}`;
                    if (doc.id !== expectedId) return;

                    list.push({ ...data, email });
                });

                set(state => {
                    const newJudgesByComp = { ...state.judgesByComp, [compId]: list };
                    return { judgesByComp: newJudgesByComp };
                });
                get().syncUserRole();
            }, (error) => console.error('[Sync] Admin Judges sync error:', error));
        }

        // Sync Participants for THIS competition
        // Using 'in' query for categories (limited to 30)
        const { competitions } = get();
        const comp = competitions.find(c => c.id === compId);
        const catIds = (comp?.categories || []).map(c => c.id);

        let unsubP = () => { };
        if (catIds.length > 0) {
            // Firestore 'in' limit is 30. If more, we'd need chunks.
            const chunks = [];
            for (let i = 0; i < catIds.length; i += 30) {
                chunks.push(catIds.slice(i, i + 30));
            }

            const unsubs = chunks.map(chunk => {
                const qParts = query(collection(db, 'participants'), where('categoryId', 'in', chunk));
                return onSnapshot(qParts, (snapshot) => {
                    set(state => {
                        const newParticipants = { ...state.participants };

                        snapshot.docChanges().forEach(change => {
                            const p = change.doc.data();
                            const docId = change.doc.id;
                            const pId = p.id || docId.split('_').pop();
                            const catId = p.categoryId;

                            // Ensure array exists
                            if (!newParticipants[catId]) newParticipants[catId] = [];

                            if (change.type === "added" || change.type === "modified") {
                                // Update or Add
                                const list = newParticipants[catId].filter(item => item.id !== pId);
                                list.push({ ...p, id: pId });
                                newParticipants[catId] = list;
                            }
                            if (change.type === "removed") {
                                // Remove
                                newParticipants[catId] = newParticipants[catId].filter(item => item.id !== pId);
                            }
                        });
                        return { participants: newParticipants };
                    });
                }, (error) => console.error('[Sync] Participants sync error:', error));
            });
            unsubP = () => unsubs.forEach(u => u());
        }

        set({
            unsubParticipants: unsubP,
            unsubJudges: unsubJ,
            currentSyncedCompId: compId
        });
    },

    // 2. Category-level Sync: Scores
    syncCategoryScores: (catId) => {
        const { unsubScores, currentSyncedCatId } = get();
        if (currentSyncedCatId === catId) return;

        console.log(`[Sync] Switching Category Score sync to: ${catId}`);
        if (unsubScores) unsubScores();

        const qScores = query(collection(db, 'scores'), where('categoryId', '==', catId));
        const unsubS = onSnapshot(qScores, (snapshot) => {
            const categoryScores = {};
            snapshot.docs.forEach(docSnap => {
                const s = docSnap.data();
                const pId = s.participantId;
                const email = (s.judgeEmail || '').toLowerCase().trim();

                if (!categoryScores[pId]) categoryScores[pId] = {};
                categoryScores[pId][email] = s.values;
            });

            set(state => ({
                scores: { ...state.scores, [catId]: categoryScores }
            }));
        });

        set({
            unsubScores: unsubS,
            currentSyncedCatId: catId
        });
    },

    // 2.1 Competition-level Score Sync (Direct score sync for all categories in a competition)
    syncCompetitionScores: (compId) => {
        const { unsubCompScores, currentSyncedCompScoresId, competitions } = get();
        const comp = competitions.find(c => c.id === compId);
        const catIds = (comp?.categories || []).map(c => c.id);

        if (currentSyncedCompScoresId === compId && unsubCompScores && catIds.length > 0) return;

        console.log(`[Sync] Switching Competition Score sync to: ${compId}`);
        if (unsubCompScores) unsubCompScores();

        if (catIds.length === 0) {
            set({ unsubCompScores: null, currentSyncedCompScoresId: compId });
            return;
        }

        // Firestore 'in' limit is 30.
        const chunks = [];
        for (let i = 0; i < catIds.length; i += 30) {
            chunks.push(catIds.slice(i, i + 30));
        }

        const unsubs = chunks.map(chunk => {
            const qScores = query(collection(db, 'scores'), where('categoryId', 'in', chunk));
            return onSnapshot(qScores, (snapshot) => {
                set(state => {
                    // Optimized deep-ish copy to avoid mutation
                    const newScores = { ...state.scores };
                    snapshot.docs.forEach(docSnap => {
                        const s = docSnap.data();
                        const catId = s.categoryId;
                        const pId = s.participantId;
                        const email = (s.judgeEmail || '').toLowerCase().trim();

                        if (!newScores[catId]) {
                            newScores[catId] = {};
                        } else {
                            newScores[catId] = { ...newScores[catId] };
                        }

                        if (!newScores[catId][pId]) {
                            newScores[catId][pId] = {};
                        } else {
                            newScores[catId][pId] = { ...newScores[catId][pId] };
                        }

                        newScores[catId][pId][email] = s.values;
                    });
                    return { scores: newScores };
                });
            }, (error) => console.error('[Sync] Competition Scores sync error:', error));
        });

        set({
            unsubCompScores: () => unsubs.forEach(u => u()),
            currentSyncedCompScoresId: compId
        });
    },

    // Legacy refresh (can be removed or kept as proxy)
    refreshScores: () => {
        const { selectedCategoryId } = get();
        if (selectedCategoryId) get().syncCategoryScores(selectedCategoryId);
    },

    initSync: () => {
        const { isSyncInitialized } = get();
        if (isSyncInitialized) return;
        set({ isSyncInitialized: true });

        // Restore session from localStorage
        const savedUser = localStorage.getItem('score_program_user');
        if (savedUser) {
            try {
                const userData = JSON.parse(savedUser);
                const TWELVE_HOURS = 12 * 60 * 60 * 1000;

                if (Date.now() - userData.lastLoginAt < TWELVE_HOURS) {
                    const normalizedUser = { ...userData, email: (userData.email || '').toLowerCase().trim() };
                    set({ currentUser: normalizedUser });
                    console.log(`[Auth] Session restored for ${normalizedUser.email}`);
                } else {
                    console.log('[Auth] Session expired');
                    localStorage.removeItem('score_program_user');
                }
            } catch (e) {
                console.error('[Auth] Failed to restore session', e);
                localStorage.removeItem('score_program_user');
            }
        }

        // Restore selected competition
        const savedCompId = localStorage.getItem('score_program_selected_comp_id');
        if (savedCompId) {
            set({ selectedCompId: savedCompId });
        }

        // 1. Sync Global/Metadata Collections (Small read count)
        onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
            if (docSnap.exists()) {
                set({ competitionName: docSnap.data().competitionName || 'New Competition' });
            }
        });

        // Legacy 'settings/scoring' listener removed

        onSnapshot(collection(db, 'admins'), (snapshot) => {
            const admins = snapshot.docs.map(doc => ({ ...doc.data(), email: (doc.data().email || '').toLowerCase().trim() }));
            set({ admins });
            get().syncUserRole();
        });

        // 2. Sync Competitions List
        onSnapshot(collection(db, 'competitions'), (snapshot) => {
            const competitions = snapshot.docs.map(doc => doc.data());
            set({ competitions: competitions.sort((a, b) => b.name.localeCompare(a.name)) });
            set({ isInitialSyncComplete: true });
            get().syncUserRole();
        });

        // 3. User-Specific Judge Sync (Minimal read, critical for judge sidebar visibility)
        get().syncUserSpecificData();
    },

    // New Action: Sync User Specific Data (Judges)
    syncUserSpecificData: () => {
        const { currentUser, unsubJudges, competitions } = get();

        // Clean up existing subscription if any
        if (unsubJudges) {
            unsubJudges();
            set({ unsubJudges: null });
        }

        if (currentUser && currentUser.email) {
            console.log(`[Store] Starting User-Specific Sync for ${currentUser.email}`);
            const q = query(collection(db, 'judges'), where('email', '==', currentUser.email.toLowerCase().trim()));
            const unsub = onSnapshot(q, (snapshot) => {
                const grouped = {};
                snapshot.docs.forEach(doc => {
                    const j = doc.data();
                    const compId = j.compId || j.yearId;

                    // 1. Check if Competition Exists (Ghost Check)
                    // If the competition ID stored in the judge record is NOT in our active competitions list,
                    // it means the competition was deleted but this record survived. Prune it.
                    // (Ensure competitions list is populated first - isInitialSyncComplete ensures this mostly, but safe to check if competitions.length > 0)
                    const comps = get().competitions;
                    if (comps.length > 0 && compId && !comps.some(c => c.id === compId)) {
                        console.warn(`[Store] Found Orphan Judge Record (Comp Deleted): ${doc.id}. Auto-deleting...`);
                        deleteDoc(doc.ref);
                        return;
                    }

                    // 2. Format & Legacy Check
                    const safeEmail = j.email.toLowerCase().trim().replace(/\./g, '_');
                    const expectedId = `${compId}_${safeEmail}`;

                    if (doc.id !== expectedId) {
                        console.warn(`[Store] Skipping legacy/mismatch judge record: ${doc.id} (Expected: ${expectedId})`);
                        // Optional: delete legacy format if strictly enforcing?
                        // deleteDoc(doc.ref); 
                        return;
                    }

                    if (!grouped[compId]) grouped[compId] = [];
                    grouped[compId].push({ ...j, email: j.email.toLowerCase().trim() });
                });
                console.log(`[Store] User Judges Synced: found in ${Object.keys(grouped).length} competitions`);
                set(state => ({ judgesByComp: { ...state.judgesByComp, ...grouped } }));
                get().syncUserRole();
            });
            set({ unsubJudges: unsub });
        }
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

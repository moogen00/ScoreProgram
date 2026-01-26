import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Settings, List, Shield, Trophy, Layout, Users, UserPlus, Hash, User as UserIcon, SortAsc, Lock, Unlock, PenTool, FileUp, FileDown, Database, AlertTriangle, Check, LogOut, QrCode, X, RefreshCcw, Edit2 } from 'lucide-react';
import QRCode from "react-qr-code";
import useStore from '../store/useStore';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
    return twMerge(clsx(inputs));
}

const AdminPanel = () => {
    const {
        scoringItems, addScoringItem, removeScoringItem, updateScoringItemOrder,
        judgesByComp, addJudge, removeJudge, updateJudgeName, anonymizeJudge,
        participants, addParticipant, removeParticipant, updateParticipant, moveParticipants,
        selectedCategoryId, competitions, scores,
        addCategory, updateCategory, deleteCategory, moveCategory, sortCategoriesByName, toggleCompetitionLock,
        admins, addAdmin, removeAdmin, competitionName, setCompetitionName,
        seedRandomScores, clearCompetitionScores,
        exportData, importData, clearAllData, normalizeDatabase, fixLockedProperties,
        currentUser, syncCompetitionData,
        adminTab, setAdminTab,
        isResetting, resetStatus, isExporting
    } = useStore();

    // 폼 입력 상태 (새로운 데이터 추가용)
    const [newItemLabel, setNewItemLabel] = useState('');
    const [newJudgeEmail, setNewJudgeEmail] = useState('');
    const [newJudgeName, setNewJudgeName] = useState('');
    const [newPNumber, setNewPNumber] = useState('');
    const [newPName, setNewPName] = useState('');

    // 심사위원 수정 상태
    const [editingJudgeEmail, setEditingJudgeEmail] = useState(null);
    const [tempJudgeName, setTempJudgeName] = useState('');

    // 관리 대상 선택 상태 (대회 및 종목)
    const [manageCompId, setManageCompId] = useState('');
    const [manageCatId, setManageCatId] = useState('');

    // 계층 구조 관리 상태 (수정 모드)
    const [editingCatId, setEditingCatId] = useState(null);
    const [editValue, setEditValue] = useState('');

    // 참가자 정보 수정 상태
    const [editingPId, setEditingPId] = useState(null);
    const [editPNumber, setEditPNumber] = useState('');
    const [editPName, setEditPName] = useState('');

    // 참가자 일괄 관리 상태 (정렬, 복구 등)
    const [sortConfig, setSortConfig] = useState({ field: 'no', direction: 'asc' });
    const [recoveryTargetCatId, setRecoveryTargetCatId] = useState('');

    // 데이터 가져오기(Import) 상태
    const [importMode, setImportMode] = useState('merge'); // 'merge' or 'replace'
    const [isImporting, setIsImporting] = useState(false);

    // QR 코드 모달 상태
    const [showQrModal, setShowQrModal] = useState(false);
    const PRODUCTION_URL = "https://scoreprogram-f8fbb.web.app";

    // 컴포넌트 마운트 또는 대회 변경 시 데이터 동기화
    useEffect(() => {
        if (manageCompId) {
            syncCompetitionData(manageCompId);
        }
    }, [manageCompId, syncCompetitionData]);

    // 현재 선택된 종목 정보 조회 함수
    const findCatInfo = () => {
        for (const comp of competitions) {
            const cat = (comp.categories || []).find(c => c.id === selectedCategoryId);
            if (cat) return { compName: comp.name, catName: cat.name };
        }
        return { compName: '?', catName: 'None' };
    };
    const { compName, catName } = findCatInfo();

    // 채점 항목 추가 핸들러
    const handleAddScoring = (e) => {
        e.preventDefault();
        if (newItemLabel.trim()) {
            addScoringItem(newItemLabel.trim());
            setNewItemLabel('');
        }
    };

    // 심사위원 추가 핸들러
    const handleAddJudge = (e) => {
        e.preventDefault();
        if (manageCompId && newJudgeEmail.trim() && newJudgeName.trim()) {
            addJudge(manageCompId, newJudgeEmail.trim(), newJudgeName.trim());
            setNewJudgeEmail('');
            setNewJudgeName('');
        }
    };

    // 심사위원 삭제 핸들러 (점수 존재 시 익명화 처리)
    const handleDeleteJudge = (compId, email, name) => {
        // Check if judge has scores in this competition
        let hasScores = false;

        // Find categories for this competition
        const comp = competitions.find(y => y.id === compId);
        if (comp && comp.categories) {
            // Check all categories in this competition
            for (const cat of comp.categories) {
                const catScores = scores[cat.id];
                if (catScores) {
                    for (const pId in catScores) {
                        const pScores = catScores[pId];
                        // Check if this judge (email) has scored
                        // Note: email in scores is used as key
                        if (pScores[email.toLowerCase()]) {
                            hasScores = true;
                            break;
                        }
                    }
                }
                if (hasScores) break;
            }
        }

        if (hasScores) {
            if (window.confirm(`경고: ${name} 심사위원이 채점한 점수 정보가 있습니다!\n삭제 시 점수 보존을 위해 심사위원 이름만 '알수 없음'으로 변경됩니다.\n\n계속하시겠습니까? (점수는 유지됨)`)) {
                anonymizeJudge(compId, email);
            }
        } else {
            if (window.confirm(`${name} 심사위원을 정말 삭제하시겠습니까?`)) {
                removeJudge(compId, email);
            }
        }
    };

    // 참가자 추가 핸들러 (중복 번호 체크 포함)
    const handleAddParticipant = (e) => {
        e.preventDefault();
        const number = newPNumber.trim();
        const name = newPName.trim();

        if (manageCatId && name) {
            const currentList = participants[manageCatId] || [];
            // Only check duplicate if number is provided
            if (number && currentList.some(p => p.number === number)) {
                alert('이미 등록된 참가번호입니다. (Duplicate Number)');
                return;
            }
            addParticipant(manageCatId, number, name);
            setNewPNumber('');
            setNewPName('');
        }
    };

    // 심사위원 이름 수정 핸들러
    const handleUpdateJudgeName = (compId, email) => {
        if (tempJudgeName.trim()) {
            updateJudgeName(compId, email, tempJudgeName.trim());
            setEditingJudgeEmail(null);
        }
    };

    // 참가자 정보 수정 검증 및 업데이트
    const validateAndUpdateParticipant = (categoryId, pId, newNumber, newName) => {
        const number = newNumber.trim();
        const name = newName.trim();

        if (!name) return;

        const currentList = participants[categoryId] || [];
        // Only check duplicate if number is provided and different from current (though current check handles pId check)
        // If number is empty, we allow it even if others are empty (or maybe we don't care about duplicate empty numbers)
        const isDuplicate = number && currentList.some(p => p.number === number && p.id !== pId);

        if (isDuplicate) {
            alert('이미 등록된 참가번호입니다. (Duplicate Number)');
            return;
        }

        updateParticipant(categoryId, pId, { number, name });
        setEditingPId(null);
    };

    // 리스트 순서 변경 핸들러
    const move = (index, direction) => {
        const newItems = [...scoringItems];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= newItems.length) return;
        [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
        updateScoringItemOrder(newItems.map((item, i) => ({ ...item, order: i })));
    };

    // 채점 항목 삭제 핸들러 (점수 존재 여부 체크)
    const handleDeleteScoringItem = (itemId) => {
        // Check if this item is used in any scores
        let hasScores = false;

        // Loop through all categories
        for (const catId in scores) {
            const catScores = scores[catId];
            // Loop through all participants
            for (const pId in catScores) {
                const pScores = catScores[pId];
                // Loop through all judges
                for (const judgeEmail in pScores) {
                    const itemScores = pScores[judgeEmail];
                    if (itemScores && itemScores[itemId] !== undefined) {
                        hasScores = true;
                        break;
                    }
                }
                if (hasScores) break;
            }
            if (hasScores) break;
        }

        if (hasScores) {
            if (!window.confirm("채점 기준 삭제: 이 기준에 대한 모든 참가자의 채점 점수가 삭제될 수 있습니다.\n\n관리자가 최종 선택을 하셔야 합니다. 계속하시겠습니까?")) {
                return;
            }
        } else {
            if (!window.confirm("정말 이 채점 항목을 삭제하시겠습니까?")) {
                return;
            }
        }
        removeScoringItem(itemId);
    };

    // 참가자 삭제 핸들러 (점수 존재 여부 체크)
    const handleDeleteParticipant = (categoryId, pId) => {
        // Check if participant has scores
        const participantScores = scores[categoryId]?.[pId];
        const hasScores = participantScores && Object.keys(participantScores).length > 0;

        if (hasScores) {
            if (!window.confirm("주의! 참가자에 대한 Score 정보가 있습니다.\n점수가 삭제될 수 있으니 주의하세요.\n\n정말 삭제하시겠습니까?")) {
                return;
            }
        } else {
            if (!window.confirm("정말 이 참가자를 삭제하시겠습니까?")) {
                return;
            }
        }

        removeParticipant(categoryId, pId);
    };

    // 참가자별 점수 합계 및 평균 계산 (랭킹 산정용)
    const getScoredParticipants = useCallback((ps, catScores) => {
        if (!ps || ps.length === 0) return [];

        const scored = ps.map(p => {
            const pScores = catScores[p.id] || {};
            const judgeEmails = Object.keys(pScores);
            const judgeCount = judgeEmails.length;

            const totalSum = judgeEmails.reduce((sum, email) => {
                const itemScores = pScores[email] || {};
                const judgeSum = Object.values(itemScores).reduce((a, b) => a + b, 0);
                return sum + judgeSum;
            }, 0);

            const average = judgeCount > 0 ? totalSum / judgeCount : 0;
            return { ...p, totalSum, average, judgeCount };
        }).sort((a, b) => b.average - a.average);

        const rankMap = new Map();
        let currentRank = 1;
        scored.forEach((p, idx) => {
            if (idx > 0 && p.average < scored[idx - 1].average) {
                currentRank = idx + 1;
            }
            rankMap.set(p.id, p.average > 0 ? currentRank : '-');
        });

        return scored.map(s => ({
            ...s,
            rank: rankMap.get(s.id)
        }));
    }, []);

    // 현재 관리 중인 종목의 참가자 랭킹 목록 계산
    const rankedCategoryParticipants = useMemo(() => {
        const ps = participants[manageCatId] || [];
        const catScores = scores[manageCatId] || {};
        return getScoredParticipants(ps, catScores);
    }, [participants, scores, manageCatId, getScoredParticipants]);

    // 대회별 전체 참가자 목록 점수 및 랭킹 계산 (전체 현황용)
    const getCompParticipants = useCallback(() => {
        if (!manageCompId) return [];
        const comp = competitions.find(y => y.id === manageCompId);
        if (!comp) return [];

        const all = [];
        (comp.categories || []).forEach(cat => {
            const catPs = participants[cat.id] || [];
            const catScores = scores[cat.id] || {};
            const rankedPs = getScoredParticipants(catPs, catScores);

            const sortedRankedPs = rankedPs.sort((a, b) =>
                a.number.localeCompare(b.number, undefined, { numeric: true })
            );

            sortedRankedPs.forEach(p => {
                all.push({ ...p, categoryName: cat.name, categoryId: cat.id });
            });
        });

        if (sortConfig.field === 'no' && sortConfig.direction === 'desc') {
            all.reverse();
        }

        const sortedByAvg = [...all].sort((a, b) => b.average - a.average);
        const compRankMap = new Map();
        let currentRank = 1;
        sortedByAvg.forEach((p, idx) => {
            if (idx > 0 && p.average < sortedByAvg[idx - 1].average) {
                currentRank = idx + 1;
            }
            compRankMap.set(`${p.categoryId}_${p.id}`, p.average > 0 ? currentRank : '-');
        });

        return all.map(p => ({
            ...p,
            compRank: compRankMap.get(`${p.categoryId}_${p.id}`)
        }));
    }, [manageCompId, competitions, participants, scores, sortConfig, getScoredParticipants]);

    const compAllParticipants = useMemo(() => getCompParticipants(), [getCompParticipants]);

    const handleSort = () => {
        setSortConfig(prev => ({
            field: 'no',
            direction: prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // 고아 참가자(종목이 삭제된 참가자) 탐색 및 복구 로직
    const getOrphanParticipants = () => {
        const allCatIds = new Set(competitions.flatMap(y => (y.categories || []).map(c => c.id)));
        const orphaned = [];
        Object.keys(participants).forEach(catId => {
            if (!allCatIds.has(catId)) {
                participants[catId].forEach(p => {
                    const compNamePrefix = catId.split('-')[0] || '?';
                    orphaned.push({ ...p, oldCategoryId: catId, compNamePrefix });
                });
            }
        });
        return orphaned;
    };
    const orphanParticipants = getOrphanParticipants();

    const handleRecovery = async (oldCatId, pIds) => {
        if (!recoveryTargetCatId) return alert('복구할 대상 종목을 선택해주세요.');
        if (confirm(`${pIds.length}명의 참가자를 선택한 종목으로 이동하시겠습니까?`)) {
            await moveParticipants(oldCatId, recoveryTargetCatId, pIds);
            setRecoveryTargetCatId('');
            alert('복구가 완료되었습니다.');
        }
    };

    return (
        <div className="max-w-5xl mx-auto pb-12">
            {/* Part 1: Topbar */}
            <div className="flex items-center justify-between p-5">
                <div className="flex items-center gap-2">
                    <Settings className="text-rose-400 w-5 h-5" />
                    <h1 className="text-sm font-black tracking-tight text-white uppercase whitespace-nowrap">Admin Workspace</h1>
                </div>
                <button
                    onClick={() => setShowQrModal(true)}
                    className="p-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-200 rounded-lg border border-indigo-500/30 transition-all active:scale-95"
                    title="QR Connect"
                >
                    <QrCode size={18} />
                </button>
            </div>

            {/* Part 2: Tabbar */}
            <div className="px-5 mb-5 overflow-x-auto no-scrollbar">
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 shadow-inner min-w-max gap-1">
                    {[
                        { id: 'scoring', label: '채점 항목', icon: List, color: 'text-indigo-400' },
                        { id: 'participants', label: '참가자 관리', icon: UserPlus, color: 'text-emerald-400' },
                        { id: 'all_participants', label: '전체 참가자 현황', icon: Layout, color: 'text-indigo-400' },
                        { id: 'judges', label: '심사위원 관리', icon: Shield, color: 'text-amber-400' },
                        { id: 'data', label: '데이터 관리', icon: Database, color: 'text-cyan-400' },
                        ...(currentUser?.role === 'ROOT_ADMIN' ? [{ id: 'admins', label: '관리자(Root)', icon: Lock, color: 'text-rose-400' }] : [])
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => {
                                setAdminTab(tab.id);
                                if ((tab.id === 'participants' || tab.id === 'all_participants' || tab.id === 'judges') && !manageCompId && competitions.length > 0) {
                                    setManageCompId(competitions[0].id);
                                }
                            }}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap",
                                adminTab === tab.id
                                    ? "bg-indigo-600 text-white shadow-lg"
                                    : "text-slate-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <tab.icon size={14} className={cn(adminTab === tab.id ? "text-white" : tab.color)} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Part 3: Panel (Content) */}
            <div className="px-5 space-y-8">
                {adminTab === 'scoring' && (
                    <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex items-center gap-2 mb-6">
                            <List className="text-indigo-400" />
                            <h2 className="text-xl font-bold text-white">채점 항목 설정</h2>
                        </div>
                        <form onSubmit={handleAddScoring} className="flex gap-4 mb-8">
                            <input
                                type="text"
                                value={newItemLabel}
                                onChange={(e) => setNewItemLabel(e.target.value)}
                                placeholder="새 채점 항목 이름"
                                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                            />
                            <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all hover:scale-[1.02]">
                                <Plus size={20} /> 추가
                            </button>
                        </form>
                        <div className="space-y-3">
                            {scoringItems.sort((a, b) => a.order - b.order).map((item, index) => (
                                <div key={item.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl group hover:bg-white/10 transition-all">
                                    <div className="flex items-center gap-4">
                                        <span className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm">{index + 1}</span>
                                        <span className="font-bold text-lg text-white/90">{item.label}</span>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => move(index, -1)} disabled={index === 0} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 disabled:opacity-10"><ArrowUp size={18} /></button>
                                        <button onClick={() => move(index, 1)} disabled={index === scoringItems.length - 1} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 disabled:opacity-10"><ArrowDown size={18} /></button>
                                        <button onClick={() => handleDeleteScoringItem(item.id)} className="p-2 hover:bg-rose-500/20 rounded-lg text-rose-400"><Trash2 size={18} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {adminTab === 'participants' && (
                    <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                            <div className="flex items-center gap-2">
                                <Users className="text-emerald-400" />
                                <h2 className="text-xl font-bold text-white">참가자 명단 관리</h2>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <select value={manageCompId} onChange={(e) => { setManageCompId(e.target.value); setManageCatId(''); }} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none">
                                    <option value="">대회 선택</option>
                                    {competitions.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                                </select>
                                <select value={manageCatId} onChange={(e) => setManageCatId(e.target.value)} disabled={!manageCompId} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none disabled:opacity-30">
                                    <option value="">종목 선택</option>
                                    {competitions.find(y => y.id === manageCompId)?.categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {manageCatId ? (
                            <>
                                <form onSubmit={handleAddParticipant} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                    <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-4 py-3">
                                        <Hash size={16} className="text-slate-500" /><input type="text" value={newPNumber} onChange={(e) => setNewPNumber(e.target.value)} placeholder="참가번호 (Back No.)" className="w-full bg-transparent outline-none text-white font-bold" />
                                    </div>
                                    <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-4 py-3">
                                        <UserIcon size={16} className="text-slate-500" /><input type="text" value={newPName} onChange={(e) => setNewPName(e.target.value)} placeholder="참가팀 이름" className="w-full bg-transparent outline-none text-white font-bold" />
                                    </div>
                                    <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"><UserPlus size={20} /> 참가자 등록</button>
                                </form>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {rankedCategoryParticipants.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })).map(p => (
                                        <div key={p.id} className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between group">
                                            {editingPId === p.id ? (
                                                <div className="flex flex-col gap-2 w-full">
                                                    <input className="bg-black/60 border border-white/20 rounded px-2 py-1 text-white text-sm" value={editPNumber} onChange={(e) => setEditPNumber(e.target.value)} placeholder="참가번호" />
                                                    <input className="bg-black/60 border border-white/20 rounded px-2 py-1 text-white text-sm" value={editPName} onChange={(e) => setEditPName(e.target.value)} placeholder="이름" />
                                                    <div className="flex gap-2">
                                                        <button onClick={() => validateAndUpdateParticipant(manageCatId, p.id, editPNumber, editPName)} className="text-[10px] bg-emerald-600 px-3 py-1 rounded font-bold">저장</button>
                                                        <button onClick={() => setEditingPId(null)} className="text-[10px] bg-slate-600 px-3 py-1 rounded font-bold">취소</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">{p.number}</div>
                                                        <div>
                                                            <span className="font-bold text-white block">{p.name}</span>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="text-[10px] font-black uppercase text-slate-500">Rank</span>
                                                                <span className="text-[10px] font-black text-indigo-400">{p.rank}</span>
                                                                <span className="text-[10px] font-black uppercase text-slate-500 ml-1">Avg</span>
                                                                <span className="text-[10px] font-black text-emerald-400">{p.average?.toFixed(2) || '0.00'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                        <button onClick={() => { setEditingPId(p.id); setEditPNumber(p.number); setEditPName(p.name); }} className="p-2 hover:bg-white/10 rounded-lg text-slate-400"><Settings size={14} /></button>
                                                        <button onClick={() => handleDeleteParticipant(manageCatId, p.id)} className="p-2 hover:bg-rose-500/20 rounded-lg text-rose-400"><Trash2 size={16} /></button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-2xl">
                                <Users className="mx-auto text-white/5 mb-4" size={48} />
                                <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">연도와 종목을 선택하여 관리하세요</p>
                            </div>
                        )}
                    </div>
                )}

                {adminTab === 'all_participants' && (
                    <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                            <div className="flex items-center gap-2">
                                <Layout className="text-indigo-400" />
                                <h2 className="text-xl font-bold text-white">전체 참가자 현황</h2>
                            </div>
                            <select value={manageCompId} onChange={(e) => setManageCompId(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none">
                                <option value="">대회 선택</option>
                                {competitions.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                            </select>
                        </div>

                        {manageCompId ? (
                            <div className="overflow-x-auto custom-scrollbar rounded-xl border border-white/5 bg-black/20">
                                <table className="w-full text-left border-collapse min-w-[600px]">
                                    <thead>
                                        <tr className="bg-white/5 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-white/5">
                                            <th className="px-6 py-5 w-20 text-center">No.</th>
                                            <th className="px-6 py-5">참가팀</th>
                                            <th className="px-6 py-5">종목</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {compAllParticipants.length > 0 ? (
                                            compAllParticipants.map((p, index) => (
                                                <tr key={`${p.categoryId}_${p.id}`} className="hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-6 py-5 text-center font-black text-slate-600">{index + 1}</td>
                                                    <td className="px-6 py-5">
                                                        <div className="flex items-center gap-3">
                                                            <span className="font-mono text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded text-sm">{p.number}</span>
                                                            <span className="font-bold text-white">{p.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <span className="text-xs bg-white/5 px-3 py-1.5 rounded-lg text-slate-300 font-bold uppercase tracking-tight">{p.categoryName}</span>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="3" className="px-6 py-10 text-center text-slate-500">참가자가 없습니다.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-2xl">
                                <Layout className="mx-auto text-white/5 mb-4" size={48} />
                                <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">연도를 선택하여 전체 참가자 현황을 확인하세요</p>
                            </div>
                        )}
                    </div>
                )}

                {orphanParticipants.length > 0 && (
                    <div className="mt-12 p-6 bg-rose-500/5 border border-rose-500/20 rounded-2xl">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-rose-500/20 rounded-lg text-rose-400">
                                <Trash2 size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">끊어진 참가자 복구 (Recovery Required)</h3>
                                <p className="text-xs text-rose-400/70">종목 정보가 삭제되거나 변경되어 연결이 끊어진 {orphanParticipants.length}명의 참가자가 발견되었습니다.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            {Object.entries(
                                orphanParticipants.reduce((acc, p) => {
                                    if (!acc[p.oldCategoryId]) acc[p.oldCategoryId] = [];
                                    acc[p.oldCategoryId].push(p);
                                    return acc;
                                }, {})
                            ).map(([oldCatId, ps]) => (
                                <div key={oldCatId} className="bg-black/40 border border-white/10 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Ghost Category ID</p>
                                        <code className="text-rose-400 font-mono text-sm">{oldCatId}</code>
                                        <p className="text-white font-bold mt-1">{ps.length}명의 참가자 (예: {ps[0].name}...)</p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2 items-end sm:items-center">
                                        <select
                                            value={recoveryTargetCatId}
                                            onChange={(e) => setRecoveryTargetCatId(e.target.value)}
                                            className="bg-slate-800 border border-white/20 rounded-lg px-3 py-2 text-xs text-white outline-none w-full sm:w-48"
                                        >
                                            <option value="">복구 대상 종목 선택</option>
                                            {competitions.map(y => (
                                                <optgroup key={y.id} label={`${y.name}`}>
                                                    {(y.categories || []).map(c => (
                                                        <option key={c.id} value={c.id}>{c.name}</option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() => handleRecovery(oldCatId, ps.map(p => p.id))}
                                            disabled={!recoveryTargetCatId}
                                            className="bg-rose-600 hover:bg-rose-500 disabled:opacity-30 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
                                        >
                                            이 종목으로 모두 이동
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {adminTab === 'judges' && (
                    <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                            <div className="flex items-center gap-2">
                                <Shield className="text-amber-400" />
                                <h2 className="text-xl font-bold text-white">심사위원 보안 관리</h2>
                            </div>
                            <select value={manageCompId} onChange={(e) => setManageCompId(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none">
                                <option value="">대회 선택</option>
                                {competitions.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                            </select>
                        </div>

                        {manageCompId ? (
                            <>
                                <form onSubmit={handleAddJudge} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                    <input type="email" value={newJudgeEmail} onChange={(e) => setNewJudgeEmail(e.target.value)} placeholder="구글 이메일" className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" />
                                    <input type="text" value={newJudgeName} onChange={(e) => setNewJudgeName(e.target.value)} placeholder="심사위원 이름" className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" />
                                    <button type="submit" className="bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"><Shield size={20} /> 권한 부여</button>
                                </form>
                                <div className="space-y-3">
                                    {(judgesByComp[manageCompId] || []).map(j => (
                                        <div key={j.email} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl group">
                                            <div className="flex items-center gap-4 flex-1">
                                                <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0"><Shield size={20} /></div>
                                                {editingJudgeEmail === j.email ? (
                                                    <div className="flex items-center gap-2 flex-1 mr-4">
                                                        <input
                                                            autoFocus
                                                            className="bg-black/60 border border-white/20 rounded px-2 py-1 text-white font-bold w-full outline-none"
                                                            value={tempJudgeName}
                                                            onChange={(e) => setTempJudgeName(e.target.value)}
                                                            onKeyDown={(e) => e.key === 'Enter' && handleUpdateJudgeName(manageCompId, j.email)}
                                                        />
                                                        <button onClick={() => handleUpdateJudgeName(manageCompId, j.email)} className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30"><Check size={16} /></button>
                                                        <button onClick={() => setEditingJudgeEmail(null)} className="p-1.5 bg-slate-500/20 text-slate-400 rounded-lg hover:bg-slate-500/30"><X size={16} /></button>
                                                    </div>
                                                ) : (
                                                    <div><p className="font-bold text-white">{j.name}</p><p className="text-xs text-slate-500">{j.email}</p></div>
                                                )}
                                            </div>
                                            {!editingJudgeEmail && (
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                    <button
                                                        onClick={() => {
                                                            setEditingJudgeEmail(j.email);
                                                            setTempJudgeName(j.name);
                                                        }}
                                                        className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white"
                                                        title="이름 수정"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button onClick={() => handleDeleteJudge(manageCompId, j.email, j.name)} className="p-2 hover:bg-rose-500/20 rounded-lg text-rose-400"><Trash2 size={18} /></button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-2xl">
                                <Shield className="mx-auto text-white/5 mb-4" size={48} />
                                <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">연도를 선택하여 심사위원을 관리하세요</p>
                            </div>
                        )}
                    </div>
                )}

                {adminTab === 'data' && (
                    <div className="space-y-6">
                        <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div className="flex items-center gap-2 mb-6">
                                <Database className="text-indigo-400" />
                                <h2 className="text-xl font-bold text-white">데이터 백업 및 관리 (JSON)</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                                    <FileDown className="text-indigo-400 mb-4" size={32} />
                                    <h3 className="text-lg font-bold text-white mb-2">DB 데이터 내보내기</h3>
                                    <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                                        `score_program_backup_${new Date().toISOString().split('T')[0]}.json` 파일로 저장됩니다.
                                    </p>
                                    <button
                                        onClick={exportData}
                                        disabled={isExporting}
                                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                                    >
                                        {isExporting ? <span className="animate-spin text-xl">⏳</span> : <FileDown size={20} />}
                                        {isExporting ? '데이터 준비 중...' : 'JSON 데이터 내보내기'}
                                    </button>
                                </div>

                                <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                                    <FileUp className="text-emerald-400 mb-4" size={32} />
                                    <h3 className="text-lg font-bold text-white mb-2">DB 데이터 가져오기</h3>
                                    {/* Permission Tester */}
                                    <div className="mb-4">
                                        <button
                                            onClick={async () => {
                                                const { doc, setDoc, deleteDoc } = await import('firebase/firestore');
                                                const { db, auth } = await import('../lib/firebase'); // Import auth
                                                const user = auth.currentUser;

                                                const collections = ['competitions', 'participants', 'judges', 'settings', 'admins'];
                                                let results = [`🔍 진단 정보:`, `Email: '${user?.email}'`, `UID: ${user?.uid}`, `---`];

                                                alert(`권한 테스트를 시작합니다...\n(사용자: ${user?.email})`);

                                                for (const col of collections) {
                                                    try {
                                                        const testRef = doc(db, col, 'permission_test_doc');
                                                        await setDoc(testRef, { test: true, author: user?.email });
                                                        await deleteDoc(testRef);
                                                        results.push(`✅ ${col}: 성공`);
                                                    } catch (e) {
                                                        results.push(`❌ ${col}: 실패 (${e.code})`);
                                                    }
                                                }
                                                alert(results.join('\n'));
                                            }}
                                            className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-xs font-bold transition-colors"
                                        >
                                            🛠 쓰기 권한 테스트 실행
                                        </button>
                                    </div>
                                    <div className="flex gap-4 mb-4">
                                        <label className="flex-1 flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="importMode"
                                                checked={importMode === 'merge'}
                                                onChange={() => setImportMode('merge')}
                                                className="accent-emerald-500"
                                            />
                                            <span className="text-xs text-slate-300">병합 (Merge)</span>
                                        </label>
                                        <label className="flex-1 flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="importMode"
                                                checked={importMode === 'replace'}
                                                onChange={() => setImportMode('replace')}
                                                className="accent-rose-500"
                                            />
                                            <span className="text-xs text-slate-300 text-rose-400">전체 교체 (Replace)</span>
                                        </label>
                                    </div>
                                    <input
                                        type="file"
                                        accept=".json"
                                        id="import-file"
                                        className="hidden"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;

                                            if (importMode === 'replace' && !window.confirm("주의! 기존 데이터가 모두 삭제되고 파일 내용으로 대체됩니다. 진행하시겠습니까?")) {
                                                e.target.value = '';
                                                return;
                                            }

                                            const reader = new FileReader();
                                            reader.onload = async (event) => {
                                                try {
                                                    setIsImporting(true);
                                                    const json = JSON.parse(event.target.result);
                                                    await importData(json, importMode);
                                                    alert('데이터를 성공적으로 가져왔습니다.');
                                                } catch (err) {
                                                    alert('파일 읽기 또는 데이터 처리 중 오류가 발생했습니다: ' + err.message);
                                                } finally {
                                                    setIsImporting(false);
                                                    e.target.value = '';
                                                }
                                            };
                                            reader.readAsText(file);
                                        }}
                                    />
                                    <button
                                        onClick={() => document.getElementById('import-file').click()}
                                        disabled={isImporting}
                                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                                    >
                                        {isImporting ? <span className="animate-spin text-xl">⏳</span> : <FileUp size={20} />}
                                        JSON 파일 업로드
                                    </button>
                                </div>
                            </div>

                            <div className="mt-8 p-6 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                                <div className="flex items-center gap-2 mb-4">
                                    <RefreshCcw className="text-amber-400" />
                                    <h3 className="text-lg font-bold text-white">데이터 정합성 도구 (Data Repair)</h3>
                                </div>
                                <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                                    기존 데이터의 이메일 대소문자 문제로 인해 심사위원이 본인의 점수를 볼 수 없는 경우 사용하세요.
                                    모든 데이터(심사위원, 관리자, 점수)의 이메일 키를 소문자로 변환하여 저장합니다.
                                </p>
                                <button
                                    onClick={async () => {
                                        if (confirm('모든 데이터의 이메일 키를 소문자로 변환하시겠습니까? (이 작업은 되돌릴 수 없습니다)')) {
                                            try {
                                                const count = await useStore.getState().normalizeDatabase();
                                                alert(`작업 완료: ${count}개의 데이터가 수정되었습니다.`);
                                            } catch (e) {
                                                alert(`오류 발생: ${e.message}`);
                                            }
                                        }
                                    }}
                                    className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                                >
                                    <RefreshCcw size={20} /> 데이터 대소문자 변환 (Case Normalization)
                                </button>

                                <button
                                    onClick={async () => {
                                        if (confirm('모든 대회와 종목에 잠금(Locked) 속성을 초기화하시겠습니까? (없는 경우에만 False로 설정됨)')) {
                                            try {
                                                const count = await fixLockedProperties();
                                                alert(`작업 완료: ${count}개의 대회가 수정되었습니다.`);
                                            } catch (e) {
                                                alert(`오류 발생: ${e.message}`);
                                            }
                                        }
                                    }}
                                    className="w-full py-4 mt-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                                >
                                    <Lock size={20} /> 잠금 데이터 복구 (Fix Locked Data)
                                </button>
                            </div>

                            {import.meta.env.DEV && (
                                <div className="mt-12 p-6 bg-rose-500/5 border border-rose-500/20 rounded-2xl">
                                    <div className="flex items-center gap-3 mb-4">
                                        <AlertTriangle className="text-rose-500" />
                                        <h3 className="text-lg font-bold text-white">Danger Zone (Dev Only)</h3>
                                    </div>
                                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                                        <p className="text-xs text-slate-400">모든 연도, 종목, 참가자, 점수 등 데이터베이스의 **모든 정보를 영구적으로 삭제**합니다.</p>
                                        <button
                                            onClick={() => {
                                                if (window.confirm("경고: 모든 데이터가 삭제됩니다! (연도, 종목, 참가자, 점수 등)\n이 작업은 절대 되돌릴 수 없습니다.\n\n정말 초기화를 진행하시겠습니까?")) {
                                                    if (window.confirm("마지막 경고입니다.\n\n정말로 모든 데이터를 영구적으로 삭제하시겠습니까?")) {
                                                        clearAllData();
                                                    }
                                                }
                                            }}
                                            disabled={isResetting}
                                            className="px-6 py-3 bg-white/5 border border-rose-500/30 text-rose-400 hover:bg-rose-500 hover:text-white rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2"
                                        >
                                            {isResetting ? (
                                                <>
                                                    <RefreshCcw size={14} className="animate-spin" />
                                                    {resetStatus || '초기화 중...'}
                                                </>
                                            ) : (
                                                '데이터베이스 완전 초기화'
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {adminTab === 'admins' && currentUser?.role === 'ROOT_ADMIN' && (
                    <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex items-center gap-2 mb-6">
                            <Shield className="text-rose-400" />
                            <h2 className="text-xl font-bold text-white">최고 관리자(Admin) 권한 관리</h2>
                        </div>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const email = e.target.email.value;
                                const name = e.target.name.value;
                                if (email && name) { addAdmin(email, name); e.target.reset(); }
                            }}
                            className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
                        >
                            <input name="email" type="email" placeholder="관리자 구글 이메일" required className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" />
                            <input name="name" type="text" placeholder="관리자 이름" required className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" />
                            <button type="submit" className="bg-rose-600 hover:bg-rose-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"><Plus size={20} /> 관리자 등록</button>
                        </form>
                        <div className="space-y-3">
                            {admins.map(admin => (
                                <div key={admin.email} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center"><Shield size={20} /></div>
                                        <div><p className="font-bold text-white">{admin.name}</p><p className="text-xs text-slate-500">{admin.email}</p></div>
                                    </div>
                                    <button onClick={() => {
                                        if (confirm(`${admin.name} 관리자를 정말 삭제하시겠습니까?`)) {
                                            removeAdmin(admin.email);
                                        }
                                    }} className="p-2 opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 rounded-lg text-rose-400 transition-all"><Trash2 size={18} /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {showQrModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-[#1e1e1e] border border-white/10 rounded-3xl p-8 max-w-md w-full relative shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
                            <button
                                onClick={() => setShowQrModal(false)}
                                className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all"
                            >
                                <X size={20} />
                            </button>

                            <div className="text-center space-y-6">
                                <div>
                                    <h2 className="text-2xl font-black text-white mb-2">Connect to Competition</h2>
                                    <p className="text-slate-400 text-sm">Scan with your camera to access</p>
                                </div>

                                <div className="bg-white p-4 rounded-2xl inline-block shadow-[0_0_40px_-10px_rgba(99,102,241,0.5)]">
                                    <QRCode
                                        value={PRODUCTION_URL}
                                        size={200}
                                        level="H"
                                    />
                                </div>

                                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
                                    <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest mb-1">Production URL</p>
                                    <p className="text-white font-mono text-sm break-all font-bold">{PRODUCTION_URL}</p>
                                </div>

                                {import.meta.env.DEV && (
                                    <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3">
                                        <p className="text-[10px] text-amber-500/70 font-bold uppercase tracking-widest mb-1">Local Network URL (Dev)</p>
                                        <p className="text-slate-400 font-mono text-xs">{window.location.href}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
};

export default AdminPanel;

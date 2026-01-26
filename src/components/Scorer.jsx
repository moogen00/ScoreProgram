import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PenTool, Lock, Save, AlertCircle, Medal, Users } from 'lucide-react';
import useStore from '../store/useStore';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
    return twMerge(clsx(inputs));
}

const Scorer = () => {
    const { scoringItems, updateScore, submitCategoryScores, toggleJudgeSubmission, selectedCategoryId, scores, participants, currentUser, competitions, judgesByComp, isInitialSyncComplete } = useStore();

    console.log(`[Scorer] Rendering. Category: ${selectedCategoryId}, Participants count: ${participants[selectedCategoryId]?.length || 0}`);
    if (participants[selectedCategoryId]) {
        console.log(`[Scorer] Participants for ${selectedCategoryId}:`, participants[selectedCategoryId]);
    }

    // 참가자 목록 Memoization
    const categoryParticipants = useMemo(() => participants[selectedCategoryId] || [], [participants, selectedCategoryId]);
    // 로컬 입력 상태 관리: { [participantId]: { [itemId]: value } }
    const [localScores, setLocalScores] = useState({});
    const [isSaving, setIsSaving] = useState(false);

    // 초기 상태 체크 로직
    const currentComp = useMemo(() => competitions.find(y => y.categories?.some(c => c.id === selectedCategoryId)), [competitions, selectedCategoryId]);
    const currentCompId = currentComp?.id;
    const categoryName = useMemo(() => currentComp?.categories?.find(c => c.id === selectedCategoryId)?.name || '', [currentComp, selectedCategoryId]);
    const isSolo = useMemo(() => categoryName.toUpperCase().includes('SOLO'), [categoryName]);

    // 권한 및 잠금 상태 로직
    const isCompLocked = currentComp?.locked;
    const isCategoryLocked = currentComp?.categories?.find(c => c.id === selectedCategoryId)?.locked;
    const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'ROOT_ADMIN';
    const isJudge = currentUser?.role === 'JUDGE';
    const isSpectator = currentUser?.role === 'SPECTATOR';
    const isJudgeForThisComp = judgesByComp[currentCompId]?.some(j => j.email === currentUser?.email);

    // 현재 사용자가 이미 제출했는지 확인
    const userEmail = currentUser?.email?.toLowerCase()?.trim() || '';
    const myJudgeRecord = useMemo(() => judgesByComp[currentCompId]?.find(j => j.email === userEmail), [judgesByComp, currentCompId, userEmail]);
    const isSubmitted = myJudgeRecord?.submittedCategories?.[selectedCategoryId] || false;

    // Auth: Everyone can view, but only Admin/Assigned Judge can edit
    const isAuthorized = true;
    const canEdit = isAdmin || isJudge;
    const isGlobalLocked = isCompLocked || isCategoryLocked;
    // Lock if Global Lock is ON, OR if Submitted (and not Admin)
    // Admin is immune to Submission Lock (can edit anytime), but subject to Global Lock if we want strictness? 
    // Usually Admin can override all, but let's respect Global Lock for visual consistency, or allow Admin override.
    // Existing logic: "&& !isAdmin" means Admin is NEVER locked. 
    // User said: "Admin data lock priority is high". 
    // Let's keep Admin unlocked generally, but for Judge:
    const isLocked = (isGlobalLocked || isSubmitted) && !isAdmin;

    console.log('[Scorer Debug]', {
        userEmail,
        role: currentUser?.role,
        isSpectator,
        isLocked,
        isGlobalLocked,
        isSubmitted,
        selectedCategoryId
    });

    // 스토어 점수와 로컬 입력 상태 동기화 (초기 진입 시)
    useEffect(() => {
        if (!selectedCategoryId || !currentUser) return;

        const initialScores = {};
        categoryParticipants.forEach(p => {
            const userScores = scores[selectedCategoryId]?.[p.id]?.[userEmail] || {};
            initialScores[p.id] = { ...userScores };
        });
        setLocalScores(initialScores);
    }, [selectedCategoryId, currentUser, scores, categoryParticipants, userEmail]);

    // 점수 입력 핸들러 (실시간 입력 제한 및 로컬 상태 업데이트)
    const handleScoreChange = (participantId, itemId, val) => {
        if (isLocked) return;

        // 빈 값 처리 (지우기 허용)
        if (val === '') {
            setLocalScores(prev => ({
                ...prev,
                [participantId]: { ...prev[participantId], [itemId]: '' }
            }));
            return;
        }

        // 입력 제한 정규식: 숫자만 허용, 소수점은 최대 1자리까지만 허용
        if (!/^\d*\.?\d{0,1}$/.test(val)) return;

        let num = parseFloat(val);
        if (isNaN(num)) return;
        if (num > 9.9) num = 9.9;

        setLocalScores(prev => ({
            ...prev,
            [participantId]: { ...prev[participantId], [itemId]: val }
        }));
    };

    // 제출 / 수정하기 토글 핸들러
    const handleToggleSubmit = async () => {
        if (isGlobalLocked && !isAdmin) return; // Cannot toggle if globally locked

        setIsSaving(true);
        console.log(`[Scorer] handleToggleSubmit START: category=${selectedCategoryId}, isSubmitted=${isSubmitted}`);

        // Safety timeout to prevent infinite processing state
        const safetyTimer = setTimeout(() => {
            console.warn('[Scorer] handleToggleSubmit: Safety timer triggered (5s)');
            setIsSaving(false);
        }, 5000);

        try {
            if (isSubmitted) {
                // Currently Submitted -> Unlock (Edit Mode)
                console.log('[Scorer] Calling toggleJudgeSubmission -> false');
                await toggleJudgeSubmission(selectedCategoryId, false);
            } else {
                // Currently Editing -> Save & Submit
                console.log('[Scorer] Calling submitCategoryScores');
                await submitCategoryScores(selectedCategoryId, localScores);
            }
            console.log('[Scorer] handleToggleSubmit SUCCESS');
        } catch (e) {
            console.error("[Scorer] handleToggleSubmit FAILED", e);
            alert(`처리 중 오류가 발생했습니다: ${e.message || e}`);
        } finally {
            console.log('[Scorer] handleToggleSubmit FINALLY: resetting state');
            clearTimeout(safetyTimer);
            setIsSaving(false);
        }
    };

    // 개별 참가자 총점 계산 (로컬 상태 기준)
    const calculateTotal = useCallback((pId, scoresObj = localScores) => {
        const pScores = scoresObj[pId] || {};
        return Object.values(pScores).reduce((sum, val) => {
            const num = parseFloat(val);
            return sum + (isNaN(num) ? 0 : num);
        }, 0).toFixed(1);
    }, [localScores]);

    // scoringItems 정렬
    // 참가자 총점 조회 (관리자/관중 vs 심사위원 분기 처리)
    // - 관리자/관중(Locked): 모든 심사위원 평균 합산
    // - 심사위원: 본인의 점수 합산
    const getParticipantTotal = useCallback((pId) => {
        // Condition: Admin (Monitoring) OR Spectator (Locked) OR Admin (Locked - rare)
        // Basically if we are showing averages, we calculate total from averages.
        if ((isAdmin && !isJudgeForThisComp) || (isSpectator && isLocked)) {
            // Calculate Average Total from all judges
            const pScoresByJudge = scores[selectedCategoryId]?.[pId] || {};
            const judgeEmails = Object.keys(pScoresByJudge);
            if (judgeEmails.length === 0) return 0;

            let sumOfTotals = 0;
            judgeEmails.forEach(email => {
                const vals = pScoresByJudge[email] || {};
                const judgeTotal = Object.values(vals).reduce((s, v) => s + (parseFloat(v) || 0), 0);
                sumOfTotals += judgeTotal;
            });
            return parseFloat((sumOfTotals / judgeEmails.length).toFixed(2));
        } else {
            // Judge: Use local/own total
            return parseFloat(calculateTotal(pId));
        }
    }, [isAdmin, isSpectator, isLocked, isJudgeForThisComp, scores, selectedCategoryId, calculateTotal]);

    // 관리자용 세부 통계 계산 (항목별 평균 및 심사위원별 점수 내역)
    const getAdminItemStats = useCallback((pId, itemId) => {
        const pScoresByJudge = scores[selectedCategoryId]?.[pId] || {};
        const compJudges = judgesByComp?.[currentCompId] || [];
        const judgeEmails = Object.keys(pScoresByJudge);
        const stats = { avg: 0, breakdown: [] };

        if (judgeEmails.length === 0) return stats;

        let sum = 0;
        let count = 0;
        judgeEmails.forEach(email => {
            const val = pScoresByJudge[email]?.[itemId];
            if (val !== undefined) {
                const num = parseFloat(val);
                sum += num;
                count++;

                // Find judge name
                let judgeName = email.split('@')[0];
                const judgeObj = compJudges.find(j => j.email === email);
                if (judgeObj) judgeName = judgeObj.name;

                stats.breakdown.push({ name: judgeName, score: num });
            }
        });

        if (count > 0) {
            stats.avg = sum / count;
        }
        return stats;
    }, [scores, selectedCategoryId, judgesByComp, currentCompId]);

    // 관중용 항목별 평균 점수 조회
    const getAverageItemScore = useCallback((pId, itemId) => {
        const stats = getAdminItemStats(pId, itemId);
        return stats.avg > 0 ? stats.avg.toFixed(2) : '-';
    }, [getAdminItemStats]);

    // 채점 항목 정렬 (Order 기준)
    const sortedItems = [...scoringItems].sort((a, b) => a.order - b.order);

    // 참가자 랭킹 계산 (평균 점수 기준 내림차순 정렬)
    const rankedParticipants = useMemo(() => {
        if (categoryParticipants.length === 0) return [];

        const scored = categoryParticipants.map(p => {
            const total = getParticipantTotal(p.id);
            return { ...p, scoreForRanking: total };
        }).sort((a, b) => b.scoreForRanking - a.scoreForRanking);

        // Standard Competition Ranking O(N log N)
        const rankMap = new Map();
        let currentRank = 1;
        scored.forEach((p, idx) => {
            if (idx > 0 && p.scoreForRanking < scored[idx - 1].scoreForRanking) {
                currentRank = idx + 1;
            }
            rankMap.set(p.id, p.scoreForRanking > 0 ? currentRank : '-');
        });

        return scored.map(s => ({
            ...s,
            rank: rankMap.get(s.id)
        }));
    }, [categoryParticipants, getParticipantTotal]);

    // 상위 3명 랭킹 위젯용 데이터
    const topRanked = useMemo(() => {
        return rankedParticipants.slice(0, 3).filter(p => (typeof p.rank === 'number'));
    }, [rankedParticipants]);

    // 참가자 번호순 정렬 (테이블 표시용)
    const participantsSortedByNumber = useMemo(() => {
        return [...rankedParticipants].sort((a, b) => {
            const numA = parseInt(a.number || 0, 10);
            const numB = parseInt(b.number || 0, 10);
            return numA - numB;
        });
    }, [rankedParticipants]);

    if (!isAuthorized) {
        return (
            <div className="max-w-5xl mx-auto py-20 flex flex-col items-center justify-center text-center p-10 glass-card border-dashed border-2 border-slate-700">
                <Lock size={48} className="mb-4 text-rose-500 opacity-50" />
                <h2 className="text-2xl font-bold text-white mb-2">접근 권한이 없습니다</h2>
            </div>
        );
    }

    if (!selectedCategoryId) {
        return (
            <div className="max-w-screen-xl mx-auto pb-20 px-4">
                <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-10 border-2 border-dashed border-white/5 rounded-3xl">
                    <PenTool className="text-slate-700 w-12 h-12 mb-4" />
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">좌측 메뉴에서 심사할 종목을 선택해 주세요.</p>
                </div>
            </div>
        );
    }

    // Global loading state: Wait until initial sync is complete
    if (!isInitialSyncComplete) {
        return (
            <div className="max-w-screen-xl mx-auto pb-20 px-4">
                <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-10">
                    <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4" />
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">데이터를 동기화 중입니다...</p>
                </div>
            </div>
        );
    }

    // After sync, if no participants exist for the selected category
    if (categoryParticipants.length === 0) {
        return (
            <div className="max-w-screen-xl mx-auto pb-20 px-4">
                <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-10 border-2 border-dashed border-white/10 rounded-3xl bg-white/[0.02]">
                    <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-6 ring-4 ring-white/5">
                        <Users className="text-slate-500 w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">등록된 참가자가 없습니다</h2>
                    <p className="text-slate-500 text-sm max-w-sm mb-8 leading-relaxed">
                        이 종목에 등록된 참가자가 없거나, 데이터 연결이 끊어졌을 수 있습니다.
                    </p>
                    <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-left max-w-md">
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Troubleshooting Tip</p>
                        <p className="text-xs text-indigo-300/70">
                            관리자 화면에서 참가자를 등록했는지 확인해 주세요. 만약 등록했는데도 보이지 않는다면 상단 툴바의 <span className="font-bold">시스템 진단(Diagnostic)</span> 패널을 확인하여 끊어진 데이터를 복구할 수 있습니다.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-screen-xl mx-auto pb-20 px-4">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <PenTool className="text-amber-400 w-6 h-6" />
                        <span className="text-amber-400 font-bold tracking-widest text-xs uppercase">Scoring Room</span>
                    </div>
                    <h1 className="text-3xl md:text-3xl font-black italic tracking-tighter uppercase text-white">
                        {categoryName}
                    </h1>
                </div>

                <div className="flex items-center gap-3">
                    {/* Admin/Global Lock Indicator */}
                    {(isGlobalLocked) && (
                        <div className="bg-rose-500/20 border border-rose-500/50 px-4 py-2 rounded-lg flex items-center gap-2 text-rose-400 font-bold animate-pulse">
                            <Lock size={16} />
                            <span>ADMIN LOCKED</span>
                        </div>
                    )}

                    {/* Submission Toggle Button (For Judges ONLY) */}
                    {(!isGlobalLocked && isAuthorized && !isAdmin) && (
                        <button
                            onClick={handleToggleSubmit}
                            disabled={isSaving}
                            className={cn(
                                "px-6 py-2 rounded-lg flex items-center gap-2 font-bold transition-all shadow-lg active:scale-95",
                                isSubmitted
                                    ? "bg-indigo-500 hover:bg-indigo-600 text-white border border-indigo-400/30"
                                    : "bg-emerald-500 hover:bg-emerald-600 text-white border border-emerald-400/30",
                                isSaving && "opacity-50 cursor-wait"
                            )}
                        >
                            {isSaving ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Processing...</span>
                                </>
                            ) : isSubmitted ? (
                                <>
                                    <PenTool size={16} />
                                    <span>수정하기</span>
                                </>
                            ) : (
                                <>
                                    <Save size={16} />
                                    <span>저장 후 제출</span>
                                </>
                            )}
                        </button>
                    )}

                    {/* Admin Status Indicator (Active/Unlocked) */}
                    {(!isGlobalLocked && isAdmin) && (
                        <div className="bg-emerald-500/20 border border-emerald-500/50 px-4 py-2 rounded-lg flex items-center gap-2 text-emerald-400 font-bold">
                            <PenTool size={16} />
                            <span>ACTIVE</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Top 3 Ranking Widget (Admin Only OR Spectator if Locked) */}
            {((isAdmin || (isSpectator && isLocked)) && topRanked.length > 0) && (
                <div className="grid grid-cols-3 gap-2 md:gap-4 mb-6">
                    {topRanked.map((p, index) => (
                        <div key={p.id} className={`p-3 rounded-xl border ${index === 0 ? 'bg-amber-500/10 border-amber-500/30' : index === 1 ? 'bg-slate-400/10 border-slate-400/30' : 'bg-orange-700/10 border-orange-700/30'} flex flex-col items-center justify-center relative overflow-hidden group`}>
                            <div className={`absolute top-0 right-0 p-1.5 rounded-bl-lg font-black text-[10px] ${index === 0 ? 'bg-amber-500 text-black' : index === 1 ? 'bg-slate-400 text-black' : 'bg-orange-700 text-white'}`}>
                                {index + 1}{index === 0 ? 'st' : index === 1 ? 'nd' : 'rd'}
                            </div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Rank {index + 1}</div>
                            <div className="text-sm md:text-base font-black text-white truncate max-w-full">{p.name}</div>
                            <div className="text-lg md:text-xl font-black text-indigo-400 tabular-nums">{p.total}</div>
                            {index === 0 && <Medal className="absolute -bottom-4 -left-4 w-16 h-16 text-amber-500/10 rotate-12" />}
                        </div>
                    ))}
                    {topRanked.length < 3 && Array.from({ length: 3 - topRanked.length }).map((_, i) => (
                        <div key={i} className="p-3 rounded-xl border border-white/5 bg-white/5 flex flex-col items-center justify-center opacity-50">
                            <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1">Rank {topRanked.length + i + 1}</div>
                            <div className="w-8 h-1 bg-white/10 rounded my-2"></div>
                        </div>
                    ))}
                </div>
            )}

            <style>{`
                input[type=number]::-webkit-inner-spin-button, 
                input[type=number]::-webkit-outer-spin-button { 
                    -webkit-appearance: none; 
                    margin: 0; 
                }
                input[type=number] {
                    -moz-appearance: textfield;
                }
            `}</style>

            <div className="glass-card overflow-hidden rounded-2xl border border-white/10 shadow-2xl relative">
                {/* Spectator Waiting Screen */}
                {(isSpectator && !isLocked) ? (
                    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 animate-pulse">
                            <Lock className="w-8 h-8 text-slate-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">결과 집계 중입니다</h3>
                        <p className="text-slate-400 text-sm max-w-xs">
                            모든 심사가 완료되고 관리자가 결과를 확정하면<br />순위와 총점을 확인할 수 있습니다.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse min-w-max">
                                <thead>
                                    <tr className="bg-gradient-to-r from-slate-900 to-slate-800 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-white/10">
                                        <th className="sticky left-0 z-20 bg-slate-900/95 backdrop-blur-sm px-4 py-4 w-16 text-center shadow-[1px_0_0_rgba(255,255,255,0.1)]">No.</th>
                                        <th className="sticky left-16 z-20 bg-slate-900/95 backdrop-blur-sm px-4 py-4 min-w-[160px] shadow-[4px_0_10px_rgba(0,0,0,0.5)]">Participant</th>
                                        {sortedItems.map(item => {
                                            const match = item.label.match(/^([^(]+)(\(([^)]+)\))?$/);
                                            const mainLabel = match ? match[1].trim() : item.label;
                                            const subLabel = match && match[3] ? match[3].trim() : '';
                                            return (
                                                <th key={item.id} className="px-2 py-4 text-center min-w-[70px]">
                                                    <div className="flex flex-col items-center justify-center leading-tight">
                                                        <span className="text-indigo-200 mobile:text-xs font-bold text-sm mb-1.5">{mainLabel}</span>
                                                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-bold text-indigo-300">
                                                            5.5 ~ 9.9
                                                        </span>
                                                        {subLabel && <span className="text-[10px] text-indigo-400/70 mt-1">{subLabel}</span>}
                                                    </div>
                                                </th>
                                            );
                                        })}
                                        <th className="px-4 py-4 w-24 text-center text-indigo-400 sticky right-0 z-20 bg-slate-900/95 backdrop-blur-sm shadow-[-4px_0_10px_rgba(0,0,0,0.5)]">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {rankedParticipants.length === 0 ? (
                                        <tr>
                                            <td colSpan={3 + sortedItems.length} className="px-6 py-20 text-center">
                                                <AlertCircle className="mx-auto text-slate-600 mb-4 w-12 h-12" />
                                                <p className="text-slate-500 font-bold">이 종목에 등록된 참가자가 없습니다.</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        [...rankedParticipants]
                                            .sort((a, b) => parseInt(a.number || 0, 10) - parseInt(b.number || 0, 10))
                                            .map((p) => {
                                                const displayTotal = getParticipantTotal(p.id).toFixed(2);

                                                return (
                                                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                                                        <td className="sticky left-0 z-10 bg-[#0f172a]/95 backdrop-blur-sm px-4 py-3 text-center font-black text-slate-600 text-lg shadow-[1px_0_0_rgba(255,255,255,0.05)] group-hover:bg-[#151e32]/95 transition-colors">
                                                            {p.number}
                                                        </td>
                                                        <td className="sticky left-16 z-10 bg-[#0f172a]/95 backdrop-blur-sm px-4 py-3 shadow-[4px_0_10px_rgba(0,0,0,0.3)] group-hover:bg-[#151e32]/95 transition-colors text-xs">
                                                            <div className="flex items-center gap-2">
                                                                <div className="font-bold text-white text-base truncate max-w-[150px]">{p.name}</div>
                                                                {((isAdmin && !isJudgeForThisComp) || (isSpectator && isLocked)) && (
                                                                    <span className="text-[12px] font-black px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.3)]">
                                                                        R{p.rank}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        {sortedItems.map(item => {
                                                            // Special handling for Teamwork
                                                            const isTeamwork = item.label === '팀워크';
                                                            const isDisabled = (isSolo && isTeamwork);

                                                            if (isDisabled) {
                                                                return (
                                                                    <td key={item.id} className="px-2 py-2 text-center">
                                                                        <div className="text-[10px] font-bold text-slate-700 italic select-none">-</div>
                                                                    </td>
                                                                );
                                                            }

                                                            // Spectator View (Locked) OR Admin Monitoring View
                                                            if ((isSpectator && isLocked) || (isAdmin && !isJudgeForThisComp)) {
                                                                const avgScore = getAverageItemScore(p.id, item.id);
                                                                return (
                                                                    <td key={item.id} className="px-1 py-1">
                                                                        <div className="flex flex-col items-center justify-center p-1 bg-white/[0.03] rounded-lg h-12 border border-white/5">
                                                                            <div className={cn(
                                                                                "text-sm font-black tabular-nums",
                                                                                avgScore !== '-' ? "text-indigo-400" : "text-slate-600"
                                                                            )}>
                                                                                {avgScore}
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                );
                                                            }

                                                            // Standard Input View (Judge / Admin-Judge)
                                                            const currentVal = localScores[p.id]?.[item.id];
                                                            const isWarning = currentVal && parseFloat(currentVal) < 5.5;
                                                            const isActive = currentVal !== undefined && currentVal !== '';

                                                            return (
                                                                <td key={item.id} className="px-1 py-1">
                                                                    <div className={cn(
                                                                        "relative flex items-center justify-center w-full h-12 rounded-lg transition-all border",
                                                                        isActive ? "bg-indigo-500/10 border-indigo-500/30" : "bg-white/5 border-transparent",
                                                                        isLocked && "opacity-40 grayscale-[0.5]",
                                                                        isWarning && "border-rose-500/50 bg-rose-500/10"
                                                                    )}>
                                                                        <input
                                                                            type="number"
                                                                            inputMode="decimal"
                                                                            step="0.1"
                                                                            min="5.5"
                                                                            max="9.9"
                                                                            disabled={isLocked}
                                                                            value={localScores[p.id]?.[item.id] ?? ''}
                                                                            onChange={(e) => handleScoreChange(p.id, item.id, e.target.value)}
                                                                            onWheel={(e) => e.target.blur()}
                                                                            className={cn(
                                                                                "w-full h-full bg-transparent text-center font-mono font-bold text-lg outline-none placeholder-white/10",
                                                                                isActive ? "text-indigo-400" : "text-white",
                                                                                isLocked ? "cursor-not-allowed" : "focus:text-indigo-400",
                                                                                isWarning && "text-rose-400 focus:text-rose-400"
                                                                            )}
                                                                            placeholder="-"
                                                                        />
                                                                        {isLocked && (
                                                                            <Lock size={10} className="absolute bottom-1 right-1 text-slate-500" />
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            );
                                                        })}

                                                        <td className="sticky right-0 z-10 bg-[#0f172a]/95 backdrop-blur-sm px-4 py-3 text-center shadow-[-4px_0_10px_rgba(0,0,0,0.3)] group-hover:bg-[#151e32]/95 transition-colors">
                                                            <div className="font-black text-lg text-indigo-400 tabular-nums">
                                                                {displayTotal}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-4 p-4 bg-slate-900/50">
                            {rankedParticipants.length === 0 ? (
                                <div className="text-center py-10">
                                    <AlertCircle className="mx-auto text-slate-600 mb-4 w-10 h-10" />
                                    <p className="text-slate-500 font-bold text-sm">참가자가 없습니다.</p>
                                </div>
                            ) : (
                                [...rankedParticipants]
                                    .sort((a, b) => parseInt(a.number || 0, 10) - parseInt(b.number || 0, 10))
                                    .map((p) => {
                                        const displayTotal = getParticipantTotal(p.id).toFixed(2);

                                        return (
                                            <div key={p.id} className="bg-slate-800/50 rounded-xl border border-white/10 overflow-hidden shadow-lg">
                                                {/* Card Header */}
                                                <div className="bg-slate-900/80 px-4 py-3 flex items-center justify-between border-b border-white/5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center font-black text-indigo-400 text-sm border border-indigo-500/30">
                                                            {p.number}
                                                        </div>
                                                        <span className="font-bold text-white truncate max-w-[120px]">{p.name}</span>
                                                        {((isAdmin && !isJudgeForThisComp) || (isSpectator && isLocked)) && (
                                                            <span className="text-[12px] font-black px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.3)]">
                                                                R{p.rank}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-[10px] text-slate-500 uppercase font-black block">Total</span>
                                                        <span className="text-xl font-black text-indigo-400 tabular-nums leading-none">{displayTotal}</span>
                                                    </div>
                                                </div>

                                                {/* Card Content - Scoring Grid */}
                                                <div className="p-4 grid grid-cols-2 gap-3">
                                                    {sortedItems.map(item => {
                                                        const isTeamwork = item.label === '팀워크';
                                                        const isDisabled = (isSolo && isTeamwork);

                                                        // Spectator/Monitoring View logic
                                                        if ((isSpectator && isLocked) || (isAdmin && !isJudgeForThisComp)) {
                                                            const avgScore = getAverageItemScore(p.id, item.id);
                                                            return (
                                                                <div key={item.id} className="bg-black/20 rounded-lg p-2 border border-white/5 flex flex-col items-center">
                                                                    <span className="text-xs text-indigo-300 font-bold mb-1 truncate w-full text-center bg-indigo-500/10 px-2 py-0.5 rounded-full">{item.label}</span>
                                                                    <span className={cn("text-lg font-bold tabular-nums", avgScore !== '-' ? "text-indigo-400" : "text-slate-600")}>
                                                                        {avgScore}
                                                                    </span>
                                                                </div>
                                                            );
                                                        }

                                                        const currentVal = localScores[p.id]?.[item.id];
                                                        const isWarning = currentVal && parseFloat(currentVal) < 5.5;
                                                        const isActive = currentVal !== undefined && currentVal !== '';

                                                        return (
                                                            <div key={item.id} className={cn(
                                                                "relative rounded-xl border transition-all p-2 flex flex-col items-center",
                                                                isActive ? "bg-indigo-500/10 border-indigo-500/30" : "bg-white/5 border-white/10",
                                                                isDisabled && "opacity-30 pointer-events-none",
                                                                isWarning && "border-rose-500/50 bg-rose-500/10"
                                                            )}>
                                                                <label className="text-xs text-indigo-300 font-bold mb-1 uppercase tracking-tight truncate w-full text-center bg-indigo-500/10 px-2 py-0.5 rounded-full">
                                                                    {item.label}
                                                                </label>
                                                                <div className={cn(
                                                                    "mb-2 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors",
                                                                    isWarning
                                                                        ? "bg-rose-500/20 border-rose-500/30 text-rose-400"
                                                                        : "bg-indigo-500/5 border-indigo-500/10 text-slate-400"
                                                                )}>
                                                                    5.5 ~ 9.9
                                                                </div>
                                                                {isDisabled ? (
                                                                    <span className="text-slate-600 font-bold py-2">-</span>
                                                                ) : (
                                                                    <div className="w-full relative">
                                                                        <input
                                                                            type="number"
                                                                            inputMode="decimal"
                                                                            step="0.1"
                                                                            min="5.5"
                                                                            max="9.9"
                                                                            disabled={isLocked}
                                                                            value={localScores[p.id]?.[item.id] ?? ''}
                                                                            onChange={(e) => handleScoreChange(p.id, item.id, e.target.value)}
                                                                            onWheel={(e) => e.target.blur()}
                                                                            className={cn(
                                                                                "w-full bg-transparent text-center font-mono font-black text-2xl outline-none py-1",
                                                                                isActive ? "text-indigo-400" : "text-white",
                                                                                isLocked ? "cursor-not-allowed" : "focus:text-indigo-400"
                                                                            )}
                                                                            placeholder="-"
                                                                        />
                                                                        {isLocked && <Lock size={12} className="absolute bottom-2 right-2 text-slate-500" />}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Detailed Judge Breakdown Table (Admin Only) */}
            {isAdmin && (
                <div className="mt-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="flex items-center gap-2 mb-6">
                        <Users className="text-emerald-400 w-6 h-6" />
                        <h2 className="text-xl font-bold text-white uppercase tracking-tight">상세 심사 내역 (심사위원별 세부 점수)</h2>
                    </div>

                    <div className="glass-card overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse border border-white/10">
                                <thead>
                                    <tr className="bg-slate-900 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10">
                                        <th className="px-4 py-4 w-12 text-center border-r border-white/10">No.</th>
                                        <th className="px-4 py-4 min-w-[150px] border-r border-white/10 text-center">Participant</th>
                                        <th className="px-4 py-4 min-w-[120px] border-r border-white/10 text-center">심사위원</th>
                                        {sortedItems.map(item => (
                                            <th key={item.id} className="px-2 py-4 text-center border-r border-white/10 min-w-[80px]">
                                                {item.label}
                                            </th>
                                        ))}
                                        <th className="px-4 py-4 w-20 text-center text-emerald-400">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...rankedParticipants].sort((a, b) => parseInt(a.number || 0, 10) - parseInt(b.number || 0, 10)).map((p, pIdx) => {
                                        const pScoresByJudge = scores[selectedCategoryId]?.[p.id] || {};
                                        const compJudges = judgesByComp?.[currentCompId] || [];

                                        if (compJudges.length === 0) return null;

                                        return compJudges.map((j, jIdx) => {
                                            const vals = pScoresByJudge[j.email] || {};
                                            const judgeTotal = Object.keys(vals).length > 0
                                                ? Object.values(vals).reduce((s, v) => s + (parseFloat(v) || 0), 0).toFixed(2)
                                                : '-';

                                            return (
                                                <tr key={`${p.id}-${j.email}`} className={cn(
                                                    "hover:bg-white/[0.02] transition-colors",
                                                    jIdx === compJudges.length - 1 && pIdx !== participantsSortedByNumber.length - 1 ? "border-b-2 border-white/20" : "border-b border-white/5"
                                                )}>
                                                    {jIdx === 0 && (
                                                        <>
                                                            <td rowSpan={compJudges.length} className="px-4 py-4 text-center font-black text-slate-300 text-lg border-r border-white/10 bg-slate-900/40">
                                                                {p.number}
                                                            </td>
                                                            <td rowSpan={compJudges.length} className="px-4 py-4 font-bold text-white border-r border-white/10 bg-slate-900/40 text-center">
                                                                {p.name}
                                                            </td>
                                                        </>
                                                    )}
                                                    <td className="px-4 py-4 font-bold text-slate-300 border-r border-white/10 text-center bg-white/[0.02]">
                                                        {j.name}
                                                    </td>
                                                    {sortedItems.map(item => {
                                                        const isTeamwork = item.label === '팀워크';
                                                        const isDisabled = (isSolo && isTeamwork);
                                                        const score = vals[item.id];

                                                        return (
                                                            <td key={item.id} className="px-2 py-4 text-center border-r border-white/10 tabular-nums font-mono font-bold text-slate-400">
                                                                {isDisabled ? '-' : (score !== undefined ? parseFloat(score).toFixed(1) : '-')}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-4 py-4 text-center font-black text-emerald-400 tabular-nums bg-emerald-500/5">
                                                        {judgeTotal}
                                                    </td>
                                                </tr>
                                            );
                                        });
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-8 flex justify-end text-xs text-slate-500 font-bold uppercase tracking-widest gap-4">
                {isSaving && (
                    <span className="flex items-center gap-2 animate-pulse text-emerald-400"><Save size={12} /> Saving...</span>
                )}
                <span className="flex items-center gap-2"><div className={cn("w-2 h-2 rounded-full", isSubmitted ? "bg-emerald-500" : "bg-amber-500")}></div> {isSubmitted ? "Submitted" : "Draft (Not Submitted)"}</span>
            </div>
        </div>
    );
};

export default Scorer;

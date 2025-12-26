import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PenTool, Lock, Save, AlertCircle, Medal } from 'lucide-react';
import useStore from '../store/useStore';

const Scorer = () => {
    const { scoringItems, updateScore, selectedCategoryId, scores, participants, currentUser, years, judgesByYear } = useStore();

    const categoryParticipants = participants[selectedCategoryId] || [];
    // localScores structure: { [participantId]: { [itemId]: value } }
    const [localScores, setLocalScores] = useState({});
    const [isSaving, setIsSaving] = useState(false);

    // Initial check logic
    const currentYear = years.find(y => y.categories?.some(c => c.id === selectedCategoryId));
    const currentYearId = currentYear?.id;
    const categoryName = currentYear?.categories.find(c => c.id === selectedCategoryId)?.name || '';
    const isSolo = categoryName.toUpperCase().includes('SOLO');

    // Auth & Lock logic
    const isYearLocked = currentYear?.locked;
    const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'ROOT_ADMIN';
    const isJudgeForThisYear = judgesByYear[currentYearId]?.some(j => j.email === currentUser?.email);

    // Auth: Everyone can view, but only Admin/Assigned Judge can edit
    const isAuthorized = true;
    const canEdit = isAdmin || isJudgeForThisYear;
    const isLocked = (isYearLocked && !isAdmin) || !canEdit;

    // Initialize local scores from store
    useEffect(() => {
        if (!selectedCategoryId || !currentUser) return;

        const initialScores = {};
        categoryParticipants.forEach(p => {
            const userScores = scores[selectedCategoryId]?.[p.id]?.[currentUser.email] || {};
            initialScores[p.id] = { ...userScores };
        });
        setLocalScores(initialScores);
    }, [selectedCategoryId, scores, participants, currentUser]);

    const handleScoreChange = (participantId, itemId, val) => {
        if (isLocked) return;

        if (val === '') {
            setLocalScores(prev => ({
                ...prev,
                [participantId]: { ...prev[participantId], [itemId]: '' }
            }));
            return;
        }

        let num = parseFloat(val);
        if (isNaN(num)) return;
        if (num > 10) num = 10;
        if (num < 0) num = 0;

        setLocalScores(prev => ({
            ...prev,
            [participantId]: { ...prev[participantId], [itemId]: num }
        }));
    };

    const handleBlur = async (participantId, itemId) => {
        if (isLocked) return;
        const val = localScores[participantId]?.[itemId];
        if (val === '' || val === undefined) return;

        setIsSaving(true);
        try {
            await updateScore(selectedCategoryId, participantId, itemId, val);
        } catch (e) {
            console.error("Save failed", e);
        } finally {
            setIsSaving(false);
        }
    };

    const calculateTotal = useCallback((pId, scoresObj = localScores) => {
        const pScores = scoresObj[pId] || {};
        return Object.values(pScores).reduce((sum, val) => {
            const num = parseFloat(val);
            return sum + (isNaN(num) ? 0 : num);
        }, 0).toFixed(1);
    }, [localScores]);

    // Sort scoring items
    const sortedItems = [...scoringItems].sort((a, b) => a.order - b.order);

    // Sort participants by Number
    const sortedParticipants = useMemo(() => {
        return [...categoryParticipants].sort((a, b) => {
            const numA = parseInt(a.number) || 0;
            const numB = parseInt(b.number) || 0;
            return numA - numB;
        });
    }, [categoryParticipants]);

    // Calculate Rankings
    const topRanked = useMemo(() => {
        const withScores = sortedParticipants.map(p => ({
            ...p,
            total: parseFloat(calculateTotal(p.id))
        })).filter(p => p.total > 0);

        return withScores.sort((a, b) => b.total - a.total).slice(0, 3);
    }, [sortedParticipants, calculateTotal]);

    if (!selectedCategoryId) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-10 fade-in">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-8 shadow-2xl shadow-indigo-500/30 animate-pulse">
                    <PenTool className="text-white w-10 h-10" />
                </div>
                <h1 className="text-3xl md:text-5xl font-black text-white mb-6 uppercase tracking-tight leading-tight">
                    공정한 심사로<br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">댄서들의 꿈</span>을<br />
                    이루게 해주세요.
                </h1>
            </div>
        );
    }

    if (!isAuthorized) {
        return (
            <div className="max-w-5xl mx-auto py-20 flex flex-col items-center justify-center text-center p-10 glass-card border-dashed border-2 border-slate-700">
                <Lock size={48} className="mb-4 text-rose-500 opacity-50" />
                <h2 className="text-2xl font-bold text-white mb-2">접근 권한이 없습니다</h2>
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
                    {(isLocked && !canEdit && !isAdmin) && (
                        <div className="bg-slate-500/20 border border-slate-500/50 px-4 py-2 rounded-lg flex items-center gap-2 text-slate-400 font-bold">
                            <Lock size={16} />
                            <span>READ ONLY</span>
                        </div>
                    )}
                    {(isLocked && (isAdmin || canEdit)) && (
                        <div className="bg-rose-500/20 border border-rose-500/50 px-4 py-2 rounded-lg flex items-center gap-2 text-rose-400 font-bold animate-pulse">
                            <Lock size={16} />
                            <span>LOCKED</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Top 3 Ranking Widget */}
            {topRanked.length > 0 && (
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
                <div className="overflow-x-auto custom-scrollbar">
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
                                                <span className="text-slate-300 mobile:text-[10px]">{mainLabel}</span>
                                                {subLabel && <span className="text-[9px] text-slate-600 mt-0.5">{subLabel}</span>}
                                            </div>
                                        </th>
                                    );
                                })}
                                <th className="px-4 py-4 w-24 text-center text-indigo-400 sticky right-0 z-20 bg-slate-900/95 backdrop-blur-sm shadow-[-4px_0_10px_rgba(0,0,0,0.5)]">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {sortedParticipants.length === 0 ? (
                                <tr>
                                    <td colSpan={3 + sortedItems.length} className="px-6 py-20 text-center">
                                        <AlertCircle className="mx-auto text-slate-600 mb-4 w-12 h-12" />
                                        <p className="text-slate-500 font-bold">이 종목에 등록된 참가자가 없습니다.</p>
                                    </td>
                                </tr>
                            ) : (
                                sortedParticipants.map((p) => {
                                    const total = calculateTotal(p.id);

                                    return (
                                        <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="sticky left-0 z-10 bg-[#0f172a]/95 backdrop-blur-sm px-4 py-3 text-center font-black text-slate-600 text-lg shadow-[1px_0_0_rgba(255,255,255,0.05)] group-hover:bg-[#151e32]/95 transition-colors">
                                                {p.number}
                                            </td>
                                            <td className="sticky left-16 z-10 bg-[#0f172a]/95 backdrop-blur-sm px-4 py-3 shadow-[4px_0_10px_rgba(0,0,0,0.3)] group-hover:bg-[#151e32]/95 transition-colors">
                                                <div className="font-bold text-white text-base truncate max-w-[180px]">{p.name}</div>
                                            </td>
                                            {sortedItems.map(item => {
                                                const isTeamwork = item.label === '팀워크';
                                                const isDisabled = (isSolo && isTeamwork);

                                                if (isDisabled) {
                                                    return (
                                                        <td key={item.id} className="px-2 py-2 text-center">
                                                            <div className="text-[10px] font-bold text-slate-700 italic select-none">-</div>
                                                        </td>
                                                    );
                                                }

                                                const isActive = localScores[p.id]?.[item.id] !== undefined && localScores[p.id]?.[item.id] !== '';

                                                return (
                                                    <td key={item.id} className="px-1 py-1">
                                                        <div className={`relative flex items-center justify-center w-full h-12 rounded-lg transition-colors border border-transparent ${isActive ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-white/5'}`}>
                                                            <input
                                                                type="number"
                                                                inputMode="decimal"
                                                                step="0.1"
                                                                min="0"
                                                                max="10"
                                                                disabled={isLocked}
                                                                value={localScores[p.id]?.[item.id] ?? ''}
                                                                onChange={(e) => handleScoreChange(p.id, item.id, e.target.value)}
                                                                onBlur={() => handleBlur(p.id, item.id)}
                                                                className="w-full h-full bg-transparent text-center font-mono font-bold text-lg text-white outline-none focus:text-indigo-400 placeholder-white/10"
                                                                placeholder="-"
                                                            />
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                            <td className="sticky right-0 z-10 bg-[#0f172a]/95 backdrop-blur-sm px-4 py-3 text-center shadow-[-4px_0_10px_rgba(0,0,0,0.3)] group-hover:bg-[#151e32]/95 transition-colors">
                                                <div className="font-black text-lg text-indigo-400 tabular-nums">
                                                    {total}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-8 flex justify-end text-xs text-slate-500 font-bold uppercase tracking-widest gap-4">
                {isSaving && (
                    <span className="flex items-center gap-2 animate-pulse text-emerald-400"><Save size={12} /> Saving...</span>
                )}
                <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Auto-Saving Enabled</span>
            </div>
        </div>
    );
};

export default Scorer;

import React, { useState, useEffect, useCallback } from 'react';
import { PenTool, Lock, Save, AlertCircle } from 'lucide-react';
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
    const isJudgeForThisYear = judgesByYear[currentYearId]?.some(j => j.email === currentUser?.email);
    const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'ROOT_ADMIN';
    const isAuthorized = isAdmin || isJudgeForThisYear;
    const isLocked = isYearLocked && !isAdmin;

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

        // Allow empty string for clearing
        if (val === '') {
            setLocalScores(prev => ({
                ...prev,
                [participantId]: {
                    ...prev[participantId],
                    [itemId]: ''
                }
            }));
            return;
        }

        let num = parseFloat(val);
        if (isNaN(num)) return;
        if (num > 10) num = 10;
        if (num < 0) num = 0;

        setLocalScores(prev => ({
            ...prev,
            [participantId]: {
                ...prev[participantId],
                [itemId]: num
            }
        }));
    };

    const handleBlur = async (participantId, itemId) => {
        if (isLocked) return;
        const val = localScores[participantId]?.[itemId];
        // If val is valid number (or 0), save it. If empty string, do nothing?
        // Existing logic used parseFloat. Let's save if valid number.
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

    const calculateTotal = (pId) => {
        const pScores = localScores[pId] || {};
        return Object.values(pScores).reduce((sum, val) => {
            const num = parseFloat(val);
            return sum + (isNaN(num) ? 0 : num);
        }, 0).toFixed(1);
    };

    // Sort scoring items
    const sortedItems = [...scoringItems].sort((a, b) => a.order - b.order);

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
                <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">
                    좌측 메뉴에서 심사할 종목을 선택해 주세요.
                </p>
            </div>
        );
    }

    if (!isAuthorized) {
        return (
            <div className="max-w-5xl mx-auto py-20 flex flex-col items-center justify-center text-center p-10 glass-card border-dashed border-2 border-slate-700">
                <Lock size={48} className="mb-4 text-rose-500 opacity-50" />
                <h2 className="text-2xl font-bold text-white mb-2">접근 권한이 없습니다</h2>
                <p className="text-slate-500">해당 연도의 심사 위원 또는 관리자만 접근할 수 있습니다.</p>
            </div>
        );
    }

    return (
        <div className="max-w-screen-xl mx-auto pb-20 px-4">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <PenTool className="text-amber-400 w-6 h-6" />
                        <span className="text-amber-400 font-bold tracking-widest text-xs uppercase">Scoring Room</span>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-black italic tracking-tighter uppercase text-white">
                        {categoryName}
                    </h1>
                </div>

                {isLocked && (
                    <div className="bg-rose-500/20 border border-rose-500/50 px-4 py-2 rounded-lg flex items-center gap-2 text-rose-400 font-bold animate-pulse">
                        <Lock size={16} />
                        <span>SCORING LOCKED</span>
                    </div>
                )}
                {isSaving && (
                    <div className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                        <Save size={12} className="animate-bounce" /> Saving...
                    </div>
                )}
            </div>

            <style>{`
                /* Hide number input arrows */
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
                                    // Parse label to separate Korean and English if needed
                                    // Assuming format "Korean (English)" or just "Korean"
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
                            {categoryParticipants.length === 0 ? (
                                <tr>
                                    <td colSpan={3 + sortedItems.length} className="px-6 py-20 text-center">
                                        <AlertCircle className="mx-auto text-slate-600 mb-4 w-12 h-12" />
                                        <p className="text-slate-500 font-bold">이 종목에 등록된 참가자가 없습니다.</p>
                                    </td>
                                </tr>
                            ) : (
                                categoryParticipants.map((p, index) => {
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
                <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Auto-Saving Enabled</span>
                <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Min: 0 / Max: 10</span>
            </div>
        </div>
    );
};

export default Scorer;

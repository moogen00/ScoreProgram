import React, { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, PenTool, CircleDashed } from 'lucide-react';
import useStore from '../store/useStore';

const CategoryProgressList = ({ compId }) => {
    const { competitions, scores, judgesByComp, participants } = useStore();
    const [expandedCatId, setExpandedCatId] = useState(null);

    const comp = competitions.find(y => y.id === compId);
    if (!comp) return null;

    const judges = judgesByComp[compId] || [];

    const getCategoryStats = (catId) => {
        const catPs = participants[catId] || [];
        const catScores = scores[catId] || {}; // { pId: { judgeEmail: ... } }

        let completed = 0;
        let required = catPs.length * judges.length;

        // Count total score entries
        Object.values(catScores).forEach(pScores => {
            completed += Object.keys(pScores).length;
        });

        const progress = required > 0 ? (completed / required) * 100 : 0;

        return {
            progress,
            completed,
            required,
            participantCount: catPs.length
        };
    };

    const getJudgeStatus = (catId, email) => {
        // Check submission
        // Need to check 'submittedCategories' in judge object if we had it easily accessible
        // But store structure is judgesByYear = [ { email, name, submittedCategories: {...} } ]
        // Wait, judgesByYear from store might not have 'submittedCategories' if it's not real-time synced deep user obj
        // Let's check how judges are loaded. 
        // Actually, we can check scores. 

        // If judge has scores for ALL participants in this category -> likely done
        // Or strictly use the 'submittedCategories' field if available.

        const judge = judges.find(j => j.email === email);
        const isSubmitted = judge?.submittedCategories?.[catId];

        if (isSubmitted) return 'done';

        // Check if has at least one score
        const catScores = scores[catId] || {};
        let hasScore = false;
        Object.values(catScores).forEach(pScores => {
            if (pScores[email]) hasScore = true;
        });

        if (hasScore) return 'scoring';
        return 'pending';
    };

    return (
        <div className="space-y-4">
            <h3 className="text-xl font-bold text-white mb-6">Category Progress</h3>
            <div className="grid gap-3">
                {comp.categories?.map(cat => {
                    const stats = getCategoryStats(cat.id);
                    const isExpanded = expandedCatId === cat.id;

                    return (
                        <div key={cat.id} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                            <div
                                onClick={() => setExpandedCatId(isExpanded ? null : cat.id)}
                                className="p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5 transition-colors"
                            >
                                <div className="flex-1">
                                    <div className="flex justify-between mb-2">
                                        <h4 className="font-bold text-white">{cat.name}</h4>
                                        <span className="text-xs font-mono text-indigo-400 font-bold">{stats.progress.toFixed(0)}%</span>
                                    </div>
                                    <div className="h-2 bg-black/50 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-indigo-600 to-purple-500 transition-all duration-500"
                                            style={{ width: `${stats.progress}%` }}
                                        />
                                    </div>
                                </div>
                                <div className="text-slate-500">
                                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="border-t border-white/10 bg-black/20 p-4">
                                    {/* Responsive Grid with Min-Width to prevent cramping */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
                                        {judges.map(judge => {
                                            const status = getJudgeStatus(cat.id, judge.email);
                                            return (
                                                <div key={judge.email} className="flex flex-wrap items-center justify-between p-3 rounded-lg bg-white/5 gap-2 border border-white/5">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-slate-200 truncate pr-2">{judge.name}</p>
                                                    </div>
                                                    <div className="flex-shrink-0">
                                                        {status === 'done' && (
                                                            <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2.5 py-1.5 rounded-lg border border-emerald-500/20 whitespace-nowrap">
                                                                <CheckCircle2 size={16} strokeWidth={3} />
                                                                <span className="text-xs font-black uppercase tracking-wider">채점완료</span>
                                                            </div>
                                                        )}
                                                        {status === 'scoring' && (
                                                            <div className="flex items-center gap-1.5 text-amber-400 bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-500/20 whitespace-nowrap">
                                                                <PenTool size={16} strokeWidth={3} className="animate-pulse" />
                                                                <span className="text-xs font-black uppercase tracking-wider">채점중</span>
                                                            </div>
                                                        )}
                                                        {status === 'pending' && (
                                                            <div className="flex items-center gap-1.5 text-slate-500 bg-slate-500/10 px-2.5 py-1.5 rounded-lg border border-slate-500/20 whitespace-nowrap">
                                                                <CircleDashed size={16} strokeWidth={3} />
                                                                <span className="text-xs font-black uppercase tracking-wider">채점전</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CategoryProgressList;

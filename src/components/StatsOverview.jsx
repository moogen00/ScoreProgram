import React, { useMemo } from 'react';
import { Users, CheckCircle, Activity, Clock } from 'lucide-react';
import useStore from '../store/useStore';

const StatsOverview = ({ compId }) => {
    const { competitions, scores, judgesByComp } = useStore();

    // 실시간 통계 계산 (Progress, Active Judges, Participants)
    const stats = useMemo(() => {
        if (!compId) return null;

        const comp = competitions.find(y => y.id === compId);
        const categories = comp?.categories || [];
        const judges = judgesByComp[compId] || [];

        let totalRequired = 0;
        let totalCompleted = 0;
        let activeJudgeEmails = new Set();

        // Calculate count of judges who have submitted at least one category OR have scores
        const activeJudgesCount = judges.filter(j => {
            const email = j.email.toLowerCase().trim();
            // Check if judge has marked ANY category in this comp as submitted
            const isAnySubmitted = Object.values(j.submittedCategories || {}).some(v => v === true);
            if (isAnySubmitted) return true;

            // Check if judge has at least one score entry in any category of this comp
            return categories.some(cat => {
                const catScores = scores[cat.id] || {};
                return Object.values(catScores).some(pScores => !!pScores[email]);
            });
        }).length;

        categories.forEach(cat => {
            // Count how many judges have submitted this specific category
            judges.forEach(judge => {
                if (judge.submittedCategories?.[cat.id]) {
                    totalCompleted++;
                }
            });

            // Each category requires all judges to submit
            totalRequired += judges.length;
        });

        // 대회 내 모든 종목 참가자 합계
        const totalParticipants = categories.reduce((sum, cat) => {
            return sum + (useStore.getState().participants[cat.id]?.length || 0);
        }, 0);

        const progress = totalRequired > 0 ? (totalCompleted / totalRequired) * 100 : 0;

        return {
            totalJudges: judges.length,
            activeJudges: activeJudgesCount,
            progress: Math.min(progress, 100),
            completedCount: totalCompleted,
            requiredCount: totalRequired,
            totalParticipants
        };
    }, [compId, competitions, scores, judgesByComp]);

    if (!stats) return null;

    return (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-8">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 relative overflow-hidden group">
                <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg shrink-0">
                    <Activity size={20} className="md:w-6 md:h-6" />
                </div>
                <div className="min-w-0 flex-1 z-10">
                    <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold tracking-wider mb-1 break-words leading-tight">Total Progress</p>
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                        <h3 className="text-xl md:text-2xl font-black text-white">{stats.progress.toFixed(1)}%</h3>
                        <span className="text-[10px] md:text-xs text-slate-500 font-bold">({stats.completedCount}/{stats.requiredCount})</span>
                    </div>
                </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 relative overflow-hidden">
                <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg shrink-0">
                    <CheckCircle size={20} className="md:w-6 md:h-6" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold tracking-wider mb-1 break-words leading-tight">Active Judges</p>
                    <h3 className="text-xl md:text-2xl font-black text-white">{stats.activeJudges} <span className="text-sm text-slate-500">/ {stats.totalJudges}</span></h3>
                </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 relative overflow-hidden col-span-2 lg:col-span-1">
                <div className="p-3 bg-amber-500/10 text-amber-400 rounded-lg shrink-0">
                    <Users size={20} className="md:w-6 md:h-6" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold tracking-wider mb-1 break-words leading-tight">Participants</p>
                    <h3 className="text-xl md:text-2xl font-black text-white">{stats.totalParticipants}</h3>
                </div>
            </div>
        </div>
    );
};

export default StatsOverview;

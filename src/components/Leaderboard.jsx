import React, { useMemo } from 'react';
import { TrendingUp, User as UserIcon, Trophy, Award, ChevronDown, ChevronUp } from 'lucide-react';
import useStore from '../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
    return twMerge(clsx(inputs));
}

const Leaderboard = () => {
    const { scoringItems, scores, selectedCategoryId, participants, currentUser } = useStore();
    const [expandedPId, setExpandedPId] = React.useState(null);

    const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'ROOT_ADMIN';

    const categoryParticipants = participants[selectedCategoryId] || [];
    const categoryScores = scores[selectedCategoryId] || {};

    // Map judges to J1, J2...
    const scoredJudges = new Set();
    Object.values(categoryScores).forEach(pScores => {
        Object.keys(pScores).forEach(jEmail => scoredJudges.add(jEmail));
    });

    const judgeMap = {};
    Array.from(scoredJudges).sort().forEach((email, idx) => {
        judgeMap[email] = `J${idx + 1}`;
    });

    const sortedJudges = Object.entries(judgeMap).sort((a, b) => a[1].localeCompare(b[1]));

    // Calculate rankings
    const leaderboardData = useMemo(() => {
        const scored = categoryParticipants.map(p => {
            const pScores = categoryScores[p.id] || {};
            let totalSum = 0;
            const judgeBreakdown = {};
            const judgeEmails = Object.keys(pScores);
            const judgeCount = judgeEmails.length;

            judgeEmails.forEach(jEmail => {
                const itemScores = pScores[jEmail] || {};
                const jTotal = Object.values(itemScores).reduce((a, b) => a + b, 0);
                judgeBreakdown[judgeMap[jEmail]] = jTotal;
                totalSum += jTotal;
            });

            const average = judgeCount > 0 ? totalSum / judgeCount : 0;
            return { ...p, totalSum, average, judgeCount, judgeBreakdown, pScores };
        }).sort((a, b) => b.average - a.average);

        // Standard Competition Ranking O(N log N)
        const rankMap = new Map();
        let currentRank = 1;
        scored.forEach((d, idx) => {
            if (idx > 0 && d.average < scored[idx - 1].average) {
                currentRank = idx + 1;
            }
            rankMap.set(d.id, d.average > 0 ? currentRank : '-');
        });

        return scored.map(d => ({
            ...d,
            rank: rankMap.get(d.id)
        }));
    }, [categoryParticipants, categoryScores, judgeMap]);

    const finalLeaderboard = leaderboardData;

    return (
        <div className="max-w-6xl mx-auto pb-12">
            <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-3">
                    <TrendingUp className="text-emerald-400 w-8 h-8" />
                    <h1 className="text-3xl font-black italic tracking-tight uppercase">Leaderboard</h1>
                </div>
                <div className="px-5 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Live Scoring Active</span>
                </div>
            </div>

            <div className="glass-card overflow-hidden border border-white/5">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white/5 border-b border-white/10 text-slate-500 uppercase text-[10px] font-black tracking-widest">
                                <th className="px-8 py-6 w-20">Rank</th>
                                <th className="px-6 py-6 min-w-[200px]">Team</th>
                                {sortedJudges.map(([email, jId]) => (
                                    <th key={email} className="px-6 py-6 text-center border-l border-white/5 bg-white/[0.02]">
                                        <div className="flex flex-col items-center">
                                            <span className="text-indigo-400">{jId}</span>
                                            <span className="text-[8px] opacity-30 lowercase font-normal">{email.split('@')[0]}</span>
                                        </div>
                                    </th>
                                ))}
                                <th className="px-8 py-6 text-right border-l border-white/10 bg-indigo-500/5 text-emerald-400 font-black">Average Score</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-medium">
                            {finalLeaderboard.map((data, index) => (
                                <React.Fragment key={data.id}>
                                    <tr
                                        className={cn(
                                            "group hover:bg-white/[0.02] transition-colors cursor-pointer",
                                            expandedPId === data.id && "bg-indigo-500/[0.05]"
                                        )}
                                        onClick={() => isAdmin && setExpandedPId(expandedPId === data.id ? null : data.id)}
                                    >
                                        <td className="px-8 py-6">
                                            {data.rank === 1 ? (
                                                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-500 font-black italic shadow-lg shadow-amber-500/10">1st</div>
                                            ) : data.rank === 2 ? (
                                                <div className="w-10 h-10 rounded-xl bg-slate-400/20 border border-slate-400/40 flex items-center justify-center text-slate-400 font-black italic">2nd</div>
                                            ) : data.rank === 3 ? (
                                                <div className="w-10 h-10 rounded-xl bg-orange-700/20 border border-orange-700/40 flex items-center justify-center text-orange-700 font-black italic">3rd</div>
                                            ) : (
                                                <span className="text-slate-600 pl-4">{data.rank}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center text-[10px] font-black text-slate-500">
                                                    {data.number}
                                                </div>
                                                <span className="text-xl font-black text-white group-hover:text-indigo-400 transition-colors uppercase tracking-tighter">{data.name}</span>
                                            </div>
                                        </td>
                                        {sortedJudges.map(([email, jId]) => (
                                            <td key={email} className="px-6 py-6 text-center border-l border-white/5 font-mono text-slate-400 group-hover:text-white transition-colors">
                                                {data.judgeBreakdown[jId]?.toFixed(1) || <span className="opacity-10">-</span>}
                                            </td>
                                        ))}
                                        <td className="px-8 py-6 text-right border-l border-white/10 bg-indigo-500/5">
                                            <div className="flex items-center justify-end gap-3">
                                                <div className="flex flex-col items-end">
                                                    <span className="text-3xl font-black text-white tabular-nums">
                                                        {data.average.toFixed(2)}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500 font-mono">Sum: {data.totalSum.toFixed(1)}</span>
                                                </div>
                                                {isAdmin && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setExpandedPId(expandedPId === data.id ? null : data.id);
                                                        }}
                                                        className="p-1 hover:bg-white/10 rounded transition-colors text-slate-500"
                                                    >
                                                        {expandedPId === data.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {isAdmin && expandedPId === data.id && (
                                        <tr className="bg-indigo-500/[0.03]">
                                            <td colSpan={3 + sortedJudges.length} className="px-8 py-8">
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in slide-in-from-top-2 duration-300">
                                                    {sortedJudges.map(([email, jId]) => {
                                                        const pScores = categoryScores[data.id] || {};
                                                        const judgeScores = pScores[email] || {};
                                                        const judgeTotal = Object.values(judgeScores).reduce((a, b) => a + b, 0);

                                                        return (
                                                            <div key={email} className="glass-card p-5 border-white/5 bg-black/20">
                                                                <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                                                                    <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">{jId} 상세 점수</span>
                                                                    <span className="text-sm font-black text-white">{judgeTotal.toFixed(1)}</span>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    {scoringItems.map(item => (
                                                                        <div key={item.id} className="flex justify-between items-center text-[11px]">
                                                                            <span className="text-slate-500">{item.label}</span>
                                                                            <span className="font-mono text-slate-300">{(judgeScores[item.id] || 0).toFixed(1)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                            {leaderboardData.length === 0 && (
                                <tr>
                                    <td colSpan={3 + sortedJudges.length} className="px-8 py-32 text-center text-slate-600 italic border-dashed border-2 border-white/5 rounded-b-3xl">
                                        심사 결과가 표시될 참가자가 없습니다.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-card p-8 bg-gradient-to-br from-indigo-500/5 to-transparent border-white/5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400"><Award size={20} /></div>
                        <h4 className="font-black uppercase tracking-widest text-white text-sm">심사 투명성</h4>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed">
                        모든 심사위원(J1~J{sortedJudges.length || 'n'})의 점수가 실시간으로 합산되어 공개됩니다.
                        동점 발생 시 각 종목별 세부 기술 규정에 따라 최종 순위가 결정됩니다.
                    </p>
                </div>
                <div className="glass-card p-8 bg-gradient-to-br from-amber-500/5 to-transparent border-white/5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400"><Trophy size={20} /></div>
                        <h4 className="font-black uppercase tracking-widest text-white text-sm">실시간 데이터 동기화</h4>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed">
                        심사위원이 저장을 완료하는 즉시 스코어보드에 반영됩니다.
                        기술적 오류나 네트워크 지연 시 관리팀에 즉시 문의해 주시기 바랍니다.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Leaderboard;

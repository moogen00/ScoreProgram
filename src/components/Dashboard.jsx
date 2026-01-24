import React from 'react';
import useStore from '../store/useStore';
import { motion } from 'framer-motion';
import StatsOverview from './StatsOverview';
import CategoryProgressList from './CategoryProgressList';

const Dashboard = () => {
    const { competitions, currentUser } = useStore();
    const [selectedCompId, setSelectedCompId] = React.useState('');

    const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'ROOT_ADMIN';

    React.useEffect(() => {
        if (!selectedCompId && competitions.length > 0) {
            setSelectedCompId(competitions[0].id);
        }
    }, [competitions, selectedCompId]);

    return (
        <div className="max-w-7xl mx-auto min-h-[70vh] p-4 md:p-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8 }}
                    className="relative pl-6"
                >
                    {/* Decorative accent line */}
                    <div className="absolute left-0 top-2 bottom-2 w-1.5 bg-gradient-to-b from-indigo-500 via-purple-500 to-transparent rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>

                    <div className="flex flex-col">
                        <span className="text-lg md:text-2xl font-bold tracking-[0.3em] text-indigo-300 uppercase mb-0">
                            Latin Dance Competition
                        </span>
                        <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter text-white uppercase leading-[0.9] drop-shadow-xl bg-gradient-to-r from-white via-white to-slate-400 bg-clip-text text-transparent">
                            Score System
                        </h1>
                    </div>

                    <p className="text-slate-400 text-sm md:text-base font-medium mt-3 max-w-xl leading-relaxed">
                        <span className="text-indigo-400 font-bold">{currentUser?.name || '심사위원'}</span>님 환영합니다.<br className="md:hidden" /> 오늘도 공정한 심사를 부탁드립니다.
                    </p>
                </motion.div>

                {/* Competition Select - Admin Only */}
                {(isAdmin && competitions.length > 0) && (
                    <div className="w-full md:w-auto">
                        <select
                            value={selectedCompId}
                            onChange={(e) => setSelectedCompId(e.target.value)}
                            className="w-full md:w-auto md:min-w-[12rem] bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500/50 font-bold"
                        >
                            {competitions.map(y => (
                                <option key={y.id} value={y.id}>{y.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Admin Only Monitoring Section */}
            {isAdmin ? (
                selectedCompId ? (
                    <div className="space-y-8">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                        >
                            <StatsOverview compId={selectedCompId} />
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.4 }}
                        >
                            <CategoryProgressList compId={selectedCompId} />
                        </motion.div>
                    </div>
                ) : (
                    <div className="text-center py-20 opacity-50">
                        <p className="text-white">등록된 대회가 없습니다.</p>
                    </div>
                )
            ) : (
                /* Judge/User View - Just Clean Space */
                <div className="mt-20 flex flex-col items-center justify-center text-center opacity-30">
                    <div className="w-24 h-1 bg-white/10 rounded-full mb-4"></div>
                    <p className="text-slate-500 text-sm">좌측 메뉴에서 심사할 종목을 선택해 주세요.</p>
                </div>
            )}
        </div>
    );
};

export default Dashboard;

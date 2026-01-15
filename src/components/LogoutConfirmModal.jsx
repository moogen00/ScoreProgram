import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, AlertTriangle, X } from 'lucide-react';

const LogoutConfirmModal = ({ isOpen, onConfirm, onCancel }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                        onClick={onCancel}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-md glass-card p-8 border-rose-500/20 shadow-2xl shadow-rose-500/10 overflow-hidden"
                    >
                        {/* Background accent */}
                        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-rose-500/20 rounded-2xl flex items-center justify-center mb-6 border border-rose-500/30">
                                <LogOut className="text-rose-500 w-8 h-8" />
                            </div>

                            <h2 className="text-2xl font-black text-white mb-2 uppercase italic tracking-tight">로그아웃 하시겠습니까?</h2>
                            <div className="flex items-center gap-2 text-rose-400 mb-6 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                                <AlertTriangle size={14} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Session Termination</span>
                            </div>

                            <p className="text-slate-400 text-sm leading-relaxed mb-8">
                                서비스에서 로그아웃하고 이전 화면으로 돌아가시겠습니까?<br />
                                저장되지 않은 정보가 있을 수 있습니다.
                            </p>

                            <div className="grid grid-cols-2 gap-4 w-full">
                                <button
                                    onClick={onCancel}
                                    className="px-6 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all border border-white/10 active:scale-95 flex items-center justify-center gap-2"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={onConfirm}
                                    className="px-6 py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-lg shadow-rose-600/30 active:scale-95 flex items-center justify-center gap-2"
                                >
                                    로그아웃
                                </button>
                            </div>
                        </div>

                        <button
                            onClick={onCancel}
                            className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default LogoutConfirmModal;

import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import useStore from '../store/useStore';
import { Trophy, LogIn } from 'lucide-react';
import { motion } from 'framer-motion';

const LoginPage = () => {
    const login = useStore((state) => state.login);

    const handleSuccess = (credentialResponse) => {
        const decoded = jwtDecode(credentialResponse.credential);
        login({
            email: decoded.email,
            name: decoded.name,
            picture: decoded.picture
        });
    };

    const handleError = () => {
        console.log('Login Failed');
    };

    // Mock login for testing
    const handleMockLogin = (email) => {
        login({
            email,
            name: email === 'moogen00@gmail.com' ? 'Admin User' : 'Judge User',
            picture: null
        });
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
            {/* Animated Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] animate-pulse delay-700" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card max-w-md w-full p-10 text-center relative z-10"
            >
                <div className="w-20 h-20 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.5)] mx-auto mb-8">
                    <Trophy className="text-white w-10 h-10" />
                </div>

                <h1 className="text-4xl font-black bg-gradient-to-r from-white to-white/40 bg-clip-text text-transparent mb-2">
                    Score
                </h1>
                <p className="text-slate-400 text-sm mb-10 tracking-widest uppercase font-bold">
                    Competition Manager
                </p>

                <div className="space-y-6">
                    <div className="flex justify-center">
                        <GoogleLogin
                            onSuccess={handleSuccess}
                            onError={handleError}
                            theme="filled_black"
                            shape="pill"
                            text="signin_with"
                        />
                    </div>

                    <div className="relative py-4">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-slate-900 px-4 text-slate-500 font-bold">또는 (테스트용)</span></div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        <button
                            onClick={() => handleMockLogin('moogen00@gmail.com')}
                            className="w-full py-3 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-sm text-slate-300 flex items-center justify-center gap-2"
                        >
                            <LogIn size={16} className="text-rose-400" />
                            관리자로 로그인
                        </button>
                        <button
                            onClick={() => handleMockLogin('judge@example.com')}
                            className="w-full py-3 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-sm text-slate-300 flex items-center justify-center gap-2"
                        >
                            <LogIn size={16} className="text-amber-400" />
                            심사위원으로 로그인 (메일 등록 필요)
                        </button>
                        <button
                            onClick={() => {
                                login({ email: 'user@example.com', name: 'General User', picture: null });
                            }}
                            className="w-full py-3 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-sm text-slate-300 flex items-center justify-center gap-2"
                        >
                            <LogIn size={16} className="text-emerald-400" />
                            일반 사용자로 시작
                        </button>
                    </div>
                </div>

                <p className="mt-10 text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                    © 2025 Korea Latin Dance Cup
                </p>
            </motion.div>
        </div>
    );
};

export default LoginPage;

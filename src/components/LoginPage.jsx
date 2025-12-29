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
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-slate-900 px-4 text-slate-500 font-bold">Dev Login (No Auth Required)</span></div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        <button
                            onClick={() => handleMockLogin('moogen00@gmail.com')}
                            className="w-full py-3 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-sm text-slate-300 flex items-center justify-center gap-2"
                        >
                            <LogIn size={16} className="text-rose-400" />
                            관리자로 로그인 (Admin)
                        </button>
                        <button
                            onClick={() => handleMockLogin('judge@example.com')}
                            className="w-full py-3 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-sm text-slate-300 flex items-center justify-center gap-2"
                        >
                            <LogIn size={16} className="text-amber-400" />
                            심사위원으로 로그인 (Judge)
                        </button>

                        {/* Custom Email Login Box */}
                        <div className="flex flex-col gap-2 p-3 bg-white/5 border border-white/10 rounded-xl mt-2">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-left px-1">임의 계정 테스트 (Custom Email Login)</p>
                            <div className="flex gap-2">
                                <input
                                    id="custom-email"
                                    type="email"
                                    placeholder="test@example.com"
                                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleMockLogin(e.target.value);
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => {
                                        const email = document.getElementById('custom-email').value;
                                        if (email) handleMockLogin(email);
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all"
                                >
                                    Login
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <p className="mt-10 text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                    © 2025 Korea Latin Dance Cup
                </p>
            </motion.div >
        </div >
    );
};

export default LoginPage;

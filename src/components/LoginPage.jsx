import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { signInAnonymously } from 'firebase/auth';
import useStore from '../store/useStore';
import { auth } from '../lib/firebase';
import { Trophy, LogIn, Users } from 'lucide-react';
import { motion } from 'framer-motion';

const LoginPage = () => {
    const { login, admins, judgesByYear } = useStore();

    const handleSuccess = (credentialResponse) => {
        const decoded = jwtDecode(credentialResponse.credential);
        const email = decoded.email;

        // Check permissions
        const rootAdmins = (import.meta.env.VITE_ROOT_ADMIN_EMAILS || '').split(',').map(e => e.trim());
        const isRootAdmin = rootAdmins.includes(email);
        const isAdmin = isRootAdmin || Object.values(admins || {}).some(a => a.email === email);
        const isJudge = Object.values(judgesByYear || {}).some(yearJudges => yearJudges.some(j => j.email === email));

        // REMOVED Strict Check: Allow all users to log in, Role is handled by syncUserRole
        /*
        if (!isAdmin && !isJudge) {
            alert('권한이 없는 계정입니다. (Unauthorized Account)\n\n관리자나 심사위원으로 등록된 계정만 로그인할 수 있습니다.');
            return; // STOP EXECUTION: Do not proceed to login
        }
        */

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

                    {import.meta.env.DEV && (
                        <div className="relative py-4">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                            <div className="relative flex justify-center text-xs uppercase"><span className="bg-slate-900 px-4 text-slate-500 font-bold">Dev Login (No Auth Required)</span></div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-3">
                        {import.meta.env.DEV && (
                            <>
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
                            </>
                        )}

                        {import.meta.env.VITE_ENABLE_SPECTATOR === 'true' && (
                            <>
                                <div className="relative py-2">
                                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                                    <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-slate-900 px-2 text-slate-600 font-bold">Public Access</span></div>
                                </div>

                                <button
                                    onClick={async () => {
                                        try {
                                            await signInAnonymously(auth);
                                            login({
                                                email: 'guest@score.com',
                                                name: 'Spectator',
                                                role: 'SPECTATOR',
                                                picture: null
                                            });
                                        } catch (error) {
                                            console.error("Spectator login failed", error);

                                            // Debug Config Loading
                                            const config = auth.app.options;
                                            const isConfigLoaded = config && config.apiKey && config.authDomain;

                                            let msg = "관람객 입장 중 오류가 발생했습니다.";
                                            if (!isConfigLoaded) {
                                                msg += "\n\n[설정 오류] Firebase 환경변수(.env)가 로드되지 않았습니다.\n.env 파일을 확인하거나 서버를 재시작해주세요.";
                                            } else if (error.code === 'auth/configuration-not-found') {
                                                msg += "\n\n[Firebase 설정 원인]\nFirebase Console의 'Authentication' 메뉴가 활성화되지 않았습니다.\nConsole로 이동하여 'Authentication' > '시작하기'를 클릭해주세요.";
                                            } else if (error.code === 'auth/operation-not-allowed' || error.code === 'auth/admin-restricted-operation') {
                                                msg += "\n\n[권한 원인]\nFirebase Console에서 '익명(Anonymous)' 로그인이 활성화되지 않았습니다.\nAuthentication -> Sign-in method 탭에서 '익명'을 찾아 사용 설정해주세요.";
                                            } else {
                                                msg += `\n(${error.code}: ${error.message})`;
                                            }
                                            alert(msg);
                                        }
                                    }}
                                    className="w-full py-3 px-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 transition-all font-bold text-sm text-indigo-300 flex items-center justify-center gap-2 group"
                                >
                                    <Users size={16} className="text-indigo-400 group-hover:scale-110 transition-transform" />
                                    관람객 입장 (Spectator Entry)
                                </button>
                            </>
                        )}
                        {/* Custom Email Login Box */}
                        {import.meta.env.DEV && (
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
                        )}
                    </div >
                </div >

                <p className="mt-10 text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                    © 2025 Korea Latin Dance Cup
                </p>
            </motion.div >
        </div >
    );
};

export default LoginPage;

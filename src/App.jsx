import React from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import MainContent from './components/MainContent';
import LoginPage from './components/LoginPage';
import DebugPanel from './components/DebugPanel';
import useStore from './store/useStore';
import LogoutConfirmModal from './components/LogoutConfirmModal';

function App() {
    window.store = useStore;
    const currentUser = useStore((state) => state.currentUser);
    const initSync = useStore((state) => state.initSync);
    const logout = useStore((state) => state.logout);

    const [sidebarWidth, setSidebarWidth] = React.useState(320);
    const [isResizing, setIsResizing] = React.useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false);
    const [isLogoutModalOpen, setIsLogoutModalOpen] = React.useState(false);

    const isTrappingRef = React.useRef(false);

    const startResizing = React.useCallback(() => {
        setIsResizing(true);
    }, []);

    const stopResizing = React.useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = React.useCallback((mouseMoveEvent) => {
        if (isResizing) {
            const newWidth = mouseMoveEvent.clientX;
            if (newWidth >= 200 && newWidth <= 600) {
                setSidebarWidth(newWidth);
            }
        }
    }, [isResizing]);

    React.useEffect(() => {
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [resize, stopResizing]);

    React.useEffect(() => {
        initSync();

        // Handle back/forward navigation
        const handlePopState = (event) => {
            if (event.state) {
                if (event.state.type === 'exit-trap') {
                    // Back button reached the "end" of our app history
                    isTrappingRef.current = true;
                    setIsLogoutModalOpen(true);
                    // Stay in the app by going "forward" back to the previous view
                    window.history.forward();
                } else {
                    const { activeView, selectedCategoryId, adminTab } = event.state;
                    const state = useStore.getState();
                    state.setActiveView(activeView);
                    state.setSelectedCategoryId(selectedCategoryId);
                    useStore.setState({ adminTab: adminTab || 'scoring' });

                    // Only close the modal if we are NOT in the middle of trapping the back button
                    if (!isTrappingRef.current) {
                        setIsLogoutModalOpen(false);
                    }
                }
            }
            // Reset the trap flag for the next event
            setTimeout(() => {
                isTrappingRef.current = false;
            }, 0);
        };

        window.addEventListener('popstate', handlePopState);

        // Setup History Trap if logged in
        if (currentUser) {
            if (!window.history.state || window.history.state.type !== 'initial') {
                // 1. Mark the exit trap (if user goes back from here, they leave the site)
                window.history.replaceState({ type: 'exit-trap' }, '');
                // 2. Push the actual starting state
                window.history.pushState({
                    activeView: null,
                    selectedCategoryId: '',
                    adminTab: 'scoring',
                    type: 'initial'
                }, '');
            }
        }

        return () => window.removeEventListener('popstate', handlePopState);
    }, [initSync, currentUser]);

    const [isVerifying, setIsVerifying] = React.useState(false);

    // Initial Role Verification
    React.useEffect(() => {
        if (currentUser) {
            // Only verifying if we are in a 'USER' state (waiting for sync to upgrade us)
            // If we are already ADMIN or JUDGE, we assume we are good to go to avoid UI flicker.
            const isUnverified = currentUser.role === 'USER';

            if (isUnverified) {
                setIsVerifying(true);
            }

            const timer = setTimeout(() => {
                const state = useStore.getState();
                const freshUser = state.currentUser;

                // Root Admin check from env
                const rootAdmins = (import.meta.env.VITE_ROOT_ADMIN_EMAILS || '').split(',').map(e => e.trim());
                const isRoot = freshUser && rootAdmins.includes(freshUser.email);

                // If still USER after timeout, kick them out
                if (freshUser && freshUser.role === 'USER' && !isRoot) {
                    const msg = `등록되지 않은 사용자입니다. (Unregistered User)\n\n` +
                        `계정: ${freshUser.email}\n` +
                        `현재 역할: ${freshUser.role}\n\n` +
                        `관리자나 심사위원으로 등록된 계정만 이용할 수 있습니다. ` +
                        `등록 후 5초 이상 지났는데도 이 메시지가 보인다면 관리자에게 문의하세요.`;
                    alert(msg);
                    logout();
                }
                setIsVerifying(false);
            }, 5000); // Increased to 5 seconds to allow state sync

            return () => clearTimeout(timer);
        }
    }, [currentUser, logout]);

    if (!currentUser) {
        return <LoginPage />;
    }

    if (isVerifying) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
                <h2 className="text-xl font-bold">사용자 권한 확인 중...</h2>
                <p className="text-slate-400 text-sm mt-2">잠시만 기다려주세요 (Verifying Access...)</p>
            </div>
        );
    }

    return (
        <div className={`flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans selection:bg-indigo-500/30 ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
            {/* Mobile Sidebar Backdrop */}
            {isMobileSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
                    onClick={() => setIsMobileSidebarOpen(false)}
                />
            )}

            {/* Sidebar background gradient (Desktop only) */}
            <div
                className="absolute top-0 left-0 h-full bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none hidden md:block"
                style={{ width: sidebarWidth }}
            />

            <Sidebar
                width={sidebarWidth}
                isOpen={isMobileSidebarOpen}
                onClose={() => setIsMobileSidebarOpen(false)}
                onRequestLogout={() => setIsLogoutModalOpen(true)}
            />

            {/* Resize Handle (Desktop only) */}
            <div
                className={`hidden md:block w-1 hover:w-1.5 h-full bg-white/5 hover:bg-indigo-500/50 cursor-col-resize transition-all z-30 relative group`}
                onMouseDown={startResizing}
            >
                <div className="absolute inset-y-0 -left-1 -right-1" /> {/* Larger hit area */}
            </div>

            <div className="flex-1 flex flex-col relative min-w-0">
                <Header
                    onMenuClick={() => setIsMobileSidebarOpen(true)}
                    onRequestLogout={() => setIsLogoutModalOpen(true)}
                />
                <main className="flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 to-slate-950 p-4 md:p-8">
                    <MainContent />
                </main>
            </div>
            <DebugPanel />

            <LogoutConfirmModal
                isOpen={isLogoutModalOpen}
                onConfirm={() => {
                    setIsLogoutModalOpen(false);
                    logout();
                }}
                onCancel={() => setIsLogoutModalOpen(false)}
            />
        </div>
    );
}

export default App;

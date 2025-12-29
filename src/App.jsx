import React from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import MainContent from './components/MainContent';
import LoginPage from './components/LoginPage';
import DebugPanel from './components/DebugPanel';
import useStore from './store/useStore';

function App() {
    window.store = useStore;
    const currentUser = useStore((state) => state.currentUser);
    const initSync = useStore((state) => state.initSync);

    const [sidebarWidth, setSidebarWidth] = React.useState(320);
    const [isResizing, setIsResizing] = React.useState(false);

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
                const { activeView, selectedCategoryId } = event.state;
                useStore.setState({ activeView, selectedCategoryId });
            }
        };

        window.addEventListener('popstate', handlePopState);

        // Push initial state
        if (!window.history.state) {
            window.history.replaceState({ activeView: null, selectedCategoryId: '' }, '');
        }

        return () => window.removeEventListener('popstate', handlePopState);
    }, [initSync]);

    if (!currentUser) {
        return <LoginPage />;
    }

    return (
        <div className={`flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans selection:bg-indigo-500/30 ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
            {/* Sidebar background gradient */}
            <div
                className="absolute top-0 left-0 h-full bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none"
                style={{ width: sidebarWidth }}
            />

            <Sidebar width={sidebarWidth} />

            {/* Resize Handle */}
            <div
                className={`w-1 hover:w-1.5 h-full bg-white/5 hover:bg-indigo-500/50 cursor-col-resize transition-all z-30 relative group`}
                onMouseDown={startResizing}
            >
                <div className="absolute inset-y-0 -left-1 -right-1" /> {/* Larger hit area */}
            </div>

            <div className="flex-1 flex flex-col relative min-w-0">
                <Header />
                <main className="flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 to-slate-950 p-8">
                    <MainContent />
                </main>
            </div>
            <DebugPanel />
        </div>
    );
}

export default App;

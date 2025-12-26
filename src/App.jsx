import React from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import MainContent from './components/MainContent';
import LoginPage from './components/LoginPage';
import useStore from './store/useStore';

function App() {
    const currentUser = useStore((state) => state.currentUser);
    const initSync = useStore((state) => state.initSync);

    React.useEffect(() => {
        initSync();
    }, [initSync]);

    if (!currentUser) {
        return <LoginPage />;
    }

    return (
        <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans selection:bg-indigo-500/30">
            {/* Sidebar background gradient */}
            <div className="absolute top-0 left-0 w-80 h-full bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none" />

            <Sidebar />
            <div className="flex-1 flex flex-col relative">
                <Header />
                <main className="flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 to-slate-950 p-8">
                    <MainContent />
                </main>
            </div>
        </div>
    );
}

export default App;

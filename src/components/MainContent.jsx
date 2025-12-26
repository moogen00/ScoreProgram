import React from 'react';
import useStore from '../store/useStore';
import Leaderboard from './Leaderboard';
import Scorer from './Scorer';
import AdminPanel from './AdminPanel';
import { motion, AnimatePresence } from 'framer-motion';

const MainContent = () => {
    const currentUser = useStore((state) => state.currentUser);
    const activeView = useStore((state) => state.activeView);
    const role = currentUser?.role || 'USER';

    const renderContent = () => {
        const isAdmin = role === 'ADMIN' || role === 'ROOT_ADMIN';
        const view = activeView || (isAdmin ? 'admin' : role === 'JUDGE' ? 'scorer' : 'leaderboard');

        switch (view) {
            case 'admin':
                return <AdminPanel key="admin" />;
            case 'scorer':
                return <Scorer key="scorer" />;
            case 'leaderboard':
            default:
                return <Leaderboard key="leaderboard" />;
        }
    };

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={role}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="w-full h-full"
            >
                {renderContent()}
            </motion.div>
        </AnimatePresence>
    );
};

export default MainContent;

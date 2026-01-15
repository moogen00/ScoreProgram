import React from 'react';
import useStore from '../store/useStore';
import { motion } from 'framer-motion';

const Dashboard = () => {
    return (
        <div className="max-w-6xl mx-auto min-h-[70vh] flex flex-col items-center justify-center p-12">
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="text-center space-y-6"
            >
                <h1 className="text-4xl md:text-8xl font-black italic tracking-tighter text-white uppercase">
                    Korea Latin Dance Cup
                </h1>
                <p className="text-indigo-400 text-lg md:text-3xl font-black tracking-[0.6em] uppercase opacity-80">
                    - Monitoring System -
                </p>
            </motion.div>
        </div>
    );
};

export default Dashboard;

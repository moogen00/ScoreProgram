import React, { useState } from 'react';
import useStore from '../store/useStore';
import { db } from '../lib/firebase';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { Terminal, ChevronUp, ChevronDown, CheckCircle2, XCircle, Loader2, AlertTriangle, Wrench } from 'lucide-react';

const DebugPanel = () => {
    const state = useStore();
    const [isOpen, setIsOpen] = useState(false);
    const [isFixing, setIsFixing] = useState(false);

    if (process.env.NODE_ENV === 'production' && !state.currentUser?.role?.includes('ADMIN')) return null;

    const collections = [
        { name: 'Years', count: state.years.length },
        { name: 'Judges', count: Object.values(state.judgesByYear).flat().length },
        { name: 'Participants', count: Object.values(state.participants).flat().length },
        { name: 'Scores', count: Object.values(state.scores).flat().length },
        { name: 'Admins', count: state.admins.length },
    ];

    // Detect Ghost Categories
    const allCatIds = Object.keys(state.participants);
    const existingCatIds = new Set();
    state.years.forEach(y => (y.categories || []).forEach(c => existingCatIds.add(c.id)));
    const ghostCategories = allCatIds.filter(id => !existingCatIds.has(id));

    const handleFixGhosts = async () => {
        if (!ghostCategories.length) return;
        setIsFixing(true);
        try {
            let restoredCount = 0;
            for (const ghostId of ghostCategories) {
                // Assume format: YYYY-category-name-slug
                const parts = ghostId.split('-');
                const yearId = parts[0]; // e.g., "2024", "2025"
                const nameSlug = parts.slice(1).join(' '); // "bachata shine solo"

                // Convert slug to Title Case for display name
                const displayName = nameSlug
                    .split(' ')
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ');

                const year = state.years.find(y => y.id === yearId);
                if (year) {
                    const newCat = {
                        id: ghostId,
                        name: displayName,
                        order: (year.categories || []).length // Append to end
                    };
                    const updatedCategories = [...(year.categories || []), newCat];
                    await updateDoc(doc(db, 'years', yearId), { categories: updatedCategories });
                    restoredCount++;
                    console.log(`[Fix] Restored category: ${displayName} (${ghostId}) to Year ${yearId}`);
                } else {
                    console.warn(`[Fix] Could not find year ${yearId} for ghost category ${ghostId}`);
                }
            }
            if (restoredCount > 0) {
                alert(`Restored ${restoredCount} categories!`);
            }
        } catch (error) {
            console.error("Error fixing ghost categories:", error);
            alert("Error fixing categories. Check console.");
        } finally {
            setIsFixing(false);
        }
    };

    return (
        <div className="fixed bottom-0 right-0 z-[100] m-4 max-w-sm w-full">
            <div className="glass-card overflow-hidden border border-white/20 shadow-2xl">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={`w-full flex items-center justify-between p-3 transition-colors ${ghostCategories.length > 0 ? 'bg-amber-900/80 hover:bg-amber-800' : 'bg-slate-900/80 hover:bg-slate-800'
                        }`}
                >
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-400">
                        <Terminal size={14} />
                        System Diagnostic
                        {ghostCategories.length > 0 && (
                            <span className="flex items-center gap-1 text-amber-500 ml-2">
                                <AlertTriangle size={12} />
                                {ghostCategories.length} Issues
                            </span>
                        )}
                    </div>
                    {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>

                {isOpen && (
                    <div className="p-4 bg-slate-950/90 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">

                        {/* Data Integrity Check */}
                        {ghostCategories.length > 0 ? (
                            <div className="space-y-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                <div className="flex items-center gap-2 text-amber-400">
                                    <AlertTriangle size={16} />
                                    <p className="text-xs font-bold">Integrity Issue Detected</p>
                                </div>
                                <p className="text-[10px] text-slate-300">
                                    Found {ghostCategories.length} categories with participants that are missing from the menu.
                                </p>
                                <div className="max-h-20 overflow-y-auto bg-black/30 rounded p-2 text-[9px] font-mono text-amber-200/70 mb-2">
                                    {ghostCategories.map(id => (
                                        <div key={id}>{id}</div>
                                    ))}
                                </div>
                                <button
                                    onClick={handleFixGhosts}
                                    disabled={isFixing}
                                    className="w-full flex items-center justify-center gap-2 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold text-[10px] transition-all disabled:opacity-50"
                                >
                                    {isFixing ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
                                    {isFixing ? 'Fixing...' : 'Restore Missing Categories'}
                                </button>
                            </div>
                        ) : (
                            <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                                <CheckCircle2 size={12} className="text-emerald-400" />
                                <span className="text-[10px] font-bold text-emerald-400">Data Integrity Healthy</span>
                            </div>
                        )}

                        {/* Auth Status */}
                        <div className="space-y-1">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Auth State</p>
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                                <div className="p-2 rounded bg-white/5 border border-white/5">
                                    <p className="text-slate-500 uppercase text-[8px]">User</p>
                                    <p className="font-bold text-white truncate">{state.currentUser?.email || 'Guest'}</p>
                                </div>
                                <div className="p-2 rounded bg-white/5 border border-white/5">
                                    <p className="text-slate-500 uppercase text-[8px]">Role</p>
                                    <p className="font-bold text-indigo-400">{state.currentUser?.role || 'NONE'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Sync Status */}
                        <div className="space-y-1">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Sync Health</p>
                            <div className="p-2 rounded bg-white/5 border border-white/5 flex items-center justify-between text-[11px]">
                                <span className="text-slate-300">Initial Sync</span>
                                {state.isInitialSyncComplete ? (
                                    <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 size={12} /> Complete</span>
                                ) : (
                                    <span className="flex items-center gap-1 text-amber-400"><Loader2 size={12} className="animate-spin" /> Pending</span>
                                )}
                            </div>
                        </div>

                        {/* Deep Inspection */}
                        <div className="space-y-1">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Deep Inspection</p>
                            <div className="p-3 rounded bg-indigo-500/10 border border-indigo-500/20 text-[11px] space-y-2">
                                <div>
                                    <p className="text-slate-500 uppercase text-[8px]">Selected Category ID</p>
                                    <p className="font-mono text-white break-all bg-black/20 p-1 rounded border border-white/5">
                                        "{state.selectedCategoryId}"
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-black/20 p-1.5 rounded">
                                        <p className="text-slate-500 uppercase text-[8px]">In "Years"</p>
                                        <p className={state.years.some(y => y.categories?.some(c => c.id === state.selectedCategoryId)) ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                                            {state.years.some(y => y.categories?.some(c => c.id === state.selectedCategoryId)) ? "YES" : "NO"}
                                        </p>
                                    </div>
                                    <div className="bg-black/20 p-1.5 rounded">
                                        <p className="text-slate-500 uppercase text-[8px]">Has Participants</p>
                                        <p className={(state.participants[state.selectedCategoryId]?.length || 0) > 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                                            {state.participants[state.selectedCategoryId]?.length || 0}
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-slate-500 uppercase text-[8px]">Judge Permission</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <p className={
                                            (state.judgesByYear[state.selectedCategoryId?.split('-')[0]]?.some(j => j.email === state.currentUser?.email))
                                                ? "text-emerald-400 font-bold text-[10px]"
                                                : "text-amber-400 font-bold text-[10px]"
                                        }>
                                            {state.judgesByYear[state.selectedCategoryId?.split('-')[0]]?.some(j => j.email === state.currentUser?.email)
                                                ? "ASSIGNED"
                                                : "NOT ASSIGNED (Role: " + (state.currentUser?.role || 'None') + ")"}
                                        </p>
                                        {state.selectedCategoryId && !state.judgesByYear[state.selectedCategoryId.split('-')[0]]?.some(j => j.email === state.currentUser?.email) && (
                                            <button
                                                onClick={async () => {
                                                    const yearId = state.selectedCategoryId.split('-')[0];
                                                    const email = state.currentUser?.email;
                                                    const name = state.currentUser?.name || 'Judge';
                                                    if (!yearId || !email) return;

                                                    try {
                                                        const docRef = doc(db, 'judges', `${yearId}_${email}`);
                                                        await setDoc(docRef, { yearId, email, name });
                                                        // Force a quick reload of role sync via store if needed, mostly auto-syncs
                                                        state.syncUserRole();
                                                        alert(`Assigned ${email} to Year ${yearId}`);
                                                    } catch (e) {
                                                        console.error(e);
                                                        alert('Error assigning judge');
                                                    }
                                                }}
                                                className="px-2 py-0.5 bg-indigo-500 hover:bg-indigo-400 text-white text-[9px] rounded font-bold"
                                            >
                                                Fix Permission
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="col-span-2 pt-2 border-t border-white/5">
                                    <p className="text-slate-500 uppercase text-[8px] mb-1">Lock Diagnostics</p>
                                    <div className="grid grid-cols-3 gap-2 text-[9px] text-center">
                                        <div className="bg-white/5 p-1 rounded">
                                            <span className="text-slate-500 block">Year Locked</span>
                                            {(() => {
                                                const yId = state.selectedCategoryId?.split('-')[0];
                                                const year = state.years.find(y => y.id === yId);
                                                return <span className={year?.locked ? "text-rose-400 font-bold" : "text-emerald-400"}>{year?.locked ? "YES" : "NO"}</span>
                                            })()}
                                        </div>
                                        <div className="bg-white/5 p-1 rounded">
                                            <span className="text-slate-500 block">Can Edit</span>
                                            {(() => {
                                                const canEdit = (state.currentUser?.role === 'ADMIN' || state.currentUser?.role === 'ROOT_ADMIN' || state.currentUser?.role === 'JUDGE');
                                                return <span className={canEdit ? "text-emerald-400 font-bold" : "text-rose-400"}>{canEdit ? "YES" : "NO"}</span>
                                            })()}
                                        </div>
                                        <div className="bg-white/5 p-1 rounded">
                                            <span className="text-slate-500 block">Scorer Locked</span>
                                            {(() => {
                                                const yId = state.selectedCategoryId?.split('-')[0];
                                                const year = state.years.find(y => y.id === yId);
                                                const isAdmin = state.currentUser?.role.includes('ADMIN');
                                                const canEdit = (isAdmin || state.currentUser?.role === 'JUDGE');
                                                const isLocked = (year?.locked && !isAdmin) || !canEdit;
                                                return <span className={isLocked ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>{isLocked ? "LOCKED" : "OPEN"}</span>
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* All Categories Inspector */}
                        <div className="space-y-1">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">All Participant Keys (Source of Truth)</p>
                            <div className="max-h-32 overflow-y-auto bg-black/40 rounded p-2 custom-scrollbar">
                                {Object.entries(state.participants).map(([key, list]) => (
                                    <div key={key} className="flex justify-between items-center text-[10px] border-b border-white/5 py-1">
                                        <span className="font-mono text-slate-300 break-all select-all">{key}</span>
                                        <span className={list.length > 0 ? "text-emerald-400 font-bold" : "text-slate-600"}>{list.length}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Data Counts */}
                        <div className="space-y-1">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Collection Counts</p>
                            <div className="grid grid-cols-1 gap-1">
                                {collections.map(c => (
                                    <div key={c.name} className="flex items-center justify-between p-2 rounded bg-white/5 text-[11px]">
                                        <span className="text-slate-400">{c.name}</span>
                                        <span className="font-bold text-white">{c.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={() => console.log('Current State:', window.store.getState())}
                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-[10px] transition-all"
                        >
                            Log Full State to Console
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DebugPanel;

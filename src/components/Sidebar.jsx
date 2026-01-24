import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Trophy, Calendar, Plus, Edit2, Check, User, Layers, LogOut, Lock, Unlock, Settings, Trash2, GripVertical } from 'lucide-react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import useStore from '../store/useStore';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
    return twMerge(clsx(inputs));
}

const Sidebar = ({ width, isOpen, onClose, onRequestLogout }) => {
    const {
        competitions: allCompetitions,
        selectedCategoryId,
        setSelectedCategoryId,
        activeView,
        setActiveView,
        currentUser,
        addCompetition,
        updateCompetition,
        deleteCompetition,
        addCategory,
        updateCategory,
        deleteCategory,
        toggleCompetitionLock,
        competitionName,
        setCompetitionName,
        updateCategoriesOrder,
        reorderCategory,
        toggleCategoryLock,
        scores // Add scores to destructuring
    } = useStore();

    const [expandedCompetitions, setExpandedCompetitions] = useState({ 'active': true });

    // Inline editing states
    const [isEditingComp, setIsEditingComp] = useState(false);
    const [tempCompName, setTempCompName] = useState(competitionName);

    const [editingCompId, setEditingCompId] = useState(null);
    const [tempCompIdName, setTempCompIdName] = useState('');

    const [isAddingCompetition, setIsAddingCompetition] = useState(false);
    const [newCompetitionName, setNewCompetitionName] = useState('');

    const [addingCatFor, setAddingCatFor] = useState(null); // compId
    const [newCatName, setNewCatName] = useState('');

    const [editingCatId, setEditingCatId] = useState(null);
    const [tempCatName, setTempCatName] = useState('');
    const isDeletingRef = React.useRef(false);

    const toggleCompetition = (id) => {
        setExpandedCompetitions(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleSaveCompName = () => {
        if (tempCompName.trim()) {
            setCompetitionName(tempCompName.trim());
            setIsEditingComp(false);
        }
    };

    const handleSaveCompIdName = (id) => {
        if (tempCompIdName.trim()) {
            updateCompetition(id, tempCompIdName.trim());
            setEditingCompId(null);
        }
    };

    const handleAddCompetition = (e) => {
        if (e.key === 'Enter' || e.type === 'click') {
            if (newCompetitionName.trim()) {
                addCompetition(newCompetitionName.trim());
                setNewCompetitionName('');
                setIsAddingCompetition(false);
            }
        }
    };

    const handleAddCategory = (compId) => {
        if (newCatName.trim()) {
            addCategory(compId, newCatName.trim());
            setNewCatName('');
            setAddingCatFor(null);
            if (!expandedCompetitions[compId]) toggleCompetition(compId);
        }
    };

    const handleDeleteCompetition = async (e, id) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        if (isDeletingRef.current) return;

        // Check for scores in this competition
        const comp = allCompetitions.find(y => y.id === id);
        let hasScores = false;
        if (comp && comp.categories) {
            hasScores = comp.categories.some(cat => {
                const catScores = scores[cat.id];
                return catScores && Object.keys(catScores).length > 0;
            });
        }

        isDeletingRef.current = true;
        try {
            if (hasScores) {
                if (window.confirm('경고: 이 대회에 점수 데이터가 존재합니다.\n삭제 시 모든 참가자와 점수가 삭제됩니다.\n\n정말 삭제하시겠습니까? (관리자 최종 선택)')) {
                    await deleteCompetition(id);
                }
            } else {
                if (window.confirm('정말 이 대회의 모든 데이터를 삭제하시겠습니까?\n(참가자, 점수 결과 등 포함)')) {
                    await deleteCompetition(id);
                }
            }
        } catch (err) {
            console.error('Error deleting competition:', err);
        } finally {
            isDeletingRef.current = false;
        }
    };

    const handleToggleCompetitionLock = async (e, comp) => {
        e.stopPropagation();
        const msg = comp.locked
            ? `${comp.name} 데이터 전체를 잠금 해제 하시겠습니까?`
            : `${comp.name} 데이터 전체를 잠금 하시겠습니까?`;

        if (window.confirm(msg)) {
            await toggleCompetitionLock(comp.id, !comp.locked);
        }
    };

    const handleToggleCategoryLock = async (e, compId, cat) => {
        e.stopPropagation();
        const comp = allCompetitions.find(y => y.id === compId);
        const msg = cat.locked
            ? `${comp?.name || '해당 대회'} [${cat.name}] 데이터를 잠금 해제 하시겠습니까?`
            : `${comp?.name || '해당 대회'} [${cat.name}] 데이터를 잠금 하시겠습니까?`;

        if (window.confirm(msg)) {
            await toggleCategoryLock(compId, cat.id, !cat.locked);
        }
    };

    const handleEditCategory = (e, cat) => {
        e.stopPropagation();
        setEditingCatId(cat.id);
        setTempCatName(cat.name);
    };

    const handleUpdateCategory = (compId, catId) => {
        if (tempCatName.trim()) {
            updateCategory(compId, catId, tempCatName.trim());
            setEditingCatId(null);
        }
    };

    const handleDeleteCategory = async (compId, catId, name) => {
        if (isDeletingRef.current) return;

        // Check for scores in this category
        const catScores = scores[catId];
        const hasScores = catScores && Object.keys(catScores).length > 0;

        isDeletingRef.current = true;
        try {
            if (hasScores) {
                if (window.confirm(`경고: '${name}' 종목에 점수 데이터가 존재합니다.\n삭제 시 모든 참가자와 점수가 삭제됩니다.\n\n정말 삭제하시겠습니까? (관리자 최종 선택)`)) {
                    await deleteCategory(compId, catId);
                }
            } else {
                if (window.confirm(`'${name}' 종목을 삭제하시겠습니까?`)) {
                    await deleteCategory(compId, catId);
                }
            }
        } catch (err) {
            console.error('Error deleting category:', err);
        } finally {
            isDeletingRef.current = false;
        }
    };

    // Helper to close sidebar on mobile nav
    const handleNavClick = () => {
        onClose?.();
    };

    const userRole = currentUser?.role || 'USER';

    const visibleCompetitions = React.useMemo(() => {
        if (!currentUser) return [];
        if (['ROOT_ADMIN', 'ADMIN', 'SPECTATOR'].includes(userRole)) {
            return allCompetitions;
        }
        if (userRole === 'JUDGE') {
            const assigned = currentUser.assignedCompetitions || [];
            return allCompetitions.filter(c => assigned.includes(c.id));
        }
        return [];
    }, [allCompetitions, currentUser, userRole]);

    const categoryItemProps = {
        selectedCategoryId,
        activeView,
        editingCatId,
        tempCatName,
        currentUser,
        userRole,
        setSelectedCategoryId,
        setActiveView,
        handleNavClick,
        setTempCatName,
        handleUpdateCategory,
        setEditingCatId,
        handleToggleCategoryLock,
        handleEditCategory,
        handleDeleteCategory,
        updateCategoriesOrder
    };

    return (
        <aside
            className={cn(
                "glass border-r border-white/10 flex flex-col z-20 shrink-0 transition-transform duration-300 ease-in-out",
                // Mobile styles
                "fixed inset-y-0 left-0 h-full w-[280px] bg-slate-950/95 backdrop-blur-xl z-50",
                // Desktop styles
                "md:relative md:translate-x-0 md:bg-transparent md:z-20 md:w-[var(--sidebar-width)]",
                // Open/Close logic
                isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
            )}
            style={{ '--sidebar-width': `${width}px` }}
        >
            {(userRole === 'ADMIN' || userRole === 'ROOT_ADMIN') && (
                <div className="p-4 pb-0">
                    <button
                        onClick={() => {
                            setActiveView('admin');
                            handleNavClick();
                        }}
                        className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-black text-xs uppercase tracking-widest",
                            activeView === 'admin'
                                ? "bg-rose-600 text-white shadow-lg shadow-rose-600/20"
                                : "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20"
                        )}
                    >
                        <Settings size={16} />
                        <div className="flex flex-col items-start leading-tight">
                            <span>대회설정</span>
                            <span className="text-[10px] opacity-80">(ADMIN PANEL)</span>
                        </div>
                    </button>
                </div>
            )}

            <div className="p-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div
                        className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.4)] cursor-pointer hover:scale-110 active:scale-95 transition-transform"
                        onClick={() => useStore.getState().resetNavigation()}
                        title="대쉬보드로 이동"
                    >
                        <Trophy className="text-white w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                        {isEditingComp && (userRole === 'ADMIN' || userRole === 'ROOT_ADMIN') ? (
                            <div className="flex items-center gap-1">
                                <input
                                    autoFocus
                                    className="bg-white/10 border border-white/20 rounded px-2 py-0.5 text-sm w-full outline-none"
                                    value={tempCompName}
                                    onChange={(e) => setTempCompName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveCompName()}
                                />
                                <button onClick={handleSaveCompName} className="text-emerald-400 p-1"><Check size={14} /></button>
                            </div>
                        ) : (
                            <div>
                                <h1
                                    className="text-xl font-black bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent truncate cursor-pointer hover:scale-105 transition-transform"
                                    onClick={() => useStore.getState().resetNavigation()}
                                >
                                    Score
                                </h1>
                            </div>
                        )}
                        <div className="flex items-center justify-between group">
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
                                {competitionName}
                            </p>
                            {(!isEditingComp && (userRole === 'ADMIN' || userRole === 'ROOT_ADMIN')) && (
                                <button onClick={() => setIsEditingComp(true)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-white transition-opacity">
                                    <Edit2 size={12} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>


            <div className="flex-1 overflow-y-auto py-6 px-4 space-y-2 custom-scrollbar">
                <div className="flex items-center justify-between px-2 mb-4">
                    <h2 className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Competition Hierarchy</h2>
                    {(userRole === 'ADMIN' || userRole === 'ROOT_ADMIN') && (
                        <button
                            onClick={() => setIsAddingCompetition(!isAddingCompetition)}
                            className={cn(
                                "p-1 rounded-md transition-colors",
                                isAddingCompetition ? "bg-rose-500/20 text-rose-400" : "hover:bg-white/10 text-slate-500 hover:text-indigo-400"
                            )}
                        >
                            {isAddingCompetition ? <Plus size={14} className="rotate-45" /> : <Plus size={14} />}
                        </button>
                    )}
                </div>

                {isAddingCompetition && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="px-2 mb-4">
                        <input
                            autoFocus
                            placeholder="New Competition (e.g. 2026)"
                            className="w-full bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                            value={newCompetitionName}
                            onChange={(e) => setNewCompetitionName(e.target.value)}
                            onKeyDown={handleAddCompetition}
                        />
                    </motion.div>
                )}

                {visibleCompetitions.map((comp) => (
                    <div key={comp.id} className="space-y-1">
                        <div className="group flex items-center">
                            {editingCompId === comp.id ? (
                                <div className="flex-1 flex items-center gap-1 mx-2">
                                    <input
                                        autoFocus
                                        className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs w-full outline-none"
                                        value={tempCompIdName}
                                        onChange={(e) => setTempCompIdName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveCompIdName(comp.id)}
                                    />
                                    <button onClick={() => handleSaveCompIdName(comp.id)} className="text-emerald-400 p-1"><Check size={14} /></button>
                                </div>
                            ) : (
                                <div
                                    onClick={() => toggleCompetition(comp.id)}
                                    className="sidebar-item flex-1 min-w-0 flex items-center group/btn cursor-pointer !transform-none"
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleCompetition(comp.id)}
                                >
                                    {expandedCompetitions[comp.id] ? <ChevronDown size={14} className="mr-2 text-indigo-400 shrink-0" /> : <ChevronRight size={14} className="mr-2 text-slate-600 shrink-0" />}
                                    <Calendar size={14} className={cn("mr-3 transition-colors shrink-0", expandedCompetitions[comp.id] ? "text-indigo-400" : "text-slate-600")} />
                                    <span className={cn("flex-1 min-w-0 text-left font-bold transition-colors text-sm whitespace-normal break-words leading-tight py-1", expandedCompetitions[comp.id] ? "text-white" : "text-slate-400")}>{comp.name}</span>
                                    {(userRole === 'ADMIN' || userRole === 'ROOT_ADMIN') && (
                                        <div
                                            className="flex items-center gap-0.5 opacity-0 group-hover/btn:opacity-100 transition-opacity mr-2 shrink-0"
                                            onClick={(e) => e.stopPropagation()}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onPointerDown={(e) => e.stopPropagation()}
                                        >
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleToggleCompetitionLock(e, comp);
                                                }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                className={cn("p-1.5 rounded-lg transition-colors", comp.locked ? "text-rose-400 bg-rose-500/10" : "text-emerald-400 hover:bg-emerald-500/10")}
                                                title={comp.locked ? "대회 잠금 해제" : "대회 잠금"}
                                            >
                                                {comp.locked ? <Lock size={14} /> : <Unlock size={14} />}
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setEditingCompId(comp.id);
                                                    setTempCompIdName(comp.name);
                                                }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                className="p-1 text-slate-500 hover:text-indigo-400 rounded hover:bg-white/10"
                                                title="수정"
                                            >
                                                <Edit2 size={12} />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleDeleteCompetition(e, comp.id);
                                                }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                                title="대회 삭제"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    )}
                                    {comp.locked && (userRole !== 'ADMIN' && userRole !== 'ROOT_ADMIN') && <Lock size={12} className="text-rose-400 mr-2" />}
                                </div>
                            )}
                        </div>

                        <AnimatePresence initial={false}>
                            {expandedCompetitions[comp.id] && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden ml-6 border-l border-white/5 space-y-1 my-1"
                                >
                                    <Reorder.Group
                                        axis="y"
                                        values={[...(comp.categories || [])].sort((a, b) => (a.order || 0) - (b.order || 0))}
                                        onReorder={(newOrder) => updateCategoriesOrder(comp.id, newOrder)}
                                        className="space-y-1"
                                    >
                                        {[...(comp.categories || [])].sort((a, b) => (a.order || 0) - (b.order || 0)).map((cat) => (
                                            <CategoryItem
                                                key={cat.id}
                                                cat={cat}
                                                compId={comp.id}
                                                {...categoryItemProps}
                                            />
                                        ))}
                                    </Reorder.Group>

                                    {addingCatFor === comp.id ? (
                                        <div className="px-6 py-1">
                                            <input
                                                autoFocus
                                                placeholder="Category Name..."
                                                className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-[10px] text-white outline-none focus:border-indigo-500/50"
                                                value={newCatName}
                                                onChange={(e) => setNewCatName(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory(comp.id)}
                                                onBlur={() => !newCatName && setAddingCatFor(null)}
                                            />
                                        </div>
                                    ) : (
                                        (userRole === 'ADMIN' || userRole === 'ROOT_ADMIN') && (
                                            <button
                                                onClick={() => setAddingCatFor(comp.id)}
                                                className="sidebar-item w-full flex items-center gap-2 text-slate-600 hover:text-indigo-400 pl-6 py-2 group/add"
                                            >
                                                <Plus size={10} className="group-hover/add:rotate-90 transition-transform" />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Add Category</span>
                                            </button>
                                        )
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                ))}
            </div>

            <div className="p-4 bg-black/20 border-t border-white/10">
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/5 group">
                    {currentUser?.picture ? (
                        <img src={currentUser.picture} alt="ava" className="w-9 h-9 rounded-xl border border-white/10 shadow-lg" />
                    ) : (
                        <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-xs font-black text-indigo-400 ring-2 ring-indigo-500/20">
                            {currentUser?.name?.[0]}
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-black text-white truncate">{currentUser?.name}</p>
                        <p className={cn(
                            "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded inline-block mt-0.5",
                            (userRole === 'ADMIN' || userRole === 'ROOT_ADMIN') ? "bg-rose-500/10 text-rose-400" : userRole === 'JUDGE' ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400"
                        )}>
                            {userRole}
                        </p>
                    </div>
                    <button onClick={onRequestLogout} className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                        <LogOut size={14} />
                    </button>
                </div>
            </div>
        </aside>
    );
};

// --- STABILIZED CATEGORY ITEM ---
const CategoryItem = React.memo(({
    cat,
    compId,
    selectedCategoryId,
    activeView,
    editingCatId,
    tempCatName,
    currentUser,
    userRole,
    setSelectedCategoryId,
    setActiveView,
    handleNavClick,
    setTempCatName,
    handleUpdateCategory,
    setEditingCatId,
    handleToggleCategoryLock,
    handleEditCategory,
    handleDeleteCategory,
    updateCategoriesOrder
}) => {
    const dragControls = useDragControls();
    const isActive = selectedCategoryId === cat.id;

    const stopEvents = (e) => {
        e.stopPropagation();
    };

    return (
        <Reorder.Item
            value={cat}
            dragListener={false}
            dragControls={dragControls}
            className="group/cat relative flex items-center"
        >
            {editingCatId === cat.id ? (
                <div className="flex-1 flex items-center gap-1 mx-6 my-1">
                    <input
                        autoFocus
                        className="bg-white/10 border border-white/20 rounded px-2 py-0.5 text-[10px] w-full outline-none text-white"
                        value={tempCatName}
                        onChange={(e) => setTempCatName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateCategory(compId, cat.id)}
                    />
                    <button onClick={() => handleUpdateCategory(compId, cat.id)} className="text-emerald-400 p-1"><Check size={12} /></button>
                    <button onClick={() => setEditingCatId(null)} className="text-slate-400 p-1">×</button>
                </div>
            ) : (
                <div
                    onClick={(e) => {
                        if (e.defaultPrevented) return;
                        setSelectedCategoryId(cat.id);
                        if (['ADMIN', 'ROOT_ADMIN', 'JUDGE', 'SPECTATOR'].includes(userRole)) {
                            setActiveView('scorer');
                        }
                        handleNavClick();
                    }}
                    className={cn(
                        "sidebar-item w-full flex items-start gap-2 pl-3 pr-2 py-1.5 relative cursor-pointer !transform-none group/item",
                        isActive && activeView !== 'admin' ? "active text-white" : "text-slate-500"
                    )}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            setSelectedCategoryId(cat.id);
                            if (['ADMIN', 'ROOT_ADMIN', 'JUDGE', 'SPECTATOR'].includes(userRole)) {
                                setActiveView('scorer');
                            }
                            handleNavClick();
                        }
                    }}
                >
                    {(userRole === 'ADMIN' || userRole === 'ROOT_ADMIN') && (
                        <div
                            className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-slate-700 hover:text-slate-400 transition-colors shrink-0 mt-1"
                            onPointerDown={(e) => dragControls.start(e)}
                        >
                            <GripVertical size={12} />
                        </div>
                    )}
                    {isActive && (
                        <div className="absolute left-0 w-1 h-4 bg-indigo-500 rounded-full shrink-0 mt-2.5" />
                    )}
                    <Layers size={12} className={cn("shrink-0 mt-2", isActive ? "text-indigo-400" : "text-slate-700")} />
                    <span className="flex-1 min-w-0 whitespace-normal break-words leading-tight py-1.5 mr-2">{cat.name}</span>
                    {(userRole === 'ADMIN' || userRole === 'ROOT_ADMIN') && (
                        <div
                            className="flex items-center gap-0.5 shrink-0 min-w-max opacity-0 group-hover/item:opacity-100 transition-opacity mt-1"
                            onClick={stopEvents}
                            onMouseDown={stopEvents}
                            onMouseUp={stopEvents}
                            onPointerDown={stopEvents}
                            onPointerUp={stopEvents}
                        >
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleToggleCategoryLock(e, compId, cat);
                                }}
                                onMouseDown={stopEvents}
                                onMouseUp={stopEvents}
                                onPointerDown={stopEvents}
                                onPointerUp={stopEvents}
                                className={cn("p-1 hover:bg-white/10 rounded shrink-0", cat.locked ? "text-rose-400 opacity-100" : "text-emerald-400")}
                                title={cat.locked ? "잠금 해제" : "잠금"}
                            >
                                {cat.locked ? <Lock size={12} /> : <Unlock size={12} />}
                            </button>
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleEditCategory(e, cat);
                                }}
                                onMouseDown={stopEvents}
                                onMouseUp={stopEvents}
                                onPointerDown={stopEvents}
                                onPointerUp={stopEvents}
                                className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded shrink-0"
                                title="수정"
                            >
                                <Edit2 size={12} />
                            </button>
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleDeleteCategory(compId, cat.id, cat.name);
                                }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                }}
                                onMouseUp={stopEvents}
                                onPointerDown={stopEvents}
                                onPointerUp={stopEvents}
                                className="p-1 text-slate-500 hover:text-rose-400 hover:bg-white/10 rounded transition-colors shrink-0"
                                title="삭제"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    )}
                    {cat.locked && (userRole !== 'ADMIN' && userRole !== 'ROOT_ADMIN') && <Lock size={12} className="text-rose-400 mr-2 shrink-0 mt-2" />}
                </div>
            )}
        </Reorder.Item>
    );
});

export default Sidebar;

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
        years: allYears, // Rename to allYears to avoid conflict with visibleYears logic
        selectedCategoryId,
        setSelectedCategoryId,
        activeView,
        setActiveView,
        currentUser,
        addYear,
        updateYear,
        deleteYear,
        addCategory,
        updateCategory,
        deleteCategory,
        toggleYearLock,
        competitionName,
        setCompetitionName,
        updateCategoriesOrder,
        reorderCategory,
        toggleCategoryLock,
        scores // Add scores to destructuring
    } = useStore();

    const [expandedYears, setExpandedYears] = useState({ '2025': true });

    // Inline editing states
    const [isEditingComp, setIsEditingComp] = useState(false);
    const [tempCompName, setTempCompName] = useState(competitionName);

    const [editingYearId, setEditingYearId] = useState(null);
    const [tempYearName, setTempYearName] = useState('');

    const [isAddingYear, setIsAddingYear] = useState(false);
    const [newYearName, setNewYearName] = useState('');

    const [addingCatFor, setAddingCatFor] = useState(null); // yearId
    const [newCatName, setNewCatName] = useState('');

    const [editingCatId, setEditingCatId] = useState(null);
    const [tempCatName, setTempCatName] = useState('');

    const toggleYear = (id) => {
        setExpandedYears(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleSaveCompName = () => {
        if (tempCompName.trim()) {
            setCompetitionName(tempCompName.trim());
            setIsEditingComp(false);
        }
    };

    const handleSaveYearName = (id) => {
        if (tempYearName.trim()) {
            updateYear(id, tempYearName.trim());
            setEditingYearId(null);
        }
    };

    const handleAddYear = (e) => {
        if (e.key === 'Enter' || e.type === 'click') {
            if (newYearName.trim()) {
                addYear(newYearName.trim());
                setNewYearName('');
                setIsAddingYear(false);
            }
        }
    };

    const handleAddCategory = (yearId) => {
        if (newCatName.trim()) {
            addCategory(yearId, newCatName.trim());
            setNewCatName('');
            setAddingCatFor(null);
            if (!expandedYears[yearId]) toggleYear(yearId);
        }
    };

    const handleDeleteYear = async (e, id) => {
        e.stopPropagation();

        // Check for scores in this year
        const year = allYears.find(y => y.id === id);
        let hasScores = false;
        if (year && year.categories) {
            hasScores = year.categories.some(cat => {
                const catScores = scores[cat.id];
                return catScores && Object.keys(catScores).length > 0;
            });
        }

        if (hasScores) {
            if (window.confirm('경고: 이 연도에 점수 데이터가 존재합니다.\n삭제 시 모든 참가자와 점수가 삭제됩니다.\n\n정말 삭제하시겠습니까? (관리자 최종 선택)')) {
                await deleteYear(id);
            }
        } else {
            if (window.confirm('정말 이 연도의 모든 데이터를 삭제하시겠습니까?\n(참가자, 점수 결과 등 포함)')) {
                await deleteYear(id);
            }
        }
    };

    const handleToggleYearLock = async (e, year) => {
        e.stopPropagation();
        const msg = year.locked
            ? `${year.name} 데이터 전체를 잠금 해제 하시겠습니까?`
            : `${year.name} 데이터 전체를 잠금 하시겠습니까?`;

        if (window.confirm(msg)) {
            await toggleYearLock(year.id, !year.locked);
        }
    };

    const handleToggleCategoryLock = async (e, yearId, cat) => {
        e.stopPropagation();
        const year = allYears.find(y => y.id === yearId);
        const msg = cat.locked
            ? `${year?.name || '해당 연도'} [${cat.name}] 데이터를 잠금 해제 하시겠습니까?`
            : `${year?.name || '해당 연도'} [${cat.name}] 데이터를 잠금 하시겠습니까?`;

        if (window.confirm(msg)) {
            await toggleCategoryLock(yearId, cat.id, !cat.locked);
        }
    };

    const handleEditCategory = (e, cat) => {
        e.stopPropagation();
        setEditingCatId(cat.id);
        setTempCatName(cat.name);
    };

    const handleUpdateCategory = (yearId, catId) => {
        if (tempCatName.trim()) {
            updateCategory(yearId, catId, tempCatName.trim());
            setEditingCatId(null);
        }
    };

    const handleDeleteCategory = (yearId, catId, name) => {
        // Check for scores in this category
        const catScores = scores[catId];
        const hasScores = catScores && Object.keys(catScores).length > 0;

        if (hasScores) {
            if (window.confirm(`경고: '${name}' 종목에 점수 데이터가 존재합니다.\n삭제 시 모든 참가자와 점수가 삭제됩니다.\n\n정말 삭제하시겠습니까? (관리자 최종 선택)`)) {
                deleteCategory(yearId, catId);
            }
        } else {
            if (window.confirm(`'${name}' 종목을 삭제하시겠습니까?`)) {
                deleteCategory(yearId, catId);
            }
        }
    };

    // Helper to close sidebar on mobile nav
    const handleNavClick = () => {
        onClose?.();
    };

    const CategoryItem = ({ cat, yearId }) => {
        const dragControls = useDragControls();
        const isActive = selectedCategoryId === cat.id;
        const userRole = currentUser?.role || 'USER'; // Define userRole here for CategoryItem

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
                            onKeyDown={(e) => e.key === 'Enter' && handleUpdateCategory(yearId, cat.id)}
                        />
                        <button onClick={() => handleUpdateCategory(yearId, cat.id)} className="text-emerald-400 p-1"><Check size={12} /></button>
                        <button onClick={() => setEditingCatId(null)} className="text-slate-400 p-1">×</button>
                    </div>
                ) : (
                    <div
                        onClick={() => {
                            setSelectedCategoryId(cat.id);
                            if (['ADMIN', 'ROOT_ADMIN', 'JUDGE', 'SPECTATOR'].includes(userRole)) {
                                setActiveView('scorer');
                            }
                            handleNavClick();
                        }}
                        className={cn(
                            "sidebar-item w-full flex items-center gap-2 pl-3 relative cursor-pointer",
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
                                className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-slate-700 hover:text-slate-400 transition-colors"
                                onPointerDown={(e) => dragControls.start(e)}
                            >
                                <GripVertical size={12} />
                            </div>
                        )}
                        {isActive && (
                            <div className="absolute left-0 w-1 h-4 bg-indigo-500 rounded-full" />
                        )}
                        <Layers size={12} className={cn("shrink-0", isActive ? "text-indigo-400" : "text-slate-700")} />
                        <span className="flex-1 whitespace-normal break-words leading-tight py-1">{cat.name}</span>
                        {(userRole === 'ADMIN' || userRole === 'ROOT_ADMIN') && (
                            <div className="flex items-center gap-1 opacity-0 group-hover/cat:opacity-100 transition-opacity">
                                <button
                                    onClick={(e) => handleToggleCategoryLock(e, yearId, cat)}
                                    className={cn("p-1 hover:bg-white/10 rounded", cat.locked ? "text-rose-400 opacity-100" : "text-emerald-400")}
                                    title={cat.locked ? "잠금 해제" : "잠금"}
                                >
                                    {cat.locked ? <Lock size={12} /> : <Unlock size={12} />}
                                </button>
                                <button
                                    onClick={(e) => handleEditCategory(e, cat)}
                                    className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded"
                                >
                                    <Edit2 size={12} />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteCategory(yearId, cat.id, cat.name);
                                    }}
                                    className="p-1 text-slate-500 hover:text-rose-400 hover:bg-white/10 rounded transition-colors"
                                    title="삭제"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        )}
                        {cat.locked && (userRole !== 'ADMIN' && userRole !== 'ROOT_ADMIN') && <Lock size={12} className="text-rose-400 mr-2" />}
                    </div>
                )}
            </Reorder.Item>
        );
    };



    // Filter years for Judges
    const userRole = currentUser?.role || 'USER';

    const visibleYears = React.useMemo(() => {
        if (!currentUser) return [];
        // ROOT_ADMIN, ADMIN, SPECTATOR -> See all
        if (['ROOT_ADMIN', 'ADMIN', 'SPECTATOR'].includes(userRole)) {
            return allYears;
        }
        // JUDGE -> See only assigned years
        if (userRole === 'JUDGE') {
            const assigned = currentUser.assignedYears || [];
            return allYears.filter(y => assigned.includes(y.id));
        }
        return [];
    }, [allYears, currentUser, userRole]);

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
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black truncate">
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
                            onClick={() => setIsAddingYear(!isAddingYear)}
                            className={cn(
                                "p-1 rounded-md transition-colors",
                                isAddingYear ? "bg-rose-500/20 text-rose-400" : "hover:bg-white/10 text-slate-500 hover:text-indigo-400"
                            )}
                        >
                            {isAddingYear ? <Plus size={14} className="rotate-45" /> : <Plus size={14} />}
                        </button>
                    )}
                </div>

                {isAddingYear && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="px-2 mb-4">
                        <input
                            autoFocus
                            placeholder="New Year (e.g. 2026)"
                            className="w-full bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                            value={newYearName}
                            onChange={(e) => setNewYearName(e.target.value)}
                            onKeyDown={handleAddYear}
                        />
                    </motion.div>
                )}

                {visibleYears.map((year) => (
                    <div key={year.id} className="space-y-1">
                        <div className="group flex items-center">
                            {editingYearId === year.id ? (
                                <div className="flex-1 flex items-center gap-1 mx-2">
                                    <input
                                        autoFocus
                                        className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs w-full outline-none"
                                        value={tempYearName}
                                        onChange={(e) => setTempYearName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveYearName(year.id)}
                                    />
                                    <button onClick={() => handleSaveYearName(year.id)} className="text-emerald-400 p-1"><Check size={14} /></button>
                                </div>
                            ) : (
                                <div
                                    onClick={() => toggleYear(year.id)}
                                    className="sidebar-item flex-1 flex items-center group/btn cursor-pointer"
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleYear(year.id)}
                                >
                                    {expandedYears[year.id] ? <ChevronDown size={14} className="mr-2 text-indigo-400" /> : <ChevronRight size={14} className="mr-2 text-slate-600" />}
                                    <Calendar size={14} className={cn("mr-3 transition-colors", expandedYears[year.id] ? "text-indigo-400" : "text-slate-600")} />
                                    <span className={cn("flex-1 text-left font-bold transition-colors text-sm", expandedYears[year.id] ? "text-white" : "text-slate-400")}>{year.name}</span>

                                    {(userRole === 'ADMIN' || userRole === 'ROOT_ADMIN') && (
                                        <div className="flex items-center gap-1 opacity-0 group-hover/btn:opacity-100 transition-opacity mr-2">
                                            <button
                                                onClick={(e) => handleToggleYearLock(e, year)}
                                                className={cn("p-1.5 rounded-lg transition-colors", year.locked ? "text-rose-400 bg-rose-500/10" : "text-emerald-400 hover:bg-emerald-500/10")}
                                                title={year.locked ? "연도 잠금 해제" : "연도 잠금"}
                                            >
                                                {year.locked ? <Lock size={14} /> : <Unlock size={14} />}
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingYearId(year.id);
                                                    setTempYearName(year.name);
                                                }}
                                                className="p-1 text-slate-500 hover:text-indigo-400 rounded hover:bg-white/10"
                                                title="수정"
                                            >
                                                <Edit2 size={12} />
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteYear(e, year.id)}
                                                className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                                title="연도 삭제"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    )}
                                    {year.locked && (userRole !== 'ADMIN' && userRole !== 'ROOT_ADMIN') && <Lock size={12} className="text-rose-400 mr-2" />}
                                </div>
                            )}
                        </div>

                        <AnimatePresence initial={false}>
                            {expandedYears[year.id] && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden ml-6 border-l border-white/5 space-y-1 my-1"
                                >
                                    <Reorder.Group
                                        axis="y"
                                        values={[...(year.categories || [])].sort((a, b) => (a.order || 0) - (b.order || 0))}
                                        onReorder={(newOrder) => updateCategoriesOrder(year.id, newOrder)}
                                        className="space-y-1"
                                    >
                                        {[...(year.categories || [])].sort((a, b) => (a.order || 0) - (b.order || 0)).map((cat) => (
                                            <CategoryItem key={cat.id} cat={cat} yearId={year.id} />
                                        ))}
                                    </Reorder.Group>

                                    {addingCatFor === year.id ? (
                                        <div className="px-6 py-1">
                                            <input
                                                autoFocus
                                                placeholder="Category Name..."
                                                className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-[10px] text-white outline-none focus:border-indigo-500/50"
                                                value={newCatName}
                                                onChange={(e) => setNewCatName(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory(year.id)}
                                                onBlur={() => !newCatName && setAddingCatFor(null)}
                                            />
                                        </div>
                                    ) : (
                                        (userRole === 'ADMIN' || userRole === 'ROOT_ADMIN') && (
                                            <button
                                                onClick={() => setAddingCatFor(year.id)}
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

export default Sidebar;

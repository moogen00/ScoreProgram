import React, { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Settings, List, Shield, Trophy, Layout, Users, UserPlus, Hash, User as UserIcon, SortAsc, Lock, Unlock } from 'lucide-react';
import useStore from '../store/useStore';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
    return twMerge(clsx(inputs));
}

const AdminPanel = () => {
    const {
        scoringItems, addScoringItem, removeScoringItem, updateScoringItemOrder,
        judgesByYear, addJudge, removeJudge,
        participants, addParticipant, removeParticipant, updateParticipant,
        selectedCategoryId, years, addYear, updateYear, deleteYear,
        addCategory, updateCategory, deleteCategory, moveCategory, sortCategoriesByName, toggleYearLock,
        admins, addAdmin, removeAdmin, competitionName, setCompetitionName,
        currentUser
    } = useStore();

    const [activeTab, setActiveTab] = useState('scoring'); // 'scoring', 'hierarchy', 'judges', 'participants'

    // Form states
    const [newItemLabel, setNewItemLabel] = useState('');
    const [newJudgeEmail, setNewJudgeEmail] = useState('');
    const [newJudgeName, setNewJudgeName] = useState('');
    const [newPNumber, setNewPNumber] = useState('');
    const [newPName, setNewPName] = useState('');

    // Management Selection states
    const [manageYearId, setManageYearId] = useState('');
    const [manageCatId, setManageCatId] = useState('');

    // Hierarchy Management states
    const [newYearName, setNewYearName] = useState('');
    const [newCatName, setNewCatName] = useState('');
    const [editingYearId, setEditingYearId] = useState(null);
    const [editingCatId, setEditingCatId] = useState(null);
    const [editValue, setEditValue] = useState('');

    // Participant Edit states
    const [editingPId, setEditingPId] = useState(null);
    const [editPNumber, setEditPNumber] = useState('');
    const [editPName, setEditPName] = useState('');

    // Participant Batch & Sort states
    const [sortConfig, setSortConfig] = useState({ field: 'no', direction: 'asc' });

    // Find info for current category
    const findCatInfo = () => {
        for (const year of years) {
            const cat = year.categories.find(c => c.id === selectedCategoryId);
            if (cat) return { yearName: year.name, catName: cat.name };
        }
        return { yearName: '?', catName: 'None' };
    };
    const { yearName, catName } = findCatInfo();

    const handleAddScoring = (e) => {
        e.preventDefault();
        if (newItemLabel.trim()) {
            addScoringItem(newItemLabel.trim());
            setNewItemLabel('');
        }
    };

    const handleAddJudge = (e) => {
        e.preventDefault();
        if (manageYearId && newJudgeEmail.trim() && newJudgeName.trim()) {
            addJudge(manageYearId, newJudgeEmail.trim(), newJudgeName.trim());
            setNewJudgeEmail('');
            setNewJudgeName('');
        }
    };

    const handleAddParticipant = (e) => {
        e.preventDefault();
        if (manageCatId && newPNumber.trim() && newPName.trim()) {
            addParticipant(manageCatId, newPNumber.trim(), newPName.trim());
            setNewPNumber('');
            setNewPName('');
        }
    };

    const handleUpdateParticipant = (pId) => {
        updateParticipant(selectedCategoryId, pId, { number: editPNumber, name: editPName });
        setEditingPId(null);
    };

    const move = (index, direction) => {
        const newItems = [...scoringItems];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= newItems.length) return;
        [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
        updateScoringItemOrder(newItems.map((item, i) => ({ ...item, order: i })));
    };

    const currentCategoryParticipants = participants[selectedCategoryId] || [];

    const getYearParticipants = () => {
        if (!manageYearId) return [];
        const year = years.find(y => y.id === manageYearId);
        if (!year) return [];

        const all = [];
        year.categories.forEach(cat => {
            const catPs = participants[cat.id] || [];
            // Sort by participant number within category by default for consistent ordering
            const sortedCatPs = [...catPs].sort((a, b) =>
                a.number.localeCompare(b.number, undefined, { numeric: true })
            );
            sortedCatPs.forEach(p => {
                all.push({ ...p, categoryName: cat.name });
            });
        });

        // If sorting by 'no' (index) descending, just reverse the whole list
        if (sortConfig.field === 'no' && sortConfig.direction === 'desc') {
            return all.reverse();
        }

        return all;
    };
    const yearAllParticipants = getYearParticipants();

    const handleSort = () => {
        setSortConfig(prev => ({
            field: 'no',
            direction: prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-12">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Settings className="text-rose-400 w-8 h-8" />
                    <h1 className="text-3xl font-bold">Admin Workspace</h1>
                </div>
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 shadow-inner overflow-x-auto">
                    {[
                        { id: 'scoring', label: '채점 항목', icon: List },
                        { id: 'hierarchy', label: '대회 구조', icon: Layout },
                        { id: 'participants', label: '참가자 관리', icon: Users },
                        { id: 'judges', label: '심사위원 관리', icon: Shield },
                        { id: 'settings', label: '설정', icon: Settings },
                        ...(currentUser?.role === 'ROOT_ADMIN' ? [{ id: 'admins', label: '관리자(Root)', icon: Lock }] : [])
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
                                activeTab === tab.id ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
                            )}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Scoring Items Tab */}
            {activeTab === 'scoring' && (
                <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="flex items-center gap-2 mb-6">
                        <List className="text-indigo-400" />
                        <h2 className="text-xl font-bold text-white">채점 항목 설정</h2>
                    </div>
                    <form onSubmit={handleAddScoring} className="flex gap-4 mb-8">
                        <input
                            type="text"
                            value={newItemLabel}
                            onChange={(e) => setNewItemLabel(e.target.value)}
                            placeholder="새 채점 항목 이름"
                            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                        />
                        <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all hover:scale-[1.02]">
                            <Plus size={20} /> 추가
                        </button>
                    </form>
                    <div className="space-y-3">
                        {scoringItems.sort((a, b) => a.order - b.order).map((item, index) => (
                            <div key={item.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl group hover:bg-white/10 transition-all">
                                <div className="flex items-center gap-4">
                                    <span className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm">{index + 1}</span>
                                    <span className="font-bold text-lg text-white/90">{item.label}</span>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => move(index, -1)} disabled={index === 0} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 disabled:opacity-10"><ArrowUp size={18} /></button>
                                    <button onClick={() => move(index, 1)} disabled={index === scoringItems.length - 1} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 disabled:opacity-10"><ArrowDown size={18} /></button>
                                    <button onClick={() => removeScoringItem(item.id)} className="p-2 hover:bg-rose-500/20 rounded-lg text-rose-400"><Trash2 size={18} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Hierarchy Management Tab */}
            {activeTab === 'hierarchy' && (
                <div className="space-y-6">
                    <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex items-center gap-2 mb-6">
                            <Plus className="text-rose-400" />
                            <h2 className="text-xl font-bold text-white">연도(대회) 추가</h2>
                        </div>
                        <div className="flex gap-4">
                            <input
                                type="text"
                                value={newYearName}
                                onChange={(e) => setNewYearName(e.target.value)}
                                placeholder="예: 2027"
                                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none"
                            />
                            <button
                                onClick={() => { if (newYearName) { addYear(newYearName); setNewYearName(''); } }}
                                className="bg-rose-600 hover:bg-rose-500 text-white px-8 py-3 rounded-xl font-bold"
                            >추가</button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {years.map(year => (
                            <div key={year.id} className="glass-card p-6 space-y-4">
                                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                                    {editingYearId === year.id ? (
                                        <div className="flex gap-2 w-full">
                                            <input
                                                className="bg-black/60 border border-white/20 rounded px-2 py-1 text-white w-full"
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                            />
                                            <button onClick={() => { updateYear(year.id, editValue); setEditingYearId(null); }} className="text-xs bg-emerald-600 px-2 py-1 rounded">저장</button>
                                            <button onClick={() => setEditingYearId(null)} className="text-xs bg-slate-600 px-2 py-1 rounded">취소</button>
                                        </div>
                                    ) : (
                                        <>
                                            <h3 className="text-xl font-black text-rose-400">{year.name}</h3>
                                            <div className="flex gap-4 items-center">
                                                <button
                                                    onClick={() => toggleYearLock(year.id, !year.locked)}
                                                    className={cn(
                                                        "flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black transition-all",
                                                        year.locked ? "bg-rose-500 text-white" : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40"
                                                    )}
                                                >
                                                    {year.locked ? <><Lock size={10} /> LOCKED</> : <><Unlock size={10} /> ACTIVE</>}
                                                </button>
                                                <div className="flex gap-2">
                                                    <button onClick={() => { setEditingYearId(year.id); setEditValue(year.name); }} className="text-xs text-slate-400 hover:text-white">수정</button>
                                                    <button onClick={() => deleteYear(year.id)} className="text-xs text-rose-400/50 hover:text-rose-400 transition-colors">삭제</button>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center mb-2 px-1">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Categories</span>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => sortCategoriesByName(year.id, 'asc')}
                                                className="flex items-center gap-1 text-[10px] font-black text-indigo-400 hover:text-white transition-colors"
                                            >
                                                <SortAsc size={10} /> A-Z
                                            </button>
                                            <button
                                                onClick={() => sortCategoriesByName(year.id, 'desc')}
                                                className="flex items-center gap-1 text-[10px] font-black text-rose-400 hover:text-white transition-colors"
                                            >
                                                <SortAsc size={10} className="rotate-180" /> Z-A
                                            </button>
                                        </div>
                                    </div>
                                    {[...(year.categories || [])].sort((a, b) => (a.order || 0) - (b.order || 0)).map((cat, index, arr) => (
                                        <div key={cat.id} className="flex items-center justify-between bg-white/5 p-3 rounded-lg group hover:bg-white/10 transition-all">
                                            {editingCatId === cat.id ? (
                                                <div className="flex gap-2 w-full">
                                                    <input
                                                        className="bg-black/60 border border-white/20 rounded px-2 py-1 text-white text-sm w-full outline-none focus:border-indigo-500"
                                                        value={editValue}
                                                        onChange={(e) => setEditValue(e.target.value)}
                                                        autoFocus
                                                    />
                                                    <button onClick={() => { updateCategory(year.id, cat.id, editValue); setEditingCatId(null); }} className="text-[10px] bg-emerald-600 px-2 py-1 rounded">저장</button>
                                                    <button onClick={() => setEditingCatId(null)} className="text-[10px] bg-slate-600 px-2 py-1 rounded">취소</button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-[10px] font-black text-slate-600 w-4">{index + 1}</span>
                                                        <span className="text-sm font-bold text-white/80">{cat.name}</span>
                                                    </div>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => moveCategory(year.id, cat.id, -1)} disabled={index === 0} className="p-1 text-slate-500 hover:text-white disabled:opacity-0"><ArrowUp size={14} /></button>
                                                        <button onClick={() => moveCategory(year.id, cat.id, 1)} disabled={index === arr.length - 1} className="p-1 text-slate-500 hover:text-white disabled:opacity-0"><ArrowDown size={14} /></button>
                                                        <div className="w-px h-4 bg-white/10 mx-1 self-center" />
                                                        <button onClick={() => { setEditingCatId(cat.id); setEditValue(cat.name); }} className="text-[10px] text-slate-500 hover:text-white px-1">수정</button>
                                                        <button onClick={() => deleteCategory(year.id, cat.id)} className="text-[10px] text-rose-500/40 hover:text-rose-500 px-1">삭제</button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                    <div className="pt-2">
                                        <div className="flex gap-2">
                                            <input
                                                className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white w-full"
                                                placeholder="새 종목 추가..."
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && e.target.value) {
                                                        addCategory(year.id, e.target.value);
                                                        e.target.value = '';
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Participants Tab */}
            {activeTab === 'participants' && (
                <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div className="flex items-center gap-2">
                            <Users className="text-emerald-400" />
                            <h2 className="text-xl font-bold text-white">참가자 명단 관리</h2>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <select
                                value={manageYearId}
                                onChange={(e) => {
                                    setManageYearId(e.target.value);
                                    setManageCatId(''); // Reset category when year changes
                                }}
                                className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none"
                            >
                                <option value="">대회 연도 선택</option>
                                {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                            </select>
                            <select
                                value={manageCatId}
                                onChange={(e) => setManageCatId(e.target.value)}
                                disabled={!manageYearId}
                                className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none disabled:opacity-30"
                            >
                                <option value="">종목 선택</option>
                                {years.find(y => y.id === manageYearId)?.categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {manageCatId ? (
                        <>
                            <form onSubmit={handleAddParticipant} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-4 py-3">
                                    <Hash size={16} className="text-slate-500" />
                                    <input type="text" value={newPNumber} onChange={(e) => setNewPNumber(e.target.value)} placeholder="참가번호 (Back No.)" className="w-full bg-transparent outline-none text-white font-bold" />
                                </div>
                                <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-4 py-3">
                                    <UserIcon size={16} className="text-slate-500" />
                                    <input type="text" value={newPName} onChange={(e) => setNewPName(e.target.value)} placeholder="참가팀 이름" className="w-full bg-transparent outline-none text-white font-bold" />
                                </div>
                                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]">
                                    <UserPlus size={20} /> 참가자 등록
                                </button>
                            </form>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {(participants[manageCatId] || []).map(p => (
                                    <div key={p.id} className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between group">
                                        {editingPId === p.id ? (
                                            <div className="flex flex-col gap-2 w-full">
                                                <input className="bg-black/60 border border-white/20 rounded px-2 py-1 text-white text-sm" value={editPNumber} onChange={(e) => setEditPNumber(e.target.value)} placeholder="참가번호" />
                                                <input className="bg-black/60 border border-white/20 rounded px-2 py-1 text-white text-sm" value={editPName} onChange={(e) => setEditPName(e.target.value)} placeholder="이름" />
                                                <div className="flex gap-2">
                                                    <button onClick={() => { updateParticipant(manageCatId, p.id, { number: editPNumber, name: editPName }); setEditingPId(null); }} className="text-[10px] bg-emerald-600 px-3 py-1 rounded font-bold">저장</button>
                                                    <button onClick={() => setEditingPId(null)} className="text-[10px] bg-slate-600 px-3 py-1 rounded font-bold">취소</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">{p.number}</div>
                                                    <span className="font-bold text-white">{p.name}</span>
                                                </div>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                    <button onClick={() => { setEditingPId(p.id); setEditPNumber(p.number); setEditPName(p.name); }} className="p-2 hover:bg-white/10 rounded-lg text-slate-400"><Settings size={14} /></button>
                                                    <button onClick={() => removeParticipant(manageCatId, p.id)} className="p-2 hover:bg-rose-500/20 rounded-lg text-rose-400"><Trash2 size={16} /></button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                                {(participants[manageCatId] || []).length === 0 && (
                                    <div className="col-span-full py-12 text-center text-slate-500 italic border border-dashed border-white/10 rounded-xl">이 종목에 등록된 참가자가 없습니다.</div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-2xl">
                            <Users className="mx-auto text-white/5 mb-4" size={48} />
                            <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">연도와 종목을 선택하여 관리하세요</p>
                        </div>
                    )}

                    {manageYearId && (
                        <div className="mt-12 pt-8 border-t border-white/10">
                            <div className="flex items-center gap-3 mb-6">
                                <Layout className="text-indigo-400" />
                                <h3 className="text-lg font-bold text-white">{years.find(y => y.id === manageYearId)?.name}년 전체 참가자 현황</h3>
                                <span className="bg-indigo-500/20 text-indigo-400 text-[10px] font-black px-2 py-0.5 rounded-full">
                                    총 {yearAllParticipants.length}개 팀
                                </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 mb-4 bg-white/5 p-4 rounded-xl">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sort:</span>
                                <button onClick={handleSort} className={cn("flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-all", sortConfig.field === 'no' ? "bg-indigo-600 text-white" : "bg-black/20 text-slate-400 hover:text-white")}>
                                    <Hash size={12} /> No. {sortConfig.field === 'no' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                </button>
                            </div>

                            <div className="overflow-hidden rounded-xl border border-white/5 bg-black/20">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-white/5 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-white/5">
                                            <th className="px-6 py-5 w-20 text-center">No.</th>
                                            <th className="px-6 py-5 w-40">참가번호</th>
                                            <th className="px-6 py-5">참가팀</th>
                                            <th className="px-6 py-5">종목</th>
                                            <th className="px-6 py-5 w-24 text-center">관리</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {yearAllParticipants.map((p, index) => {
                                            const isNewCategory = index > 0 && p.categoryName !== yearAllParticipants[index - 1].categoryName;
                                            const currentYear = years.find(y => y.id === manageYearId);
                                            const catIndex = currentYear ? currentYear.categories.findIndex(c => c.id === p.categoryId) : 0;
                                            const PASTEL_COLORS = [
                                                'text-rose-400', 'text-orange-400', 'text-amber-400', 'text-emerald-400',
                                                'text-cyan-400', 'text-blue-400', 'text-violet-400', 'text-fuchsia-400'
                                            ];
                                            const colorClass = PASTEL_COLORS[catIndex % PASTEL_COLORS.length] || 'text-white';

                                            return (
                                                <React.Fragment key={`${p.categoryId}_${p.id}`}>
                                                    {isNewCategory && (
                                                        <tr>
                                                            <td colSpan={5} className="py-0">
                                                                <div className="h-0.5 w-full bg-indigo-500/30 my-1"></div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                    <tr className="hover:bg-white/[0.02] transition-colors group">
                                                        <td className="px-6 py-5 text-center font-black text-slate-600">
                                                            {sortConfig.direction === 'asc' ? index + 1 : yearAllParticipants.length - index}
                                                        </td>
                                                        {editingPId === p.id ? (
                                                            <>
                                                                <td className="px-6 py-4">
                                                                    <input
                                                                        className="bg-black/60 border border-white/20 rounded px-2 py-1 text-white text-lg font-bold w-full font-mono outline-none focus:border-indigo-500"
                                                                        value={editPNumber}
                                                                        onChange={(e) => setEditPNumber(e.target.value)}
                                                                        autoFocus
                                                                    />
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <input
                                                                        className="bg-black/60 border border-white/20 rounded px-2 py-1 text-white text-lg font-bold w-full outline-none focus:border-indigo-500"
                                                                        value={editPName}
                                                                        onChange={(e) => setEditPName(e.target.value)}
                                                                    />
                                                                </td>
                                                                <td className="px-6 py-5">
                                                                    <span className="text-xs bg-white/5 px-3 py-1.5 rounded-lg text-slate-300 font-bold uppercase tracking-tight">
                                                                        {p.categoryName}
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-4 text-center">
                                                                    <div className="flex items-center justify-center gap-2">
                                                                        <button onClick={() => { updateParticipant(p.categoryId, p.id, { number: editPNumber, name: editPName }); setEditingPId(null); }} className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded font-bold">저장</button>
                                                                        <button onClick={() => setEditingPId(null)} className="text-[10px] bg-slate-600 hover:bg-slate-500 text-white px-2 py-1 rounded font-bold">취소</button>
                                                                    </div>
                                                                </td>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <td className={cn("px-6 py-5 font-mono font-bold text-lg", colorClass)}>{p.number}</td>
                                                                <td className={cn("px-6 py-5 font-bold text-lg", colorClass)}>{p.name}</td>
                                                                <td className="px-6 py-5">
                                                                    <span className={cn("text-xs bg-white/5 px-3 py-1.5 rounded-lg font-bold uppercase tracking-tight", colorClass)}>
                                                                        {p.categoryName}
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-5 text-center">
                                                                    <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                                        <button onClick={() => { setEditingPId(p.id); setEditPNumber(p.number); setEditPName(p.name); }} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-indigo-400 transition-colors">
                                                                            <Settings size={16} />
                                                                        </button>
                                                                        <button onClick={() => { if (confirm('이 참가자를 삭제하시겠습니까? (No.는 자동으로 재정렬됩니다)')) removeParticipant(p.categoryId, p.id); }} className="p-2 hover:bg-rose-500/10 rounded-lg text-rose-400/60 hover:text-rose-400 transition-colors">
                                                                            <Trash2 size={16} />
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </>
                                                        )}
                                                    </tr>
                                                </React.Fragment>
                                            );
                                        })}
                                        {yearAllParticipants.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-8 py-16 text-center text-slate-500 italic text-lg">표시할 참가자가 없습니다.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Judges Tab */}
            {activeTab === 'judges' && (
                <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div className="flex items-center gap-2">
                            <Shield className="text-amber-400" />
                            <h2 className="text-xl font-bold text-white">심사위원 보안 관리</h2>
                        </div>
                        <select
                            value={manageYearId}
                            onChange={(e) => setManageYearId(e.target.value)}
                            className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none"
                        >
                            <option value="">대회 연도 선택</option>
                            {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                        </select>
                    </div>

                    {manageYearId ? (
                        <>
                            <form onSubmit={handleAddJudge} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                <input type="email" value={newJudgeEmail} onChange={(e) => setNewJudgeEmail(e.target.value)} placeholder="구글 이메일 (judge@gmail.com)" className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" />
                                <input type="text" value={newJudgeName} onChange={(e) => setNewJudgeName(e.target.value)} placeholder="심사위원 이름" className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" />
                                <button type="submit" className="bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]">
                                    <Shield size={20} /> 권한 부여
                                </button>
                            </form>
                            <div className="space-y-3">
                                {(judgesByYear[manageYearId] || []).map(j => (
                                    <div key={j.email} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center"><Shield size={20} /></div>
                                            <div>
                                                <p className="font-bold text-white">{j.name}</p>
                                                <p className="text-xs text-slate-500">{j.email}</p>
                                            </div>
                                        </div>
                                        <button onClick={() => removeJudge(manageYearId, j.email)} className="p-2 opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 rounded-lg text-rose-400 transition-all"><Trash2 size={18} /></button>
                                    </div>
                                ))}
                                {(judgesByYear[manageYearId] || []).length === 0 && (
                                    <div className="py-12 text-center text-slate-500 italic border border-dashed border-white/10 rounded-xl">등록된 외부 권한자가 없습니다.</div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-2xl">
                            <Shield className="mx-auto text-white/5 mb-4" size={48} />
                            <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">연도를 선택하여 심사위원을 관리하세요</p>
                        </div>
                    )}
                </div>
            )}

            {/* General Settings Tab */}
            {activeTab === 'settings' && (
                <div className="space-y-6">
                    <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex items-center gap-2 mb-6">
                            <Trophy className="text-indigo-400" />
                            <h2 className="text-xl font-bold text-white">대회 정보 설정</h2>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">대회 공식 명칭</label>
                                <div className="flex gap-4">
                                    <input
                                        type="text"
                                        value={competitionName}
                                        onChange={(e) => setCompetitionName(e.target.value)}
                                        className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Root Admin Management Tab */}
            {activeTab === 'admins' && currentUser?.role === 'ROOT_ADMIN' && (
                <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="flex items-center gap-2 mb-6">
                        <Shield className="text-rose-400" />
                        <h2 className="text-xl font-bold text-white">최고 관리자(Admin) 권한 관리</h2>
                    </div>
                    <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl mb-8">
                        <p className="text-xs text-rose-200 font-bold flex items-center gap-2">
                            <Lock size={12} /> Root Admin Area: 이곳에서 추가된 관리자는 모든 설정에 접근할 수 있습니다 (이 메뉴 제외).
                        </p>
                    </div>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            const email = e.target.email.value;
                            const name = e.target.name.value;
                            if (email && name) {
                                addAdmin(email, name);
                                e.target.reset();
                            }
                        }}
                        className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
                    >
                        <input name="email" type="email" placeholder="관리자 구글 이메일" required className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" />
                        <input name="name" type="text" placeholder="관리자 이름" required className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" />
                        <button type="submit" className="bg-rose-600 hover:bg-rose-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]">
                            <Plus size={20} /> 관리자 등록
                        </button>
                    </form>
                    <div className="space-y-3">
                        {admins.map(admin => (
                            <div key={admin.email} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center"><Shield size={20} /></div>
                                    <div>
                                        <p className="font-bold text-white">{admin.name}</p>
                                        <p className="text-xs text-slate-500">{admin.email}</p>
                                    </div>
                                </div>
                                <button onClick={() => removeAdmin(admin.email)} className="p-2 opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 rounded-lg text-rose-400 transition-all"><Trash2 size={18} /></button>
                            </div>
                        ))}
                        <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
                            <p className="text-[10px] text-indigo-300 italic">* 최초 Root 관리자는 삭제할 수 없습니다.</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPanel;

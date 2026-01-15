import React, { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Settings, List, Shield, Trophy, Layout, Users, UserPlus, Hash, User as UserIcon, SortAsc, Lock, Unlock, PenTool, FileUp, FileDown, Database, AlertTriangle, Check, LogOut, QrCode, X } from 'lucide-react';
import QRCode from "react-qr-code";
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
        participants, addParticipant, removeParticipant, updateParticipant, moveParticipants,
        selectedCategoryId, years,
        addCategory, updateCategory, deleteCategory, moveCategory, sortCategoriesByName, toggleYearLock,
        admins, addAdmin, removeAdmin, competitionName, setCompetitionName,
        seedRandomScores, clearYearScores,
        exportData, importData, clearAllData,
        currentUser,
        adminTab, setAdminTab
    } = useStore();



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
    const [editingCatId, setEditingCatId] = useState(null);
    const [editValue, setEditValue] = useState('');

    // Participant Edit states
    const [editingPId, setEditingPId] = useState(null);
    const [editPNumber, setEditPNumber] = useState('');
    const [editPName, setEditPName] = useState('');

    // Participant Batch & Sort states
    const [sortConfig, setSortConfig] = useState({ field: 'no', direction: 'asc' });
    const [recoveryTargetCatId, setRecoveryTargetCatId] = useState('');

    // Import states
    const [importMode, setImportMode] = useState('merge'); // 'merge' or 'replace'
    const [isImporting, setIsImporting] = useState(false);

    // QR Modal state
    const [showQrModal, setShowQrModal] = useState(false);
    const PRODUCTION_URL = "https://scoreprogram-f8fbb.web.app";


    // Find info for current category
    const findCatInfo = () => {
        for (const year of years) {
            const cat = (year.categories || []).find(c => c.id === selectedCategoryId);
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
            const currentList = participants[manageCatId] || [];
            if (currentList.some(p => p.number === newPNumber.trim())) {
                alert('이미 등록된 참가번호입니다. (Duplicate Number)');
                return;
            }
            addParticipant(manageCatId, newPNumber.trim(), newPName.trim());
            setNewPNumber('');
            setNewPName('');
        }
    };

    const validateAndUpdateParticipant = (categoryId, pId, newNumber, newName) => {
        if (!newNumber.trim() || !newName.trim()) return;

        const currentList = participants[categoryId] || [];
        const isDuplicate = currentList.some(p => p.number === newNumber.trim() && p.id !== pId);

        if (isDuplicate) {
            alert('이미 등록된 참가번호입니다. (Duplicate Number)');
            return;
        }

        updateParticipant(categoryId, pId, { number: newNumber.trim(), name: newName.trim() });
        setEditingPId(null);
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
        (year.categories || []).forEach(cat => {
            const catPs = participants[cat.id] || [];
            const sortedCatPs = [...catPs].sort((a, b) =>
                a.number.localeCompare(b.number, undefined, { numeric: true })
            );
            sortedCatPs.forEach(p => {
                all.push({ ...p, categoryName: cat.name, categoryId: cat.id });
            });
        });

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

    const getOrphanParticipants = () => {
        const allCatIds = new Set(years.flatMap(y => (y.categories || []).map(c => c.id)));
        const orphaned = [];
        Object.keys(participants).forEach(catId => {
            if (!allCatIds.has(catId)) {
                participants[catId].forEach(p => {
                    const yearName = catId.split('-')[0] || '?';
                    orphaned.push({ ...p, oldCategoryId: catId, yearName });
                });
            }
        });
        return orphaned;
    };
    const orphanParticipants = getOrphanParticipants();

    const handleRecovery = async (oldCatId, pIds) => {
        if (!recoveryTargetCatId) return alert('복구할 대상 종목을 선택해주세요.');
        if (confirm(`${pIds.length}명의 참가자를 선택한 종목으로 이동하시겠습니까?`)) {
            await moveParticipants(oldCatId, recoveryTargetCatId, pIds);
            setRecoveryTargetCatId('');
            alert('복구가 완료되었습니다.');
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-12">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Settings className="text-rose-400 w-8 h-8" />
                    <h1 className="text-3xl font-bold">Admin Workspace</h1>
                    <button
                        onClick={() => setShowQrModal(true)}
                        className="ml-4 px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 rounded-lg text-xs font-bold flex items-center gap-2 transition-all border border-indigo-500/30"
                    >
                        <QrCode size={14} />
                        QR Connect
                    </button>
                </div>
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 shadow-inner overflow-x-auto">
                    {[
                        { id: 'scoring', label: '채점 항목', icon: List },
                        { id: 'participants', label: '참가자 관리', icon: Users },
                        { id: 'judges', label: '심사위원 관리', icon: Shield },
                        { id: 'settings', label: '대회 설정', icon: Settings },
                        { id: 'data', label: '데이터 관리', icon: Database },
                        ...(currentUser?.role === 'ROOT_ADMIN' ? [{ id: 'admins', label: '관리자(Root)', icon: Lock }] : [])
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setAdminTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
                                adminTab === tab.id ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
                            )}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {adminTab === 'scoring' && (
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

            {adminTab === 'participants' && (
                <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div className="flex items-center gap-2">
                            <Users className="text-emerald-400" />
                            <h2 className="text-xl font-bold text-white">참가자 명단 관리</h2>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <select value={manageYearId} onChange={(e) => { setManageYearId(e.target.value); setManageCatId(''); }} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none">
                                <option value="">대회 연도 선택</option>
                                {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                            </select>
                            <select value={manageCatId} onChange={(e) => setManageCatId(e.target.value)} disabled={!manageYearId} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none disabled:opacity-30">
                                <option value="">종목 선택</option>
                                {years.find(y => y.id === manageYearId)?.categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                    </div>

                    {manageCatId ? (
                        <>
                            <form onSubmit={handleAddParticipant} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-4 py-3">
                                    <Hash size={16} className="text-slate-500" /><input type="text" value={newPNumber} onChange={(e) => setNewPNumber(e.target.value)} placeholder="참가번호 (Back No.)" className="w-full bg-transparent outline-none text-white font-bold" />
                                </div>
                                <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-4 py-3">
                                    <UserIcon size={16} className="text-slate-500" /><input type="text" value={newPName} onChange={(e) => setNewPName(e.target.value)} placeholder="참가팀 이름" className="w-full bg-transparent outline-none text-white font-bold" />
                                </div>
                                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"><UserPlus size={20} /> 참가자 등록</button>
                            </form>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {(participants[manageCatId] || []).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })).map(p => (
                                    <div key={p.id} className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between group">
                                        {editingPId === p.id ? (
                                            <div className="flex flex-col gap-2 w-full">
                                                <input className="bg-black/60 border border-white/20 rounded px-2 py-1 text-white text-sm" value={editPNumber} onChange={(e) => setEditPNumber(e.target.value)} placeholder="참가번호" />
                                                <input className="bg-black/60 border border-white/20 rounded px-2 py-1 text-white text-sm" value={editPName} onChange={(e) => setEditPName(e.target.value)} placeholder="이름" />
                                                <div className="flex gap-2">
                                                    <button onClick={() => validateAndUpdateParticipant(manageCatId, p.id, editPNumber, editPName)} className="text-[10px] bg-emerald-600 px-3 py-1 rounded font-bold">저장</button>
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
                                <h3 className="text-lg font-bold text-white uppercase">{years.find(y => y.id === manageYearId)?.name}년 전체 참가자 현황</h3>
                                <span className="bg-indigo-500/20 text-indigo-400 text-[10px] font-black px-2 py-0.5 rounded-full">총 {yearAllParticipants.length}개 팀</span>
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
                                        {yearAllParticipants.map((p, index) => (
                                            <tr key={`${p.categoryId}_${p.id}`} className="hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-6 py-5 text-center font-black text-slate-600">{index + 1}</td>
                                                {editingPId === p.id ? (
                                                    <>
                                                        <td className="px-6 py-5">
                                                            <input
                                                                className="w-full bg-black/60 border border-white/20 rounded px-2 py-1 text-white text-lg font-mono font-bold outline-none focus:border-indigo-500"
                                                                value={editPNumber}
                                                                onChange={(e) => setEditPNumber(e.target.value)}
                                                                placeholder="Back No."
                                                                autoFocus
                                                            />
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            <input
                                                                className="w-full bg-black/60 border border-white/20 rounded px-2 py-1 text-white text-lg font-bold outline-none focus:border-indigo-500"
                                                                value={editPName}
                                                                onChange={(e) => setEditPName(e.target.value)}
                                                                placeholder="Name"
                                                            />
                                                        </td>
                                                        <td className="px-6 py-5"><span className="text-xs bg-white/5 px-3 py-1.5 rounded-lg text-slate-300 font-bold uppercase tracking-tight">{p.categoryName}</span></td>
                                                        <td className="px-6 py-5 text-center">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <button
                                                                    onClick={() => validateAndUpdateParticipant(p.categoryId, p.id, editPNumber, editPName)}
                                                                    className="p-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white"
                                                                    title="저장"
                                                                >
                                                                    <Check size={16} />
                                                                </button>
                                                                <button
                                                                    onClick={() => setEditingPId(null)}
                                                                    className="p-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-white"
                                                                    title="취소"
                                                                >
                                                                    <LogOut size={16} className="rotate-180" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="px-6 py-5 font-mono font-bold text-lg text-white">{p.number}</td>
                                                        <td className="px-6 py-5 font-bold text-lg text-white">{p.name}</td>
                                                        <td className="px-6 py-5"><span className="text-xs bg-white/5 px-3 py-1.5 rounded-lg text-slate-300 font-bold uppercase tracking-tight">{p.categoryName}</span></td>
                                                        <td className="px-6 py-5 text-center">
                                                            <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                                <button onClick={() => { setEditingPId(p.id); setEditPNumber(p.number); setEditPName(p.name); }} className="p-2 hover:bg-white/10 rounded-lg text-slate-400"><Settings size={16} /></button>
                                                                <button onClick={() => removeParticipant(p.categoryId, p.id)} className="p-2 hover:bg-rose-500/20 rounded-lg text-rose-400"><Trash2 size={16} /></button>
                                                            </div>
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    {/* Orphan Participants Recovery Section */}
                    {orphanParticipants.length > 0 && (
                        <div className="mt-12 p-6 bg-rose-500/5 border border-rose-500/20 rounded-2xl animate-pulse-subtle">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-rose-500/20 rounded-lg text-rose-400">
                                    <Trash2 size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">끊어진 참가자 복구 (Recovery Required)</h3>
                                    <p className="text-xs text-rose-400/70">종목 정보가 삭제되거나 변경되어 연결이 끊어진 {orphanParticipants.length}명의 참가자가 발견되었습니다.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                {Object.entries(
                                    orphanParticipants.reduce((acc, p) => {
                                        if (!acc[p.oldCategoryId]) acc[p.oldCategoryId] = [];
                                        acc[p.oldCategoryId].push(p);
                                        return acc;
                                    }, {})
                                ).map(([oldCatId, ps]) => (
                                    <div key={oldCatId} className="bg-black/40 border border-white/10 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Ghost Category ID</p>
                                            <code className="text-rose-400 font-mono text-sm">{oldCatId}</code>
                                            <p className="text-white font-bold mt-1">{ps.length}명의 참가자 (예: {ps[0].name}...)</p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2 items-end sm:items-center">
                                            <select
                                                value={recoveryTargetCatId}
                                                onChange={(e) => setRecoveryTargetCatId(e.target.value)}
                                                className="bg-slate-800 border border-white/20 rounded-lg px-3 py-2 text-xs text-white outline-none w-full sm:w-48"
                                            >
                                                <option value="">복구 대상 종목 선택</option>
                                                {years.map(y => (
                                                    <optgroup key={y.id} label={`${y.name}년`}>
                                                        {(y.categories || []).map(c => (
                                                            <option key={c.id} value={c.id}>{c.name}</option>
                                                        ))}
                                                    </optgroup>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => handleRecovery(oldCatId, ps.map(p => p.id))}
                                                disabled={!recoveryTargetCatId}
                                                className="bg-rose-600 hover:bg-rose-500 disabled:opacity-30 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
                                            >
                                                이 종목으로 모두 이동
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {adminTab === 'judges' && (
                <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div className="flex items-center gap-2">
                            <Shield className="text-amber-400" />
                            <h2 className="text-xl font-bold text-white">심사위원 보안 관리</h2>
                        </div>
                        <select value={manageYearId} onChange={(e) => setManageYearId(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none">
                            <option value="">대회 연도 선택</option>
                            {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                        </select>
                    </div>

                    {manageYearId ? (
                        <>
                            <form onSubmit={handleAddJudge} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                <input type="email" value={newJudgeEmail} onChange={(e) => setNewJudgeEmail(e.target.value)} placeholder="구글 이메일" className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" />
                                <input type="text" value={newJudgeName} onChange={(e) => setNewJudgeName(e.target.value)} placeholder="심사위원 이름" className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" />
                                <button type="submit" className="bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"><Shield size={20} /> 권한 부여</button>
                            </form>
                            <div className="space-y-3">
                                {(judgesByYear[manageYearId] || []).map(j => (
                                    <div key={j.email} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center"><Shield size={20} /></div>
                                            <div><p className="font-bold text-white">{j.name}</p><p className="text-xs text-slate-500">{j.email}</p></div>
                                        </div>
                                        <button onClick={() => removeJudge(manageYearId, j.email)} className="p-2 opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 rounded-lg text-rose-400 transition-all"><Trash2 size={18} /></button>
                                    </div>
                                ))}
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

            {adminTab === 'settings' && (
                <div className="space-y-6">
                    <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex items-center gap-2 mb-6">
                            <Trophy className="text-indigo-400" />
                            <h2 className="text-xl font-bold text-white">대회 정보 설정</h2>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">대회 공식 명칭</label>
                                <input type="text" value={competitionName} onChange={(e) => setCompetitionName(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" />
                            </div>
                        </div>
                    </div>

                    {import.meta.env.DEV && (
                        <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500 bg-amber-500/5 border-amber-500/20">
                            <div className="flex items-center gap-2 mb-6">
                                <PenTool className="text-amber-400" />
                                <h2 className="text-xl font-bold text-white">테스트 데이터 도구 (Developer)</h2>
                            </div>
                            <div className="space-y-4">
                                <p className="text-xs text-slate-400">2025년 종목들에 대해 가상의 심사위원 3명의 점수를 자동으로 생성하거나 초기화합니다.</p>
                                <div className="flex gap-4">
                                    <button
                                        onClick={async () => {
                                            if (confirm('2025년 모든 종목에 랜덤 점수를 생성하시겠습니까? (수 초 소요될 수 있습니다)')) {
                                                await seedRandomScores('2025');
                                                alert('2025년 데이터 생성이 완료되었습니다.');
                                            }
                                        }}
                                        className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-3 rounded-xl font-bold transition-all"
                                    >
                                        2025년 랜덤 데이터 채우기
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (confirm('2025년의 모든 점수 데이터를 삭제하시겠습니까?')) {
                                                await clearYearScores('2025');
                                                alert('2025년 데이터가 초기화되었습니다.');
                                            }
                                        }}
                                        className="bg-white/5 border border-white/10 hover:bg-rose-500/20 hover:border-rose-500/50 text-slate-400 hover:text-rose-400 px-6 py-3 rounded-xl font-bold transition-all"
                                    >
                                        2025년 점수 초기화
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {adminTab === 'data' && (
                <div className="space-y-6">
                    <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex items-center gap-2 mb-6">
                            <Database className="text-indigo-400" />
                            <h2 className="text-xl font-bold text-white">데이터 백업 및 관리 (JSON)</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Export Section */}
                            <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                                <FileDown className="text-indigo-400 mb-4" size={32} />
                                <h3 className="text-lg font-bold text-white mb-2">DB 데이터 내보내기</h3>
                                <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                                    현재 연도, 종목, 참가자, 심사위원 정보를 포함한 전체 DB 정보를 JSON 파일로 내려받습니다.
                                </p>
                                <button
                                    onClick={exportData}
                                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                                >
                                    <FileDown size={20} /> JSON 파일 다운로드
                                </button>
                            </div>

                            {/* Import Section */}
                            <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                                <FileUp className="text-emerald-400 mb-4" size={32} />
                                <h3 className="text-lg font-bold text-white mb-2">DB 데이터 가져오기</h3>
                                <div className="flex gap-4 mb-4">
                                    <label className="flex-1 flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="importMode"
                                            checked={importMode === 'merge'}
                                            onChange={() => setImportMode('merge')}
                                            className="accent-emerald-500"
                                        />
                                        <span className="text-xs text-slate-300">병합 (Merge)</span>
                                    </label>
                                    <label className="flex-1 flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="importMode"
                                            checked={importMode === 'replace'}
                                            onChange={() => setImportMode('replace')}
                                            className="accent-rose-500"
                                        />
                                        <span className="text-xs text-slate-300 text-rose-400">전체 교체 (Replace)</span>
                                    </label>
                                </div>
                                <input
                                    type="file"
                                    accept=".json"
                                    id="import-file"
                                    className="hidden"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;

                                        if (importMode === 'replace' && !window.confirm("주의! 기존 데이터가 모두 삭제되고 파일 내용으로 대체됩니다. 진행하시겠습니까?")) {
                                            e.target.value = '';
                                            return;
                                        }

                                        const reader = new FileReader();
                                        reader.onload = async (event) => {
                                            try {
                                                setIsImporting(true);
                                                const json = JSON.parse(event.target.result);
                                                await importData(json, importMode);
                                                alert('데이터를 성공적으로 가져왔습니다.');
                                            } catch (err) {
                                                alert('파일 읽기 또는 데이터 처리 중 오류가 발생했습니다: ' + err.message);
                                            } finally {
                                                setIsImporting(false);
                                                e.target.value = '';
                                            }
                                        };
                                        reader.readAsText(file);
                                    }}
                                />
                                <button
                                    onClick={() => document.getElementById('import-file').click()}
                                    disabled={isImporting}
                                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                                >
                                    {isImporting ? <span className="animate-spin text-xl">⏳</span> : <FileUp size={20} />}
                                    JSON 파일 업로드
                                </button>
                            </div>
                        </div>

                        {/* Danger Zone - Dev Only */}
                        {import.meta.env.DEV && (
                            <div className="mt-12 p-6 bg-rose-500/5 border border-rose-500/20 rounded-2xl">
                                <div className="flex items-center gap-3 mb-4">
                                    <AlertTriangle className="text-rose-500" />
                                    <h3 className="text-lg font-bold text-white">Danger Zone (Dev Only)</h3>
                                </div>
                                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                                    <p className="text-xs text-slate-400">모든 연도, 종목, 참가자, 점수 등 데이터베이스의 **모든 정보를 영구적으로 삭제**합니다.</p>
                                    <button
                                        onClick={clearAllData}
                                        className="px-6 py-3 bg-white/5 border border-rose-500/30 text-rose-400 hover:bg-rose-500 hover:text-white rounded-xl text-xs font-bold transition-all whitespace-nowrap"
                                    >
                                        데이터베이스 완전 초기화
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {adminTab === 'admins' && currentUser?.role === 'ROOT_ADMIN' && (
                <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="flex items-center gap-2 mb-6">
                        <Shield className="text-rose-400" />
                        <h2 className="text-xl font-bold text-white">최고 관리자(Admin) 권한 관리</h2>
                    </div>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            const email = e.target.email.value;
                            const name = e.target.name.value;
                            if (email && name) { addAdmin(email, name); e.target.reset(); }
                        }}
                        className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
                    >
                        <input name="email" type="email" placeholder="관리자 구글 이메일" required className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" />
                        <input name="name" type="text" placeholder="관리자 이름" required className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none" />
                        <button type="submit" className="bg-rose-600 hover:bg-rose-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"><Plus size={20} /> 관리자 등록</button>
                    </form>
                    <div className="space-y-3">
                        {admins.map(admin => (
                            <div key={admin.email} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center"><Shield size={20} /></div>
                                    <div><p className="font-bold text-white">{admin.name}</p><p className="text-xs text-slate-500">{admin.email}</p></div>
                                </div>
                                <button onClick={() => removeAdmin(admin.email)} className="p-2 opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 rounded-lg text-rose-400 transition-all"><Trash2 size={18} /></button>
                            </div>
                        ))}
                    </div>
                </div>

            )}

            {/* QR Code Modal */}
            {
                showQrModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-[#1e1e1e] border border-white/10 rounded-3xl p-8 max-w-md w-full relative shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
                            <button
                                onClick={() => setShowQrModal(false)}
                                className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all"
                            >
                                <X size={20} />
                            </button>

                            <div className="text-center space-y-6">
                                <div>
                                    <h2 className="text-2xl font-black text-white mb-2">Connect to Competition</h2>
                                    <p className="text-slate-400 text-sm">Scan with your camera to access</p>
                                </div>

                                <div className="bg-white p-4 rounded-2xl inline-block shadow-[0_0_40px_-10px_rgba(99,102,241,0.5)]">
                                    <QRCode
                                        value={PRODUCTION_URL}
                                        size={200}
                                        level="H"
                                    />
                                </div>

                                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
                                    <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest mb-1">Production URL</p>
                                    <p className="text-white font-mono text-sm break-all font-bold">{PRODUCTION_URL}</p>
                                </div>

                                {import.meta.env.DEV && (
                                    <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3">
                                        <p className="text-[10px] text-amber-500/70 font-bold uppercase tracking-widest mb-1">Local Network URL (Dev)</p>
                                        <p className="text-slate-400 font-mono text-xs">{window.location.href}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default AdminPanel;

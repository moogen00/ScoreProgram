import { User, LogOut, Shield, PenTool, Layout, ChevronRight, Calendar, Layers, Menu } from 'lucide-react';
import useStore from '../store/useStore';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
    return twMerge(clsx(inputs));
}

const Header = ({ onMenuClick }) => {
    const { currentUser, logout, selectedCategoryId, years } = useStore();

    // Find current year and category names for breadcrumbs
    const findInfo = () => {
        for (const year of years) {
            const cat = year?.categories?.find(c => c.id === selectedCategoryId);
            if (cat) return { yearName: year.name || '대회 연도 미정', catName: cat.name || '종목 미지정' };
        }
        return { yearName: '대회 연도 미정', catName: '종목 미지정' };
    };

    const { yearName, catName } = findInfo();

    const getRoleConfig = (role) => {
        switch (role) {
            case 'ROOT_ADMIN':
            case 'ADMIN': return { label: 'Admin User', icon: Shield, color: 'text-rose-400', bg: 'bg-rose-500/10' };
            case 'JUDGE': return { label: '심사위원', icon: PenTool, color: 'text-amber-400', bg: 'bg-amber-500/10' };
            default: return { label: '일반사용자', icon: User, color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
        }
    };

    const roleConfig = getRoleConfig(currentUser?.role);
    const RoleIcon = roleConfig.icon;

    return (
        <header className="h-16 md:h-20 glass border-b border-white/10 flex items-center justify-between px-4 md:px-8 z-10 shrink-0">
            <div className="flex flex-col">
                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                    <button
                        onClick={onMenuClick}
                        className="mr-2 p-1 -ml-1 text-slate-400 hover:text-white md:hidden"
                    >
                        <Menu size={18} />
                    </button>
                    <Calendar size={10} className="text-indigo-400/50" />
                    <span>{yearName}</span>
                    <ChevronRight size={10} className="opacity-30" />
                    <Layers size={10} className="text-indigo-400" />
                    <span className="text-indigo-400">{catName}</span>
                </div>
                <h2 className="text-sm font-semibold text-white/90">
                    현황: {catName}
                </h2>
            </div>

            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3 pr-6 border-r border-white/10">
                    <div className="text-right">
                        <p className="text-xs font-bold text-white">{currentUser?.name}</p>
                        <div className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter",
                            roleConfig.bg, roleConfig.color
                        )}>
                            <RoleIcon size={10} />
                            {roleConfig.label}
                        </div>
                    </div>
                    {currentUser?.picture ? (
                        <img src={currentUser.picture} alt="profile" className="w-10 h-10 rounded-xl border border-white/10 shadow-lg" />
                    ) : (
                        <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-indigo-400 font-bold border border-white/10">
                            {currentUser?.name?.[0]}
                        </div>
                    )}
                </div>

                <button
                    onClick={logout}
                    className="p-2.5 rounded-xl bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-all border border-white/5 hover:border-rose-500/20 active:scale-95 group"
                    title="로그아웃"
                >
                    <LogOut size={18} className="group-hover:-translate-x-0.5 transition-transform" />
                </button>
            </div>
        </header>
    );
};

export default Header;

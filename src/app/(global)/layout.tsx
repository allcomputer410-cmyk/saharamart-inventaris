'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  Users,
  RefreshCw,
  Shield,
  Menu,
  X,
  Store,
  LogOut,
  Bell,
  User,
  ChevronLeft,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  disabled?: boolean;
  badge?: string;
}

const navItems: NavItem[] = [
  { label: 'Dashboard Global', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Manajemen User', href: '/users', icon: Users },
  { label: 'Sync Monitor', href: '/sync', icon: RefreshCw },
  { label: 'Audit Log', href: '/audit', icon: Shield },
];

export default function GlobalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-72 bg-slate-800 text-slate-200 transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Store className="w-6 h-6 text-blue-400" />
              <div>
                <h2 className="text-sm font-bold text-white">Inventaris</h2>
                <p className="text-xs text-slate-400">Panel Global</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded-lg hover:bg-slate-700 lg:hidden"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto py-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.disabled ? '#' : item.href}
                  onClick={() => {
                    if (!item.disabled) setSidebarOpen(false);
                  }}
                  className={cn(
                    'flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-colors',
                    isActive
                      ? 'bg-blue-600 text-white font-medium'
                      : item.disabled
                        ? 'text-slate-500 cursor-not-allowed'
                        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  )}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto text-[10px] bg-slate-600 text-slate-300 px-1.5 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="border-t border-slate-700 p-3">
            <Link
              href="/pilih-toko"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Pilih Toko</span>
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-100 lg:hidden"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>

            <div className="flex items-center gap-2">
              <button className="relative p-2 rounded-lg hover:bg-gray-100">
                <Bell className="w-5 h-5 text-gray-600" />
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100"
                >
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-blue-600" />
                  </div>
                </button>
                {showUserMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowUserMenu(false)}
                    />
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 w-full px-4 py-3 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <LogOut className="w-4 h-4" />
                        Keluar
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

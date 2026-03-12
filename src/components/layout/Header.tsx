'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Menu, Bell, LogOut, User, X, ChevronRight } from 'lucide-react';
import { formatDate } from '@/lib/utils';

const ROLE_LABEL: Record<string, string> = {
  owner:        'Owner',
  manajer:      'Manajer',
  direktur:     'Direktur',
  gm:           'General Manager',
  supervisor:   'Supervisor',
  staff:        'Staff',
  kasir:        'Kasir',
  admin_gudang: 'Admin Gudang',
};

interface HeaderProps {
  onMenuClick: () => void;
  pageTitle?: string;
  userName?: string;
  userRole?: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  action_url?: string;
  created_at: string;
}

const NOTIF_STYLE: Record<string, { bg: string; dot: string }> = {
  critical_stock:       { bg: 'bg-red-50',    dot: 'bg-red-500' },
  low_stock:            { bg: 'bg-yellow-50', dot: 'bg-yellow-500' },
  order_received:       { bg: 'bg-green-50',  dot: 'bg-green-500' },
  sync_error:           { bg: 'bg-red-50',    dot: 'bg-red-500' },
  sync_success:         { bg: 'bg-blue-50',   dot: 'bg-blue-500' },
  promo_recommendation: { bg: 'bg-purple-50', dot: 'bg-purple-500' },
  default:              { bg: 'bg-gray-50',   dot: 'bg-gray-400' },
};

export default function Header({ onMenuClick, pageTitle, userName = '', userRole = '' }: HeaderProps) {
  const router = useRouter();
  const params = useParams();
  const storeId = (params?.id as string) || null;
  const supabase = createClient();

  const [mounted, setMounted] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Pastikan user-info hanya render di client (hindari hydration mismatch)
  useEffect(() => { setMounted(true); }, []);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch notifikasi saat mount
  useEffect(() => {
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // Realtime: dengarkan INSERT notifikasi baru
  useEffect(() => {
    const channel = supabase
      .channel('header-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          const n = payload.new as Notification;
          // Hanya tampilkan jika untuk toko ini atau global (store_id null)
          if (!n.is_read) {
            setNotifications((prev) => [n, ...prev].slice(0, 50));
            setUnreadCount((c) => c + 1);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  async function fetchNotifications() {
    setLoadingNotifs(true);
    let query = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (storeId) {
      query = query.or(`store_id.eq.${storeId},store_id.is.null`);
    }

    const { data } = await query;
    if (data) {
      setNotifications(data);
      setUnreadCount(data.filter((n: Notification) => !n.is_read).length);
    }
    setLoadingNotifs(false);
  }

  async function markAllRead() {
    if (unreadCount === 0) return;
    const ids = notifications.filter((n) => !n.is_read).map((n) => n.id);
    await supabase.from('notifications').update({ is_read: true }).in('id', ids);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }

  async function markOneRead(notif: Notification) {
    if (!notif.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (notif.action_url) {
      router.push(notif.action_url);
      setShowNotifPanel(false);
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const getStyle = (type: string) => NOTIF_STYLE[type] ?? NOTIF_STYLE.default;

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">

        {/* Left */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="p-2 rounded-lg hover:bg-gray-100 lg:hidden"
            aria-label="Buka menu"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          {pageTitle && (
            <h1 className="text-lg font-semibold text-gray-800">{pageTitle}</h1>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-1">

          {/* ── Bell Notifikasi ── */}
          <div className="relative">
            <button
              onClick={() => { setShowNotifPanel((v) => !v); setShowUserMenu(false); }}
              className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Notifikasi"
            >
              <Bell className="w-5 h-5 text-gray-600" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifPanel && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifPanel(false)} />
                <div
                  ref={panelRef}
                  className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden"
                >
                  {/* Panel Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold text-gray-800 text-sm">Notifikasi</span>
                      {unreadCount > 0 && (
                        <span className="badge bg-red-100 text-red-700">{unreadCount} baru</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllRead}
                          className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                        >
                          Semua dibaca
                        </button>
                      )}
                      <button onClick={() => setShowNotifPanel(false)} className="p-1 rounded hover:bg-gray-100">
                        <X className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  </div>

                  {/* Promo Recommendation Banner */}
                  {(() => {
                    const promoNotifs = notifications.filter((n) => n.type === 'promo_recommendation' && !n.is_read);
                    if (promoNotifs.length === 0) return null;
                    return (
                      <div className="px-4 py-2 bg-purple-50 border-b border-purple-100 flex items-center justify-between gap-2">
                        <span className="text-xs text-purple-700 font-medium">
                          {promoNotifs.length > 1 ? `${promoNotifs.length} notif` : ''} produk butuh perhatian promo
                        </span>
                        {promoNotifs[0].action_url && (
                          <button
                            onClick={() => { router.push(promoNotifs[0].action_url!); setShowNotifPanel(false); }}
                            className="text-xs text-purple-600 font-semibold hover:underline whitespace-nowrap"
                          >
                            Lihat Rekomendasi →
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {/* List */}
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                    {loadingNotifs ? (
                      <div className="py-10 text-center text-sm text-gray-400">Memuat...</div>
                    ) : notifications.length === 0 ? (
                      <div className="py-10 text-center">
                        <Bell className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                        <p className="text-sm text-gray-400">Belum ada notifikasi</p>
                      </div>
                    ) : (
                      notifications.map((notif) => {
                        const s = getStyle(notif.type);
                        return (
                          <button
                            key={notif.id}
                            onClick={() => markOneRead(notif)}
                            className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3 ${!notif.is_read ? s.bg : ''}`}
                          >
                            <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${!notif.is_read ? s.dot : 'bg-gray-200'}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm leading-snug ${!notif.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                                {notif.title}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                              <p className="text-xs text-gray-400 mt-1">{formatDate(notif.created_at)}</p>
                            </div>
                            {notif.action_url && (
                              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── User Menu ── */}
          <div className="relative">
            <button
              onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifPanel(false); }}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Menu pengguna"
            >
              {/* Avatar — selalu SVG, tidak pernah conditional (hindari hydration error) */}
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-white" />
              </div>
              {/* Nama singkat — hanya tampil di layar md ke atas */}
              {mounted && userName && (
                <div className="hidden md:block text-left">
                  <p className="text-xs font-semibold text-gray-800 leading-tight">{userName}</p>
                  <p className="text-[10px] text-gray-500 leading-tight">
                    {ROLE_LABEL[userRole] || userRole || 'Staff'}
                  </p>
                </div>
              )}
            </button>

            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
                  {/* Info user di atas dropdown */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {mounted ? (userName || 'Pengguna') : 'Pengguna'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {mounted ? (ROLE_LABEL[userRole] || userRole || 'Staff') : 'Staff'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
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
  );
}

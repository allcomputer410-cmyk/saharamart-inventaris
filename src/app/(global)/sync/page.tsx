'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Server,
  Wifi,
  WifiOff,
  Clock,
} from 'lucide-react';

interface SyncLogRow {
  id: string;
  store_id: string | null;
  sync_type: string | null;
  started_at: string;
  completed_at: string | null;
  records_synced: number;
  errors: Record<string, unknown> | null;
  status: string;
  store?: { id: string; code: string; name: string } | { id: string; code: string; name: string }[];
}

interface StoreStatus {
  storeId: string;
  storeName: string;
  storeCode: string;
  lastSync: string | null;
  lastStatus: string;
  lastRecords: number;
  isOnline: boolean;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  running: { icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Berjalan' },
  success: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'Berhasil' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Gagal' },
  partial: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Sebagian' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

export default function SyncPage() {
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [syncLogs, setSyncLogs] = useState<SyncLogRow[]>([]);
  const [storeStatuses, setStoreStatuses] = useState<StoreStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSyncLogs = useCallback(async () => {
    const { data, error } = await supabase
      .from('sync_log')
      .select(`
        *,
        store:stores(id, code, name)
      `)
      .neq('sync_type', 'heartbeat')
      .order('started_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching sync logs:', error);
      return;
    }

    const logs = (data || []) as SyncLogRow[];
    setSyncLogs(logs);

    // Build per-store status from latest sync per store
    const storeMap = new Map<string, StoreStatus>();
    for (const log of logs) {
      const store = Array.isArray(log.store) ? log.store[0] : log.store;
      if (!store) continue;
      if (storeMap.has(store.id)) continue;

      const completed = log.completed_at || log.started_at;
      const minutesAgo = (Date.now() - new Date(completed).getTime()) / 60000;

      storeMap.set(store.id, {
        storeId: store.id,
        storeName: store.name,
        storeCode: store.code,
        lastSync: completed,
        lastStatus: log.status,
        lastRecords: log.records_synced,
        isOnline: minutesAgo < 30,
      });
    }
    setStoreStatuses(Array.from(storeMap.values()));
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchSyncLogs();
    const interval = setInterval(fetchSyncLogs, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalSyncs = syncLogs.length;
  const successCount = syncLogs.filter(l => l.status === 'success').length;
  const failedCount = syncLogs.filter(l => l.status === 'failed').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Sync Monitor</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pantau status sinkronisasi iPOS ke aplikasi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setLoading(true); fetchSyncLogs(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            Auto 30s
          </div>
        </div>
      </div>

      {/* Info Card */}
      <div className="card bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <Server className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-800 text-sm">Cara Kerja Sync</h3>
            <p className="text-xs text-blue-600 mt-1">
              Python sync agent berjalan di PC kasir. Saat PC dinyalakan, agent otomatis
              membaca database iPOS (PostgreSQL 8.4) dan mengirim data ke Supabase.
              Data yang disync: produk, stok, penjualan harian.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Store Status Cards */}
          {storeStatuses.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {storeStatuses.map((store) => {
                const statusCfg = STATUS_CONFIG[store.lastStatus] || STATUS_CONFIG.running;
                return (
                  <div key={store.storeId} className="card">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {store.isOnline ? (
                          <Wifi className="w-4 h-4 text-green-500" />
                        ) : (
                          <WifiOff className="w-4 h-4 text-gray-400" />
                        )}
                        <span className="font-semibold text-gray-800">{store.storeName}</span>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 space-y-1">
                      <div className="flex justify-between">
                        <span>Kode:</span>
                        <span className="font-mono font-medium">{store.storeCode}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Sync terakhir:</span>
                        <span>{store.lastSync ? timeAgo(store.lastSync) : 'Belum pernah'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Records:</span>
                        <span className="font-medium">{store.lastRecords.toLocaleString('id-ID')}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Summary */}
          {totalSyncs > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="card text-center py-3">
                <p className="text-xs text-gray-500">Total Sync</p>
                <p className="text-lg font-bold text-gray-800">{totalSyncs}</p>
              </div>
              <div className="card text-center py-3">
                <p className="text-xs text-gray-500">Berhasil</p>
                <p className="text-lg font-bold text-green-600">{successCount}</p>
              </div>
              <div className="card text-center py-3">
                <p className="text-xs text-gray-500">Gagal</p>
                <p className="text-lg font-bold text-red-600">{failedCount}</p>
              </div>
            </div>
          )}

          {/* Sync Logs Table */}
          {syncLogs.length === 0 ? (
            <div className="card text-center py-16">
              <RefreshCw className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Belum ada log sync</p>
              <p className="text-sm text-gray-400 mt-1">
                Log akan muncul saat sync agent mulai berjalan
              </p>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="table-header">
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Toko</th>
                      <th className="px-3 py-3">Tipe</th>
                      <th className="px-3 py-3">Mulai</th>
                      <th className="px-3 py-3">Selesai</th>
                      <th className="px-3 py-3 text-right">Records</th>
                      <th className="px-3 py-3">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncLogs.map((log) => {
                      const cfg = STATUS_CONFIG[log.status] || STATUS_CONFIG.running;
                      const StatusIcon = cfg.icon;
                      const store = Array.isArray(log.store) ? log.store[0] : log.store;
                      return (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="table-cell">
                            <div className="flex items-center gap-1.5">
                              <StatusIcon
                                className={`w-4 h-4 ${cfg.color} ${
                                  log.status === 'running' ? 'animate-spin' : ''
                                }`}
                              />
                              <span className="text-sm">{cfg.label}</span>
                            </div>
                          </td>
                          <td className="table-cell text-sm font-medium">
                            {store?.name || '-'}
                          </td>
                          <td className="table-cell">
                            <span className="badge-info">{log.sync_type || '-'}</span>
                          </td>
                          <td className="table-cell text-sm text-gray-500">
                            {log.started_at
                              ? new Date(log.started_at).toLocaleString('id-ID')
                              : '-'}
                          </td>
                          <td className="table-cell text-sm text-gray-500">
                            {log.completed_at
                              ? new Date(log.completed_at).toLocaleString('id-ID')
                              : '-'}
                          </td>
                          <td className="table-cell text-right font-medium">
                            {log.records_synced?.toLocaleString('id-ID') || '0'}
                          </td>
                          <td className="table-cell text-sm text-red-500 max-w-[200px] truncate">
                            {log.errors ? JSON.stringify(log.errors).slice(0, 80) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

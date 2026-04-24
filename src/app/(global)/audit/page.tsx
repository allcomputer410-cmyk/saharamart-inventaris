'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Shield,
  Search,
  Calendar,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface AuditLogRow {
  id: string;
  user_id: string | null;
  store_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
  store?: { code: string; name: string } | { code: string; name: string }[];
}

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  create_order: { label: 'Buat Pesanan', cls: 'badge-info' },
  mark_ordered: { label: 'Tandai Dipesan', cls: 'badge-warning' },
  order_sent: { label: 'Kirim Pesanan', cls: 'badge-info' },
  receive_item: { label: 'Terima Barang', cls: 'badge-success' },
  complete_order: { label: 'Selesai Pesanan', cls: 'badge-success' },
  sync_completed: { label: 'Sync Selesai', cls: 'badge-success' },
  sync_failed: { label: 'Sync Gagal', cls: 'badge-danger' },
  update_product: { label: 'Update Produk', cls: 'badge-info' },
  create_supplier: { label: 'Tambah Supplier', cls: 'badge-info' },
  delete_supplier: { label: 'Hapus Supplier', cls: 'badge-danger' },
  login: { label: 'Login', cls: 'badge-warning' },
};

export default function AuditPage() {
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);
      let query = supabase
        .from('audit_log')
        .select(`
          *,
          store:stores(code, name)
        `)
        .order('created_at', { ascending: false });

      if (filterAction) {
        query = query.eq('action', filterAction);
      }
      if (dateFrom) {
        query = query.gte('created_at', `${dateFrom}T00:00:00`);
      }
      if (dateTo) {
        query = query.lte('created_at', `${dateTo}T23:59:59`);
      }

      const { data, error } = await query.limit(200);

      if (error) {
        console.error('Error fetching audit logs:', error);
      } else {
        setLogs((data || []) as AuditLogRow[]);
      }
      setLoading(false);
    }

    fetchLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAction, dateFrom, dateTo]);

  const filteredLogs = logs.filter(
    (log) =>
      !searchQuery ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entity_type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      JSON.stringify(log.detail || {}).toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Unique actions for filter dropdown
  const uniqueActions = Array.from(new Set(logs.map(l => l.action))).sort();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-1">
          Riwayat semua aksi yang dilakukan dalam sistem
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Cari aksi, entity, detail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="input-field w-auto"
        >
          <option value="">Semua Aksi</option>
          {uniqueActions.map(action => (
            <option key={action} value={action}>
              {ACTION_LABELS[action]?.label || action}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="input-field w-auto text-sm"
          />
          <span className="text-gray-400 text-sm">-</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="input-field w-auto text-sm"
          />
        </div>
      </div>

      {/* Summary */}
      {filteredLogs.length > 0 && (
        <div className="text-xs text-gray-400">
          Menampilkan {filteredLogs.length} log
        </div>
      )}

      {/* Logs */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="card text-center py-16">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Belum ada log</p>
          <p className="text-sm text-gray-400 mt-1">
            Setiap aksi dalam sistem akan tercatat di sini
          </p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="px-3 py-3">Waktu</th>
                  <th className="px-3 py-3">Toko</th>
                  <th className="px-3 py-3">Aksi</th>
                  <th className="px-3 py-3">Entity</th>
                  <th className="px-3 py-3">Detail</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const actionInfo = ACTION_LABELS[log.action] || { label: log.action, cls: 'badge-info' };
                  const store = Array.isArray(log.store) ? log.store[0] : log.store;
                  const isExpanded = expandedLog === log.id;
                  const detailStr = log.detail ? JSON.stringify(log.detail, null, 2) : null;

                  return (
                    <tr
                      key={log.id}
                      className={`hover:bg-gray-50 ${isExpanded ? 'bg-blue-50/30' : ''}`}
                      onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                      style={{ cursor: detailStr ? 'pointer' : 'default' }}
                    >
                      <td className="table-cell text-xs text-gray-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('id-ID')}
                      </td>
                      <td className="table-cell text-sm font-medium">
                        {store?.name || '-'}
                      </td>
                      <td className="table-cell">
                        <span className={actionInfo.cls}>{actionInfo.label}</span>
                      </td>
                      <td className="table-cell text-sm">
                        {log.entity_type || '-'}
                        {log.entity_id && (
                          <span className="text-xs text-gray-400 ml-1 font-mono">
                            {log.entity_id.slice(0, 8)}...
                          </span>
                        )}
                      </td>
                      <td className="table-cell text-xs text-gray-500">
                        {detailStr ? (
                          <div className="flex items-center gap-1">
                            <span className="max-w-[200px] truncate block">
                              {isExpanded ? '' : JSON.stringify(log.detail).slice(0, 60)}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-3 h-3 text-gray-400 shrink-0" />
                            ) : (
                              <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
                            )}
                          </div>
                        ) : '-'}
                        {isExpanded && detailStr && (
                          <pre className="mt-2 text-[10px] bg-gray-100 p-2 rounded max-w-xs overflow-auto whitespace-pre-wrap">
                            {detailStr}
                          </pre>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

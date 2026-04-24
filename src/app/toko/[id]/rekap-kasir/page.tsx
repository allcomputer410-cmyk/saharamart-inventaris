'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Receipt,
  Loader2,
  Lock,
  AlertTriangle,
  Pencil,
  X,
  ChevronLeft,
  ChevronRight,
  Banknote,
  CreditCard,
  Smartphone,
  CircleDollarSign,
} from 'lucide-react';
import { formatRupiah, formatDate, formatDateShort, formatTime } from '@/lib/utils';
import type { RekapKasirRow, MetodeBayar } from '@/types/database';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const ALLOWED_ROLES = ['owner', 'manajer', 'direktur', 'gm'];
const PAGE_SIZE = 20;

// ─── helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function offsetDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function mondayStr() {
  const d = new Date();
  const dow = d.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}


// ─── Badge Metode ─────────────────────────────────────────────────────────────

function MetodeBadge({
  metode,
  isManual,
}: {
  metode: MetodeBayar;
  isManual: boolean;
}) {
  const config: Record<MetodeBayar, { cls: string; icon: React.ReactNode }> = {
    TUNAI: {
      cls: 'badge badge-success',
      icon: <Banknote className="w-3 h-3" />,
    },
    QRIS: {
      cls: 'badge badge-info',
      icon: <Smartphone className="w-3 h-3" />,
    },
    TRANSFER: {
      cls: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-700',
      icon: <CircleDollarSign className="w-3 h-3" />,
    },
    DEBIT: {
      cls: 'badge badge-warning',
      icon: <CreditCard className="w-3 h-3" />,
    },
  };

  const { cls, icon } = config[metode] ?? config.TUNAI;

  return (
    <span className={`${cls} flex items-center gap-1 w-fit`}>
      {icon}
      {metode}
      {isManual && (
        <Pencil className="w-2.5 h-2.5 ml-0.5 opacity-70" aria-label="Dikoreksi manual" />
      )}
    </span>
  );
}

// ─── Modal Koreksi ───────────────────────────────────────────────────────────

interface ModalProps {
  tx: RekapKasirRow;
  onClose: () => void;
  onSaved: () => void;
}

function ModalKoreksi({ tx, onClose, onSaved }: ModalProps) {
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [selected, setSelected] = useState<MetodeBayar | null>(
    tx.is_manual_override ? tx.metode_bayar : null,
  );
  const [alasan, setAlasan] = useState(tx.alasan_override ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const METODE_OPTIONS: { value: MetodeBayar; label: string; icon: React.ReactNode }[] = [
    { value: 'TUNAI',    label: 'Tunai',    icon: <Banknote className="w-4 h-4" /> },
    { value: 'QRIS',     label: 'QRIS',     icon: <Smartphone className="w-4 h-4" /> },
    { value: 'TRANSFER', label: 'Transfer', icon: <CircleDollarSign className="w-4 h-4" /> },
    { value: 'DEBIT',    label: 'Debit',    icon: <CreditCard className="w-4 h-4" /> },
  ];

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase.from('payment_method_overrides').upsert(
      {
        notransaksi: tx.notransaksi,
        metode_override: selected,
        alasan: alasan.trim() || null,
        corrected_at: new Date().toISOString(),
      },
      { onConflict: 'notransaksi' },
    );
    setSaving(false);
    if (!error) {
      onSaved();
    } else {
      console.error('Gagal simpan koreksi:', error);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const { error } = await supabase
      .from('payment_method_overrides')
      .delete()
      .eq('notransaksi', tx.notransaksi);
    setDeleting(false);
    if (!error) {
      onSaved();
    } else {
      console.error('Gagal hapus koreksi:', error);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Koreksi Metode Bayar</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info transaksi */}
        <div className="px-5 py-4 bg-gray-50 border-b text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">No. Faktur</span>
            <span className="font-mono font-medium text-gray-800">{tx.notransaksi}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Tanggal</span>
            <span className="text-gray-800">
              {formatDate(tx.tanggal)} — {formatTime(tx.tanggal)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total</span>
            <span className="font-bold text-gray-800">{formatRupiah(tx.totalakhir)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Keterangan iPOS</span>
            <span className="text-gray-600 italic max-w-[60%] text-right truncate">
              {tx.keterangan || <em className="text-gray-400">—</em>}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Deteksi otomatis</span>
            <MetodeBadge metode={tx.metode_bayar} isManual={false} />
          </div>
        </div>

        {/* Pilih metode */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-sm font-medium text-gray-700 mb-3">Pilih metode bayar:</p>
          <div className="grid grid-cols-2 gap-2">
            {METODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelected(opt.value)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                  selected === opt.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Alasan */}
        <div className="px-5 pb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Alasan <span className="text-gray-400 font-normal">(opsional)</span>
          </label>
          <textarea
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            rows={2}
            placeholder="Misalnya: pelanggan bayar via QRIS tapi tidak tercatat di iPOS"
            className="input-field w-full text-sm resize-none"
          />
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex items-center gap-2">
          {tx.is_manual_override && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Batalkan Koreksi'}
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border text-sm text-gray-600 hover:bg-gray-50"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !selected}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Simpan Koreksi
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RekapKasirPage() {
  const params = useParams();
  const storeId = params.id as string;
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<RekapKasirRow[]>([]);

  // Filters
  const [dateFrom, setDateFrom] = useState(firstOfMonthStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [filterMetode, setFilterMetode] = useState<MetodeBayar | ''>('');
  const [filterKasir, setFilterKasir] = useState('');
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);

  // Modal
  const [modalTx, setModalTx] = useState<RekapKasirRow | null>(null);

  // Toast
  const [toast, setToast] = useState('');

  // ── role check ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function checkAccess() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { setAccessDenied(true); setLoading(false); return; }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
        setAccessDenied(true);
        setLoading(false);
      }
    }
    checkAccess();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── fetch data ──────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (accessDenied) return;
    setLoading(true);

    // Paginated fetch — v_rekap_kasir bisa ribuan baris untuk date range panjang
    const PAGE = 1000;
    const all: RekapKasirRow[] = [];
    let offset = 0;
    let hasMore = true;
    let fetchError = false;
    while (hasMore) {
      const { data, error } = await supabase
        .from('v_rekap_kasir')
        .select('*')
        .eq('store_id', storeId)
        .gte('tanggal', dateFrom + 'T00:00:00')
        .lte('tanggal', dateTo + 'T23:59:59')
        .order('tanggal', { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (error) { console.error('Error fetching rekap kasir:', error); fetchError = true; break; }
      all.push(...((data as RekapKasirRow[]) || []));
      hasMore = (data?.length ?? 0) === PAGE;
      offset += PAGE;
    }
    if (!fetchError) setTransactions(all);

    setPage(1);
    setLoading(false);
  }, [accessDenied, storeId, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── toast helper ─────────────────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  // ── client-side filter ───────────────────────────────────────────────────────
  const filtered = transactions.filter((tx) => {
    if (filterMetode && tx.metode_bayar !== filterMetode) return false;
    if (filterKasir && !tx.kasir?.toLowerCase().includes(filterKasir.toLowerCase())) return false;
    if (onlyNeedsReview && !tx.needs_review) return false;
    return true;
  });

  // ── summary cards ────────────────────────────────────────────────────────────
  const totalPenjualan = filtered.reduce((s, tx) => s + tx.totalakhir, 0);
  const totalTunai     = filtered.filter((tx) => tx.metode_bayar === 'TUNAI').reduce((s, tx) => s + tx.totalakhir, 0);
  const totalQris      = filtered.filter((tx) => tx.metode_bayar === 'QRIS').reduce((s, tx) => s + tx.totalakhir, 0);
  const jumlahTrx      = filtered.length;
  const perluReview    = filtered.filter((tx) => tx.needs_review).length;

  // ── kasir list for dropdown ──────────────────────────────────────────────────
  const kasirList = Array.from(new Set(transactions.map((tx) => tx.kasir).filter(Boolean))) as string[];

  // ── pagination ───────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── chart data ───────────────────────────────────────────────────────────────
  const barData = (() => {
    const grouped: Record<string, { tanggal: string; TUNAI: number; QRIS: number }> = {};
    filtered.forEach((tx) => {
      const key = tx.tanggal.slice(0, 10);
      if (!grouped[key]) grouped[key] = { tanggal: key, TUNAI: 0, QRIS: 0 };
      if (tx.metode_bayar === 'TUNAI') grouped[key].TUNAI += tx.totalakhir;
      if (tx.metode_bayar === 'QRIS')  grouped[key].QRIS  += tx.totalakhir;
    });
    return Object.values(grouped)
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal))
      .slice(-14); // max 14 hari
  })();

  const pieData = [
    { name: 'Tunai',    value: totalTunai, color: '#22c55e' },
    { name: 'QRIS',     value: totalQris,  color: '#3b82f6' },
    {
      name: 'Lainnya',
      value: filtered
        .filter((tx) => tx.metode_bayar !== 'TUNAI' && tx.metode_bayar !== 'QRIS')
        .reduce((s, tx) => s + tx.totalakhir, 0),
      color: '#f59e0b',
    },
  ].filter((d) => d.value > 0);

  // ─────────────────────────────────────────────────────────────────────────────

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <Lock className="w-8 h-8 text-red-500" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-800">Akses Dibatasi</h2>
          <p className="text-sm text-gray-500 mt-1">
            Halaman ini hanya bisa diakses oleh <strong>Owner</strong> atau <strong>Manajer</strong>.
          </p>
          <p className="text-xs text-gray-400 mt-1">Hubungi admin toko untuk mengubah hak akses.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page title */}
      <div>
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <Receipt className="w-5 h-5 text-blue-500" />
          Rekap Kasir
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Deteksi otomatis TUNAI vs QRIS berdasarkan keterangan iPOS
        </p>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────────────── */}
      <div className="card space-y-3">
        {/* Shortcut buttons */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Hari Ini',  from: todayStr(),        to: todayStr()        },
            { label: 'Kemarin',   from: offsetDate(-1),    to: offsetDate(-1)    },
            { label: 'Minggu Ini',from: mondayStr(),       to: todayStr()        },
            { label: 'Bulan Ini', from: firstOfMonthStr(), to: todayStr()        },
          ].map(({ label, from, to }) => (
            <button
              key={label}
              onClick={() => { setDateFrom(from); setDateTo(to); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                dateFrom === from && dateTo === to
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Date range + dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="input-field w-auto text-sm"
          />
          <span className="text-gray-400 text-sm">s/d</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="input-field w-auto text-sm"
          />

          <select
            value={filterMetode}
            onChange={(e) => { setFilterMetode(e.target.value as MetodeBayar | ''); setPage(1); }}
            className="input-field w-auto text-sm"
          >
            <option value="">Semua Metode</option>
            <option value="TUNAI">Tunai</option>
            <option value="QRIS">QRIS</option>
            <option value="TRANSFER">Transfer</option>
            <option value="DEBIT">Debit</option>
          </select>

          <select
            value={filterKasir}
            onChange={(e) => { setFilterKasir(e.target.value); setPage(1); }}
            className="input-field w-auto text-sm"
          >
            <option value="">Semua Kasir</option>
            {kasirList.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyNeedsReview}
              onChange={(e) => { setOnlyNeedsReview(e.target.checked); setPage(1); }}
              className="rounded"
            />
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            Perlu Review
          </label>
        </div>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Total Penjualan</p>
          <p className="text-base font-bold text-gray-800">{formatRupiah(totalPenjualan)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <Banknote className="w-3 h-3 text-green-500" /> Total Tunai
          </p>
          <p className="text-base font-bold text-green-600">{formatRupiah(totalTunai)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <Smartphone className="w-3 h-3 text-blue-500" /> Total QRIS
          </p>
          <p className="text-base font-bold text-blue-600">{formatRupiah(totalQris)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Jml Transaksi</p>
          <p className="text-base font-bold text-gray-800">{jumlahTrx.toLocaleString('id-ID')}</p>
        </div>
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-xs text-amber-700 mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Perlu Review
          </p>
          <p className="text-base font-bold text-amber-700">{perluReview}</p>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16">
          <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Belum ada data transaksi</p>
          <p className="text-sm text-gray-400 mt-1">
            Data akan tersedia setelah sync dari iPOS
          </p>
        </div>
      ) : (
        <>
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="px-3 py-2.5 text-left">No. Faktur</th>
                    <th className="px-3 py-2.5 text-left">Tanggal</th>
                    <th className="px-3 py-2.5 text-left">Jam</th>
                    <th className="px-3 py-2.5 text-left">Kasir</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                    <th className="px-3 py-2.5 text-left">Metode</th>
                    <th className="px-3 py-2.5 text-left">Keterangan</th>
                    <th className="px-3 py-2.5 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((tx) => (
                    <tr
                      key={tx.id}
                      className={`hover:bg-gray-50 ${tx.needs_review ? 'bg-yellow-50' : ''}`}
                    >
                      <td className="table-cell font-mono text-xs text-gray-600">
                        {tx.needs_review && (
                          <AlertTriangle
                            className="w-3 h-3 text-amber-500 inline mr-1"
                            aria-label="Perlu review metode bayar"
                          />
                        )}
                        {tx.notransaksi}
                      </td>
                      <td className="table-cell text-sm">{formatDateShort(tx.tanggal)}</td>
                      <td className="table-cell text-sm text-gray-500">{formatTime(tx.tanggal)}</td>
                      <td className="table-cell text-sm">{tx.kasir || '—'}</td>
                      <td className="table-cell text-right font-medium">
                        {formatRupiah(tx.totalakhir)}
                      </td>
                      <td className="table-cell">
                        <MetodeBadge metode={tx.metode_bayar} isManual={tx.is_manual_override} />
                      </td>
                      <td className="table-cell text-xs text-gray-400 max-w-[160px] truncate">
                        {tx.keterangan || <em>—</em>}
                      </td>
                      <td className="table-cell text-center">
                        <button
                          onClick={() => setModalTx(tx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-100 hover:bg-blue-100 hover:text-blue-700 text-xs text-gray-600 transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                          Koreksi
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              {filtered.length} transaksi &bull; halaman {page} dari {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50 flex items-center gap-1"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Charts ──────────────────────────────────────────────────────────────── */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Bar chart: TUNAI vs QRIS per hari */}
          <div className="card lg:col-span-2">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Tren Harian — Tunai vs QRIS
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="tanggal"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v.slice(5)} // MM-DD
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) =>
                    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}jt` : `${(v / 1_000).toFixed(0)}rb`
                  }
                />
                <Tooltip
                  formatter={(val: number | undefined) => formatRupiah(val ?? 0)}
                  labelFormatter={(l) => `Tgl ${l}`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="TUNAI" name="Tunai" fill="#22c55e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="QRIS"  name="QRIS"  fill="#3b82f6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie chart: proporsi metode bayar */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Proporsi Metode Bayar</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: number | undefined) => formatRupiah(val ?? 0)} />
              </PieChart>
            </ResponsiveContainer>
            {/* Legend manual */}
            <div className="flex flex-col gap-1 mt-1">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-sm inline-block"
                      style={{ background: d.color }}
                    />
                    {d.name}
                  </span>
                  <span className="font-medium text-gray-700">{formatRupiah(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Koreksi ────────────────────────────────────────────────────────── */}
      {modalTx && (
        <ModalKoreksi
          tx={modalTx}
          onClose={() => setModalTx(null)}
          onSaved={() => {
            setModalTx(null);
            showToast('Berhasil dikoreksi');
            fetchData();
          }}
        />
      )}

      {/* ── Toast ────────────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-800 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}
    </div>
  );
}

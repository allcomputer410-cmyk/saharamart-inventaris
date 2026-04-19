'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  FileText,
  Download,
  MessageCircle,
  Mail,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatRupiah } from '@/lib/utils';
import type { RekapPDFProps } from '@/components/ui/RekapPDF';

interface OrderWithSupplier {
  supplier?: { id: string; name: string; phone?: string; email?: string };
  items?: OrderItemWithProduct[];
}

interface OrderItemWithProduct {
  qty_ordered: number;
  hpp_at_order?: number;
  store_product?: {
    name?: string;
    barcode?: string;
    unit?: string;
    hpp?: number;
  };
}

interface RekapSupplier {
  supplierId: string;
  supplierName: string;
  supplierPhone?: string;
  supplierEmail?: string;
  items: {
    productName: string;
    barcode: string;
    unit: string;
    qty: number;
    hpp: number;
    subtotal: number;
  }[];
  totalItems: number;
  totalValue: number;
}

export default function RekapPage() {
  const params = useParams();
  const storeId = params.id as string;
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [rekap, setRekap] = useState<RekapSupplier[]>([]);
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('Toko');
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRekap() {
      // Ambil nama toko
      const { data: storeData } = await supabase
        .from('stores')
        .select('name')
        .eq('id', storeId)
        .single();
      if (storeData?.name) setStoreName(storeData.name);

      // Ambil pesanan aktif (draft/ordered) grouped by supplier
      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          *,
          supplier:suppliers(id, name, phone, email),
          items:order_items(
            *,
            store_product:store_products(id, barcode, name, unit, hpp)
          )
        `)
        .eq('store_id', storeId)
        .in('status', ['draft', 'ordered'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching rekap:', error);
        setLoading(false);
        return;
      }

      // Group by supplier
      const supplierMap = new Map<string, RekapSupplier>();

      (orders || []).forEach((rawOrder: Record<string, unknown>) => {
        const sup = Array.isArray(rawOrder.supplier) ? rawOrder.supplier[0] : rawOrder.supplier;
        const order = { ...rawOrder, supplier: sup, items: rawOrder.items } as OrderWithSupplier;
        const supplierId = order.supplier?.id || 'unknown';
        if (!supplierMap.has(supplierId)) {
          supplierMap.set(supplierId, {
            supplierId,
            supplierName: order.supplier?.name || 'Tidak diketahui',
            supplierPhone: order.supplier?.phone,
            supplierEmail: order.supplier?.email,
            items: [],
            totalItems: 0,
            totalValue: 0,
          });
        }

        const rekapEntry = supplierMap.get(supplierId)!;
        (order.items || []).forEach((item: OrderItemWithProduct) => {
          const subtotal = item.qty_ordered * (item.hpp_at_order || item.store_product?.hpp || 0);
          rekapEntry.items.push({
            productName: item.store_product?.name || '-',
            barcode: item.store_product?.barcode || '-',
            unit: item.store_product?.unit || '-',
            qty: item.qty_ordered,
            hpp: item.hpp_at_order || item.store_product?.hpp || 0,
            subtotal,
          });
          rekapEntry.totalItems += item.qty_ordered;
          rekapEntry.totalValue += subtotal;
        });
      });

      setRekap(Array.from(supplierMap.values()));
      setLoading(false);
    }

    fetchRekap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const handleSendWhatsApp = (supplier: RekapSupplier) => {
    let message = `*PESANAN STOK*\n\n`;
    message += `Kepada: ${supplier.supplierName}\n\n`;
    supplier.items.forEach((item, i) => {
      message += `${i + 1}. ${item.productName} - ${item.qty} ${item.unit}\n`;
    });
    message += `\nTotal: ${supplier.totalItems} item\n`;
    message += `Nilai: ${formatRupiah(supplier.totalValue)}\n`;
    message += `\nMohon konfirmasi ketersediaan. Terima kasih.`;

    const phone = supplier.supplierPhone?.replace(/[^0-9]/g, '') || '';
    const waPhone = phone.startsWith('0') ? '62' + phone.slice(1) : phone;
    window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleSendEmail = (supplier: RekapSupplier) => {
    const subject = `Pesanan Stok - ${supplier.supplierName}`;
    let body = `Kepada ${supplier.supplierName},\n\n`;
    body += `Berikut daftar pesanan stok kami:\n\n`;
    supplier.items.forEach((item, i) => {
      body += `${i + 1}. ${item.productName} (${item.barcode}) - ${item.qty} ${item.unit} @ ${formatRupiah(item.hpp)}\n`;
    });
    body += `\nTotal: ${supplier.totalItems} item\n`;
    body += `Nilai: ${formatRupiah(supplier.totalValue)}\n`;
    body += `\nMohon konfirmasi ketersediaan.\nTerima kasih.`;

    window.open(`mailto:${supplier.supplierEmail || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_self');
  };

  const handleDownloadPdf = async (supplier: RekapSupplier) => {
    setPdfLoading(supplier.supplierId);
    try {
      // Dynamic import untuk menghindari SSR issues
      const [{ pdf }, { RekapPDFDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/ui/RekapPDF'),
      ]);

      const props: RekapPDFProps = {
        storeName,
        supplierName: supplier.supplierName,
        supplierPhone: supplier.supplierPhone,
        items: supplier.items.map((item) => ({
          productName: item.productName,
          barcode: item.barcode,
          unit: item.unit,
          qty: item.qty,
          subtotal: item.subtotal,
        })),
        totalItems: Math.round(supplier.totalItems),
        totalValue: supplier.totalValue,
      };

      const blob = await pdf(<RekapPDFDocument {...props} />).toBlob();
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const safeName = supplier.supplierName.replace(/[^a-zA-Z0-9]/g, '_');
      const a = document.createElement('a');
      a.href = url;
      a.download = `SuratPesanan-${safeName}-${dateStr}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Gagal generate PDF:', err);
      alert('Gagal membuat PDF. Coba lagi.');
    } finally {
      setPdfLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Rekap per Supplier</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ringkasan pesanan aktif, grouped per supplier
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      ) : rekap.length === 0 ? (
        <div className="card text-center py-16">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Belum ada rekap</p>
          <p className="text-sm text-gray-400 mt-1">
            Buat pesanan dari halaman Pesanan terlebih dahulu
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rekap.map((supplier) => {
            const isExpanded = expandedSupplier === supplier.supplierId;
            return (
              <div key={supplier.supplierId} className="card p-0 overflow-hidden">
                {/* Supplier Header */}
                <button
                  onClick={() =>
                    setExpandedSupplier(isExpanded ? null : supplier.supplierId)
                  }
                  className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-800">{supplier.supplierName}</h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <span>{supplier.items.length} produk</span>
                        <span>{formatRupiah(supplier.totalValue)}</span>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Items Detail */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="table-header">
                            <th className="px-3 py-2">#</th>
                            <th className="px-3 py-2">Produk</th>
                            <th className="px-3 py-2">Barcode</th>
                            <th className="px-3 py-2">Satuan</th>
                            <th className="px-3 py-2 text-right">Qty</th>
                            <th className="px-3 py-2 text-right">HPP</th>
                            <th className="px-3 py-2 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {supplier.items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="table-cell text-gray-400 text-sm">{idx + 1}</td>
                              <td className="table-cell font-medium text-sm">{item.productName}</td>
                              <td className="table-cell font-mono text-xs">{item.barcode}</td>
                              <td className="table-cell text-sm">{item.unit}</td>
                              <td className="table-cell text-right font-medium">{item.qty}</td>
                              <td className="table-cell text-right text-sm">
                                {formatRupiah(item.hpp)}
                              </td>
                              <td className="table-cell text-right font-medium">
                                {formatRupiah(item.subtotal)}
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50 font-semibold">
                            <td colSpan={4} className="px-3 py-2 text-sm text-right">
                              Total:
                            </td>
                            <td className="px-3 py-2 text-right text-sm">
                              {supplier.totalItems}
                            </td>
                            <td className="px-3 py-2"></td>
                            <td className="px-3 py-2 text-right text-sm">
                              {formatRupiah(supplier.totalValue)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Actions */}
                    <div className="px-4 py-3 bg-gray-50 flex flex-wrap gap-2 justify-end">
                      <button
                        onClick={() => handleSendWhatsApp(supplier)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Kirim WA
                      </button>
                      <button
                        onClick={() => handleSendEmail(supplier)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                      >
                        <Mail className="w-4 h-4" />
                        Email
                      </button>
                      <button
                        onClick={() => handleDownloadPdf(supplier)}
                        disabled={pdfLoading === supplier.supplierId}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {pdfLoading === supplier.supplierId ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        {pdfLoading === supplier.supplierId ? 'Membuat PDF...' : 'Download PDF'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

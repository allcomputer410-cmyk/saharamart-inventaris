import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Admin client using service role key
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface ProductRow {
  id: string;
  name: string;
  barcode: string;
  hpp: number;
  sell_price: number;
  category_id: string | null;
  current_qty: number;
  min_qty: number;
}

interface SaleAgg {
  store_product_id: string;
  total_qty: number;
  total_revenue: number;
  days_sold: number;
  last_sale_date: string | null;
}

interface Recommendation {
  store_id: string;
  store_product_id: string;
  status: string;
  priority: string;
  promo_type: string;
  reason: string;
  product_name: string;
  product_barcode: string;
  hpp: number;
  sell_price: number;
  current_stock: number;
  days_no_sale: number;
  params: Record<string, unknown>;
  est_revenue: number;
  est_profit: number;
  loss_if_no_promo: number;
  analyzed_at: string;
}

interface AnalyzeResult {
  count: number;
  no_sale_data: boolean;
  products_with_stock: number;
  debug?: {
    raw_products: number;
    stock_records: number;
    daily_sales: number;
    sale_items_aggregated: number;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function analyzeStore(supabase: any, storeId: string): Promise<AnalyzeResult> {
  const today = new Date();
  const _todayStr = today.toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  // 1. Get active products with stock (paginated — PostgREST default limit = 1000, produk bisa 7000+)
  let rawProducts: { id: string; name: string; barcode: string; hpp: number; sell_price: number; category_id: string | null }[] = [];
  {
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data: page, error } = await supabase
        .from('store_products')
        .select('id, name, barcode, hpp, sell_price, category_id')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .eq('is_deleted', false)
        .eq('exclude_from_report', false)
        .range(offset, offset + PAGE - 1);
      if (error || !page || page.length === 0) break;
      rawProducts = rawProducts.concat(page);
      if (page.length < PAGE) break;
      offset += PAGE;
    }
  }

  if (rawProducts.length === 0) return { count: 0, no_sale_data: true, products_with_stock: 0, debug: { raw_products: 0, stock_records: 0, daily_sales: 0, sale_items_aggregated: 0 } };

  // Get stock data (paginated) — filter by store_id only, no .in() karena 7000+ UUID bikin URL terlalu panjang
  let stockData: { store_product_id: string; current_qty: number; min_qty: number }[] = [];
  {
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data: page, error } = await supabase
        .from('stock')
        .select('store_product_id, current_qty, min_qty')
        .eq('store_id', storeId)
        .range(offset, offset + PAGE - 1);
      if (error || !page || page.length === 0) break;
      stockData = stockData.concat(page);
      if (page.length < PAGE) break;
      offset += PAGE;
    }
  }

  const stockMap: Record<string, { current_qty: number; min_qty: number }> = {};
  stockData.forEach((s) => {
    stockMap[s.store_product_id] = { current_qty: s.current_qty, min_qty: s.min_qty };
  });

  // Filter products dengan stok >= 5 pcs (minimal layak rekomendasi)
  const products: ProductRow[] = rawProducts
    .map((p: { id: string; name: string; barcode: string; hpp: number; sell_price: number; category_id: string | null }) => ({
      ...p,
      current_qty: stockMap[p.id]?.current_qty ?? 0,
      min_qty: stockMap[p.id]?.min_qty ?? 0,
    }))
    .filter((p: ProductRow) => p.current_qty >= 5);

  if (products.length === 0) return { count: 0, no_sale_data: true, products_with_stock: 0, debug: { raw_products: rawProducts.length, stock_records: stockData.length, daily_sales: 0, sale_items_aggregated: 0 } };

  // 2. Get daily_sales untuk toko ini (last 30 hari)
  const { data: dailySalesData } = await supabase
    .from('daily_sales')
    .select('id, sale_date, total_revenue, total_transactions')
    .eq('store_id', storeId)
    .gte('sale_date', thirtyDaysAgoStr);

  let _avgTransaction = 50000; // fallback (dipakai untuk estimasi store-level)
  const dailySaleIds: string[] = [];
  const saleDateById: Record<string, string> = {};
  if (dailySalesData && dailySalesData.length > 0) {
    const totalRev = dailySalesData.reduce((s: number, d: { total_revenue: number }) => s + (d.total_revenue || 0), 0);
    const totalTxn = dailySalesData.reduce((s: number, d: { total_transactions: number }) => s + (d.total_transactions || 0), 0);
    if (totalTxn > 0) _avgTransaction = totalRev / totalTxn;
    dailySalesData.forEach((ds: { id: string; sale_date: string }) => {
      dailySaleIds.push(ds.id);
      saleDateById[ds.id] = ds.sale_date;
    });
  }

  // 3. Get sale items — query langsung by daily_sale_id (lebih reliable dari join filter)
  const saleAggMap: Record<string, SaleAgg> = {};
  // Track unique sale dates per produk untuk hitung avgDaily yang akurat
  const productSaleDates: Record<string, Set<string>> = {};
  if (dailySaleIds.length > 0) {
    // Batch query jika banyak daily_sale_ids (max 50 per batch untuk URL length)
    // Setiap batch juga paginated karena satu daily_sale bisa punya banyak items
    const BATCH = 50;
    for (let bi = 0; bi < dailySaleIds.length; bi += BATCH) {
      const batchIds = dailySaleIds.slice(bi, bi + BATCH);
      const PAGE = 1000;
      let offset = 0;
      while (true) {
        const { data: saleItems, error } = await supabase
          .from('daily_sale_items')
          .select('store_product_id, qty_sold, revenue, daily_sale_id')
          .in('daily_sale_id', batchIds)
          .range(offset, offset + PAGE - 1);
        if (error || !saleItems || saleItems.length === 0) break;
        saleItems.forEach((item: { store_product_id: string; qty_sold: number; revenue: number; daily_sale_id: string }) => {
          const spId = item.store_product_id;
          const saleDate = saleDateById[item.daily_sale_id] || '';
          if (!saleAggMap[spId]) {
            saleAggMap[spId] = { store_product_id: spId, total_qty: 0, total_revenue: 0, days_sold: 0, last_sale_date: null };
          }
          saleAggMap[spId].total_qty += item.qty_sold || 0;
          saleAggMap[spId].total_revenue += item.revenue || 0;
          if (saleDate) {
            if (!productSaleDates[spId]) productSaleDates[spId] = new Set();
            productSaleDates[spId].add(saleDate);
            saleAggMap[spId].days_sold = productSaleDates[spId].size;
          }
          if (!saleAggMap[spId].last_sale_date || saleDate > saleAggMap[spId].last_sale_date!) {
            saleAggMap[spId].last_sale_date = saleDate;
          }
        });
        if (saleItems.length < PAGE) break;
        offset += PAGE;
      }
    }
  }

  // Deteksi apakah ada data penjualan sama sekali
  const noSaleData = dailySaleIds.length === 0 || Object.keys(saleAggMap).length === 0;

  // GUARD: Jika tidak ada data penjualan sama sekali, hentikan analisis.
  // Tanpa guard ini, semua produk akan dianggap dead stock (false positive massal)
  // karena engine tidak bisa membedakan "memang tidak laku" vs "sync belum jalan".
  if (noSaleData) {
    return { count: 0, no_sale_data: true, products_with_stock: products.length, debug: { raw_products: rawProducts.length, stock_records: stockData.length, daily_sales: dailySaleIds.length, sale_items_aggregated: 0 } };
  }

  // Store-level averages
  const totalStoreSales30 = Object.values(saleAggMap).reduce((s, a) => s + a.total_qty, 0);
  const storeAvgDailyQty = totalStoreSales30 / 30;
  // Denominator: hanya produk yang benar-benar terjual (ada di saleAggMap) agar
  // threshold slow stock tidak terlalu kecil akibat ribuan produk tak terjual ikut dihitung
  const sellingProductCount = products.filter(p => !!saleAggMap[p.id]).length;
  const avgDailyQtyPerProduct = sellingProductCount > 0 ? storeAvgDailyQty / sellingProductCount : 0;

  // ── Fetch produk yang sudah approved (skip duplikasi) dan baru ditolak (cooldown 7 hari)
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const todayStr = today.toISOString().split('T')[0];
  const approvedProductIds = new Set<string>();
  const rejectedCooldownIds = new Set<string>();
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: decisions } = await (supabase as any)
      .from('promo_recommendations')
      .select('store_product_id, status, rejected_at, promotion_id, promotions(end_date)')
      .eq('store_id', storeId)
      .in('status', ['approved', 'rejected']);
    (decisions || []).forEach((d: { store_product_id: string; status: string; rejected_at: string | null; promotion_id: string | null; promotions: { end_date: string | null } | null }) => {
      if (d.status === 'approved') {
        // Hanya blokir jika promonya belum expired (end_date null = tidak ada batas waktu)
        const endDate = d.promotions?.end_date ?? null;
        if (!endDate || endDate >= todayStr) {
          approvedProductIds.add(d.store_product_id);
        }
        // Jika promonya sudah expired → tidak diblokir, bisa direkomendasikan ulang
      } else if (d.status === 'rejected' && d.rejected_at && new Date(d.rejected_at) >= sevenDaysAgo) {
        rejectedCooldownIds.add(d.store_product_id);
      }
    });
  }

  // ── Helper: hitung params DISCOUNT dengan guard minimum 10% margin pada harga promo
  // Rumus: promoPrice >= hpp/0.9 agar (promoPrice-hpp)/promoPrice >= 10%
  const makeDiscount = (sp: number, h: number, mp: number, stock: number, pname: string) => {
    const maxD = Math.max(0, (1 - h / (0.9 * sp)) * 100); // max disc agar margin promo ≥ 10%
    if (maxD < 5) return null; // tidak bisa beri diskon ≥5% sambil jaga margin 10%
    const d = Math.round(Math.min(Math.max((mp - 10) / 2, 5), maxD) * 10) / 10;
    const pp = sp * (1 - d / 100);
    const pProfit = pp - h;
    const mpp = pProfit / pp * 100;
    return {
      promoType: 'discount' as const,
      params: {
        nama_promo: `Diskon ${Math.round(d)}% - ${pname}`,
        discount_pct: d,
        promo_price: Math.round(pp),
        profit_per_pcs: Math.round(pProfit),
        margin_promo_pct: Math.round(mpp * 10) / 10,
        margin_normal_pct: Math.round(mp * 10) / 10,
        ...(mpp < 10 ? { margin_warning: true } : {}),
      },
      estRevenue: Math.max(0, Math.round(stock * pp)),
      estProfit: Math.max(0, Math.round(stock * pProfit)),
      lossIfNoPromo: stock * h,
    };
  };

  // ── Helper: hitung params FLASH SALE dengan guard minimum 5% margin pada harga flash
  const makeFlash = (sp: number, h: number, mp: number, adq: number, pname: string) => {
    const rawD = (mp - 10) / 2; // sisa ruang di atas 10% margin, bagi dua
    const d = Math.round(Math.min(Math.max(rawD, 5), 30) * 10) / 10;
    const fp = sp * (1 - d / 100);
    const mfp = (fp - h) / fp * 100;
    if (mfp < 5) return null; // margin terlalu tipis bahkan di diskon terkecil
    const quota = Math.max(Math.ceil(adq * 2), 5);
    return {
      promoType: 'flash_sale' as const,
      params: {
        nama_promo: `Flash Sale - ${pname}`,
        flash_discount_pct: d,
        flash_price: Math.round(fp),
        kuota_per_hari: quota,
        jam_mulai: '10:00',
        jam_selesai: '12:00',
        durasi_hari: 7,
        margin_flash_pct: Math.round(mfp * 10) / 10,
        margin_normal_pct: Math.round(mp * 10) / 10,
        ...(mfp < 10 ? { margin_warning: true } : {}),
      },
      estRevenue: Math.max(0, Math.round(quota * 7 * fp)),
      estProfit: Math.max(0, Math.round(quota * 7 * (fp - h))),
      lossIfNoPromo: 0,
    };
  };

  const recommendations: Recommendation[] = [];
  const analyzedAt = new Date().toISOString();

  for (const product of products) {
    const { id: spId, name, barcode, hpp, sell_price, category_id, current_qty } = product;

    // ── Guard: dedup approved + cooldown 7 hari rejected
    if (approvedProductIds.has(spId)) continue;
    if (rejectedCooldownIds.has(spId)) continue;

    // ── Guard: data quality — skip data kotor dari iPOS
    if (hpp <= 0 || sell_price <= 0) continue;
    if (sell_price <= hpp) continue; // jual ≤ beli: data kotor, jangan proses

    const marginPct = ((sell_price - hpp) / sell_price) * 100;
    if (marginPct < 5) continue; // margin terlalu kecil untuk promo apapun

    const agg = saleAggMap[spId];
    const lastSaleDate = agg?.last_sale_date || null;
    // Default daysNoSale:
    // - Jika produk tidak ada di saleAggMap (tidak pernah terjual) → 31 (dead stock)
    // - Jika ada agg tapi belum ada lastSaleDate → 30 (fallback netral)
    let daysNoSale = !agg ? 31 : 30;
    if (lastSaleDate) {
      const last = new Date(lastSaleDate);
      daysNoSale = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    }
    // Pakai hari aktif terjual (days_sold), bukan 30 hardcoded
    // Mencegah produk baru diklasifikasikan slow stock hanya karena belum 30 hari
    const activeDays = agg && agg.days_sold > 0 ? agg.days_sold : 1;
    const avgDailyQty = agg ? agg.total_qty / activeDays : 0;

    // ── Condition flags
    // isDeadStock: tidak terjual >30 hari ATAU produk tidak ada di data penjualan sama sekali
    const isDeadStock = daysNoSale > 30 || !agg;
    // isSlowStock: rata-rata harian <1 pcs/hari — konsisten dengan tab Trend & Analisis
    const isSlowStock = !isDeadStock && avgDailyQty > 0 && avgDailyQty < 1;
    // isHighMargin: margin >35% → kandidat BXGY
    const isHighMargin = marginPct > 35;
    // isStagnant: belum terjual 14-30 hari (bukan dead), margin cukup → Flash Sale
    const isStagnant = !isDeadStock && !isSlowStock && daysNoSale >= 14 && marginPct > 15;

    // Skip produk yang tidak memenuhi kondisi apapun
    if (!isDeadStock && !isSlowStock && !(isHighMargin && daysNoSale >= 7) && !isStagnant) continue;

    // ── Priority
    let priority = 'optional';
    if (isDeadStock) {
      priority = 'urgent';
    } else if (daysNoSale >= 14 || avgDailyQty < avgDailyQtyPerProduct * 0.3) {
      priority = 'suggested';
    } else if (daysNoSale >= 7 && isHighMargin) {
      priority = 'optional';
    }

    let promoType = 'discount';
    let params: Record<string, unknown> = {};
    let estRevenue = 0;
    let estProfit = 0;
    let lossIfNoPromo = current_qty * hpp;
    let reason = '';

    if (isDeadStock) {
      // ── DEAD STOCK → DISCOUNT
      const r = makeDiscount(sell_price, hpp, marginPct, current_qty, name);
      if (!r) continue; // tidak bisa beri diskon aman → skip
      promoType = r.promoType; params = r.params;
      estRevenue = r.estRevenue; estProfit = r.estProfit; lossIfNoPromo = r.lossIfNoPromo;
      reason = `Tidak terjual ${daysNoSale} hari. Stok ${current_qty} pcs berisiko dead stock.`;

    } else if (isSlowStock) {
      // ── SLOW STOCK → BUNDLE / FLASH SALE / DISCOUNT
      if (marginPct > 20 && category_id && current_qty >= 10) {
        // Coba BUNDLE dulu
        const bundleDiscPct = 0.12;
        const bundlePrice = sell_price * 2 * (1 - bundleDiscPct);
        const totalHppBundle = hpp * 2;
        const profitBundle = bundlePrice - totalHppBundle;
        const marginBundlePct = profitBundle / bundlePrice * 100;

        if (marginBundlePct >= 5) {
          promoType = 'bundle';
          params = {
            nama_promo: `Bundle 2x ${name}`,
            bundle_price: Math.round(bundlePrice),
            bundle_qty: 2,
            bundle_discount_pct: bundleDiscPct * 100,
            profit_per_bundle: Math.round(profitBundle),
            margin_bundle_pct: Math.round(marginBundlePct * 10) / 10,
            margin_normal_pct: Math.round(marginPct * 10) / 10,
            ...(marginBundlePct < 10 ? { margin_warning: true } : {}),
          };
          estRevenue = Math.max(0, Math.round((current_qty / 2) * bundlePrice));
          estProfit = Math.max(0, Math.round((current_qty / 2) * profitBundle));
          reason = `Penjualan lambat (${avgDailyQty.toFixed(1)} pcs/hari). Bundle bisa meningkatkan volume.`;
        } else {
          // Bundle margin terlalu tipis → fallback Flash Sale
          const fr = makeFlash(sell_price, hpp, marginPct, avgDailyQty, name);
          if (fr) {
            promoType = fr.promoType; params = fr.params;
            estRevenue = fr.estRevenue; estProfit = fr.estProfit; lossIfNoPromo = fr.lossIfNoPromo;
            reason = `Penjualan lambat (${avgDailyQty.toFixed(1)} pcs/hari). Flash sale untuk percepat perputaran stok.`;
          } else {
            const dr = makeDiscount(sell_price, hpp, marginPct, current_qty, name);
            if (!dr) continue;
            promoType = dr.promoType; params = dr.params;
            estRevenue = dr.estRevenue; estProfit = dr.estProfit; lossIfNoPromo = dr.lossIfNoPromo;
            reason = `Penjualan lambat (${avgDailyQty.toFixed(1)} pcs/hari). Diskon untuk percepat perputaran.`;
          }
        }
      } else if (marginPct > 15) {
        // Slow stock tanpa bundle conditions → FLASH SALE (sebelumnya silently dibuang — fixed)
        const fr = makeFlash(sell_price, hpp, marginPct, avgDailyQty, name);
        if (fr) {
          promoType = fr.promoType; params = fr.params;
          estRevenue = fr.estRevenue; estProfit = fr.estProfit; lossIfNoPromo = fr.lossIfNoPromo;
          reason = `Penjualan lambat (${avgDailyQty.toFixed(1)} pcs/hari). Flash sale untuk menarik pembeli.`;
        } else {
          const dr = makeDiscount(sell_price, hpp, marginPct, current_qty, name);
          if (!dr) continue;
          promoType = dr.promoType; params = dr.params;
          estRevenue = dr.estRevenue; estProfit = dr.estProfit; lossIfNoPromo = dr.lossIfNoPromo;
          reason = `Penjualan lambat (${avgDailyQty.toFixed(1)} pcs/hari). Diskon untuk percepat perputaran.`;
        }
      } else {
        // Margin rendah → DISCOUNT
        const dr = makeDiscount(sell_price, hpp, marginPct, current_qty, name);
        if (!dr) continue;
        promoType = dr.promoType; params = dr.params;
        estRevenue = dr.estRevenue; estProfit = dr.estProfit; lossIfNoPromo = dr.lossIfNoPromo;
        reason = `Penjualan lambat (${avgDailyQty.toFixed(1)} pcs/hari). Diskon untuk percepat perputaran.`;
      }

    } else if (isHighMargin && daysNoSale >= 7) {
      // ── HIGH MARGIN → BXGY
      let buyQty = 3;
      let freeQty = 1;
      if (marginPct > 50) { buyQty = 2; freeQty = 1; }

      const profitPerSet = (buyQty * sell_price) - ((buyQty + freeQty) * hpp);
      const marginEfektif = profitPerSet / (buyQty * sell_price) * 100;

      if (marginEfektif >= 5) {
        promoType = 'bxgy';
        params = {
          nama_promo: `Beli ${buyQty} Gratis ${freeQty} - ${name}`,
          buy_qty: buyQty,
          free_qty: freeQty,
          profit_per_set: Math.round(profitPerSet),
          margin_efektif_pct: Math.round(marginEfektif * 10) / 10,
          margin_normal_pct: Math.round(marginPct * 10) / 10,
          ...(marginEfektif < 10 ? { margin_warning: true } : {}),
        };
        estRevenue = Math.max(0, Math.round((current_qty / (buyQty + freeQty)) * buyQty * sell_price));
        estProfit = Math.max(0, Math.round((current_qty / (buyQty + freeQty)) * profitPerSet));
        lossIfNoPromo = 0;
        reason = `Margin tinggi (${marginPct.toFixed(0)}%). Beli ${buyQty} Gratis ${freeQty} untuk meningkatkan volume.`;
      } else {
        // BXGY tidak aman → Flash Sale
        const fr = makeFlash(sell_price, hpp, marginPct, avgDailyQty, name);
        if (fr) {
          promoType = fr.promoType; params = fr.params;
          estRevenue = fr.estRevenue; estProfit = fr.estProfit; lossIfNoPromo = fr.lossIfNoPromo;
          reason = `Margin tinggi namun penjualan melambat. Flash sale untuk meningkatkan traffic.`;
        } else {
          const dr = makeDiscount(sell_price, hpp, marginPct, current_qty, name);
          if (!dr) continue;
          promoType = dr.promoType; params = dr.params;
          estRevenue = dr.estRevenue; estProfit = dr.estProfit; lossIfNoPromo = dr.lossIfNoPromo;
          reason = `Margin tinggi namun penjualan mulai melambat.`;
        }
      }

    } else {
      // ── STAGNANT (daysNoSale 14-30, bukan dead/slow) → FLASH SALE
      const fr = makeFlash(sell_price, hpp, marginPct, avgDailyQty, name);
      if (fr) {
        promoType = fr.promoType; params = fr.params;
        estRevenue = fr.estRevenue; estProfit = fr.estProfit; lossIfNoPromo = fr.lossIfNoPromo;
        reason = `Tidak terjual ${daysNoSale} hari. Flash sale untuk mempertahankan momentum penjualan.`;
      } else {
        const dr = makeDiscount(sell_price, hpp, marginPct, current_qty, name);
        if (!dr) continue;
        promoType = dr.promoType; params = dr.params;
        estRevenue = dr.estRevenue; estProfit = dr.estProfit; lossIfNoPromo = dr.lossIfNoPromo;
        reason = `Tidak terjual ${daysNoSale} hari. Diskon ringan untuk mempertahankan momentum.`;
      }
    }

    recommendations.push({
      store_id: storeId,
      store_product_id: spId,
      status: 'pending',
      priority,
      promo_type: promoType,
      reason,
      product_name: name,
      product_barcode: barcode || '',
      hpp,
      sell_price,
      current_stock: current_qty,
      days_no_sale: daysNoSale,
      params,
      est_revenue: estRevenue,
      est_profit: estProfit,
      loss_if_no_promo: Math.max(0, Math.round(lossIfNoPromo)),
      analyzed_at: analyzedAt,
    });
  }

  const debugInfo = { raw_products: rawProducts.length, stock_records: stockData.length, daily_sales: dailySaleIds.length, sale_items_aggregated: Object.keys(saleAggMap).length };
  if (recommendations.length === 0) return { count: 0, no_sale_data: noSaleData, products_with_stock: products.length, debug: debugInfo };

  // Clear old pending recommendations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('promo_recommendations')
    .delete()
    .eq('store_id', storeId)
    .eq('status', 'pending');

  // Insert new recommendations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('promo_recommendations').insert(recommendations);

  // Create notification
  const urgentCount = recommendations.filter((r) => r.priority === 'urgent').length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('notifications').insert([{
    store_id: storeId,
    type: 'promo_recommendation',
    title: urgentCount > 0
      ? `${urgentCount} produk butuh promo segera`
      : `${recommendations.length} rekomendasi promo baru`,
    message: `${recommendations.length} rekomendasi promo baru tersedia untuk toko ini.`,
    action_url: `/toko/${storeId}/rekomendasi-promo`,
    is_read: false,
  }]);

  return { count: recommendations.length, no_sale_data: noSaleData, products_with_stock: products.length, debug: debugInfo };
}

// POST: manual trigger or from app
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const storeId: string | undefined = body?.store_id;

    const supabase = getAdminClient();
    const perStore: { store_id: string; recommendations: number; no_sale_data: boolean; products_with_stock: number; debug?: AnalyzeResult['debug'] }[] = [];

    if (storeId) {
      const result = await analyzeStore(supabase, storeId);
      perStore.push({ store_id: storeId, recommendations: result.count, no_sale_data: result.no_sale_data, products_with_stock: result.products_with_stock, debug: result.debug });
    } else {
      // Analyze all active stores
      const { data: stores } = await supabase
        .from('stores')
        .select('id')
        .eq('is_active', true);

      for (const store of stores || []) {
        const result = await analyzeStore(supabase, store.id);
        perStore.push({ store_id: store.id, recommendations: result.count, no_sale_data: result.no_sale_data, products_with_stock: result.products_with_stock, debug: result.debug });
      }
    }

    const totalRecommendations = perStore.reduce((s, p) => s + p.recommendations, 0);
    const anyNoSaleData = perStore.some((p) => p.no_sale_data);

    return NextResponse.json({
      success: true,
      stores_analyzed: perStore.length,
      total_recommendations: totalRecommendations,
      no_sale_data: anyNoSaleData,
      per_store: perStore,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET: called by Vercel cron (analyze all stores)
export async function GET() {
  try {
    const supabase = getAdminClient();
    const perStore: { store_id: string; recommendations: number }[] = [];

    const { data: stores } = await supabase
      .from('stores')
      .select('id')
      .eq('is_active', true);

    for (const store of stores || []) {
      const result = await analyzeStore(supabase, store.id);
      perStore.push({ store_id: store.id, recommendations: result.count });
    }

    const totalRecommendations = perStore.reduce((s, p) => s + p.recommendations, 0);

    return NextResponse.json({
      success: true,
      triggered_by: 'cron',
      stores_analyzed: perStore.length,
      total_recommendations: totalRecommendations,
      per_store: perStore,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

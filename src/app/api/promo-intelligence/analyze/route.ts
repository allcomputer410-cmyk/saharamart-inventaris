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
        .range(offset, offset + PAGE - 1);
      if (error || !page || page.length === 0) break;
      rawProducts = rawProducts.concat(page);
      if (page.length < PAGE) break;
      offset += PAGE;
    }
  }

  if (rawProducts.length === 0) return { count: 0, no_sale_data: true, products_with_stock: 0, debug: { raw_products: 0, stock_records: 0, daily_sales: 0, sale_items_aggregated: 0 } };

  // Get stock data (paginated)
  const productIds = rawProducts.map((p) => p.id);
  let stockData: { store_product_id: string; current_qty: number; min_qty: number }[] = [];
  {
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data: page, error } = await supabase
        .from('stock')
        .select('store_product_id, current_qty, min_qty')
        .eq('store_id', storeId)
        .in('store_product_id', productIds)
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

  let avgTransaction = 50000; // fallback
  const dailySaleIds: string[] = [];
  const saleDateById: Record<string, string> = {};
  if (dailySalesData && dailySalesData.length > 0) {
    const totalRev = dailySalesData.reduce((s: number, d: { total_revenue: number }) => s + (d.total_revenue || 0), 0);
    const totalTxn = dailySalesData.reduce((s: number, d: { total_transactions: number }) => s + (d.total_transactions || 0), 0);
    if (totalTxn > 0) avgTransaction = totalRev / totalTxn;
    dailySalesData.forEach((ds: { id: string; sale_date: string }) => {
      dailySaleIds.push(ds.id);
      saleDateById[ds.id] = ds.sale_date;
    });
  }

  // 3. Get sale items — query langsung by daily_sale_id (lebih reliable dari join filter)
  const saleAggMap: Record<string, SaleAgg> = {};
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
          saleAggMap[spId].days_sold += 1;
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

  // Store-level averages
  const totalStoreSales30 = Object.values(saleAggMap).reduce((s, a) => s + a.total_qty, 0);
  const storeAvgDailyQty = totalStoreSales30 / 30;
  const avgDailyQtyPerProduct = products.length > 0 ? storeAvgDailyQty / products.length : 0;

  // Total HPP for store margin calculation
  let totalRevenue30 = 0;
  let totalHpp30 = 0;
  products.forEach((p) => {
    const agg = saleAggMap[p.id];
    if (agg) {
      totalRevenue30 += agg.total_revenue;
      totalHpp30 += agg.total_qty * p.hpp;
    }
  });
  const storeMarginPct = totalRevenue30 > 0
    ? ((totalRevenue30 - totalHpp30) / totalRevenue30) * 100
    : 20; // fallback 20%

  const recommendations: Recommendation[] = [];
  const analyzedAt = new Date().toISOString();

  for (const product of products) {
    const { id: spId, name, barcode, hpp, sell_price, category_id, current_qty } = product;

    // Skip if no pricing info
    if (hpp <= 0 || sell_price <= 0) continue;

    const marginPct = ((sell_price - hpp) / sell_price) * 100;
    if (marginPct < 5) continue;

    const agg = saleAggMap[spId];
    const lastSaleDate = agg?.last_sale_date || null;
    // Default daysNoSale:
    // - Jika produk tidak ada di saleAggMap (tidak pernah terjual) → 31 (dead stock)
    // - Jika noSaleData global → 31
    // - Jika ada agg tapi belum ada lastSaleDate → 30 (fallback netral)
    let daysNoSale = (!agg || noSaleData) ? 31 : 30;
    if (lastSaleDate) {
      const last = new Date(lastSaleDate);
      daysNoSale = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    }
    const avgDailyQty = agg ? agg.total_qty / 30 : 0;

    // Determine condition
    // isDeadStock: tidak terjual > 30 hari ATAU produk tidak ada di data penjualan sama sekali
    const isDeadStock = daysNoSale > 30 || !agg;
    // isSlowStock: terjual < 50% rata-rata (hanya jika ada data dan produk memang ada penjualan)
    const isSlowStock = !isDeadStock && !noSaleData && avgDailyQtyPerProduct > 0 && avgDailyQty < avgDailyQtyPerProduct * 0.5;
    const isHighMargin = marginPct > 35;

    if (!isDeadStock && !isSlowStock && !(isHighMargin && daysNoSale >= 7)) continue;

    // Determine priority
    let priority = 'optional';
    if (isDeadStock) priority = 'urgent';
    else if (daysNoSale >= 14 || avgDailyQty < avgDailyQtyPerProduct * 0.3) priority = 'suggested';
    else if (daysNoSale >= 7 && marginPct > 35) priority = 'optional';

    // Determine promo type and calculate params
    let promoType = 'discount';
    let params: Record<string, unknown> = {};
    let estRevenue = 0;
    let estProfit = 0;
    let lossIfNoPromo = current_qty * hpp;
    let reason = '';

    if (isDeadStock) {
      // DEAD STOCK → DISCOUNT
      promoType = 'discount';
      const maxDiscountPct = ((sell_price - hpp * 1.05) / sell_price) * 100;
      let discountPct = Math.min((marginPct - 5) / 2, marginPct - 5);
      discountPct = Math.min(discountPct, maxDiscountPct);
      discountPct = Math.max(discountPct, 5);
      const promoPrice = sell_price * (1 - discountPct / 100);
      const profitPerPcs = promoPrice - hpp;
      const marginPromoPct = profitPerPcs / promoPrice * 100;
      estRevenue = current_qty * promoPrice;
      estProfit = current_qty * profitPerPcs;
      lossIfNoPromo = current_qty * hpp;
      params = {
        nama_promo: `Diskon ${Math.round(discountPct)}% - ${name}`,
        discount_pct: Math.round(discountPct * 10) / 10,
        promo_price: Math.round(promoPrice),
        profit_per_pcs: Math.round(profitPerPcs),
        margin_promo_pct: Math.round(marginPromoPct * 10) / 10,
        margin_normal_pct: Math.round(marginPct * 10) / 10,
      };
      reason = `Tidak terjual ${daysNoSale} hari. Stok ${current_qty} pcs berisiko dead stock.`;

    } else if (isSlowStock && marginPct > 20 && category_id) {
      // SLOW STOCK with category → try BUNDLE
      promoType = 'bundle';
      const bundleDiscount = 0.12;
      const bundlePrice = sell_price * 2 * (1 - bundleDiscount);
      const totalHppBundle = hpp * 2;
      const profitBundle = bundlePrice - totalHppBundle;
      const marginBundlePct = profitBundle / bundlePrice * 100;

      if (marginBundlePct >= 5) {
        estRevenue = (current_qty / 2) * bundlePrice;
        estProfit = (current_qty / 2) * profitBundle;
        params = {
          nama_promo: `Bundle 2x ${name}`,
          bundle_price: Math.round(bundlePrice),
          bundle_qty: 2,
          bundle_discount_pct: bundleDiscount * 100,
          profit_per_bundle: Math.round(profitBundle),
          margin_bundle_pct: Math.round(marginBundlePct * 10) / 10,
          margin_normal_pct: Math.round(marginPct * 10) / 10,
        };
        reason = `Penjualan lambat (${avgDailyQty.toFixed(1)} pcs/hari). Bundle bisa meningkatkan volume.`;
      } else {
        // Fallback to DISCOUNT
        promoType = 'discount';
        const maxDiscountPct = ((sell_price - hpp * 1.05) / sell_price) * 100;
        let discountPct = Math.min((marginPct - 5) / 2, marginPct - 5);
        discountPct = Math.min(discountPct, maxDiscountPct);
        discountPct = Math.max(discountPct, 5);
        const promoPrice = sell_price * (1 - discountPct / 100);
        const profitPerPcs = promoPrice - hpp;
        const marginPromoPct = profitPerPcs / promoPrice * 100;
        estRevenue = current_qty * promoPrice;
        estProfit = current_qty * profitPerPcs;
        params = {
          nama_promo: `Diskon ${Math.round(discountPct)}% - ${name}`,
          discount_pct: Math.round(discountPct * 10) / 10,
          promo_price: Math.round(promoPrice),
          profit_per_pcs: Math.round(profitPerPcs),
          margin_promo_pct: Math.round(marginPromoPct * 10) / 10,
          margin_normal_pct: Math.round(marginPct * 10) / 10,
        };
        reason = `Penjualan lambat (${avgDailyQty.toFixed(1)} pcs/hari). Diskon untuk percepat perputaran.`;
      }

    } else if (isHighMargin && daysNoSale >= 7) {
      // HIGH MARGIN → BXGY or FLASH SALE
      if (marginPct > 35) {
        promoType = 'bxgy';
        let buyQty = 3;
        let freeQty = 1;
        if (marginPct > 50) { buyQty = 2; freeQty = 1; }

        const profitPerSet = (buyQty * sell_price) - ((buyQty + freeQty) * hpp);
        const marginEfektif = profitPerSet / (buyQty * sell_price) * 100;

        if (marginEfektif >= 0) {
          estRevenue = (current_qty / (buyQty + freeQty)) * buyQty * sell_price;
          estProfit = (current_qty / (buyQty + freeQty)) * profitPerSet;
          params = {
            nama_promo: `Beli ${buyQty} Gratis ${freeQty} - ${name}`,
            buy_qty: buyQty,
            free_qty: freeQty,
            profit_per_set: Math.round(profitPerSet),
            margin_efektif_pct: Math.round(marginEfektif * 10) / 10,
            margin_normal_pct: Math.round(marginPct * 10) / 10,
          };
          reason = `Margin tinggi (${marginPct.toFixed(0)}%). Program Beli ${buyQty} Gratis ${freeQty} untuk meningkatkan volume.`;
        } else {
          // Fallback to DISCOUNT
          promoType = 'discount';
          const maxDiscountPct = ((sell_price - hpp * 1.05) / sell_price) * 100;
          let discountPct = Math.min((marginPct - 5) / 2, marginPct - 5);
          discountPct = Math.min(discountPct, maxDiscountPct);
          discountPct = Math.max(discountPct, 5);
          const promoPrice = sell_price * (1 - discountPct / 100);
          const profitPerPcs = promoPrice - hpp;
          const marginPromoPct = profitPerPcs / promoPrice * 100;
          estRevenue = current_qty * promoPrice;
          estProfit = current_qty * profitPerPcs;
          params = {
            nama_promo: `Diskon ${Math.round(discountPct)}% - ${name}`,
            discount_pct: Math.round(discountPct * 10) / 10,
            promo_price: Math.round(promoPrice),
            profit_per_pcs: Math.round(profitPerPcs),
            margin_promo_pct: Math.round(marginPromoPct * 10) / 10,
            margin_normal_pct: Math.round(marginPct * 10) / 10,
          };
          reason = `Margin tinggi namun penjualan mulai melambat.`;
        }
      } else {
        // FLASH SALE
        promoType = 'flash_sale';
        const flashDiscount = Math.min((marginPct - 5) / 2, 20);
        const flashPrice = sell_price * (1 - flashDiscount / 100);
        const kuotaPerHari = Math.max(avgDailyQty * 2, 10);
        estRevenue = kuotaPerHari * 7 * flashPrice;
        estProfit = kuotaPerHari * 7 * (flashPrice - hpp);
        const marginFlashPct = (flashPrice - hpp) / flashPrice * 100;
        params = {
          nama_promo: `Flash Sale - ${name}`,
          flash_discount_pct: Math.round(flashDiscount * 10) / 10,
          flash_price: Math.round(flashPrice),
          kuota_per_hari: Math.round(kuotaPerHari),
          jam_mulai: '10:00',
          jam_selesai: '12:00',
          durasi_hari: 7,
          margin_flash_pct: Math.round(marginFlashPct * 10) / 10,
          margin_normal_pct: Math.round(marginPct * 10) / 10,
        };
        reason = `Flash sale untuk meningkatkan traffic di jam sepi (10:00–12:00).`;
      }
    } else if (!isDeadStock && !isSlowStock) {
      // MIN PURCHASE for store-wide
      promoType = 'min_purchase';
      const threshold = avgTransaction * 1.3;
      const discountNom = avgTransaction * 0.08;
      const storeRevTxnCount = totalRevenue30 > 0 && avgTransaction > 0 ? totalRevenue30 / avgTransaction : 0;
      const storeMarginTotal = totalRevenue30 * storeMarginPct / 100;
      estProfit = storeMarginTotal - storeRevTxnCount * discountNom;
      estRevenue = totalRevenue30 * 1.1; // estimated 10% uplift
      params = {
        nama_promo: `Min Belanja ${Math.round(threshold / 1000) * 1000} Diskon ${Math.round(discountNom / 1000) * 1000}`,
        min_purchase: Math.round(threshold / 1000) * 1000,
        discount_nom: Math.round(discountNom / 1000) * 1000,
        avg_transaction: Math.round(avgTransaction),
        store_margin_pct: Math.round(storeMarginPct * 10) / 10,
      };
      reason = `Program min belanja untuk meningkatkan rata-rata transaksi toko.`;
      lossIfNoPromo = 0;
    } else {
      continue;
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
      est_revenue: Math.max(0, Math.round(estRevenue)),
      est_profit: Math.max(0, Math.round(estProfit)),
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

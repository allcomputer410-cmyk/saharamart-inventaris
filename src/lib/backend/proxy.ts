import { NextRequest } from 'next/server';
import { ApiError, apiError, checkOrigin, digest, internalJwt, requireUser } from './auth';
import { db } from './db';

export const DATA_TABLES = new Set(`operational_costs audit_log brands categories cek_stok_session_items cek_stok_sessions daily_sale_items daily_sales notifications order_items orders payment_method_overrides promo_products promo_recommendations promo_rules promotions purchase_items purchases stock stock_movements stock_opname_items stock_opnames store_item_discounts store_products store_suppliers stores suppliers sync_log units user_profiles warehouse_transfer_items warehouse_transfers v_critical_stock v_margin_rendah v_rekap_kasir v_sale_items_detail`.split(' '));
const SYNC_TABLES = new Set(`stores categories brands suppliers store_suppliers store_products stock stock_movements daily_sales daily_sale_items purchases purchase_items sales_transactions store_item_discounts sync_log audit_log`.split(' '));
export async function proxy(request: NextRequest, path: string[], sync = false) {
  try {
    const salesRpc = sync && path.length === 2 && path[0] === 'rpc' && path[1] === 'sync_daily_sales' && request.method === 'POST';
    if (!salesRpc && (path.length !== 1 || !(sync ? SYNC_TABLES : DATA_TABLES).has(path[0]))) throw new ApiError(404, 'Endpoint tidak ditemukan');
    let claims: Record<string, unknown>;
    if (sync) {
      const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
      if (!token || token.length < 32) throw new ApiError(401, 'Token sync tidak valid');
      const found = await db().query(`SELECT k.id,k.store_id FROM app_private.sync_keys k JOIN public.stores s ON s.id=k.store_id
        WHERE k.token_hash=$1 AND k.revoked_at IS NULL AND s.is_active=true`, [digest(token)]);
      if (!found.rows[0]) throw new ApiError(401, 'Token sync tidak valid');
      claims = { role: 'sync_agent', store_id: found.rows[0].store_id };
    } else {
      checkOrigin(request);
      const user = await requireUser();
      claims = { role: 'authenticated', sub: user.id };
    }
    const target = process.env.POSTGREST_URL;
    if (!target) throw new ApiError(503, 'Database belum dikonfigurasi');
    const headers = new Headers({ Authorization: `Bearer ${internalJwt(claims)}` });
    for (const name of ['accept', 'content-type', 'prefer', 'range', 'range-unit']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    // Size limit applies to streamed/chunked requests too.
    let body: string | undefined;
    if (!['GET', 'HEAD'].includes(request.method)) {
      if (Number(request.headers.get('content-length')) > 8*1024*1024) throw new ApiError(413, 'Batch terlalu besar');
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      if (reader) while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > 8*1024*1024) { await reader.cancel(); throw new ApiError(413, 'Batch terlalu besar'); }
        chunks.push(part.value);
      }
      body = Buffer.concat(chunks).toString('utf8');
    }
    const result = await fetch(`${target}/${path.join('/')}${request.nextUrl.search}`, {
      method: request.method, headers, body, cache: 'no-store', signal: AbortSignal.timeout(30000),
    });
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
    for (const name of ['content-type', 'content-range', 'range-unit', 'preference-applied']) {
      const value = result.headers.get(name); if (value) responseHeaders.set(name, value);
    }
    return new Response(result.body, { status: result.status, headers: responseHeaders });
  } catch (error) { return apiError(error); }
}

// api/events.js
import { supabase } from './utils/supabaseClient.js';
import { applyCors, handlePreflight } from './utils/cors.js';

export default async function handler(req, res) {
  // --- CORS / OPTIONS ---
  if (handlePreflight(req, res)) return; // OPTIONS
  applyCors(req, res);

  try {
    // =======================================
    // GET /api/events
    // - Lista eventos com filtros e paginação
    // - Resumo por categoria (summary=1) — últimas 24h por padrão
    // =======================================
    if (req.method === 'GET') {
      const {
        page = '1',
        pageSize = '50',
        category = '',
        uid = '',
        name = '',
        from = '',
        to = '',
        summary = '',
      } = req.query || {};

      // --------- Resumo por categoria ---------
      if (String(summary) === '1') {
        const now = new Date();
        const toISO = to || now.toISOString();
        const fromISO =
          from || new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

        const categories = ['auth', 'wallet', 'game', 'admin', 'system', 'debug'];

        // faz 1 contagem por categoria (robusto e simples)
        const promises = categories.map((cat) =>
          supabase
            .from('eventos')
            .select('id', { count: 'exact', head: true })
            .eq('category', cat)
            .gte('created_at', fromISO)
            .lte('created_at', toISO)
        );

        const results = await Promise.all(promises);
        const map = {};
        categories.forEach((cat, i) => {
          const { count, error } = results[i] || {};
          if (error) {
            // se alguma der erro, segue zerando a categoria (não quebra o endpoint)
            map[cat] = 0;
          } else {
            map[cat] = Number(count || 0);
          }
        });

        return res.status(200).json({
          success: true,
          data: map,
          from: fromISO,
          to: toISO,
        });
      }

      // --------- Lista paginada ---------
      const p = Math.max(1, parseInt(page, 10));
      const ps = Math.min(200, Math.max(1, parseInt(pageSize, 10)));
      const fromIdx = (p - 1) * ps;
      const toIdx = fromIdx + ps - 1;

      let query = supabase
        .from('eventos')
        .select('id, name, category, uid, props, ip, ua, created_at', { count: 'exact' });

      if (category && category !== 'all') query = query.eq('category', String(category).toLowerCase());
      if (uid) query = query.eq('uid', uid);
      if (name) query = query.eq('name', name);
      if (from) query = query.gte('created_at', from);
      if (to) query = query.lte('created_at', to);

      query = query.order('created_at', { ascending: false }).range(fromIdx, toIdx);

      const { data, error, count } = await query;
      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: {
          items: data || [],
          total: typeof count === 'number' ? count : (data?.length ?? 0),
          totalPages: Math.max(1, Math.ceil((count ?? data?.length ?? 0) / ps)),
          currentPage: p,
        },
      });
    }

    // =======================================
    // POST /api/events
    // Cria um evento
    // body: { name: string, category?: 'auth'|'wallet'|'game'|'admin'|'system'|'debug', uid?: string, props?: object }
    // =======================================
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, mensagem: 'Método não permitido' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ success: false, mensagem: 'Invalid JSON' });
    }

    const name = String(body.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, mensagem: 'Informe o campo "name".' });
    }

    const category = String(body.category || 'system').toLowerCase();
    const uid = String(body.uid || '').trim() || null;
    const props = (body.props && typeof body.props === 'object') ? body.props : null;

    const ip =
      (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    const ua = req.headers['user-agent'] || null;

    const insert = { name, category, uid, props, ip, ua };
    const { error: insErr } = await supabase.from('eventos').insert([insert]);
    if (insErr) throw insErr;

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Erro /api/events:', err);
    const msg = err?.message || 'Erro interno';
    // 22P02 etc. => 400
    const isBad = /invalid input|syntax|22P0\d|JSON/i.test(msg);
    return res.status(isBad ? 400 : 500).json({ success: false, mensagem: msg });
  }
}

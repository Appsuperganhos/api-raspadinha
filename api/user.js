// api/user.js
import { supabase } from './utils/supabaseClient.js';
import { applyCors, handlePreflight } from './utils/cors.js';

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return; // OPTIONS
  applyCors(req, res);

  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, mensagem: 'Método não permitido' });
    }

    const {
      // para LISTA
      list = '0',
      page = '1',
      pageSize = '100',
      q = '',
      orderBy = 'criado_em',  // <- default resiliente ao seu schema
      orderDir = 'desc',

      // para BUSCA ÚNICA
      id = '',
      email = ''
    } = req.query || {};

    // -------- LISTA (/api/user?list=1) --------
    if (list === '1' || String(list).toLowerCase() === 'true') {
      const p  = Math.max(1, parseInt(page, 10));
      const ps = Math.min(200, Math.max(1, parseInt(pageSize, 10)));
      const fromIdx = (p - 1) * ps;
      const toIdx   = fromIdx + ps - 1;
      const asc     = String(orderDir).toLowerCase() === 'asc';

      // base query — inclui 'criado_em' (que é como está no seu Supabase)
      let baseQ = supabase
        .from('usuarios')
        .select('id, nome, email, telefone, saldo, isAdmin, criado_em', { count: 'exact' });

      if (q) baseQ = baseQ.or(`nome.ilike.%${q}%,email.ilike.%${q}%`);

      // ordem preferencial de colunas para ordenar, com fallback automático
      const preferredOrderCols = (() => {
        const ob = String(orderBy || '').toLowerCase();
        // se pedirem created_at, tentamos criado_em -> created_at
        if (ob === 'created_at') return ['criado_em', 'created_at'];
        // se pedirem criado_em, tentamos criado_em -> created_at
        if (ob === 'criado_em') return ['criado_em', 'created_at'];
        // qualquer outra coluna primeiro, depois criado_em e created_at como fallback
        return [orderBy, 'criado_em', 'created_at'].filter(Boolean);
      })();

      let data, error, count;
      let lastErr = null;

      for (const col of preferredOrderCols) {
        // tenta ordenar por cada coluna da lista até funcionar
        const qTry = baseQ.order(col, { ascending: asc }).range(fromIdx, toIdx);
        const r = await qTry;
        if (!r.error) {
          data = r.data; count = r.count; error = null;
          break;
        }
        lastErr = r.error;
      }

      if (lastErr) throw lastErr;

      return res.status(200).json({
        success: true,
        usuarios: data || [],
        pagination: {
          total: typeof count === 'number' ? count : (data?.length ?? 0),
          totalPages: Math.max(1, Math.ceil((count ?? data?.length ?? 0) / ps)),
          currentPage: p,
          pageSize: ps
        }
      });
    }

    // -------- ÚNICO (/api/user?id=... ou ?email=...) --------
    if (!id && !email) {
      return res.status(400).json({ success: false, mensagem: 'Informe o id, email ou list=1.' });
    }

    let query = supabase.from('usuarios').select('*');
    if (id) query = query.eq('id', id);
    else if (email) query = query.eq('email', email);

    const { data: usuario, error } = await query.single();
    if (error || !usuario) {
      return res.status(404).json({ success: false, mensagem: 'Usuário não encontrado.' });
    }

    if (usuario.senha) delete usuario.senha;
    return res.status(200).json({ success: true, usuario });
  } catch (err) {
    console.error('Erro /api/user:', err);
    return res.status(500).json({ success: false, mensagem: err?.message || 'Erro interno' });
  }
}

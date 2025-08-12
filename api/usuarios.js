// api/usuarios.js
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
      page = '1',
      pageSize = '100',
      q = '',
      orderBy = 'created_at',
      orderDir = 'desc'
    } = req.query || {};

    const p  = Math.max(1, parseInt(page, 10));
    const ps = Math.min(200, Math.max(1, parseInt(pageSize, 10)));
    const fromIdx = (p - 1) * ps;
    const toIdx   = fromIdx + ps - 1;

    let query = supabase
      .from('usuarios')
      .select('id, nome, email, telefone, saldo, isAdmin, created_at', { count: 'exact' });

    if (q) query = query.or(`nome.ilike.%${q}%,email.ilike.%${q}%`);

    query = query
      .order(orderBy, { ascending: orderDir?.toLowerCase() === 'asc' })
      .range(fromIdx, toIdx);

    const { data, error, count } = await query;
    if (error) throw error;

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
  } catch (err) {
    console.error('Erro /api/usuarios:', err);
    return res.status(500).json({ success: false, mensagem: err?.message || 'Erro interno' });
  }
}

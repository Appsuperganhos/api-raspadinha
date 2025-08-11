// api/transacoes.js
import { supabase } from './utils/supabaseClient.js';
import { applyCors, handlePreflight } from './utils/cors.js';

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);

  try {
    if (req.method === 'GET') {
      const userId = req.query.userId || req.query.usuario_id;
      if (!userId) {
        return res.status(400).json({ success: false, mensagem: 'Informe userId (ou usuario_id).' });
      }

      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
      const type = String(req.query.type || 'all').toLowerCase();
      const sort = String(req.query.sort || '-date');
      const ascending = sort === 'date';

      let query = supabase
        .from('transacoes')
        .select('id, usuario_id, valor, status, tipo, criado_em, external_id, descricao', { count: 'exact' })
        .eq('usuario_id', userId);

      if (type !== 'all') query = query.eq('tipo', type);
      query = query.order('criado_em', { ascending });

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await query.range(from, to);
      if (error) throw error;

      const items = (data || []).map(t => ({
        id: t.id,
        type: t.tipo,
        amount: Number(t.valor),
        status: t.status,
        date: t.criado_em,
        description: t.descricao || '',
        external_id: t.external_id || null,
      }));

      const total = typeof count === 'number' ? count : items.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      return res.status(200).json({
        success: true,
        data: { items, total, totalPages, currentPage: page },
        transacoes: items,
      });
    }

    if (req.method !== 'POST') {
  return res.status(405).json({ success: false, mensagem: 'Método não permitido' });
}

const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
const { usuario_id, valor, tipo, status = 'completed', descricao = null, external_id = null } = body;

if (!usuario_id || typeof valor !== 'number' || !tipo) {
  return res.status(400).json({ success: false, mensagem: 'Campos obrigatórios: usuario_id, valor (number) e tipo.' });
}

const tipoNorm = String(tipo).toLowerCase();
if (!['bet','win','deposit'].includes(tipoNorm)) {
  return res.status(400).json({ success: false, mensagem: 'tipo inválido.' });
}

// Depósito pendente → insere sem atualizar saldo
if (tipoNorm === 'deposit' && String(status).toLowerCase() !== 'completed') {
  const { data: pendingRow, error: pendingErr } = await supabase
    .from('transacoes')
    .insert([{ usuario_id, valor: Math.abs(Number(valor)), tipo: tipoNorm, status, descricao, external_id }])
    .select()
    .single();

  if (pendingErr) {
    console.error('insert pending deposit failed', pendingErr);
    return res.status(500).json({ success: false, mensagem: pendingErr.message });
  }

  const { data: u0, error: u0e } = await supabase
    .from('usuarios')
    .select('saldo')
    .eq('id', usuario_id)
    .single();

  if (u0e) return res.status(500).json({ success: false, mensagem: u0e.message });

  return res.status(201).json({
    success: true,
    message: 'Transação registrada como não concluída',
    data: { saldo: u0?.saldo ?? 0, transaction: pendingRow }
  });
}

// Completed (bet, win, deposit) → trigger fará o update de saldo
const row = {
  usuario_id,
  valor: Math.abs(Number(valor)),
  tipo: tipoNorm,
  status,
  descricao,
  external_id
};

let inserted = null;
let insErr = null;

if (external_id) {
  const up = await supabase
    .from('transacoes')
    .upsert([row], { onConflict: 'external_id' })
    .select()
    .single();
  inserted = up.data;
  insErr = up.error;
} else {
  const ins = await supabase
    .from('transacoes')
    .insert([row])
    .select()
    .single();
  inserted = ins.data;
  insErr = ins.error;
}

if (insErr) {
  console.error('insert/upsert transaction failed', insErr);
  return res.status(500).json({ success: false, mensagem: insErr.message });
}

// Lê saldo atualizado pelo trigger
const { data: u, error: ue } = await supabase
  .from('usuarios')
  .select('saldo')
  .eq('id', usuario_id)
  .single();

if (ue) {
  console.error('fetch saldo after trigger failed', ue);
  return res.status(500).json({ success: false, mensagem: ue.message });
}

return res.status(201).json({
  success: true,
  message: 'Transação registrada',
  data: { saldo: u?.saldo ?? 0, transaction: inserted }
});
  } catch (err) {
    console.error('Erro /api/transacoes:', err);
    return res.status(500).json({ success: false, mensagem: err.message });
  }
}

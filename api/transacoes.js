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

// 💡 Depósito só credita se for completed
if (tipoNorm === 'deposit' && String(status).toLowerCase() !== 'completed') {
  return res.status(200).json({ success: true, mensagem: 'Depósito não confirmado, ignorado.' });
}

// 🔒 Idempotência de depósito: se vier com external_id e já houver completed com o mesmo id, não creditar de novo
if (tipoNorm === 'deposit' && external_id) {
  const { data: dup, error: dupErr } = await supabase
    .from('transacoes')
    .select('id, usuario_id')
    .eq('external_id', external_id)
    .eq('tipo', 'deposit')
    .eq('status', 'completed')
    .maybeSingle();
  if (dupErr) {
    console.error('Erro checando duplicidade:', dupErr);
  }
  if (dup) {
    // Já processado. Retorna saldo atual para sincronizar o front.
    const { data: uRow } = await supabase
      .from('usuarios')
      .select('saldo')
      .eq('id', usuario_id)
      .single();
    return res.status(200).json({
      success: true,
      mensagem: 'Depósito já processado',
      data: { saldo: Number(uRow?.saldo) ?? 0 }
    });
  }
}

// Busca saldo atual
const { data: uData, error: uErr } = await supabase
  .from('usuarios')
  .select('saldo')
  .eq('id', usuario_id)
  .single();

if (uErr || !uData) {
  return res.status(404).json({ success: false, mensagem: 'Usuário não encontrado.' });
}

const saldoAtual = Number(uData.saldo) || 0;

// Define delta
let delta = 0;
if (tipoNorm === 'bet') delta = -Math.abs(Number(valor));
if (tipoNorm === 'win' || tipoNorm === 'deposit') delta = +Math.abs(Number(valor));

// 1) Primeiro insere a transação (se falhar, não mexe no saldo)
const insertData = {
  usuario_id,
  valor: Math.abs(Number(valor)),
  tipo: tipoNorm,
  status,
  descricao,
  external_id
};

// Para depósitos com external_id, evita outra corrida: tenta inserir e, se outro processo inseriu no meio tempo,
// a gente não atualiza saldo de novo.
let inserted = null;
{
  const { data, error: insErr } = await supabase
    .from('transacoes')
    .insert([insertData])
    .select()
    .single();

  if (insErr) {
    // Se erro foi por duplicidade (caso você crie uma unique constraint em external_id), apenas retorna saldo atual
    const msg = String(insErr.message || '');
    if (tipoNorm === 'deposit' && external_id && (msg.includes('duplicate') || msg.includes('unique'))) {
      const { data: uRow } = await supabase
        .from('usuarios')
        .select('saldo')
        .eq('id', usuario_id)
        .single();
      return res.status(200).json({
        success: true,
        mensagem: 'Depósito já processado (unique constraint)',
        data: { saldo: Number(uRow?.saldo) ?? saldoAtual }
      });
    }
    // Outro erro: aborta
    throw insErr;
  }
  inserted = data;
}

// 2) Só depois atualiza o saldo
const novoSaldo = saldoAtual + delta;
const { error: updErr } = await supabase
  .from('usuarios')
  .update({ saldo: novoSaldo })
  .eq('id', usuario_id);

if (updErr) {
  // rollback best effort: remove a transação recém inserida para manter consistência
  await supabase.from('transacoes').delete().eq('id', inserted?.id || '00000000-0000-0000-0000-000000000000');
  throw updErr;
}

return res.status(201).json({
  success: true,
  message: 'Transação registrada',
  data: { saldo: novoSaldo, transaction: inserted }
});
  } catch (err) {
    console.error('Erro /api/transacoes:', err);
    return res.status(500).json({ success: false, mensagem: err.message });
  }
}

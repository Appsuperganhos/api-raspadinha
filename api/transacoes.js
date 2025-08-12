// api/transacoes.js
import { supabase } from './utils/supabaseClient.js';
import { applyCors, handlePreflight } from './utils/cors.js';

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);

  try {
    // =========================
    // GET
    // =========================
    if (req.method === 'GET') {
      // Mantém o comportamento ATUAL quando vier userId/usuario_id
      const userId = req.query.userId || req.query.usuario_id;

      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));

      // Filtros opcionais para o modo "lista geral" (sem userId)
      const type = String(req.query.type || 'all').toLowerCase();     // deposit | withdraw | bet | win | all
      const status = String(req.query.status || 'all').toLowerCase(); // completed | pending | paid | ...
      const external_id = req.query.external_id || '';
      const from = req.query.from || '';
      const to   = req.query.to || '';

      // Compat com o que você já usa
      const sort = String(req.query.sort || '-date');
      const ascending = sort === 'date';

      const fromIdx = (page - 1) * pageSize;
      const toIdx = fromIdx + pageSize - 1;

      // ====== RAMO 1: comportamento antigo (EXIGE userId) ======
      if (userId) {
        let query = supabase
          .from('transacoes')
          .select('id, usuario_id, valor, status, tipo, criado_em, external_id, descricao', { count: 'exact' })
          .eq('usuario_id', userId);

        if (type !== 'all') query = query.eq('tipo', type);
        query = query.order('criado_em', { ascending });

        const { data, error, count } = await query.range(fromIdx, toIdx);
        if (error) throw error;

        // Mantém o mapeamento que VOCÊ já devolvia
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
          transacoes: items, // (mantido)
        });
      }

      // ====== RAMO 2: NOVO — lista geral (sem userId), usado pelo painel ======
      let q = supabase
        .from('transacoes')
        .select('id, usuario_id, valor, status, tipo, criado_em, created_at, external_id, descricao', { count: 'exact' });

      if (type && type !== 'all') q = q.eq('tipo', type);
      if (status && status !== 'all') q = q.eq('status', status);
      if (external_id) q = q.eq('external_id', external_id);
      if (from) q = q.gte('criado_em', from);
      if (to)   q = q.lte('criado_em', to);

      // Ordena por criado_em (fallback natural do seu schema)
      q = q.order('criado_em', { ascending });

      const { data, error, count } = await q.range(fromIdx, toIdx);
      if (error) throw error;

      // Para o ADMIN: ele usa tx.valor, tx.tipo, tx.status, tx.data
      const itemsAdmin = (data || []).map(t => ({
        id: t.id,
        usuario_id: t.usuario_id,
        valor: Number(t.valor),
        tipo: t.tipo,
        status: t.status,
        data: t.criado_em || t.created_at, // alias para a UI
        descricao: t.descricao || '',
        external_id: t.external_id || null,
      }));

      const total = typeof count === 'number' ? count : itemsAdmin.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      return res.status(200).json({
        success: true,
        data: { items: itemsAdmin, total, totalPages, currentPage: page },
        transacoes: itemsAdmin
      });
    }

    // =========================
    // POST (mantido como está)
    // =========================
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, mensagem: 'Método não permitido' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { usuario_id, valor, tipo, status = 'completed', descricao = null } = body;

    if (!usuario_id || typeof valor !== 'number' || !tipo) {
      return res.status(400).json({
        success: false,
        mensagem: 'Campos obrigatórios: usuario_id, valor (number) e tipo.'
      });
    }

    const tipoNorm = String(tipo).toLowerCase();
    if (!['bet', 'win', 'deposit'].includes(tipoNorm)) {
      return res.status(400).json({ success: false, mensagem: 'tipo inválido.' });
    }

    /**
     * 🚫 Depósitos não são processados aqui!
     * Use /api/applyDeposit (idempotente e à prova de corrida).
     * Isso evita duplicidade quando webhook e front disparam juntos.
     */
    if (tipoNorm === 'deposit') {
      return res.status(400).json({
        success: false,
        mensagem: 'Depósito deve ser processado via /api/applyDeposit.'
      });
    }

    // ===== a partir daqui: só BET e WIN =====

    // 1) Busca saldo atual
    const { data: uData, error: uErr } = await supabase
      .from('usuarios')
      .select('saldo')
      .eq('id', usuario_id)
      .single();

    if (uErr || !uData) {
      return res.status(404).json({ success: false, mensagem: 'Usuário não encontrado.' });
    }

    const saldoAtual = Number(uData.saldo) || 0;

    // 2) Define delta (bet debita, win credita)
    let delta = 0;
    if (tipoNorm === 'bet') delta = -Math.abs(Number(valor));
    if (tipoNorm === 'win') delta = +Math.abs(Number(valor));

    // 3) Insere a transação primeiro (se falhar, não mexe em saldo)
    const insertData = {
      usuario_id,
      valor: Math.abs(Number(valor)),
      tipo: tipoNorm,
      status,
      descricao
    };

    const { data: inserted, error: insErr } = await supabase
      .from('transacoes')
      .insert([insertData])
      .select()
      .single();

    if (insErr) {
      throw insErr;
    }

    // 4) Atualiza saldo
    const novoSaldo = saldoAtual + delta;
    const { error: updErr } = await supabase
      .from('usuarios')
      .update({ saldo: novoSaldo })
      .eq('id', usuario_id);

    if (updErr) {
      // rollback best-effort
      await supabase.from('transacoes').delete().eq('id', inserted?.id || '');
      throw updErr;
    }

    return res.status(201).json({
      success: true,
      message: 'Transação registrada',
      data: { saldo: novoSaldo, transaction: inserted }
    });
  } catch (err) {
    console.error('Erro /api/transacoes:', err);
    return res.status(500).json({ success: false, mensagem: err?.message || 'Erro interno' });
  }
}

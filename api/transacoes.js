// api/transacoes.js
import { supabase } from './utils/supabaseClient.js';

// --- CORS helper ---
const ALLOWED_ORIGINS = [
  'https://raspamaster.site',
  'http://localhost:5173',
  'http://localhost:3000',
];

function setCORS(req, res) {
  const origin = req.headers.origin || '';
  const allowExact = ALLOWED_ORIGINS.includes(origin);

  // Se for uma origem conhecida, reflete a origem e permite credenciais
  if (allowExact) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    // Sem credenciais quando usar "*"
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Accept, Origin'
  );
}

export default async function handler(req, res) {
  setCORS(req, res);
  if (req.method === 'OPTIONS') {
    // 204 para preflight
    return res.status(204).end();
  }

  try {
    // ===========================
    // GET: listar transações
    // ===========================
    if (req.method === 'GET') {
      // aceita userId OU usuario_id
      const userId = req.query.userId || req.query.usuario_id;
      if (!userId) {
        return res
          .status(400)
          .json({ success: false, mensagem: 'Informe userId (ou usuario_id).' });
      }

      // paginação / filtro / sort (opcionais)
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(
        100,
        Math.max(1, parseInt(req.query.pageSize || '20', 10))
      );
      const type = String(req.query.type || 'all').toLowerCase(); // all | bet | win | deposit | withdraw
      const sort = String(req.query.sort || '-date'); // "-date" desc, "date" asc

      // base query
      let query = supabase
        .from('transacoes')
        .select(
          'id, usuario_id, valor, status, tipo, criado_em, external_id, descricao',
          { count: 'exact' }
        )
        .eq('usuario_id', userId);

      // filtro por tipo
      if (type !== 'all') query = query.eq('tipo', type);

      // ordenação
      const ascending = sort === 'date';
      query = query.order('criado_em', { ascending });

      // range (Supabase usa índices base 0)
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      // mapeia para formato novo (UI nova) e legado (UI antiga)
      const items = (data || []).map((t) => ({
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
        // formato NOVO (preferido pelo front novo)
        data: {
          items,
          total,
          totalPages,
          currentPage: page,
        },
        // formato LEGADO (para telas antigas)
        transacoes: items,
      });
    }

    // ===========================
    // POST: criar transação (bet/win/deposit)
    // ===========================
    if (req.method !== 'POST') {
      return res
        .status(405)
        .json({ success: false, mensagem: 'Método não permitido' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const {
      usuario_id,
      valor,
      tipo, // 'bet' | 'win' | 'deposit'
      status = 'completed',
      descricao = null,
      external_id = null,
    } = body;

    if (!usuario_id || typeof valor !== 'number' || !tipo) {
      return res.status(400).json({
        success: false,
        mensagem: 'Campos obrigatórios: usuario_id, valor (number) e tipo.',
      });
    }

    const tipoNorm = String(tipo).toLowerCase();
    if (!['bet', 'win', 'deposit'].includes(tipoNorm)) {
      return res.status(400).json({ success: false, mensagem: 'tipo inválido.' });
    }

    if (tipoNorm === 'deposit' && String(status).toLowerCase() !== 'completed') {
      return res
        .status(200)
        .json({ success: true, mensagem: 'Depósito não confirmado, ignorado.' });
    }

    // saldo atual
    const { data: uData, error: uErr } = await supabase
      .from('usuarios')
      .select('saldo')
      .eq('id', usuario_id)
      .single();

    if (uErr || !uData) {
      return res
        .status(404)
        .json({ success: false, mensagem: 'Usuário não encontrado.' });
    }

    const saldoAtual = Number(uData.saldo) || 0;

    // delta de saldo
    let delta = 0;
    if (tipoNorm === 'bet') delta = -Math.abs(Number(valor));
    if (tipoNorm === 'win') delta = +Math.abs(Number(valor));
    if (tipoNorm === 'deposit') delta = +Math.abs(Number(valor));

    const novoSaldo = saldoAtual + delta;

    // atualiza saldo
    const { error: updErr } = await supabase
      .from('usuarios')
      .update({ saldo: novoSaldo })
      .eq('id', usuario_id);
    if (updErr) throw updErr;

    // insere transação
    const insertData = {
      usuario_id,
      valor: Math.abs(Number(valor)),
      tipo: tipoNorm,
      status,
      descricao,
      external_id,
    };
    const { data: inserted, error: insErr } = await supabase
      .from('transacoes')
      .insert([insertData])
      .select()
      .single();

    if (insErr) {
      // rollback (best-effort)
      await supabase.from('usuarios').update({ saldo: saldoAtual }).eq('id', usuario_id);
      throw insErr;
    }

    return res.status(201).json({
      success: true,
      message: 'Transação registrada',
      data: { saldo: novoSaldo, transaction: inserted },
    });
  } catch (err) {
    console.error('Erro /api/transacoes:', err);
    return res.status(500).json({ success: false, mensagem: err.message });
  }
}

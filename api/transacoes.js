// api/transacoes.js
import { supabase } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // se quiser, troque por seu domínio
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Requested-With, Accept'
  );
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      // (opcional) listar transações por usuario_id
      const { usuario_id } = req.query;
      if (!usuario_id) {
        return res.status(400).json({ success: false, mensagem: 'Informe usuario_id.' });
      }

      const { data: transacoes, error } = await supabase
        .from('transacoes')
        .select('id, valor, status, tipo, criado_em, external_id, descricao')
        .eq('usuario_id', usuario_id)
        .order('criado_em', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ success: true, transacoes });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, mensagem: 'Método não permitido' });
    }

    const body = req.body ?? {};
    const {
      usuario_id,
      valor,
      tipo,           // 'bet' | 'win' | (eventualmente 'deposit')
      status = 'completed',
      descricao = null,
      external_id = null
    } = body;

    if (!usuario_id || typeof valor !== 'number' || !tipo) {
      return res.status(400).json({
        success: false,
        mensagem: 'Campos obrigatórios: usuario_id, valor (number) e tipo.'
      });
    }

    // Normaliza tipo
    const tipoNorm = String(tipo).toLowerCase();
    if (!['bet','win','deposit'].includes(tipoNorm)) {
      return res.status(400).json({ success: false, mensagem: 'tipo inválido.' });
    }

    // Para depósito, em geral o webhook credita o saldo.
    // Aqui vamos considerar deposit apenas se vier status 'completed'.
    if (tipoNorm === 'deposit' && String(status).toLowerCase() !== 'completed') {
      return res.status(200).json({ success: true, mensagem: 'Depósito não confirmado, ignorado.' });
    }

    // Busca saldo atual do usuário
    const { data: uData, error: uErr } = await supabase
      .from('usuarios')
      .select('saldo')
      .eq('id', usuario_id)
      .single();

    if (uErr || !uData) {
      return res.status(404).json({ success: false, mensagem: 'Usuário não encontrado.' });
    }

    const saldoAtual = Number(uData.saldo) || 0;

    // Delta de saldo conforme tipo
    // bet => debita; win => credita; deposit => credita (se usar aqui)
    let delta = 0;
    if (tipoNorm === 'bet') delta = -Math.abs(Number(valor));
    if (tipoNorm === 'win') delta = +Math.abs(Number(valor));
    if (tipoNorm === 'deposit') delta = +Math.abs(Number(valor));

    const novoSaldo = saldoAtual + delta;

    // Atualiza saldo do usuário
    const { error: updErr } = await supabase
      .from('usuarios')
      .update({ saldo: novoSaldo })
      .eq('id', usuario_id);

    if (updErr) throw updErr;

    // Registra a transação
    const insertData = {
      usuario_id,
      valor: Math.abs(Number(valor)), // armazena valor positivo; o tipo indica se foi débito/crédito
      tipo: tipoNorm,
      status,
      descricao,
      external_id
    };

    const { error: insErr } = await supabase
      .from('transacoes')
      .insert([insertData]);

    if (insErr) {
      // rollback simples (best-effort): tenta voltar o saldo
      await supabase.from('usuarios').update({ saldo: saldoAtual }).eq('id', usuario_id);
      throw insErr;
    }

    // Retorna saldo oficial (para o front sincronizar)
    return res.status(200).json({
      success: true,
      data: { saldo: novoSaldo }
    });

  } catch (err) {
    console.error('Erro /api/transacoes:', err);
    return res.status(500).json({ success: false, mensagem: err.message });
  }
}

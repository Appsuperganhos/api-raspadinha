// api/webhook_pixup.js
import { supabase } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body?.requestBody || req.body;

    // Aceita "PAID" (PixUp) ou "completed" (outros)
    const normalizedStatus = String(body.status || '').toUpperCase();
    if (normalizedStatus !== 'PAID' && normalizedStatus !== 'COMPLETED') {
      return res.status(200).json({ ok: true, ignored: true });
    }

    // Busca transação pelo external_id
    const { data: transacao, error: tError } = await supabase
      .from('transacoes')
      .select('*')
      .eq('external_id', body.external_id)
      .single();

    if (tError || !transacao) throw new Error('Transação não encontrada!');

    // Idempotência: se já estiver completed, não credita de novo
    if (String(transacao.status).toLowerCase() === 'completed') {
      return res.status(200).json({ success: true, alreadyCompleted: true });
    }

    // Atualiza status -> completed
    const { error: upError } = await supabase
      .from('transacoes')
      .update({ status: 'completed' })
      .eq('id', transacao.id);

    if (upError) throw upError;

    // Credita saldo do usuário usando o valor da própria transação
    if (Number(transacao.valor) > 0) {
      const { data: usuario, error: uError } = await supabase
        .from('usuarios')
        .select('saldo')
        .eq('id', transacao.usuario_id)
        .single();

      if (uError || !usuario) throw new Error('Usuário não encontrado!');

      const saldoAtual = Number(usuario.saldo) || 0;
      const novoSaldo  = saldoAtual + Number(transacao.valor);

      const { error: updSaldoErr } = await supabase
        .from('usuarios')
        .update({ saldo: novoSaldo })
        .eq('id', transacao.usuario_id);

      if (updSaldoErr) throw updSaldoErr;
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, mensagem: err.message });
  }
}

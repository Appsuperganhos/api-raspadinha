// api/webhook_pixup.js
import { supabase } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  // --- CORS ---
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
    // PixUp às vezes envia dentro de requestBody
    const body = req.body?.requestBody || req.body || {};
    const external_id = body.external_id || body.externalId || body.txid || null;

    // Aceita "PAID" (PixUp) ou "COMPLETED" (variações)
    const normalizedStatus = String(body.status || '').toUpperCase();
    if (normalizedStatus !== 'PAID' && normalizedStatus !== 'COMPLETED') {
      // ignoramos webhooks intermediários
      return res.status(200).json({ ok: true, ignored: true });
    }

    if (!external_id) {
      return res.status(400).json({ success: false, mensagem: 'external_id ausente no webhook' });
    }

    // 1) Localiza a transação de depósito
    const { data: transacao, error: tErr } = await supabase
      .from('transacoes')
      .select('id, usuario_id, valor, status, tipo')
      .eq('external_id', external_id)
      .eq('tipo', 'deposit')
      .single();

    if (tErr || !transacao) {
      return res.status(404).json({ success: false, mensagem: 'Transação de depósito não encontrada.' });
    }

    // 2) Tenta marcar como completed SOMENTE se ainda não for completed
    //    Se ninguém atualizou antes, este update retorna a linha (data != null).
    const { data: updatedRow, error: upErr } = await supabase
      .from('transacoes')
      .update({ status: 'completed' })
      .eq('id', transacao.id)
      .neq('status', 'completed') // <- chave para idempotência
      .select()
      .single();

    if (upErr) {
      // se der erro de concorrência, melhor não seguir
      return res.status(500).json({ success: false, mensagem: upErr.message });
    }

    if (!updatedRow) {
      // Ninguém foi atualizado => já estava completed (idempotente)
      return res.status(200).json({ success: true, alreadyCompleted: true });
    }

    // 3) Só quem CONSEGUIU marcar completed credita o saldo
    const valor = Number(transacao.valor) || 0;
    if (valor > 0) {
      // lê saldo atual
      const { data: usuario, error: uErr } = await supabase
        .from('usuarios')
        .select('saldo')
        .eq('id', transacao.usuario_id)
        .single();

      if (uErr || !usuario) {
        return res.status(404).json({ success: false, mensagem: 'Usuário não encontrado.' });
      }

      const novoSaldo = Number(usuario.saldo || 0) + valor;

      const { error: saldoErr } = await supabase
        .from('usuarios')
        .update({ saldo: novoSaldo })
        .eq('id', transacao.usuario_id);

      if (saldoErr) {
        // (opcional) rollback best-effort do status se quiser
        // await supabase.from('transacoes').update({ status: transacao.status }).eq('id', transacao.id);
        return res.status(500).json({ success: false, mensagem: saldoErr.message });
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('webhook_pixup error:', err);
    return res.status(500).json({ success: false, mensagem: err.message });
  }
}

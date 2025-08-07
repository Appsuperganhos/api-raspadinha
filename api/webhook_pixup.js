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

    // Só processa se status = PAID
    if (body.status !== 'PAID') return res.status(200).json({ ok: true });

    // Busca transação pelo external_id (external_id = código único Pix gerado, ex: PIXUP_...)
    const { data: transacao, error: tError } = await supabase
      .from('transacoes')
      .select('*')
      .eq('external_id', body.external_id) // aqui é o external_id (PixUp)
      .single();

    if (tError || !transacao) throw new Error('Transação não encontrada!');

    // Atualiza status da transação para 'completed'
    await supabase
      .from('transacoes')
      .update({ status: 'completed' })
      .eq('id', transacao.id);

    // Atualiza saldo do usuário na tabela usuarios
    if (Number(transacao.valor) > 0) {
      // Busca saldo atual do usuário
      const { data: usuario, error: uError } = await supabase
        .from('usuarios')
        .select('saldo')
        .eq('id', transacao.usuario_id)
        .single();

      if (uError || !usuario) throw new Error('Usuário não encontrado!');

      const saldoAtual = Number(usuario.saldo) || 0;
      const novoSaldo = saldoAtual + Number(transacao.valor);

      await supabase
        .from('usuarios')
        .update({ saldo: novoSaldo })
        .eq('id', transacao.usuario_id);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, mensagem: err.message });
  }
}

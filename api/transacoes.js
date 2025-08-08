// api/transacoes.js
import { supabase } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      // /api/transacoes?usuario_id=...
      const { usuario_id } = req.query;
      if (!usuario_id) {
        return res.status(400).json({ success: false, mensagem: 'Informe o usuario_id.' });
      }

      const { data: transacoes, error } = await supabase
        .from('transacoes')
        .select('id, valor, status, tipo, criado_em, external_id')
        .eq('usuario_id', usuario_id)
        .order('criado_em', { ascending: false });

      if (error) {
        return res.status(500).json({ success: false, mensagem: error.message });
      }

      return res.status(200).json({ success: true, transacoes });
    }

    if (req.method === 'POST') {
      // Espera JSON no body:
      // { usuario_id, tipo, valor, status?, external_id?, meta? }
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      const {
        usuario_id,
        tipo,           // 'deposit' | 'withdraw' | 'bet' | 'win'
        valor,          // number (positivo p/ deposit/win, negativo p/ withdraw/bet)
        status = 'completed',
        external_id = null,
        meta = null     // opcional: { gameId, raspadinhaId, ... }
      } = body || {};

      if (!usuario_id || !tipo || typeof valor !== 'number') {
        return res.status(400).json({
          success: false,
          mensagem: 'Campos obrigatórios: usuario_id, tipo e valor (number).'
        });
      }

      // Inserir transação
      const { data: inserted, error: insertError } = await supabase
        .from('transacoes')
        .insert([{
          usuario_id,
          tipo,
          valor,
          status,
          external_id,
          meta
        }])
        .select()
        .single();

      if (insertError) {
        return res.status(500).json({ success: false, mensagem: insertError.message });
      }

      return res.status(201).json({ success: true, transacao: inserted });
    }

    // Método não suportado
    return res.status(405).json({ success: false, mensagem: 'Method not allowed.' });

  } catch (err) {
    return res.status(500).json({ success: false, mensagem: err.message || 'Erro interno.' });
  }
}

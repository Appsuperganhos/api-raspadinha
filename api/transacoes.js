// api/transacoes.js
import { supabase } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { usuario_id } = req.query;

  if (!usuario_id) {
    return res.status(400).json({ success: false, mensagem: 'Informe o usuario_id.' });
  }

  // Busca todas as transações do usuário
  const { data: transacoes, error } = await supabase
    .from('transacoes')
    .select('id, valor, status, tipo, criado_em, external_id')
    .eq('usuario_id', usuario_id)
    .order('criado_em', { ascending: false });

  if (error) {
    return res.status(500).json({ success: false, mensagem: error.message });
  }

  // Retorna todas as transações
  return res.status(200).json({ success: true, transacoes });
}

// api/create-transaction.js
import { supabase } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', 'https://linkprivado.shop');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') return res.status(405).end();

  const { usuario_id, valor, tipo = 'deposito', status = 'pending' } = req.body;
  try {
    if (!usuario_id || !valor) throw new Error('Usuário e valor são obrigatórios!');

    const { data, error } = await supabase
      .from('transacoes')
      .insert([{ usuario_id, valor, tipo, status }])
      .select('*')
      .single();

    if (error) throw error;
    return res.status(200).json({ success: true, transacao: data });
  } catch (error) {
    return res.status(500).json({ success: false, mensagem: error.message || "Erro desconhecido" });
  }
}

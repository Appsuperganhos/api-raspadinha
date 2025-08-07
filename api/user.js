// api/user.js
import { supabase } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, email } = req.query;

  if (!id && !email) {
    return res.status(400).json({ success: false, mensagem: 'Informe o id ou email.' });
  }

  // Buscar pelo id ou email
  let query = supabase.from('usuarios').select('*');
  if (id) query = query.eq('id', id);
  else if (email) query = query.eq('email', email);

  const { data: usuario, error } = await query.single();

  if (error || !usuario) {
    return res.status(404).json({ success: false, mensagem: 'Usuário não encontrado.' });
  }

  // Não envie senha, caso tenha campo!
  if (usuario.senha) delete usuario.senha;

  return res.status(200).json({ success: true, usuario });
}

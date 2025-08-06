// api/register.js
import bcrypt from 'bcryptjs';
import { supabase } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  // CORS headers ... (igual seu código)

  if (req.method !== 'POST') return res.status(405).end();

  const { nome, email, senha, telefone } = req.body;

  try {
    // 1. Verifica se email já existe
    const { data: userExist } = await supabase
      .from('usuarios')
      .select('id')
      .eq('email', email)
      .single();
    if (userExist) throw new Error('E-mail já cadastrado.');

    // 2. Criptografa a senha
    const senhaHash = await bcrypt.hash(senha, 10);

    // 3. Salva na tabela usuarios
    const { error } = await supabase.from('usuarios').insert([
      { nome, email, telefone, senha: senhaHash, saldo: 0 }
    ]);
    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, mensagem: error.message });
  }
}

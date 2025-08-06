import bcrypt from 'bcryptjs';
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
  // ---------------------

  if (req.method !== 'POST') return res.status(405).end();

  const { email, senha } = req.body;

  try {
    // 1. Busca usuário pelo email
    const { data: user, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) throw new Error('E-mail ou senha inválidos');

    // 2. Compara senha usando bcrypt
    const match = await bcrypt.compare(senha, user.senha);
    if (!match) throw new Error('E-mail ou senha inválidos');

    // 3. Retorna dados essenciais (NUNCA envie a senha!)
    return res.status(200).json({
      success: true,
      usuario: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        saldo: user.saldo,
        telefone: user.telefone
      }
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      mensagem: error.message || 'Falha ao realizar login'
    });
  }
}

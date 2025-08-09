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

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).end();

  const { email, senha } = req.body;

  try {
    if (!email || !senha) throw new Error('E-mail e senha são obrigatórios!');

    // ⚠️ Seleciona explicitamente a coluna "isAdmin" (com aspas!) e a senha para comparar
    const { data: user, error: findError } = await supabase
      .from('usuarios')
      .select('id, nome, email, telefone, saldo, criado_em, senha, "isAdmin"')
      .ilike('email', email.trim())   // case-insensitive e sem espaços
      .single();

    if (findError || !user) {
      console.log('Usuário não encontrado:', email, findError);
      throw new Error('E-mail ou senha inválidos');
    }

    const senhaOk = await bcrypt.compare(senha, user.senha);
    if (!senhaOk) {
      console.log('Senha incorreta para:', email);
      throw new Error('E-mail ou senha inválidos');
    }

    // NUNCA retornar a hash de senha
    const usuarioRetorno = {
      id: user.id,
      email: user.email,
      nome: user.nome,
      saldo: user.saldo,
      telefone: user.telefone,
      criado_em: user.criado_em,
      isAdmin: !!user.isAdmin    // <- campo certo
    };

    return res.status(200).json({ success: true, usuario: usuarioRetorno });
  } catch (error) {
    console.error('ERRO AO LOGAR:', error);
    return res.status(401).json({ success: false, mensagem: error.message || 'Falha ao realizar login' });
  }
}

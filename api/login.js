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
  if (req.method !== 'POST') return res.status(405).end();

  const { email, senha } = req.body;

  try {
    if (!email || !senha) throw new Error('E-mail e senha são obrigatórios!');

    const emailNorm = String(email).trim().toLowerCase();

    // Busca usuário pelo email (apenas colunas necessárias)
    const { data: user, error: findError } = await supabase
      .from('usuarios')
      .select('id, nome, email, telefone, saldo, criado_em, senha, is_admin')
      .eq('email', emailNorm)
      .single();

    if (findError || !user) {
      console.log('Usuário não encontrado:', emailNorm, findError);
      throw new Error('E-mail ou senha inválidos');
    }

    if (!user.senha) {
      console.log('Usuário sem hash de senha cadastrado:', emailNorm);
      throw new Error('E-mail ou senha inválidos');
    }

    // Compara senha usando bcrypt
    const senhaConfere = await bcrypt.compare(senha, user.senha);
    if (!senhaConfere) {
      console.log('Senha incorreta para:', emailNorm);
      throw new Error('E-mail ou senha inválidos');
    }

    // Retorna dados essenciais (NUNCA envie a senha!)
    const usuarioRetorno = {
      id: user.id,
      email: user.email,
      nome: user.nome,
      saldo: user.saldo ?? 0,
      telefone: user.telefone ?? null,
      criado_em: user.criado_em,
      isAdmin: !!user.is_admin, // <-- importante para o painel
    };

    return res.status(200).json({
      success: true,
      usuario: usuarioRetorno
    });
  } catch (error) {
    console.error('ERRO AO LOGAR:', error);
    return res.status(401).json({
      success: false,
      mensagem: error.message || 'Falha ao realizar login'
    });
  }
}

import { supabase } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', 'https://linkprivado.shop'); // seu domínio aqui!
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
    // 1. Autentica no Supabase Auth
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password: senha
    });

    if (loginError || !loginData || !loginData.user) {
      throw new Error('E-mail ou senha inválidos');
    }

    const user = loginData.user;

    // 2. Busca perfil completo na tabela 'usuarios'
    const { data: profile, error: profileError } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      throw new Error('Usuário não encontrado no banco');
    }

    // 3. Retorna dados essenciais
    return res.status(200).json({
      success: true,
      usuario: {
        id: user.id,
        email: user.email,
        nome: profile.nome || 'Usuário',
        saldo: profile.saldo || 0,
        telefone: profile.telefone || ''
      }
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      mensagem: error.message || 'Falha ao realizar login'
    });
  }
}

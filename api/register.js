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
  // --------------------

  if (req.method !== 'POST') return res.status(405).end();

  const { nome, email, senha, telefone } = req.body;

  try {
    // 1. Cadastro pelo Auth
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: senha
    });

    if (signUpError) throw signUpError;
    const user = signUpData.user;
    if (!user || !user.id) throw new Error("Falha ao criar usuário no Auth");

    // 2. Cadastro na tabela 'usuarios'
    const { error: insertError } = await supabase
      .from('usuarios')
      .insert({
        id: user.id,
        nome,
        email,
        telefone,
        saldo: 0
      });

    if (insertError) throw insertError; // Vai mostrar o erro real do insert, inclusive de RLS!

    return res.status(200).json({ success: true, usuario: user });
  } catch (error) {
    // Debug avançado: loga no server da Vercel (veja em "Logs")
    console.error('ERRO NO CADASTRO:', error);
    return res.status(500).json({ success: false, mensagem: error.message || "Erro desconhecido" });
  }
}

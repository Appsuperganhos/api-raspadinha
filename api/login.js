// api/login.js
import { supabase } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, senha } = req.body;

  try {
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password: senha
    });

    if (loginError) throw loginError;

    const user = loginData.user;

    const { data: profile } = await supabase
      .from('usuarios')
      .select('*')
      .eq('email', user.email)
      .single();

    return res.status(200).json({
      success: true,
      usuario: {
        id: user.id,
        email: user.email,
        nome: profile?.nome || 'Usuário',
        saldo: profile?.saldo || 0
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, mensagem: error.message });
  }
}

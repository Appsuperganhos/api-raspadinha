// api/register.js
import { supabase } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { nome, email, senha, telefone } = req.body;

  try {
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: senha
    });

    if (signUpError) throw signUpError;

    const { data: user } = signUpData;

    await supabase.from('usuarios').insert({
      id: user.id,
      nome,
      email,
      telefone,
      saldo: 0
    });

    return res.status(200).json({ success: true, usuario: user });
  } catch (error) {
    return res.status(500).json({ success: false, mensagem: error.message });
  }
}

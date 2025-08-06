import { supabase } from './utils/supabaseClient.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

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

  const { nome, email, senha, telefone } = req.body;

  try {
    // 1. Validações
    if (!nome || !email || !senha || !telefone)
      throw new Error("Preencha todos os campos obrigatórios!");

    // 2. Verifica se email já existe
    const { data: existing, error: existError } = await supabase
      .from('usuarios')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) throw new Error("E-mail já cadastrado!");

    // 3. Gera hash da senha
    const hashedPassword = await bcrypt.hash(senha, 10);

    // 4. Insere usuário (id gerado aqui)
    const { data, error: insertError } = await supabase
      .from('usuarios')
      .insert([{
        nome,
        email,
        telefone,
        saldo: 0,
        senha: hashedPassword
      }])
      .select('id, nome, email, telefone, saldo, criado_em')
      .single();

    if (insertError) throw insertError;

    // 5. Retorna dados não sensíveis
    return res.status(200).json({ success: true, usuario: data });
  } catch (error) {
    console.error('ERRO NO CADASTRO:', error);
    return res.status(500).json({ success: false, mensagem: error.message || "Erro desconhecido" });
  }
}

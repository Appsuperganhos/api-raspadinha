import { supabase } from './utils/supabaseClient.js';
import bcrypt from 'bcryptjs';

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

    if (existError && existError.code !== 'PGRST116') {
      // PGRST116 = "Results contain 0 rows" (sem erro, segue)
      throw existError;
    }
    if (existing) throw new Error("E-mail já cadastrado!");

    // 3. Gera hash da senha
    const hashedPassword = await bcrypt.hash(senha, 10);

    // 4. Prepara dados
    const insertData = {
      nome,
      email,
      telefone,
      saldo: 0,
      senha: hashedPassword
    };
    console.log('Tentando inserir usuário:', insertData);

    // 5. Insere usuário (ID autogerado pelo Supabase)
    const { data, error: insertError } = await supabase
      .from('usuarios')
      .insert([insertData])
      .select('id, nome, email, telefone, saldo, criado_em')
      .single();

    if (insertError) {
      console.error('ERRO AO INSERIR USUARIO:', insertError);
      throw insertError;
    }

    // 6. Retorna dados não sensíveis
    return res.status(200).json({ success: true, usuario: data });
  } catch (error) {
    console.error('ERRO NO CADASTRO:', error);
    return res.status(500).json({ success: false, mensagem: error.message || "Erro desconhecido" });
  }
}

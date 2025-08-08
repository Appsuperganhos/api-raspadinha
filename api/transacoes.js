// api/transacoes.js
import { supabase } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', 'https://linkprivado.shop');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Requested-With, Accept, Origin'
  );
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ================================
    // GET /api/transacoes?usuario_id=...
    // ================================
    if (req.method === 'GET') {
      const { usuario_id } = req.query;
      if (!usuario_id) {
        return res
          .status(400)
          .json({ success: false, mensagem: 'Informe o usuario_id.' });
      }

      const { data: transacoes, error } = await supabase
        .from('transacoes')
        .select('id, usuario_id, tipo, valor, status, criado_em, external_id') // <-- apenas colunas existentes
        .eq('usuario_id', usuario_id)
        .order('criado_em', { ascending: false });

      if (error) {
        return res.status(500).json({ success: false, mensagem: error.message });
      }

      return res.status(200).json({ success: true, transacoes });
    }

    // ==========================================
    // POST /api/transacoes
    // Corpo (JSON):
    // {
    //   "usuario_id": "<uuid>",
    //   "tipo": "bet" | "win" | "deposit" | "withdraw",
    //   "valor": number,
    //   "status": "completed",          // opcional
    //   "external_id": "string-opc"     // opcional
    // }
    // Regras saldo:
    //   bet/withdraw => saldo -= valor
    //   win/deposit  => saldo += valor
    // ==========================================
    if (req.method === 'POST') {
      const {
        usuario_id,
        tipo,
        valor,
        status = 'completed',
        external_id = null
      } = req.body || {};

      if (!usuario_id) {
        return res
          .status(400)
          .json({ success: false, mensagem: 'usuario_id é obrigatório.' });
      }
      if (!tipo || !['bet', 'win', 'deposit', 'withdraw'].includes(tipo)) {
        return res.status(400).json({
          success: false,
          mensagem: "tipo inválido. Use: 'bet', 'win', 'deposit' ou 'withdraw'.",
        });
      }
      const numValor = Number(valor);
      if (!Number.isFinite(numValor) || numValor <= 0) {
        return res
          .status(400)
          .json({ success: false, mensagem: 'valor deve ser um número > 0.' });
      }

      // Busca saldo atual
      const { data: userRow, error: userErr } = await supabase
        .from('usuarios')
        .select('saldo')
        .eq('id', usuario_id)
        .single();

      if (userErr) {
        return res.status(500).json({ success: false, mensagem: userErr.message });
      }
      if (!userRow) {
        return res
          .status(404)
          .json({ success: false, mensagem: 'Usuário não encontrado.' });
      }

      // Calcula delta no saldo
      let delta = 0;
      if (tipo === 'bet' || tipo === 'withdraw') delta = -numValor;
      if (tipo === 'win' || tipo === 'deposit') delta = +numValor;

      const saldoAtual = Number(userRow.saldo) || 0;
      const novoSaldo = saldoAtual + delta;

      if (novoSaldo < 0) {
        return res.status(400).json({
          success: false,
          mensagem: 'Saldo insuficiente para registrar esta transação.',
        });
      }

      // 1) Insere transação (apenas colunas existentes)
      const insertData = {
        usuario_id,
        tipo,
        valor: numValor,
        status,
        external_id
      };

      const { data: transacao, error: insertErr } = await supabase
        .from('transacoes')
        .insert([insertData])
        .select('id, usuario_id, tipo, valor, status, criado_em, external_id')
        .single();

      if (insertErr) {
        return res.status(500).json({ success: false, mensagem: insertErr.message });
      }

      // 2) Atualiza saldo
      const { data: updatedUser, error: updErr } = await supabase
        .from('usuarios')
        .update({ saldo: novoSaldo })
        .eq('id', usuario_id)
        .select('id, saldo')
        .single();

      if (updErr) {
        return res.status(500).json({ success: false, mensagem: updErr.message });
      }

      return res.status(200).json({
        success: true,
        transacao,
        saldo: updatedUser.saldo
      });
    }

    return res.status(405).json({ success: false, mensagem: 'Method not allowed.' });
  } catch (err) {
    console.error('ERRO /api/transacoes:', err);
    return res
      .status(500)
      .json({ success: false, mensagem: err?.message || 'Erro desconhecido' });
  }
}

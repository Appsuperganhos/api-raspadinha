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
        .select('id, usuario_id, tipo, valor, status, criado_em, external_id, descricao, jogo_id, premio')
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
    //   "valor": number,              // valor POSITIVO
    //   "status": "completed",        // opcional, default 'completed'
    //   "jogo_id": number,            // opcional
    //   "premio": number,             // opcional (para 'win')
    //   "descricao": string           // opcional
    // }
    // Registra a transação e atualiza o saldo de 'usuarios'
    // Regras de saldo:
    //   - bet      => saldo -= valor
    //   - win      => saldo += valor (ou premio, se enviado)
    //   - deposit  => saldo += valor
    //   - withdraw => saldo -= valor
    // ==========================================
    if (req.method === 'POST') {
      const {
        usuario_id,
        tipo,
        valor,
        status = 'completed',
        jogo_id = null,
        premio = null,
        descricao = null
      } = req.body || {};

      // validações básicas
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

      // Calcula impacto no saldo
      let delta = 0;
      if (tipo === 'bet') {
        delta = -numValor;
      } else if (tipo === 'win') {
        delta = Number.isFinite(Number(premio)) ? Number(premio) : numValor;
      } else if (tipo === 'deposit') {
        delta = numValor;
      } else if (tipo === 'withdraw') {
        delta = -numValor;
      }

      const saldoAtual = Number(userRow.saldo) || 0;
      const novoSaldo = saldoAtual + delta;

      // Não deixar saldo negativo (regra opcional; remova se não quiser)
      if (novoSaldo < 0) {
        return res.status(400).json({
          success: false,
          mensagem: 'Saldo insuficiente para registrar esta transação.',
        });
      }

      // 1) Insere a transação
      const insertData = {
        usuario_id,
        tipo,
        valor: numValor,
        status,
        descricao,
        jogo_id,
        premio
      };

      const { data: transacao, error: insertErr } = await supabase
        .from('transacoes')
        .insert([insertData])
        .select('*')
        .single();

      if (insertErr) {
        return res.status(500).json({ success: false, mensagem: insertErr.message });
      }

      // 2) Atualiza saldo do usuário
      const { data: updatedUser, error: updErr } = await supabase
        .from('usuarios')
        .update({ saldo: novoSaldo })
        .eq('id', usuario_id)
        .select('id, saldo')
        .single();

      if (updErr) {
        return res.status(500).json({ success: false, mensagem: updErr.message });
      }

      // Retorna resultado
      return res.status(200).json({
        success: true,
        transacao,
        saldo: updatedUser.saldo
      });
    }

    // Método não permitido
    return res.status(405).json({ success: false, mensagem: 'Method not allowed.' });
  } catch (err) {
    console.error('ERRO /api/transacoes:', err);
    return res
      .status(500)
      .json({ success: false, mensagem: err?.message || 'Erro desconhecido' });
  }
}

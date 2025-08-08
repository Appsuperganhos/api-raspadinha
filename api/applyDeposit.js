// api/applyDeposit.js
import { supabase } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', 'https://linkprivado.shop'); // ajuste se precisar
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, mensagem: 'Método não permitido' });

  try {
    const { usuario_id, external_id, valor } = req.body || {};

    if (!usuario_id || !external_id || typeof valor !== 'number') {
      return res.status(400).json({ success: false, mensagem: 'Parâmetros inválidos.' });
    }
    if (valor <= 0) {
      return res.status(400).json({ success: false, mensagem: 'Valor do depósito deve ser > 0.' });
    }

    // 1) Idempotência: já existe depósito completed com esse external_id?
    const { data: existing, error: existErr } = await supabase
      .from('transacoes')
      .select('id, status')
      .eq('external_id', external_id)
      .eq('tipo', 'deposit')
      .maybeSingle();

    if (existErr) {
      return res.status(500).json({ success: false, mensagem: existErr.message });
    }

    if (existing && existing.status === 'completed') {
      // Já aplicado anteriormente — no-op
      return res.status(200).json({ success: true, mensagem: 'Depósito já processado (idempotente).' });
    }

    // 2) Se existir como pending, marcamos como completed; senão criamos completed
    if (existing) {
      const { error: upErr } = await supabase
        .from('transacoes')
        .update({ status: 'completed', valor })
        .eq('id', existing.id);

      if (upErr) {
        return res.status(500).json({ success: false, mensagem: upErr.message });
      }
    } else {
      const { error: insErr } = await supabase
        .from('transacoes')
        .insert([{
          usuario_id,
          valor,
          tipo: 'deposit',
          status: 'completed',
          descricao: 'Depósito confirmado',
          external_id
        }]);

      if (insErr) {
        return res.status(500).json({ success: false, mensagem: insErr.message });
      }
    }

    // 3) Atualiza saldo do usuário (incremento)
    // OBS: supabase-js não tem "update set saldo = saldo + valor" pronto.
    // Então lemos e escrevemos — suficiente aqui; para 100% atomicidade, depois podemos migrar para função SQL.
    const { data: usuario, error: userErr } = await supabase
      .from('usuarios')
      .select('id, saldo')
      .eq('id', usuario_id)
      .single();

    if (userErr || !usuario) {
      return res.status(404).json({ success: false, mensagem: 'Usuário não encontrado.' });
    }

    const novoSaldo = Number(usuario.saldo || 0) + Number(valor);
    const { error: saldoErr } = await supabase
      .from('usuarios')
      .update({ saldo: novoSaldo })
      .eq('id', usuario_id);

    if (saldoErr) {
      return res.status(500).json({ success: false, mensagem: saldoErr.message });
    }

    return res.status(200).json({
      success: true,
      mensagem: 'Depósito aplicado ao saldo com sucesso.',
      saldo: novoSaldo
    });
  } catch (e) {
    console.error('applyDeposit error:', e);
    return res.status(500).json({ success: false, mensagem: 'Erro interno.' });
  }
}

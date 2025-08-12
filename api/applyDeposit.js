// api/applyDeposit.js
import { supabase } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  // CORS básico
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', 'https://raspamaster.site'); // ajuste se precisar
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Requested-With, Accept, Origin'
  );
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, mensagem: 'Método não permitido' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { usuario_id, external_id, valor } = body;

    if (!usuario_id || !external_id || typeof valor !== 'number') {
      return res.status(400).json({ success: false, mensagem: 'Parâmetros inválidos.' });
    }
    if (valor <= 0) {
      return res.status(400).json({ success: false, mensagem: 'Valor do depósito deve ser > 0.' });
    }

    // 1) Procura uma transação de depósito com o mesmo external_id
    const { data: existing, error: existErr } = await supabase
      .from('transacoes')
      .select('id, status, valor')
      .eq('external_id', external_id)
      .eq('tipo', 'deposit')
      .maybeSingle();

    if (existErr) {
      return res.status(500).json({ success: false, mensagem: existErr.message });
    }

    let didTransitionToCompleted = false;

    if (existing) {
      // 2a) Já existe
      if (String(existing.status).toLowerCase() === 'completed') {
        // Já estava completed → idempotente (não credita de novo)
        // (Opcional) retornar saldo atual para sincronizar o front
        const { data: uRow } = await supabase
          .from('usuarios')
          .select('saldo')
          .eq('id', usuario_id)
          .single();

        return res.status(200).json({
          success: true,
          mensagem: 'Depósito já processado (idempotente).',
          saldo: Number(uRow?.saldo) ?? undefined
        });
      }

      // 2b) Estava pending (ou outro status) → tenta promover para completed
      //     Usamos .neq('status','completed') para garantir idempotência em corrida
      const { data: updatedRow, error: upErr } = await supabase
        .from('transacoes')
        .update({ status: 'completed', valor })
        .eq('id', existing.id)
        .neq('status', 'completed')
        .select()
        .single();

      if (upErr) {
        return res.status(500).json({ success: false, mensagem: upErr.message });
      }

      // Se updatedRow vier null/undefined, outro processo atualizou primeiro
      didTransitionToCompleted = !!updatedRow;
    } else {
      // 2c) Não existia → cria já como completed (primeiro processamento)
      const { data: inserted, error: insErr } = await supabase
        .from('transacoes')
        .insert([{
          usuario_id,
          valor,
          tipo: 'deposit',
          status: 'completed',
          descricao: 'Depósito confirmado',
          external_id
        }])
        .select()
        .single();

      if (insErr) {
        // Se você criar um índice único para (external_id) quando tipo='deposit',
        // aqui pode cair em erro de duplicidade. Trate como idempotente:
        const msg = String(insErr.message || '').toLowerCase();
        if (msg.includes('duplicate') || msg.includes('unique')) {
          const { data: uRow } = await supabase
            .from('usuarios')
            .select('saldo')
            .eq('id', usuario_id)
            .single();
          return res.status(200).json({
            success: true,
            mensagem: 'Depósito já processado (unique constraint).',
            saldo: Number(uRow?.saldo) ?? undefined
          });
        }
        return res.status(500).json({ success: false, mensagem: insErr.message });
      }

      didTransitionToCompleted = !!inserted;
    }

    // 3) Só credita o saldo se ESTE request foi quem efetivamente
    //     mudou/registrou a transação para 'completed'
    let novoSaldo;
    if (didTransitionToCompleted) {
      const { data: usuario, error: userErr } = await supabase
        .from('usuarios')
        .select('saldo')
        .eq('id', usuario_id)
        .single();

      if (userErr || !usuario) {
        return res.status(404).json({ success: false, mensagem: 'Usuário não encontrado.' });
      }

      novoSaldo = Number(usuario.saldo || 0) + Number(valor);

      const { error: saldoErr } = await supabase
        .from('usuarios')
        .update({ saldo: novoSaldo })
        .eq('id', usuario_id);

      if (saldoErr) {
        // (Opcional) rollback best-effort do status, se quiser
        // await supabase.from('transacoes').update({ status: 'pending' }).eq('external_id', external_id).eq('tipo','deposit');
        return res.status(500).json({ success: false, mensagem: saldoErr.message });
      }
    }

    return res.status(200).json({
      success: true,
      mensagem: 'Depósito aplicado com sucesso.',
      saldo: novoSaldo // pode ser undefined quando já estava completed
    });
  } catch (e) {
    console.error('applyDeposit error:', e);
    return res.status(500).json({ success: false, mensagem: 'Erro interno.' });
  }
}

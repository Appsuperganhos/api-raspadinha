import { applyCORS, handleOPTIONS } from './utils/cors.js';
// import { supabase } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  if (handleOPTIONS(req, res)) return;
  applyCORS(req, res);

  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, mensagem: 'Método não permitido' });
    }

    const userId = req.query.userId || req.query.usuario_id;
    if (!userId) {
      return res.status(400).json({ success: false, mensagem: 'Informe userId (ou usuario_id).' });
    }

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));

    // TODO: ligar no Supabase quando a tabela existir
    const items = []; // [] por enquanto

    return res.status(200).json({
      success: true,
      data: { items, total: items.length, totalPages: 1, currentPage: page }
    });
  } catch (err) {
    console.error('Erro /api/bets:', err);
    return res.status(500).json({ success: false, mensagem: err.message });
  }
}

// api/affiliates/stats.js
import { applyCors, handlePreflight } from '../utils/cors.js';
// import { supabase } from '../utils/supabaseClient.js';

export default async function handler(req, res) {
  // Preflight CORS
  if (handlePreflight(req, res)) return;
  // CORS normal
  applyCors(res, [
    'https://raspamaster.site',
    'http://localhost:5173',
    'http://localhost:3000'
  ]);

  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, mensagem: 'Método não permitido' });
    }

    const userId = req.query.userId || req.query.usuario_id;
    if (!userId) {
      return res.status(400).json({ success: false, mensagem: 'Informe userId (ou usuario_id).' });
    }

    // TODO: puxar do Supabase quando a tabela de afiliados estiver pronta
    const stats = {
      totalReferrals: 0,
      totalEarnings: 0,
      conversionRate: 0
    };

    return res.status(200).json({ success: true, data: stats });
  } catch (err) {
    console.error('Erro /api/affiliates/stats:', err);
    return res.status(500).json({ success: false, mensagem: err.message });
  }
}

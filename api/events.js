// api/events.js
import { supabase } from './utils/supabaseClient.js';
import { applyCors, handlePreflight } from './utils/cors.js';

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return; // OPTIONS
  applyCors(req, res);

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, mensagem: 'Método não permitido' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const {
      category = 'page',
      name = 'page_view',
      props = {},
      usuario_id = null,
      route = '',
      session_id = ''
    } = body;

    // coleta ip/ua de cabeçalhos (edge-friendly)
    const ip =
      (req.headers['x-forwarded-for']?.split(',')[0] || '').trim() ||
      req.headers['x-real-ip'] ||
      req.headers['cf-connecting-ip'] ||
      '';
    const ua = req.headers['user-agent'] || '';

    // pequenos limites de tamanho
    const crop = (v, n) => (typeof v === 'string' ? v.slice(0, n) : v);

    const row = {
      ts: new Date().toISOString(),
      usuario_id,
      session_id: crop(session_id, 120),
      route: crop(route, 300),
      category: crop(category, 50),
      name: crop(name, 100),
      props: (props && typeof props === 'object') ? props : { value: props },
      ip: crop(String(ip), 120),
      ua: crop(String(ua), 300)
    };

    const { data, error } = await supabase
      .from('eventos')
      .insert([row])
      .select('id')
      .single();

    if (error) throw error;

    return res.status(201).json({ success: true, id: data.id });
  } catch (err) {
    console.error('Erro /api/events:', err);
    return res.status(500).json({ success: false, mensagem: err.message || 'Erro interno' });
  }
}

// api/events.js
import { supabase } from './utils/supabaseClient.js';
import { applyCors, handlePreflight } from './utils/cors.js';

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, mensagem: 'Método não permitido' });
  }

  // 🔒 Body robusto: só faz JSON.parse se for string
  let body = req.body;
  if (body == null || typeof body === 'string') {
    try {
      body = body ? JSON.parse(body) : {};
    } catch {
      return res.status(400).json({ success: false, mensagem: 'Invalid JSON' });
    }
  }

  const { name, props = {}, uid = null } = body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ success: false, mensagem: 'Informe o campo "name" (string).' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    null;
  const ua = req.headers['user-agent'] || null;

  const { error } = await supabase
    .from('eventos')
    .insert([{ name, props, ip, ua, uid }]);

  if (error) {
    return res.status(500).json({ success: false, mensagem: error.message });
  }

  return res.status(200).json({ success: true });
}

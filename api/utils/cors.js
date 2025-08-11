// api/utils/cors.js  (ESM)

const ALLOWED_ORIGINS = [
  'https://raspamaster.site',
  'http://localhost:5173',
  'http://localhost:3000',
];

// Canonical
export function applyCors(req, res) {
  const origin = req.headers.origin || '';
  const allowExact = ALLOWED_ORIGINS.includes(origin);

  if (allowExact) {
    // reflete a origem (apenas UM valor)
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    // usa "*" sem credenciais
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Accept, Origin'
  );
}

// Canonical
export function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') {
    applyCors(req, res);
    res.statusCode = 204; // No Content
    res.end();
    return true;
  }
  return false;
}

// 🔁 Aliases para compatibilidade com código antigo
export const applyCORS = applyCors;
export const handleOPTIONS = handlePreflight;

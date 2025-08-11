// api/utils/cors.js
export const ALLOWED_ORIGINS = [
  'https://raspamaster.site',
  'http://localhost:5173',
  'http://localhost:3000',
];

export function applyCORS(req, res) {
  const origin = req.headers.origin || '';
  const allowExact = ALLOWED_ORIGINS.includes(origin);

  if (allowExact) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    // Sem credenciais quando usar "*"
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Accept, Origin'
  );
}

export function handleOPTIONS(req, res) {
  if (req.method === 'OPTIONS') {
    applyCORS(req, res);
    return res.status(204).end();
  }
  return false;
}

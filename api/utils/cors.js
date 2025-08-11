// api/utils/cors.js
const ALLOWED_ORIGINS = [
  'https://raspamaster.site',
  'http://localhost:5173',
  'http://localhost:3000',
];

export function applyCORS(req, res) {
  const origin = req.headers.origin || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin);

  // 1 origem exata OU wildcard — nunca lista!
  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');       // para caches/CDN
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
    // com "*" não use Allow-Credentials
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
    res.statusCode = 204; // sem corpo
    res.end();
    return true;
  }
  return false;
}

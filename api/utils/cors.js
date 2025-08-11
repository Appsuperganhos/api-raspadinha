// api/utils/cors.js
export function applyCors(res, origin = 'https://raspamaster.site') {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', origin); // ou '*'
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Accept');
}

export function handlePreflight(req, res, origin = 'https://raspamaster.site') {
  applyCors(res, origin);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true; // já respondeu o preflight
  }
  return false;
}

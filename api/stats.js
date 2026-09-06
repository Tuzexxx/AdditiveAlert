// In-memory cache for serverless warm execution, initialized with curated baseline data
const GLOBAL_BASELINE = {
  E250: 1842, // Dusitan sodný
  E450: 1430, // Difosforečnany
  E951: 1285, // Aspartam
  E102: 940,  // Tartrazin
  E211: 820,  // Benzoan sodný
  E110: 670,  // Žluť SY
  E124: 510,  // Košenilová červeň
  E150D: 1620, // Amoniak-sulfitový karamel
  E330: 3200, // Kyselina citronová
  E300: 2900, // Kyselina askorbová (Vitamín C)
  E100: 2100, // Kurkumin
  E331: 1750, // Citronany sodné
  E471: 1320, // Mono- a diglyceridy
  E407: 860,  // Karagenan
  E621: 1180, // Glutaman sodný
};

// Global in-memory counter instance
const globalCounters = { ...GLOBAL_BASELINE };

export default async function handler(req, res) {
  // Allow cross-origin if needed
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          // ignore
        }
      }
      const { items } = body || {};
      if (Array.isArray(items)) {
        items.forEach((id) => {
          if (id && typeof id === 'string') {
            const cleanId = id.toUpperCase().replace(/\s/g, '');
            globalCounters[cleanId] = (globalCounters[cleanId] || 0) + 1;
          }
        });
      }
      return res.status(200).json({ success: true, updated: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET: Return current global stats
  return res.status(200).json({
    success: true,
    stats: globalCounters,
  });
}

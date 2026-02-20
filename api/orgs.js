import { createClient } from '@supabase/supabase-js';

// Use service key if available (set in Vercel env vars), fall back to anon key
// Anon key works because RLS has a SELECT policy for all users
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZnRsa2Z2dGdsbnVneHN5amNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NDAxODUsImV4cCI6MjA2MzIxNjE4NX0.9Cn1xahmF8q6pbbWQHNyQSc9fZkVvJaqTzMRZCtmb9E';
const supabase = createClient(
  'https://kwftlkfvtglnugxsyjci.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Supabase default limit is 1000, we need all ~1711 rows
    // Fetch in pages of 1000
    let allRows = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('dashboard_organisers')
        .select('*')
        .range(from, from + pageSize - 1)
        .order('id', { ascending: true });

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: error.message });
      }

      allRows = allRows.concat(data);

      if (data.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
      }
    }

    // Transform column names back to match the original JSON keys
    // the build script expects
    const transformed = allRows.map(row => ({
      organizer: row.organizer,
      country: row.country,
      tier: row.tier,
      stage: row.stage,
      type: row.type,
      event_ex: row.event_ex,
      t23: row.t23, t24: row.t24, t25: row.t25, t26: row.t26,
      m23: row.m23, m24: row.m24, m25: row.m25, m26: row.m26,
      s23: row.s23, s24: row.s24, s25: row.s25, s26: row.s26,
      tt: row.tt, tm: row.tm, ts: row.ts,
      tyoy24: row.tyoy24, myoy24: row.myoy24,
      tyoy25: row.tyoy25, myoy25: row.myoy25,
      tags: row.tags,
      sg: row.sg, sgp: row.sgp, rp: row.rp,
      gt: row.gt, rs: row.rs, ps: row.ps,
      sr: row.sr, nba: row.nba, lc: row.lc
    }));

    return res.status(200).json(transformed);
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

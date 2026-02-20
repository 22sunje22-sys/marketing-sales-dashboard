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
    // Supabase default limit is 1000, we need all ~11300 rows
    // Fetch in pages of 1000
    let allRows = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('dashboard_events')
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

    // Transform column names to match original JSON keys the build script expects
    // DB: event_id → JSON: id; DB: rev → JSON: rev; DB: mkt → JSON: mkt; DB: share → JSON: share
    const transformed = allRows.map(row => ({
      org: row.org,
      name: row.name,
      country: row.country,
      type: row.type,
      id: row.event_id,
      date: row.date,
      year: row.year,
      rev: row.rev,
      mkt: row.mkt,
      share: row.share
    }));

    return res.status(200).json(transformed);
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

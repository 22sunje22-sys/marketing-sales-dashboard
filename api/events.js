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
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch all ~11300 events in parallel pages of 5000
    // Supabase allows up to 50000 rows with explicit limit
    const pageSize = 5000;
    const totalEstimate = 12000;
    const pages = Math.ceil(totalEstimate / pageSize);

    const promises = [];
    for (let i = 0; i < pages; i++) {
      promises.push(
        supabase
          .from('dashboard_events')
          .select('org,name,country,type,event_id,date,year,rev,mkt,share')
          .range(i * pageSize, (i + 1) * pageSize - 1)
          .order('id', { ascending: true })
      );
    }

    const results = await Promise.all(promises);

    let allRows = [];
    for (const { data, error } of results) {
      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: error.message });
      }
      if (data) allRows = allRows.concat(data);
    }

    // Transform column names to match original JSON keys
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

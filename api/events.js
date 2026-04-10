import { createClient } from '@supabase/supabase-js';

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZnRsa2Z2dGdsbnVneHN5amNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NDAxODUsImV4cCI6MjA2MzIxNjE4NX0.9Cn1xahmF8q6pbbWQHNyQSc9fZkVvJaqTzMRZCtmb9E';
const supabase = createClient(
  'https://kwftlkfvtglnugxsyjci.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const orgParam = typeof req.query?.org === 'string' ? req.query.org.trim() : '';

    // Org-specific lookup: query raw table for individual event rows
    if (orgParam) {
      const requestedLimit = parseInt(req.query?.limit, 10);
      const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 3000)
        : 2000;
      const pattern = `%${orgParam.replace(/[-\s]+/g, '%')}%`;
      const { data, error } = await supabase
        .from('dashboard_events')
        .select('id,org,name,country,type,event_id,date,year,rev,mkt,share')
        .ilike('org', pattern)
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Events fetch error:', error.message);
        return res.status(500).json({ error: error.message });
      }

      const rows = data || [];
      return res.status(200).json(rows.map(row => ({
        org: row.org, name: row.name, country: row.country, type: row.type,
        id: row.event_id, date: row.date, year: row.year,
        rev: row.rev, mkt: row.mkt, share: row.share
      })));
    }

    // Full load: single RPC call — bypasses REST row limit, returns full materialized view (~30k rows)
    const { data: allRows, error: rpcError } = await supabase.rpc('get_events_monthly');
    if (rpcError) {
      console.error('Events RPC error:', rpcError.message);
      return res.status(500).json({ error: rpcError.message });
    }

    return res.status(200).json(allRows.map(row => ({
      org: row.org, name: row.name, country: row.country, type: row.type,
      id: row.event_id, date: row.date, year: row.year,
      rev: row.rev, mkt: row.mkt, share: row.share
    })));
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

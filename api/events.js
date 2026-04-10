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

    // Full load: offset pagination over aggregated monthly view
    // dashboard_events_monthly groups raw rows by (event_id, month) — ~29k rows total vs 151k raw
    const pageSize = 1000;
    const maxPages = 40;
    let allRows = [];

    for (let i = 0; i < maxPages; i++) {
      const { data, error } = await supabase
        .from('dashboard_events_monthly')
        .select('id,org,name,country,type,event_id,date,year,rev,mkt,share')
        .order('year', { ascending: true })
        .order('date', { ascending: true })
        .order('event_id', { ascending: true })
        .range(i * pageSize, (i + 1) * pageSize - 1);

      if (error) {
        console.error('Events fetch error:', error.message);
        return res.status(500).json({ error: error.message });
      }

      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
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

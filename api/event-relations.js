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
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const pageSize = 1000;
    const maxPages = 200;
    let lastEventId = 0;
    let allRows = [];

    for (let i = 0; i < maxPages; i += 1) {
      let query = supabase
        .from('event_relational_db')
        .select('event_id,sales_manager,event_manager,event_organiser,updated_at')
        .order('event_id', { ascending: true })
        .limit(pageSize);

      if (lastEventId > 0) query = query.gt('event_id', lastEventId);
      const { data, error } = await query;

      if (error) {
        console.error('Event relations fetch error:', error.message);
        return res.status(500).json({ error: error.message });
      }

      const chunk = data || [];
      if (!chunk.length) break;
      allRows = allRows.concat(chunk);
      if (chunk.length < pageSize) break;
      const nextLastEventId = Number(chunk[chunk.length - 1]?.event_id || 0);
      if (!Number.isFinite(nextLastEventId) || nextLastEventId <= lastEventId) break;
      lastEventId = nextLastEventId;
    }

    return res.status(200).json(allRows);
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

import { createClient } from '@supabase/supabase-js';

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZnRsa2Z2dGdsbnVneHN5amNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NDAxODUsImV4cCI6MjA2MzIxNjE4NX0.9Cn1xahmF8q6pbbWQHNyQSc9fZkVvJaqTzMRZCtmb9E';
const supabase = createClient(
  'https://kwftlkfvtglnugxsyjci.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('dashboard_visits')
        .select('id,user_id,user_name,created_at,user_agent,screen_width,screen_height')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data || []);
    } catch (_) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { user_id, user_name, user_agent, screen_width, screen_height } = req.body || {};
      if (!user_id || !user_name) {
        return res.status(400).json({ error: 'user_id and user_name are required' });
      }
      const { data, error } = await supabase
        .from('dashboard_visits')
        .insert([{
          user_id,
          user_name,
          user_agent: user_agent || null,
          screen_width: screen_width || null,
          screen_height: screen_height || null
        }])
        .select();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data?.[0] || {});
    } catch (_) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

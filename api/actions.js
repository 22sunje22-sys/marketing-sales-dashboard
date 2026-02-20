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

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET — fetch all actions (with optional user filter)
  if (req.method === 'GET') {
    try {
      let query = supabase
        .from('dashboard_org_actions')
        .select('id,org,action,user_name,note,created_at')
        .order('created_at', { ascending: false })
        .limit(5000);

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data || []);
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST — log a new action
  if (req.method === 'POST') {
    try {
      const { org, action, user_name, note } = req.body;
      if (!org || !user_name) {
        return res.status(400).json({ error: 'org and user_name are required' });
      }

      const { data, error } = await supabase
        .from('dashboard_org_actions')
        .insert([{
          org: org,
          action: action || 'worked_on',
          user_name: user_name,
          note: note || null
        }])
        .select();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data[0]);
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

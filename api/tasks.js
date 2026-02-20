export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ASANA_PAT = process.env.ASANA_PAT;
  if (!ASANA_PAT) {
    return res.status(500).json({ error: 'Asana integration not configured. Please set ASANA_PAT env variable.' });
  }

  const PROJECT_GID = '1206440808700841'; // 📢Marketing sales

  try {
    const { title, notes, assignee, due_on, created_by } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const taskData = {
      data: {
        name: title,
        notes: (notes || '') + (created_by ? `\n\nCreated via Dashboard by ${created_by}` : ''),
        projects: [PROJECT_GID],
      }
    };
    if (assignee) taskData.data.assignee = assignee;
    if (due_on) taskData.data.due_on = due_on;

    const asanaRes = await fetch('https://app.asana.com/api/1.0/tasks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ASANA_PAT}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(taskData)
    });

    const asanaData = await asanaRes.json();
    if (!asanaRes.ok) {
      const errMsg = asanaData.errors ? asanaData.errors.map(e => e.message).join(', ') : 'Asana API error';
      return res.status(asanaRes.status).json({ error: errMsg });
    }

    return res.status(201).json({
      gid: asanaData.data.gid,
      name: asanaData.data.name,
      permalink_url: asanaData.data.permalink_url || `https://app.asana.com/0/${PROJECT_GID}/${asanaData.data.gid}`
    });
  } catch (err) {
    console.error('Asana task creation error:', err);
    return res.status(500).json({ error: 'Failed to create Asana task' });
  }
}

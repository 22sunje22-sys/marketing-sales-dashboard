const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const FILE = '/Users/alexanderyutkin/Downloads/Paid Marketing Services Share  - organisers (UAE_KSA_Bahrain).xlsx';
const SB_URL = 'https://kwftlkfvtglnugxsyjci.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZnRsa2Z2dGdsbnVneHN5amNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzY0MDE4NSwiZXhwIjoyMDYzMjE2MTg1fQ.YIAjhOjctWouBNL8OI_Q3efawdVf7ikl-LvnFQGYHT4';

const sb = createClient(SB_URL, SB_KEY);

const num = (v) => {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const text = (v) => (v == null ? '' : String(v).trim());

function monthCodeToParts(v) {
  const s = text(v).replace(/\.0+$/, '');
  const m = s.match(/^(\d{4})(\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  const mm = String(mo).padStart(2, '0');
  return { year: String(y), key: `${y}-${mm}`, date: `${y}-${mm}-01` };
}

function lcKey(v) {
  return text(v).toLowerCase().replace(/\s+/g, ' ');
}

async function fetchAll(table, columns = '*') {
  let from = 0;
  const out = [];
  while (true) {
    const { data, error } = await sb.from(table).select(columns).range(from, from + 999).order('id', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    from += 1000;
  }
  return out;
}

async function chunkInsert(table, rows, size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    const { error } = await sb.from(table).insert(batch);
    if (error) throw new Error(`${table} insert failed at chunk ${i / size}: ${error.message}`);
    process.stdout.write(`\r${table}: inserted ${Math.min(i + size, rows.length)}/${rows.length}`);
  }
  process.stdout.write('\n');
}

function buildEventRows(rows) {
  const header = rows[4] || [];
  const monthCols = [];
  for (let i = 14; i <= 51; i++) {
    const parts = monthCodeToParts(header[i]);
    if (!parts) continue;
    monthCols.push({ tCol: i, mCol: i + 39, ...parts });
  }

  const out = [];
  for (let r = 5; r < rows.length; r++) {
    const row = rows[r] || [];
    const orgRaw = text(row[3]);
    const orgSumUp = text(row[13]);
    const org = orgSumUp || orgRaw;
    const name = text(row[4]);
    const country = text(row[5]);
    const eventIdRaw = row[6];
    const attraction = row[7] === true;

    if (!org && !name && (eventIdRaw == null || eventIdRaw === '')) continue;
    if (!country) continue;

    const eventId = eventIdRaw == null || eventIdRaw === '' ? null : text(eventIdRaw);
    const type = attraction ? 'Attraction' : 'Event';

    for (const m of monthCols) {
      const rev = num(row[m.tCol]);
      const mkt = num(row[m.mCol]);
      if (rev === 0 && mkt === 0) continue;
      out.push({
        org,
        name,
        country,
        type,
        event_id: eventId,
        date: m.date,
        year: m.year,
        rev,
        mkt,
        share: rev > 0 ? mkt / rev : 0,
      });
    }
  }

  return out;
}

function normalizeCountryMonth(rows, targets) {
  const byKey = new Map();
  for (const r of rows) {
    const key = `${text(r.country)}||${text(r.date).slice(0, 7)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  }

  for (const [country, months] of Object.entries(targets)) {
    for (const [mk, exp] of Object.entries(months)) {
      const key = `${country}||${mk}`;
      const bucket = byKey.get(key) || [];
      if (!bucket.length) continue;

      const eventRows = bucket.filter((r) => text(r.type).toLowerCase() === 'event');
      const sumRev = eventRows.reduce((s, r) => s + num(r.rev), 0);
      if (eventRows.length && Number.isFinite(exp.rev)) {
        if (sumRev > 0) {
          const f = exp.rev / sumRev;
          eventRows.forEach((r) => { r.rev = num(r.rev) * f; });
        } else if (exp.rev > 0) {
          eventRows[0].rev = exp.rev;
        }
      }

      const sumMkt = eventRows.reduce((s, r) => s + num(r.mkt), 0);
      if (Number.isFinite(exp.mkt)) {
        if (sumMkt > 0) {
          const f = exp.mkt / sumMkt;
          eventRows.forEach((r) => { r.mkt = num(r.mkt) * f; });
        } else if (exp.mkt > 0) {
          if (eventRows.length) eventRows[0].mkt = exp.mkt;
        }
      }

      bucket.forEach((r) => {
        const rv = num(r.rev);
        const mv = num(r.mkt);
        r.share = rv > 0 ? mv / rv : 0;
      });
    }
  }
}

function buildEventAggByOrganizer(eventRows) {
  const out = {};
  for (const e of eventRows) {
    if (text(e.type).toLowerCase() !== 'event') continue;
    const org = lcKey(e.org);
    if (!org) continue;
    const y = Number(text(e.year) || text(e.date).slice(0, 4));
    if (!out[org]) out[org] = { t23: 0, m23: 0, t24: 0, m24: 0, t25: 0, m25: 0, t26: 0, m26: 0 };
    if (y === 2023) { out[org].t23 += num(e.rev); out[org].m23 += num(e.mkt); }
    if (y === 2024) { out[org].t24 += num(e.rev); out[org].m24 += num(e.mkt); }
    if (y === 2025) { out[org].t25 += num(e.rev); out[org].m25 += num(e.mkt); }
    if (y === 2026) { out[org].t26 += num(e.rev); out[org].m26 += num(e.mkt); }
  }
  return out;
}

function buildOrganiserRows(rows, oldByOrg, eventAggByOrg) {
  const out = [];
  for (let r = 4; r < rows.length; r++) {
    const row = rows[r] || [];
    const organizer = text(row[3]);
    if (!organizer) continue;

    const old = oldByOrg.get(lcKey(organizer)) || null;

    const tier = text(row[0]) || null;
    const stage = text(row[1]) || null;
    const rawType = text(row[2]);
    const type = rawType || (row[8] === true ? 'Attraction' : 'Event');
    const country = text(row[7]) || null;
    const event_ex = text(row[6]) || null;

    const evAgg = eventAggByOrg[lcKey(organizer)] || { t23: 0, m23: 0, t24: 0, m24: 0, t25: 0, m25: 0, t26: 0, m26: 0 };
    const t23 = num(evAgg.t23);
    const m23 = num(evAgg.m23);
    const t24 = num(evAgg.t24);
    const m24 = num(evAgg.m24);
    const t25 = num(evAgg.t25);
    const m25 = num(evAgg.m25);
    const t26 = num(evAgg.t26);
    const m26 = num(evAgg.m26);

    const s23 = t23 > 0 ? (m23 / t23) * 100 : 0;
    const s24 = t24 > 0 ? (m24 / t24) * 100 : 0;
    const s25 = t25 > 0 ? (m25 / t25) * 100 : 0;
    const s26 = t26 > 0 ? (m26 / t26) * 100 : 0;

    const tt = t23 + t24 + t25 + t26;
    const tm = m23 + m24 + m25 + m26;
    const ts = tt > 0 ? (tm / tt) * 100 : 0;

    const tyoy24 = t23 > 0 ? ((t24 - t23) / t23) * 100 : null;
    const myoy24 = m23 > 0 ? ((m24 - m23) / m23) * 100 : null;
    const tyoy25 = t24 > 0 ? ((t25 - t24) / t24) * 100 : null;
    const myoy25 = m24 > 0 ? ((m25 - m24) / m24) * 100 : null;

    const sg = old?.sg ?? Math.max(0, 5 - ts);
    const sgp = old?.sgp ?? 5;
    const rp = old?.rp ?? Math.max(0, (tt * sg) / 100);
    const rs = old?.rs ?? (ts === 0 && tt > 0 ? 20 : 0);
    const ps = old?.ps ?? Math.min(95, Math.max(30, Math.round((rp > 0 ? 55 : 35) + (tt > 10000000 ? 20 : 0) + (tm === 0 && tt > 0 ? 15 : 0))));
    const sr = old?.sr ?? (ps >= 80 ? 'hot' : ps >= 60 ? 'warm' : 'cold');
    const lc = old?.lc ?? (tm <= 0 && tt > 0 ? 'untapped' : (myoy25 != null && myoy25 >= 20 ? 'growth' : 'active'));
    const nba = old?.nba ?? (tm <= 0 && tt > 0 ? 'Pitch performance starter package this week' : 'Monitor — maintain relationship');

    out.push({
      organizer,
      country,
      tier,
      stage,
      type,
      event_ex,
      t23,
      m23,
      t24,
      m24,
      t25,
      m25,
      t26,
      m26,
      s23,
      s24,
      s25,
      s26,
      tt,
      tm,
      ts,
      tyoy24,
      myoy24,
      tyoy25,
      myoy25,
      tags: old?.tags ?? null,
      sg,
      sgp,
      rp,
      gt: old?.gt ?? null,
      rs,
      ps,
      sr,
      nba,
      lc,
    });
  }
  return out;
}

function parseCountriesRawTargets(rows) {
  const monthCols = [];
  const hdr = rows[1] || [];
  for (let i = 4; i <= 41; i++) {
    const parts = monthCodeToParts(hdr[i]);
    if (parts) monthCols.push({ col: i, key: parts.key });
  }

  const wantedCountries = new Set(['United Arab Emirates', 'Bahrain', 'Saudi Arabia', 'Oman', 'Qatar']);
  const targets = {};

  // Canonical data block is in the upper section of Countries RAW.
  // Ignore lower helper/diagnostic blocks that can contain duplicate labels.
  const MAX_CANONICAL_ROW = 24; // 1-based row 24 is already below primary country metrics
  for (let r = 2; r < rows.length && r < MAX_CANONICAL_ROW; r++) {
    const row = rows[r] || [];
    const country = text(row[0]);
    const metric = text(row[1]).toLowerCase();
    if (!wantedCountries.has(country) || !metric) continue;

    const isTicket = metric.includes('ticketing (only events, not attractions)');
    const isMkt = metric === 'marketing (events)' || metric === 'marketing';
    if (!isTicket && !isMkt) continue;

    for (const m of monthCols) {
      const v = num(row[m.col]);
      if (!targets[country]) targets[country] = {};
      if (!targets[country][m.key]) targets[country][m.key] = { rev: 0, mkt: 0 };
      if (isTicket) targets[country][m.key].rev = v;
      if (isMkt) targets[country][m.key].mkt = v;
    }
  }

  return targets;
}

function aggregateCountryMonth(rows) {
  const agg = {};
  for (const e of rows) {
    const d = text(e.date);
    const key = d.slice(0, 7);
    const country = text(e.country);
    if (!country || !key) continue;
    if (!agg[country]) agg[country] = {};
    if (!agg[country][key]) agg[country][key] = { rev: 0, mkt: 0 };
    if (text(e.type).toLowerCase() === 'event') agg[country][key].rev += num(e.rev);
    agg[country][key].mkt += num(e.mkt);
  }
  return agg;
}

async function main() {
  console.log('Reading workbook...');
  const wb = XLSX.readFile(FILE, { cellDates: false });
  const evRowsRaw = XLSX.utils.sheet_to_json(wb.Sheets['Pre dashboard (events)'], { header: 1, raw: true, defval: null });
  const orgRowsRaw = XLSX.utils.sheet_to_json(wb.Sheets['Pre dashboard (organisers)'], { header: 1, raw: true, defval: null });
  const crRowsRaw = XLSX.utils.sheet_to_json(wb.Sheets['Countries RAW'], { header: 1, raw: true, defval: null });

  const eventRows = buildEventRows(evRowsRaw);
  const expectedCountry = parseCountriesRawTargets(crRowsRaw);
  normalizeCountryMonth(eventRows, expectedCountry);
  const eventAggByOrg = buildEventAggByOrganizer(eventRows);
  console.log('Prepared dashboard_events rows:', eventRows.length);

  const oldOrgs = await fetchAll('dashboard_organisers', 'organizer,tags,sg,sgp,rp,gt,rs,ps,sr,nba,lc');
  const oldByOrg = new Map(oldOrgs.map((o) => [lcKey(o.organizer), o]));

  const organiserRows = buildOrganiserRows(orgRowsRaw, oldByOrg, eventAggByOrg);
  console.log('Prepared dashboard_organisers rows:', organiserRows.length);

  console.log('Deleting old dashboard_events...');
  {
    const { error } = await sb.from('dashboard_events').delete().gt('id', 0);
    if (error) throw error;
  }
  await chunkInsert('dashboard_events', eventRows, 500);

  console.log('Deleting old dashboard_organisers...');
  {
    const { error } = await sb.from('dashboard_organisers').delete().gt('id', 0);
    if (error) throw error;
  }
  await chunkInsert('dashboard_organisers', organiserRows, 500);

  console.log('Running validation...');
  const dbEvents = await fetchAll('dashboard_events', 'country,type,date,rev,mkt');
  const dbOrgs = await fetchAll('dashboard_organisers', 'organizer,t23,m23,t24,m24,t25,m25,t26,m26,tt,tm,ts');

  const gotCountry = aggregateCountryMonth(dbEvents);

  let cmChecked = 0;
  let cmMismatch = 0;
  const cmSamples = [];
  for (const [country, months] of Object.entries(expectedCountry)) {
    for (const [mk, exp] of Object.entries(months)) {
      cmChecked++;
      const got = gotCountry[country]?.[mk] || { rev: 0, mkt: 0 };
      const rd = Math.abs(got.rev - exp.rev);
      const md = Math.abs(got.mkt - exp.mkt);
      if (rd > 0.01 || md > 0.01) {
        cmMismatch++;
        if (cmSamples.length < 10) cmSamples.push({ country, month: mk, revDiff: rd, mktDiff: md, got, exp });
      }
    }
  }

  const srcOrgByName = new Map();
  for (let r = 4; r < orgRowsRaw.length; r++) {
    const row = orgRowsRaw[r] || [];
    const name = text(row[3]);
    if (!name) continue;
    srcOrgByName.set(lcKey(name), {
      t23: num(row[9]), m23: num(row[10]), t24: num(row[11]), m24: num(row[12]),
      t25: num(row[13]), m25: num(row[14]), t26: num(row[15]), m26: num(row[16])
    });
  }

  let orgChecked = 0;
  let orgMismatch = 0;
  const orgSamples = [];
  for (const o of dbOrgs) {
    const src = srcOrgByName.get(lcKey(o.organizer));
    if (!src) continue;
    orgChecked++;
    const fields = ['t23', 'm23', 't24', 'm24', 't25', 'm25', 't26', 'm26'];
    let bad = false;
    const deltas = {};
    for (const f of fields) {
      const d = Math.abs(num(o[f]) - num(src[f]));
      if (d > 0.01) { bad = true; deltas[f] = d; }
    }
    if (bad) {
      orgMismatch++;
      if (orgSamples.length < 10) orgSamples.push({ organizer: o.organizer, deltas });
    }
  }

  console.log('\n=== RESULT ===');
  console.log(JSON.stringify({
    dashboard_events_rows: dbEvents.length,
    dashboard_organisers_rows: dbOrgs.length,
    country_month_checked: cmChecked,
    country_month_mismatch: cmMismatch,
    country_month_samples: cmSamples,
    organisers_checked: orgChecked,
    organisers_mismatch: orgMismatch,
    organisers_samples: orgSamples,
  }, null, 2));
}

main().catch((e) => {
  console.error('SYNC FAILED', e);
  process.exit(1);
});

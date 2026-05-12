// ============================================
// MOTRACKER v2 - app.js
// ============================================

const SUPABASE_URL = 'https://fwqhomgawlgicqiqqqhw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kv4yP6HjULXzFd085xnyQQ_q98QohZs';

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

// ============================================
// Supabase REST helpers
// ============================================

async function sbGet(table, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GET ${table}: ${res.status}`);
  return res.json();
}

async function sbPost(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`POST ${table}: ${res.status}`);
  return res.json();
}

async function sbPatch(table, query, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`PATCH ${table}: ${res.status}`);
  return res.json();
}

async function sbDelete(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers
  });
  if (!res.ok) throw new Error(`DELETE ${table}: ${res.status}`);
  return true;
}

window.sb = { get: sbGet, post: sbPost, patch: sbPatch, delete: sbDelete };

// ============================================
// Tab switching
// ============================================

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === btn));
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === `tab-${target}`);
    });
  });
});

// ============================================
// Connection test + render settings
// ============================================

async function loadSettings() {
  const statusEl = document.getElementById('connStatus');
  const listEl = document.getElementById('settingsList');

  try {
    const rows = await sbGet('settings', 'select=*&order=key.asc');
    statusEl.textContent = '🟢';
    statusEl.title = `Connected — ${rows.length} settings loaded`;

    listEl.innerHTML = rows.map(r => `
      <div class="setting-row">
        <span class="setting-key">${r.key}</span>
        <span class="setting-value">${r.value}</span>
      </div>
    `).join('');

    if (!rows.length) {
      listEl.innerHTML = '<p class="placeholder">No settings rows found.</p>';
    }
  } catch (err) {
    statusEl.textContent = '🔴';
    statusEl.title = `Connection failed: ${err.message}`;
    listEl.innerHTML = `<p class="placeholder" style="color: var(--err)">${err.message}</p>`;
    console.error(err);
  }
}

loadSettings();

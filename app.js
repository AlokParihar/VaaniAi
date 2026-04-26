const GROQ_KEY = 'YOUR_GROQ_KEY_HERE';
const DB_URL = 'https://vaaniai-1df57-default-rtdb.firebaseio.com';
const ADMIN_PASSWORD = 'vaaniai123';

function isAdmin() {
  return localStorage.getItem('isAdmin') === 'true';
}

async function submitComplaint() {
  const name = document.getElementById('name').value.trim();
  const location = document.getElementById('location').value.trim();
  const description = document.getElementById('description').value.trim();

  if (!name || !location || !description) {
    alert('Please fill all fields!');
    return;
  }

  const btn = document.querySelector('button');
  btn.textContent = 'AI Analyzing...';
  btn.disabled = true;
  document.getElementById('loadingOverlay').classList.add('show');

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{
          role: 'user',
          content: `You are a grievance classification AI for Indian citizens.
Analyze this complaint and return ONLY a JSON object, no extra text, no backticks:
{
  "category": "one of: Road/Water/Electricity/Sanitation/Healthcare/Education/Other",
  "priority": "one of: High/Medium/Low",
  "summary": "one line summary in English"
}
Complaint by ${name} from ${location}: ${description}`
        }],
        temperature: 0.3
      })
    });

    const data = await response.json();
    const raw = data.choices[0].message.content.trim();
    const result = JSON.parse(raw);
    await saveComplaint(name, location, description, result);
    showResult(name, location, description, result);

  } catch(err) {
    alert('Error: ' + err.message);
  }

  btn.textContent = 'Submit Complaint ➜';
  btn.disabled = false;
  document.getElementById('loadingOverlay').classList.remove('show');
}

async function saveComplaint(name, location, description, result) {
  const complaint = {
    id: Date.now(),
    name, location, description,
    category: result.category,
    priority: result.priority,
    summary: result.summary,
    status: 'Pending',
    date: new Date().toLocaleDateString()
  };

  await fetch(`${DB_URL}/complaints.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(complaint)
  });
}

async function loadComplaints() {
  const res = await fetch(`${DB_URL}/complaints.json`);
  const data = await res.json();
  const list = document.getElementById('complaints-list');

  if (!data) {
    list.innerHTML = '<p style="color:#999;font-size:14px;">No complaints yet.</p>';
    updateDashboard([]);
    return;
  }

  const complaints = Object.entries(data).map(([key, val]) => ({ ...val, _key: key }));
  complaints.reverse();
  renderComplaints(complaints);
  updateDashboard(complaints);
}

function renderComplaints(complaints) {
  const list = document.getElementById('complaints-list');

  if (complaints.length === 0) {
    list.innerHTML = '<p style="color:#999;font-size:14px;">No complaints found.</p>';
    return;
  }

  list.innerHTML = complaints.map(c => {
    const status = c.status || 'Pending';
    const statusClass = status.replace(' ', '-');
    const adminControls = isAdmin() ? `
      <button class="status-btn ${statusClass}" onclick="updateStatus('${c._key}', '${status}')">
        ${status}
      </button>
      <button class="delete-btn" onclick="deleteComplaint('${c._key}')">🗑 Delete</button>
    ` : `<span class="status-btn ${statusClass}">${status}</span>`;

    return `
      <div class="complaint-item">
        <div class="complaint-info">
          <strong>${c.name} — ${c.category}</strong>
          <p>📍 ${c.location} &nbsp;|&nbsp; 📅 ${c.date}</p>
          <p>${c.summary}</p>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
          <span class="priority-badge ${c.priority}">${c.priority}</span>
          ${adminControls}
        </div>
      </div>
    `;
  }).join('');
}

async function updateStatus(key, current) {
  if (!isAdmin()) return;
  const next = current === 'Pending' ? 'In Progress' : current === 'In Progress' ? 'Resolved' : 'Pending';
  await fetch(`${DB_URL}/complaints/${key}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: next })
  });
  loadComplaints();
}

async function deleteComplaint(key) {
  if (!isAdmin()) return;
  if (confirm('Delete this complaint?')) {
    await fetch(`${DB_URL}/complaints/${key}.json`, { method: 'DELETE' });
    loadComplaints();
  }
}

function updateDashboard(complaints) {
  document.getElementById('total').textContent = complaints.length;
  document.getElementById('high').textContent = complaints.filter(c => c.priority === 'High').length;
  document.getElementById('medium').textContent = complaints.filter(c => c.priority === 'Medium').length;
  document.getElementById('low').textContent = complaints.filter(c => c.priority === 'Low').length;

  const categories = ['Road', 'Water', 'Electricity', 'Sanitation', 'Healthcare', 'Education', 'Other'];
  const emojis = { Road:'🛣️', Water:'💧', Electricity:'⚡', Sanitation:'🗑️', Healthcare:'🏥', Education:'📚', Other:'📌' };
  const catGrid = document.getElementById('cat-grid');
  catGrid.innerHTML = categories.map(cat => {
    const count = complaints.filter(c => c.category === cat).length;
    return `
      <div class="cat-box">
        <span>${emojis[cat]} ${cat}</span>
        <span class="cat-count">${count}</span>
      </div>
    `;
  }).join('');
}

function filterComplaints() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const category = document.getElementById('filterCategory').value;
  const priority = document.getElementById('filterPriority').value;

  fetch(`${DB_URL}/complaints.json`)
    .then(res => res.json())
    .then(data => {
      if (!data) { renderComplaints([]); return; }
      let complaints = Object.entries(data).map(([key, val]) => ({ ...val, _key: key }));
      complaints = complaints.filter(c => {
        const matchSearch = c.name.toLowerCase().includes(search) || c.location.toLowerCase().includes(search);
        const matchCategory = category === 'all' || c.category === category;
        const matchPriority = priority === 'all' || c.priority === priority;
        return matchSearch && matchCategory && matchPriority;
      });
      renderComplaints(complaints.reverse());
    });
}

function showResult(name, location, description, result) {
  const colors = { High: '#ef4444', Medium: '#f59e0b', Low: '#10b981' };
  const main = document.querySelector('main');
  main.innerHTML = `
    <div class="form-card">
      <h2>✅ Complaint Received!</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Location:</strong> ${location}</p>
      <p><strong>Description:</strong> ${description}</p>
      <hr style="margin:16px 0;border:1px solid #eee;">
      <h3 style="margin-bottom:12px;">🤖 AI Analysis</h3>
      <p><strong>Category:</strong> ${result.category}</p>
      <p><strong>Priority:</strong> <span style="color:${colors[result.priority]};font-weight:700;">${result.priority}</span></p>
      <p><strong>Summary:</strong> ${result.summary}</p>
      <br>
      <button onclick="location.reload()">Submit Another ➜</button>
    </div>
  `;
  loadComplaints();
}

function exportCSV() {
  fetch(`${DB_URL}/complaints.json`)
    .then(res => res.json())
    .then(data => {
      if (!data) { alert('No complaints to export!'); return; }
      const complaints = Object.values(data);
      const headers = ['Name', 'Location', 'Category', 'Priority', 'Status', 'Summary', 'Date'];
      const rows = complaints.map(c => [c.name, c.location, c.category, c.priority, c.status || 'Pending', c.summary, c.date]);
      const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'VaaniAI_Complaints.csv';
      a.click();
    });
}

function adminLogin() {
  const pass = prompt('Enter admin password:');
  if (pass === ADMIN_PASSWORD) {
    localStorage.setItem('isAdmin', 'true');
    updateAdminUI();
    loadComplaints();
    alert('✅ Admin access granted!');
  } else {
    alert('❌ Wrong password!');
  }
}

function adminLogout() {
  localStorage.removeItem('isAdmin');
  updateAdminUI();
  loadComplaints();
}

function updateAdminUI() {
  const btn = document.getElementById('adminBtn');
  if (isAdmin()) {
    btn.textContent = '🔓 Admin Logout';
    btn.onclick = adminLogout;
    btn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
  } else {
    btn.textContent = '🔒 Admin Login';
    btn.onclick = adminLogin;
    btn.style.background = 'linear-gradient(135deg, #4f46e5, #7c3aed)';
  }
}

window.onload = () => {
  loadComplaints();
  updateAdminUI();
};
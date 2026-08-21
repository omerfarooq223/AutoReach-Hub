// Global error trap — surfaces any silent JS crash as a visible toast + console error
window.onerror = function(msg, src, line, col, err) {
  console.error(`[JS ERROR] ${msg} @ ${src}:${line}:${col}`, err);
  if (typeof showToast === 'function') {
    showToast(`JS Error: ${msg} (line ${line})`, 'error');
  }
  return false; // don't suppress further logging
};

// State Management
let appState = {
  contacts: [],
  columns: [],
  detected: {},
  activeTab: 'email',
  emailChannel: 'graph', // 'graph' or 'smtp'
  activePreviewIdx: 0,
  isSendingBatch: false,
  m365User: null,
  geminiKey: '',
  pollInterval: null,
  smtpConfig: {
    server: 'smtp.gmail.com',
    port: 587,
    username: '',
    password: '',
    from_name: 'Academic Dispatcher',
    reply_to: '',
    use_tls: true,
    use_ssl: false
  }
};

// --- Pre-baked inline SVGs for table hot-path (zero lucide.createIcons overhead) ---
const SVG = {
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  x: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  alertCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  msgCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  send: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  setupDropzone();
  checkM365Status();
  loadStoredSMTPSettings();
  loadStoredAIKey();
  restorePreviousState();
});

async function restorePreviousState() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    if (data.success && data.has_contacts) {
      onContactsLoaded(data);
      addLog(`[State] Restored previous session (${data.total_contacts} contacts loaded)`, 'info');
    }
  } catch (err) {
    console.error('Could not restore state', err);
  }
}


// --- Microsoft 365 Auth Flow ---

async function checkM365Status() {
  try {
    const res = await fetch('/api/graph/status');
    const data = await res.json();
    const pill = document.getElementById('m365-status-card');
    const text = document.getElementById('m365-status-text');

    if (data.authenticated && data.user) {
      appState.m365User = data.user;
      pill.className = 'auth-pill authenticated';
      text.innerText = `M365: ${data.user.displayName || data.user.email}`;
      showM365AuthView(data.user);
      addLog(`[M365] Connected as ${data.user.displayName} (${data.user.email})`, 'success');
    } else {
      appState.m365User = null;
      pill.className = 'auth-pill not-authenticated';
      text.innerText = 'Microsoft 365: Connect';
      showM365UnauthView();
    }
  } catch (err) {
    console.error('Failed to check M365 status', err);
  }
}

function openM365Modal() {
  const el = document.getElementById('m365-modal');
  el.classList.remove('hidden');
  lucide.createIcons({ root: el });
}

function closeM365Modal() {
  document.getElementById('m365-modal').classList.add('hidden');
  if (appState.pollInterval) {
    clearInterval(appState.pollInterval);
    appState.pollInterval = null;
  }
}

async function startDeviceLogin() {
  const btn = document.getElementById('btn-start-m365');
  btn.disabled = true;
  btn.innerText = 'Generating Code...';

  try {
    const res = await fetch('/api/graph/device-code', { method: 'POST' });
    const data = await res.json();

    if (!data.success || !data.flow) {
      showToast(data.error || 'Failed to start device flow', 'error');
      btn.disabled = false;
      btn.innerText = 'Generate Login Code';
      return;
    }

    const flow = data.flow;
    document.getElementById('m365-user-code').innerText = flow.user_code;
    document.getElementById('m365-login-link').href = flow.verification_uri;
    document.getElementById('device-code-display').classList.remove('hidden');
    btn.classList.add('hidden');

    addLog(`[M365] Device Code: ${flow.user_code}. Visit ${flow.verification_uri}`, 'info');

    // Start polling
    if (appState.pollInterval) clearInterval(appState.pollInterval);
    appState.pollInterval = setInterval(pollDeviceLogin, 3500);

  } catch (err) {
    showToast('Network error starting login', 'error');
    btn.disabled = false;
    btn.innerText = 'Generate Login Code';
  }
}

async function pollDeviceLogin() {
  try {
    const res = await fetch('/api/graph/poll-token', { method: 'POST' });
    const data = await res.json();

    if (data.status === 'success') {
      clearInterval(appState.pollInterval);
      appState.pollInterval = null;
      appState.m365User = data.user;
      showToast('Successfully authenticated with Microsoft 365!', 'success');
      addLog(`[M365] Login success: ${data.user?.displayName} (${data.user?.email})`, 'success');
      checkM365Status();
    } else if (data.status === 'error') {
      clearInterval(appState.pollInterval);
      appState.pollInterval = null;
      showToast(`Login failed: ${data.message}`, 'error');
      addLog(`[M365] Login error: ${data.message}`, 'error');
    }
  } catch (err) {
    console.error('Polling error', err);
  }
}

function copyDeviceCode() {
  const code = document.getElementById('m365-user-code').innerText;
  navigator.clipboard.writeText(code);
  showToast(`Copied code "${code}" to clipboard!`, 'success');
}

function showM365AuthView(user) {
  document.getElementById('m365-unauth-view').classList.add('hidden');
  document.getElementById('m365-auth-view').classList.remove('hidden');
  document.getElementById('auth-display-name').innerText = user.displayName || 'Authenticated User';
  document.getElementById('auth-email').innerText = user.email || '';
  // Icons already rendered in static HTML
}

function showM365UnauthView() {
  document.getElementById('m365-unauth-view').classList.remove('hidden');
  document.getElementById('m365-auth-view').classList.add('hidden');
  document.getElementById('device-code-display').classList.add('hidden');
  const btn = document.getElementById('btn-start-m365');
  btn.classList.remove('hidden');
  btn.disabled = false;
  btn.innerText = 'Generate Login Code';
  // Icons already rendered in static HTML
}

async function logoutM365() {
  try {
    await fetch('/api/graph/logout', { method: 'POST' });
    showToast('Logged out of Microsoft 365', 'info');
    addLog('[M365] Logged out', 'info');
    checkM365Status();
  } catch (err) {
    showToast('Failed to logout', 'error');
  }
}


// --- Google Gemini AI Integration ---

function openAIModal() {
  const el = document.getElementById('ai-modal');
  el.classList.remove('hidden');
  lucide.createIcons({ root: el });
}

function closeAIModal() {
  document.getElementById('ai-modal').classList.add('hidden');
}

async function loadStoredAIKey() {
  const stored = localStorage.getItem('autoreach_gemini_key');
  if (stored) {
    appState.geminiKey = stored;
    document.getElementById('gemini-api-key-input').value = stored;
  }
  await checkAIStatus();
}

async function checkAIStatus() {
  const pill = document.getElementById('ai-status-pill');
  const text = document.getElementById('ai-status-text');
  const iconCheck = document.getElementById('ai-icon-check');
  const iconCross = document.getElementById('ai-icon-cross');
  const cardBadge = document.getElementById('ai-card-badge');

  let isConfigured = false;

  // 1. Check local key
  if (appState.geminiKey) {
    isConfigured = true;
  } else {
    // 2. Check backend .env key status
    try {
      const res = await fetch('/api/ai/status');
      const data = await res.json();
      if (data.success && data.configured) {
        isConfigured = true;
      }
    } catch (e) {}
  }

  if (isConfigured) {
    pill.className = 'auth-pill ai-pill connected';
    text.innerText = 'Gemini AI: Active';
    iconCheck.classList.remove('hidden');
    iconCross.classList.add('hidden');
    if (cardBadge) {
      cardBadge.className = 'badge badge-emerald';
      cardBadge.innerHTML = '<i data-lucide="check" class="mini-icon"></i> AI Active';
    }
  } else {
    pill.className = 'auth-pill ai-pill disconnected';
    text.innerText = 'Gemini AI: Missing Key';
    iconCheck.classList.add('hidden');
    iconCross.classList.remove('hidden');
    if (cardBadge) {
      cardBadge.className = 'badge badge-rose';
      cardBadge.innerHTML = '<i data-lucide="x" class="mini-icon"></i> Key Required';
    }
  }
  // lucide icons already rendered on DOMContentLoaded
}

function saveGeminiKey() {
  const key = document.getElementById('gemini-api-key-input').value.trim();
  appState.geminiKey = key;
  localStorage.setItem('autoreach_gemini_key', key);
  showToast(key ? 'Gemini API Key saved!' : 'Gemini API Key cleared', 'success');
  checkAIStatus();
  closeAIModal();
}


async function testGeminiKey() {
  const key = document.getElementById('gemini-api-key-input').value.trim();
  if (!key) {
    showToast('Please enter a Gemini API Key to verify', 'error');
    return;
  }

  const btn = document.getElementById('btn-test-ai');
  btn.disabled = true;
  btn.innerText = 'Verifying...';

  try {
    const res = await fetch('/api/ai/verify-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Gemini API Key is valid and active!', 'success');
      addLog('[Gemini AI] API key verified successfully', 'success');
    } else {
      showToast(`Key Error: ${data.error}`, 'error');
      addLog(`[Gemini AI Error] ${data.error}`, 'error');
    }
  } catch (err) {
    showToast('Failed to verify key with Google API', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="activity"></i> Verify Key';
    // lucide icons already rendered on DOMContentLoaded
  }
}

function toggleAIDrawer() {
  const body = document.getElementById('ai-drawer-body');
  const chevron = document.getElementById('ai-drawer-chevron');
  body.classList.toggle('hidden');
  chevron.style.transform = body.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
}

async function generateWithAI() {
  const prompt = document.getElementById('ai-prompt-input').value.trim();
  if (!prompt) {
    showToast('Please enter what message you would like to generate', 'error');
    document.getElementById('ai-prompt-input').focus();
    return;
  }

  const tone = document.getElementById('ai-tone-select').value;
  const btn = document.getElementById('btn-generate-ai');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating...';

  addLog(`[Gemini AI] Generating campaign copy with tone "${tone}"...`, 'info');

  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: prompt,
        tone: tone,
        api_key: appState.geminiKey
      })
    });
    const data = await res.json();

    if (data.success) {
      if (data.email_subject) {
        document.getElementById('email-subject-input').value = data.email_subject;
      }
      if (data.email_body) {
        document.getElementById('email-body-input').value = data.email_body;
      }
      if (data.whatsapp_body) {
        document.getElementById('whatsapp-body-input').value = data.whatsapp_body;
      }

      updateLivePreview();
      showToast('Generated email & WhatsApp copy with Gemini AI!', 'success');
      addLog('[Gemini AI] Successfully drafted and populated templates', 'success');
    } else {
      showToast(`AI Error: ${data.error}`, 'error');
      if (data.error && data.error.includes('key')) {
        openAIModal();
      }
      addLog(`[Gemini AI Error] ${data.error}`, 'error');
    }
  } catch (err) {
    showToast('Failed to connect to AI service', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="sparkles"></i> Generate Drafts';
    // lucide icons already rendered on DOMContentLoaded
  }
}


// --- Dropzone & File Upload ---

function setupDropzone() {
  const dropzone = document.getElementById('file-dropzone');
  const fileInput = document.getElementById('file-input');

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  });
}

async function handleFileUpload(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('country_code', getCountryCode());

  addLog(`[Upload] Uploading ${file.name}...`, 'info');
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      onContactsLoaded(data);
      showToast(`Loaded ${data.total_contacts} contacts from ${file.name}`, 'success');
      addLog(`[Upload] Successfully parsed ${data.total_contacts} rows from ${file.name}`, 'success');
    } else {
      showToast(data.error || 'Failed to parse file', 'error');
      addLog(`[Upload Error] ${data.error}`, 'error');
    }
  } catch (err) {
    showToast('Network error uploading file', 'error');
  }
}

function onContactsLoaded(data) {

  appState.contacts = data.contacts;
  appState.columns = data.columns;
  appState.detected = data.detected;
  appState.activePreviewIdx = 0;

  // Update UI indicators
  document.getElementById('file-loaded-info').classList.remove('hidden');
  document.getElementById('loaded-filename').innerText = data.file_name;
  document.getElementById('loaded-count').innerText = `${data.total_contacts} contacts`;

  // Step Bar progress
  document.getElementById('step-nav-2').classList.add('active');
  document.getElementById('step-nav-3').classList.add('active');

  // Populate placeholder tags
  populatePlaceholderTags(data.columns);

  // Setup Column Mapping Dropdowns
  setupColumnDropdowns(data.columns, data.detected);

  // Render Table & Metrics
  updateMetrics();
  renderContactsTable();
  updateLivePreview();
}

function getCountryCode() {
  const sel = document.getElementById('country-code-select').value;
  return sel === 'custom' ? '92' : sel;
}

function onCountryCodeChange() {
  if (appState.contacts.length > 0) {
    applyRemap();
  }
}

function populatePlaceholderTags(columns) {
  const container = document.getElementById('available-tags');
  container.innerHTML = '';

  columns.forEach(col => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerText = `{${col}}`;
    pill.onclick = () => insertTag(`{${col}}`);
    container.appendChild(pill);
  });
}

function setupColumnDropdowns(columns, detected) {
  document.getElementById('column-mapping-section').classList.remove('hidden');
  const mapTypes = [
    { key: 'name', detectedKey: 'name_col' },
    { key: 'phone', detectedKey: 'phone_col' },
    { key: 'email', detectedKey: 'email_col' },
    { key: 'campus-id', detectedKey: 'campus_id_col' }
  ];

  mapTypes.forEach(item => {
    const select = document.getElementById(`map-${item.key}`);
    if (select) {
      select.innerHTML = '<option value="">-- Select Column --</option>';
      columns.forEach(col => {
        const opt = document.createElement('option');
        opt.value = col;
        opt.innerText = col;
        if (detected[item.detectedKey] === col) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });
    }
  });
  // lucide icons already rendered on DOMContentLoaded
}

function toggleColumnMapping() {
  const body = document.getElementById('mapping-body');
  const chevron = document.getElementById('mapping-chevron');
  body.classList.toggle('hidden');
  chevron.style.transform = body.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
}

async function applyRemap() {
  const name_col = document.getElementById('map-name').value;
  const phone_col = document.getElementById('map-phone').value;
  const email_col = document.getElementById('map-email').value;
  const campus_id_col = document.getElementById('map-campus-id') ? document.getElementById('map-campus-id').value : '';
  const fallback_domain = document.getElementById('map-fallback-domain') ? document.getElementById('map-fallback-domain').value.trim() : 'lums.edu.pk';

  try {
    const res = await fetch('/api/re-map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name_col,
        phone_col,
        email_col,
        campus_id_col,
        fallback_domain,
        country_code: getCountryCode()
      })
    });
    const data = await res.json();
    if (data.success) {
      appState.contacts = data.contacts;
      appState.detected = data.detected;
      updateMetrics();
      renderContactsTable();
      updateLivePreview();
      showToast('Updated column mapping & derived email rules', 'info');
    }
  } catch (err) {
    showToast('Failed to apply column mapping', 'error');
  }
}



// --- Composer & Live Preview ---

function switchComposerTab(tab) {
  appState.activeTab = tab;
  document.getElementById('tab-btn-email').classList.toggle('active', tab === 'email');
  document.getElementById('tab-btn-whatsapp').classList.toggle('active', tab === 'whatsapp');

  document.getElementById('composer-email-section').classList.toggle('hidden', tab !== 'email');
  document.getElementById('composer-whatsapp-section').classList.toggle('hidden', tab !== 'whatsapp');

  updateLivePreview();
}

function insertTag(tag) {
  let targetInput = null;
  if (appState.activeTab === 'email') {
    targetInput = document.getElementById('email-body-input');
  } else {
    targetInput = document.getElementById('whatsapp-body-input');
  }

  if (targetInput) {
    const start = targetInput.selectionStart || targetInput.value.length;
    const end = targetInput.selectionEnd || targetInput.value.length;
    const text = targetInput.value;
    targetInput.value = text.substring(0, start) + tag + text.substring(end);
    targetInput.focus();
    targetInput.setSelectionRange(start + tag.length, start + tag.length);
    updateLivePreview();
  }
}

function navPreviewContact(direction) {
  if (appState.contacts.length === 0) return;
  appState.activePreviewIdx = (appState.activePreviewIdx + direction + appState.contacts.length) % appState.contacts.length;
  updateLivePreview();
}

function updateLivePreview() {
  if (appState.contacts.length === 0) {
    document.getElementById('preview-display').innerHTML = '<span class="text-muted">Load contacts to see personalized live preview.</span>';
    return;
  }

  const contact = appState.contacts[appState.activePreviewIdx] || appState.contacts[0];
  document.getElementById('preview-contact-num').innerText = contact.id;
  document.getElementById('preview-contact-name').innerText = contact.name;

  const display = document.getElementById('preview-display');

  if (appState.activeTab === 'email') {
    const subjectTmpl = document.getElementById('email-subject-input').value;
    const bodyTmpl = document.getElementById('email-body-input').value;

    const renderedSubject = renderTemplate(subjectTmpl, contact);
    const renderedBody = renderTemplate(bodyTmpl, contact);

    display.innerHTML = `<strong>Subject:</strong> ${escapeHtml(renderedSubject)}\n<strong>To:</strong> ${escapeHtml(contact.email_clean || 'No email')}\n\n${escapeHtml(renderedBody)}`;
  } else {
    const waTmpl = document.getElementById('whatsapp-body-input').value;
    const renderedWA = renderTemplate(waTmpl, contact);
    display.innerHTML = `<strong>To WhatsApp:</strong> +${escapeHtml(contact.phone_clean || 'No number')}\n\n${escapeHtml(renderedWA)}`;
  }
}

function renderTemplate(template, contact) {
  if (!template) return '';
  let res = template;
  
  // Replace base keys
  res = res.replace(/\{Name\}/gi, contact.name || '');
  res = res.replace(/\{Email\}/gi, contact.email_clean || contact.email_raw || '');
  res = res.replace(/\{Phone\}/gi, contact.phone_clean || contact.phone_raw || '');

  // Replace custom data keys
  if (contact.data) {
    Object.keys(contact.data).forEach(key => {
      const reg = new RegExp(`\\{${key}\\}`, 'gi');
      res = res.replace(reg, contact.data[key] || '');
      // Normalized matching
      const normKey = key.replace(/[^a-zA-Z0-9]/g, '');
      if (normKey) {
        const normReg = new RegExp(`\\{${normKey}\\}`, 'gi');
        res = res.replace(normReg, contact.data[key] || '');
      }
    });
  }
  return res;
}


// --- Channel Switcher & Settings ---

function setEmailChannel(channel) {
  appState.emailChannel = channel;
  document.getElementById('channel-opt-graph').classList.toggle('active', channel === 'graph');
  document.getElementById('channel-opt-smtp').classList.toggle('active', channel === 'smtp');
  addLog(`[Config] Email dispatch channel set to: ${channel === 'graph' ? 'Microsoft 365 (SSO OAuth2)' : 'Standard SMTP'}`, 'info');
}

function openSettingsModal() {
  const el = document.getElementById('settings-modal');
  el.classList.remove('hidden');
  lucide.createIcons({ root: el });
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}

function loadStoredSMTPSettings() {
  const stored = localStorage.getItem('autoreach_smtp_config');
  if (stored) {
    try {
      appState.smtpConfig = JSON.parse(stored);
      document.getElementById('smtp-server').value = appState.smtpConfig.server || 'smtp.gmail.com';
      document.getElementById('smtp-port').value = appState.smtpConfig.port || 587;
      document.getElementById('smtp-user').value = appState.smtpConfig.username || '';
      document.getElementById('smtp-pass').value = appState.smtpConfig.password || '';
      document.getElementById('smtp-from-name').value = appState.smtpConfig.from_name || 'Academic Dispatcher';
      document.getElementById('smtp-reply-to').value = appState.smtpConfig.reply_to || '';
      document.getElementById('smtp-use-tls').checked = !!appState.smtpConfig.use_tls;
      document.getElementById('smtp-use-ssl').checked = !!appState.smtpConfig.use_ssl;
    } catch (e) {}
  }
}

function saveSMTPSettings() {
  appState.smtpConfig = {
    server: document.getElementById('smtp-server').value.trim(),
    port: parseInt(document.getElementById('smtp-port').value) || 587,
    username: document.getElementById('smtp-user').value.trim(),
    password: document.getElementById('smtp-pass').value,
    from_name: document.getElementById('smtp-from-name').value.trim(),
    reply_to: document.getElementById('smtp-reply-to').value.trim(),
    use_tls: document.getElementById('smtp-use-tls').checked,
    use_ssl: document.getElementById('smtp-use-ssl').checked
  };
  localStorage.setItem('autoreach_smtp_config', JSON.stringify(appState.smtpConfig));
  showToast('SMTP settings saved!', 'success');
  closeSettingsModal();
}

async function testSMTPConnection() {
  const btn = document.getElementById('btn-test-smtp');
  btn.disabled = true;
  btn.innerText = 'Testing...';

  const payload = {
    server: document.getElementById('smtp-server').value.trim(),
    port: parseInt(document.getElementById('smtp-port').value) || 587,
    username: document.getElementById('smtp-user').value.trim(),
    password: document.getElementById('smtp-pass').value,
    use_ssl: document.getElementById('smtp-use-ssl').checked,
    use_tls: document.getElementById('smtp-use-tls').checked
  };

  try {
    const res = await fetch('/api/smtp/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('SMTP Connection Successful!', 'success');
      addLog('[SMTP] Successfully connected and authenticated with SMTP server', 'success');
    } else {
      showToast(`SMTP Error: ${data.error}`, 'error');
      addLog(`[SMTP Error] ${data.error}`, 'error');
    }
  } catch (err) {
    showToast('Failed to test SMTP connection', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="activity"></i> Test Connection';
    // lucide icons already rendered on DOMContentLoaded
  }
}


// --- Contacts Table, Health Audit & Filtering ---

function updateMetrics() {
  const total = appState.contacts.length;
  const validEmail = appState.contacts.filter(c => c.has_valid_email).length;
  const derivedEmail = appState.contacts.filter(c => c.email_derived).length;
  const missingEmail = appState.contacts.filter(c => c.email_status === 'missing' || (!c.email_raw && !c.email_clean)).length;
  const malformedEmail = appState.contacts.filter(c => c.email_status === 'malformed' || (c.email_raw && !c.has_valid_email)).length;
  
  const validPhone = appState.contacts.filter(c => c.has_valid_phone).length;
  const missingPhone = appState.contacts.filter(c => c.phone_status === 'missing' || !c.phone_raw).length;
  const malformedPhone = appState.contacts.filter(c => c.phone_status === 'malformed' || (c.phone_raw && !c.has_valid_phone)).length;
  const sentCount = appState.contacts.filter(c => c.emailStatus === 'Sent').length;

  // Header Numbers
  document.getElementById('metric-total').innerText = total;
  document.getElementById('metric-file-hint').innerText = appState.fileName ? `${appState.fileName}` : 'Loaded in memory';
  document.getElementById('metric-loaded-badge').innerText = total > 0 ? `${total} Records` : 'Ready';

  // Email Deliverability
  document.getElementById('metric-valid-email').innerText = `${validEmail} Valid`;
  document.getElementById('metric-invalid-email').innerText = `${missingEmail + malformedEmail} (${missingEmail} missing, ${malformedEmail} typo)`;
  const emailPct = total > 0 ? Math.round((validEmail / total) * 100) : 100;
  document.getElementById('metric-email-pct').innerText = `${emailPct}%`;
  
  if (derivedEmail > 0) {
    document.getElementById('metric-derived-email-hint').innerText = `✨ ${derivedEmail} auto-derived from Campus ID`;
  } else if (appState.detected && !appState.detected.campus_id_col) {
    document.getElementById('metric-derived-email-hint').innerText = `Sheet has no Campus ID column`;
  } else {
    document.getElementById('metric-derived-email-hint').innerText = `All emails explicit in file`;
  }

  // Phone Deliverability
  document.getElementById('metric-valid-phone').innerText = `${validPhone} Valid`;
  document.getElementById('metric-invalid-phone').innerText = `${missingPhone + malformedPhone} (${missingPhone} missing, ${malformedPhone} typo)`;
  const phonePct = total > 0 ? Math.round((validPhone / total) * 100) : 0;
  document.getElementById('metric-phone-pct').innerText = `${phonePct}%`;
  document.getElementById('metric-phone-hint').innerText = malformedPhone > 0 ? `${malformedPhone} malformed numbers in Excel` : 'All formatted cleanly';

  // Sent Progress
  document.getElementById('metric-sent').innerText = `${sentCount} / ${validEmail}`;
  const sentPct = validEmail > 0 ? Math.round((sentCount / validEmail) * 100) : 0;
  document.getElementById('metric-sent-pct').innerText = `${sentPct}%`;
  document.getElementById('metric-sent-hint').innerText = `${validEmail - sentCount} pending delivery`;

  // Chip Counters
  const setChip = (id, count) => {
    const el = document.getElementById(id);
    if (el) el.innerText = count;
  };

  setChip('chip-count-all', total);
  setChip('chip-count-valid-phone', validPhone);
  setChip('chip-count-malformed-phone', malformedPhone);
  setChip('chip-count-missing-phone', missingPhone);
  setChip('chip-count-valid-email', validEmail);
  setChip('chip-count-derived-email', derivedEmail);
  setChip('chip-count-missing-email', missingEmail);
  setChip('chip-count-malformed-email', malformedEmail);
  setChip('chip-count-sent', sentCount);
}

function setTableFilter(filterType) {
  appState.activeFilter = filterType;
  
  // Highlight active chip
  const chipMap = {
    'all': 'chip-filter-all',
    'valid_phone': 'chip-filter-valid-phone',
    'malformed_phone': 'chip-filter-malformed-phone',
    'missing_phone': 'chip-filter-missing-phone',
    'valid_email': 'chip-filter-valid-email',
    'derived_email': 'chip-filter-derived-email',
    'missing_email': 'chip-filter-missing-email',
    'malformed_email': 'chip-filter-malformed-email',
    'sent': 'chip-filter-sent'
  };

  Object.values(chipMap).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  const activeEl = document.getElementById(chipMap[filterType]);
  if (activeEl) activeEl.classList.add('active');

  const query = document.getElementById('search-contacts').value;
  renderContactsTable(query);
}

function renderContactsTable(filterText = '') {
  const tbody = document.getElementById('contacts-table-body');
  tbody.innerHTML = '';

  const activeFilter = appState.activeFilter || 'all';

  const filtered = appState.contacts.filter(c => {
    // 1. Text search filter
    if (filterText) {
      const query = filterText.toLowerCase();
      const matchName = c.name && c.name.toLowerCase().includes(query);
      const matchEmail = (c.email_clean && c.email_clean.toLowerCase().includes(query)) || (c.email_raw && c.email_raw.toLowerCase().includes(query));
      const matchPhone = (c.phone_clean && c.phone_clean.includes(query)) || (c.phone_raw && c.phone_raw.includes(query));
      const matchID = c.campus_id && String(c.campus_id).toLowerCase().includes(query);
      if (!matchName && !matchEmail && !matchPhone && !matchID) return false;
    }

    // 2. Granular Chip type filter
    if (activeFilter === 'valid_phone') return c.has_valid_phone;
    if (activeFilter === 'malformed_phone') return c.phone_status === 'malformed' || (Boolean(c.phone_raw) && !c.has_valid_phone);
    if (activeFilter === 'missing_phone') return c.phone_status === 'missing' || !c.phone_raw;
    
    if (activeFilter === 'valid_email') return c.has_valid_email;
    if (activeFilter === 'derived_email') return Boolean(c.email_derived);
    if (activeFilter === 'missing_email') return c.email_status === 'missing' || (!c.email_raw && !c.email_clean);
    if (activeFilter === 'malformed_email') return c.email_status === 'malformed' || (Boolean(c.email_raw) && !c.has_valid_email);
    
    if (activeFilter === 'sent') return c.emailStatus === 'Sent';

    return true;
  });

  const countBadge = document.getElementById('filtered-count-badge');
  if (countBadge) {
    countBadge.innerText = `Showing ${filtered.length} of ${appState.contacts.length} contacts`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No contacts matching current filter "${activeFilter}".</td></tr>`;
    return;
  }


  filtered.forEach(contact => {
    const tr = document.createElement('tr');
    tr.id = `contact-row-${contact.id}`;

    const derivedTag = contact.email_derived ? `<span class="badge badge-amber text-xs ml-1" title="Derived from Campus ID ${escapeHtml(contact.campus_id)}">Derived</span>` : '';
    const emailBadge = contact.has_valid_email
      ? `<span class="badge badge-emerald" title="${escapeHtml(contact.email_reason || 'Active Email')}">${SVG.check} ${escapeHtml(contact.email_clean)}</span> ${derivedTag}`
      : `<span class="badge badge-rose" title="${escapeHtml(contact.email_reason || 'Invalid Email')}">${SVG.x} ${escapeHtml(contact.email_clean || contact.email_raw || 'None')}</span>`;

    const countryTag = contact.phone_country ? `<span class="badge badge-subtle text-xs ml-1">${escapeHtml(contact.phone_country)}</span>` : '';
    const phoneBadge = contact.has_valid_phone
      ? `<span class="badge badge-emerald" title="Verified by libphonenumber (${contact.phone_country})">${SVG.check} +${escapeHtml(contact.phone_clean)}</span> ${countryTag}`
      : `<span class="badge badge-rose" title="${escapeHtml(contact.phone_reason || 'Invalid structure')}">${SVG.alertCircle} ${escapeHtml(contact.phone_raw || 'Invalid')}</span>`;

    const statusBadge = contact.emailStatus === 'Sent'
      ? `<span class="badge badge-emerald">${SVG.check} Sent</span>`
      : (contact.emailStatus === 'Failed' ? `<span class="badge badge-rose">Failed</span>` : `<span class="badge badge-indigo">Ready</span>`);

    tr.innerHTML = `
      <td>${contact.id}</td>
      <td><strong>${escapeHtml(contact.name)}</strong></td>
      <td>${phoneBadge}</td>
      <td>${emailBadge}</td>
      <td id="status-cell-${contact.id}">${statusBadge}</td>
      <td class="text-right">
        <div class="row-actions">
          <button class="action-btn btn-wa" onclick="openSingleWhatsApp(${contact.id})" ${!contact.has_valid_phone ? 'disabled title="No valid phone number"' : 'title="Review & Open WhatsApp Chat"'}>
            ${SVG.msgCircle} WA
          </button>
          <button class="action-btn btn-mail" onclick="promptSendSingleEmail(${contact.id})" title="Review Draft & Send Email">
            ${SVG.send} Send
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });
  // No lucide.createIcons() needed — all table icons are pre-baked inline SVGs
}



function filterContactsTable() {
  const query = document.getElementById('search-contacts').value;
  renderContactsTable(query);
}


// --- Single & Bulk Email Approval Flow ---

function promptSendSingleEmail(contactId) {
  try {
    console.log('[Email] called id:', contactId, '| contacts loaded:', appState.contacts.length);

    const contact = appState.contacts.find(c => c.id == contactId);
    console.log('[Email] Contact:', contact ? `${contact.name} | valid_email=${contact.has_valid_email} | email=${contact.email_clean}` : 'NOT FOUND');

    if (!contact) {
      showToast(`Contact #${contactId} not found. Re-upload your file.`, 'error');
      return;
    }

    if (!contact.has_valid_email) {
      showToast(`${contact.name} has no valid email address in your file`, 'warning');
      addLog(`[Email] Skipped: ${contact.name} — no valid email (raw: "${contact.email_raw || 'empty'}")`, 'warning');
      return;
    }

    // Pre-validate channel
    if (appState.emailChannel === 'graph' && !appState.m365User) {
      showToast('Microsoft 365 not connected. Switch to SMTP in Settings ⚙️ or connect M365 first.', 'warning');
      openM365Modal();
      return;
    }

    const subjectTmpl = (document.getElementById('email-subject-input') || {}).value || 'Message for {Name}';
    const bodyTmpl = (document.getElementById('email-body-input') || {}).value || 'Hello {Name},';

    const renderedSubject = renderTemplate(subjectTmpl, contact);
    const renderedBody = renderTemplate(bodyTmpl, contact);

    document.getElementById('single-send-recipient-name').innerText = contact.name;
    document.getElementById('single-send-recipient-email').innerText = contact.email_clean;

    const derivedBadge = document.getElementById('single-send-derived-badge');
    if (contact.email_derived) {
      derivedBadge.classList.remove('hidden');
      derivedBadge.innerText = `Derived from ID: ${contact.campus_id || ''}`;
    } else {
      derivedBadge.classList.add('hidden');
    }

    document.getElementById('single-send-channel-badge').innerText = appState.emailChannel === 'graph'
      ? `Microsoft 365 (${appState.m365User ? appState.m365User.displayName : 'SSO OAuth2'})`
      : `Standard SMTP (${appState.smtpConfig.username || 'Custom / Gmail'})`;

    document.getElementById('single-send-subject').innerText = renderedSubject;
    document.getElementById('single-send-body').innerText = renderedBody;

    appState.pendingSingleEmailId = contactId;
    const modalEl = document.getElementById('single-email-modal');
    if (modalEl) {
      modalEl.classList.remove('hidden');
      if (typeof lucide !== 'undefined') lucide.createIcons({ root: modalEl });
    }
    console.log('[Email] Modal opened OK for', contact.name);

  } catch (err) {
    console.error('[Email] CRASH:', err);
    showToast('Email modal error: ' + err.message, 'error');
  }
}



function closeSingleEmailModal() {
  document.getElementById('single-email-modal').classList.add('hidden');
  appState.pendingSingleEmailId = null;
}

async function executeSingleEmailSend() {
  const contactId = appState.pendingSingleEmailId;
  if (!contactId) return;

  const contact = appState.contacts.find(c => c.id === contactId);
  if (!contact) return;

  closeSingleEmailModal();

  const statusCell = document.getElementById(`status-cell-${contactId}`);
  if (statusCell) statusCell.innerHTML = `<span class="spinner"></span>`;

  addLog(`[Email] Sending approved email to ${contact.name} <${contact.email_clean}>...`, 'info');

  const subjectTmpl = document.getElementById('email-subject-input').value;
  const bodyTmpl = document.getElementById('email-body-input').value;

  try {
    const res = await fetch('/api/send/email-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: contactId,
        backend: appState.emailChannel,
        subject: subjectTmpl,
        body: bodyTmpl,
        smtp_settings: appState.smtpConfig
      })
    });
    const data = await res.json();
    if (data.success) {
      contact.emailStatus = 'Sent';
      showToast(`Email sent successfully to ${contact.name}!`, 'success');
      addLog(`[Email Success] Delivered to ${contact.name} <${contact.email_clean}>`, 'success');
    } else {
      contact.emailStatus = 'Failed';
      showToast(`Failed: ${data.error}`, 'error');
      addLog(`[Email Error] ${contact.name}: ${data.error}`, 'error');
    }
  } catch (err) {
    contact.emailStatus = 'Failed';
    showToast('Network error dispatching email', 'error');
    addLog(`[Email Error] Network exception for ${contact.name}`, 'error');
  }

  updateMetrics();
  renderContactsTable(document.getElementById('search-contacts').value);
}


// --- Bulk Email Dispatch Flow ---

function sendAllEmails() {
  if (appState.contacts.length === 0) {
    showToast('No contacts loaded yet', 'error');
    return;
  }

  if (appState.emailChannel === 'graph' && !appState.m365User) {
    showToast('Please connect your Microsoft 365 account first!', 'error');
    openM365Modal();
    return;
  }

  const validContacts = appState.contacts.filter(c => c.has_valid_email);
  const invalidContacts = appState.contacts.filter(c => !c.has_valid_email);

  if (validContacts.length === 0) {
    showToast('No valid email addresses found to send to', 'error');
    return;
  }

  // Populate Bulk Send Review Modal
  document.getElementById('bulk-approved-count').innerText = `${validContacts.length} Contacts`;
  document.getElementById('bulk-skipped-count').innerText = `${invalidContacts.length} Contacts`;
  document.getElementById('bulk-channel-lbl').innerText = appState.emailChannel === 'graph' ? 'Microsoft 365' : 'SMTP (Gmail/Custom)';

  const sampleContact = validContacts[0];
  const subjectTmpl = document.getElementById('email-subject-input').value;
  const bodyTmpl = document.getElementById('email-body-input').value;

  document.getElementById('bulk-sample-name').innerText = sampleContact.name;
  document.getElementById('bulk-sample-email').innerText = sampleContact.email_clean;
  document.getElementById('bulk-sample-subject').innerText = renderTemplate(subjectTmpl, sampleContact);
  document.getElementById('bulk-sample-body').innerText = renderTemplate(bodyTmpl, sampleContact);

  const modalEl = document.getElementById('bulk-email-modal');
  modalEl.classList.remove('hidden');
  lucide.createIcons({ root: modalEl });
}


function closeBulkEmailModal() {
  document.getElementById('bulk-email-modal').classList.add('hidden');
}

async function executeBulkEmailSend() {
  closeBulkEmailModal();

  const validContacts = appState.contacts.filter(c => c.has_valid_email);
  if (validContacts.length === 0) return;

  const useDelay = document.getElementById('bulk-safety-delay') ? document.getElementById('bulk-safety-delay').checked : true;
  const delayMs = useDelay ? 1200 : 400;

  appState.isSendingBatch = true;
  const progressBox = document.getElementById('batch-progress-container');
  const progressFill = document.getElementById('progress-bar-fill');
  const progressText = document.getElementById('progress-status-text');
  const progressPercent = document.getElementById('progress-percent');

  progressBox.classList.remove('hidden');
  addLog(`[Batch Approved] Starting email dispatch for ${validContacts.length} recipients...`, 'info');

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < validContacts.length; i++) {
    const contact = validContacts[i];
    const pct = Math.round(((i + 1) / validContacts.length) * 100);
    progressFill.style.width = `${pct}%`;
    progressPercent.innerText = `${pct}%`;
    progressText.innerText = `Dispatching approved email (${i + 1}/${validContacts.length}) to ${contact.name}...`;

    try {
      const res = await fetch('/api/send/email-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contact.id,
          backend: appState.emailChannel,
          subject: document.getElementById('email-subject-input').value,
          body: document.getElementById('email-body-input').value,
          smtp_settings: appState.smtpConfig
        })
      });
      const data = await res.json();
      if (data.success) {
        contact.emailStatus = 'Sent';
        sent++;
        addLog(`[Batch Sent] ✓ ${contact.name} <${contact.email_clean}>`, 'success');
      } else {
        contact.emailStatus = 'Failed';
        failed++;
        addLog(`[Batch Failed] ✕ ${contact.name}: ${data.error}`, 'error');
      }
    } catch (e) {
      contact.emailStatus = 'Failed';
      failed++;
    }

    updateMetrics();
    renderContactsTable(document.getElementById('search-contacts').value);
    await new Promise(r => setTimeout(r, delayMs));
  }

  appState.isSendingBatch = false;
  progressText.innerText = `Batch complete! ${sent} Sent, ${failed} Failed.`;
  showToast(`Batch completed: ${sent} Sent, ${failed} Failed`, 'success');
  addLog(`[Batch Finished] Successfully sent: ${sent}, Failed: ${failed}`, 'info');
}


// --- WhatsApp Launch Approval Flow ---

function openSingleWhatsApp(contactId) {
  try {
    console.log('[WA] called id:', contactId, '| contacts loaded:', appState.contacts.length);

    // Use == (loose) to safely handle int/string mismatch from any path
    const contact = appState.contacts.find(c => c.id == contactId);

    if (!contact) {
      showToast(`Contact #${contactId} not found. Re-upload your file to refresh.`, 'error');
      console.warn('[WA] Contact not found for id:', contactId);
      return;
    }
    if (!contact.has_valid_phone) {
      showToast(`${contact.name} has no valid phone number`, 'error');
      return;
    }

    const waTmplEl = document.getElementById('whatsapp-body-input');
    const waTmpl = waTmplEl ? waTmplEl.value : 'Hello {Name}!';
    const renderedWA = renderTemplate(waTmpl, contact);
    const digits = (contact.phone_clean || '').replace(/\D/g, '');
    const waUrl = `https://api.whatsapp.com/send/?phone=${digits}&text=${encodeURIComponent(renderedWA)}`;

    console.log('[WA] URL:', waUrl);

    document.getElementById('wa-modal-name').innerText = contact.name;
    document.getElementById('wa-modal-phone').innerText = `+${contact.phone_clean}`;
    document.getElementById('wa-modal-country').innerText = contact.phone_country || 'Worldwide';
    document.getElementById('wa-modal-message').innerText = renderedWA;

    const confirmBtn = document.getElementById('btn-confirm-wa-send');
    if (confirmBtn) confirmBtn.href = waUrl;

    appState.pendingSingleWAId = contactId;
    const modalEl = document.getElementById('single-wa-modal');
    if (modalEl) {
      modalEl.classList.remove('hidden');
      modalEl.style.display = 'flex';
      if (typeof lucide !== 'undefined') lucide.createIcons({ root: modalEl });
    }
    console.log('[WA] Modal opened OK');
  } catch (err) {
    console.error('[WA] CRASH:', err);
    showToast('WA modal error: ' + err.message, 'error');
  }
}

function copyWAModalText() {
  const msgEl = document.getElementById('wa-modal-message');
  if (!msgEl) return;
  const text = msgEl.innerText;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Message text with emojis copied to clipboard!', 'success');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Message copied to clipboard!', 'success');
  });
}

function closeSingleWAModal() {
  const modalEl = document.getElementById('single-wa-modal');
  if (modalEl) {
    modalEl.classList.add('hidden');
    modalEl.style.display = 'none';
  }
  appState.pendingSingleWAId = null;
}

function executeSingleWALaunch(event) {
  const contactId = appState.pendingSingleWAId;
  if (!contactId) return;

  const contact = appState.contacts.find(c => c.id == contactId);
  if (!contact) return;

  closeSingleWAModal();
  addLog(`[WhatsApp Launched] Opened chat for ${contact.name} (+${contact.phone_clean})`, 'success');
  showToast(`WhatsApp chat opened for ${contact.name}!`, 'success');
}


function openAllWhatsApp() {
  if (appState.contacts.length === 0) {
    showToast('Please upload an Excel or CSV file with contacts first!', 'error');
    return;
  }

  const validContacts = appState.contacts.filter(c => c.has_valid_phone);
  if (validContacts.length === 0) {
    showToast('No contacts with verified phone numbers found in current list', 'error');
    return;
  }

  const waTmpl = document.getElementById('whatsapp-body-input').value;
  const sampleContact = validContacts[0];
  const sampleRendered = renderTemplate(waTmpl, sampleContact);

  document.getElementById('bulk-wa-valid-count').innerText = validContacts.length;
  document.getElementById('bulk-wa-invalid-count').innerText = appState.contacts.length - validContacts.length;
  document.getElementById('bulk-wa-total-count').innerText = appState.contacts.length;
  document.getElementById('bulk-wa-sample-name').innerText = sampleContact.name;
  document.getElementById('bulk-wa-sample-body').innerText = sampleRendered;

  const modalEl = document.getElementById('bulk-wa-modal');
  if (modalEl) {
    modalEl.classList.remove('hidden');
    modalEl.style.display = 'flex';
  }
}

function closeBulkWAModal() {
  const modalEl = document.getElementById('bulk-wa-modal');
  if (modalEl) {
    modalEl.classList.add('hidden');
    modalEl.style.display = 'none';
  }
}


async function executeBulkWALaunch() {
  const validContacts = appState.contacts.filter(c => c.has_valid_phone);
  if (validContacts.length === 0) return;

  closeBulkWAModal();

  const waTmpl = document.getElementById('whatsapp-body-input').value;
  const useThrottle = document.getElementById('bulk-wa-throttle').checked;
  const delaySec = useThrottle ? 1.5 : 0.8;

  addLog(`[WhatsApp Batch] Launching click-to-chat for ${validContacts.length} contacts...`, 'info');
  showToast(`Starting WhatsApp dispatch for ${validContacts.length} contacts...`, 'info');

  try {
    const res = await fetch('/api/whatsapp/open-desktop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template: waTmpl,
        delay: delaySec
      })
    });
    const data = await res.json();
    if (data.success) {
      addLog(`[WhatsApp Batch] Successfully triggered ${data.opened_count} WhatsApp chats`, 'success');
      showToast(`Triggered ${data.opened_count} WhatsApp chats!`, 'success');
    } else {
      throw new Error(data.error || 'Failed to trigger batch');
    }
  } catch (err) {
    // Client-side sequential opening fallback
    validContacts.forEach((contact, idx) => {
      setTimeout(() => {
        const renderedWA = renderTemplate(waTmpl, contact);
        const digits = (contact.phone_clean || '').replace(/\D/g, '');
        const url = `https://wa.me/${digits}?text=${encodeURIComponent(renderedWA)}`;
        window.open(url, '_blank');
        addLog(`[WhatsApp] (${idx + 1}/${validContacts.length}) Opened chat for ${contact.name}`, 'success');
      }, idx * (delaySec * 1000));
    });
  }
}



// --- Logging & Toast Utilities ---

function addLog(msg, type = 'info') {
  const consoleEl = document.getElementById('log-console');
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  const time = new Date().toLocaleTimeString();
  entry.innerText = `[${time}] ${msg}`;
  consoleEl.appendChild(entry);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function clearLogs(e) {
  if (e) e.stopPropagation();
  document.getElementById('log-console').innerHTML = '<div class="log-entry log-info">[System] Logs cleared.</div>';
}

function toggleLogConsole() {
  const body = document.getElementById('log-console');
  const chevron = document.getElementById('log-chevron');
  body.classList.toggle('hidden');
  chevron.style.transform = body.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerText = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


// --- Developer Profile Modal ---

function openDeveloperModal() {
  const modal = document.getElementById('developer-modal');
  if (modal) {
    modal.classList.remove('hidden');
    lucide.createIcons({ root: document.getElementById('developer-modal') });
  }
}

function closeDeveloperModal() {
  const modal = document.getElementById('developer-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function handleDevModalOverlayClick(event) {
  if (event.target && event.target.id === 'developer-modal') {
    closeDeveloperModal();
  }
}


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
  pollInterval: null,
  smtpConfig: {
    server: 'smtp.gmail.com',
    port: 587,
    username: '',
    password: '',
    from_name: 'LUMS Dispatcher',
    reply_to: '',
    use_tls: true,
    use_ssl: false
  }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  setupDropzone();
  checkM365Status();
  loadStoredSMTPSettings();
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
      text.innerText = `LUMS: ${data.user.displayName || data.user.email}`;
      showM365AuthView(data.user);
      addLog(`[M365] Connected as ${data.user.displayName} (${data.user.email})`, 'success');
    } else {
      appState.m365User = null;
      pill.className = 'auth-pill not-authenticated';
      text.innerText = 'LUMS / M365: Connect';
      showM365UnauthView();
    }
  } catch (err) {
    console.error('Failed to check M365 status', err);
  }
}

function openM365Modal() {
  document.getElementById('m365-modal').classList.remove('hidden');
  lucide.createIcons();
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

    addLog(`[M365] Device Code: ${flow.user_code}. Please visit ${flow.verification_uri}`, 'info');

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
      showToast('Successfully authenticated with LUMS Microsoft 365!', 'success');
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
  document.getElementById('auth-display-name').innerText = user.displayName || 'LUMS User';
  document.getElementById('auth-email').innerText = user.email || '';
  lucide.createIcons();
}

function showM365UnauthView() {
  document.getElementById('m365-unauth-view').classList.remove('hidden');
  document.getElementById('m365-auth-view').classList.add('hidden');
  document.getElementById('device-code-display').classList.add('hidden');
  const btn = document.getElementById('btn-start-m365');
  btn.classList.remove('hidden');
  btn.disabled = false;
  btn.innerText = 'Generate Login Code';
  lucide.createIcons();
}

async function logoutM365() {
  try {
    await fetch('/api/graph/logout', { method: 'POST' });
    showToast('Logged out of LUMS / Microsoft 365', 'info');
    addLog('[M365] Logged out', 'info');
    checkM365Status();
  } catch (err) {
    showToast('Failed to logout', 'error');
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

async function loadSampleData() {
  const btn = document.getElementById('btn-load-sample');
  btn.disabled = true;
  btn.innerText = 'Loading...';

  try {
    const res = await fetch('/api/sample', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      onContactsLoaded(data);
      if (data.templates) {
        document.getElementById('email-subject-input').value = data.templates.email_subject;
        document.getElementById('email-body-input').value = data.templates.email_body;
        document.getElementById('whatsapp-body-input').value = data.templates.whatsapp_body;
      }
      showToast('Loaded sample LUMS contacts!', 'success');
      addLog('[Data] Loaded sample dataset with 5 student contacts', 'success');
    }
  } catch (err) {
    showToast('Failed to load sample data', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="sparkles"></i> Load Sample Data';
    lucide.createIcons();
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
  const cc = getCountryCode();
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
  ['name', 'phone', 'email'].forEach(type => {
    const select = document.getElementById(`map-${type}`);
    select.innerHTML = '<option value="">-- Select Column --</option>';
    columns.forEach(col => {
      const opt = document.createElement('option');
      opt.value = col;
      opt.innerText = col;
      if (detected[`${type}_col`] === col) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  });
  lucide.createIcons();
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

  try {
    const res = await fetch('/api/re-map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name_col,
        phone_col,
        email_col,
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
      showToast('Updated column mapping & phone formats', 'info');
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
    });
  }
  return res;
}


// --- Channel Switcher & Settings ---

function setEmailChannel(channel) {
  appState.emailChannel = channel;
  document.getElementById('channel-opt-graph').classList.toggle('active', channel === 'graph');
  document.getElementById('channel-opt-smtp').classList.toggle('active', channel === 'smtp');
  addLog(`[Config] Email dispatch channel set to: ${channel === 'graph' ? 'LUMS Microsoft 365 (Graph API)' : 'Standard SMTP'}`, 'info');
}

function openSettingsModal() {
  document.getElementById('settings-modal').classList.remove('hidden');
  lucide.createIcons();
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
      document.getElementById('smtp-from-name').value = appState.smtpConfig.from_name || 'LUMS Dispatcher';
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
    lucide.createIcons();
  }
}


// --- Contacts Table & Metrics ---

function updateMetrics() {
  const total = appState.contacts.length;
  const validEmail = appState.contacts.filter(c => c.has_valid_email).length;
  const validPhone = appState.contacts.filter(c => c.has_valid_phone).length;
  const sentCount = appState.contacts.filter(c => c.emailStatus === 'Sent').length;

  document.getElementById('metric-total').innerText = total;
  document.getElementById('metric-valid-email').innerText = validEmail;
  document.getElementById('metric-valid-phone').innerText = validPhone;
  document.getElementById('metric-sent').innerText = sentCount;
}

function renderContactsTable(filterText = '') {
  const tbody = document.getElementById('contacts-table-body');
  tbody.innerHTML = '';

  const filtered = appState.contacts.filter(c => {
    if (!filterText) return true;
    const query = filterText.toLowerCase();
    return c.name.toLowerCase().includes(query) ||
           (c.email_raw && c.email_raw.toLowerCase().includes(query)) ||
           (c.phone_raw && c.phone_raw.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No matching contacts found.</td></tr>`;
    return;
  }

  filtered.forEach(contact => {
    const tr = document.createElement('tr');
    tr.id = `contact-row-${contact.id}`;

    const emailBadge = contact.has_valid_email
      ? `<span class="badge badge-emerald"><i data-lucide="check" class="mini-icon"></i> ${escapeHtml(contact.email_clean)}</span>`
      : `<span class="badge badge-rose" title="Invalid format">${escapeHtml(contact.email_raw || 'None')}</span>`;

    const phoneBadge = contact.has_valid_phone
      ? `<span class="badge badge-emerald">+${escapeHtml(contact.phone_clean)}</span>`
      : `<span class="badge badge-amber">${escapeHtml(contact.phone_raw || 'None')}</span>`;

    const statusBadge = contact.emailStatus === 'Sent'
      ? `<span class="badge badge-emerald">Email Sent</span>`
      : (contact.emailStatus === 'Failed' ? `<span class="badge badge-rose">Failed</span>` : `<span class="badge badge-indigo">Ready</span>`);

    tr.innerHTML = `
      <td>${contact.id}</td>
      <td><strong>${escapeHtml(contact.name)}</strong></td>
      <td>${phoneBadge}</td>
      <td>${emailBadge}</td>
      <td id="status-cell-${contact.id}">${statusBadge}</td>
      <td class="text-right">
        <div class="row-actions">
          <button class="action-btn btn-wa" onclick="openSingleWhatsApp(${contact.id})" ${!contact.has_valid_phone ? 'disabled' : ''} title="Open WhatsApp Chat">
            <i data-lucide="message-circle"></i> WA
          </button>
          <button class="action-btn btn-mail" onclick="sendSingleEmail(${contact.id})" ${!contact.has_valid_email ? 'disabled' : ''} title="Send Email">
            <i data-lucide="send"></i> Send
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  lucide.createIcons();
}

function filterContactsTable() {
  const query = document.getElementById('search-contacts').value;
  renderContactsTable(query);
}


// --- Single & Batch Dispatch ---

async function sendSingleEmail(contactId) {
  const contact = appState.contacts.find(c => c.id === contactId);
  if (!contact || !contact.has_valid_email) {
    showToast('Invalid email contact', 'error');
    return;
  }

  const subjectTmpl = document.getElementById('email-subject-input').value;
  const bodyTmpl = document.getElementById('email-body-input').value;

  // Validation if using Graph API
  if (appState.emailChannel === 'graph' && !appState.m365User) {
    showToast('Please connect your LUMS Microsoft 365 account first!', 'error');
    openM365Modal();
    return;
  }

  const statusCell = document.getElementById(`status-cell-${contactId}`);
  if (statusCell) statusCell.innerHTML = `<span class="spinner"></span>`;

  addLog(`[Email] Sending to ${contact.name} (${contact.email_clean})...`, 'info');

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
      showToast(`Email sent to ${contact.name}!`, 'success');
      addLog(`[Email Success] Sent to ${contact.name} <${contact.email_clean}>`, 'success');
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

async function sendAllEmails() {
  if (appState.contacts.length === 0) {
    showToast('No contacts loaded', 'error');
    return;
  }

  if (appState.emailChannel === 'graph' && !appState.m365User) {
    showToast('Please connect your LUMS Microsoft 365 account first!', 'error');
    openM365Modal();
    return;
  }

  const validContacts = appState.contacts.filter(c => c.has_valid_email);
  if (validContacts.length === 0) {
    showToast('No valid email addresses found', 'error');
    return;
  }

  if (!confirm(`Ready to send ${validContacts.length} emails via ${appState.emailChannel === 'graph' ? 'LUMS Office 365' : 'SMTP'}?`)) {
    return;
  }

  appState.isSendingBatch = true;
  const progressBox = document.getElementById('batch-progress-container');
  const progressFill = document.getElementById('progress-bar-fill');
  const progressText = document.getElementById('progress-status-text');
  const progressPercent = document.getElementById('progress-percent');

  progressBox.classList.remove('hidden');
  addLog(`[Batch] Starting email dispatch for ${validContacts.length} contacts...`, 'info');

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < validContacts.length; i++) {
    const contact = validContacts[i];
    const pct = Math.round(((i + 1) / validContacts.length) * 100);
    progressFill.style.width = `${pct}%`;
    progressPercent.innerText = `${pct}%`;
    progressText.innerText = `Sending email (${i + 1}/${validContacts.length}) to ${contact.name}...`;

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
        addLog(`[Batch Sent] ${contact.name} (${contact.email_clean})`, 'success');
      } else {
        contact.emailStatus = 'Failed';
        failed++;
        addLog(`[Batch Failed] ${contact.name}: ${data.error}`, 'error');
      }
    } catch (e) {
      contact.emailStatus = 'Failed';
      failed++;
    }

    updateMetrics();
    renderContactsTable(document.getElementById('search-contacts').value);
    await new Promise(r => setTimeout(r, 600)); // Gentle rate-limiting delay
  }

  appState.isSendingBatch = false;
  progressText.innerText = `Batch complete! ${sent} Sent, ${failed} Failed.`;
  showToast(`Batch completed: ${sent} Sent, ${failed} Failed`, 'success');
  addLog(`[Batch Complete] Total Sent: ${sent}, Failed: ${failed}`, 'info');
}

function openSingleWhatsApp(contactId) {
  const contact = appState.contacts.find(c => c.id === contactId);
  if (!contact || !contact.has_valid_phone) {
    showToast('No valid phone number for contact', 'error');
    return;
  }

  const waTmpl = document.getElementById('whatsapp-body-input').value;
  const renderedWA = renderTemplate(waTmpl, contact);
  const digits = contact.phone_clean.replace(/\D/g, '');
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(renderedWA)}`;

  window.open(url, '_blank');
  addLog(`[WhatsApp] Opened chat for ${contact.name} (+${digits})`, 'success');
}

async function openAllWhatsApp() {
  const validContacts = appState.contacts.filter(c => c.has_valid_phone);
  if (validContacts.length === 0) {
    showToast('No valid phone contacts found', 'error');
    return;
  }

  if (!confirm(`This will open WhatsApp Click-to-Chat in your browser for all ${validContacts.length} contacts with pre-filled messages. Proceed?`)) {
    return;
  }

  const waTmpl = document.getElementById('whatsapp-body-input').value;
  addLog(`[WhatsApp Batch] Launching chats for ${validContacts.length} contacts...`, 'info');
  showToast(`Launching WhatsApp for ${validContacts.length} contacts...`, 'info');

  try {
    const res = await fetch('/api/whatsapp/open-desktop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template: waTmpl,
        delay: 1.8
      })
    });
    const data = await res.json();
    if (data.success) {
      addLog(`[WhatsApp Batch] Successfully triggered ${data.opened_count} WhatsApp chats`, 'success');
      showToast(`Opened ${data.opened_count} WhatsApp tabs!`, 'success');
    } else {
      throw new Error(data.error || 'Failed to trigger batch');
    }
  } catch (err) {
    // Fallback to opening single first link in window
    validContacts.forEach((contact, idx) => {
      setTimeout(() => {
        const renderedWA = renderTemplate(waTmpl, contact);
        const digits = contact.phone_clean.replace(/\D/g, '');
        const url = `https://wa.me/${digits}?text=${encodeURIComponent(renderedWA)}`;
        window.open(url, '_blank');
      }, idx * 1500);
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

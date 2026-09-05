(() => {
  const config = window.LIQUID_LAB_ADMIN_CONFIG;
  const loginView = document.getElementById('loginView');
  const dashboardView = document.getElementById('dashboardView');
  const loginForm = document.getElementById('loginForm');
  const loginMessage = document.getElementById('loginMessage');
  const dashboardMessage = document.getElementById('dashboardMessage');
  const productGrid = document.getElementById('productGrid');
  const historyList = document.getElementById('historyList');
  const ownerIdentity = document.getElementById('ownerIdentity');
  const signOutButton = document.getElementById('signOutButton');
  const refreshButton = document.getElementById('refreshButton');
  const announcementForm = document.getElementById('announcementForm');
  const announcementEnabled = document.getElementById('announcementEnabled');
  const announcementTitleInput = document.getElementById('announcementTitleInput');
  const announcementMessageInput = document.getElementById('announcementMessageInput');
  const announcementStyle = document.getElementById('announcementStyle');
  const announcementButtonText = document.getElementById('announcementButtonText');
  const announcementButtonUrl = document.getElementById('announcementButtonUrl');
  const announcementPreview = document.getElementById('announcementPreview');
  const announcementMessageStatus = document.getElementById('announcementMessageStatus');
  const saveAnnouncementButton = document.getElementById('saveAnnouncementButton');

  if (!config || !window.supabase) {
    loginMessage.textContent = 'Admin configuration could not be loaded.';
    loginMessage.classList.add('error');
    return;
  }

  const owners = config.ownerEmails.map(email => email.toLowerCase());
  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);

  function isOwner(email) { return owners.includes((email || '').toLowerCase()); }
  function showMessage(element, text, error = false) {
    element.textContent = text;
    element.classList.toggle('error', error);
  }

  async function renderDashboard(session) {
    const email = session?.user?.email || '';
    if (!session || !isOwner(email)) {
      if (session) await db.auth.signOut();
      loginView.hidden = false;
      dashboardView.hidden = true;
      signOutButton.hidden = true;
      ownerIdentity.textContent = '';
      if (session) showMessage(loginMessage, 'This account is not approved for owner access.', true);
      return;
    }

    loginView.hidden = true;
    dashboardView.hidden = false;
    signOutButton.hidden = false;
    ownerIdentity.textContent = email;
    await loadDashboard();
  }

  function productRow(product) {
    const row = document.createElement('article');
    row.className = `admin-product ${product.status}`;
    const info = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = product.product_name;
    const status = document.createElement('span');
    status.className = 'status-label';
    status.textContent = product.status === 'paused' ? 'Paused on public store' : 'Available on public store';
    info.append(title, status);

    const actions = document.createElement('div');
    actions.className = 'status-actions';
    ['available', 'paused'].forEach(nextStatus => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `status-button ${nextStatus} ${product.status === nextStatus ? 'active' : ''}`;
      button.textContent = nextStatus === 'available' ? 'Available' : 'Pause';
      button.addEventListener('click', () => updateStatus(product.product_id, nextStatus, row));
      actions.appendChild(button);
    });
    row.append(info, actions);
    return row;
  }

  async function loadDashboard() {
    showMessage(dashboardMessage, '');
    productGrid.innerHTML = '<p class="empty">Loading products…</p>';
    const [{ data: products, error: productError }, { data: history, error: historyError }] = await Promise.all([
      db.from('product_controls').select('product_id,product_name,status,sort_order').order('sort_order'),
      db.from('product_change_log').select('product_name,old_status,new_status,changed_by,changed_at').order('changed_at', { ascending: false }).limit(25)
    ]);

    await loadAnnouncement();

    if (productError) {
      productGrid.innerHTML = '';
      showMessage(dashboardMessage, `Could not load products: ${productError.message}`, true);
      return;
    }

    productGrid.innerHTML = '';
    products.forEach(product => productGrid.appendChild(productRow(product)));
    if (!products.length) productGrid.innerHTML = '<p class="empty">No products found. Run the included Supabase setup file.</p>';

    historyList.innerHTML = '';
    if (historyError || !history?.length) {
      historyList.innerHTML = '<p class="empty">No owner changes yet.</p>';
      return;
    }
    history.forEach(item => {
      const row = document.createElement('div');
      row.className = 'history-item';
      const detail = document.createElement('div');
      detail.textContent = `${item.product_name}: ${item.old_status || 'new'} → ${item.new_status}`;
      const meta = document.createElement('small');
      meta.textContent = `${item.changed_by} • ${new Date(item.changed_at).toLocaleString()}`;
      row.append(detail, meta);
      historyList.appendChild(row);
    });
  }

  function updateAnnouncementPreview() {
    announcementPreview.dataset.style = announcementStyle.value;
    announcementPreview.querySelector('strong').textContent = announcementTitleInput.value.trim() || 'Service Update';
    announcementPreview.querySelector('span').textContent = announcementMessageInput.value.trim() || 'Your announcement preview appears here.';
  }

  async function loadAnnouncement() {
    const { data, error } = await db.from('site_announcement').select('*').eq('id', 1).maybeSingle();
    if (error) {
      showMessage(announcementMessageStatus, `Could not load announcement: ${error.message}`, true);
      return;
    }
    if (!data) return;
    announcementEnabled.checked = data.enabled;
    announcementTitleInput.value = data.title || '';
    announcementMessageInput.value = data.message || '';
    announcementStyle.value = data.style || 'info';
    announcementButtonText.value = data.button_text || '';
    announcementButtonUrl.value = data.button_url || '';
    updateAnnouncementPreview();
  }

  async function saveAnnouncement(event) {
    event.preventDefault();
    const title = announcementTitleInput.value.trim();
    const message = announcementMessageInput.value.trim();
    if (announcementEnabled.checked && (!title || !message)) {
      showMessage(announcementMessageStatus, 'Add both a title and message before turning the announcement on.', true);
      return;
    }
    saveAnnouncementButton.disabled = true;
    showMessage(announcementMessageStatus, 'Publishing…');
    const { error } = await db.from('site_announcement').update({
      enabled: announcementEnabled.checked,
      title,
      message,
      style: announcementStyle.value,
      button_text: announcementButtonText.value.trim(),
      button_url: announcementButtonUrl.value.trim()
    }).eq('id', 1);
    saveAnnouncementButton.disabled = false;
    showMessage(announcementMessageStatus, error ? `Could not publish: ${error.message}` : 'Published. Refresh the public website to see it.', Boolean(error));
  }

  async function updateStatus(productId, status, row) {
    row.querySelectorAll('button').forEach(button => button.disabled = true);
    const { error } = await db.from('product_controls').update({ status }).eq('product_id', productId);
    if (error) {
      showMessage(dashboardMessage, `Could not save: ${error.message}`, true);
      row.querySelectorAll('button').forEach(button => button.disabled = false);
      return;
    }
    showMessage(dashboardMessage, 'Saved. The public store will use the new status on refresh.');
    await loadDashboard();
  }

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const email = loginForm.email.value.trim().toLowerCase();
    if (!isOwner(email)) {
      showMessage(loginMessage, 'That email is not approved for owner access.', true);
      return;
    }
    showMessage(loginMessage, 'Sending secure login link…');
    const redirectTo = new URL('admin.html', window.location.href).href.split('#')[0].split('?')[0];
    const { error } = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    showMessage(loginMessage, error ? error.message : 'Check your email and click the secure login link.', Boolean(error));
  });

  signOutButton.addEventListener('click', async () => { await db.auth.signOut(); });
  refreshButton.addEventListener('click', loadDashboard);
  announcementForm.addEventListener('submit', saveAnnouncement);
  [announcementTitleInput, announcementMessageInput, announcementStyle].forEach(input => input.addEventListener('input', updateAnnouncementPreview));
  db.auth.onAuthStateChange((_event, session) => { setTimeout(() => renderDashboard(session), 0); });
  db.auth.getSession().then(({ data }) => renderDashboard(data.session));
})();

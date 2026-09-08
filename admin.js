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
  let expandedProductId = '';

  function isOwner(email) { return owners.includes((email || '').toLowerCase()); }
  function showMessage(element, text, error = false) {
    element.textContent = text;
    element.classList.toggle('error', error);
  }

  function escapeAttribute(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
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

  function statusButtons(currentStatus, onChange) {
    const actions = document.createElement('div');
    actions.className = 'status-actions';
    ['available', 'paused'].forEach(nextStatus => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `status-button ${nextStatus} ${currentStatus === nextStatus ? 'active' : ''}`;
      button.textContent = nextStatus === 'available' ? 'Available' : 'Pause';
      button.addEventListener('click', onChange(nextStatus));
      actions.appendChild(button);
    });
    return actions;
  }

  function saleEditor(record, table, idColumn, idValue, row) {
    const panel = document.createElement('details');
    panel.className = `sale-editor ${record.sale_enabled ? 'sale-live' : ''}`;

    const summary = document.createElement('summary');
    summary.innerHTML = `<span><strong>${record.sale_enabled ? '🔥 SALE LIVE' : 'Add a sale'}</strong><small>${record.sale_enabled ? `${escapeAttribute(record.sale_label || 'SALE')} • $${Number(record.sale_price).toFixed(2)}` : 'Special price + Stripe checkout link'}</small></span><b>+</b>`;

    const form = document.createElement('form');
    form.className = 'sale-form';
    form.innerHTML = `
      <label>Sale price<input class="sale-price-input" type="number" min="0.01" step="0.01" placeholder="19.99" value="${escapeAttribute(record.sale_price)}"></label>
      <label>Sale badge<input class="sale-label-input" type="text" maxlength="30" placeholder="WEEKEND SALE" value="${escapeAttribute(record.sale_label)}"></label>
      <label class="sale-link-field">Discounted Stripe link<input class="sale-link-input" type="url" maxlength="500" placeholder="https://buy.stripe.com/..." value="${escapeAttribute(record.sale_link)}"></label>
      <div class="sale-form-actions">
        <button class="primary-button start-sale-button" type="submit">${record.sale_enabled ? 'Update Sale' : 'Start Sale'}</button>
        <button class="ghost-button end-sale-button" type="button" ${record.sale_enabled ? '' : 'disabled'}>End Sale</button>
      </div>`;

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const price = Number(form.querySelector('.sale-price-input').value);
      const label = form.querySelector('.sale-label-input').value.trim() || 'SALE';
      const link = form.querySelector('.sale-link-input').value.trim();
      if (!Number.isFinite(price) || price <= 0 || !/^https:\/\//i.test(link)) {
        showMessage(dashboardMessage, 'Enter a valid sale price and full https:// Stripe link.', true);
        return;
      }
      await updateSale(table, idColumn, idValue, { sale_enabled: true, sale_price: price, sale_label: label, sale_link: link }, row);
    });

    form.querySelector('.end-sale-button').addEventListener('click', async () => {
      await updateSale(table, idColumn, idValue, { sale_enabled: false }, row);
    });

    panel.append(summary, form);
    return panel;
  }

  function productRow(product, options) {
    const row = document.createElement('article');
    row.className = `admin-product product-accordion ${product.status}`;
    row.dataset.productId = product.product_id;
    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'product-summary';
    summary.setAttribute('aria-expanded', String(expandedProductId === product.product_id));
    const info = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = product.product_name;
    const status = document.createElement('span');
    status.className = 'status-label';
    status.textContent = product.status === 'paused' ? 'Paused on public store' : 'Available on public store';
    info.append(title, status);
    const chevron = document.createElement('span');
    chevron.className = 'accordion-chevron';
    chevron.textContent = '⌄';
    summary.append(info, chevron);

    const body = document.createElement('div');
    body.className = 'product-accordion-body';
    body.hidden = expandedProductId !== product.product_id;

    const wholeProduct = document.createElement('div');
    wholeProduct.className = 'control-row main-control-row';
    const wholeLabel = document.createElement('div');
    wholeLabel.innerHTML = '<strong>Entire product</strong><small>Pause every option and block checkout</small>';
    wholeProduct.append(wholeLabel, statusButtons(product.status, nextStatus => event => {
      event.stopPropagation();
      updateStatus(product.product_id, nextStatus, row);
    }));
    body.appendChild(wholeProduct);
    body.appendChild(saleEditor(product, 'product_controls', 'product_id', product.product_id, row));

    if (options.length) {
      const optionHeading = document.createElement('p');
      optionHeading.className = 'option-heading';
      optionHeading.textContent = 'DROPDOWN OPTIONS';
      body.appendChild(optionHeading);
      options.forEach(option => {
        const optionRow = document.createElement('div');
        optionRow.className = `control-row option-control-row ${option.status}`;
        const optionInfo = document.createElement('div');
        const optionName = document.createElement('strong');
        optionName.textContent = option.option_name;
        const optionState = document.createElement('small');
        optionState.textContent = option.status === 'paused' ? 'Unavailable on store' : 'Available on store';
        optionInfo.append(optionName, optionState);
        optionRow.append(optionInfo, statusButtons(option.status, nextStatus => () => updateOptionStatus(option.id, nextStatus, row)));
        body.appendChild(optionRow);
        body.appendChild(saleEditor(option, 'product_option_controls', 'id', option.id, row));
      });
    } else {
      const noOptions = document.createElement('p');
      noOptions.className = 'no-options';
      noOptions.textContent = 'This product has no dropdown options.';
      body.appendChild(noOptions);
    }

    summary.addEventListener('click', () => {
      const opening = body.hidden;
      document.querySelectorAll('.product-accordion-body').forEach(panel => { panel.hidden = true; });
      document.querySelectorAll('.product-summary').forEach(button => button.setAttribute('aria-expanded', 'false'));
      body.hidden = !opening;
      summary.setAttribute('aria-expanded', String(opening));
      expandedProductId = opening ? product.product_id : '';
    });

    row.append(summary, body);
    return row;
  }

  async function loadDashboard() {
    showMessage(dashboardMessage, '');
    productGrid.innerHTML = '<p class="empty">Loading products…</p>';
    const [{ data: products, error: productError }, { data: options, error: optionError }, { data: history, error: historyError }] = await Promise.all([
      db.from('product_controls').select('product_id,product_name,status,sort_order,sale_enabled,sale_price,sale_label,sale_link').order('sort_order'),
      db.from('product_option_controls').select('id,product_id,option_index,option_name,status,sale_enabled,sale_price,sale_label,sale_link').order('option_index'),
      db.from('product_change_log').select('product_name,old_status,new_status,changed_by,changed_at').order('changed_at', { ascending: false }).limit(25)
    ]);

    await loadAnnouncement();

    if (productError) {
      productGrid.innerHTML = '';
      showMessage(dashboardMessage, `Could not load products: ${productError.message}`, true);
      return;
    }

    productGrid.innerHTML = '';
    products.forEach(product => productGrid.appendChild(productRow(product, optionError ? [] : options.filter(option => option.product_id === product.product_id))));
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
    const { data: savedAnnouncement, error } = await db.from('site_announcement').update({
      enabled: announcementEnabled.checked,
      title,
      message,
      style: announcementStyle.value,
      button_text: announcementButtonText.value.trim(),
      button_url: announcementButtonUrl.value.trim()
    }).eq('id', 1).select('id').maybeSingle();
    saveAnnouncementButton.disabled = false;
    const saveError = error || (!savedAnnouncement ? new Error('Supabase did not update the announcement. Run ADMIN-PERMISSIONS-REPAIR.sql.') : null);
    showMessage(announcementMessageStatus, saveError ? `Could not publish: ${saveError.message}` : 'Published. Refresh the public website to see it.', Boolean(saveError));
  }

  async function updateStatus(productId, status, row) {
    row.querySelectorAll('button').forEach(button => button.disabled = true);
    const { data: savedProduct, error } = await db.from('product_controls').update({ status }).eq('product_id', productId).select('product_id').maybeSingle();
    const saveError = error || (!savedProduct ? new Error('Supabase did not update this product. Run ADMIN-PERMISSIONS-REPAIR.sql.') : null);
    if (saveError) {
      showMessage(dashboardMessage, `Could not save: ${saveError.message}`, true);
      row.querySelectorAll('button').forEach(button => button.disabled = false);
      return;
    }
    showMessage(dashboardMessage, 'Saved. The public store will use the new status on refresh.');
    await loadDashboard();
  }

  async function updateOptionStatus(optionId, status, row) {
    row.querySelectorAll('button').forEach(button => button.disabled = true);
    const { data: savedOption, error } = await db.from('product_option_controls').update({ status }).eq('id', optionId).select('id').maybeSingle();
    const saveError = error || (!savedOption ? new Error('Supabase did not update this option. Run ADMIN-PERMISSIONS-REPAIR.sql.') : null);
    if (saveError) {
      showMessage(dashboardMessage, `Could not save option: ${saveError.message}`, true);
      row.querySelectorAll('button').forEach(button => button.disabled = false);
      return;
    }
    showMessage(dashboardMessage, 'Option saved. Refresh the public store to see the change.');
    await loadDashboard();
  }

  async function updateSale(table, idColumn, idValue, payload, row) {
    row.querySelectorAll('.sale-form button').forEach(button => button.disabled = true);
    const { data, error } = await db.from(table).update(payload).eq(idColumn, idValue).select(idColumn).maybeSingle();
    const saveError = error || (!data ? new Error('Supabase did not update this sale. Run SALES-SETUP.sql.') : null);
    if (saveError) {
      showMessage(dashboardMessage, `Could not save sale: ${saveError.message}`, true);
      row.querySelectorAll('.sale-form button').forEach(button => button.disabled = false);
      return;
    }
    showMessage(dashboardMessage, payload.sale_enabled === false ? 'Sale ended. The regular price and link are restored.' : 'Sale is live. Refresh the public store to see it.');
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

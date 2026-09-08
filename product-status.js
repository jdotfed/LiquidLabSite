(() => {
  const config = window.LIQUID_LAB_ADMIN_CONFIG;
  if (!config || !window.supabase) return;

  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);

  function setCardStatus(card, status) {
    const paused = status === 'paused';
    card.dataset.paused = paused ? 'true' : 'false';

    const stock = card.querySelector('.stock');
    if (stock) {
      if (!stock.dataset.originalHtml) stock.dataset.originalHtml = stock.innerHTML;
      if (!stock.dataset.originalStyle) stock.dataset.originalStyle = stock.getAttribute('style') || '';
      stock.innerHTML = paused ? '<i></i> TEMPORARILY UNAVAILABLE' : '<i></i> IN STOCK';
      stock.style.color = paused ? '#aaaab4' : '';
    }

    card.querySelectorAll('select').forEach(select => {
      select.disabled = paused;
      select.setAttribute('aria-disabled', String(paused));
    });

    card.querySelectorAll('.buy-btn').forEach(button => {
      if (!button.dataset.originalHref && button.getAttribute('href')) {
        button.dataset.originalHref = button.getAttribute('href');
      }

      if (button.dataset.originalStyle === undefined) {
        button.dataset.originalStyle = button.getAttribute('style') || '';
      }

      if (paused) {
        button.removeAttribute('href');
        button.setAttribute('aria-disabled', 'true');
        button.setAttribute('tabindex', '-1');
        button.style.pointerEvents = 'none';
        button.style.opacity = '.58';
        button.style.cursor = 'not-allowed';
        button.textContent = 'Temporarily Unavailable';
        return;
      }

      const select = card.querySelector('select');
      const selectedLink = select?.options[select.selectedIndex]?.dataset.link;
      const restoredLink = selectedLink || button.dataset.originalHref;
      if (restoredLink) button.setAttribute('href', restoredLink);
      button.removeAttribute('aria-disabled');
      button.removeAttribute('tabindex');
      if (button.dataset.originalStyle) {
        button.setAttribute('style', button.dataset.originalStyle);
      } else {
        button.removeAttribute('style');
      }
      button.innerHTML = 'Buy Product <span>→</span>';
    });
  }

  function setOptionStatuses(card, optionRows) {
    const select = card.querySelector('select');
    if (!select) return;

    optionRows.forEach(row => {
      const option = select.options[row.option_index];
      if (!option) return;
      if (!option.dataset.originalLabel) {
        option.dataset.originalLabel = option.textContent.replace(/ — (?:Temporarily )?Unavailable$/, '');
      }
      const paused = row.status === 'paused';
      option.disabled = paused;
      if (paused) {
        option.dataset.paused = 'true';
      } else {
        delete option.dataset.paused;
      }
      option.textContent = `${option.dataset.originalLabel}${paused ? ' — Unavailable' : ''}`;
    });

    if (select.options[select.selectedIndex]?.disabled) {
      const firstAvailable = [...select.options].find(option => !option.disabled);
      if (firstAvailable) {
        select.value = firstAvailable.value;
        firstAvailable.selected = true;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    const allPaused = [...select.options].every(option => option.disabled);
    if (allPaused && card.dataset.paused !== 'true') {
      const button = card.querySelector('.buy-btn');
      const stock = card.querySelector('.stock');
      select.disabled = true;
      if (stock) {
        stock.innerHTML = '<i></i> TEMPORARILY UNAVAILABLE';
        stock.style.color = '#aaaab4';
      }
      if (button) {
        button.removeAttribute('href');
        button.setAttribute('aria-disabled', 'true');
        button.style.pointerEvents = 'none';
        button.style.opacity = '.58';
        button.textContent = 'Temporarily Unavailable';
      }
    }

    // Refresh the displayed price and checkout button after live statuses apply.
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function loadProductStatuses() {
    const [{ data: products, error: productError }, { data: options, error: optionError }] = await Promise.all([
      db.from('product_controls').select('product_id,status'),
      db.from('product_option_controls').select('product_id,option_index,status')
    ]);

    if (productError || !products) {
      console.warn('Live product availability could not be loaded. Using built-in website statuses.');
      return;
    }

    products.forEach(product => {
      const card = document.querySelector(`[data-product-id="${product.product_id}"]`);
      if (card) setCardStatus(card, product.status);
    });

    if (!optionError && options) {
      products.forEach(product => {
        const card = document.querySelector(`[data-product-id="${product.product_id}"]`);
        if (card) setOptionStatuses(card, options.filter(option => option.product_id === product.product_id));
      });
    }
  }

  loadProductStatuses();
})();

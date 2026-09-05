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

  async function loadProductStatuses() {
    const { data, error } = await db
      .from('product_controls')
      .select('product_id,status');

    if (error || !data) {
      console.warn('Live product availability could not be loaded. Using built-in website statuses.');
      return;
    }

    data.forEach(product => {
      const card = document.querySelector(`[data-product-id="${product.product_id}"]`);
      if (card) setCardStatus(card, product.status);
    });
  }

  loadProductStatuses();
})();

(() => {
  const config = window.LIQUID_LAB_ADMIN_CONFIG;
  const banner = document.getElementById('siteAnnouncement');
  if (!config || !window.supabase || !banner) return;

  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  const title = document.getElementById('announcementTitle');
  const message = document.getElementById('announcementMessage');
  const icon = document.getElementById('announcementIcon');
  const link = document.getElementById('announcementButton');
  const dismiss = document.getElementById('announcementDismiss');
  const icons = { info: '📢', important: '⚠️', sale: '🏷️', maintenance: '🛠️' };

  function safeButtonUrl(value) {
    if (!value) return '';
    if (value.startsWith('#') || value.startsWith('/')) return value;
    try {
      const url = new URL(value, window.location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }

  async function loadAnnouncement() {
    const { data, error } = await db.from('site_announcement').select('*').eq('id', 1).maybeSingle();
    if (error || !data?.enabled || !data.title || !data.message) return;

    const version = String(data.updated_at || `${data.title}:${data.message}`);
    if (localStorage.getItem('liquidlab-dismissed-announcement') === version) return;

    banner.dataset.style = data.style || 'info';
    banner.dataset.version = version;
    icon.textContent = icons[data.style] || icons.info;
    title.textContent = data.title;
    message.textContent = data.message;

    const buttonUrl = safeButtonUrl(data.button_url);
    if (data.button_text && buttonUrl) {
      link.textContent = data.button_text;
      link.href = buttonUrl;
      link.hidden = false;
    } else {
      link.hidden = true;
    }
    banner.hidden = false;
  }

  dismiss.addEventListener('click', () => {
    localStorage.setItem('liquidlab-dismissed-announcement', banner.dataset.version || 'dismissed');
    banner.hidden = true;
  });

  loadAnnouncement();
})();

(() => {
  const POPUP_ID = 'yt-thumb-preview-popup';
  const HOVER_DELAY = 50;
  const LEAVE_DELAY = 50;
  let isEnabled = true;

  // Check initial storage state
  chrome.storage.sync.get({ enabled: true }, (data) => {
    isEnabled = data.enabled;
  });

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.enabled) {
      isEnabled = changes.enabled.newValue;
      if (!isEnabled) {
        hidePopup();
        clearTimeout(hoverTimer);
        clearTimeout(leaveTimer);
      }
    }
  });

  // Cascade fallback thumbnail
  const THUMB_QUALITIES = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default'];

  // Selector thumbnail yang mencakup SEMUA layout YouTube
  const THUMB_SELECTOR = [
    'a#thumbnail',                          // thumbnail standar
    'a.ytd-thumbnail',                      // thumbnail di playlist
    'a[href*="watch?v="]',                  // link video biasa
    'a[href*="/shorts/"]',                  // Shorts
    'a[href*="/embed/"]',                   // embed
    'ytd-thumbnail a',                      // fallback tambahan
    'ytd-playlist-thumbnail a'              // thumbnail playlist
  ].join(',');

  // Container renderer untuk mencari judul video
  const CONTAINER_SELECTOR = [
    'ytd-playlist-video-renderer',          // Watch Later / Playlist
    'ytd-rich-item-renderer',               // Beranda (rich grid)
    'ytd-video-renderer',                   // Search / Trending / Subscriptions
    'ytd-grid-video-renderer',              // Channel tab Videos (legacy)
    'ytd-compact-video-renderer',           // Sidebar rekomendasi
    'ytd-reel-item-renderer',               // Shorts shelf
    'ytd-compact-radio-renderer',
    'ytd-compact-playlist-renderer',
    'ytd-radio-renderer',
    'ytd-playlist-renderer',
    'ytd-playlist-panel-video-renderer',    // Queue / Up next
    'ytd-grid-playlist-renderer',
    'ytd-grid-movie-renderer',
    'ytd-movie-renderer'
  ].join(',');

  let popup = null;
  let hoverTimer = null;
  let leaveTimer = null;
  let currentVideoId = null;
  let imageRequestId = 0;

  function createPopup() {
    if (popup) return popup;
    popup = document.createElement('div');
    popup.id = POPUP_ID;
    popup.innerHTML = '<img alt=""><div class="yt-preview-title"></div>';
    document.body.appendChild(popup);
    return popup;
  }

  // Ekstrak videoId dari berbagai format URL YouTube
  function getVideoId(el) {
    const anchor = el.closest(THUMB_SELECTOR);
    if (!anchor) return null;
    const href = anchor.getAttribute('href') || '';

    // Format: /watch?v=XXXXX
    let m = href.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (m) return m[1];

    // Format: /shorts/XXXXX
    m = href.match(/\/shorts\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];

    // Format: /embed/XXXXX
    m = href.match(/\/embed\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];

    // Format: youtu.be/XXXXX
    m = href.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];

    return null;
  }

  function getTitle(el) {
    const container = el.closest(CONTAINER_SELECTOR);
    if (!container) return '';

    // Prioritas: aria-label > title attribute > #video-title text
    const titleEl =
      container.querySelector('#video-title') ||
      container.querySelector('a#video-title-link') ||
      container.querySelector('h3 a') ||
      container.querySelector('a[href*="watch?v="]');

    if (!titleEl) return '';

    return (
      titleEl.getAttribute('aria-label') ||
      titleEl.getAttribute('title') ||
      titleEl.textContent || ''
    ).trim();
  }

  function buildThumbUrls(videoId) {
    return THUMB_QUALITIES.map(q => `https://i.ytimg.com/vi/${videoId}/${q}.jpg`);
  }

  function positionPopup(e) {
    if (!popup) return;
    const rect = popup.getBoundingClientRect();
    const pad = 16;
    let x = e.clientX + pad;
    let y = e.clientY + pad;
    if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - pad;
    if (x < 0) x = pad;
    if (y < 0) y = pad;
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
  }

  function showPopup(videoId, title, e) {
    if (!isEnabled) return;
    const p = createPopup();
    const img = p.querySelector('img');
    const titleEl = p.querySelector('.yt-preview-title');

    const urls = buildThumbUrls(videoId);
    const requestId = ++imageRequestId;

    img.style.display = 'none';
    img.removeAttribute('src');

    const tryQuality = (idx) => {
      if (!isEnabled || requestId !== imageRequestId || idx >= urls.length) return;

      const candidate = new Image();
      candidate.onload = () => {
        if (!isEnabled || requestId !== imageRequestId) return;

        // URL kualitas tinggi yang tidak tersedia kadang tetap mengembalikan gambar 120x90.
        if (idx < urls.length - 1 && (candidate.naturalWidth <= 120 || candidate.naturalHeight <= 90)) {
          tryQuality(idx + 1);
          return;
        }

        img.src = urls[idx];
        img.style.display = 'block';
      };
      candidate.onerror = () => tryQuality(idx + 1);
      candidate.src = urls[idx];
    };

    tryQuality(0);

    titleEl.textContent = title || '';
    titleEl.style.display = title ? 'block' : 'none';

    positionPopup(e);
    p.classList.add('visible');
    currentVideoId = videoId;
  }

  function hidePopup() {
    if (popup) popup.classList.remove('visible');
    currentVideoId = null;
  }

  // Event delegation di document → tahan terhadap YouTube SPA navigation
  document.addEventListener('mouseover', (e) => {
    if (!isEnabled) return;
    const thumb = e.target.closest(THUMB_SELECTOR);
    if (!thumb) return;

    const videoId = getVideoId(thumb);
    if (!videoId) return;

    clearTimeout(leaveTimer);

    if (videoId === currentVideoId && popup && popup.classList.contains('visible')) {
      positionPopup(e);
      return;
    }

    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      const title = getTitle(thumb);
      showPopup(videoId, title, e);
    }, HOVER_DELAY);
  });

  document.addEventListener('mousemove', (e) => {
    if (!isEnabled) return;
    if (popup && popup.classList.contains('visible')) positionPopup(e);
  });

  document.addEventListener('mouseout', (e) => {
    if (!isEnabled) return;
    const thumb = e.target.closest(THUMB_SELECTOR);
    if (!thumb) return;
    clearTimeout(hoverTimer);
    leaveTimer = setTimeout(hidePopup, LEAVE_DELAY);
  });

  window.addEventListener('scroll', () => {
    hidePopup();
    clearTimeout(hoverTimer);
  }, { passive: true });
})();
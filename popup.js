document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('enabledToggle');
  const statusText = document.getElementById('statusText');

  // Load saved state (default true)
  chrome.storage.sync.get({ enabled: true }, (data) => {
    toggle.checked = data.enabled;
    updateStatus(data.enabled);
  });

  // Save state on change
  toggle.addEventListener('change', () => {
    const isEnabled = toggle.checked;
    chrome.storage.sync.set({ enabled: isEnabled }, () => {
      updateStatus(isEnabled);
    });
  });

  function updateStatus(enabled) {
    statusText.textContent = enabled ? 'Status: Aktif' : 'Status: Nonaktif';
  }
});

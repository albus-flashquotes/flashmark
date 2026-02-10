// Arcify - New Tab Page

// Auto-refresh when extension reloads (context invalidated)
chrome.runtime.onMessage.addListener(() => {});
setInterval(() => {
  if (!chrome.runtime?.id) {
    location.reload();
  }
}, 500);

// Check if we just reloaded - show toast
chrome.storage.local.get(['showReloadToast']).then(({ showReloadToast }) => {
  if (showReloadToast) {
    chrome.storage.local.remove('showReloadToast');
    setTimeout(() => showToast('✓ Reloaded'), 100);
  }
});

const input = document.querySelector('.fm-input');
const resultsList = document.querySelector('.fm-results');
const clearBtn = document.querySelector('.fm-clear-btn');
const container = document.querySelector('.fm-container');

let selectedIndex = 0;
let currentResults = [];
let settingsMode = null; // null or { actionId, ... }

// Debounce helper
function debounce(fn, ms) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}

// Escape HTML
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Update clear button visibility
function updateClearButton() {
  const hasText = input.value.length > 0;
  clearBtn.classList.toggle('fm-visible', hasText);
}

// Clear search
function clearSearch() {
  input.value = '';
  resultsList.innerHTML = '';
  currentResults = [];
  selectedIndex = 0;
  updateClearButton();
  input.focus();
}

// Search handler
async function onSearch() {
  const query = input.value.trim();
  if (!query) {
    resultsList.innerHTML = '';
    currentResults = [];
    return;
  }

  const response = await chrome.runtime.sendMessage({ action: 'search', query });
  // Priority: tabs first, then bookmarks, then actions last
  currentResults = [
    ...response.tabs,
    ...(response.bookmarksPrimary || []),
    ...(response.bookmarksSecondary || []),
    ...(response.bookmarks || []),
    ...response.actions
  ];
  selectedIndex = 0;
  renderResults();
}

// Render results
function renderResults() {
  if (currentResults.length === 0) {
    resultsList.innerHTML = '<div class="fm-empty">No results found</div>';
    updateFooter();
    return;
  }

  resultsList.innerHTML = currentResults.map((r, i) => {
    let favicon, badge, subtitle;

    if (r.type === 'action') {
      favicon = `<span class="fm-action-icon">${r.icon}</span>`;
      badge = '<span class="fm-badge fm-badge-action">ACTION</span>';
      subtitle = r.description;
    } else {
      const faviconUrl = r.favIconUrl || `https://www.google.com/s2/favicons?domain=${r.host}&sz=32`;
      favicon = `<img class="fm-favicon" src="${faviconUrl}" alt="" onerror="this.style.opacity='0.3'">`;
      badge = r.type === 'tab' 
        ? '<span class="fm-badge fm-badge-tab">TAB</span>'
        : '<span class="fm-badge fm-badge-bookmark">★</span>';
      // If title is just the host, show full URL as subtitle instead
      subtitle = (r.title === r.host) ? r.url : r.host;
    }

    return `
      <div class="fm-result ${i === selectedIndex ? 'fm-selected' : ''}" data-index="${i}">
        ${favicon}
        <div class="fm-result-text">
          <div class="fm-title">${escapeHtml(r.title)}</div>
          <div class="fm-url">${escapeHtml(subtitle)}</div>
        </div>
        ${badge}
      </div>
    `;
  }).join('');
  
  updateFooter();

  // Add click handlers
  resultsList.querySelectorAll('.fm-result').forEach(el => {
    el.addEventListener('click', () => {
      selectResult(parseInt(el.dataset.index));
    });
  });
}

// Handle keyboard
function onKeyDown(e) {
  if (e.key === 'Escape') {
    if (input.value) {
      clearSearch();
    }
    e.preventDefault();
  } else if (e.key === 'ArrowDown') {
    selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
    renderResults();
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    selectedIndex = Math.max(selectedIndex - 1, 0);
    renderResults();
    e.preventDefault();
  } else if (e.key === 'Enter') {
    selectResult(selectedIndex);
    e.preventDefault();
  } else if (e.key === 'Tab' && !e.shiftKey) {
    // Tab opens settings for actions that have them
    const result = currentResults[selectedIndex];
    if (result?.type === 'action' && result.hasSettings) {
      openActionSettings(result.id);
      e.preventDefault();
    }
  }
}

// Update footer based on selected item
function updateFooter() {
  const footer = document.querySelector('.fm-footer');
  if (!footer) return;
  
  if (settingsMode) {
    footer.innerHTML = `
      <span><kbd>↵</kbd> save</span>
      <span><kbd>esc</kbd> cancel</span>
    `;
    return;
  }
  
  const result = currentResults[selectedIndex];
  const hasSettings = result?.type === 'action' && result.hasSettings;
  
  footer.innerHTML = `
    <span><kbd>↑↓</kbd> navigate</span>
    <span><kbd>↵</kbd> open</span>
    ${hasSettings ? '<span><kbd>⇥</kbd> settings</span>' : ''}
    <span><kbd>esc</kbd> clear</span>
  `;
}

// Open inline settings for an action
async function openActionSettings(actionId) {
  if (actionId === 'reset') {
    settingsMode = { actionId: 'reset' };
    const { resetUrl } = await chrome.storage.sync.get(['resetUrl']);
    showInlineSettings('reset', resetUrl || '');
  } else if (actionId === 'settings') {
    settingsMode = { actionId: 'settings' };
    const { searchEngine } = await chrome.storage.sync.get(['searchEngine']);
    showSettingsPanel(searchEngine || 'google');
  }
}

function showSettingsPanel(currentEngine) {
  const engines = [
    { id: 'google', name: 'Google' },
    { id: 'duckduckgo', name: 'DuckDuckGo' },
    { id: 'bing', name: 'Bing' },
    { id: 'brave', name: 'Brave Search' },
    { id: 'ecosia', name: 'Ecosia' },
    { id: 'perplexity', name: 'Perplexity AI' },
    { id: 'chatgpt', name: 'ChatGPT' },
    { id: 'gemini', name: 'Gemini' },
    { id: 'claude', name: 'Claude' }
  ];
  
  const options = engines.map(e => 
    `<option value="${e.id}" ${e.id === currentEngine ? 'selected' : ''}>${e.name}</option>`
  ).join('');
  
  resultsList.innerHTML = `
    <div class="fm-inline-settings">
      <div class="fm-settings-header">
        <span class="fm-settings-back" tabindex="0">←</span>
        <div class="fm-settings-title-wrap">
          <span class="fm-settings-title">Settings</span>
          <span class="fm-settings-desc">Configure Arcify preferences</span>
        </div>
      </div>
      <div class="fm-settings-row">
        <div class="fm-settings-label">Search Engine</div>
        <select class="fm-settings-select">
          ${options}
        </select>
      </div>
      <div class="fm-settings-hint">Changes save automatically</div>
    </div>
  `;
  
  const select = resultsList.querySelector('.fm-settings-select');
  const backBtn = resultsList.querySelector('.fm-settings-back');
  
  select.focus();
  
  select.addEventListener('change', async () => {
    await chrome.storage.sync.set({ searchEngine: select.value });
    showToast('✓ Saved');
  });
  
  select.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      exitSettingsMode();
      e.preventDefault();
    }
  });
  
  backBtn.addEventListener('click', exitSettingsMode);
  updateFooter();
}

function showInlineSettings(actionId, currentValue) {
  resultsList.innerHTML = `
    <div class="fm-inline-settings">
      <div class="fm-settings-header">
        <span class="fm-settings-back" tabindex="0">←</span>
        <div class="fm-settings-title-wrap">
          <span class="fm-settings-title">${actionId === 'reset' ? 'Reset URL' : 'Settings'}</span>
          ${actionId === 'reset' ? '<span class="fm-settings-desc">The website to open when you run the Reset action</span>' : ''}
        </div>
      </div>
      <div class="fm-settings-field">
        <input type="text" class="fm-settings-input" value="${escapeHtml(currentValue)}" placeholder="chrome://newtab">
      </div>
      <div class="fm-settings-hint">Press Enter to save, Esc to cancel</div>
    </div>
  `;
  
  const settingsInput = resultsList.querySelector('.fm-settings-input');
  const backBtn = resultsList.querySelector('.fm-settings-back');
  
  settingsInput.focus();
  settingsInput.select();
  
  settingsInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      await saveInlineSetting(actionId, settingsInput.value);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      exitSettingsMode();
      e.preventDefault();
    }
  });
  
  backBtn.addEventListener('click', exitSettingsMode);
  
  updateFooter();
}

async function saveInlineSetting(actionId, value) {
  if (actionId === 'reset') {
    await chrome.storage.sync.set({ resetUrl: value.trim() || 'chrome://newtab' });
    showToast('✓ Saved');
  }
  exitSettingsMode();
}

function exitSettingsMode() {
  settingsMode = null;
  resultsList.innerHTML = '';
  currentResults = [];
  input.value = '';
  input.focus();
  updateFooter();
}

// Select result
async function selectResult(index) {
  const result = currentResults[index];
  if (!result) return;

  if (result.type === 'action') {
    // Reload extension - close palette, reload, toast on return
    if (result.id === 'reload-extension') {
      chrome.storage.local.set({ showReloadToast: true });
      chrome.runtime.sendMessage({ action: 'reload-extension' });
      return;
    }
    
    // Settings action opens inline settings
    if (result.id === 'settings') {
      openActionSettings('settings');
      return;
    }
    
    const response = await chrome.runtime.sendMessage({ action: 'executeAction', actionId: result.id });
    if (response.success) {
      if (result.id === 'cleanup') {
        showToast(`✨ Closed ${response.closed} tabs, kept ${response.kept}`);
      } else if (result.id === 'reset') {
        showToast(`💫 ${response.message}`);
      }
    }
    clearSearch();
  } else {
    await chrome.runtime.sendMessage({ action: 'openResult', result });
  }
}

// Toast notification
function showToast(message) {
  const existing = document.querySelector('.fm-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'fm-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('fm-toast-visible'), 10);
  setTimeout(() => {
    toast.classList.remove('fm-toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// Event listeners
input.addEventListener('input', () => {
  updateClearButton();
  debounce(onSearch, 50)();
});
input.addEventListener('keydown', onKeyDown);
clearBtn.addEventListener('click', clearSearch);

// Focus input when page gets focus (e.g., clicking into the page)
window.addEventListener('focus', () => input.focus());
document.addEventListener('click', () => input.focus());

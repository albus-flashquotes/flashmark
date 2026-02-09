// FlashMark - Content Script (Command Palette UI)

(function() {
  // Prevent double injection
  if (window.__flashmark_loaded) {
    return;
  }
  window.__flashmark_loaded = true;

  let palette = null;
  let input = null;
  let resultsList = null;
  let selectedIndex = 0;
  let currentResults = [];

  function createPalette() {
    if (palette) return palette;

    palette = document.createElement('div');
    palette.id = 'flashmark-palette';
    palette.innerHTML = `
      <div class="fm-backdrop"></div>
      <div class="fm-modal">
        <div class="fm-search-wrap">
          <svg class="fm-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="M21 21l-4.35-4.35"></path>
          </svg>
          <input type="text" class="fm-input" placeholder="Search tabs and bookmarks..." autocomplete="off" spellcheck="false">
          <button class="fm-clear-btn" type="button" aria-label="Clear search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div class="fm-results"></div>
        <div class="fm-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span class="fm-esc-hint"><kbd>esc</kbd> <span class="fm-esc-action">close</span></span>
        </div>
      </div>
    `;

    document.body.appendChild(palette);

    input = palette.querySelector('.fm-input');
    resultsList = palette.querySelector('.fm-results');
    const backdrop = palette.querySelector('.fm-backdrop');
    const clearBtn = palette.querySelector('.fm-clear-btn');

    input.addEventListener('input', () => {
      updateClearButton();
      debounce(onSearch, 50)();
    });
    input.addEventListener('keydown', onKeyDown);
    backdrop.addEventListener('click', hidePalette);
    clearBtn.addEventListener('click', clearSearch);

    return palette;
  }

  function updateClearButton() {
    const hasText = input.value.length > 0;
    const clearBtn = palette?.querySelector('.fm-clear-btn');
    const escAction = palette?.querySelector('.fm-esc-action');
    if (clearBtn) {
      clearBtn.classList.toggle('fm-visible', hasText);
    }
    if (escAction) {
      escAction.textContent = hasText ? 'clear' : 'close';
    }
  }

  function clearSearch() {
    input.value = '';
    resultsList.innerHTML = '';
    currentResults = [];
    selectedIndex = 0;
    updateClearButton();
    input.focus();
  }

  function showPalette() {
    createPalette();
    palette.classList.add('fm-visible');
    input.value = '';
    resultsList.innerHTML = '';
    currentResults = [];
    selectedIndex = 0;
    setTimeout(() => input.focus(), 10);
  }

  function hidePalette() {
    if (palette) {
      palette.classList.remove('fm-visible');
    }
  }

  function togglePalette() {
    if (palette?.classList.contains('fm-visible')) {
      hidePalette();
    } else {
      showPalette();
    }
  }

  async function onSearch() {
    const query = input.value.trim();
    if (!query) {
      resultsList.innerHTML = '';
      currentResults = [];
      return;
    }

    const response = await chrome.runtime.sendMessage({ action: 'search', query });
    currentResults = [...response.actions, ...response.tabs, ...response.bookmarks];
    selectedIndex = 0;
    renderResults();
  }

  function renderResults() {
    if (currentResults.length === 0) {
      resultsList.innerHTML = '<div class="fm-empty">No results found</div>';
      return;
    }

    resultsList.innerHTML = currentResults.map((r, i) => {
      let favicon, badge, subtitle;

      if (r.type === 'action') {
        favicon = `<span class="fm-action-icon">${r.icon}</span>`;
        badge = '<span class="fm-badge fm-badge-action">ACTION</span>';
        subtitle = r.description;
      } else {
        const faviconUrl = r.type === 'tab' && r.favIconUrl 
          ? r.favIconUrl 
          : `https://www.google.com/s2/favicons?domain=${r.host}&sz=32`;
        favicon = `<img class="fm-favicon" src="${faviconUrl}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23666%22><rect width=%2224%22 height=%2224%22 rx=%224%22/></svg>'">`;
        badge = r.type === 'tab' 
          ? '<span class="fm-badge fm-badge-tab">TAB</span>'
          : '<span class="fm-badge fm-badge-bookmark">★</span>';
        subtitle = r.host;
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

    // Add click handlers
    resultsList.querySelectorAll('.fm-result').forEach(el => {
      el.addEventListener('click', () => {
        selectResult(parseInt(el.dataset.index));
      });
    });
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (input.value) {
        clearSearch();
      } else {
        hidePalette();
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
    }
  }

  async function selectResult(index) {
    const result = currentResults[index];
    if (!result) return;
    
    if (result.type === 'action') {
      const response = await chrome.runtime.sendMessage({ action: 'executeAction', actionId: result.id });
      if (response.success) {
        if (result.id === 'cleanup') {
          showToast(`✨ Closed ${response.closed} tabs, kept ${response.kept}`);
        } else if (result.id === 'reset') {
          showToast(`🔄 ${response.message}`);
        }
      }
    } else {
      await chrome.runtime.sendMessage({ action: 'openResult', result });
    }
    hidePalette();
  }

  function showToast(message) {
    const existing = document.getElementById('flashmark-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'flashmark-toast';
    toast.className = 'fm-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('fm-toast-visible'), 10);
    setTimeout(() => {
      toast.classList.remove('fm-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function debounce(fn, ms) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), ms);
    };
  }

  // Listen for toggle message
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'toggle') {
      togglePalette();
    }
  });
})();

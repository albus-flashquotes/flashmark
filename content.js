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
        </div>
        <div class="fm-results"></div>
        <div class="fm-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    `;

    document.body.appendChild(palette);

    input = palette.querySelector('.fm-input');
    resultsList = palette.querySelector('.fm-results');
    const backdrop = palette.querySelector('.fm-backdrop');

    input.addEventListener('input', debounce(onSearch, 50));
    input.addEventListener('keydown', onKeyDown);
    backdrop.addEventListener('click', hidePalette);

    return palette;
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
    currentResults = [...response.tabs, ...response.bookmarks];
    selectedIndex = 0;
    renderResults();
  }

  function renderResults() {
    if (currentResults.length === 0) {
      resultsList.innerHTML = '<div class="fm-empty">No results found</div>';
      return;
    }

    resultsList.innerHTML = currentResults.map((r, i) => {
      const favicon = r.type === 'tab' && r.favIconUrl 
        ? r.favIconUrl 
        : `https://www.google.com/s2/favicons?domain=${r.host}&sz=32`;
      
      const badge = r.type === 'tab' 
        ? '<span class="fm-badge fm-badge-tab">TAB</span>'
        : '<span class="fm-badge fm-badge-bookmark">★</span>';

      return `
        <div class="fm-result ${i === selectedIndex ? 'fm-selected' : ''}" data-index="${i}">
          <img class="fm-favicon" src="${favicon}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23666%22><rect width=%2224%22 height=%2224%22 rx=%224%22/></svg>'">
          <div class="fm-result-text">
            <div class="fm-title">${escapeHtml(r.title)}</div>
            <div class="fm-url">${escapeHtml(r.host)}</div>
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
      hidePalette();
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
    
    await chrome.runtime.sendMessage({ action: 'openResult', result });
    hidePalette();
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

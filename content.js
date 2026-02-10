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
  let settingsMode = null;
  let quickSwitchMode = false;
  let ctrlHeld = false;

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

    // Block all keyboard events from reaching the page when palette is open
    // Use bubble phase (false) so events reach input first, then stop propagating to page
    palette.addEventListener('keydown', (e) => {
      e.stopPropagation();
    }, false);
    palette.addEventListener('keyup', (e) => {
      e.stopPropagation();
    }, false);
    palette.addEventListener('keypress', (e) => {
      e.stopPropagation();
    }, false);

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

    // Add click handlers
    resultsList.querySelectorAll('.fm-result').forEach(el => {
      el.addEventListener('click', () => {
        selectResult(parseInt(el.dataset.index));
      });
    });
    
    // Scroll selected item into view
    const selectedEl = resultsList.querySelector('.fm-selected');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
    
    updateFooter();
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
    } else if (e.key === 'Tab' && !e.shiftKey) {
      // Tab opens settings for actions that have them
      const result = currentResults[selectedIndex];
      if (result?.type === 'action' && result.hasSettings) {
        openActionSettings(result.id);
        e.preventDefault();
      }
    }
  }

  // Open inline settings for an action
  async function openActionSettings(actionId) {
    if (actionId === 'reset') {
      settingsMode = { actionId: 'reset' };
      const { resetUrl } = await chrome.storage.sync.get(['resetUrl']);
      showInlineSettings('reset', resetUrl || '');
    }
  }

  function showInlineSettings(actionId, currentValue) {
    resultsList.innerHTML = `
      <div class="fm-inline-settings">
        <div class="fm-settings-header">
          <span class="fm-settings-back">←</span>
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

  // Update footer based on selected item
  function updateFooter() {
    const footer = palette?.querySelector('.fm-footer');
    if (!footer) return;
    
    if (quickSwitchMode) {
      footer.innerHTML = `
        <span><kbd>ctrl+Q</kbd> next</span>
        <span><kbd>↑↓</kbd> navigate</span>
        <span>release <kbd>ctrl</kbd> to switch</span>
      `;
      return;
    }
    
    if (settingsMode) {
      footer.innerHTML = `
        <span><kbd>↵</kbd> save</span>
        <span><kbd>esc</kbd> cancel</span>
      `;
      return;
    }
    
    const result = currentResults[selectedIndex];
    const hasSettings = result?.type === 'action' && result.hasSettings;
    const hasText = input?.value?.length > 0;
    
    // Contextual action label based on result type
    let actionLabel = 'open';
    if (result?.type === 'tab') {
      actionLabel = 'switch';
    } else if (result?.type === 'action') {
      actionLabel = 'run';
    }
    
    footer.innerHTML = `
      <span><kbd>↑↓</kbd> navigate</span>
      <span><kbd>↵</kbd> ${actionLabel}</span>
      ${hasSettings ? '<span><kbd>⇥</kbd> settings</span>' : ''}
      <span><kbd>esc</kbd> ${hasText ? 'clear' : 'close'}</span>
    `;
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
          showToast(`💫 ${response.message}`);
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

  // Quick Switch mode - show MRU tabs
  async function showQuickSwitch() {
    createPalette();
    quickSwitchMode = true;
    ctrlHeld = true;
    
    // Get MRU tabs
    const tabs = await chrome.runtime.sendMessage({ action: 'getMruTabs' });
    currentResults = tabs;
    
    // Pre-select second item (previous tab) for quick swap
    selectedIndex = tabs.length > 1 ? 1 : 0;
    
    // Hide search input in quick switch mode
    const searchWrap = palette.querySelector('.fm-search-wrap');
    if (searchWrap) searchWrap.style.display = 'none';
    
    palette.classList.add('fm-visible');
    palette.classList.add('fm-quick-switch');
    
    renderResults();
    
    // Listen for Ctrl release to switch
    document.addEventListener('keyup', onQuickSwitchKeyUp);
    document.addEventListener('keydown', onQuickSwitchKeyDown);
  }
  
  function onQuickSwitchKeyDown(e) {
    if (quickSwitchMode) {
      e.preventDefault();
      e.stopPropagation();
      
      if (e.key === 'q' && e.ctrlKey) {
        // Cycle to next tab
        selectedIndex = (selectedIndex + 1) % currentResults.length;
        renderResults();
      } else if (e.key === 'ArrowDown' || e.key === 'Tab') {
        selectedIndex = (selectedIndex + 1) % currentResults.length;
        renderResults();
      } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
        renderResults();
      } else if (e.key === 'Escape') {
        hideQuickSwitch();
      } else if (e.key === 'Enter') {
        switchToSelectedTab();
      }
    }
  }
  
  function onQuickSwitchKeyUp(e) {
    if (quickSwitchMode && e.key === 'Control') {
      // Ctrl released - switch to selected tab
      switchToSelectedTab();
    }
  }
  
  async function switchToSelectedTab() {
    const result = currentResults[selectedIndex];
    if (result?.id) {
      await chrome.runtime.sendMessage({ action: 'switchToTab', tabId: result.id });
    }
    hideQuickSwitch();
  }
  
  function hideQuickSwitch() {
    quickSwitchMode = false;
    ctrlHeld = false;
    
    // Show search input again
    const searchWrap = palette?.querySelector('.fm-search-wrap');
    if (searchWrap) searchWrap.style.display = '';
    
    palette?.classList.remove('fm-quick-switch');
    hidePalette();
    
    document.removeEventListener('keyup', onQuickSwitchKeyUp);
    document.removeEventListener('keydown', onQuickSwitchKeyDown);
  }
  
  // Listen for toggle message
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'toggle') {
      togglePalette();
    }
    if (msg.action === 'quick-switch') {
      if (quickSwitchMode) {
        // Already in quick switch - cycle
        selectedIndex = (selectedIndex + 1) % currentResults.length;
        renderResults();
      } else {
        showQuickSwitch();
      }
    }
  });
})();

// FlashMark - New Tab Page

const input = document.querySelector('.fm-input');
const resultsList = document.querySelector('.fm-results');
const clearBtn = document.querySelector('.fm-clear-btn');

let selectedIndex = 0;
let currentResults = [];

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
  currentResults = [
    ...response.actions,
    ...(response.bookmarksPrimary || []),
    ...response.tabs,
    ...(response.bookmarksSecondary || []),
    ...(response.bookmarks || [])
  ];
  selectedIndex = 0;
  renderResults();
}

// Render results
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
      const faviconUrl = r.favIconUrl || `https://www.google.com/s2/favicons?domain=${r.host}&sz=32`;
      favicon = `<img class="fm-favicon" src="${faviconUrl}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23666%22><rect width=%2224%22 height=%2224%22 rx=%224%22/></svg>'">`;
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
  }
}

// Select result
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

// Auto-focus (override Chrome's address bar focus)
function forceFocus() {
  input.focus();
}
forceFocus();
setTimeout(forceFocus, 10);
setTimeout(forceFocus, 50);
setTimeout(forceFocus, 100);
document.addEventListener('DOMContentLoaded', forceFocus);
window.addEventListener('focus', forceFocus);

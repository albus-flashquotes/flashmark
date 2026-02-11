// Arc - Background Service Worker

// MRU (Most Recently Used) tab tracking
let mruTabIds = []; // Ordered list of tab IDs, most recent first

// Initialize MRU from current tabs
async function initMruList() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  // Start with current tab order, active tab first
  const activeTab = tabs.find(t => t.active);
  mruTabIds = tabs.map(t => t.id);
  if (activeTab) {
    mruTabIds = [activeTab.id, ...mruTabIds.filter(id => id !== activeTab.id)];
  }
}

// Track tab activations for MRU
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  // Move activated tab to front of MRU list
  mruTabIds = [tabId, ...mruTabIds.filter(id => id !== tabId)];
});

// Remove closed tabs from MRU
chrome.tabs.onRemoved.addListener((tabId) => {
  mruTabIds = mruTabIds.filter(id => id !== tabId);
});

// Add new tabs to MRU
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id && !mruTabIds.includes(tab.id)) {
    mruTabIds.unshift(tab.id);
  }
});

// Initialize on startup
initMruList();

// Proactively cache favicons from all tabs
async function cacheFaviconsFromAllTabs() {
  const tabs = await chrome.tabs.query({});
  const { faviconCache = {} } = await chrome.storage.local.get(['faviconCache']);
  
  let updated = false;
  for (const tab of tabs) {
    if (tab.favIconUrl && tab.url && !tab.favIconUrl.startsWith('chrome://')) {
      const cacheKey = getFaviconCacheKey(tab.url);
      if (!faviconCache[cacheKey]) {
        faviconCache[cacheKey] = tab.favIconUrl;
        updated = true;
      }
    }
  }
  
  if (updated) {
    await chrome.storage.local.set({ faviconCache });
  }
}

// Cache on startup
cacheFaviconsFromAllTabs();

// Cache when tabs update
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.favIconUrl && tab.url) {
    const cacheKey = getFaviconCacheKey(tab.url);
    chrome.storage.local.get(['faviconCache'], ({ faviconCache = {} }) => {
      faviconCache[cacheKey] = changeInfo.favIconUrl;
      chrome.storage.local.set({ faviconCache });
    });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-palette') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['styles.css']
        });
        chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
      } catch (e) {
        // Can't inject into chrome:// pages, etc.
        console.log('Cannot inject into this page:', e);
      }
    }
  }
  
  if (command === 'quick-switch') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['styles.css']
        });
        chrome.tabs.sendMessage(tab.id, { action: 'quick-switch' });
      } catch (e) {
        // Can't inject into chrome:// pages, fallback to direct switch
        console.log('Cannot inject, switching directly');
        // Direct switch to previous tab
        if (mruTabIds.length > 1) {
          await chrome.tabs.update(mruTabIds[1], { active: true });
        }
      }
    }
  }
});

// Available actions
const ACTIONS = [
  {
    id: 'cleanup',
    type: 'action',
    title: 'Cleanup',
    description: 'Close tabs without matching bookmarks, keep one per domain',
    icon: '✨',
    keywords: ['cleanup', 'clean', 'tidy', 'organize', 'dedupe'],
    hasSettings: false
  },
  {
    id: 'reset',
    type: 'action',
    title: 'Reset',
    description: 'Close all tabs and open home page',
    icon: '💫',
    keywords: ['reset', 'close all', 'fresh', 'clear', 'new', 'start over', 'home'],
    hasSettings: true
  },
  {
    id: 'settings',
    type: 'action',
    title: 'Settings',
    description: 'Configure Arc preferences',
    icon: '⚙️',
    keywords: ['settings', 'config', 'configure', 'preferences', 'options', 'search engine'],
    hasSettings: true
  },
  {
    id: 'open-bookmarks',
    type: 'action',
    title: 'Open Bookmarks',
    description: 'Open Chrome bookmarks manager',
    icon: '📚',
    keywords: ['open', 'bookmarks', 'bookmark manager', 'chrome'],
    hasSettings: false,
    chromeUrl: 'chrome://bookmarks'
  },
  {
    id: 'open-extensions',
    type: 'action',
    title: 'Open Extensions',
    description: 'Open Chrome extensions page',
    icon: '🧩',
    keywords: ['open', 'extensions', 'plugins', 'addons', 'chrome'],
    hasSettings: false,
    chromeUrl: 'chrome://extensions'
  },
  {
    id: 'open-history',
    type: 'action',
    title: 'Open History',
    description: 'Open Chrome browsing history',
    icon: '🕐',
    keywords: ['open', 'history', 'past', 'visited', 'chrome'],
    hasSettings: false,
    chromeUrl: 'chrome://history'
  },
  {
    id: 'open-downloads',
    type: 'action',
    title: 'Open Downloads',
    description: 'Open Chrome downloads page',
    icon: '📥',
    keywords: ['open', 'downloads', 'files', 'chrome'],
    hasSettings: false,
    chromeUrl: 'chrome://downloads'
  },
  {
    id: 'open-chrome-settings',
    type: 'action',
    title: 'Open Chrome Settings',
    description: 'Open Chrome settings page',
    icon: '🔧',
    keywords: ['open', 'chrome settings', 'preferences', 'chrome'],
    hasSettings: false,
    chromeUrl: 'chrome://settings'
  },
  {
    id: 'open-passwords',
    type: 'action',
    title: 'Open Passwords',
    description: 'Open Chrome password manager',
    icon: '🔑',
    keywords: ['open', 'passwords', 'password manager', 'keys', 'chrome'],
    hasSettings: false,
    chromeUrl: 'chrome://settings/passwords'
  },
  {
    id: 'reload-extension',
    type: 'action',
    title: 'Reload Extension',
    description: 'Reload Arc (dev mode)',
    icon: '🔄',
    keywords: ['reload', 'refresh', 'restart', 'dev', 'extension', 'update'],
    hasSettings: false
  }
];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'search') {
    handleSearch(request.query).then(sendResponse);
    return true; // async response
  }
  if (request.action === 'openResult') {
    handleOpenResult(request.result).then(sendResponse);
    return true;
  }
  if (request.action === 'executeAction') {
    executeAction(request.actionId, request.openSettings).then(sendResponse);
    return true;
  }
  if (request.action === 'getActionMeta') {
    const action = ACTIONS.find(a => a.id === request.actionId);
    sendResponse(action || null);
    return true;
  }
  if (request.action === 'getMruTabs') {
    getMruTabs().then(sendResponse);
    return true;
  }
  if (request.action === 'switchToTab') {
    chrome.tabs.update(request.tabId, { active: true }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  if (request.action === 'navigateOrSearch') {
    handleNavigateOrSearch(request.query).then(sendResponse);
    return true;
  }
  if (request.action === 'reload-extension') {
    chrome.runtime.reload();
    return true;
  }
  if (request.type === 'getCommands') {
    chrome.commands.getAll().then(sendResponse);
    return true;
  }
  if (request.type === 'openShortcuts') {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    return true;
  }
});

// Search engine URL templates
const SEARCH_ENGINES = {
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q=',
  brave: 'https://search.brave.com/search?q=',
  ecosia: 'https://www.ecosia.org/search?q=',
  perplexity: 'https://www.perplexity.ai/search?q=',
  chatgpt: 'https://chatgpt.com/?q=',
  gemini: 'https://gemini.google.com/app?q=',
  claude: 'https://claude.ai/new?q='
};

// Check if string looks like a URL
function isLikelyUrl(str) {
  // Has protocol
  if (/^https?:\/\//i.test(str)) return true;
  // Looks like domain.tld (with at least one dot and valid TLD pattern)
  if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+/i.test(str) && !str.includes(' ')) return true;
  // localhost or IP
  if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?/i.test(str)) return true;
  return false;
}

// Handle enter with no results - navigate to URL or search
async function handleNavigateOrSearch(query) {
  const q = query.trim();
  if (!q) return { success: false };
  
  let url;
  if (isLikelyUrl(q)) {
    // It's a URL - add protocol if missing
    url = q.startsWith('http') ? q : 'https://' + q;
  } else {
    // It's a search query - use configured search engine
    const { searchEngine = 'google' } = await chrome.storage.sync.get(['searchEngine']);
    const baseUrl = SEARCH_ENGINES[searchEngine] || SEARCH_ENGINES.google;
    url = baseUrl + encodeURIComponent(q);
  }
  
  await chrome.tabs.create({ url });
  return { success: true, url };
}

// Get tabs sorted by MRU order
async function getMruTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const { faviconCache = {} } = await chrome.storage.local.get(['faviconCache']);
  
  // Create a map for quick lookup
  const tabMap = new Map(tabs.map(t => [t.id, t]));
  
  // Sort tabs by MRU order
  const sortedTabs = [];
  for (const tabId of mruTabIds) {
    const tab = tabMap.get(tabId);
    if (tab) {
      sortedTabs.push({
        type: 'tab',
        id: tab.id,
        title: tab.title || 'Untitled',
        url: tab.url,
        host: getHost(tab.url),
        favIconUrl: tab.favIconUrl || faviconCache[getFaviconCacheKey(tab.url)] || null
      });
    }
  }
  
  // Add any tabs not in MRU list (shouldn't happen, but just in case)
  for (const tab of tabs) {
    if (!mruTabIds.includes(tab.id)) {
      sortedTabs.push({
        type: 'tab',
        id: tab.id,
        title: tab.title || 'Untitled',
        url: tab.url,
        host: getHost(tab.url),
        favIconUrl: tab.favIconUrl || faviconCache[getFaviconCacheKey(tab.url)] || null
      });
    }
  }
  
  return sortedTabs;
}

async function handleSearch(query) {
  const q = query.toLowerCase().trim();
  if (!q) return { tabs: [], bookmarks: [], bookmarksSecondary: [], actions: [] };

  // Get all tabs in current window
  const tabs = await chrome.tabs.query({ currentWindow: true });
  
  // Get all bookmarks
  const bookmarkTree = await chrome.bookmarks.getTree();
  const bookmarks = flattenBookmarks(bookmarkTree);

  // Get cached favicons
  const { faviconCache = {} } = await chrome.storage.local.get(['faviconCache']);

  // Cache favicons from tabs
  const newCache = { ...faviconCache };
  for (const tab of tabs) {
    if (tab.favIconUrl && tab.url && !tab.favIconUrl.startsWith('chrome://')) {
      const cacheKey = getFaviconCacheKey(tab.url);
      newCache[cacheKey] = tab.favIconUrl;
    }
  }
  // Save updated cache (async, don't wait)
  chrome.storage.local.set({ faviconCache: newCache });

  // Filter and score tabs
  const matchedTabs = tabs
    .filter(tab => {
      const url = (tab.url || '').toLowerCase();
      const title = (tab.title || '').toLowerCase();
      return url.includes(q) || title.includes(q);
    })
    .map(tab => ({
      type: 'tab',
      id: tab.id,
      title: tab.title || 'Untitled',
      url: tab.url,
      host: getHost(tab.url),
      favIconUrl: tab.favIconUrl || null
    }));

  // Filter bookmarks - separate URL matches from title-only matches
  const urlMatchBookmarks = [];
  const titleOnlyMatchBookmarks = [];
  
  for (const bm of bookmarks) {
    const url = (bm.url || '').toLowerCase();
    const title = (bm.title || '').toLowerCase();
    const urlMatches = url.includes(q);
    const titleMatches = title.includes(q);
    
    if (urlMatches || titleMatches) {
      const host = getHost(bm.url);
      const cacheKey = getFaviconCacheKey(bm.url);
      const cachedFavicon = newCache[cacheKey];
      const item = {
        type: 'bookmark',
        id: bm.id,
        title: bm.title && bm.title.trim() ? bm.title : host,
        url: bm.url,
        host: host,
        favIconUrl: cachedFavicon || `https://www.google.com/s2/favicons?domain=${host}&sz=32`
      };
      
      if (urlMatches) {
        urlMatchBookmarks.push(item);
      } else {
        titleOnlyMatchBookmarks.push(item);
      }
    }
  }

  // Filter actions (include hasSettings in result)
  const matchedActions = ACTIONS
    .filter(action => {
      const titleMatch = action.title.toLowerCase().includes(q);
      const descMatch = action.description.toLowerCase().includes(q);
      const keywordMatch = action.keywords.some(kw => kw.includes(q));
      return titleMatch || descMatch || keywordMatch;
    })
    .map(action => ({
      ...action,
      hasSettings: action.hasSettings || false
    }));

  // Dedupe: if a bookmark's host has an open tab, filter it from primary bookmarks
  const openHosts = new Set(matchedTabs.map(t => t.host));
  const dedupedUrlBookmarks = urlMatchBookmarks.filter(bm => !openHosts.has(bm.host));
  const dedupedTitleBookmarks = titleOnlyMatchBookmarks.filter(bm => !openHosts.has(bm.host));

  // Order: URL-matching bookmarks first, then tabs, then title-only bookmarks
  return {
    bookmarksPrimary: dedupedUrlBookmarks.slice(0, 10),
    tabs: matchedTabs.slice(0, 10),
    bookmarksSecondary: dedupedTitleBookmarks.slice(0, 10),
    actions: matchedActions.slice(0, 5)
  };
}

function getFaviconUrl(url) {
  try {
    const u = new URL(url);
    // Use Chrome's internal favicon API
    return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
  } catch {
    return null;
  }
}

async function handleOpenResult(result) {
  if (result.type === 'tab') {
    await chrome.tabs.update(result.id, { active: true });
  } else {
    await chrome.tabs.create({ url: result.url });
  }
  return { success: true };
}

function flattenBookmarks(nodes, results = []) {
  for (const node of nodes) {
    if (node.url) {
      results.push({ id: node.id, title: node.title, url: node.url });
    }
    if (node.children) {
      flattenBookmarks(node.children, results);
    }
  }
  return results;
}

function getHost(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace('www.', '');
  } catch {
    return '';
  }
}

function getFaviconCacheKey(url) {
  // Cache by origin + pathname (without query/hash) for better matching
  try {
    const u = new URL(url);
    // For Google services, include more of the path
    if (u.hostname.includes('google.com')) {
      return u.origin + u.pathname.split('/').slice(0, 2).join('/');
    }
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

async function executeAction(actionId, openSettings = false) {
  // If openSettings is true, open settings for the action
  if (openSettings) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
    return { success: true, message: 'Opened settings' };
  }

  // Check if it's a chrome:// URL action
  const action = ACTIONS.find(a => a.id === actionId);
  if (action?.chromeUrl) {
    await chrome.tabs.create({ url: action.chromeUrl });
    return { success: true, message: `Opened ${action.title}` };
  }

  switch (actionId) {
    case 'cleanup':
      return await actionCleanup();
    case 'reset':
      return await actionReset();
    case 'settings':
      // Settings are now handled inline via hasSettings: true
      return { success: true, message: 'Settings handled inline' };
    case 'reload-extension':
      // Reload is now handled via direct message with tab info
      // This fallback just reloads without reopening
      chrome.runtime.reload();
      return { success: true };
    default:
      return { success: false, error: 'Unknown action' };
  }
}

async function actionReset() {
  // Get configured reset URL
  const { resetUrl } = await chrome.storage.sync.get(['resetUrl']);
  const url = resetUrl || 'chrome://newtab';

  // Get all tabs in current window
  const tabs = await chrome.tabs.query({ currentWindow: true });
  
  // Create the home page tab first
  await chrome.tabs.create({ url });
  
  // Close all other tabs
  const tabIds = tabs.map(t => t.id);
  if (tabIds.length > 0) {
    await chrome.tabs.remove(tabIds);
  }

  return { 
    success: true, 
    message: `Closed ${tabIds.length} tabs`
  };
}

async function actionCleanup() {
  // Get all bookmarks and extract their hosts
  const bookmarkTree = await chrome.bookmarks.getTree();
  const bookmarks = flattenBookmarks(bookmarkTree);
  const bookmarkHosts = new Set(bookmarks.map(bm => getHost(bm.url)).filter(h => h));

  // Get all tabs in current window
  const tabs = await chrome.tabs.query({ currentWindow: true });
  
  const tabsToClose = [];
  const keptHosts = new Set();

  for (const tab of tabs) {
    const host = getHost(tab.url);
    
    // Skip chrome:// and other special pages - don't close them but don't count as "kept"
    if (!host || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      continue;
    }

    // Check if this host has a matching bookmark
    if (!bookmarkHosts.has(host)) {
      // No bookmark match - close it
      tabsToClose.push(tab.id);
    } else if (keptHosts.has(host)) {
      // Already kept one tab for this host - close duplicate
      tabsToClose.push(tab.id);
    } else {
      // First tab for this bookmarked host - keep it
      keptHosts.add(host);
    }
  }

  // Close the tabs
  if (tabsToClose.length > 0) {
    await chrome.tabs.remove(tabsToClose);
  }

  return { 
    success: true, 
    closed: tabsToClose.length,
    kept: keptHosts.size
  };
}

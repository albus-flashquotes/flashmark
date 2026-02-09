// FlashMark - Background Service Worker

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
    icon: '🔄',
    keywords: ['reset', 'close all', 'fresh', 'clear', 'new', 'start over', 'home'],
    hasSettings: true
  },
  {
    id: 'settings',
    type: 'action',
    title: 'Settings',
    description: 'Configure FlashMark actions',
    icon: '⚙️',
    keywords: ['settings', 'config', 'configure', 'preferences', 'options'],
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
});

async function handleSearch(query) {
  const q = query.toLowerCase().trim();
  if (!q) return { tabs: [], bookmarks: [], bookmarksSecondary: [], actions: [] };

  // Get all tabs in current window
  const tabs = await chrome.tabs.query({ currentWindow: true });
  
  // Get all bookmarks
  const bookmarkTree = await chrome.bookmarks.getTree();
  const bookmarks = flattenBookmarks(bookmarkTree);

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
      const item = {
        type: 'bookmark',
        id: bm.id,
        title: bm.title && bm.title.trim() ? bm.title : host,
        url: bm.url,
        host: host,
        favIconUrl: `https://www.google.com/s2/favicons?domain=${host}&sz=32`
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

async function executeAction(actionId, openSettings = false) {
  // If openSettings is true, open settings for the action
  if (openSettings) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
    return { success: true, message: 'Opened settings' };
  }

  switch (actionId) {
    case 'cleanup':
      return await actionCleanup();
    case 'reset':
      return await actionReset();
    case 'settings':
      await chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
      return { success: true, message: 'Opened settings' };
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

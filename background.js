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
    keywords: ['cleanup', 'clean', 'tidy', 'organize', 'dedupe']
  },
  {
    id: 'reset',
    type: 'action',
    title: 'Reset',
    description: 'Close all tabs and start fresh',
    icon: '🔄',
    keywords: ['reset', 'close all', 'fresh', 'clear', 'new', 'start over']
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
    executeAction(request.actionId).then(sendResponse);
    return true;
  }
});

async function handleSearch(query) {
  const q = query.toLowerCase().trim();
  if (!q) return { tabs: [], bookmarks: [], actions: [] };

  // Get all tabs in current window
  const tabs = await chrome.tabs.query({ currentWindow: true });
  
  // Get all bookmarks
  const bookmarkTree = await chrome.bookmarks.getTree();
  const bookmarks = flattenBookmarks(bookmarkTree);

  // Filter and score tabs
  const matchedTabs = tabs
    .filter(tab => {
      const host = getHost(tab.url);
      const title = (tab.title || '').toLowerCase();
      return host.includes(q) || title.includes(q);
    })
    .map(tab => ({
      type: 'tab',
      id: tab.id,
      title: tab.title || 'Untitled',
      url: tab.url,
      host: getHost(tab.url),
      favIconUrl: tab.favIconUrl || null
    }));

  // Filter bookmarks
  const matchedBookmarks = bookmarks
    .filter(bm => {
      const host = getHost(bm.url);
      const title = (bm.title || '').toLowerCase();
      return host.includes(q) || title.includes(q);
    })
    .map(bm => ({
      type: 'bookmark',
      id: bm.id,
      title: bm.title || 'Untitled',
      url: bm.url,
      host: getHost(bm.url),
      favIconUrl: null // Will use Google's favicon service
    }));

  // Filter actions
  const matchedActions = ACTIONS.filter(action => {
    const titleMatch = action.title.toLowerCase().includes(q);
    const descMatch = action.description.toLowerCase().includes(q);
    const keywordMatch = action.keywords.some(kw => kw.includes(q));
    return titleMatch || descMatch || keywordMatch;
  });

  // Dedupe: if a bookmark's host has an open tab, mark it
  const openHosts = new Set(matchedTabs.map(t => t.host));
  const dedupedBookmarks = matchedBookmarks.filter(bm => !openHosts.has(bm.host));

  return {
    tabs: matchedTabs.slice(0, 10),
    bookmarks: dedupedBookmarks.slice(0, 10),
    actions: matchedActions.slice(0, 5)
  };
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

async function executeAction(actionId) {
  switch (actionId) {
    case 'cleanup':
      return await actionCleanup();
    case 'reset':
      return await actionReset();
    default:
      return { success: false, error: 'Unknown action' };
  }
}

async function actionReset() {
  // Get all tabs in current window
  const tabs = await chrome.tabs.query({ currentWindow: true });
  
  // Create a new empty tab first
  await chrome.tabs.create({ url: 'chrome://newtab' });
  
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

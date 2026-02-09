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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'search') {
    handleSearch(request.query).then(sendResponse);
    return true; // async response
  }
  if (request.action === 'openResult') {
    handleOpenResult(request.result).then(sendResponse);
    return true;
  }
});

async function handleSearch(query) {
  const q = query.toLowerCase().trim();
  if (!q) return { tabs: [], bookmarks: [] };

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

  // Dedupe: if a bookmark's host has an open tab, mark it
  const openHosts = new Set(matchedTabs.map(t => t.host));
  const dedupedBookmarks = matchedBookmarks.filter(bm => !openHosts.has(bm.host));

  return {
    tabs: matchedTabs.slice(0, 10),
    bookmarks: dedupedBookmarks.slice(0, 10)
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

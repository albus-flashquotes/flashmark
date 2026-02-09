// FlashMark Settings

const resetUrlInput = document.getElementById('reset-url');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');
const toast = document.getElementById('toast');

// Load settings
chrome.storage.sync.get(['resetUrl'], (result) => {
  resetUrlInput.value = result.resetUrl || 'chrome://newtab';
});

// Save settings
saveBtn.addEventListener('click', () => {
  const resetUrl = resetUrlInput.value.trim() || 'chrome://newtab';
  
  chrome.storage.sync.set({ resetUrl }, () => {
    showToast('Settings saved!');
  });
});

// Cancel - go back
cancelBtn.addEventListener('click', () => {
  window.location.href = 'newtab.html';
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.location.href = 'newtab.html';
  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    saveBtn.click();
  }
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => {
    toast.classList.remove('visible');
  }, 2000);
}

// Popup script for Focus Guard

let blocklist = [];
let stats = {};
let productivityData = {};

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('addButton').addEventListener('click', addSite);
  document.getElementById('urlInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addSite();
  });
  document.getElementById('clearAllButton').addEventListener('click', clearAll);
  document.getElementById('openOptions').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

function loadData() {
  chrome.storage.sync.get(['blocklist'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('Error loading blocklist:', chrome.runtime.lastError);
      blocklist = [];
    } else {
      blocklist = result.blocklist || [];
    }
    renderBlocklist();
  });

  chrome.runtime.sendMessage({ action: 'getStats' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error loading stats:', chrome.runtime.lastError);
      stats = { totalBlocks: 0, blocksByDomain: {} };
    } else {
      stats = response || { totalBlocks: 0, blocksByDomain: {} };
    }
    updateQuickStats();
  });

  chrome.runtime.sendMessage({ action: 'getProductivityData' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error loading productivity data:', chrome.runtime.lastError);
      productivityData = { score: 0, currentStreak: 0 };
    } else {
      productivityData = response || { score: 0, currentStreak: 0 };
    }
    updateQuickStats();
  });
}

function updateQuickStats() {
  document.getElementById('totalBlocks').textContent = stats.totalBlocks || 0;
  document.getElementById('productivityScore').textContent = productivityData.score || 0;
  document.getElementById('currentStreak').textContent = productivityData.currentStreak || 0;
}

function addSite() {
  const input = document.getElementById('urlInput');
  let url = input.value.trim();
  
  if (!url) {
    showError('Please enter a URL');
    return;
  }
  
  url = url.toLowerCase();
  url = url.replace(/^https?:\/\//, '');
  url = url.replace(/\/$/, '');
  
  if (blocklist.some(item => item.url === url)) {
    showError('This site is already in your blocklist');
    return;
  }
  
  blocklist.push({
    url: url,
    enabled: true,
    addedAt: new Date().toISOString()
  });
  
  saveBlocklist();
  input.value = '';
  input.focus();
}

function toggleSite(index) {
  blocklist[index].enabled = !blocklist[index].enabled;
  saveBlocklist();
}

function removeSite(index) {
  if (confirm(`Remove ${blocklist[index].url} from blocklist?`)) {
    blocklist.splice(index, 1);
    saveBlocklist();
  }
}

function clearAll() {
  if (confirm('Are you sure you want to clear all blocked sites?')) {
    blocklist = [];
    saveBlocklist();
  }
}

function saveBlocklist() {
  chrome.storage.sync.set({ blocklist }, () => {
    if (chrome.runtime.lastError) {
      console.error('Error saving blocklist:', chrome.runtime.lastError);
      showError('Error saving. Please try again.');
      return;
    }
    renderBlocklist();
    updateQuickStats();
  });
}

function renderBlocklist() {
  const list = document.getElementById('blocklist');
  const emptyState = document.getElementById('emptyState');
  
  if (blocklist.length === 0) {
    list.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }
  
  list.style.display = 'block';
  emptyState.style.display = 'none';
  list.innerHTML = '';
  
  blocklist.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'list-item';
    
    li.innerHTML = `
      <div class="list-item-content">
        <label class="toggle">
          <input type="checkbox" ${item.enabled ? 'checked' : ''} data-index="${index}">
          <span class="toggle-slider"></span>
        </label>
        <div class="list-item-text">
          <div class="list-item-url" style="opacity: ${item.enabled ? '1' : '0.5'}">${item.url}</div>
        </div>
      </div>
      <div class="list-item-actions">
        <button class="btn-danger btn-small" data-index="${index}" data-action="remove">Remove</button>
      </div>
    `;
    
    const toggle = li.querySelector('input[type="checkbox"]');
    toggle.addEventListener('change', () => toggleSite(index));
    
    const removeBtn = li.querySelector('[data-action="remove"]');
    removeBtn.addEventListener('click', () => removeSite(index));
    
    list.appendChild(li);
  });
}

function showError(message) {
  const input = document.getElementById('urlInput');
  input.style.borderColor = '#ff3b30';
  input.placeholder = message;
  
  setTimeout(() => {
    input.style.borderColor = '';
    input.placeholder = 'e.g., facebook.com or *.youtube.com';
  }, 2000);
}

// Options page script for Focus Guard

let blocklist = [];
let stats = {};
let productivityData = {};

const allBadges = [
  { id: 'streak_7', name: '7-Day Warrior', description: '7 days without bypassing', icon: '🔥' },
  { id: 'streak_30', name: 'Month Master', description: '30 days distraction-free', icon: '🏆' },
  { id: 'streak_100', name: 'Century Club', description: '100-day streak achieved', icon: '💯' },
  { id: 'blocks_100', name: 'Centurion', description: '100 distractions blocked', icon: '🛡️' },
  { id: 'blocks_500', name: 'Guardian', description: '500 distractions blocked', icon: '⚔️' },
  { id: 'blocks_1000', name: 'Legend', description: '1000 distractions blocked', icon: '👑' },
  { id: 'score_500', name: 'Rising Star', description: '500 productivity points', icon: '⭐' },
  { id: 'score_2000', name: 'Productivity Master', description: '2000 productivity points', icon: '💎' }
];

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('exportButton').addEventListener('click', exportBlocklist);
  document.getElementById('importButton').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', importBlocklist);
  document.getElementById('resetStatsButton').addEventListener('click', resetStats);
  document.getElementById('saveGoalButton').addEventListener('click', saveUserGoal);

  // Todo import/export
  document.getElementById('exportTodosButton').addEventListener('click', exportTodos);
  document.getElementById('importTodosButton').addEventListener('click', () => {
    document.getElementById('importTodosFile').click();
  });
  document.getElementById('importTodosFile').addEventListener('change', importTodos);

  // Sync functionality
  document.getElementById('enableSyncBtn').addEventListener('click', enableSync);
  document.getElementById('disableSyncBtn').addEventListener('click', disableSync);
  document.getElementById('forceSyncBtn').addEventListener('click', forceSync);

  // Load sync status
  loadSyncStatus();
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
      stats = { totalBlocks: 0, blocksByDomain: {}, lastReset: new Date().toISOString() };
    } else {
      stats = response || { totalBlocks: 0, blocksByDomain: {}, lastReset: new Date().toISOString() };
    }
    renderStats();
  });

  chrome.runtime.sendMessage({ action: 'getProductivityData' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error loading productivity data:', chrome.runtime.lastError);
      productivityData = {
        score: 0,
        currentStreak: 0,
        longestStreak: 0,
        badges: [],
        bypassLog: [],
        userGoal: '',
        timeSavedMinutes: 0,
        todos: []
      };
    } else {
      productivityData = response || {
        score: 0,
        currentStreak: 0,
        longestStreak: 0,
        badges: [],
        bypassLog: [],
        userGoal: '',
        timeSavedMinutes: 0,
        todos: []
      };
    }
    renderProductivityData();
    loadUserGoal();
  });

  chrome.runtime.sendMessage({ action: 'getWeeklyReport' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error loading weekly report:', chrome.runtime.lastError);
      return;
    }
    if (response) {
      renderWeeklyReport(response);
    }
  });
}

function renderWeeklyReport(report) {
  document.getElementById('reportMessage').textContent = report.message;
  
  let emoji = '🎯';
  if (report.currentWeek.blocks >= 50) emoji = '🏆';
  else if (report.currentWeek.blocks >= 30) emoji = '💪';
  else if (report.currentWeek.blocks >= 15) emoji = '👍';
  else if (report.currentWeek.blocks >= 5) emoji = '🌱';
  document.getElementById('reportEmoji').textContent = emoji;
  
  const weekStart = new Date(report.weekStart);
  document.getElementById('reportWeek').textContent = `Week of ${weekStart.toLocaleDateString()}`;
  
  document.getElementById('weekBlocks').textContent = report.currentWeek.blocks;
  
  const hours = Math.floor(report.currentWeek.timeSaved / 60);
  const mins = report.currentWeek.timeSaved % 60;
  const timeSavedText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  document.getElementById('weekTimeSaved').textContent = timeSavedText;
  
  document.getElementById('weekStreak').textContent = report.streak;
  
  const blocksChange = report.changes.blocks;
  const blocksChangeText = blocksChange > 0 ? `+${blocksChange} from last week` : 
                          blocksChange < 0 ? `${blocksChange} from last week` : 
                          'Same as last week';
  const blocksChangeColor = blocksChange >= 0 ? 'rgba(52, 199, 89, 0.9)' : 'rgba(255, 59, 48, 0.9)';
  document.getElementById('weekBlocksChange').textContent = blocksChangeText;
  document.getElementById('weekBlocksChange').style.color = blocksChangeColor;
  
  const timeSavedChange = report.changes.timeSaved;
  const timeSavedChangeText = timeSavedChange > 0 ? `+${timeSavedChange}m from last week` : 
                              timeSavedChange < 0 ? `${timeSavedChange}m from last week` : 
                              'Same as last week';
  const timeSavedChangeColor = timeSavedChange >= 0 ? 'rgba(52, 199, 89, 0.9)' : 'rgba(255, 59, 48, 0.9)';
  document.getElementById('weekTimeSavedChange').textContent = timeSavedChangeText;
  document.getElementById('weekTimeSavedChange').style.color = timeSavedChangeColor;
  
  document.getElementById('totalWeekTimeSaved').textContent = timeSavedText;
  
  const totalHours = Math.floor(report.totalTimeSaved / 60);
  const totalMins = report.totalTimeSaved % 60;
  const totalText = totalHours > 0 ? `${totalHours}h ${totalMins}m` : `${totalMins}m`;
  document.getElementById('totalAllTimeSaved').textContent = totalText;
  
  const daysWorth = Math.floor(report.totalTimeSaved / (8 * 60));
  let impactMsg = `Each block saves approximately 7 minutes of potential distraction time.`;
  if (daysWorth >= 1) {
    impactMsg += ` You've saved ${daysWorth} full workday${daysWorth > 1 ? 's' : ''} worth of time!`;
  }
  document.getElementById('impactMessage').textContent = impactMsg;
}

function loadUserGoal() {
  if (productivityData.userGoal && productivityData.userGoal.trim()) {
    document.getElementById('currentGoal').style.display = 'block';
    document.getElementById('currentGoalText').textContent = productivityData.userGoal;
    document.getElementById('userGoalInput').value = productivityData.userGoal;
  }
}

function saveUserGoal() {
  const goal = document.getElementById('userGoalInput').value.trim();
  
  chrome.runtime.sendMessage({
    action: 'setUserGoal',
    goal: goal
  }, (response) => {
    if (response.success) {
      if (goal) {
        document.getElementById('currentGoal').style.display = 'block';
        document.getElementById('currentGoalText').textContent = goal;
        showNotification('Goal saved! It will appear on block pages.');
      } else {
        document.getElementById('currentGoal').style.display = 'none';
        showNotification('Goal cleared.');
      }
    }
  });
}

function renderProductivityData() {
  document.getElementById('productivityScore').textContent = productivityData.score || 0;
  document.getElementById('currentStreak').textContent = productivityData.currentStreak || 0;
  document.getElementById('longestStreak').textContent = productivityData.longestStreak || 0;
  
  renderBadges();
  renderBypassLog();
  updateTodoStats();
}

function updateTodoStats() {
  const todos = productivityData.todos || [];
  const totalCount = todos.length;
  const completedCount = todos.filter(t => t.completed).length;
  
  document.getElementById('totalTodosCount').textContent = totalCount;
  document.getElementById('completedTodosCount').textContent = completedCount;
}

function renderBadges() {
  const container = document.getElementById('badgesList');
  const earnedBadges = productivityData.badges || [];
  
  if (earnedBadges.length === 0) {
    container.innerHTML = `
      <div class="empty-badges">
        <div style="font-size: 64px; margin-bottom: 16px;">🎖️</div>
        <p>No badges earned yet</p>
        <p class="text-small text-muted">Keep blocking distractions to earn achievements!</p>
      </div>
    `;
    return;
  }
  
  const badgeHTML = allBadges.map(badge => {
    const earned = earnedBadges.includes(badge.id);
    return `
      <div class="badge-item ${earned ? '' : 'locked'}">
        <div class="badge-icon">${earned ? badge.icon : '🔒'}</div>
        <div class="badge-name">${badge.name}</div>
        <div class="badge-description">${badge.description}</div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = `<div class="badge-grid">${badgeHTML}</div>`;
}

function renderBypassLog() {
  const container = document.getElementById('bypassLog');
  const log = productivityData.bypassLog || [];
  
  if (log.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✅</div>
        <p>No bypasses recorded</p>
        <p class="text-small text-muted">Great job staying focused!</p>
      </div>
    `;
    return;
  }
  
  const logHTML = log.slice(0, 20).map(bypass => {
    const date = new Date(bypass.timestamp);
    const timeAgo = getTimeAgo(date);
    
    return `
      <div class="bypass-item">
        <div class="bypass-header">
          <span class="bypass-domain">${bypass.domain}</span>
          <span class="bypass-time">${timeAgo}</span>
        </div>
        <div class="bypass-reason">"${bypass.reason}"</div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = `<div class="bypass-list">${logHTML}</div>`;
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

function renderStats() {
  document.getElementById('totalBlocks').textContent = stats.totalBlocks || 0;
  
  const uniqueSites = Object.keys(stats.blocksByDomain || {}).length;
  document.getElementById('uniqueSites').textContent = uniqueSites;
  
  const topSitesList = document.getElementById('topSitesList');
  const blocksByDomain = stats.blocksByDomain || {};
  
  if (Object.keys(blocksByDomain).length === 0) {
    topSitesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <p>No blocking activity yet</p>
        <p class="text-small text-muted">Statistics will appear here once you start blocking sites</p>
      </div>
    `;
    return;
  }
  
  const sortedSites = Object.entries(blocksByDomain)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  topSitesList.innerHTML = `
    <div class="top-sites-list">
      ${sortedSites.map(([domain, count]) => `
        <div class="top-site-item">
          <span class="top-site-domain">${domain}</span>
          <span class="top-site-count">${count} ${count === 1 ? 'block' : 'blocks'}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderBlocklist() {
  const count = blocklist.length;
  document.getElementById('blocklistCount').textContent = 
    count === 0 ? 'No sites blocked' : 
    count === 1 ? '1 site blocked' : 
    `${count} sites blocked`;
  
  const container = document.getElementById('fullBlocklist');
  
  if (blocklist.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎯</div>
        <p>No sites in blocklist</p>
        <p class="text-small text-muted">Add sites from the extension popup</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <ul class="list" style="margin-top: 16px;">
      ${blocklist.map((item, index) => `
        <li class="list-item">
          <div class="list-item-content">
            <div class="list-item-text">
              <div class="list-item-url" style="opacity: ${item.enabled ? '1' : '0.5'}">
                ${item.url}
              </div>
              <div class="text-small text-muted">
                Added ${new Date(item.addedAt).toLocaleDateString()}
                ${item.enabled ? '' : ' (Disabled)'}
              </div>
            </div>
          </div>
        </li>
      `).join('')}
    </ul>
  `;
}

function exportBlocklist() {
  const data = {
    blocklist: blocklist,
    exportedAt: new Date().toISOString(),
    version: '2.0.0'
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `focus-guard-blocklist-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  showNotification('Blocklist exported successfully!');
}

function importBlocklist(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      
      if (!data.blocklist || !Array.isArray(data.blocklist)) {
        showNotification('Invalid blocklist file', true);
        return;
      }
      
      const existingUrls = new Set(blocklist.map(item => item.url));
      const newItems = data.blocklist.filter(item => !existingUrls.has(item.url));
      
      if (newItems.length === 0) {
        showNotification('No new sites to import', false);
        return;
      }
      
      blocklist = [...blocklist, ...newItems];
      chrome.storage.sync.set({ blocklist }, () => {
        renderBlocklist();
        showNotification(`Imported ${newItems.length} new site(s)!`);
      });
      
    } catch (error) {
      showNotification('Error reading file', true);
    }
  };
  reader.readAsText(file);
  
  event.target.value = '';
}

function exportTodos() {
  const todos = productivityData.todos || [];
  
  if (todos.length === 0) {
    showNotification('No tasks to export', true);
    return;
  }
  
  const data = {
    todos: todos,
    exportedAt: new Date().toISOString(),
    version: '2.0.0',
    stats: {
      total: todos.length,
      completed: todos.filter(t => t.completed).length,
      pending: todos.filter(t => !t.completed).length
    }
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `focus-guard-tasks-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  showNotification(`Exported ${todos.length} task(s) successfully!`);
}

function importTodos(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      
      if (!data.todos || !Array.isArray(data.todos)) {
        showNotification('Invalid tasks file', true);
        return;
      }
      
      // Validate each todo has required fields
      const validTodos = data.todos.filter(todo => 
        todo && typeof todo.text === 'string' && todo.text.trim()
      );
      
      if (validTodos.length === 0) {
        showNotification('No valid tasks found in file', true);
        return;
      }
      
      // Get existing todos
      const existingTodos = productivityData.todos || [];
      const existingTexts = new Set(existingTodos.map(t => t.text.toLowerCase().trim()));
      
      // Filter out duplicates and prepare new todos with fresh IDs
      const newTodos = validTodos
        .filter(todo => !existingTexts.has(todo.text.toLowerCase().trim()))
        .map(todo => ({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          text: todo.text.trim(),
          completed: todo.completed || false,
          createdAt: todo.createdAt || new Date().toISOString(),
          completedAt: todo.completedAt || null
        }));
      
      if (newTodos.length === 0) {
        showNotification('All tasks already exist', false);
        return;
      }
      
      // Merge todos - new ones at the top
      productivityData.todos = [...newTodos, ...existingTodos];
      
      // Limit to 50 todos
      if (productivityData.todos.length > 50) {
        productivityData.todos = productivityData.todos.slice(0, 50);
        showNotification(`Imported ${newTodos.length} task(s). List trimmed to 50.`);
      } else {
        showNotification(`Imported ${newTodos.length} new task(s)!`);
      }
      
      chrome.storage.sync.set({ productivityData }, () => {
        updateTodoStats();
      });
      
    } catch (error) {
      showNotification('Error reading file', true);
    }
  };
  reader.readAsText(file);
  
  event.target.value = '';
}

function resetStats() {
  if (!confirm('Are you sure you want to reset all statistics? This cannot be undone.')) {
    return;
  }
  
  chrome.runtime.sendMessage({ action: 'resetStats' }, () => {
    stats = {
      totalBlocks: 0,
      blocksByDomain: {},
      lastReset: new Date().toISOString()
    };
    renderStats();
    showNotification('Statistics reset successfully!');
  });
}

function showNotification(message, isError = false) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${isError ? '#ff3b30' : '#34c759'};
    color: white;
    padding: 16px 24px;
    border-radius: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 1000;
    font-weight: 500;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = message;
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(400px); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ==================== SYNC FUNCTIONS ====================

// Generate hash from passphrase
async function generateSyncHash(passphrase) {
  const encoder = new TextEncoder();
  const data = encoder.encode(passphrase + '_focus_guard_salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

// Load sync status
function loadSyncStatus() {
  chrome.runtime.sendMessage({ action: 'getSyncSettings' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error loading sync settings:', chrome.runtime.lastError);
      return;
    }

    if (response && response.enabled) {
      showSyncEnabled();
    } else {
      showSyncDisabled();
    }
  });
}

// Show sync enabled UI
function showSyncEnabled() {
  document.getElementById('syncDisabled').style.display = 'none';
  document.getElementById('syncEnabled').style.display = 'block';
}

// Show sync disabled UI
function showSyncDisabled() {
  document.getElementById('syncDisabled').style.display = 'block';
  document.getElementById('syncEnabled').style.display = 'none';
}

// Enable sync
async function enableSync() {
  const passphrase = document.getElementById('syncPassphrase').value.trim();

  if (!passphrase) {
    showNotification('Please enter a passphrase', true);
    return;
  }

  if (passphrase.length < 4) {
    showNotification('Passphrase must be at least 4 characters', true);
    return;
  }

  try {
    const userHash = await generateSyncHash(passphrase);

    chrome.runtime.sendMessage({
      action: 'setSyncSettings',
      enabled: true,
      userHash: userHash
    }, (response) => {
      if (chrome.runtime.lastError) {
        showNotification('Error enabling sync', true);
        return;
      }

      if (response && response.success) {
        showSyncEnabled();
        showNotification('Sync enabled! Use the same passphrase on your phone.');

        // Clear the passphrase input
        document.getElementById('syncPassphrase').value = '';
      } else {
        showNotification('Error enabling sync', true);
      }
    });
  } catch (error) {
    console.error('Error enabling sync:', error);
    showNotification('Error enabling sync', true);
  }
}

// Disable sync
function disableSync() {
  if (!confirm('Disable sync? Your todos will remain on your devices but won\'t sync anymore.')) {
    return;
  }

  chrome.runtime.sendMessage({
    action: 'setSyncSettings',
    enabled: false,
    userHash: null
  }, (response) => {
    if (chrome.runtime.lastError) {
      showNotification('Error disabling sync', true);
      return;
    }

    if (response && response.success) {
      showSyncDisabled();
      showNotification('Sync disabled');
    } else {
      showNotification('Error disabling sync', true);
    }
  });
}

// Force sync now
function forceSync() {
  showNotification('Syncing todos...');

  // Get current todos and trigger a re-save to update timestamps
  chrome.runtime.sendMessage({ action: 'getTodosForSync' }, (response) => {
    if (chrome.runtime.lastError) {
      showNotification('Error syncing', true);
      return;
    }

    if (response && response.success) {
      showNotification('Sync complete! ' + response.todos.length + ' todos synced.');
    }
  });
}

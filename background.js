// Background service worker for Focus Guard

// ==================== CONFIGURATION ====================
const CONFIG = {
  MINUTES_SAVED_PER_BLOCK: 7,
  MAX_BYPASS_LOG: 100,
  MAX_TODOS: 50,
  MAX_WEEKLY_STATS_WEEKS: 52, // Keep 1 year of weekly stats
  POINTS_PER_TODO: 10,
  PAUSE_COST_POINTS: 25,
  BYPASS_PENALTY_POINTS: 25,
  PAUSE_TIERS: {
    tier1: { count: 3, minutes: 20 },
    tier2: { count: 3, minutes: 10 },
    tier3: { minutes: 5 }
  },
  FILE_SIZE_LIMIT: 102400, // 100KB
  URL_MAX_LENGTH: 255
};

// Shared badge definitions
const BADGE_DEFINITIONS = [
  { id: 'streak_7', name: '7-Day Warrior', description: '7 days without bypassing', icon: '🔥', condition: (data) => data.currentStreak >= 7 },
  { id: 'streak_30', name: 'Month Master', description: '30 days distraction-free', icon: '🏆', condition: (data) => data.currentStreak >= 30 },
  { id: 'streak_100', name: 'Century Club', description: '100-day streak achieved', icon: '💯', condition: (data) => data.longestStreak >= 100 },
  { id: 'blocks_100', name: 'Centurion', description: '100 distractions blocked', icon: '🛡️', condition: (data, stats) => stats.totalBlocks >= 100 },
  { id: 'blocks_500', name: 'Guardian', description: '500 distractions blocked', icon: '⚔️', condition: (data, stats) => stats.totalBlocks >= 500 },
  { id: 'blocks_1000', name: 'Legend', description: '1000 distractions blocked', icon: '👑', condition: (data, stats) => stats.totalBlocks >= 1000 },
  { id: 'score_500', name: 'Rising Star', description: '500 productivity points', icon: '⭐', condition: (data) => data.score >= 500 },
  { id: 'score_2000', name: 'Productivity Master', description: '2000 productivity points', icon: '💎', condition: (data) => data.score >= 2000 }
];

// ==================== STATE ====================
let isInitialized = false;
let blocklist = [];
let stats = {
  totalBlocks: 0,
  blocksByDomain: {},
  lastReset: new Date().toISOString()
};
let productivityData = {
  score: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastBypassDate: null,
  badges: [],
  bypassLog: [],
  temporaryPauses: {},
  userGoal: '',
  timeSavedMinutes: 0,
  weeklyStats: {},
  todos: [],
  dailyPauseCount: 0,
  dailyPauseDate: null
};

// ==================== UTILITY FUNCTIONS ====================

// Format minutes to human-readable string
function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

// Calculate pause duration based on daily count
function calculatePauseDuration(dailyPauseCount) {
  if (dailyPauseCount < CONFIG.PAUSE_TIERS.tier1.count) {
    return CONFIG.PAUSE_TIERS.tier1.minutes;
  } else if (dailyPauseCount < CONFIG.PAUSE_TIERS.tier1.count + CONFIG.PAUSE_TIERS.tier2.count) {
    return CONFIG.PAUSE_TIERS.tier2.minutes;
  }
  return CONFIG.PAUSE_TIERS.tier3.minutes;
}

// Get week key for weekly stats
function getWeekKey() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}

// Validate URL/domain input
function validateBlocklistEntry(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL required' };
  }

  const trimmed = url.trim().toLowerCase();

  if (trimmed.length === 0) {
    return { valid: false, error: 'URL cannot be empty' };
  }

  if (trimmed.length > CONFIG.URL_MAX_LENGTH) {
    return { valid: false, error: 'URL too long (max 255 characters)' };
  }

  // Check for invalid characters
  if (/[<>\"'`\s]/.test(trimmed)) {
    return { valid: false, error: 'URL contains invalid characters' };
  }

  return { valid: true, normalized: trimmed };
}

// Safe storage set with error handling
function safeStorageSet(data, callback) {
  chrome.storage.sync.set(data, () => {
    if (chrome.runtime.lastError) {
      console.error('Storage error:', chrome.runtime.lastError);
      if (callback) callback({ success: false, error: chrome.runtime.lastError.message });
    } else {
      if (callback) callback({ success: true });
    }
  });
}

// ==================== DOMAIN MATCHING (FIXED) ====================

// Properly check if hostname matches a pattern
function isValidDomainMatch(hostname, pattern) {
  const testHostname = hostname.toLowerCase();
  const blockPattern = pattern.toLowerCase();

  // Exact match
  if (testHostname === blockPattern) {
    return true;
  }

  // Wildcard match (*.example.com)
  if (blockPattern.startsWith('*.')) {
    const domain = blockPattern.substring(2);
    // Match exact domain or any subdomain
    return testHostname === domain || testHostname.endsWith('.' + domain);
  }

  // Check if pattern is a suffix match (e.g., "facebook.com" should match "www.facebook.com")
  if (testHostname.endsWith('.' + blockPattern)) {
    return true;
  }

  return false;
}

// Check if URL matches any blocked pattern
function isBlocked(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Check temporary pauses first
    if (productivityData.temporaryPauses[hostname]) {
      const expiryTime = productivityData.temporaryPauses[hostname];
      if (Date.now() < expiryTime) {
        return null; // Site is temporarily allowed
      } else {
        // Pause expired, remove it
        delete productivityData.temporaryPauses[hostname];
        safeStorageSet({ productivityData });
      }
    }

    for (const pattern of blocklist) {
      if (!pattern.enabled) continue;

      if (isValidDomainMatch(hostname, pattern.url)) {
        return pattern;
      }
    }
  } catch (e) {
    console.error('Error checking URL:', e);
  }

  return null;
}

// ==================== DATA CLEANUP ====================

// Clean up expired temporary pauses
function cleanupExpiredPauses() {
  const now = Date.now();
  let hasChanges = false;

  for (const domain in productivityData.temporaryPauses) {
    if (productivityData.temporaryPauses[domain] < now) {
      delete productivityData.temporaryPauses[domain];
      hasChanges = true;
    }
  }

  if (hasChanges) {
    safeStorageSet({ productivityData });
  }
}

// Clean up old weekly stats (keep only last year)
function cleanupOldWeeklyStats() {
  const weeks = Object.keys(productivityData.weeklyStats).sort();

  if (weeks.length > CONFIG.MAX_WEEKLY_STATS_WEEKS) {
    const weeksToRemove = weeks.slice(0, weeks.length - CONFIG.MAX_WEEKLY_STATS_WEEKS);
    weeksToRemove.forEach(week => {
      delete productivityData.weeklyStats[week];
    });
    safeStorageSet({ productivityData });
  }
}

// Clean up low-frequency blocked domains (keep top 100)
function cleanupBlocksByDomain() {
  const domains = Object.entries(stats.blocksByDomain);

  if (domains.length > 100) {
    // Sort by block count descending
    domains.sort((a, b) => b[1] - a[1]);

    // Keep only top 100
    stats.blocksByDomain = {};
    domains.slice(0, 100).forEach(([domain, count]) => {
      stats.blocksByDomain[domain] = count;
    });

    safeStorageSet({ stats });
  }
}

// Run all cleanup tasks
function runCleanupTasks() {
  cleanupExpiredPauses();
  cleanupOldWeeklyStats();
  cleanupBlocksByDomain();
}

// ==================== INITIALIZATION ====================

// Load all data from storage (batched)
function initializeData() {
  chrome.storage.sync.get(['blocklist', 'stats', 'productivityData'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to load data:', chrome.runtime.lastError);
      isInitialized = true; // Still mark as initialized to prevent blocking
      return;
    }

    blocklist = result.blocklist || [];
    stats = result.stats || stats;

    // Merge stored data with defaults to ensure all fields exist
    if (result.productivityData) {
      productivityData = {
        score: result.productivityData.score || 0,
        currentStreak: result.productivityData.currentStreak || 0,
        longestStreak: result.productivityData.longestStreak || 0,
        lastBypassDate: result.productivityData.lastBypassDate || null,
        badges: result.productivityData.badges || [],
        bypassLog: result.productivityData.bypassLog || [],
        temporaryPauses: result.productivityData.temporaryPauses || {},
        userGoal: result.productivityData.userGoal || '',
        timeSavedMinutes: result.productivityData.timeSavedMinutes || 0,
        weeklyStats: result.productivityData.weeklyStats || {},
        todos: result.productivityData.todos || [],
        dailyPauseCount: result.productivityData.dailyPauseCount || 0,
        dailyPauseDate: result.productivityData.dailyPauseDate || null
      };
    }

    isInitialized = true;

    // Run cleanup tasks after initialization
    runCleanupTasks();

    // Update streak after data is loaded
    updateStreak();
  });
}

// Initialize on load
initializeData();

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (changes.blocklist) {
    blocklist = changes.blocklist.newValue || [];
  }
  if (changes.stats) {
    stats = changes.stats.newValue || stats;
  }
  if (changes.productivityData) {
    productivityData = changes.productivityData.newValue || productivityData;
  }
});

// ==================== STATISTICS ====================

function updateStats(domain) {
  stats.totalBlocks++;
  stats.blocksByDomain[domain] = (stats.blocksByDomain[domain] || 0) + 1;
  productivityData.timeSavedMinutes += CONFIG.MINUTES_SAVED_PER_BLOCK;

  const weekKey = getWeekKey();
  if (!productivityData.weeklyStats[weekKey]) {
    productivityData.weeklyStats[weekKey] = {
      blocks: 0,
      bypasses: 0,
      timeSaved: 0,
      badgesEarned: [],
      startDate: new Date().toISOString()
    };
  }
  productivityData.weeklyStats[weekKey].blocks++;
  productivityData.weeklyStats[weekKey].timeSaved += CONFIG.MINUTES_SAVED_PER_BLOCK;

  safeStorageSet({ stats, productivityData });
  checkAndAwardBadges();
}

function updateStreak() {
  if (!isInitialized) return; // Don't update before data is loaded

  const today = new Date().toDateString();
  const lastBypass = productivityData.lastBypassDate ? new Date(productivityData.lastBypassDate).toDateString() : null;

  if (!lastBypass) return;

  if (lastBypass === today) {
    productivityData.currentStreak = 0;
  } else {
    const daysSinceBypass = Math.floor((new Date() - new Date(productivityData.lastBypassDate)) / (1000 * 60 * 60 * 24));
    productivityData.currentStreak = daysSinceBypass;

    if (productivityData.currentStreak > productivityData.longestStreak) {
      productivityData.longestStreak = productivityData.currentStreak;
    }
  }

  safeStorageSet({ productivityData });
}

function logBypass(domain, reason, method) {
  const bypass = {
    domain: domain,
    reason: reason || 'No reason provided',
    method: method || 'unknown',
    timestamp: new Date().toISOString()
  };

  productivityData.bypassLog.unshift(bypass);

  if (productivityData.bypassLog.length > CONFIG.MAX_BYPASS_LOG) {
    productivityData.bypassLog = productivityData.bypassLog.slice(0, CONFIG.MAX_BYPASS_LOG);
  }

  productivityData.score = Math.max(0, productivityData.score - CONFIG.BYPASS_PENALTY_POINTS);
  productivityData.lastBypassDate = new Date().toISOString();
  productivityData.currentStreak = 0;

  safeStorageSet({ productivityData });
}

// ==================== BADGES ====================

function checkAndAwardBadges() {
  const newBadges = [];

  BADGE_DEFINITIONS.forEach(badge => {
    if (!productivityData.badges.includes(badge.id) && badge.condition(productivityData, stats)) {
      newBadges.push(badge);
      productivityData.badges.push(badge.id);
    }
  });

  if (newBadges.length > 0) {
    newBadges.forEach(badge => {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'New Badge Earned!',
        message: `${badge.icon} ${badge.name}: ${badge.description}`,
        priority: 2
      });
    });

    safeStorageSet({ productivityData });
  }
}

// ==================== NAVIGATION BLOCKING ====================

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;

  const blocked = isBlocked(details.url);
  if (blocked) {
    const domain = new URL(details.url).hostname;
    updateStats(domain);

    const blockedPageUrl = chrome.runtime.getURL('blocked.html') +
                          '?domain=' + encodeURIComponent(domain) +
                          '&url=' + encodeURIComponent(details.url);

    chrome.tabs.update(details.tabId, { url: blockedPageUrl });
  }
});

// ==================== CONTEXT MENU ====================

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
  // Run cleanup on install/update
  runCleanupTasks();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
  // Run cleanup on browser startup
  runCleanupTasks();
});

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'blockThisSite',
      title: 'Block this site with Focus Guard',
      contexts: ['page', 'link'],
      documentUrlPatterns: ['http://*/*', 'https://*/*']
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'blockThisSite') {
    let url = info.pageUrl;
    if (info.linkUrl) {
      url = info.linkUrl;
    }

    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      if (urlObj.protocol === 'chrome:' || urlObj.protocol === 'chrome-extension:') {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Cannot Block',
          message: 'Chrome internal pages cannot be blocked',
          priority: 1
        });
        return;
      }

      addToBlocklist(domain);
    } catch (e) {
      console.error('Error parsing URL:', e);
    }
  }
});

// ==================== KEYBOARD SHORTCUTS ====================

chrome.commands.onCommand.addListener((command) => {
  if (command === 'block-current-site') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        try {
          const urlObj = new URL(tabs[0].url);
          const domain = urlObj.hostname;

          if (urlObj.protocol === 'chrome:' || urlObj.protocol === 'chrome-extension:') {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: 'Cannot Block',
              message: 'Chrome internal pages cannot be blocked',
              priority: 1
            });
            return;
          }

          addToBlocklist(domain);
        } catch (e) {
          console.error('Error parsing URL:', e);
        }
      }
    });
  }
});

// ==================== BLOCKLIST MANAGEMENT ====================

function addToBlocklist(domain) {
  const validation = validateBlocklistEntry(domain);
  if (!validation.valid) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Invalid Domain',
      message: validation.error,
      priority: 1
    });
    return;
  }

  const normalizedDomain = validation.normalized;

  if (blocklist.some(item => item.url === normalizedDomain)) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Already Blocked',
      message: `${normalizedDomain} is already in your blocklist`,
      priority: 1
    });
    return;
  }

  blocklist.push({
    url: normalizedDomain,
    enabled: true,
    addedAt: new Date().toISOString()
  });

  safeStorageSet({ blocklist }, (result) => {
    if (result.success) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Site Blocked',
        message: `${normalizedDomain} has been added to your blocklist`,
        priority: 1
      });
    }
  });
}

// ==================== WEEKLY REPORT ====================

function generateWeeklyReport() {
  const currentWeek = getWeekKey();
  const currentWeekStats = productivityData.weeklyStats[currentWeek] || {
    blocks: 0,
    bypasses: 0,
    timeSaved: 0,
    badgesEarned: [],
    startDate: new Date().toISOString()
  };

  const allWeeks = Object.keys(productivityData.weeklyStats).sort();
  const currentWeekIndex = allWeeks.indexOf(currentWeek);
  const lastWeekKey = currentWeekIndex > 0 ? allWeeks[currentWeekIndex - 1] : null;
  const lastWeekStats = lastWeekKey ? productivityData.weeklyStats[lastWeekKey] : {
    blocks: 0,
    bypasses: 0,
    timeSaved: 0,
    badgesEarned: []
  };

  const blocksChange = currentWeekStats.blocks - lastWeekStats.blocks;
  const timeSavedChange = currentWeekStats.timeSaved - lastWeekStats.timeSaved;

  let message = '';
  if (currentWeekStats.blocks >= 50) {
    message = "Outstanding! You're a productivity machine!";
  } else if (currentWeekStats.blocks >= 30) {
    message = "Great week! Keep up the momentum!";
  } else if (currentWeekStats.blocks >= 15) {
    message = "Solid progress! You're building good habits!";
  } else if (currentWeekStats.blocks >= 5) {
    message = "Good start! Every block counts!";
  } else {
    message = "New week, new opportunities to stay focused!";
  }

  return {
    currentWeek: {
      blocks: currentWeekStats.blocks,
      bypasses: currentWeekStats.bypasses,
      timeSaved: currentWeekStats.timeSaved,
      badgesEarned: currentWeekStats.badgesEarned
    },
    lastWeek: {
      blocks: lastWeekStats.blocks,
      timeSaved: lastWeekStats.timeSaved
    },
    changes: {
      blocks: blocksChange,
      timeSaved: timeSavedChange
    },
    streak: productivityData.currentStreak,
    totalTimeSaved: productivityData.timeSavedMinutes,
    message: message,
    weekStart: currentWeekStats.startDate
  };
}

// ==================== MESSAGE HANDLING ====================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Batch data request - returns all data in one call
  if (request.action === 'getAllData') {
    updateStreak();

    // Reset daily pause count if it's a new day
    const today = new Date().toDateString();
    if (productivityData.dailyPauseDate !== today) {
      productivityData.dailyPauseCount = 0;
      productivityData.dailyPauseDate = today;
      safeStorageSet({ productivityData });
    }

    // Calculate pause info
    const pauseMinutes = calculatePauseDuration(productivityData.dailyPauseCount);
    const tier1Total = CONFIG.PAUSE_TIERS.tier1.count;
    const tier2Total = tier1Total + CONFIG.PAUSE_TIERS.tier2.count;

    sendResponse({
      stats: stats,
      productivityData: productivityData,
      blocklist: blocklist,
      config: CONFIG,
      badges: BADGE_DEFINITIONS,
      todos: productivityData.todos || [],
      pauseInfo: {
        pauseMinutes: pauseMinutes,
        dailyPauseCount: productivityData.dailyPauseCount,
        pausesUntilDecrease: productivityData.dailyPauseCount < tier1Total ? (tier1Total - productivityData.dailyPauseCount) :
                             productivityData.dailyPauseCount < tier2Total ? (tier2Total - productivityData.dailyPauseCount) : 0
      }
    });
  } else if (request.action === 'getStats') {
    sendResponse(stats);
  } else if (request.action === 'resetStats') {
    stats = {
      totalBlocks: 0,
      blocksByDomain: {},
      lastReset: new Date().toISOString()
    };
    safeStorageSet({ stats });
    sendResponse({ success: true });
  } else if (request.action === 'getProductivityData') {
    updateStreak();
    sendResponse(productivityData);
  } else if (request.action === 'logBypass') {
    logBypass(request.domain, request.reason, request.method);
    sendResponse({ success: true });
  } else if (request.action === 'resetProductivityData') {
    productivityData = {
      score: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastBypassDate: null,
      badges: [],
      bypassLog: [],
      temporaryPauses: {},
      userGoal: productivityData.userGoal || '',
      timeSavedMinutes: 0,
      weeklyStats: {},
      todos: [],
      dailyPauseCount: 0,
      dailyPauseDate: null
    };
    safeStorageSet({ productivityData });
    sendResponse({ success: true });
  } else if (request.action === 'getPauseDuration') {
    // Reset daily pause count if it's a new day
    const today = new Date().toDateString();
    if (productivityData.dailyPauseDate !== today) {
      productivityData.dailyPauseCount = 0;
      productivityData.dailyPauseDate = today;
      safeStorageSet({ productivityData });
    }

    const pauseMinutes = calculatePauseDuration(productivityData.dailyPauseCount);
    const tier1Total = CONFIG.PAUSE_TIERS.tier1.count;
    const tier2Total = tier1Total + CONFIG.PAUSE_TIERS.tier2.count;

    sendResponse({
      pauseMinutes: pauseMinutes,
      dailyPauseCount: productivityData.dailyPauseCount,
      pausesUntilDecrease: productivityData.dailyPauseCount < tier1Total ? (tier1Total - productivityData.dailyPauseCount) :
                           productivityData.dailyPauseCount < tier2Total ? (tier2Total - productivityData.dailyPauseCount) : 0
    });
  } else if (request.action === 'requestTemporaryPause') {
    if (productivityData.score < CONFIG.PAUSE_COST_POINTS) {
      sendResponse({ success: false, error: 'insufficient_points' });
    } else {
      // Reset daily pause count if it's a new day
      const today = new Date().toDateString();
      if (productivityData.dailyPauseDate !== today) {
        productivityData.dailyPauseCount = 0;
        productivityData.dailyPauseDate = today;
      }

      const pauseMinutes = calculatePauseDuration(productivityData.dailyPauseCount);

      productivityData.score -= CONFIG.PAUSE_COST_POINTS;
      productivityData.dailyPauseCount++;

      const domain = request.domain;
      const expiryTime = Date.now() + (pauseMinutes * 60 * 1000);
      productivityData.temporaryPauses[domain] = expiryTime;

      productivityData.bypassLog.unshift({
        domain: domain,
        reason: 'Used ' + pauseMinutes + '-minute pause feature (pause #' + productivityData.dailyPauseCount + ' today)',
        method: 'temporary_pause',
        timestamp: new Date().toISOString(),
        expiryTime: new Date(expiryTime).toISOString()
      });

      if (productivityData.bypassLog.length > CONFIG.MAX_BYPASS_LOG) {
        productivityData.bypassLog = productivityData.bypassLog.slice(0, CONFIG.MAX_BYPASS_LOG);
      }

      safeStorageSet({ productivityData });
      sendResponse({ success: true, expiryTime: expiryTime, pauseMinutes: pauseMinutes, dailyPauseCount: productivityData.dailyPauseCount });
    }
  } else if (request.action === 'setUserGoal') {
    productivityData.userGoal = request.goal;
    safeStorageSet({ productivityData });
    sendResponse({ success: true });
  } else if (request.action === 'getWeeklyReport') {
    const report = generateWeeklyReport();
    sendResponse(report);
  } else if (request.action === 'getConfig') {
    sendResponse({ config: CONFIG, badges: BADGE_DEFINITIONS });
  } else if (request.action === 'getTodos') {
    if (!productivityData.todos) {
      productivityData.todos = [];
    }
    sendResponse({ todos: productivityData.todos });
  } else if (request.action === 'addTodo') {
    // Validate input
    if (!request.text || typeof request.text !== 'string' || request.text.trim().length === 0) {
      sendResponse({ success: false, error: 'Invalid todo text' });
      return true;
    }

    const newTodo = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString() + Math.random().toString(36).substr(2, 9),
      text: request.text.trim(),
      completed: false,
      createdAt: new Date().toISOString()
    };
    if (!productivityData.todos) {
      productivityData.todos = [];
    }
    productivityData.todos.unshift(newTodo);
    if (productivityData.todos.length > CONFIG.MAX_TODOS) {
      productivityData.todos = productivityData.todos.slice(0, CONFIG.MAX_TODOS);
    }
    safeStorageSet({ productivityData });
    sendResponse({ success: true, todo: newTodo });
  } else if (request.action === 'completeTodo') {
    if (!productivityData.todos) {
      productivityData.todos = [];
    }
    const todoIndex = productivityData.todos.findIndex(t => t.id === request.id);
    if (todoIndex !== -1 && !productivityData.todos[todoIndex].completed) {
      productivityData.todos[todoIndex].completed = true;
      productivityData.todos[todoIndex].completedAt = new Date().toISOString();
      productivityData.score += CONFIG.POINTS_PER_TODO;
      safeStorageSet({ productivityData });
      checkAndAwardBadges();
      sendResponse({ success: true, newScore: productivityData.score });
    } else {
      sendResponse({ success: false, error: 'Todo not found or already completed' });
    }
  } else if (request.action === 'deleteTodo') {
    if (!productivityData.todos) {
      productivityData.todos = [];
    }
    const todoIndex = productivityData.todos.findIndex(t => t.id === request.id);
    if (todoIndex !== -1) {
      productivityData.todos.splice(todoIndex, 1);
      safeStorageSet({ productivityData });
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Todo not found' });
    }
  } else if (request.action === 'editTodo') {
    if (!productivityData.todos) {
      productivityData.todos = [];
    }

    // Validate input
    if (!request.text || typeof request.text !== 'string' || request.text.trim().length === 0) {
      sendResponse({ success: false, error: 'Invalid todo text' });
      return true;
    }

    const todoIndex = productivityData.todos.findIndex(t => t.id === request.id);
    if (todoIndex !== -1) {
      productivityData.todos[todoIndex].text = request.text.trim();
      productivityData.todos[todoIndex].editedAt = new Date().toISOString();
      safeStorageSet({ productivityData });
      sendResponse({ success: true, todo: productivityData.todos[todoIndex] });
    } else {
      sendResponse({ success: false, error: 'Todo not found' });
    }
  } else if (request.action === 'importTodos') {
    if (!productivityData.todos) {
      productivityData.todos = [];
    }

    // Validate imported todos
    if (!Array.isArray(request.newTodos)) {
      sendResponse({ success: false, error: 'Invalid todos data' });
      return true;
    }

    // Filter and validate each todo
    const validTodos = request.newTodos.filter(todo =>
      todo && typeof todo.text === 'string' && todo.text.trim().length > 0
    ).map(todo => ({
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString() + Math.random().toString(36).substr(2, 9),
      text: todo.text.trim(),
      completed: !!todo.completed,
      createdAt: todo.createdAt || new Date().toISOString(),
      completedAt: todo.completedAt || null
    }));

    // Merge new todos at the beginning
    productivityData.todos = [...validTodos, ...productivityData.todos];

    // Limit to max todos
    if (productivityData.todos.length > CONFIG.MAX_TODOS) {
      productivityData.todos = productivityData.todos.slice(0, CONFIG.MAX_TODOS);
    }

    safeStorageSet({ productivityData });
    sendResponse({
      success: true,
      todos: productivityData.todos,
      newScore: productivityData.score,
      importedCount: validTodos.length
    });
  } else if (request.action === 'validateBlocklistEntry') {
    sendResponse(validateBlocklistEntry(request.url));
  } else if (request.action === 'runCleanup') {
    runCleanupTasks();
    sendResponse({ success: true });
  } else if (request.action === 'syncTodosFromFirebase') {
    // Sync todos from Firebase (called when extension detects changes)
    if (!Array.isArray(request.todos)) {
      sendResponse({ success: false, error: 'Invalid todos data' });
      return true;
    }

    // Merge with existing todos - Firebase is source of truth for synced items
    const firebaseTodos = request.todos.map(todo => ({
      id: todo.id,
      text: todo.text,
      completed: !!todo.completed,
      createdAt: todo.createdAt || new Date().toISOString(),
      completedAt: todo.completedAt || null,
      updatedAt: todo.updatedAt || new Date().toISOString(),
      syncedFromFirebase: true
    }));

    productivityData.todos = firebaseTodos;
    safeStorageSet({ productivityData });
    sendResponse({ success: true, todos: productivityData.todos });
  } else if (request.action === 'getTodosForSync') {
    // Get todos formatted for Firebase sync
    const todosForSync = (productivityData.todos || []).map(todo => ({
      id: todo.id,
      text: todo.text,
      completed: !!todo.completed,
      createdAt: todo.createdAt,
      completedAt: todo.completedAt,
      updatedAt: todo.updatedAt || new Date().toISOString()
    }));
    sendResponse({ success: true, todos: todosForSync });
  } else if (request.action === 'getSyncSettings') {
    // Get sync settings from storage
    chrome.storage.sync.get(['firebaseSyncEnabled', 'firebaseUserHash'], (result) => {
      sendResponse({
        enabled: result.firebaseSyncEnabled || false,
        userHash: result.firebaseUserHash || null
      });
    });
    return true; // Keep message channel open for async response
  } else if (request.action === 'setSyncSettings') {
    // Save sync settings
    chrome.storage.sync.set({
      firebaseSyncEnabled: request.enabled,
      firebaseUserHash: request.userHash
    }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true });
      }
    });
    return true; // Keep message channel open for async response
  }
  return true;
});

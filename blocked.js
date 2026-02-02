// Blocked page script for Focus Guard

let blockedDomain = '';
let blockedUrl = '';
let productivityData = {};
let todos = [];
let currentPauseMinutes = 20;
let showingCompletedTasks = false;
let isDataLoaded = false;

// Loading state management
function showLoading(elementId, message = 'Loading...') {
  const el = document.getElementById(elementId);
  if (el) {
    el.classList.add('loading');
    el.setAttribute('data-original-content', el.innerHTML);
    if (el.classList.contains('stat-value')) {
      el.innerHTML = '<span class="loading-spinner"></span>';
    }
  }
}

function hideLoading(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    el.classList.remove('loading');
  }
}

function showSectionLoading(sectionClass) {
  const sections = document.querySelectorAll('.' + sectionClass);
  sections.forEach(function(section) {
    section.classList.add('section-loading');
  });
}

function hideSectionLoading(sectionClass) {
  const sections = document.querySelectorAll('.' + sectionClass);
  sections.forEach(function(section) {
    section.classList.remove('section-loading');
  });
}

const challengeQuestions = [
  "Why do you need to access this site right now?",
  "What specific task requires you to visit this site?",
  "Will visiting this site help you achieve your goals today?",
  "What will you accomplish by going to this site?",
  "Can this wait until your work is done?",
  "Is this the best use of your time right now?",
  "What are you avoiding by wanting to visit this site?",
  "Will you regret this decision in an hour?"
];

const motivationalPhrases = [
  "I am wasting my time",
  "I am choosing distraction over progress",
  "I am avoiding my responsibilities",
  "This can wait until later",
  "I will regret this decision"
];

const timeMessages = {
  morning: "Good morning! Start your day with focus and intention. This site is blocked to help you achieve your goals today.",
  afternoon: "Stay strong! You're in the middle of your productive day. This site is blocked to help you maintain momentum.",
  evening: "Wind down mindfully. Reflect on your day's progress. This site is blocked to help you end the day with purpose."
};

const quotes = [
  '"The successful warrior is the average man, with laser-like focus." - Bruce Lee',
  '"Concentrate all your thoughts upon the work at hand." - Alexander Graham Bell',
  '"It is during our darkest moments that we must focus to see the light." - Aristotle',
  '"The key to success is to focus on things we desire not things we fear." - Brian Tracy',
  '"My success is that I have focused in on a few things." - Bill Gates',
  '"Stay focused, go after your dreams and keep moving toward your goals." - LL Cool J',
  '"Lack of direction, not lack of time, is the problem." - Zig Ziglar',
  '"The shorter way to do many things is to only do one thing at a time." - Mozart',
  '"Focus is a matter of deciding what things you are not going to do." - John Carmack',
  '"Starve your distractions, feed your focus." - Unknown'
];

document.addEventListener('DOMContentLoaded', function() {
  const params = new URLSearchParams(window.location.search);
  blockedDomain = params.get('domain');
  blockedUrl = params.get('url');
  
  if (blockedDomain) {
    document.getElementById('blockedUrl').textContent = blockedDomain;
    document.title = blockedDomain + ' - Blocked';
  }
  
  applyTimeBasedTheme();
  loadStats();
  
  // Navigation buttons
  document.getElementById('backButton').addEventListener('click', function() {
    window.history.back();
  });
  
  document.getElementById('settingsButton').addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
  });
  
  // Pause button
  document.getElementById('pauseButton').addEventListener('click', handlePauseRequest);
  
  // Break Glass functionality
  document.getElementById('breakGlassButton').addEventListener('click', openBreakGlassModal);
  document.getElementById('cancelBreakGlass').addEventListener('click', closeBreakGlassModal);
  document.getElementById('confirmBreakGlass').addEventListener('click', handleBreakGlass);
  document.getElementById('phraseInput').addEventListener('input', validatePhrase);
  
  // Challenge modal
  document.getElementById('cancelChallenge').addEventListener('click', closeChallengeModal);
  document.getElementById('confirmChallenge').addEventListener('click', handleChallenge);
  
  // Set random phrase and question
  const randomPhrase = motivationalPhrases[Math.floor(Math.random() * motivationalPhrases.length)];
  document.getElementById('phraseToType').textContent = randomPhrase;
  
  const randomQuestion = challengeQuestions[Math.floor(Math.random() * challengeQuestions.length)];
  document.getElementById('challengeQuestion').textContent = randomQuestion;
  
  // Set random quote
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
  document.querySelector('.quote').textContent = randomQuote;
  
  // Todo List functionality
  document.getElementById('addTodoBtn').addEventListener('click', addTodo);

  // Handle textarea auto-resize and Enter key
  var todoInput = document.getElementById('todoInput');
  todoInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addTodo();
    }
  });
  todoInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  // View toggle functionality
  var viewToggleBtns = document.querySelectorAll('.view-toggle-btn');
  viewToggleBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var view = this.getAttribute('data-view');
      setTodoView(view);
    });
  });

  // Load saved view preference
  chrome.storage.local.get(['todoViewMode'], function(result) {
    if (result.todoViewMode) {
      setTodoView(result.todoViewMode);
    }
  });
  
  // Event delegation for todo list interactions
  document.getElementById('todoList').addEventListener('click', function(e) {
    const target = e.target;
    const todoItem = target.closest('.todo-item');

    if (!todoItem) return;

    const todoId = todoItem.getAttribute('data-todo-id');

    // Check if clicked on checkbox
    if (target.classList.contains('todo-checkbox')) {
      if (!target.classList.contains('checked')) {
        completeTodo(todoId, todoItem);
      }
    }

    // Check if clicked on delete button
    if (target.classList.contains('todo-delete')) {
      deleteTodo(todoId);
    }

    // Check if clicked on todo text (for editing)
    if (target.classList.contains('todo-text') && !todoItem.classList.contains('completed') && !todoItem.classList.contains('editing')) {
      startEditTodo(todoId, todoItem);
    }

    // Check if clicked on edit save button
    if (target.classList.contains('todo-edit-save')) {
      saveEditTodo(todoId, todoItem);
    }

    // Check if clicked on edit cancel button
    if (target.classList.contains('todo-edit-cancel')) {
      cancelEditTodo(todoId);
    }
  });

  // Handle keyboard events for todo editing
  document.getElementById('todoList').addEventListener('keydown', function(e) {
    if (e.target.classList.contains('todo-edit-input')) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const todoItem = e.target.closest('.todo-item');
        const todoId = todoItem.getAttribute('data-todo-id');
        saveEditTodo(todoId, todoItem);
      } else if (e.key === 'Escape') {
        const todoItem = e.target.closest('.todo-item');
        const todoId = todoItem.getAttribute('data-todo-id');
        cancelEditTodo(todoId);
      }
    }
  });
  
  // Todo import/export/view completed buttons
  document.getElementById('viewCompletedBtn').addEventListener('click', toggleCompletedView);
  document.getElementById('exportTodosBtn').addEventListener('click', exportTodos);
  document.getElementById('importTodosBtn').addEventListener('click', function() {
    document.getElementById('importTodosFile').click();
  });
  document.getElementById('importTodosFile').addEventListener('change', importTodos);

  // Note: todos are loaded via the batched getAllData call in loadStats()
});

function applyTimeBasedTheme() {
  const hour = new Date().getHours();
  const body = document.body;
  const messageEl = document.getElementById('timeMessage');
  
  if (hour >= 5 && hour < 12) {
    body.classList.add('morning');
    messageEl.textContent = timeMessages.morning;
  } else if (hour >= 12 && hour < 18) {
    body.classList.add('afternoon');
    messageEl.textContent = timeMessages.afternoon;
  } else {
    body.classList.add('evening');
    messageEl.textContent = timeMessages.evening;
  }
}

function loadStats() {
  // Show loading states
  showLoading('totalBlocks');
  showLoading('currentPoints');
  showLoading('timeSaved');
  showSectionLoading('pause-indicator');

  // Use batched data loading for better performance
  chrome.runtime.sendMessage({ action: 'getAllData' }, function(response) {
    if (chrome.runtime.lastError) {
      console.error('Error loading data:', chrome.runtime.lastError);
      hideLoading('totalBlocks');
      hideLoading('currentPoints');
      hideLoading('timeSaved');
      hideSectionLoading('pause-indicator');
      return;
    }

    if (response) {
      isDataLoaded = true;

      // Update stats from batched response
      var stats = response.stats || {};
      document.getElementById('totalBlocks').textContent = stats.totalBlocks || 0;
      hideLoading('totalBlocks');

      // Update productivity data
      productivityData = response.productivityData || {};
      document.getElementById('currentPoints').textContent = productivityData.score || 0;
      hideLoading('currentPoints');

      // Format time saved
      var timeSavedMinutes = productivityData.timeSavedMinutes || 0;
      document.getElementById('timeSaved').textContent = formatTimeSaved(timeSavedMinutes);
      hideLoading('timeSaved');

      // Show user goal if set
      if (productivityData.userGoal && productivityData.userGoal.trim()) {
        document.getElementById('userGoalSection').style.display = 'block';
        document.getElementById('userGoal').textContent = productivityData.userGoal;
      }

      // Update todos from batched response
      todos = response.todos || [];
      renderTodos();

      // Update pause info from batched response
      var pauseInfo = response.pauseInfo || {};
      currentPauseMinutes = pauseInfo.pauseMinutes || 20;
      updatePauseIndicator(pauseInfo.dailyPauseCount || 0, currentPauseMinutes);
      hideSectionLoading('pause-indicator');

      // Update pause button with current info
      updatePauseButtonWithInfo(pauseInfo);
    }
  });
}

// Format time saved helper function
function formatTimeSaved(minutes) {
  var hours = Math.floor(minutes / 60);
  var mins = minutes % 60;
  if (hours > 0) {
    return hours + 'h ' + mins + 'm';
  }
  return mins + 'm';
}

// Update pause button with pre-fetched info (avoids extra API call)
function updatePauseButtonWithInfo(pauseInfo) {
  var pauseBtn = document.getElementById('pauseButton');
  var currentScore = productivityData.score || 0;
  var pauseMinutes = pauseInfo.pauseMinutes || currentPauseMinutes;
  var pausesUntilDecrease = pauseInfo.pausesUntilDecrease || 0;

  var pauseInfoText = pauseMinutes + '-Min Pause';
  if (pausesUntilDecrease > 0) {
    pauseInfoText += ' (' + pausesUntilDecrease + ' left at this duration)';
  }

  if (currentScore < 25) {
    pauseBtn.disabled = true;
    pauseBtn.style.opacity = '0.5';
    pauseBtn.style.cursor = 'not-allowed';
    pauseBtn.textContent = '⏸️ ' + pauseInfoText + ' - ' + currentScore + '/25 pts';
  } else {
    pauseBtn.disabled = false;
    pauseBtn.style.opacity = '1';
    pauseBtn.style.cursor = 'pointer';
    pauseBtn.textContent = '⏸️ ' + pauseInfoText + ' (' + currentScore + ' pts → ' + (currentScore - 25) + ')';
  }
}

function updatePauseButton() {
  // Only fetch pause duration if needed (e.g., after a pause is used)
  chrome.runtime.sendMessage({ action: 'getPauseDuration' }, function(response) {
    if (chrome.runtime.lastError) {
      console.error('Error getting pause duration:', chrome.runtime.lastError);
      return;
    }

    if (response) {
      currentPauseMinutes = response.pauseMinutes;
      var dailyCount = response.dailyPauseCount;

      // Update pause indicator
      updatePauseIndicator(dailyCount, currentPauseMinutes);

      // Update button with fetched info
      updatePauseButtonWithInfo(response);
    }
  });
}

function updatePauseIndicator(dailyCount, currentMinutes) {
  // Update pauses used today
  document.getElementById('pauseCountToday').textContent = dailyCount;

  // Update current pause duration
  document.getElementById('currentPauseDuration').textContent = currentMinutes + ' min';

  // Calculate next pause duration (after using current one)
  var nextCount = dailyCount + 1;
  var nextMinutes;
  if (nextCount <= 3) {
    nextMinutes = 20;
  } else if (nextCount <= 6) {
    nextMinutes = 10;
  } else {
    nextMinutes = 5;
  }
  document.getElementById('nextPauseDuration').textContent = nextMinutes + ' min';

  // Update tier info with remaining counts
  var tier1Remaining = Math.max(0, 3 - dailyCount);
  var tier2Remaining = dailyCount < 3 ? 3 : Math.max(0, 6 - dailyCount);

  var tierText = '';
  if (dailyCount < 3) {
    tierText = tier1Remaining + ' left at 20 min → then 3 at 10 min → then 5 min';
  } else if (dailyCount < 6) {
    tierText = tier2Remaining + ' left at 10 min → then 5 min';
  } else {
    tierText = 'All remaining pauses: 5 min each';
  }
  document.getElementById('pauseTierInfo').textContent = tierText;
}

function handlePauseRequest() {
  if (productivityData.score < 25) {
    alert('You need ' + (25 - productivityData.score) + ' more points to use the pause feature. Complete tasks to earn points!');
    return;
  }

  // Get current pause duration before showing confirmation
  chrome.runtime.sendMessage({ action: 'getPauseDuration' }, function(pauseInfo) {
    var pauseMinutes = pauseInfo ? pauseInfo.pauseMinutes : currentPauseMinutes;
    var dailyCount = pauseInfo ? pauseInfo.dailyPauseCount : 0;

    var confirmMsg = 'Use ' + pauseMinutes + '-minute pause?\n\nThis will:\n- Deduct 25 points from your score\n- Allow access to ' + blockedDomain + ' for ' + pauseMinutes + ' minutes\n- Be logged in your bypass history\n\nPauses used today: ' + dailyCount + '\nCurrent score: ' + productivityData.score + ' pts\nAfter pause: ' + (productivityData.score - 25) + ' pts';

    if (!confirm(confirmMsg)) {
      return;
    }

    chrome.runtime.sendMessage({
      action: 'requestTemporaryPause',
      domain: blockedDomain
    }, function(response) {
      if (response && response.success) {
        var expiryDate = new Date(response.expiryTime);
        var grantedMinutes = response.pauseMinutes;
        alert(grantedMinutes + '-minute pause granted!\n\nYou can access ' + blockedDomain + ' until ' + expiryDate.toLocaleTimeString() + '.\n\nPauses used today: ' + response.dailyPauseCount + '\n-25 points deducted.\nNew score: ' + (productivityData.score - 25) + ' pts');
        window.location.href = blockedUrl;
      } else if (response && response.error === 'insufficient_points') {
        alert('Insufficient points! You need 25 points to use this feature.');
      }
    });
  });
}

function openBreakGlassModal() {
  document.getElementById('breakGlassModal').classList.add('active');
  document.getElementById('phraseInput').value = '';
  document.getElementById('phraseInput').focus();
  document.getElementById('phraseError').textContent = '';
  document.getElementById('confirmBreakGlass').disabled = true;
}

function closeBreakGlassModal() {
  document.getElementById('breakGlassModal').classList.remove('active');
}

function validatePhrase() {
  var input = document.getElementById('phraseInput').value;
  var phrase = document.getElementById('phraseToType').textContent;
  var confirmBtn = document.getElementById('confirmBreakGlass');
  var errorMsg = document.getElementById('phraseError');
  
  if (input === phrase) {
    confirmBtn.disabled = false;
    errorMsg.textContent = '';
  } else {
    confirmBtn.disabled = true;
    if (input.length > 0) {
      errorMsg.textContent = 'Phrase does not match. Type it exactly as shown.';
    } else {
      errorMsg.textContent = '';
    }
  }
}

function handleBreakGlass() {
  closeBreakGlassModal();
  openChallengeModal();
}

function openChallengeModal() {
  document.getElementById('challengeModal').classList.add('active');
  document.getElementById('challengeAnswer').value = '';
  document.getElementById('challengeAnswer').focus();
}

function closeChallengeModal() {
  document.getElementById('challengeModal').classList.remove('active');
}

function handleChallenge() {
  var answer = document.getElementById('challengeAnswer').value.trim();
  
  if (answer.length < 10) {
    alert('Please provide a more thoughtful answer (at least 10 characters).');
    return;
  }
  
  chrome.runtime.sendMessage({
    action: 'logBypass',
    domain: blockedDomain,
    reason: answer,
    method: 'break_glass'
  }, function() {
    window.location.href = blockedUrl;
  });
}

// ==================== TODO LIST FUNCTIONS ====================

function setTodoView(viewMode) {
  var todoList = document.getElementById('todoList');
  var viewToggleBtns = document.querySelectorAll('.view-toggle-btn');

  // Remove all view classes
  todoList.classList.remove('view-expanded', 'view-compact', 'view-cards');

  // Add the selected view class
  todoList.classList.add('view-' + viewMode);

  // Update active button state
  viewToggleBtns.forEach(function(btn) {
    if (btn.getAttribute('data-view') === viewMode) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Save preference
  chrome.storage.local.set({ todoViewMode: viewMode });
}

function loadTodos() {
  chrome.runtime.sendMessage({ action: 'getTodos' }, function(response) {
    if (response && response.todos) {
      todos = response.todos;
      renderTodos();
    }
  });
}

function addTodo() {
  var input = document.getElementById('todoInput');
  var text = input.value.trim();

  if (!text) {
    input.style.borderColor = 'rgba(255, 107, 107, 0.8)';
    setTimeout(function() {
      input.style.borderColor = 'rgba(255, 255, 255, 0.3)';
    }, 1500);
    return;
  }

  // Validate input length
  if (text.length > 500) {
    alert('Task is too long. Please keep it under 500 characters.');
    return;
  }

  chrome.runtime.sendMessage({ action: 'addTodo', text: text }, function(response) {
    if (chrome.runtime.lastError) {
      console.error('Error adding todo:', chrome.runtime.lastError);
      alert('Error adding task. Please try again.');
      return;
    }

    if (response && response.success) {
      todos.unshift(response.todo);
      renderTodos();
      input.value = '';
      input.style.height = 'auto'; // Reset textarea height
      input.focus();
    } else if (response && response.error) {
      alert(response.error);
    }
  });
}

function completeTodo(todoId, todoItem) {
  var checkbox = todoItem.querySelector('.todo-checkbox');

  // Visual feedback immediately
  checkbox.classList.add('checked');
  todoItem.classList.add('completed');

  chrome.runtime.sendMessage({ action: 'completeTodo', id: todoId }, function(response) {
    if (chrome.runtime.lastError) {
      console.error('Error completing todo:', chrome.runtime.lastError);
      checkbox.classList.remove('checked');
      todoItem.classList.remove('completed');
      return;
    }

    if (response && response.success) {
      // Update local state
      for (var i = 0; i < todos.length; i++) {
        if (todos[i].id === todoId) {
          todos[i].completed = true;
          break;
        }
      }

      // Update points display
      document.getElementById('currentPoints').textContent = response.newScore;
      productivityData.score = response.newScore;
      updatePauseButton();

      // Show points earned animation
      var pointsBadge = document.createElement('span');
      pointsBadge.className = 'todo-points-badge';
      pointsBadge.textContent = '+10 pts!';
      todoItem.querySelector('.todo-text').appendChild(pointsBadge);

      // Remove task from view after animation (moves to completed list)
      setTimeout(function() {
        renderTodos();
      }, 1500);
    } else {
      // Revert visual changes if failed
      checkbox.classList.remove('checked');
      todoItem.classList.remove('completed');
    }
  });
}

function deleteTodo(todoId) {
  chrome.runtime.sendMessage({ action: 'deleteTodo', id: todoId }, function(response) {
    if (chrome.runtime.lastError) {
      console.error('Error deleting todo:', chrome.runtime.lastError);
      return;
    }

    if (response && response.success) {
      todos = todos.filter(function(t) {
        return t.id !== todoId;
      });
      renderTodos();
    }
  });
}

function renderTodos() {
  var listEl = document.getElementById('todoList');
  var emptyEl = document.getElementById('todoEmpty');
  var viewCompletedBtn = document.getElementById('viewCompletedBtn');

  // Filter based on current view mode
  var incompleteTodos = todos.filter(function(t) { return !t.completed; });
  var completedTodos = todos.filter(function(t) { return t.completed; });

  // Update the view completed button text and count
  if (viewCompletedBtn) {
    if (showingCompletedTasks) {
      viewCompletedBtn.textContent = '📋 View Active (' + incompleteTodos.length + ')';
    } else {
      viewCompletedBtn.textContent = '✅ Completed (' + completedTodos.length + ')';
    }
  }

  // Choose which todos to display based on view mode
  var displayTodos = showingCompletedTasks ? completedTodos : incompleteTodos;

  if (displayTodos.length === 0) {
    listEl.style.display = 'none';
    emptyEl.style.display = 'block';
    // Update empty message based on view
    var emptyTextEl = emptyEl.querySelector('div:nth-child(2)');
    var emptySubtextEl = emptyEl.querySelector('div:nth-child(3)');
    if (showingCompletedTasks) {
      emptyTextEl.textContent = 'No completed tasks';
      emptySubtextEl.textContent = 'Complete tasks to see them here!';
    } else {
      emptyTextEl.textContent = 'No tasks yet';
      emptySubtextEl.textContent = 'Add tasks to earn points!';
    }
    return;
  }

  listEl.style.display = 'block';
  emptyEl.style.display = 'none';

  var html = '';
  for (var i = 0; i < displayTodos.length; i++) {
    var todo = displayTodos[i];
    var completedClass = todo.completed ? 'completed' : '';
    var checkedClass = todo.completed ? 'checked' : '';
    var cursorStyle = todo.completed ? 'cursor: default;' : 'cursor: pointer;';

    html += '<li class="todo-item ' + completedClass + '" data-todo-id="' + todo.id + '">';
    html += '<div class="todo-checkbox ' + checkedClass + '" style="' + cursorStyle + '"></div>';
    html += '<span class="todo-text">' + escapeHtml(todo.text) + '</span>';
    html += '<button class="todo-delete" title="Delete task">×</button>';
    html += '</li>';
  }

  listEl.innerHTML = html;
}

function toggleCompletedView() {
  showingCompletedTasks = !showingCompletedTasks;
  var viewCompletedBtn = document.getElementById('viewCompletedBtn');
  if (showingCompletedTasks) {
    viewCompletedBtn.classList.add('active');
  } else {
    viewCompletedBtn.classList.remove('active');
  }
  renderTodos();
}

function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== TODO IMPORT/EXPORT FUNCTIONS ====================

function exportTodos() {
  if (todos.length === 0) {
    alert('No tasks to export. Add some tasks first!');
    return;
  }
  
  var data = {
    todos: todos,
    exportedAt: new Date().toISOString(),
    version: '2.0.0',
    stats: {
      total: todos.length,
      completed: todos.filter(function(t) { return t.completed; }).length,
      pending: todos.filter(function(t) { return !t.completed; }).length
    }
  };
  
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'focus-guard-tasks-' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  URL.revokeObjectURL(url);
  
  alert('Exported ' + todos.length + ' task(s) successfully!');
}

function importTodos(event) {
  var file = event.target.files[0];
  if (!file) return;

  // Validate file size (max 100KB)
  var MAX_FILE_SIZE = 100 * 1024; // 100KB
  if (file.size > MAX_FILE_SIZE) {
    alert('File is too large. Maximum size is 100KB.');
    event.target.value = '';
    return;
  }

  // Validate file type
  if (!file.name.endsWith('.json')) {
    alert('Please select a valid JSON file.');
    event.target.value = '';
    return;
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);

      if (!data.todos || !Array.isArray(data.todos)) {
        alert('Invalid tasks file. Please select a valid Focus Guard tasks export.');
        return;
      }

      // Validate each todo has required fields and sanitize
      var validTodos = data.todos.filter(function(todo) {
        return todo &&
               typeof todo.text === 'string' &&
               todo.text.trim() &&
               todo.text.length <= 500; // Max task length
      });

      if (validTodos.length === 0) {
        alert('No valid tasks found in file.');
        return;
      }

      // Get existing texts to avoid duplicates
      var existingTexts = {};
      todos.forEach(function(t) {
        existingTexts[t.text.toLowerCase().trim()] = true;
      });

      // Filter out duplicates and prepare new todos with fresh IDs
      var newTodos = [];
      validTodos.forEach(function(todo) {
        var textKey = todo.text.toLowerCase().trim();
        if (!existingTexts[textKey]) {
          newTodos.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            text: todo.text.trim().substring(0, 500), // Enforce max length
            completed: todo.completed || false,
            createdAt: todo.createdAt || new Date().toISOString(),
            completedAt: todo.completedAt || null
          });
          existingTexts[textKey] = true; // Mark as added
        }
      });

      if (newTodos.length === 0) {
        alert('All tasks in the file already exist in your list.');
        return;
      }

      // Send to background to merge and save
      chrome.runtime.sendMessage({
        action: 'importTodos',
        newTodos: newTodos
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.error('Error importing todos:', chrome.runtime.lastError);
          alert('Error importing tasks. Please try again.');
          return;
        }

        if (response && response.success) {
          todos = response.todos;
          renderTodos();

          // Update points display
          document.getElementById('currentPoints').textContent = response.newScore;
          productivityData.score = response.newScore;
          updatePauseButton();

          alert('Imported ' + newTodos.length + ' new task(s)!');
        } else {
          alert('Error importing tasks. Please try again.');
        }
      });

    } catch (error) {
      alert('Error reading file. Please make sure it is a valid JSON file.');
    }
  };

  reader.onerror = function() {
    alert('Error reading file. Please try again.');
  };

  reader.readAsText(file);

  // Reset file input
  event.target.value = '';
}

// ==================== TODO EDIT FUNCTIONS ====================

function startEditTodo(todoId, todoItem) {
  // Find the todo
  var todo = todos.find(function(t) { return t.id === todoId; });
  if (!todo || todo.completed) return;

  // Mark as editing
  todoItem.classList.add('editing');

  // Get the text element and replace with input
  var textEl = todoItem.querySelector('.todo-text');
  var currentText = todo.text;

  // Create edit input
  var editHtml = '<textarea class="todo-edit-input">' + escapeHtml(currentText) + '</textarea>';
  editHtml += '<div class="todo-edit-actions">';
  editHtml += '<button class="todo-edit-btn todo-edit-save">Save</button>';
  editHtml += '<button class="todo-edit-btn todo-edit-cancel">Cancel</button>';
  editHtml += '</div>';

  textEl.innerHTML = editHtml;
  textEl.classList.add('editing');

  // Focus the input and select all text
  var input = todoItem.querySelector('.todo-edit-input');
  input.focus();
  input.select();

  // Auto-resize textarea
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 100) + 'px';

  input.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
  });
}

function saveEditTodo(todoId, todoItem) {
  var input = todoItem.querySelector('.todo-edit-input');
  var newText = input.value.trim();

  if (!newText) {
    input.style.borderColor = 'rgba(255, 107, 107, 0.8)';
    return;
  }

  // Validate input length
  if (newText.length > 500) {
    alert('Task is too long. Please keep it under 500 characters.');
    return;
  }

  // Find the original todo
  var todo = todos.find(function(t) { return t.id === todoId; });
  if (!todo) return;

  // If text hasn't changed, just cancel
  if (newText === todo.text) {
    cancelEditTodo(todoId);
    return;
  }

  // Send update to background
  chrome.runtime.sendMessage({
    action: 'editTodo',
    id: todoId,
    text: newText
  }, function(response) {
    if (chrome.runtime.lastError) {
      console.error('Error editing todo:', chrome.runtime.lastError);
      alert('Error saving task. Please try again.');
      cancelEditTodo(todoId);
      return;
    }

    if (response && response.success) {
      // Update local state
      todo.text = newText;
      todo.editedAt = response.todo.editedAt;
      renderTodos();
    } else {
      alert('Error saving task. Please try again.');
      cancelEditTodo(todoId);
    }
  });
}

function cancelEditTodo(todoId) {
  // Just re-render to restore original state
  renderTodos();
}

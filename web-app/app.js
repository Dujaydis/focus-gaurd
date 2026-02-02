// Focus Guard Web App - Todo List
// Real-time sync with Firebase

let todos = [];
let currentView = 'active';
let userHash = null;
let db = null;
let isOnline = navigator.onLine;

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('appScreen');
const loadingOverlay = document.getElementById('loadingOverlay');
const passphraseInput = document.getElementById('passphraseInput');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const todoInput = document.getElementById('todoInput');
const addBtn = document.getElementById('addBtn');
const todoList = document.getElementById('todoList');
const emptyState = document.getElementById('emptyState');
const syncDot = document.getElementById('syncDot');
const syncText = document.getElementById('syncText');
const viewBtns = document.querySelectorAll('.view-btn');

// Stats elements
const totalTodosEl = document.getElementById('totalTodos');
const activeTodosEl = document.getElementById('activeTodos');
const completedTodosEl = document.getElementById('completedTodos');

// Generate hash from passphrase
async function generateUserHash(passphrase) {
  const encoder = new TextEncoder();
  const data = encoder.encode(passphrase + '_focus_guard_salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

// Initialize Firebase
function initFirebase() {
  try {
    if (firebase.apps.length === 0) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    db = firebase.database();
    return true;
  } catch (error) {
    console.error('Firebase init error:', error);
    return false;
  }
}

// Get todos reference
function getTodosRef() {
  if (!db || !userHash) return null;
  return db.ref(`users/${userHash}/todos`);
}

// Login
async function login() {
  const passphrase = passphraseInput.value.trim();

  if (!passphrase) {
    loginError.textContent = 'Please enter a passphrase';
    return;
  }

  if (passphrase.length < 4) {
    loginError.textContent = 'Passphrase must be at least 4 characters';
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Connecting...';
  loginError.textContent = '';

  try {
    // Initialize Firebase
    if (!initFirebase()) {
      throw new Error('Failed to initialize Firebase');
    }

    // Generate user hash
    userHash = await generateUserHash(passphrase);

    // Save to localStorage for auto-login
    localStorage.setItem('focusGuardHash', userHash);

    // Subscribe to todos
    subscribeToTodos();

    // Show app screen
    loginScreen.classList.add('hidden');
    appScreen.classList.add('active');

  } catch (error) {
    console.error('Login error:', error);
    loginError.textContent = 'Connection failed. Check your config.';
    loginBtn.disabled = false;
    loginBtn.textContent = 'Connect';
  }
}

// Logout
function logout() {
  // Unsubscribe from Firebase
  const todosRef = getTodosRef();
  if (todosRef) {
    todosRef.off();
  }

  // Clear data
  userHash = null;
  todos = [];
  localStorage.removeItem('focusGuardHash');

  // Show login screen
  appScreen.classList.remove('active');
  loginScreen.classList.remove('hidden');
  passphraseInput.value = '';
  loginBtn.disabled = false;
  loginBtn.textContent = 'Connect';
}

// Subscribe to real-time updates
function subscribeToTodos() {
  const todosRef = getTodosRef();
  if (!todosRef) return;

  setSyncStatus('syncing');

  todosRef.on('value', (snapshot) => {
    const data = snapshot.val();

    if (!data) {
      todos = [];
    } else {
      todos = Object.values(data);
      todos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    renderTodos();
    updateStats();
    setSyncStatus('synced');
  }, (error) => {
    console.error('Firebase read error:', error);
    setSyncStatus('offline');
  });
}

// Set sync status indicator
function setSyncStatus(status) {
  syncDot.classList.remove('syncing', 'offline');

  switch (status) {
    case 'syncing':
      syncDot.classList.add('syncing');
      syncText.textContent = 'Syncing...';
      break;
    case 'synced':
      syncText.textContent = 'Synced';
      break;
    case 'offline':
      syncDot.classList.add('offline');
      syncText.textContent = 'Offline';
      break;
  }
}

// Add todo
async function addTodo() {
  const text = todoInput.value.trim();

  if (!text) {
    todoInput.style.borderColor = 'rgba(255, 107, 107, 0.8)';
    setTimeout(() => {
      todoInput.style.borderColor = 'rgba(255, 255, 255, 0.3)';
    }, 1500);
    return;
  }

  if (text.length > 500) {
    alert('Task is too long. Please keep it under 500 characters.');
    return;
  }

  const todo = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    text: text,
    completed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    setSyncStatus('syncing');
    const todosRef = getTodosRef();
    await todosRef.child(todo.id).set(todo);
    todoInput.value = '';
    todoInput.style.height = 'auto';
  } catch (error) {
    console.error('Error adding todo:', error);
    alert('Failed to add task. Please try again.');
    setSyncStatus('offline');
  }
}

// Complete todo
async function completeTodo(todoId) {
  try {
    setSyncStatus('syncing');
    const todosRef = getTodosRef();
    await todosRef.child(todoId).update({
      completed: true,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error completing todo:', error);
    setSyncStatus('offline');
  }
}

// Uncomplete todo
async function uncompleteTodo(todoId) {
  try {
    setSyncStatus('syncing');
    const todosRef = getTodosRef();
    await todosRef.child(todoId).update({
      completed: false,
      completedAt: null,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error uncompleting todo:', error);
    setSyncStatus('offline');
  }
}

// Delete todo
async function deleteTodo(todoId) {
  if (!confirm('Delete this task?')) return;

  try {
    setSyncStatus('syncing');
    const todosRef = getTodosRef();
    await todosRef.child(todoId).remove();
  } catch (error) {
    console.error('Error deleting todo:', error);
    setSyncStatus('offline');
  }
}

// Edit todo
async function saveTodoEdit(todoId, newText) {
  if (!newText.trim()) return;

  try {
    setSyncStatus('syncing');
    const todosRef = getTodosRef();
    await todosRef.child(todoId).update({
      text: newText.trim(),
      editedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error editing todo:', error);
    setSyncStatus('offline');
  }
}

// Render todos
function renderTodos() {
  let filteredTodos = todos;

  switch (currentView) {
    case 'active':
      filteredTodos = todos.filter(t => !t.completed);
      break;
    case 'completed':
      filteredTodos = todos.filter(t => t.completed);
      break;
    // 'all' shows everything
  }

  if (filteredTodos.length === 0) {
    todoList.innerHTML = '';
    emptyState.style.display = 'block';

    const emptyText = emptyState.querySelector('.empty-state-text');
    const emptySubtext = emptyState.querySelector('.empty-state-subtext');

    if (currentView === 'completed') {
      emptyText.textContent = 'No completed tasks';
      emptySubtext.textContent = 'Complete tasks to see them here!';
    } else if (currentView === 'active') {
      emptyText.textContent = 'No active tasks';
      emptySubtext.textContent = 'Add a task to get started!';
    } else {
      emptyText.textContent = 'No tasks yet';
      emptySubtext.textContent = 'Add a task to get started!';
    }
    return;
  }

  emptyState.style.display = 'none';

  const html = filteredTodos.map(todo => {
    const completedClass = todo.completed ? 'completed' : '';
    const checkedClass = todo.completed ? 'checked' : '';
    const timeAgo = getTimeAgo(new Date(todo.createdAt));

    return `
      <li class="todo-item ${completedClass}" data-id="${todo.id}">
        <div class="todo-checkbox ${checkedClass}" onclick="toggleTodo('${todo.id}', ${todo.completed})"></div>
        <div class="todo-content">
          <div class="todo-text">${escapeHtml(todo.text)}</div>
          <div class="todo-meta">${timeAgo}${todo.editedAt ? ' (edited)' : ''}</div>
        </div>
        <div class="todo-actions">
          ${!todo.completed ? `<button class="todo-action-btn edit" onclick="startEdit('${todo.id}')" title="Edit">✏️</button>` : ''}
          <button class="todo-action-btn delete" onclick="deleteTodo('${todo.id}')" title="Delete">🗑️</button>
        </div>
      </li>
    `;
  }).join('');

  todoList.innerHTML = html;
}

// Toggle todo completion
function toggleTodo(todoId, isCompleted) {
  if (isCompleted) {
    uncompleteTodo(todoId);
  } else {
    completeTodo(todoId);
  }
}

// Start editing a todo
function startEdit(todoId) {
  const todo = todos.find(t => t.id === todoId);
  if (!todo) return;

  const todoItem = document.querySelector(`[data-id="${todoId}"]`);
  if (!todoItem) return;

  todoItem.classList.add('editing');

  const contentEl = todoItem.querySelector('.todo-content');
  const originalText = todo.text;

  contentEl.innerHTML = `
    <textarea class="todo-edit-input" id="edit-${todoId}">${escapeHtml(originalText)}</textarea>
    <div class="todo-edit-actions">
      <button class="edit-btn save" onclick="saveEdit('${todoId}')">Save</button>
      <button class="edit-btn cancel" onclick="cancelEdit('${todoId}')">Cancel</button>
    </div>
  `;

  const input = document.getElementById(`edit-${todoId}`);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  // Auto-resize
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 100) + 'px';

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });

  // Handle Enter key
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit(todoId);
    } else if (e.key === 'Escape') {
      cancelEdit(todoId);
    }
  });
}

// Save edit
function saveEdit(todoId) {
  const input = document.getElementById(`edit-${todoId}`);
  if (!input) return;

  const newText = input.value.trim();
  if (!newText) {
    input.style.borderColor = 'rgba(255, 107, 107, 0.8)';
    return;
  }

  saveTodoEdit(todoId, newText);
}

// Cancel edit
function cancelEdit(todoId) {
  renderTodos();
}

// Update stats
function updateStats() {
  const total = todos.length;
  const completed = todos.filter(t => t.completed).length;
  const active = total - completed;

  totalTodosEl.textContent = total;
  activeTodosEl.textContent = active;
  completedTodosEl.textContent = completed;
}

// Helper: Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Helper: Time ago
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

// Event Listeners
loginBtn.addEventListener('click', login);
passphraseInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') login();
});

logoutBtn.addEventListener('click', logout);

addBtn.addEventListener('click', addTodo);
todoInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    addTodo();
  }
});

// Auto-resize textarea
todoInput.addEventListener('input', () => {
  todoInput.style.height = 'auto';
  todoInput.style.height = Math.min(todoInput.scrollHeight, 120) + 'px';
});

// View toggle
viewBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    viewBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    renderTodos();
  });
});

// Online/Offline detection
window.addEventListener('online', () => {
  isOnline = true;
  setSyncStatus('syncing');
  // Re-subscribe to get latest data
  if (userHash) {
    subscribeToTodos();
  }
});

window.addEventListener('offline', () => {
  isOnline = false;
  setSyncStatus('offline');
});

// Check for saved login
async function checkSavedLogin() {
  const savedHash = localStorage.getItem('focusGuardHash');

  if (savedHash) {
    loadingOverlay.classList.remove('hidden');

    try {
      if (!initFirebase()) {
        throw new Error('Failed to initialize Firebase');
      }

      userHash = savedHash;
      subscribeToTodos();

      loginScreen.classList.add('hidden');
      appScreen.classList.add('active');
    } catch (error) {
      console.error('Auto-login failed:', error);
      localStorage.removeItem('focusGuardHash');
    }

    loadingOverlay.classList.add('hidden');
  }
}

// Initialize
checkSavedLogin();

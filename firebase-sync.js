// Firebase Sync Module for Focus Guard
// Handles real-time synchronization of todos between extension and web app

let firebaseApp = null;
let firebaseDb = null;
let isSyncEnabled = false;
let userHash = null;
let unsubscribe = null;

// Generate a hash from the passphrase (used as user identifier)
async function generateUserHash(passphrase) {
  const encoder = new TextEncoder();
  const data = encoder.encode(passphrase + '_focus_guard_salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

// Initialize Firebase
async function initializeFirebase(config, passphrase) {
  try {
    // Check if Firebase is already loaded
    if (typeof firebase === 'undefined') {
      console.error('Firebase SDK not loaded');
      return false;
    }

    // Initialize Firebase app if not already done
    if (!firebaseApp) {
      if (firebase.apps.length === 0) {
        firebaseApp = firebase.initializeApp(config);
      } else {
        firebaseApp = firebase.apps[0];
      }
    }

    firebaseDb = firebase.database();
    userHash = await generateUserHash(passphrase);
    isSyncEnabled = true;

    console.log('Firebase initialized successfully');
    return true;
  } catch (error) {
    console.error('Firebase initialization error:', error);
    return false;
  }
}

// Get the user's todos reference path
function getTodosRef() {
  if (!firebaseDb || !userHash) return null;
  return firebaseDb.ref(`users/${userHash}/todos`);
}

// Get the metadata reference (for sync timestamps)
function getMetaRef() {
  if (!firebaseDb || !userHash) return null;
  return firebaseDb.ref(`users/${userHash}/meta`);
}

// Push todos to Firebase
async function pushTodosToFirebase(todos) {
  if (!isSyncEnabled) return false;

  try {
    const todosRef = getTodosRef();
    const metaRef = getMetaRef();
    if (!todosRef || !metaRef) return false;

    // Create a map of todos by ID for easier updates
    const todosMap = {};
    todos.forEach(todo => {
      todosMap[todo.id] = {
        ...todo,
        updatedAt: todo.updatedAt || new Date().toISOString()
      };
    });

    await todosRef.set(todosMap);
    await metaRef.update({
      lastSync: new Date().toISOString(),
      source: 'extension'
    });

    console.log('Todos pushed to Firebase');
    return true;
  } catch (error) {
    console.error('Error pushing todos to Firebase:', error);
    return false;
  }
}

// Pull todos from Firebase
async function pullTodosFromFirebase() {
  if (!isSyncEnabled) return null;

  try {
    const todosRef = getTodosRef();
    if (!todosRef) return null;

    const snapshot = await todosRef.once('value');
    const todosMap = snapshot.val();

    if (!todosMap) return [];

    // Convert map back to array
    const todos = Object.values(todosMap);

    // Sort by createdAt descending (newest first)
    todos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    console.log('Todos pulled from Firebase:', todos.length);
    return todos;
  } catch (error) {
    console.error('Error pulling todos from Firebase:', error);
    return null;
  }
}

// Subscribe to real-time updates
function subscribeToTodoChanges(callback) {
  if (!isSyncEnabled) return false;

  try {
    const todosRef = getTodosRef();
    if (!todosRef) return false;

    // Unsubscribe from previous listener if exists
    if (unsubscribe) {
      todosRef.off('value', unsubscribe);
    }

    unsubscribe = todosRef.on('value', (snapshot) => {
      const todosMap = snapshot.val();
      if (!todosMap) {
        callback([]);
        return;
      }

      const todos = Object.values(todosMap);
      todos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      callback(todos);
    });

    console.log('Subscribed to todo changes');
    return true;
  } catch (error) {
    console.error('Error subscribing to todo changes:', error);
    return false;
  }
}

// Unsubscribe from real-time updates
function unsubscribeFromTodoChanges() {
  if (unsubscribe) {
    const todosRef = getTodosRef();
    if (todosRef) {
      todosRef.off('value', unsubscribe);
    }
    unsubscribe = null;
  }
}

// Add a single todo to Firebase
async function addTodoToFirebase(todo) {
  if (!isSyncEnabled) return false;

  try {
    const todosRef = getTodosRef();
    if (!todosRef) return false;

    await todosRef.child(todo.id).set({
      ...todo,
      updatedAt: new Date().toISOString()
    });

    return true;
  } catch (error) {
    console.error('Error adding todo to Firebase:', error);
    return false;
  }
}

// Update a single todo in Firebase
async function updateTodoInFirebase(todoId, updates) {
  if (!isSyncEnabled) return false;

  try {
    const todosRef = getTodosRef();
    if (!todosRef) return false;

    await todosRef.child(todoId).update({
      ...updates,
      updatedAt: new Date().toISOString()
    });

    return true;
  } catch (error) {
    console.error('Error updating todo in Firebase:', error);
    return false;
  }
}

// Delete a todo from Firebase
async function deleteTodoFromFirebase(todoId) {
  if (!isSyncEnabled) return false;

  try {
    const todosRef = getTodosRef();
    if (!todosRef) return false;

    await todosRef.child(todoId).remove();

    return true;
  } catch (error) {
    console.error('Error deleting todo from Firebase:', error);
    return false;
  }
}

// Check sync status
function isSyncActive() {
  return isSyncEnabled && firebaseDb !== null && userHash !== null;
}

// Disconnect from Firebase
function disconnectFirebase() {
  unsubscribeFromTodoChanges();
  isSyncEnabled = false;
  userHash = null;
  console.log('Disconnected from Firebase');
}

// Export functions
if (typeof window !== 'undefined') {
  window.FirebaseSync = {
    initialize: initializeFirebase,
    push: pushTodosToFirebase,
    pull: pullTodosFromFirebase,
    subscribe: subscribeToTodoChanges,
    unsubscribe: unsubscribeFromTodoChanges,
    addTodo: addTodoToFirebase,
    updateTodo: updateTodoInFirebase,
    deleteTodo: deleteTodoFromFirebase,
    isActive: isSyncActive,
    disconnect: disconnectFirebase,
    generateHash: generateUserHash
  };
}

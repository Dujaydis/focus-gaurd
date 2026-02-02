# Focus Guard - Setup Guide

This guide will help you set up Firebase sync and deploy the mobile web app.

## Overview

Focus Guard now supports real-time todo sync between:
- Your Chrome extension (desktop)
- A mobile web app (phone/tablet)

Both use Firebase Realtime Database for instant synchronization.

---

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Create a project"** (or "Add project")
3. Enter a project name (e.g., "focus-guard-todos")
4. Disable Google Analytics (optional, not needed)
5. Click **"Create project"**

---

## Step 2: Set Up Realtime Database

1. In your Firebase project, click **"Build"** → **"Realtime Database"**
2. Click **"Create Database"**
3. Choose a location closest to you
4. Start in **"Test mode"** (we'll add security rules later)
5. Click **"Enable"**

---

## Step 3: Get Your Firebase Config

1. In Firebase Console, click the **gear icon** → **"Project settings"**
2. Scroll down to **"Your apps"**
3. Click the **"Web"** icon (`</>`)
4. Register your app with a nickname (e.g., "focus-guard-web")
5. Copy the `firebaseConfig` object - you'll need these values:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

---

## Step 4: Configure the Extension

1. Open `firebase-config.js` in the extension folder
2. Replace the placeholder values with your Firebase config:

```javascript
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",           // ← Replace with your apiKey
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Set your secret passphrase (use the same on all devices!)
const SYNC_PASSPHRASE = "your-secret-passphrase-here";
```

---

## Step 5: Configure the Web App

1. Open `web-app/config.js`
2. Replace with the same Firebase config:

```javascript
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

---

## Step 6: Set Up Firebase Security Rules

1. In Firebase Console, go to **"Realtime Database"** → **"Rules"**
2. Replace the rules with:

```json
{
  "rules": {
    "users": {
      "$userHash": {
        ".read": true,
        ".write": true,
        "todos": {
          "$todoId": {
            ".validate": "newData.hasChildren(['id', 'text', 'completed'])"
          }
        }
      }
    }
  }
}
```

3. Click **"Publish"**

> **Note:** These rules allow anyone with your passphrase hash to read/write. For extra security, you could add authentication, but the passphrase provides basic protection.

---

## Step 7: Deploy Web App to GitHub Pages

### Create a GitHub Repository

1. Go to [GitHub](https://github.com) and create a new repository
2. Name it `focus-guard` (or any name you prefer)
3. Make it **Public** (required for free GitHub Pages)
4. Don't initialize with README (we'll push existing code)

### Push Your Code

Open a terminal in your `focus-guard` folder and run:

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Focus Guard with Firebase sync"

# Add your GitHub repository as remote
git remote add origin https://github.com/YOUR_USERNAME/focus-guard.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **"Settings"** → **"Pages"**
3. Under "Source", select **"Deploy from a branch"**
4. Select **"main"** branch and **"/web-app"** folder (or root if you move files)
5. Click **"Save"**

Your web app will be available at:
```
https://YOUR_USERNAME.github.io/focus-guard/web-app/
```

---

## Step 8: Using the Mobile App

1. Open the web app URL on your phone
2. Enter the **same passphrase** you set in the extension
3. Click **"Connect"**
4. Your todos will sync in real-time!

### Add to Home Screen (PWA)

**iPhone:**
1. Open the web app in Safari
2. Tap the Share button
3. Tap "Add to Home Screen"

**Android:**
1. Open the web app in Chrome
2. Tap the menu (three dots)
3. Tap "Add to Home screen"

---

## Troubleshooting

### "Connection failed" error
- Check that your Firebase config is correct
- Make sure the Realtime Database is enabled
- Verify the databaseURL matches exactly

### Todos not syncing
- Ensure you're using the **same passphrase** on all devices
- Check your internet connection
- Look at the browser console for errors

### Extension not loading
- Make sure you've reloaded the extension after making changes
- Check the Chrome extension error logs

---

## Security Notes

1. **Passphrase**: Your data is identified by a hash of your passphrase. Anyone with the same passphrase can access your todos.

2. **Firebase Rules**: The provided rules are permissive. For production use, consider adding Firebase Authentication.

3. **HTTPS**: GitHub Pages uses HTTPS, which is required for PWA features.

---

## File Structure

```
focus-guard/
├── manifest.json           # Chrome extension manifest
├── background.js           # Extension background service
├── blocked.html/js         # Blocked page UI
├── popup.html/js           # Extension popup
├── options.html/js         # Settings page
├── firebase-config.js      # Firebase config for extension
├── firebase-sync.js        # Firebase sync module
├── web-app/                # Mobile web app
│   ├── index.html          # Main app page
│   ├── app.js              # App logic
│   ├── config.js           # Firebase config for web
│   └── manifest.json       # PWA manifest
├── icons/                  # Extension icons
├── SETUP.md               # This file
└── .gitignore             # Git ignore rules
```

---

## Need Help?

If you run into issues:
1. Check the browser console for error messages
2. Verify your Firebase configuration
3. Make sure the passphrase matches on all devices

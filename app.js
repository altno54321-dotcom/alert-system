import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, query, onSnapshot, 
  doc, updateDoc, deleteDoc, arrayUnion, getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 1. CONFIGURATION
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyC1ZLEw561UzT8OZnDk1-aL5hD9poflcaA",
  authDomain: "alertthing-52168.firebaseapp.com",
  projectId: "alertthing-52168",
  storageBucket: "alertthing-52168.firebasestorage.app",
  messagingSenderId: "142490478165",
  appId: "1:142490478165:web:b621dd1921cb0e85bcd6dc"
};

const BASE_TOPIC = "alert-system4565";
const ALL_USERS = ["Ahmad", "Sister", "Mom"];

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================================
// 2. DOM ELEMENT REFERENCES
// ==========================================
const currentUserNameEl = document.getElementById("currentUserName");
const switchBtn = document.getElementById("switchUserBtn");
const recipientPillsContainer = document.getElementById("recipientPillsContainer");
const chatRecipientName = document.getElementById("chatRecipientName");

// Preferences & Debug
const themeToggleBtn = document.getElementById("themeToggleBtn");
const forceUpdateBtn = document.getElementById("forceUpdateBtn");
const wipeAppCacheBtn = document.getElementById("wipeAppCacheBtn");
const clearLogsBtn = document.getElementById("clearLogsBtn");
const runBugCheckBtn = document.getElementById("runBugCheckBtn");
const bugCheckResults = document.getElementById("bugCheckResults");
const debugList = document.getElementById("debugLogList");

// Summon
const summonTitle = document.getElementById("summonTitle");
const summonSubtitle = document.getElementById("summonSubtitle");
const sendAlertBtn = document.getElementById("sendAlertBtn");
const sendAlertBtnText = document.getElementById("sendAlertBtnText");
const alertInput = document.getElementById("alertInput");
const alertPriority = document.getElementById("alertPriority");
const alertStatus = document.getElementById("alertStatus");
const prioritySegmented = document.getElementById("prioritySegmented");

// Chat
const messagesList = document.getElementById("messagesList");
const chatForm = document.getElementById("chatForm");
const chatTextInput = document.getElementById("chatTextInput");
const chatFileInput = document.getElementById("chatFileInput");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const imagePreview = document.getElementById("imagePreview");
const cancelImageBtn = document.getElementById("cancelImageBtn");

// Modals
const profileModal = document.getElementById("profileModal");
const editModal = document.getElementById("editModal");
const editTextarea = document.getElementById("editTextarea");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const saveEditBtn = document.getElementById("saveEditBtn");

// Long-Press Action Sheet
const messageActionModal = document.getElementById("messageActionModal");
const actionCopyBtn = document.getElementById("actionCopyBtn");
const actionEditBtn = document.getElementById("actionEditBtn");
const actionDeleteBtn = document.getElementById("actionDeleteBtn");
const actionCancelBtn = document.getElementById("actionCancelBtn");

// ==========================================
// 3. APPLICATION STATE
// ==========================================
let storedUser = localStorage.getItem("summon_user") || "Ahmad";
if (storedUser === "Brother") storedUser = "Ahmad";
let currentUser = storedUser;

let storedRecipient = localStorage.getItem("summon_recipient") || (currentUser === "Ahmad" ? "Sister" : "Ahmad");
if (storedRecipient === "Brother") storedRecipient = "Ahmad";
let currentRecipient = storedRecipient;

let attachedImageData = null;
let currentEditId = null;
let cachedAllDocs = [];
const markedSeenCache = new Set();
let activeSelectedMessage = null;

// ==========================================
// 4. THEME CONTROLLER
// ==========================================
function updateThemeUI(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("summon_theme", theme);
  if (themeToggleBtn) {
    themeToggleBtn.textContent = theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode";
  }
}

if (themeToggleBtn) {
  themeToggleBtn.onclick = () => {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    updateThemeUI(nextTheme);
    logSystem(`Theme set to: ${nextTheme}`);
  };
}
updateThemeUI(document.documentElement.getAttribute("data-theme") || "light");

// ==========================================
// 5. LOGGING & HELPERS
// ==========================================
function logSystem(msg, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${timestamp}] [${type.toUpperCase()}] ${msg}`;
  if (debugList) debugList.prepend(entry);
  console.log(`[${type}]`, msg);
}

window.onerror = (message, source, lineno) => logSystem(`${message} at line ${lineno}`, "error");
window.onunhandledrejection = (event) => logSystem(`Promise rejection: ${event.reason}`, "error");

function getMillis(ts) {
  if (!ts) return Date.now();
  if (typeof ts === "number") return ts;
  if (ts.toMillis) return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return new Date(ts).getTime() || Date.now();
}

function normalizeUser(u) {
  return u === "Brother" ? "Ahmad" : u;
}

function getRoomId(userA, userB) {
  return [normalizeUser(userA), normalizeUser(userB)].sort().join("_");
}

function getTargetTopic(recipient, isTest = false) {
  if (isTest) return `${BASE_TOPIC}-diagnostics`;
  return `${BASE_TOPIC}-${normalizeUser(recipient).toLowerCase()}`;
}

// ==========================================
// 6. CACHE & SERVICE WORKER
// ==========================================
async function cleanAppCacheAndReload() {
  logSystem("Purging cache for v1.90...", "warn");
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  }
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (let registration of registrations) {
      await registration.unregister();
    }
  }
  window.location.href = window.location.pathname + '?nocache=' + Date.now();
}

if (forceUpdateBtn) forceUpdateBtn.onclick = cleanAppCacheAndReload;
if (wipeAppCacheBtn) wipeAppCacheBtn.onclick = cleanAppCacheAndReload;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js?v=1.90').then((reg) => {
    reg.update();
    reg.onupdatefound = () => {
      const installingWorker = reg.installing;
      installingWorker.onstatechange = () => {
        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
          logSystem("v1.90 downloaded! Refreshing...", "info");
          setTimeout(() => window.location.reload(), 800);
        }
      };
    };
  }).catch((err) => logSystem(`SW error: ${err.message}`, "error"));
}

// ==========================================
// 7. USER & RECIPIENT SWITCHING
// ==========================================
function updateUIForRecipient() {
  if (summonTitle) summonTitle.textContent = `Summon ${currentRecipient}`;
  if (summonSubtitle) summonSubtitle.textContent = `Sends an instant priority alert directly to ${currentRecipient}'s phone.`;
  if (sendAlertBtnText) sendAlertBtnText.textContent = `Summon ${currentRecipient}`;
  if (chatRecipientName) chatRecipientName.textContent = currentRecipient;
  logSystem(`Target: ${currentRecipient} (Topic: ${getTargetTopic(currentRecipient)})`);
}

function renderRecipientPills() {
  if (!recipientPillsContainer) return;
  recipientPillsContainer.innerHTML = "";
  const possibleRecipients = ALL_USERS.filter(u => u !== currentUser);

  if (!possibleRecipients.includes(currentRecipient)) {
    currentRecipient = possibleRecipients[0];
    localStorage.setItem("summon_recipient", currentRecipient);
  }

  possibleRecipients.forEach(name => {
    const pill = document.createElement("button");
    pill.className = `recipient-pill ${name === currentRecipient ? 'active' : ''}`;
    pill.textContent = name;
    pill.onclick = () => {
      currentRecipient = name;
      localStorage.setItem("summon_recipient", name);
      renderRecipientPills();
      updateUIForRecipient();
      renderChatMessages();
    };
    recipientPillsContainer.appendChild(pill);
  });
}

function setUser(username) {
  currentUser = username;
  localStorage.setItem("summon_user", username);
  if (currentUserNameEl) currentUserNameEl.textContent = username;
  renderRecipientPills();
  updateUIForRecipient();
  renderChatMessages();
}

// ==========================================
// 8. TACTILE 3-WAY SEGMENTED CONTROL
// ==========================================
if (prioritySegmented) {
  prioritySegmented.querySelectorAll(".segment-btn").forEach(btn => {
    btn.onclick = () => {
      prioritySegmented.querySelectorAll(".segment-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (alertPriority) alertPriority.value = btn.dataset.val;
    };
  });
}

// ==========================================
// 9. NATIVE BOTTOM NAVIGATION
// ==========================================
document.querySelectorAll(".nav-item").forEach(item => {
  item.onclick = () => {
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    document.querySelectorAll(".view-panel").forEach(p => p.classList.remove("active"));

    item.classList.add("active");
    const target = document.getElementById(item.dataset.tab);
    if (target) target.classList.add("active");
  };
});

// ==========================================
// 10. LONG-PRESS ACTION SHEET
// ==========================================
function openMessageActionSheet(msgData) {
  activeSelectedMessage = msgData;
  const isMe = normalizeUser(msgData.sender) === currentUser;

  if (actionEditBtn) actionEditBtn.style.display = isMe ? "flex" : "none";
  if (actionDeleteBtn) actionDeleteBtn.style.display = isMe ? "flex" : "none";

  if (navigator.vibrate) navigator.vibrate(35);
  messageActionModal.classList.remove("hidden");
}

function closeMessageActionSheet() {
  messageActionModal.classList.add("hidden");
  activeSelectedMessage = null;
}

if (actionCancelBtn) actionCancelBtn.onclick = closeMessageActionSheet;
if (messageActionModal) {
  messageActionModal.onclick = (e) => {
    if (e.target === messageActionModal) closeMessageActionSheet();
  };
}

document.querySelectorAll(".react-strip-btn").forEach(btn => {
  btn.onclick = async () => {
    if (!activeSelectedMessage) return;
    const emoji = btn.dataset.emoji;
    const msgId = activeSelectedMessage.id;
    const currentReactions = activeSelectedMessage.reactions || {};
    const userList = currentReactions[emoji] || [];

    const updatedList = userList.includes(currentUser)
      ? userList.filter(u => u !== currentUser)
      : [...userList, currentUser];

    closeMessageActionSheet();

    await updateDoc(doc(db, "messages", msgId), {
      [`reactions.${emoji}`]: updatedList
    });
  };
});

if (actionCopyBtn) {
  actionCopyBtn.onclick = () => {
    if (activeSelectedMessage && activeSelectedMessage.text) {
      navigator.clipboard.writeText(activeSelectedMessage.text);
      logSystem("Copied text to clipboard");
    }
    closeMessageActionSheet();
  };
}

if (actionEditBtn) {
  actionEditBtn.onclick = () => {
    if (!activeSelectedMessage) return;
    const id = activeSelectedMessage.id;
    const text = activeSelectedMessage.text;
    closeMessageActionSheet();
    openEditModal(id, text);
  };
}

if (actionDeleteBtn) {
  actionDeleteBtn.onclick = async () => {
    if (!activeSelectedMessage) return;
    const id = activeSelectedMessage.id;
    closeMessageActionSheet();
    if (confirm("Delete this message?")) {
      await deleteDoc(doc(db, "messages", id));
      logSystem(`Deleted message ${id}`);
    }
  };
}

function bindLongPressListener(element, msgData) {
  let pressTimer = null;
  let startX = 0;
  let startY = 0;

  element.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    pressTimer = setTimeout(() => {
      openMessageActionSheet(msgData);
    }, 450);
  }, { passive: true });

  element.addEventListener("touchmove", (e) => {
    const diffX = Math.abs(e.touches[0].clientX - startX);
    const diffY = Math.abs(e.touches[0].clientY - startY);
    if (diffX > 8 || diffY > 8) {
      clearTimeout(pressTimer);
    }
  }, { passive: true });

  element.addEventListener("touchend", () => clearTimeout(pressTimer));
  element.addEventListener("touchcancel", () => clearTimeout(pressTimer));

  element.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openMessageActionSheet(msgData);
  });
}

// ==========================================
// 11. CHAT RENDERING
// ==========================================
function renderChatMessages() {
  if (!messagesList) return;
  const activeRoomId = getRoomId(currentUser, currentRecipient);

  const roomDocs = cachedAllDocs.filter(d => {
    const msgRoom = (d.roomId || "Ahmad_Sister").replace("Brother", "Ahmad");
    return msgRoom === activeRoomId;
  });

  roomDocs.sort((a, b) => a.millis - b.millis);
  const displayDocs = roomDocs.slice(-60);

  messagesList.innerHTML = "";

  if (displayDocs.length === 0) {
    messagesList.innerHTML = `<div class="chat-placeholder" style="text-align:center;color:var(--text-muted);margin-top:20px;font-size:0.85rem;">No messages with ${currentRecipient} yet.</div>`;
    return;
  }

  displayDocs.forEach((data) => {
    const id = data.id;
    const isMe = normalizeUser(data.sender) === currentUser;

    if (!isMe && (!data.seenBy || !data.seenBy.includes(currentUser))) {
      if (!markedSeenCache.has(id)) {
        markedSeenCache.add(id);
        updateDoc(doc(db, "messages", id), {
          seenBy: arrayUnion(currentUser)
        }).catch(() => {});
      }
    }

    const wrapper = document.createElement("div");
    wrapper.className = `msg-wrapper ${isMe ? "me" : "them"}`;

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";

    bindLongPressListener(bubble, data);

    if (data.imageUrl) {
      const img = document.createElement("img");
      img.src = data.imageUrl;
      img.className = "msg-img";
      bubble.appendChild(img);
    }

    if (data.text) {
      const txt = document.createElement("p");
      txt.textContent = data.text;
      bubble.appendChild(txt);
    }

    let timeStr = new Date(data.millis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let seenIndicator = "";
    if (isMe) {
      const isSeenByOther = data.seenBy && data.seenBy.some(u => normalizeUser(u) !== currentUser);
      seenIndicator = isSeenByOther ? " • Seen ✓✓" : " • Sent ✓";
    }

    const meta = document.createElement("div");
    meta.className = "msg-meta";
    meta.textContent = `${timeStr}${data.edited ? " (edited)" : ""}${seenIndicator}`;
    bubble.appendChild(meta);
    wrapper.appendChild(bubble);

    if (data.reactions && Object.keys(data.reactions).length > 0) {
      const reactBar = document.createElement("div");
      reactBar.className = "reactions-bar";
      for (const [emoji, users] of Object.entries(data.reactions)) {
        if (users && users.length > 0) {
          const pill = document.createElement("span");
          pill.className = "react-pill";
          pill.textContent = `${emoji} ${users.length}`;
          pill.onclick = async (e) => {
            e.stopPropagation();
            const currentList = data.reactions[emoji] || [];
            const updated = currentList.includes(currentUser)
              ? currentList.filter(u => u !== currentUser)
              : [...currentList, currentUser];
            await updateDoc(doc(db, "messages", id), {
              [`reactions.${emoji}`]: updated
            });
          };
          reactBar.appendChild(pill);
        }
      }
      wrapper.appendChild(reactBar);
    }

    messagesList.appendChild(wrapper);
  });

  messagesList.scrollTop = messagesList.scrollHeight;
}

// ==========================================
// 12. ALERTS & PUSH NOTIFICATIONS
// ==========================================
if (switchBtn) {
  switchBtn.onclick = () => profileModal.classList.remove("hidden");
}

document.querySelectorAll(".profile-choice").forEach(btn => {
  btn.onclick = () => {
    setUser(btn.dataset.user);
    profileModal.classList.add("hidden");
  };
});

document.querySelectorAll(".chip").forEach(chip => {
  chip.onclick = () => {
    if (alertInput) alertInput.value = chip.dataset.msg;
  };
});

async function sendNtfyNotification(text, priority = "high", recipientName = currentRecipient, isTest = false) {
  const priorityMap = { "default": 3, "high": 4, "urgent": 5 };
  const recipientTopic = getTargetTopic(recipientName, isTest);
  const appCleanUrl = window.location.href.split('#')[0];

  const payload = {
    topic: recipientTopic,
    title: isTest ? "🧪 System Diagnostic Alert" : `Message from ${currentUser}!`,
    message: text,
    priority: priorityMap[priority] || 4,
    tags: isTest ? ["test_tube"] : ["loudspeaker", "bell"],
    click: appCleanUrl
  };

  const res = await fetch("https://ntfy.sh", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
  logSystem(`Alert (${priority}) dispatched to ${recipientTopic}`);
  return true;
}

if (sendAlertBtn) {
  sendAlertBtn.onclick = async () => {
    const text = alertInput.value.trim();
    if (!text) {
      alertStatus.textContent = "Please enter or select a message.";
      return;
    }

    sendAlertBtn.disabled = true;
    alertStatus.textContent = `Delivering alert to ${currentRecipient}...`;

    sendNtfyNotification(text, alertPriority.value, currentRecipient).catch(err => logSystem(`ntfy err: ${err.message}`, "error"));

    try {
      await addDoc(collection(db, "messages"), {
        roomId: getRoomId(currentUser, currentRecipient),
        sender: currentUser,
        recipient: currentRecipient,
        text: `⚡ SUMMON: ${text}`,
        timestamp: Date.now(),
        reactions: {},
        seenBy: [currentUser]
      });
      alertStatus.textContent = `✅ Delivered to ${currentRecipient}!`;
      alertInput.value = "";
      setTimeout(() => { if (alertStatus) alertStatus.textContent = ""; }, 4000);
    } catch (err) {
      logSystem(`Firestore alert sync error: ${err.message}`, "error");
      alertStatus.textContent = "❌ Network error. Check debug logs.";
    }
    sendAlertBtn.disabled = false;
  };
}

if (chatFileInput) {
  chatFileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 600;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = (img.width > MAX_WIDTH) ? MAX_WIDTH : img.width;
        canvas.height = (img.width > MAX_WIDTH) ? (img.height * scaleSize) : img.height;
        
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        attachedImageData = canvas.toDataURL("image/jpeg", 0.6);
        imagePreview.src = attachedImageData;
        imagePreviewContainer.classList.remove("hidden");
      };
    };
    reader.readAsDataURL(file);
  };
}

if (cancelImageBtn) {
  cancelImageBtn.onclick = () => {
    attachedImageData = null;
    imagePreview.src = "";
    chatFileInput.value = "";
    imagePreviewContainer.classList.add("hidden");
  };
}

if (chatForm) {
  chatForm.onsubmit = async (e) => {
    e.preventDefault();
    const text = chatTextInput.value.trim();
    const image = attachedImageData;

    if (!text && !image) return;

    chatTextInput.value = "";
    if (cancelImageBtn) cancelImageBtn.click();

    sendNtfyNotification(`${currentUser}: ${text || "Sent a photo 📷"}`, "default", currentRecipient).catch(() => {});

    try {
      await addDoc(collection(db, "messages"), {
        roomId: getRoomId(currentUser, currentRecipient),
        sender: currentUser,
        recipient: currentRecipient,
        text: text || "",
        imageUrl: image || null,
        timestamp: Date.now(),
        reactions: {},
        seenBy: [currentUser],
        edited: false
      });
      logSystem(`Message sent to ${currentRecipient}`);
    } catch (err) {
      logSystem(`Chat write error: ${err.message}`, "error");
    }
  };
}

function openEditModal(id, currentText) {
  currentEditId = id;
  editTextarea.value = currentText;
  editModal.classList.remove("hidden");
}

if (cancelEditBtn) {
  cancelEditBtn.onclick = () => {
    editModal.classList.add("hidden");
    currentEditId = null;
  };
}

if (saveEditBtn) {
  saveEditBtn.onclick = async () => {
    if (!currentEditId) return;
    const newText = editTextarea.value.trim();
    try {
      await updateDoc(doc(db, "messages", currentEditId), {
        text: newText,
        edited: true
      });
      logSystem(`Updated message ${currentEditId}`);
    } catch (err) {
      logSystem(`Failed to edit: ${err.message}`, "error");
    }
    editModal.classList.add("hidden");
  };
}

if (clearLogsBtn) {
  clearLogsBtn.onclick = () => {
    debugList.innerHTML = "";
  };
}

// ==========================================
// 13. FIRESTORE REAL-TIME SYNC
// ==========================================
const messagesQuery = query(collection(db, "messages"));
onSnapshot(messagesQuery, (snapshot) => {
  const loaded = [];
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (data._testDoc === true) return;
    loaded.push({ id: docSnap.id, ...data, millis: getMillis(data.timestamp) });
  });
  cachedAllDocs = loaded;
  renderChatMessages();
}, (err) => {
  logSystem(`Firestore Sync Error: ${err.message}`, "error");
});

// ==========================================
// 14. COMPREHENSIVE BUG CHECK SUITE
// ==========================================
async function runComprehensiveBugCheck() {
  runBugCheckBtn.disabled = true;
  runBugCheckBtn.textContent = "⏳ Running Diagnostics...";
  bugCheckResults.innerHTML = "";
  bugCheckResults.classList.remove("hidden");

  let passed = 0;
  let failed = 0;

  function record(title, isOk, detail = "") {
    const item = document.createElement("div");
    item.className = `test-item ${isOk ? 'pass' : 'fail'}`;
    item.innerHTML = `
      <span>${isOk ? '✅' : '❌'} ${title}</span>
      <span style="font-size: 0.72rem; opacity: 0.85;">${detail}</span>
    `;
    bugCheckResults.appendChild(item);
    if (isOk) passed++; else failed++;
  }

  try {
    const res = await fetch("https://ntfy.sh/v1/health", { cache: "no-store" });
    const data = await res.json();
    record("Gateway Health (ntfy.sh)", res.ok && data.healthy === true, "Connected");
  } catch (e) {
    record("Gateway Health (ntfy.sh)", false, e.message);
  }

  try {
    const aTopic = getTargetTopic("Ahmad");
    const sTopic = getTargetTopic("Sister");
    const mTopic = getTargetTopic("Mom");
    record("3-Way User Routing", aTopic.endsWith("-ahmad") && sTopic.endsWith("-sister") && mTopic.endsWith("-mom"), "Ahmad/Sister/Mom OK");
  } catch (e) {
    record("3-Way User Routing", false, e.message);
  }

  try {
    const ok = await sendNtfyNotification("Diagnostics probe", "high", "Mom", true);
    record("Alert Pipeline & PWA Hook", ok, "Isolated Diagnostic OK");
  } catch (e) {
    record("Alert Pipeline & PWA Hook", false, e.message);
  }

  let probeDocId = null;
  try {
    const tDoc = await addDoc(collection(db, "messages"), {
      roomId: "System_Diagnostic",
      sender: "TestProbe",
      text: "Initial Probe Message",
      timestamp: Date.now(),
      reactions: {},
      seenBy: ["TestProbe"],
      _testDoc: true
    });
    probeDocId = tDoc.id;
    await updateDoc(doc(db, "messages", probeDocId), { text: "Edited", edited: true });
    await deleteDoc(doc(db, "messages", probeDocId));
    probeDocId = null;
    record("Database Lifecycle", true, "CRUD OK");
  } catch (e) {
    record("Database Lifecycle", false, e.message);
    if (probeDocId) deleteDoc(doc(db, "messages", probeDocId)).catch(() => {});
  }

  const summary = document.createElement("div");
  const allPassed = failed === 0;
  summary.className = `test-summary ${allPassed ? 'all-pass' : 'has-fail'}`;
  summary.textContent = allPassed 
    ? `🎉 All tests passed! System healthy.` 
    : `⚠️ Diagnostic report: ${passed} passed, ${failed} failed.`;
  bugCheckResults.prepend(summary);

  runBugCheckBtn.disabled = false;
  runBugCheckBtn.textContent = "🧪 Run Full Test Mode Again";
}

if (runBugCheckBtn) {
  runBugCheckBtn.onclick = runComprehensiveBugCheck;
}

// Initialize
setUser(currentUser);

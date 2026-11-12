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
const ALL_USERS = ["Brother", "Sister", "Mom"];

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================================
// 2. DOM ELEMENT REFERENCES (Declared First)
// ==========================================
const currentUserNameEl = document.getElementById("currentUserName");
const switchBtn = document.getElementById("switchUserBtn");
const forceUpdateBtn = document.getElementById("forceUpdateBtn");
const recipientPillsContainer = document.getElementById("recipientPillsContainer");

// Summon tab elements
const summonTitle = document.getElementById("summonTitle");
const summonSubtitle = document.getElementById("summonSubtitle");
const sendAlertBtn = document.getElementById("sendAlertBtn");
const sendAlertBtnText = document.getElementById("sendAlertBtnText");
const alertInput = document.getElementById("alertInput");
const alertPriority = document.getElementById("alertPriority");
const alertStatus = document.getElementById("alertStatus");

// Chat tab elements
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

// Diagnostics elements
const debugList = document.getElementById("debugLogList");
const clearLogsBtn = document.getElementById("clearLogsBtn");
const runBugCheckBtn = document.getElementById("runBugCheckBtn");
const bugCheckResults = document.getElementById("bugCheckResults");
const wipeAppCacheBtn = document.getElementById("wipeAppCacheBtn");

// ==========================================
// 3. APPLICATION STATE
// ==========================================
let currentUser = localStorage.getItem("summon_user") || "Brother";
let currentRecipient = localStorage.getItem("summon_recipient") || (currentUser === "Brother" ? "Sister" : "Brother");
let attachedImageData = null;
let currentEditId = null;
let cachedAllDocs = [];
const markedSeenCache = new Set();

// ==========================================
// 4. LOGGING & HELPERS
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

function getRoomId(userA, userB) {
  return [userA, userB].sort().join("_");
}

function getTargetTopic(recipient, isTest = false) {
  if (isTest) return `${BASE_TOPIC}-diagnostics`;
  return `${BASE_TOPIC}-${recipient.toLowerCase()}`;
}

// ==========================================
// 5. CACHE BUSTER & AUTO-UPDATER
// ==========================================
async function cleanAppCacheAndReload() {
  logSystem("Purging cache for v1.60...", "warn");
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
  navigator.serviceWorker.register('./sw.js?v=1.60').then((reg) => {
    reg.update();
    reg.onupdatefound = () => {
      const installingWorker = reg.installing;
      installingWorker.onstatechange = () => {
        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
          logSystem("v1.60 ready! Refreshing...", "info");
          setTimeout(() => window.location.reload(), 800);
        }
      };
    };
  }).catch((err) => logSystem(`SW error: ${err.message}`, "error"));
}

// ==========================================
// 6. UI RENDERING FUNCTIONS
// ==========================================
function updateUIForRecipient() {
  if (summonTitle) summonTitle.textContent = `Summon ${currentRecipient}`;
  if (summonSubtitle) summonSubtitle.textContent = `Broadcasts an instant loud notification to ${currentRecipient}'s phone.`;
  if (sendAlertBtnText) sendAlertBtnText.textContent = `Alert ${currentRecipient}`;
  logSystem(`Active target: ${currentRecipient} (Topic: ${getTargetTopic(currentRecipient)})`);
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

function renderChatMessages() {
  if (!messagesList) return;
  const activeRoomId = getRoomId(currentUser, currentRecipient);

  const roomDocs = cachedAllDocs.filter(d => {
    const msgRoom = d.roomId || "Brother_Sister";
    return msgRoom === activeRoomId;
  });

  roomDocs.sort((a, b) => a.millis - b.millis);
  const displayDocs = roomDocs.slice(-60);

  messagesList.innerHTML = "";

  if (displayDocs.length === 0) {
    messagesList.innerHTML = `<div class="chat-placeholder" style="text-align: center; color: #94a3b8; margin-top: 20px; font-size: 0.9rem;">No messages with ${currentRecipient} yet. Say hello! 👋</div>`;
    return;
  }

  displayDocs.forEach((data) => {
    const id = data.id;
    const isMe = data.sender === currentUser;

    // Auto mark as seen
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

    const actions = document.createElement("div");
    actions.className = "msg-actions";
    actions.innerHTML = `
      <button class="action-icon" data-react="👍">👍</button>
      <button class="action-icon" data-react="❤️">❤️</button>
      <button class="action-icon" data-react="😂">😂</button>
      ${isMe ? `<button class="action-icon edit-btn" title="Edit">✏️</button>` : ""}
      ${isMe ? `<button class="action-icon del-btn" title="Delete">🗑️</button>` : ""}
    `;
    bubble.appendChild(actions);

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
      const isSeenByOther = data.seenBy && data.seenBy.some(u => u !== currentUser);
      seenIndicator = isSeenByOther ? " • Seen ✓✓" : " • Sent ✓";
    }

    const meta = document.createElement("div");
    meta.className = "msg-meta";
    meta.textContent = `${timeStr}${data.edited ? " (edited)" : ""}${seenIndicator}`;
    bubble.appendChild(meta);
    wrapper.appendChild(bubble);

    // Reactions
    if (data.reactions && Object.keys(data.reactions).length > 0) {
      const reactBar = document.createElement("div");
      reactBar.className = "reactions-bar";
      for (const [emoji, users] of Object.entries(data.reactions)) {
        if (users && users.length > 0) {
          const pill = document.createElement("span");
          pill.className = "react-pill";
          pill.textContent = `${emoji} ${users.length}`;
          reactBar.appendChild(pill);
        }
      }
      wrapper.appendChild(reactBar);
    }

    // Reaction click
    actions.querySelectorAll("[data-react]").forEach(btn => {
      btn.onclick = async () => {
        const emoji = btn.dataset.react;
        const currentReactions = data.reactions || {};
        const userList = currentReactions[emoji] || [];
        const updatedList = userList.includes(currentUser)
          ? userList.filter(u => u !== currentUser)
          : [...userList, currentUser];

        await updateDoc(doc(db, "messages", id), {
          [`reactions.${emoji}`]: updatedList
        });
      };
    });

    // Delete
    const delBtn = actions.querySelector(".del-btn");
    if (delBtn) {
      delBtn.onclick = async () => {
        if (confirm("Delete this message?")) {
          await deleteDoc(doc(db, "messages", id));
        }
      };
    }

    // Edit
    const editBtn = actions.querySelector(".edit-btn");
    if (editBtn) {
      editBtn.onclick = () => openEditModal(id, data.text);
    }

    messagesList.appendChild(wrapper);
  });

  messagesList.scrollTop = messagesList.scrollHeight;
}

function setUser(username) {
  currentUser = username;
  localStorage.setItem("summon_user", username);
  if (currentUserNameEl) {
    const listenTopic = getTargetTopic(username);
    currentUserNameEl.innerHTML = `${username} <span style="opacity:0.6;font-size:0.75rem;">(${listenTopic})</span>`;
  }
  renderRecipientPills();
  updateUIForRecipient();
  renderChatMessages();
}

// ==========================================
// 7. EVENT LISTENERS WIRING
// ==========================================

// Tab navigation
document.querySelectorAll(".tab").forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".view-panel").forEach(p => p.classList.remove("active"));

    tab.classList.add("active");
    const target = document.getElementById(tab.dataset.tab);
    if (target) target.classList.add("active");
  };
});

// Profile switcher modal
if (switchBtn) {
  switchBtn.onclick = () => profileModal.classList.remove("hidden");
}

document.querySelectorAll(".profile-choice").forEach(btn => {
  btn.onclick = () => {
    setUser(btn.dataset.user);
    profileModal.classList.add("hidden");
  };
});

// Preset Chips
document.querySelectorAll(".chip").forEach(chip => {
  chip.onclick = () => {
    if (alertInput) alertInput.value = chip.dataset.msg;
  };
});

// Summon Alert
async function sendNtfyNotification(text, priority = "high", recipientName = currentRecipient, isTest = false) {
  const priorityMap = { "default": 3, "high": 4, "urgent": 5 };
  const recipientTopic = getTargetTopic(recipientName, isTest);

  const payload = {
    topic: recipientTopic,
    title: isTest ? "🧪 System Diagnostic Alert" : `Message from ${currentUser}!`,
    message: text,
    priority: priorityMap[priority] || 4,
    tags: isTest ? ["test_tube"] : ["loudspeaker", "bell"]
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
      alertStatus.textContent = "Please write a message first.";
      return;
    }

    sendAlertBtn.disabled = true;
    alertStatus.textContent = `Buzzing ${currentRecipient}'s phone...`;

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

// Chat photo picker & compression
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

// Chat form submission
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

// Edit Modal
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
// 8. FIRESTORE REAL-TIME LISTENER
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
// 9. AUTOMATED MULTI-USER BUG CHECK
// ==========================================
async function runComprehensiveBugCheck() {
  runBugCheckBtn.disabled = true;
  runBugCheckBtn.textContent = "⏳ Running Full Diagnostics...";
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
    logSystem(`Test: ${title} -> ${isOk ? 'PASS' : 'FAIL'} (${detail})`, isOk ? 'info' : 'error');
  }

  // 1. Health Check
  try {
    const t0 = performance.now();
    const res = await fetch("https://ntfy.sh/v1/health", { cache: "no-store" });
    const data = await res.json();
    const ms = Math.round(performance.now() - t0);
    record("Gateway Health (ntfy.sh)", res.ok && data.healthy === true, `${ms}ms`);
  } catch (e) {
    record("Gateway Health (ntfy.sh)", false, e.message);
  }

  // 2. 3-Way Topics
  try {
    const bTopic = getTargetTopic("Brother");
    const sTopic = getTargetTopic("Sister");
    const mTopic = getTargetTopic("Mom");
    const valid = bTopic.endsWith("-brother") && sTopic.endsWith("-sister") && mTopic.endsWith("-mom");
    record("3-Way User Routing", valid, "Mom/Sister/Brother mapped");
  } catch (e) {
    record("3-Way User Routing", false, e.message);
  }

  // 3. Room IDs
  try {
    const r1 = getRoomId("Brother", "Mom");
    const r2 = getRoomId("Mom", "Brother");
    record("1-on-1 Room Segregation", r1 === r2 && r1 === "Brother_Mom", "Private Room IDs OK");
  } catch (e) {
    record("1-on-1 Room Segregation", false, e.message);
  }

  // 4. Alert Pipeline Probe
  try {
    const ok = await sendNtfyNotification("Diagnostics probe", "high", "Mom", true);
    record("Alert Delivery Subsystem", ok, "Isolated Diagnostic OK");
  } catch (e) {
    record("Alert Delivery Subsystem", false, e.message);
  }

  // 5. Image Compression
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 120;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#4f46e5";
    ctx.fillRect(0, 0, 120, 120);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    record("Feature: Photo Engine", dataUrl.startsWith("data:image/jpeg;base64,"), "Canvas/Base64 OK");
  } catch (e) {
    record("Feature: Photo Engine", false, e.message);
  }

  // 6. DB Lifecycle (Write, Edit, React, Delete)
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
    record("Feature: Send Message (DB)", true, `DocID: ${probeDocId.slice(0, 5)}...`);

    await updateDoc(doc(db, "messages", probeDocId), {
      text: "Edited Probe Message",
      edited: true
    });
    const editedSnap = await getDoc(doc(db, "messages", probeDocId));
    record("Feature: Edit Message", editedSnap.data().text === "Edited Probe Message", "Content verified");

    await updateDoc(doc(db, "messages", probeDocId), {
      "reactions.❤️": ["TestProbe"]
    });
    const reactSnap = await getDoc(doc(db, "messages", probeDocId));
    record("Feature: Emoji Reactions", reactSnap.data().reactions?.["❤️"]?.includes("TestProbe"), "Reaction active");

    await deleteDoc(doc(db, "messages", probeDocId));
    probeDocId = null;
    record("Feature: Delete Message", true, "Cleanly purged");
  } catch (e) {
    record("Messaging Lifecycle Test", false, e.message);
    if (probeDocId) deleteDoc(doc(db, "messages", probeDocId)).catch(() => {});
  }

  const summary = document.createElement("div");
  const allPassed = failed === 0;
  summary.className = `test-summary ${allPassed ? 'all-pass' : 'has-fail'}`;
  summary.textContent = allPassed 
    ? `🎉 All ${passed} tests passed! Mom, Sister & Brother ready.` 
    : `⚠️ Diagnostic report: ${passed} passed, ${failed} failed.`;
  bugCheckResults.prepend(summary);

  runBugCheckBtn.disabled = false;
  runBugCheckBtn.textContent = "🧪 Run Full Test Mode Again";
}

if (runBugCheckBtn) {
  runBugCheckBtn.onclick = runComprehensiveBugCheck;
}

// ==========================================
// 10. INITIALIZE APP (Runs Safely After Everything Is Wired)
// ==========================================
setUser(currentUser);

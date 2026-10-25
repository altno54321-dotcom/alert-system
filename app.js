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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Helper to convert any timestamp (Firestore object, Date, or Number) to milliseconds
function getMillis(ts) {
  if (!ts) return Date.now();
  if (typeof ts === "number") return ts;
  if (ts.toMillis) return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return new Date(ts).getTime() || Date.now();
}

// ==========================================
// 2. DIAGNOSTICS LOGGING
// ==========================================
const debugList = document.getElementById("debugLogList");

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

// ==========================================
// 3. AUTO-UPDATE & CACHE RECOVERY
// ==========================================
async function cleanAppCacheAndReload() {
  logSystem("Purging cache for v1.40...", "warn");
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

const forceUpdateBtn = document.getElementById("forceUpdateBtn");
if (forceUpdateBtn) forceUpdateBtn.onclick = cleanAppCacheAndReload;

const wipeAppCacheBtn = document.getElementById("wipeAppCacheBtn");
if (wipeAppCacheBtn) wipeAppCacheBtn.onclick = cleanAppCacheAndReload;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js?v=1.40').then((reg) => {
    reg.update();
    reg.onupdatefound = () => {
      const installingWorker = reg.installing;
      installingWorker.onstatechange = () => {
        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
          logSystem("v1.40 ready! Updating...", "info");
          setTimeout(() => window.location.reload(), 800);
        }
      };
    };
  }).catch((err) => logSystem(`SW error: ${err.message}`, "error"));
}

// ==========================================
// 4. INBOX & IDENTITY
// ==========================================
let currentUser = localStorage.getItem("summon_user") || "Brother";
const currentUserNameEl = document.getElementById("currentUserName");
const profileModal = document.getElementById("profileModal");

function getTargetTopic(isTest = false) {
  if (isTest) return `${BASE_TOPIC}-diagnostics`;
  return currentUser === "Brother" 
    ? `${BASE_TOPIC}-sister` 
    : `${BASE_TOPIC}-brother`;
}

function setUser(username) {
  currentUser = username;
  localStorage.setItem("summon_user", username);
  if (currentUserNameEl) {
    const listenTopic = username === "Sister" ? `${BASE_TOPIC}-sister` : `${BASE_TOPIC}-brother`;
    currentUserNameEl.innerHTML = `${username} <span style="opacity:0.6;font-size:0.75rem;">(${listenTopic})</span>`;
  }
  logSystem(`Profile: ${username} | Recipient: ${getTargetTopic()}`);
}
setUser(currentUser);

const switchBtn = document.getElementById("switchUserBtn");
if (switchBtn) switchBtn.onclick = () => profileModal.classList.remove("hidden");

document.querySelectorAll(".profile-choice").forEach(btn => {
  btn.onclick = () => {
    setUser(btn.dataset.user);
    profileModal.classList.add("hidden");
  };
});

// ==========================================
// 5. TABS
// ==========================================
document.querySelectorAll(".tab").forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".view-panel").forEach(p => p.classList.remove("active"));

    tab.classList.add("active");
    const target = document.getElementById(tab.dataset.tab);
    if (target) target.classList.add("active");
  };
});

// ==========================================
// 6. SUMMON & NTFY NOTIFICATIONS
// ==========================================
const alertInput = document.getElementById("alertInput");
const sendAlertBtn = document.getElementById("sendAlertBtn");
const alertStatus = document.getElementById("alertStatus");
const alertPriority = document.getElementById("alertPriority");

document.querySelectorAll(".chip").forEach(chip => {
  chip.onclick = () => {
    if (alertInput) alertInput.value = chip.dataset.msg;
  };
});

async function sendNtfyNotification(text, priority = "high", isTest = false) {
  const priorityMap = { "default": 3, "high": 4, "urgent": 5 };
  const recipientTopic = getTargetTopic(isTest);

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
    alertStatus.textContent = "Buzzing her phone...";

    // 1. Send push
    sendNtfyNotification(text, alertPriority.value).catch(err => logSystem(`ntfy err: ${err.message}`, "error"));

    // 2. Write to Firebase
    try {
      await addDoc(collection(db, "messages"), {
        sender: currentUser,
        text: `⚡ SUMMON: ${text}`,
        timestamp: Date.now(),
        reactions: {},
        seenBy: [currentUser]
      });
      alertStatus.textContent = "✅ Delivered to her room!";
      alertInput.value = "";
      setTimeout(() => { if (alertStatus) alertStatus.textContent = ""; }, 4000);
    } catch (err) {
      logSystem(`Firestore alert sync error: ${err.message}`, "error");
      alertStatus.textContent = "❌ Network error. Check debug logs.";
    }
    sendAlertBtn.disabled = false;
  };
}

// ==========================================
// 7. REAL-TIME CHAT ENGINE (Fixed Chronological Sorting)
// ==========================================
const messagesList = document.getElementById("messagesList");
const chatForm = document.getElementById("chatForm");
const chatTextInput = document.getElementById("chatTextInput");
const chatFileInput = document.getElementById("chatFileInput");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const imagePreview = document.getElementById("imagePreview");
const cancelImageBtn = document.getElementById("cancelImageBtn");

let attachedImageData = null;
const markedSeenCache = new Set();

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

    // 1. Send push in background
    sendNtfyNotification(`${currentUser}: ${text || "Sent a photo 📷"}`, "default").catch(() => {});

    // 2. Commit to database
    try {
      await addDoc(collection(db, "messages"), {
        sender: currentUser,
        text: text || "",
        imageUrl: image || null,
        timestamp: Date.now(),
        reactions: {},
        seenBy: [currentUser],
        edited: false
      });
      logSystem(`Message successfully recorded in database`);
    } catch (err) {
      logSystem(`Chat write error: ${err.message}`, "error");
    }
  };
}

// Fixed Query: Listen to messages and sort client-side by exact milliseconds
const messagesQuery = query(collection(db, "messages"));

onSnapshot(messagesQuery, (snapshot) => {
  if (!messagesList) return;
  
  const rawDocs = [];
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (data._testDoc === true) return; // Hide test probes
    rawDocs.push({ id: docSnap.id, ...data, millis: getMillis(data.timestamp) });
  });

  // Strict chronological sorting: newest at the bottom
  rawDocs.sort((a, b) => a.millis - b.millis);
  const displayDocs = rawDocs.slice(-60); // Keep last 60 active

  messagesList.innerHTML = "";

  if (displayDocs.length === 0) {
    messagesList.innerHTML = `<div class="chat-placeholder" style="text-align: center; color: #94a3b8; margin-top: 20px; font-size: 0.9rem;">No messages yet. Say hello! 👋</div>`;
    return;
  }

  displayDocs.forEach((data) => {
    const id = data.id;
    const isMe = data.sender === currentUser;

    // Mark as seen once
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

    // Delete click
    const delBtn = actions.querySelector(".del-btn");
    if (delBtn) {
      delBtn.onclick = async () => {
        if (confirm("Delete this message?")) {
          await deleteDoc(doc(db, "messages", id));
        }
      };
    }

    // Edit click
    const editBtn = actions.querySelector(".edit-btn");
    if (editBtn) {
      editBtn.onclick = () => openEditModal(id, data.text);
    }

    messagesList.appendChild(wrapper);
  });

  messagesList.scrollTop = messagesList.scrollHeight;
}, (err) => {
  logSystem(`Firestore Sync Error: ${err.message}`, "error");
});

// Edit Modal
const editModal = document.getElementById("editModal");
const editTextarea = document.getElementById("editTextarea");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const saveEditBtn = document.getElementById("saveEditBtn");
let currentEditId = null;

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

const clearLogsBtn = document.getElementById("clearLogsBtn");
if (clearLogsBtn) {
  clearLogsBtn.onclick = () => {
    debugList.innerHTML = "";
  };
}

// ==========================================
// 8. FULL-FEATURE TEST ENGINE (Runs All Features In Isolation)
// ==========================================
const runBugCheckBtn = document.getElementById("runBugCheckBtn");
const bugCheckResults = document.getElementById("bugCheckResults");

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

  // 1. Official ntfy.sh Health Check
  try {
    const t0 = performance.now();
    const res = await fetch("https://ntfy.sh/v1/health", { cache: "no-store" });
    const data = await res.json();
    const ms = Math.round(performance.now() - t0);
    record("Gateway Health (ntfy.sh)", res.ok && data.healthy === true, `${ms}ms`);
  } catch (e) {
    record("Gateway Health (ntfy.sh)", false, e.message);
  }

  // 2. Normal Alert Pipeline Test (Priority 3)
  try {
    const ok = await sendNtfyNotification("Normal alert payload probe", "default", true);
    record("Feature: Normal Alert Delivery", ok, "Priority 3 OK");
  } catch (e) {
    record("Feature: Normal Alert Delivery", false, e.message);
  }

  // 3. Loud Alert Pipeline Test (Priority 4)
  try {
    const ok = await sendNtfyNotification("Loud alert payload probe", "high", true);
    record("Feature: Loud Alert Delivery", ok, "Priority 4 OK");
  } catch (e) {
    record("Feature: Loud Alert Delivery", false, e.message);
  }

  // 4. Max Urgent Alert Pipeline Test (Priority 5)
  try {
    const ok = await sendNtfyNotification("Max urgent alert payload probe", "urgent", true);
    record("Feature: Max Urgent Alert Delivery", ok, "Priority 5 OK");
  } catch (e) {
    record("Feature: Max Urgent Alert Delivery", false, e.message);
  }

  // 5. Image Compression & Pipeline
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

  // 6, 7, 8, 9: Messaging Full Lifecycle (Write -> Edit -> React -> Delete)
  let probeDocId = null;
  try {
    // Write
    const tDoc = await addDoc(collection(db, "messages"), {
      sender: "TestProbe",
      text: "Initial Probe Message",
      timestamp: Date.now(),
      reactions: {},
      seenBy: ["TestProbe"],
      _testDoc: true
    });
    probeDocId = tDoc.id;
    record("Feature: Send Message (DB)", true, `DocID: ${probeDocId.slice(0, 5)}...`);

    // Edit
    await updateDoc(doc(db, "messages", probeDocId), {
      text: "Edited Probe Message",
      edited: true
    });
    const editedSnap = await getDoc(doc(db, "messages", probeDocId));
    const isEditedOk = editedSnap.data().text === "Edited Probe Message" && editedSnap.data().edited === true;
    record("Feature: Edit Message", isEditedOk, "Content verified");

    // Reactions
    await updateDoc(doc(db, "messages", probeDocId), {
      "reactions.❤️": ["TestProbe"]
    });
    const reactSnap = await getDoc(doc(db, "messages", probeDocId));
    const isReactOk = reactSnap.data().reactions?.["❤️"]?.includes("TestProbe");
    record("Feature: Emoji Reactions", isReactOk, "❤️ reaction active");

    // Deletion
    await deleteDoc(doc(db, "messages", probeDocId));
    const deletedSnap = await getDoc(doc(db, "messages", probeDocId));
    record("Feature: Delete Message", !deletedSnap.exists(), "Cleanly purged");
    probeDocId = null;
  } catch (e) {
    record("Messaging Lifecycle Test", false, e.message);
    if (probeDocId) deleteDoc(doc(db, "messages", probeDocId)).catch(() => {});
  }

  // Summary
  const summary = document.createElement("div");
  const allPassed = failed === 0;
  summary.className = `test-summary ${allPassed ? 'all-pass' : 'has-fail'}`;
  summary.textContent = allPassed 
    ? `🎉 All ${passed} features fully verified & functional!` 
    : `⚠️ Diagnostic report: ${passed} passed, ${failed} failed.`;
  bugCheckResults.prepend(summary);

  runBugCheckBtn.disabled = false;
  runBugCheckBtn.textContent = "🧪 Run Full Test Mode Again";
}

if (runBugCheckBtn) {
  runBugCheckBtn.onclick = runComprehensiveBugCheck;
}

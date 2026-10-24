import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, query, orderBy, onSnapshot, 
  serverTimestamp, doc, updateDoc, deleteDoc, arrayUnion 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 1. YOUR FIREBASE & NTFY CONFIGURATION
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyC1ZLEw561UzT8OZnDk1-aL5hD9poflcaA",
  authDomain: "alertthing-52168.firebaseapp.com",
  projectId: "alertthing-52168",
  storageBucket: "alertthing-52168.firebasestorage.app",
  messagingSenderId: "142490478165",
  appId: "1:142490478165:web:b621dd1921cb0e85bcd6dc"
};

// Your ntfy topic
const NTFY_TOPIC = "alert-system4565";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================================
// 2. DIAGNOSTICS & LOGGING SYSTEM
// ==========================================
const debugList = document.getElementById("debugLogList");

function logSystem(msg, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${timestamp}] [${type.toUpperCase()}] ${msg}`;
  if (debugList) {
    debugList.prepend(entry);
  }
  console.log(`[${type}]`, msg);
}

window.onerror = (message, source, lineno, colno) => {
  logSystem(`${message} at line ${lineno}`, "error");
};
window.onunhandledrejection = (event) => {
  logSystem(`Promise rejection: ${event.reason}`, "error");
};

// ==========================================
// 3. ACCOUNT & PROFILE SYSTEM
// ==========================================
let currentUser = localStorage.getItem("summon_user") || "Brother";
const currentUserNameEl = document.getElementById("currentUserName");
const profileModal = document.getElementById("profileModal");

function setUser(username) {
  currentUser = username;
  localStorage.setItem("summon_user", username);
  if (currentUserNameEl) {
    currentUserNameEl.textContent = `${username} (${username === "Sister" ? "Upstairs" : "Downstairs"})`;
  }
  logSystem(`Active profile set to: ${username}`);
}
setUser(currentUser);

const switchBtn = document.getElementById("switchUserBtn");
if (switchBtn) {
  switchBtn.onclick = () => profileModal.classList.remove("hidden");
}

document.querySelectorAll(".profile-choice").forEach(btn => {
  btn.onclick = () => {
    setUser(btn.dataset.user);
    profileModal.classList.add("hidden");
  };
});

// ==========================================
// 4. TAB NAVIGATION
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
// 5. SUMMON / NOTIFICATION LOGIC (ntfy)
// ==========================================
const alertInput = document.getElementById("alertInput");
const sendAlertBtn = document.getElementById("sendAlertBtn");
const alertStatus = document.getElementById("alertStatus");
const alertPriority = document.getElementById("alertPriority");

// Preset chips
document.querySelectorAll(".chip").forEach(chip => {
  chip.onclick = () => {
    if (alertInput) alertInput.value = chip.dataset.msg;
  };
});

async function sendNtfyNotification(text, priority = "high") {
  const priorityHeaderMap = {
    "default": 3,
    "high": 4,
    "urgent": 5
  };

  try {
    const res = await fetch("https://ntfy.sh", {
      method: "POST",
      body: JSON.stringify({
        topic: NTFY_TOPIC,
        title: `Message from ${currentUser}!`,
        message: text,
        priority: priorityHeaderMap[priority] || 4,
        tags: ["loudspeaker", "bell"]
      })
    });

    if (!res.ok) throw new Error(`ntfy returned status ${res.status}`);
    logSystem(`Notification sent via topic: ${NTFY_TOPIC}`);
    return true;
  } catch (err) {
    logSystem(`ntfy send failed: ${err.message}`, "error");
    return false;
  }
}

if (sendAlertBtn) {
  sendAlertBtn.onclick = async () => {
    const text = alertInput.value.trim();
    if (!text) {
      alertStatus.textContent = "Please write a message first.";
      return;
    }

    sendAlertBtn.disabled = true;
    alertStatus.textContent = "Broadcasting alert...";

    const success = await sendNtfyNotification(text, alertPriority.value);

    try {
      await addDoc(collection(db, "messages"), {
        sender: currentUser,
        text: `⚡ SUMMON: ${text}`,
        timestamp: serverTimestamp(),
        reactions: {},
        seenBy: [currentUser]
      });
    } catch (err) {
      logSystem(`Failed to save alert to Firestore: ${err.message}`, "warn");
    }

    if (success) {
      alertStatus.textContent = "✅ Alert buzzed her phone!";
      alertInput.value = "";
      setTimeout(() => { if (alertStatus) alertStatus.textContent = ""; }, 4000);
    } else {
      alertStatus.textContent = "❌ Failed to send. Check debug tab.";
    }
    sendAlertBtn.disabled = false;
  };
}

// ==========================================
// 6. MESSAGING & CHAT SYSTEM
// ==========================================
const messagesList = document.getElementById("messagesList");
const chatForm = document.getElementById("chatForm");
const chatTextInput = document.getElementById("chatTextInput");
const chatFileInput = document.getElementById("chatFileInput");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const imagePreview = document.getElementById("imagePreview");
const cancelImageBtn = document.getElementById("cancelImageBtn");

let attachedImageData = null;

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
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = (img.width > MAX_WIDTH) ? MAX_WIDTH : img.width;
        canvas.height = (img.width > MAX_WIDTH) ? (img.height * scaleSize) : img.height;
        
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        attachedImageData = canvas.toDataURL("image/jpeg", 0.7);
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

    try {
      await addDoc(collection(db, "messages"), {
        sender: currentUser,
        text: text || "",
        imageUrl: image || null,
        timestamp: serverTimestamp(),
        reactions: {},
        seenBy: [currentUser],
        edited: false
      });

      logSystem(`Message posted by ${currentUser}`);
      sendNtfyNotification(`${currentUser}: ${text || "Sent a photo 📷"}`, "default");
    } catch (err) {
      logSystem(`Chat send error: ${err.message}`, "error");
    }
  };
}

// Real-time Firestore Listener
const messagesQuery = query(collection(db, "messages"), orderBy("timestamp", "asc"));

onSnapshot(messagesQuery, (snapshot) => {
  if (!messagesList) return;
  messagesList.innerHTML = "";
  
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const id = docSnap.id;
    const isMe = data.sender === currentUser;

    // Automatically mark message seen
    if (!data.seenBy || !data.seenBy.includes(currentUser)) {
      updateDoc(doc(db, "messages", id), {
        seenBy: arrayUnion(currentUser)
      }).catch(() => {});
    }

    const wrapper = document.createElement("div");
    wrapper.className = `msg-wrapper ${isMe ? "me" : "them"}`;

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";

    // Actions (Reactions, Edit, Delete)
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

    // Metadata
    const meta = document.createElement("div");
    meta.className = "msg-meta";
    const timeStr = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now";
    
    let seenIndicator = "";
    if (isMe) {
      const isSeenByOther = data.seenBy && data.seenBy.some(u => u !== currentUser);
      seenIndicator = isSeenByOther ? " • Seen ✓✓" : " • Sent ✓";
    }

    meta.textContent = `${timeStr}${data.edited ? " (edited)" : ""}${seenIndicator}`;
    bubble.appendChild(meta);
    wrapper.appendChild(bubble);

    // Reactions Pill
    if (data.reactions && Object.keys(data.reactions).length > 0) {
      const reactBar = document.createElement("div");
      reactBar.className = "reactions-bar";
      for (const [emoji, users] of Object.entries(data.reactions)) {
        if (users.length > 0) {
          const pill = document.createElement("span");
          pill.className = "react-pill";
          pill.textContent = `${emoji} ${users.length}`;
          reactBar.appendChild(pill);
        }
      }
      wrapper.appendChild(reactBar);
    }

    // Handle reaction clicks
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

    // Handle Delete
    const delBtn = actions.querySelector(".del-btn");
    if (delBtn) {
      delBtn.onclick = async () => {
        if (confirm("Delete this message?")) {
          await deleteDoc(doc(db, "messages", id));
          logSystem(`Deleted message ${id}`);
        }
      };
    }

    // Handle Edit
    const editBtn = actions.querySelector(".edit-btn");
    if (editBtn) {
      editBtn.onclick = () => openEditModal(id, data.text);
    }

    messagesList.appendChild(wrapper);
  });

  messagesList.scrollTop = messagesList.scrollHeight;
}, (err) => {
  logSystem(`Firestore Listen Error: ${err.message}`, "error");
});

// Edit Modal Handling
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
      logSystem(`Failed to edit message: ${err.message}`, "error");
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

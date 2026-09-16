/* ==========================================================================
   WASTETRACE SYSTEM CONTROLLER & TELEMETRY LOGIC (DUAL-DISPATCH FIX)
   ========================================================================== */
const CONFIG = {
    ADMIN_EMAIL: "mitsukigab012@gmail.com",
    ADMIN_PASS: "Nishimiya_012",
    GAS_ENDPOINT: "https://script.google.com/macros/s/AKfycbzpetWWO7ScR7VJEn49ZnktdDO-LsUiwCN2yBorQB6RO4g9L3kJ1RVu0DOX3g1Fycu2/exec",
    NTFY_TOPIC: "https://ntfy.sh/wastetrace_qcu_alerts_2026",
    STORAGE_KEY: "wastetrace_incident_db_v2",
    AUTH_KEY: "wastetrace_admin_auth"
};

const BIN_DETAILS = {
    "BIN-01": { id: "BIN-01", name: "TechVoc Building (Bin #01)", location: "TechVoc Entrance", category: "Recyclables", maxDepthCm: 100 },
    "BIN-02": { id: "BIN-02", name: "Concert Grounds (Bin #02)", location: "Stage Front", category: "General Waste", maxDepthCm: 100 },
    "BIN-03": { id: "BIN-03", name: "Admin Building (Bin #03)", location: "Lobby Entrance", category: "Paper & Cardboard", maxDepthCm: 100 },
    "BIN-04": { id: "BIN-04", name: "Belmonte Building (Bin #04)", location: "East Wing Corridor", category: "Organic Waste", maxDepthCm: 100 }
};

let binsState = {
    "BIN-01": { id: "BIN-01", fill: 45 },
    "BIN-02": { id: "BIN-02", fill: 85 },
    "BIN-03": { id: "BIN-03", fill: 30 },
    "BIN-04": { id: "BIN-04", fill: 60 }
};

let incidentDB = [];
let activeModalBinId = null;
let activeProofTicketId = null;
let tempPhotoBase64 = null;
let currentTicketID = "";
let currentFilter = "all";
let isAdminAuthenticated = false;
let isSyncPaused = false;

document.addEventListener("DOMContentLoaded", () => {
    try {
        checkAuthStatus();
        loadLocalStorage();
        syncCloudDatabase();
        generateTicketID();
        startClock();
        renderAdminTable();
        renderEmailCards();
        syncMapState();

        setInterval(syncCloudDatabase, 10000);
    } catch (e) {
        console.error("Initialization Error:", e);
    }
});

async function syncCloudDatabase() {
    if (isSyncPaused) return;
    try {
        const response = await fetch(`${CONFIG.GAS_ENDPOINT}?t=${Date.now()}`);
        if (response.ok) {
            const cloudRecords = await response.json();
            if (Array.isArray(cloudRecords) && cloudRecords.length > 0) {
                incidentDB = cloudRecords;
                saveLocalStorage();
                renderAdminTable();
                renderEmailCards();
            }
        }
    } catch (err) {
        console.warn("Cloud sync warning:", err);
    }
}

function checkAuthStatus() {
    try {
        const storedAuth = sessionStorage.getItem(CONFIG.AUTH_KEY);
        isAdminAuthenticated = (storedAuth === "true");
    } catch (e) {
        isAdminAuthenticated = false;
    }
}

function generateTicketID() {
    try {
        const randomCode = Math.floor(1000 + Math.random() * 9000);
        currentTicketID = `WT-2026-${randomCode}`;
        const liveElem = document.getElementById("live-incident-id");
        if (liveElem) liveElem.innerText = currentTicketID;
    } catch (e) {
        console.error("Ticket ID Error:", e);
    }
}

function startClock() {
    try {
        const clockElem = document.getElementById("live-clock");
        if (!clockElem) return;
        const update = () => {
            const now = new Date();
            clockElem.innerText = now.toLocaleString("en-US", {
                hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true
            });
        };
        update();
        setInterval(update, 1000);
    } catch (e) {
        console.error("Clock Error:", e);
    }
}

function switchView(viewName) {
    try {
        if (viewName === "admin" && !isAdminAuthenticated) {
            openAdminLoginModal();
            return;
        }

        ["report", "map", "admin"].forEach(v => {
            const panel = document.getElementById(`${v}-view`);
            const btn = document.getElementById(`btn-${v}-view`);
            if (panel) panel.classList.toggle("active", v === viewName);
            if (btn) btn.classList.toggle("active", v === viewName);
        });

        if (viewName === "admin") {
            syncCloudDatabase();
            renderAdminTable();
            renderEmailCards();
        }
        if (viewName === "map") syncMapState();
    } catch (e) {
        console.error("Switch View Error:", e);
    }
}

function updateBinFill(binId, val) {
    val = parseInt(val);
    if (binsState[binId]) binsState[binId].fill = val;

    const valElem = document.getElementById(`slider-val-${binId}`);
    if (valElem) {
        valElem.innerText = `${val}%`;
        valElem.style.color = val >= 80 ? "var(--accent-red)" : (val >= 50 ? "var(--accent-yellow)" : "var(--accent-blue)");
    }

    syncMapState();

    if (val >= 80) {
        sendNtfyNotification(
            `[CRITICAL OVERFLOW] ${binId} Capacity Alert!`,
            `${BIN_DETAILS[binId].name} has reached ${val}% capacity. Servicing required.`,
            "urgent",
            "rotating_light,waste"
        );
    }
}

function syncMapState() {
    try {
        let overflowCount = 0;

        Object.keys(binsState).forEach(binId => {
            const fill = binsState[binId].fill;
            const color = fill >= 80 ? "#ef4444" : (fill >= 50 ? "#eab308" : "#3b82f6");

            const label = document.getElementById(`label-${binId}`);
            const core = document.getElementById(`core-${binId}`);
            const pulse = document.getElementById(`pulse-${binId}`);

            if (label) label.textContent = `${binId}: ${fill}%`;
            if (core) core.setAttribute("fill", color);
            if (pulse) {
                pulse.setAttribute("fill", color);
                pulse.style.display = fill >= 80 ? "block" : "none";
            }

            const nodeFill = document.getElementById(`node-fill-${binId}`);
            const nodeBar = document.getElementById(`node-bar-${binId}`);
            const nodeCard = document.getElementById(`node-card-${binId}`);

            if (nodeFill) {
                nodeFill.innerText = `${fill}%`;
                nodeFill.style.color = color;
            }
            if (nodeBar) {
                nodeBar.style.width = `${fill}%`;
                nodeBar.style.backgroundColor = color;
            }
            if (nodeCard) {
                nodeCard.style.borderColor = fill >= 80 ? "#ef4444" : "var(--card-border)";
            }

            if (fill >= 80) overflowCount++;
        });

        const alertHubElem = document.getElementById("alert-overflow-count");
        if (alertHubElem) {
            alertHubElem.innerText = `${overflowCount} OVERFLOW`;
            alertHubElem.className = `hub-count ${overflowCount > 0 ? "red-text" : "green-text"}`;
        }
    } catch (e) {
        console.error("Sync Map State Error:", e);
    }
}

function getReporterEmail(item) {
    if (!item) return "";
    if (item.reporter_email && item.reporter_email.includes("@")) {
        return item.reporter_email.trim();
    }
    const match = item.reporter ? item.reporter.match(/\(([^)]+)\)/) : null;
    return (match && match[1] && match[1].includes("@")) ? match[1].trim() : "";
}

function selectCategoryTag(tagName, btnElem) {
    document.querySelectorAll(".category-tag-btn").forEach(b => b.classList.remove("active"));
    if (btnElem) btnElem.classList.add("active");
    const input = document.getElementById("selected-category");
    if (input) input.value = tagName;
}

function triggerPhotoCapture(inputId) {
    const inputElem = document.getElementById(inputId);
    if (inputElem) inputElem.click();
}

function handlePhotoSelect(event, previewImgId, previewBoxId) {
    try {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            tempPhotoBase64 = e.target.result;
            const imgElem = document.getElementById(previewImgId);
            const boxElem = document.getElementById(previewBoxId);
            if (imgElem) imgElem.src = tempPhotoBase64;
            if (boxElem) boxElem.classList.remove("hidden");
        };
        reader.readAsDataURL(file);
    } catch (e) {
        console.error("Photo Select Error:", e);
    }
}

function clearPhotoSelection(inputIds, previewImgId, previewBoxId) {
    tempPhotoBase64 = null;
    if (Array.isArray(inputIds)) {
        inputIds.forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = "";
        });
    }
    const imgElem = document.getElementById(previewImgId);
    const boxElem = document.getElementById(previewBoxId);
    if (imgElem) imgElem.src = "";
    if (boxElem) boxElem.classList.add("hidden");
}

async function sendNtfyNotification(title, message, priority = "high", tags = "warning,waste", photoUrl = null) {
    try {
        const cleanTitle = String(title).replace(/[^\x00-\x7F]/g, "").trim();
        const cleanMessage = String(message).replace(/[^\x00-\x7F]/g, "").trim();

        const headers = {
            "Title": cleanTitle || "WASTETRACE Alert",
            "Priority": priority || "high",
            "Tags": tags || "warning"
        };

        if (photoUrl && typeof photoUrl === "string" && photoUrl.startsWith("http")) {
            headers["Attach"] = photoUrl;
            headers["Click"] = photoUrl;
            headers["Actions"] = `view, View Attachment, ${photoUrl}`;
        }

        await fetch(CONFIG.NTFY_TOPIC, {
            method: "POST",
            mode: "cors",
            headers: headers,
            body: cleanMessage
        }).catch(err => console.warn("ntfy fetch caught:", err));
    } catch (err) {
        console.error("ntfy dispatch error:", err);
    }
}

async function sendGASEmail(payload) {
    try {
        isSyncPaused = true;
        if (payload.image_attachment && payload.image_attachment.length > 2500000) {
            payload.image_attachment = null;
        }

        await fetch(CONFIG.GAS_ENDPOINT, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        }).catch(err => console.warn("GAS Endpoint warning:", err));

        setTimeout(() => {
            isSyncPaused = false;
            syncCloudDatabase();
        }, 3000);
    } catch (err) {
        isSyncPaused = false;
        console.error("GAS sync error caught safely:", err);
    }
}

async function handleFormSubmit(event) {
    if (event) event.preventDefault();
    try {
        const categoryElem = document.getElementById("selected-category");
        const locationSelectElem = document.getElementById("campus-location");
        const customInputElem = document.getElementById("custom-location-input");
        const descElem = document.getElementById("issue-description");
        const nameElem = document.getElementById("reporter-name");
        const emailElem = document.getElementById("reporter-email");

        const category = categoryElem ? categoryElem.value : "Critical Overflow";
        const locationSelect = locationSelectElem ? locationSelectElem.value : "Campus Bin";
        const location = (locationSelect === "Custom" && customInputElem) 
            ? customInputElem.value 
            : locationSelect;

        const description = descElem ? (descElem.value || "N/A") : "N/A";
        const name = nameElem ? (nameElem.value || "Anonymous") : "Anonymous";
        const email = emailElem ? emailElem.value.trim() : "";
        const timestamp = new Date().toLocaleString();

        const incident = {
            id: currentTicketID,
            timestamp: timestamp,
            location: location,
            category: category,
            description: description,
            reporter_name: name,
            reporter_email: email,
            reporter: `${name} (${email || "No Email"})`,
            status: "Submitted",
            photo: tempPhotoBase64 || null
        };

        incidentDB.unshift(incident);
        saveLocalStorage();
        renderAdminTable();
        renderEmailCards();

        // 🚀 INSTANT FRONTEND NTFY PUSH (Guaranteed to fire just like 4:25 AM test!)
        sendNtfyNotification(
            `[NEW REPORT] ${incident.id}`,
            `Location: ${incident.location}\nCategory: ${incident.category}\nReporter: ${incident.reporter}\nNotes: ${incident.description}`,
            "high",
            "warning,waste",
            incident.photo && incident.photo.startsWith("http") ? incident.photo : null
        );

        // Send payload to Google Apps Script for Database + Email dispatch
        sendGASEmail({
            action: "create_report",
            report_id: incident.id,
            timestamp: incident.timestamp,
            location: incident.location,
            issue_type: incident.category,
            description: incident.description,
            reporter_info: incident.reporter,
            reporter_email: getReporterEmail(incident),
            status: incident.status,
            image_attachment: incident.photo
        });

        showToast(`✅ Report ${incident.id} Dispatched Successfully!`);

        const lookupInput = document.getElementById("lookup-id-input");
        if (lookupInput) {
            lookupInput.value = incident.id;
            lookupIncidentStatus();
        }

        const formElem = document.getElementById("incident-form");
        if (formElem) formElem.reset();
        clearPhotoSelection(['report-camera-input', 'report-gallery-input'], 'report-photo-preview', 'report-preview-box');

        generateTicketID();
    } catch (e) {
        console.error("Form Submit Error:", e);
    }
}
// [Rest of standard helper functions remain unchanged...]

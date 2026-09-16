/* ==========================================================================
   WASTETRACE SYSTEM CONTROLLER & TELEMETRY LOGIC
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

function openBinModal(binId) {
    activeModalBinId = binId;
    const b = binsState[binId];
    const meta = BIN_DETAILS[binId];
    if (!b || !meta) return;

    const fill = b.fill;
    const distance = Math.round(meta.maxDepthCm * (1 - fill / 100));

    document.getElementById("modal-bin-id").innerText = binId;
    document.getElementById("modal-bin-name").innerText = meta.name;
    document.getElementById("modal-fill-pct").innerText = `${fill}%`;
    document.getElementById("modal-ultrasonic").innerText = `${distance} cm`;
    document.getElementById("modal-category").innerText = meta.category;

    const modal = document.getElementById("bin-modal");
    if (modal) modal.classList.remove("hidden");
}

function closeBinModal() {
    const modal = document.getElementById("bin-modal");
    if (modal) modal.classList.add("hidden");
}

function dispatchJanitorFromModal() {
    if (activeModalBinId && BIN_DETAILS[activeModalBinId]) {
        dispatchJanitorCrew(BIN_DETAILS[activeModalBinId].name);
        closeBinModal();
    }
}

function dispatchJanitorCrew(targetName) {
    sendNtfyNotification(
        "[DISPATCH] Janitorial Crew Deployed",
        `Cleaning crew dispatched to clear ${targetName}.`,
        "high",
        "truck,broom"
    );
    showToast(`🧹 Janitor Crew Dispatched for ${targetName}!`);
}

function openProofModal(ticketId) {
    if (!isAdminAuthenticated) { openAdminLoginModal(); return; }
    activeProofTicketId = ticketId;
    tempPhotoBase64 = null;
    document.getElementById("proof-ticket-id").innerText = ticketId;
    clearPhotoSelection(['modal-proof-camera-input', 'modal-proof-gallery-input'], 'modal-proof-preview', 'modal-preview-box');

    const modal = document.getElementById("proof-upload-modal");
    if (modal) modal.classList.remove("hidden");
}

function closeProofModal() {
    const modal = document.getElementById("proof-upload-modal");
    if (modal) modal.classList.add("hidden");
}

function saveProofAndResolve() {
    if (activeProofTicketId) {
        const item = incidentDB.find(i => i.id === activeProofTicketId);
        if (item) {
            if (tempPhotoBase64) item.photo = tempPhotoBase64;
            item.status = "Resolved";
            saveLocalStorage();
            renderAdminTable();
            renderEmailCards();
            showToast(`✅ Proof uploaded & ${activeProofTicketId} resolved!`);

            sendGASEmail({
                action: "update_status",
                report_id: item.id,
                timestamp: item.timestamp,
                location: item.location,
                issue_type: item.category,
                description: item.description,
                reporter_info: item.reporter,
                reporter_email: getReporterEmail(item),
                status: "Resolved",
                photo_url: item.photo && item.photo.startsWith("http") ? item.photo : "",
                image_attachment: tempPhotoBase64 || ""
            });
        }
    }
    closeProofModal();
}

function openAdminLoginModal() {
    document.getElementById("login-error-msg").classList.add("hidden");
    document.getElementById("admin-login-modal").classList.remove("hidden");
}

function closeAdminLoginModal() {
    document.getElementById("admin-login-modal").classList.add("hidden");
}

function handleAdminLogin(event) {
    if (event) event.preventDefault();
    const emailInput = document.getElementById("admin-email-input");
    const passInput = document.getElementById("admin-password-input");

    if (emailInput.value.trim() === CONFIG.ADMIN_EMAIL && passInput.value.trim() === CONFIG.ADMIN_PASS) {
        isAdminAuthenticated = true;
        sessionStorage.setItem(CONFIG.AUTH_KEY, "true");
        closeAdminLoginModal();
        showToast("🔓 Welcome, System Admin!");
        switchView("admin");
    } else {
        document.getElementById("login-error-msg").classList.remove("hidden");
    }
}

function handleAdminLogout() {
    isAdminAuthenticated = false;
    sessionStorage.removeItem(CONFIG.AUTH_KEY);
    showToast("🚪 Admin Logged Out");
    switchView("report");
}

function triggerTestPush() {
    showToast("⏳ Dispatched Test Notification...");
    sendNtfyNotification("[TEST] WASTETRACE Telemetry System Check", "Manual Test Alert triggered from Admin Console.", "high", "white_check_mark,bell");
}

function resetSystemTelemetry() {
    updateBinFill("BIN-01", 45);
    updateBinFill("BIN-02", 30);
    updateBinFill("BIN-03", 20);
    updateBinFill("BIN-04", 15);
    showToast("🔄 Telemetry reset to baseline.");
}

function lookupIncidentStatus() {
    const query = document.getElementById("lookup-id-input").value.trim().toUpperCase();
    const item = incidentDB.find(i => i.id.toUpperCase() === query);
    const box = document.getElementById("tracker-result");

    if (!item) {
        showToast("❌ Ticket ID not found.");
        if (box) box.classList.add("hidden");
        return;
    }

    document.getElementById("track-id").innerText = item.id;
    document.getElementById("track-location").innerText = item.location;
    document.getElementById("track-category").innerText = item.category;
    document.getElementById("track-reporter").innerText = item.reporter;
    document.getElementById("track-timestamp").innerText = item.timestamp;
    document.getElementById("track-notes").innerText = item.description;

    const statusPill = document.getElementById("track-status-pill");
    if (statusPill) {
        statusPill.innerText = item.status.toUpperCase();
        statusPill.className = `pill-badge ${item.status === "Resolved" ? "pill-low" : "pill-mod"}`;
    }

    const photoBox = document.getElementById("track-photo-box");
    const photoImg = document.getElementById("track-photo-img");
    if (item.photo && photoBox && photoImg) {
        photoImg.src = item.photo;
        photoBox.classList.remove("hidden");
    } else if (photoBox) {
        photoBox.classList.add("hidden");
    }

    const s1 = document.getElementById("step-1");
    const s2 = document.getElementById("step-2");
    const s3 = document.getElementById("step-3");
    const s4 = document.getElementById("step-4");
    [s1, s2, s3, s4].forEach(s => s.classList.remove("done"));

    if (item.status === "Submitted") { s1.classList.add("done"); }
    else if (item.status === "Under Review") { s1.classList.add("done"); s2.classList.add("done"); }
    else if (item.status === "Maintenance Dispatched") { s1.classList.add("done"); s2.classList.add("done"); s3.classList.add("done"); }
    else if (item.status === "Resolved") { s1.classList.add("done"); s2.classList.add("done"); s3.classList.add("done"); s4.classList.add("done"); }

    box.classList.remove("hidden");
}

function setMapFilter(filterType, btnElem) {
    currentFilter = filterType;
    document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
    if (btnElem) btnElem.classList.add("active");
    filterMapPins();
}

function filterMapPins() {
    const query = document.getElementById("map-search-input").value.toLowerCase();
    Object.keys(binsState).forEach(binId => {
        const fill = binsState[binId].fill;
        const name = BIN_DETAILS[binId].name.toLowerCase();
        const pinElem = document.getElementById(`map-pin-${binId}`);

        let matchesFilter = true;
        if (currentFilter === "low" && fill >= 50) matchesFilter = false;
        if (currentFilter === "mod" && (fill < 50 || fill >= 80)) matchesFilter = false;
        if (currentFilter === "crit" && fill < 80) matchesFilter = false;

        let matchesSearch = name.includes(query) || binId.toLowerCase().includes(query);

        if (pinElem) {
            pinElem.style.display = (matchesFilter && matchesSearch) ? "block" : "none";
        }
    });
}

function renderEmailCards() {
    const container = document.getElementById("email-ticket-cards-container");
    if (!container) return;
    container.innerHTML = "";

    if (incidentDB.length === 0) {
        container.innerHTML = `<p style="color:var(--text-secondary); font-size:0.85rem;">No active ticket cards logged.</p>`;
        return;
    }

    incidentDB.forEach(item => {
        const card = document.createElement("div");
        card.className = "email-ticket-card";
        const badgeClass = item.status === "Resolved" ? "pill-low" : "pill-mod";

        card.innerHTML = `
            <div class="card-head">
                <span class="card-ref">${item.id}</span>
                <span class="pill-badge ${badgeClass}">${item.status.toUpperCase()}</span>
            </div>
            <div class="card-body">
                <p><strong>Location:</strong> ${item.location}</p>
                <p><strong>Category:</strong> ${item.category}</p>
                <p><strong>Reporter:</strong> ${item.reporter}</p>
                <p><strong>Timestamp:</strong> ${item.timestamp}</p>
                <p><strong>Notes:</strong> ${item.description}</p>
                ${item.photo ? `<div style="margin-top:6px;"><span class="preview-label">📸 Attached Proof:</span><img src="${item.photo}" class="photo-preview-thumb" alt="Proof Preview"></div>` : ''}
            </div>
            <div style="display:flex; gap:6px; margin-top:6px;">
                <button class="action-btn secondary-btn" style="flex:1; min-height:34px; font-size:0.75rem;" onclick="openProofModal('${item.id}')">📸 Upload Proof</button>
                <button class="action-btn primary-btn" style="flex:1; min-height:34px; font-size:0.75rem;" onclick="updateStatus('${item.id}', 'Resolved')">✅ Resolve</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderAdminTable() {
    const tbody = document.getElementById("admin-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (incidentDB.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-secondary);">No reports logged.</td></tr>`;
    } else {
        incidentDB.forEach(item => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-family:monospace; font-weight:bold; color:var(--accent-blue);">${item.id}</td>
                <td>${item.timestamp}</td>
                <td>${item.location}</td>
                <td>${item.category}</td>
                <td>${item.reporter}</td>
                <td>
                    <select class="form-control" style="min-height:34px; padding:4px 8px; font-size:0.75rem;" onchange="updateStatus('${item.id}', this.value)">
                        <option value="Submitted" ${item.status === "Submitted" ? "selected" : ""}>1. Submitted</option>
                        <option value="Under Review" ${item.status === "Under Review" ? "selected" : ""}>2. Under Review</option>
                        <option value="Maintenance Dispatched" ${item.status === "Maintenance Dispatched" ? "selected" : ""}>3. Dispatched</option>
                        <option value="Resolved" ${item.status === "Resolved" ? "selected" : ""}>4. Resolved</option>
                    </select>
                </td>
                <td>
                    <button class="action-btn danger-btn" style="min-height:32px; padding:4px 8px;" onclick="deleteIncident('${item.id}')">✕</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    document.getElementById("kpi-total").innerText = incidentDB.length;
    document.getElementById("kpi-critical").innerText = incidentDB.filter(i => i.category.includes("Critical Overflow")).length;
    document.getElementById("kpi-pending").innerText = incidentDB.filter(i => i.status !== "Resolved").length;
    document.getElementById("kpi-resolved").innerText = incidentDB.filter(i => i.status === "Resolved").length;
}

function updateStatus(id, newStatus) {
    if (!isAdminAuthenticated) { openAdminLoginModal(); return; }
    const item = incidentDB.find(i => i.id === id);
    if (item) {
        item.status = newStatus;
        saveLocalStorage();
        renderAdminTable();
        renderEmailCards();
        showToast(`Updated ${id} to ${newStatus}`);

        sendGASEmail({
            action: "update_status",
            report_id: item.id,
            timestamp: item.timestamp,
            location: item.location,
            issue_type: item.category,
            description: item.description,
            reporter_info: item.reporter,
            reporter_email: getReporterEmail(item),
            status: item.status,
            photo_url: item.photo && item.photo.startsWith("http") ? item.photo : "",
            image_attachment: item.photo && item.photo.startsWith("data:image") ? item.photo : ""
        });
    }
}

function deleteIncident(id) {
    if (!isAdminAuthenticated) { openAdminLoginModal(); return; }
    if (confirm(`Delete ticket ${id}?`)) {
        incidentDB = incidentDB.filter(i => i.id !== id);
        saveLocalStorage();
        renderAdminTable();
        renderEmailCards();
        showToast(`Deleted ${id}`);

        sendGASEmail({
            action: "delete_report",
            report_id: id
        });
    }
}

function exportToCSV() {
    if (!isAdminAuthenticated) { openAdminLoginModal(); return; }
    if (incidentDB.length === 0) { showToast("⚠️ No logs to export."); return; }
    let csv = "data:text/csv;charset=utf-8,Ticket ID,Timestamp,Location,Category,Reporter,Status\n";
    incidentDB.forEach(item => {
        csv += `"${item.id}","${item.timestamp}","${item.location}","${item.category}","${item.reporter}","${item.status}"\n`;
    });
    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = `WASTETRACE_Logs_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function handleLocationChange() {
    const select = document.getElementById("campus-location");
    const customInput = document.getElementById("custom-location-input");
    if (select && customInput) {
        customInput.classList.toggle("hidden", select.value !== "Custom");
        customInput.required = (select.value === "Custom");
    }
}

function saveLocalStorage() {
    try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(incidentDB)); } catch (e) {}
}

function loadLocalStorage() {
    try {
        const data = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (data) incidentDB = JSON.parse(data);
    } catch (e) {}
}

function showToast(msg) {
    const toast = document.getElementById("toast-notification");
    const msgElem = document.getElementById("toast-message");
    if (toast && msgElem) {
        msgElem.innerText = msg;
        toast.classList.remove("hidden");
        setTimeout(() => toast.classList.add("hidden"), 3500);
    }
}
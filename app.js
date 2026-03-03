// ===== DESKFLOW APP =====

// ===== STATE =====
let currentUser = null;
let currentView = 'floor';
let currentFloorId = 'f1';
let selectedDates = [];  // Array of 'YYYY-MM-DD' strings
let filterDates = [];    // Subset of selectedDates used to filter desk colors
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth(); // 0-indexed
let adminDragMode = false;
let dragState = null;
let adminBookingUserId = null; // for admin booking on behalf of user

// Pending action for desk modal buttons (avoids JSON in HTML attributes)
let pendingDeskAction = null;

// Audio context for booking sound
let audioCtx = null;

// ===== INIT =====
window.addEventListener('DOMContentLoaded', async () => {
    const session = SessionAPI.get();
    if (session && session.orgId) {
        setOrg(session.orgId);
        await initData();
        await CloudSync.fetchAll();
        const user = UserAPI.getById(session.userId);
        if (user) {
            loginUser(user);
        } else {
            showScreen('login-screen');
        }
    } else {
        showScreen('login-screen');
    }
});

// ===== AUDIO =====
function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function playBookingSound() {
    try {
        const ctx = getAudioCtx();
        const times = [0, 0.12, 0.24];
        const freqs = [523, 659, 784]; // C5, E5, G5 - major chord
        times.forEach((t, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freqs[i], ctx.currentTime + t);
            gain.gain.setValueAtTime(0, ctx.currentTime + t);
            gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.25);
            osc.start(ctx.currentTime + t);
            osc.stop(ctx.currentTime + t + 0.3);
        });
    } catch { }
}

function playReleaseSound() {
    try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
    } catch { }
}

// ===== SCREENS =====
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    const el = document.getElementById(id);
    el.classList.remove('hidden');
    el.classList.add('active');
}

// ===== AUTH =====
let isCreateOrgMode = false;

function toggleAuthMode() {
    isCreateOrgMode = !isCreateOrgMode;
    const btn = document.getElementById('login-submit-btn');
    const txt = document.getElementById('auth-toggle-text');
    const title = document.querySelector('.login-card h1');
    const sub = document.querySelector('.login-sub');
    const passLabel = document.getElementById('login-password-label');
    const orgInput = document.getElementById('login-org');
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');

    if (isCreateOrgMode) {
        btn.textContent = 'Create Organization';
        txt.textContent = 'Back to Sign In';
        title.textContent = 'New Workspace';
        sub.textContent = 'Create a workspace and admin account';
        passLabel.textContent = 'Admin Password';
        orgInput.value = '';
    } else {
        btn.textContent = 'Sign In';
        txt.textContent = 'Create new organization';
        title.textContent = 'Welcome back';
        sub.textContent = 'Sign in to book your workspace';
        passLabel.textContent = 'Password';
        orgInput.value = 'demoorg';
    }
}

async function handleAuth(e) {
    e.preventDefault();
    const orgId = document.getElementById('login-org').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');

    function showError(msg) {
        errEl.textContent = msg;
        errEl.classList.remove('hidden');
        document.getElementById('login-form').classList.add('shake');
        setTimeout(() => document.getElementById('login-form').classList.remove('shake'), 500);
    }

    if (!orgId) {
        showError('Organization ID is required (letters/numbers/hyphens only)');
        return;
    }

    const btn = document.getElementById('login-submit-btn');
    const origText = btn.textContent;
    btn.textContent = 'Please wait...';
    btn.disabled = true;
    const resetBtn = () => { btn.textContent = origText; btn.disabled = false; };

    // 1. Set the active Org ID so data APIs point to the right partition
    setOrg(orgId);

    // 2. Fetch users for this org to map presence
    await CloudSync.fetchKey(`df_${orgId}_users`);

    if (isCreateOrgMode) {
        const existingUsers = Store.get(STORAGE_KEYS.USERS, null);
        if (existingUsers && existingUsers.length > 0) {
            showError('Organization already exists');
            resetBtn();
            return;
        }

        // Setup new org
        await initData({ username, password });
        // Push initial defaults to cloud immediately
        ['USERS', 'FLOORS', 'DESKS', 'FLOOR_LAYOUTS', 'BOOKINGS'].forEach(base => {
            const data = Store.get(STORAGE_KEYS[base], null);
            if (data) CloudSync.push(STORAGE_KEYS[base], data);
        });

        const user = UserAPI.getByUsername(username);
        SessionAPI.set(user.id, orgId);
        resetBtn();
        loginUser(user);
    } else {
        // Sign In mode
        const existingUsers = Store.get(STORAGE_KEYS.USERS, null);
        if (!existingUsers || existingUsers.length === 0) {
            if (orgId === 'demoorg') {
                // Migrate defaults transparently if signing into demoorg and empty
                await initData();
            } else {
                showError('Organization not found');
                resetBtn();
                return;
            }
        }

        const user = UserAPI.getByUsername(username);
        if (!user || user.password !== password) {
            showError('Invalid username or password');
            resetBtn();
            return;
        }

        errEl.classList.add('hidden');
        SessionAPI.set(user.id, orgId);
        resetBtn();
        // Since we didn't do fetchAll in boot layer due to lacking orgId, fetch everything now before UI appears
        await CloudSync.fetchAll();
        loginUser(user);
    }
}

let cloudPollInterval = null;

function loginUser(user) {
    currentUser = user;
    setupUI();
    showScreen('app-screen');
    switchView('calendar'); // Start on calendar so user picks dates first
    startCloudPolling();
}

function startCloudPolling() {
    if (cloudPollInterval) clearInterval(cloudPollInterval);
    cloudPollInterval = setInterval(async () => {
        await CloudSync.fetchAll();
        // Re-render live views so other users' bookings appear
        if (currentView === 'floor') renderFloor();
        if (currentView === 'mybookings') renderMyBookings();
        if (currentView === 'admin') renderAdminBookings();
        showSyncPulse();
    }, 30000); // every 30 seconds
}

function showSyncPulse() {
    const dot = document.getElementById('sync-dot');
    if (!dot) return;
    dot.classList.add('synced');
    setTimeout(() => dot.classList.remove('synced'), 1500);
}

function logout() {
    SessionAPI.clear();
    currentUser = null;
    selectedDates = [];
    showScreen('login-screen');
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
}

// ===== UI SETUP =====
function setupUI() {
    const avatarEl = document.getElementById('user-avatar-sidebar');
    avatarEl.textContent = currentUser.initials;
    avatarEl.className = `user-avatar role-${currentUser.role}`;

    // Update the sidebar logo text to show the active organization
    const logoText = document.querySelector('.sidebar-header .login-logo span');
    if (logoText) {
        logoText.textContent = `DeskFlow: ${CURRENT_ORG}`;
    }
    document.getElementById('user-name-sidebar').textContent = currentUser.name;
    document.getElementById('user-role-sidebar').textContent = currentUser.role === 'admin' ? '⭐ Admin' : 'User';

    // Admin nav — show for admin users
    const adminNav = document.getElementById('nav-admin');
    const adminDivider = document.getElementById('admin-nav-divider');
    if (currentUser.role === 'admin') {
        adminNav.classList.remove('hidden');
        adminDivider.style.display = '';
        const designerNav = document.getElementById('nav-designer');
        if (designerNav) designerNav.classList.remove('hidden');
    } else {
        adminNav.classList.add('hidden');
        adminDivider.style.display = 'none';
        const designerNav = document.getElementById('nav-designer');
        if (designerNav) designerNav.classList.add('hidden');
    }

    // Build floor tabs
    buildFloorTabs();
}

function buildFloorTabs() {
    const floors = FloorAPI.getAll();
    const tabsEl = document.getElementById('floor-tabs');
    tabsEl.innerHTML = floors.map(f =>
        `<button class="floor-tab${f.id === currentFloorId ? ' active' : ''}" 
      onclick="switchFloor('${f.id}')" id="ftab-${f.id}">${f.name}</button>`
    ).join('');
}

// ===== VIEW SWITCHING =====
function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
        v.classList.add('hidden');
    });
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const viewEl = document.getElementById(`view-${view}`);
    viewEl.classList.remove('hidden');
    viewEl.classList.add('active');

    const navEl = document.getElementById(`nav-${view}`);
    if (navEl) navEl.classList.add('active');

    const titles = { floor: 'Floor Map', calendar: 'Calendar', mybookings: 'My Bookings', admin: 'Admin Panel', designer: 'Floor Designer' };
    document.getElementById('topbar-title').textContent = titles[view] || '';

    if (view === 'floor') renderFloor();
    else if (view === 'calendar') renderCalendar();
    else if (view === 'mybookings') renderMyBookings();
    else if (view === 'admin') renderAdmin();
    else if (view === 'designer') {
        if (!Designer._listenersSetup) Designer.setupGlobalListeners();
        Designer.init(currentFloorId);
        Designer.setupPalette();
    }

    renderTopbarActions(view);
}

function renderTopbarActions(view) {
    const el = document.getElementById('topbar-actions');
    el.innerHTML = ''; // Move Desks removed — use Floor Designer instead
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// ===== FLOOR SWITCHING =====
function switchFloor(floorId) {
    currentFloorId = floorId;
    document.querySelectorAll('.floor-tab').forEach(t => t.classList.remove('active'));
    const tab = document.getElementById(`ftab-${floorId}`);
    if (tab) tab.classList.add('active');
    renderFloor();
}

// ===== FLOOR RENDERING =====
function renderFloor() {
    renderFloorDateBar();
    renderFloorCanvas();
}

function renderFloorDateBar() {
    const el = document.getElementById('floor-selected-dates');
    if (selectedDates.length === 0) {
        el.innerHTML = `<span class="no-dates-msg">No dates selected — select dates in the Calendar to book desks</span>`;
        document.getElementById('change-dates-btn').textContent = '📅 Select Dates';
        filterDates = [];
    } else {
        // Render chips as interactive toggles for date filtering
        el.innerHTML = selectedDates.map(d => {
            const isActive = filterDates.length === 0 || filterDates.includes(d);
            return `<button class="date-chip${isActive ? ' active' : ' inactive'}" onclick="toggleFilterDate('${d}')" title="Click to filter by this date">${formatDate(d)}</button>`;
        }).join('');
        document.getElementById('change-dates-btn').innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      Change Dates`;
    }
    // Show active filter hint when filtering
    const hintEl = document.getElementById('filter-hint');
    if (hintEl) {
        const activeDates = filterDates.length > 0 ? filterDates : selectedDates;
        if (filterDates.length > 0 && filterDates.length < selectedDates.length) {
            hintEl.textContent = `Filtering by ${filterDates.length} of ${selectedDates.length} dates — click chips to toggle`;
            hintEl.style.display = '';
        } else if (selectedDates.length > 1) {
            hintEl.textContent = `Click date chips above to filter desk availability by date`;
            hintEl.style.display = '';
        } else {
            hintEl.style.display = 'none';
        }
    }
}

function toggleFilterDate(dateStr) {
    // If currently showing all dates, entering single-filter mode: activate only this date
    if (filterDates.length === 0) {
        filterDates = [dateStr];
    } else if (filterDates.includes(dateStr)) {
        // Deactivate this date from filter
        filterDates = filterDates.filter(d => d !== dateStr);
        // If nothing left selected, show all
        if (filterDates.length === 0) filterDates = [];
    } else {
        // Add this date to filter
        filterDates.push(dateStr);
    }
    renderFloorDateBar();
    renderFloorCanvas();
}


function renderFloorCanvas() {
    const canvas = document.getElementById('floor-canvas');
    canvas.innerHTML = '';

    const layout = FloorAPI.getLayout(currentFloorId);
    const desks = DeskAPI.getForFloor(currentFloorId);

    // Draw zones (dashed borders)
    (layout.zones || []).forEach(zone => {
        const el = document.createElement('div');
        el.className = 'floor-open-zone';
        el.style.cssText = `left:${zone.x}px;top:${zone.y}px;width:${zone.w}px;height:${zone.h}px;`;
        const lbl = document.createElement('div');
        lbl.className = 'floor-open-zone-label';
        lbl.textContent = zone.label;
        el.appendChild(lbl);
        canvas.appendChild(el);
    });

    // Draw walls (structural filled rectangles)
    (layout.walls || []).forEach(wall => {
        const el = document.createElement('div');
        el.className = 'floor-wall';
        el.style.cssText = `left:${wall.x}px;top:${wall.y}px;width:${wall.w}px;height:${wall.h}px;`;
        canvas.appendChild(el);
    });

    // Draw rooms (solid borders + label)
    (layout.rooms || []).forEach(room => {
        const el = document.createElement('div');
        el.className = 'floor-room';
        el.style.cssText = `left:${room.x}px;top:${room.y}px;width:${room.w}px;height:${room.h}px;`;
        const lbl = document.createElement('div');
        lbl.className = 'floor-room-label';
        lbl.textContent = room.label;
        el.appendChild(lbl);
        canvas.appendChild(el);
    });

    // Draw boxes after bookingMap is built below — see deferred rendering
    const boxesToRender = layout.boxes || [];

    const viewDates = filterDates.length > 0 ? filterDates : selectedDates;

    // Collect bookings for view dates
    const bookingMap = {}; // deskId -> { [dateStr]: booking }
    viewDates.forEach(dateStr => {
        const dayBookings = BookingAPI.getBookingsForFloorDate(currentFloorId, dateStr);
        dayBookings.forEach(b => {
            if (!bookingMap[b.deskId]) bookingMap[b.deskId] = {};
            bookingMap[b.deskId][dateStr] = b;
        });
    });

    // Draw desks
    desks.forEach(desk => {
        const deskEl = document.createElement('div');
        deskEl.className = 'desk';
        deskEl.id = `desk-${desk.id}`;
        deskEl.style.cssText = `left:${desk.x}px;top:${desk.y}px;`;
        deskEl.dataset.id = desk.id;

        const deskBookings = bookingMap[desk.id] || {};
        const bookingDates = Object.keys(deskBookings);
        const isBookedOnAnyDate = bookingDates.length > 0;
        let bookerUser = null;
        let isMine = false;

        if (isBookedOnAnyDate) {
            // Get first booking's user (for display)
            const firstDate = bookingDates[0];
            const b = deskBookings[firstDate];
            bookerUser = UserAPI.getById(b.userId);
            isMine = b.userId === currentUser.id;

            if (isMine) {
                deskEl.classList.add('booked-mine');
            } else if (bookerUser && bookerUser.role === 'admin') {
                deskEl.classList.add('booked-admin');
            } else {
                deskEl.classList.add('booked-user');
            }

            // Show initials
            const initSpan = document.createElement('div');
            initSpan.className = 'desk-initials';
            initSpan.textContent = bookerUser ? bookerUser.initials : '?';
            deskEl.appendChild(initSpan);
        } else {
            deskEl.classList.add('available');
            // Desk icon — overhead view of a desk with monitor
            deskEl.innerHTML = `<svg class="desk-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <!-- desk surface -->
              <rect x="3" y="12" width="26" height="14" rx="2" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.5"/>
              <!-- monitor -->
              <rect x="10" y="5" width="12" height="8" rx="1.5" fill="currentColor" opacity="0.35" stroke="currentColor" stroke-width="1.4"/>
              <!-- monitor stand -->
              <rect x="14.5" y="13" width="3" height="3" rx="0.5" fill="currentColor" opacity="0.5"/>
              <!-- keyboard -->
              <rect x="8" y="19" width="16" height="4" rx="1" fill="currentColor" opacity="0.4" stroke="currentColor" stroke-width="1"/>
            </svg>`;
        }

        const idSpan = document.createElement('div');
        idSpan.className = 'desk-id';
        idSpan.textContent = desk.label;
        deskEl.appendChild(idSpan);

        // Fixed (unbookable) desks — show differently, no click handler
        if (desk.fixed) {
            deskEl.classList.add('desk-fixed');
            deskEl.title = `${desk.label} — Fixed desk (not bookable)`;
        } else if (adminDragMode && currentUser.role === 'admin') {
            deskEl.classList.add('drag-mode');
            setupDeskDrag(deskEl, desk);
        } else {
            deskEl.addEventListener('click', () => handleDeskClick(desk, deskBookings));
        }

        canvas.appendChild(deskEl);
    });

    // Draw boxes — deferred so bookingMap is ready
    boxesToRender.forEach(box => {
        const boxBookings = bookingMap[box.id] || {};
        const bookedDates = Object.keys(boxBookings);
        const isBooked = bookedDates.length > 0;

        const el = document.createElement('div');
        el.className = 'floor-box';
        el.id = `box-${box.id}`;
        el.style.cssText = `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;`;

        if (isBooked) {
            const booker = UserAPI.getById(boxBookings[bookedDates[0]].userId);
            el.classList.add('floor-box-booked');
            const initSpan = document.createElement('div');
            initSpan.className = 'floor-box-initials';
            initSpan.textContent = booker ? booker.initials : '?';
            el.appendChild(initSpan);
        } else if (currentUser.role === 'admin') {
            el.classList.add('floor-box-available');
        }

        if (box.label) {
            const lbl = document.createElement('div');
            lbl.className = 'floor-box-label';
            lbl.textContent = box.label;
            el.appendChild(lbl);
        }

        if (currentUser.role === 'admin') {
            el.style.cursor = 'pointer';
            el.addEventListener('click', () => openBoxModal(box, boxBookings));
        }
        canvas.appendChild(el);
    });
}

// ===== BOX MODAL (admin-only booking for generic boxes) =====
function openBoxModal(box, boxBookings) {
    const overlay = document.getElementById('desk-modal-overlay');
    const titleEl = document.getElementById('desk-modal-title');
    const bodyEl = document.getElementById('desk-modal-body');
    const footerEl = document.getElementById('desk-modal-footer');

    const floor = FloorAPI.getAll().find(f => f.id === currentFloorId);
    titleEl.textContent = `${box.label || 'Box'} — ${floor ? floor.name : ''}`;

    const viewDates = selectedDates.length > 0 ? selectedDates : [];
    let html = '<div class="desk-modal-info">';
    html += `<div class="desk-modal-row"><span class="label">Item</span><span class="value">${box.label || '(unnamed box)'}</span></div>`;
    html += `<div class="desk-modal-row"><span class="label">Floor</span><span class="value">${floor ? floor.name : ''}</span></div>`;
    html += `<div class="desk-modal-row"><span class="label">Bookable by</span><span class="value">Admins only</span></div>`;

    if (viewDates.length === 0) {
        // Admin date picker
        html += `
          <div class="field-group" style="margin-top:10px;">
            <label>Book for dates</label>
            <div class="admin-date-picker">
              <input type="date" id="box-date-1" />
              <input type="date" id="box-date-2" />
              <input type="date" id="box-date-3" />
            </div>
          </div>
          <div class="field-group">
            <label>Book for user</label>
            <select id="box-booking-user">
              ${UserAPI.getAll().map(u => `<option value="${u.id}"${u.id === currentUser.id ? ' selected' : ''}>${u.name} (${u.role})</option>`).join('')}
            </select>
          </div>`;
        html += '</div>';
        bodyEl.innerHTML = html;
        footerEl.innerHTML = '';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn-secondary'; closeBtn.textContent = 'Cancel';
        closeBtn.addEventListener('click', closeDeskModalDirect);
        footerEl.appendChild(closeBtn);
        const bookBtn = document.createElement('button');
        bookBtn.className = 'btn-primary'; bookBtn.textContent = 'Book';
        bookBtn.addEventListener('click', () => {
            const d1 = document.getElementById('box-date-1')?.value;
            const d2 = document.getElementById('box-date-2')?.value;
            const d3 = document.getElementById('box-date-3')?.value;
            const userId = document.getElementById('box-booking-user')?.value;
            const dates = [d1, d2, d3].filter(Boolean);
            if (!dates.length) { showToast('Select at least one date', 'error'); return; }
            handleBookBox(box.id, dates, userId);
        });
        footerEl.appendChild(bookBtn);
        overlay.classList.remove('hidden');
        return;
    }

    // Show date status
    html += `<div style="margin-top:10px;"><div class="desk-booking-dates">`;
    viewDates.forEach(dateStr => {
        const b = boxBookings[dateStr];
        if (b) {
            const booker = UserAPI.getById(b.userId);
            html += `<div class="desk-date-entry"><span>${formatDate(dateStr)}</span>
              <span class="booked-by" style="color:var(--desk-admin)">Booked: ${booker ? booker.name : 'Unknown'}</span></div>`;
        } else {
            html += `<div class="desk-date-entry"><span>${formatDate(dateStr)}</span>
              <span style="color:var(--accent-green)">Available</span></div>`;
        }
    });
    html += `</div></div></div>`;
    bodyEl.innerHTML = html;
    footerEl.innerHTML = '';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-secondary'; closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', closeDeskModalDirect);
    footerEl.appendChild(closeBtn);

    const bookableDates = viewDates.filter(d => !boxBookings[d]);
    if (bookableDates.length > 0) {
        const bookBtn = document.createElement('button');
        bookBtn.className = 'btn-primary';
        bookBtn.textContent = `Book ${bookableDates.length} Date${bookableDates.length > 1 ? 's' : ''}`;
        bookBtn.addEventListener('click', () => handleBookBox(box.id, [...bookableDates], currentUser.id));
        footerEl.appendChild(bookBtn);
    }

    const bookedDates = viewDates.filter(d => boxBookings[d]);
    if (bookedDates.length > 0) {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-danger';
        cancelBtn.textContent = `Cancel Booking${bookedDates.length > 1 ? 's' : ''}`;
        cancelBtn.addEventListener('click', () => {
            bookedDates.forEach(d => BookingAPI.unbook(currentFloorId, box.id, d));
            closeDeskModalDirect();
            renderFloor();
            showToast('Box booking cancelled', 'info');
        });
        footerEl.appendChild(cancelBtn);
    }
    overlay.classList.remove('hidden');
}

async function handleBookBox(boxId, dates, userId) {
    showToast('Checking availability…', 'info');
    await CloudSync.fetchKey('df_bookings');

    const conflicts = dates.filter(d => {
        const ex = BookingAPI.getBooking(currentFloorId, boxId, d);
        return ex && ex.userId !== userId;
    });
    if (conflicts.length > 0) {
        closeDeskModalDirect();
        renderFloor();
        showToast('❌ Box already booked on those date(s).', 'error');
        return;
    }

    let booked = 0;
    dates.forEach(d => { if (BookingAPI.book(currentFloorId, boxId, d, userId)) booked++; });
    closeDeskModalDirect();
    if (booked > 0) {
        renderFloor();
        showToast(`Box booked for ${booked} date${booked > 1 ? 's' : ''}! 🎉`, 'success');
    } else {
        showToast('Could not book — already taken', 'error');
    }
}

// ===== DESK DRAG & DROP (Admin) =====
function setupDeskDrag(deskEl, desk) {
    deskEl.addEventListener('mousedown', startDrag);
    deskEl.addEventListener('touchstart', startDrag, { passive: false });

    function startDrag(e) {
        if (e.type === 'touchstart') e.preventDefault();
        const canvas = document.getElementById('floor-canvas');
        const canvasRect = canvas.getBoundingClientRect();
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

        const startX = clientX - canvasRect.left;
        const startY = clientY - canvasRect.top;
        const offsetX = startX - desk.x;
        const offsetY = startY - desk.y;

        deskEl.classList.add('dragging');

        function onMove(ev) {
            const cx = ev.type === 'touchmove' ? ev.touches[0].clientX : ev.clientX;
            const cy = ev.type === 'touchmove' ? ev.touches[0].clientY : ev.clientY;
            const newX = Math.max(0, Math.min(1040, cx - canvasRect.left - offsetX));
            const newY = Math.max(0, Math.min(700, cy - canvasRect.top - offsetY));
            deskEl.style.left = newX + 'px';
            deskEl.style.top = newY + 'px';
            desk.x = Math.round(newX);
            desk.y = Math.round(newY);
        }

        function onEnd() {
            deskEl.classList.remove('dragging');
            DeskAPI.updatePosition(currentFloorId, desk.id, desk.x, desk.y);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
            showToast('Desk position saved', 'success');
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
    }
}

function toggleDragMode() {
    adminDragMode = !adminDragMode;
    renderTopbarActions('floor');
    renderFloorCanvas();
    if (adminDragMode) {
        showToast('Drag desks to reposition. Click "Done Moving" when finished.', 'info');
    }
}

// ===== DESK CLICK =====
function handleDeskClick(desk, deskBookings) {
    // If viewing specific dates, open desk detail/booking modal
    if (selectedDates.length === 0 && currentUser.role !== 'admin') {
        showToast('Select dates in the Calendar first', 'info');
        return;
    }

    openDeskModal(desk, deskBookings);
}

function openDeskModal(desk, deskBookings) {
    const overlay = document.getElementById('desk-modal-overlay');
    const titleEl = document.getElementById('desk-modal-title');
    const bodyEl = document.getElementById('desk-modal-body');
    const footerEl = document.getElementById('desk-modal-footer');

    const floor = FloorAPI.getAll().find(f => f.id === currentFloorId);
    titleEl.textContent = `Desk ${desk.label} — ${floor ? floor.name : ''}`;

    let html = '<div class="desk-modal-info">';
    html += `<div class="desk-modal-row"><span class="label">Desk ID</span><span class="value">${desk.label}</span></div>`;
    html += `<div class="desk-modal-row"><span class="label">Floor</span><span class="value">${floor ? floor.name : ''}</span></div>`;

    // Determine what dates we're viewing
    const viewDates = selectedDates.length > 0 ? selectedDates : [];

    // Admin can pick dates even without pre-selecting
    let adminDateInputs = '';
    if (currentUser.role === 'admin' && viewDates.length === 0) {
        adminDateInputs = `
      <div class="field-group" style="margin-top:10px;">
        <label>Book for dates (admin)</label>
        <div class="admin-date-picker">
          <input type="date" id="admin-date-1" value="" />
          <input type="date" id="admin-date-2" value="" placeholder="Optional second date" />
          <input type="date" id="admin-date-3" value="" placeholder="Optional third date" />
        </div>
      </div>
      <div class="field-group">
        <label>Book for user</label>
        <select id="admin-booking-user">
          ${UserAPI.getAll().map(u => `<option value="${u.id}"${u.id === currentUser.id ? ' selected' : ''}>${u.name} (${u.role})</option>`).join('')}
        </select>
      </div>`;
        html += adminDateInputs;
        html += '</div>';
        bodyEl.innerHTML = html;
        footerEl.innerHTML = `
      <button class="btn-secondary" onclick="closeDeskModalDirect()">Cancel</button>
      <button class="btn-primary" onclick="handleAdminBookDesk('${desk.id}')">Book Desk</button>`;
        overlay.classList.remove('hidden');
        return;
    }

    if (viewDates.length > 0) {
        html += `<div style="margin-top:10px;"><div class="desk-modal-row"><span class="label">Selected Dates</span></div>`;
        html += `<div class="desk-booking-dates">`;

        viewDates.forEach(dateStr => {
            const booking = deskBookings[dateStr];
            if (booking) {
                const booker = UserAPI.getById(booking.userId);
                const isMine = booking.userId === currentUser.id;
                html += `<div class="desk-date-entry">
          <span>${formatDate(dateStr)}</span>
          <span class="booked-by" style="color:${isMine ? 'var(--desk-mine)' : booking.userId && UserAPI.getById(booking.userId)?.role === 'admin' ? 'var(--desk-admin)' : 'var(--desk-user)'}">
            Booked: ${booker ? booker.name : 'Unknown'}${isMine ? ' (you)' : ''}
          </span>
        </div>`;
            } else {
                html += `<div class="desk-date-entry">
          <span>${formatDate(dateStr)}</span>
          <span style="color:var(--accent-green);">Available</span>
        </div>`;
            }
        });
        html += `</div></div>`;
    }

    html += '</div>';
    bodyEl.innerHTML = html;

    // Build footer actions using DOM (NOT innerHTML onclick — avoids HTML attribute quote conflicts)
    footerEl.innerHTML = '';

    const bookableDates = viewDates.filter(d => !deskBookings[d]);
    const myBookedDates = viewDates.filter(d => deskBookings[d] && deskBookings[d].userId === currentUser.id);

    // For non-admin users: further filter bookableDates to days they don't already
    // have a booking on ANY desk (enforces 1 desk per day rule).
    const availableDates = currentUser.role === 'admin'
        ? bookableDates
        : bookableDates.filter(d => !BookingAPI.userHasBookingOnDate(currentUser.id, d));

    // Always show Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-secondary';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', closeDeskModalDirect);
    footerEl.appendChild(closeBtn);

    if (currentUser.role === 'admin') {
        // Admin Book button
        if (bookableDates.length > 0) {
            const bookBtn = document.createElement('button');
            bookBtn.className = 'btn-primary';
            bookBtn.textContent = `Book ${bookableDates.length} Date${bookableDates.length > 1 ? 's' : ''}`;
            const datesToBook = [...bookableDates];
            const deskIdToBook = desk.id;
            bookBtn.addEventListener('click', () => {
                handleBookDesk(deskIdToBook, datesToBook, false, null);
            });
            footerEl.appendChild(bookBtn);
        }
        // Admin Cancel button
        const allBookedDates = viewDates.filter(d => deskBookings[d]);
        if (allBookedDates.length > 0) {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn-danger';
            cancelBtn.textContent = `Cancel Booking${allBookedDates.length > 1 ? 's' : ''}`;
            const datesToUnbook = [...allBookedDates];
            const deskIdToUnbook = desk.id;
            cancelBtn.addEventListener('click', () => {
                handleUnbookDesk(deskIdToUnbook, datesToUnbook);
            });
            footerEl.appendChild(cancelBtn);
        }
        // Admin Rename Desk button
        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn-ghost btn-sm';
        renameBtn.style.marginLeft = 'auto';
        renameBtn.textContent = '✏️ Rename';
        renameBtn.addEventListener('click', () => {
            closeDeskModalDirect();
            openRenameDeskModal(currentFloorId, desk.id, desk.label);
        });
        footerEl.appendChild(renameBtn);
    } else {
        // Normal user Book button — only offer days with no existing booking anywhere
        if (availableDates.length > 0) {
            const maxDays = currentUser.maxBookingDays || 2;
            // Count how many distinct days the user has already booked (across all desks)
            const bookedDayCount = BookingAPI.getBookingsForUser(currentUser.id)
                .filter(b => viewDates.includes(b.dateStr)).length;
            const remainingDays = Math.max(0, maxDays - bookedDayCount);
            const toBook = availableDates.slice(0, remainingDays);

            if (toBook.length > 0) {
                const bookBtn = document.createElement('button');
                bookBtn.className = 'btn-primary';
                bookBtn.textContent = `Book ${toBook.length} Date${toBook.length > 1 ? 's' : ''}`;
                const datesToBook = [...toBook];
                const deskIdToBook = desk.id;
                bookBtn.addEventListener('click', () => {
                    handleBookDesk(deskIdToBook, datesToBook, false, null);
                });
                footerEl.appendChild(bookBtn);
            } else {
                const limitMsg = document.createElement('span');
                limitMsg.style.cssText = 'font-size:0.8rem;color:var(--text-muted)';
                limitMsg.textContent = `Booking limit (${currentUser.maxBookingDays || 2} days) reached`;
                footerEl.appendChild(limitMsg);
            }
        } else if (bookableDates.length > 0 && availableDates.length === 0) {
            // Desk is free but user already has a booking on those days
            const alreadyBookedMsg = document.createElement('span');
            alreadyBookedMsg.style.cssText = 'font-size:0.8rem;color:var(--text-muted)';
            alreadyBookedMsg.textContent = 'You already have a desk booked on those day(s)';
            footerEl.appendChild(alreadyBookedMsg);
        }
        // Normal user Cancel button
        if (myBookedDates.length > 0) {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn-danger';
            cancelBtn.textContent = `Cancel My Booking${myBookedDates.length > 1 ? 's' : ''}`;
            const datesToUnbook = [...myBookedDates];
            const deskIdToUnbook = desk.id;
            cancelBtn.addEventListener('click', () => {
                handleUnbookDesk(deskIdToUnbook, datesToUnbook);
            });
            footerEl.appendChild(cancelBtn);
        }
    }

    overlay.classList.remove('hidden');
}

function handleAdminBookDesk(deskId) {
    const d1 = document.getElementById('admin-date-1')?.value;
    const d2 = document.getElementById('admin-date-2')?.value;
    const d3 = document.getElementById('admin-date-3')?.value;
    const targetUserId = document.getElementById('admin-booking-user')?.value;

    const dates = [d1, d2, d3].filter(Boolean);
    if (dates.length === 0) {
        showToast('Please select at least one date', 'error');
        return;
    }

    handleBookDesk(deskId, dates, false, targetUserId);
}

// Execute pending book action from modal button (avoids JSON in HTML attributes)
function executePendingBook() {
    if (!pendingDeskAction || !pendingDeskAction.deskId) return;
    handleBookDesk(pendingDeskAction.deskId, pendingDeskAction.dates, false, pendingDeskAction.userId);
    pendingDeskAction = null;
}

// Execute pending unbook action from modal button
function executePendingUnbook() {
    if (!pendingDeskAction || !pendingDeskAction.unbookDeskId) return;
    handleUnbookDesk(pendingDeskAction.unbookDeskId, pendingDeskAction.unbookDates);
    pendingDeskAction = null;
}

async function handleBookDesk(deskId, dates, isUnbook, overrideUserId = null) {
    const userId = overrideUserId || currentUser.id;
    const isAdmin = currentUser.role === 'admin';

    // Fetch the very latest bookings from Firebase before writing
    showToast('Checking availability\u2026', 'info');
    await CloudSync.fetchKey('df_bookings');

    // Guard 1: desk already taken by someone else on those dates?
    const deskConflicts = dates.filter(dateStr => {
        const existing = BookingAPI.getBooking(currentFloorId, deskId, dateStr);
        return existing && existing.userId !== userId;
    });
    if (deskConflicts.length > 0) {
        closeDeskModalDirect();
        renderFloor();
        showToast('\u274c Desk just booked by someone else! Please choose another.', 'error');
        return;
    }

    // Guard 2 (non-admin only): already have a booking on any of these days?
    if (!isAdmin) {
        const dayConflicts = dates.filter(d =>
            BookingAPI.userHasBookingOnDate(userId, d) &&
            !BookingAPI.getBooking(currentFloorId, deskId, d)
        );
        if (dayConflicts.length > 0) {
            dates = dates.filter(d => !dayConflicts.includes(d));
            if (dates.length === 0) {
                closeDeskModalDirect();
                renderFloor();
                showToast('\u274c You already have a desk booked on those day(s).', 'error');
                return;
            }
        }

        // Guard 3: still within maxBookingDays limit?
        const maxDays = currentUser.maxBookingDays || 2;
        const alreadyBookedDays = BookingAPI.getBookingsForUser(userId).length;
        const remaining = Math.max(0, maxDays - alreadyBookedDays);
        dates = dates.slice(0, remaining);
        if (dates.length === 0) {
            closeDeskModalDirect();
            showToast('\u274c Booking limit reached.', 'error');
            return;
        }
    }

    // All clear \u2014 proceed with booking
    let booked = 0;
    dates.forEach(dateStr => {
        if (BookingAPI.book(currentFloorId, deskId, dateStr, userId)) {
            booked++;
        }
    });

    closeDeskModalDirect();

    if (booked > 0) {
        playBookingSound();
        showBookingAnimation(true);
        animateDesk(deskId, 'just-booked');
        renderFloor();
        showToast(`Desk booked for ${booked} date${booked > 1 ? 's' : ''}! \uD83C\uDF89`, 'success');
    } else {
        renderFloor();
        showToast('Could not book \u2014 desk already taken for those dates', 'error');
    }
}

function handleUnbookDesk(deskId, dates) {
    dates.forEach(dateStr => {
        BookingAPI.unbook(currentFloorId, deskId, dateStr);
    });

    closeDeskModalDirect();
    playReleaseSound();
    animateDesk(deskId, 'just-released');
    renderFloor();
    showToast(`Booking cancelled for ${dates.length} date${dates.length > 1 ? 's' : ''}`, 'info');
}

function animateDesk(deskId, animClass) {
    const el = document.getElementById(`desk-${deskId}`);
    if (!el) return;
    el.classList.remove('just-booked', 'just-released');
    void el.offsetWidth; // force reflow
    el.classList.add(animClass);
    setTimeout(() => el.classList.remove(animClass), 600);
}

// ===== BOOKING ANIMATION =====
function showBookingAnimation(isBooking) {
    const container = document.createElement('div');
    container.className = 'particle-container';
    document.body.appendChild(container);

    const colors = isBooking
        ? ['#6366f1', '#8b5cf6', '#22c55e', '#06b6d4', '#f59e0b']
        : ['#ef4444', '#f97316', '#eab308'];

    for (let i = 0; i < 20; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const angle = (i / 20) * 360;
        const dist = 60 + Math.random() * 80;
        const tx = `translateX(${Math.cos(angle * Math.PI / 180) * dist}px)`;
        const ty = `translateY(${Math.sin(angle * Math.PI / 180) * dist}px)`;
        p.style.cssText = `
      background:${colors[i % colors.length]};
      --tx:${tx};
      --ty:${ty};
      animation-delay:${Math.random() * 0.1}s;
    `;
        container.appendChild(p);
    }

    // Central icon
    const iconDiv = document.createElement('div');
    iconDiv.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);
    width:64px;height:64px;border-radius:50%;
    background:${isBooking ? 'var(--accent-primary)' : 'var(--accent-red)'};
    display:flex;align-items:center;justify-content:center;
    font-size:1.8rem;z-index:3001;
    animation:iconPop 0.4s cubic-bezier(0.16,1,0.3,1) forwards;
  `;
    iconDiv.textContent = isBooking ? '✓' : '✗';
    document.body.appendChild(iconDiv);

    setTimeout(() => {
        container.remove();
        iconDiv.remove();
    }, 900);
}

// ===== DESK MODAL CLOSE =====
function closeDeskModal(e) {
    if (e.target === document.getElementById('desk-modal-overlay')) {
        closeDeskModalDirect();
    }
}
function closeDeskModalDirect() {
    document.getElementById('desk-modal-overlay').classList.add('hidden');
}

// ===== CALENDAR =====
function renderCalendar() {
    const label = document.getElementById('calendar-month-label');
    const grid = document.getElementById('calendar-grid');
    const info = document.getElementById('calendar-info');

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    label.textContent = `${monthNames[calendarMonth]} ${calendarYear}`;

    const today = new Date();
    const todayStr = formatDateObj(today);

    // Day headers
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let html = days.map(d => `<div class="cal-day-header">${d}</div>`).join('');

    // First day of the month
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const daysInPrev = new Date(calendarYear, calendarMonth, 0).getDate();

    // Previous month padding
    for (let i = firstDay - 1; i >= 0; i--) {
        html += `<div class="cal-day other-month">${daysInPrev - i}</div>`;
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(calendarYear, calendarMonth, day);
        const dateStr = formatDateObj(dateObj);
        const isPast = dateStr < todayStr;
        const isToday = dateStr === todayStr;
        const isSelected = selectedDates.includes(dateStr);
        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

        // Check if the user has any bookings on this day (across all desks/floors)
        const userBookings = BookingAPI.getBookingsForUser(currentUser.id);
        const hasBooking = userBookings.some(b => b.dateStr === dateStr);

        let classes = 'cal-day';
        if (isPast) classes += ' disabled';
        if (isToday) classes += ' today';
        if (isSelected) classes += ' selected';
        if (isWeekend && !isPast) classes += ' weekend';
        if (hasBooking) classes += ' has-bookings';

        html += `<div class="${classes}" onclick="toggleDateSelection('${dateStr}')" title="${dateStr}">${day}</div>`;
    }

    // Next month padding
    const totalCells = firstDay + daysInMonth;
    const remaining = 7 - (totalCells % 7);
    if (remaining < 7) {
        for (let i = 1; i <= remaining; i++) {
            html += `<div class="cal-day other-month">${i}</div>`;
        }
    }

    grid.innerHTML = html;

    // Info text
    const isAdmin = currentUser.role === 'admin';
    const maxDays = isAdmin ? 'unlimited' : (currentUser.maxBookingDays || 2);
    info.textContent = isAdmin
        ? 'Admin: Select any dates to book desks for any user.'
        : `Select up to ${maxDays} day${maxDays !== 1 ? 's' : ''} to book a desk. Dots indicate days with existing bookings.`;

    renderDateChips();
}

function prevMonth() {
    calendarMonth--;
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
    renderCalendar();
}
function nextMonth() {
    calendarMonth++;
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    renderCalendar();
}

function toggleDateSelection(dateStr) {
    const isAdmin = currentUser.role === 'admin';
    const maxDays = isAdmin ? 365 : (currentUser.maxBookingDays || 2);

    if (selectedDates.includes(dateStr)) {
        selectedDates = selectedDates.filter(d => d !== dateStr);
        filterDates = filterDates.filter(d => d !== dateStr);
    } else if (selectedDates.length < maxDays) {
        selectedDates.push(dateStr);
        selectedDates.sort();
        // Auto-add to filter so new date is active
        if (filterDates.length > 0) filterDates.push(dateStr);
    } else if (!isAdmin) {
        const limit = currentUser.maxBookingDays || 2;
        showToast(`You can only select up to ${limit} day${limit > 1 ? 's' : ''} at a time`, 'info');
        return;
    }

    renderCalendar();
}

function clearDateSelection() {
    selectedDates = [];
    renderCalendar();
}

function renderDateChips() {
    const chips = document.getElementById('selected-dates-chips');
    const btn = document.getElementById('view-floor-btn');
    const label = document.getElementById('selection-label');

    chips.innerHTML = selectedDates.map(d =>
        `<span class="date-chip active"><span>${formatDate(d)}</span> <button onclick="toggleDateSelection('${d}')" style="background:none;border:none;color:inherit;cursor:pointer;margin-left:4px;font-size:0.9em;" title="Remove date">✕</button></span>`
    ).join('');

    btn.disabled = selectedDates.length === 0;

    if (currentUser.role === 'admin') {
        label.textContent = selectedDates.length === 0 ? 'Select dates to book desks (admin — no limit)' : `${selectedDates.length} date${selectedDates.length > 1 ? 's' : ''} selected`;
    } else {
        const maxDays = currentUser.maxBookingDays || 2;
        label.textContent = selectedDates.length === 0
            ? `Select up to ${maxDays} day${maxDays > 1 ? 's' : ''} to book a desk`
            : `${selectedDates.length}/${maxDays} day${selectedDates.length > 1 ? 's' : ''} selected`;
    }
}

function goToFloorWithDates() {
    switchView('floor');
}

// ===== MY BOOKINGS =====
function renderMyBookings() {
    const el = document.getElementById('mybookings-list');
    const bookings = BookingAPI.getBookingsForUser(currentUser.id);

    // Filter to upcoming
    const todayStr = formatDateObj(new Date());
    const upcoming = bookings.filter(b => b.dateStr >= todayStr);
    const past = bookings.filter(b => b.dateStr < todayStr);

    if (bookings.length === 0) {
        el.innerHTML = `<div class="no-bookings">
      <div style="font-size:2.5rem;margin-bottom:12px;">📋</div>
      <div style="font-weight:600;margin-bottom:6px;">No bookings yet</div>
      <div>Select dates from the Calendar and book a desk on the Floor Map</div>
    </div>`;
        return;
    }

    function renderGroup(title, items) {
        if (items.length === 0) return '';
        let html = `<h4 style="font-size:0.82rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin:16px 0 8px;">${title}</h4>`;
        items.forEach(b => {
            const floor = FloorAPI.getAll().find(f => f.id === b.floorId);
            const desks = DeskAPI.getForFloor(b.floorId);
            const desk = desks.find(d => d.id === b.deskId);
            const isPast = b.dateStr < todayStr;

            html += `<div class="booking-card">
        <div class="booking-card-icon" style="${isPast ? 'opacity:0.5;' : ''}">${desk ? desk.label : '?'}</div>
        <div class="booking-card-info">
          <div class="booking-card-title">${floor ? floor.name : b.floorId} — Desk ${desk ? desk.label : b.deskId}</div>
          <div class="booking-card-sub">${formatDate(b.dateStr)}</div>
        </div>
        ${!isPast ? `<button class="btn-danger btn-sm" onclick="cancelBooking('${b.floorId}','${b.deskId}','${b.dateStr}')">Cancel</button>` : '<span style="font-size:0.78rem;color:var(--text-muted);">Past</span>'}
      </div>`;
        });
        return html;
    }

    el.innerHTML = renderGroup('Upcoming', upcoming) + renderGroup('Past', past);
}

function cancelBooking(floorId, deskId, dateStr) {
    BookingAPI.unbook(floorId, deskId, dateStr);
    playReleaseSound();
    renderMyBookings();
    renderFloor();
    showToast('Booking cancelled', 'info');
}

// ===== ADMIN PANEL =====
function renderAdmin() {
    renderAdminUsers();
    renderAdminBookings();
    renderAdminFloors();
}

function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-panel').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
    document.getElementById(`atab-${tab}`).classList.add('active');
    document.getElementById(`apanel-${tab}`).classList.remove('hidden');
    document.getElementById(`apanel-${tab}`).classList.add('active');
}

function renderAdminUsers() {
    const users = UserAPI.getAll();
    const wrap = document.getElementById('users-table-wrap');

    let html = `<div class="data-table-wrap"><table class="data-table">
    <thead><tr>
      <th>Name</th><th>Username</th><th>Role</th><th>Max Days</th><th>Bookings</th><th>Actions</th>
    </tr></thead><tbody>`;

    users.forEach(u => {
        const bookingCount = BookingAPI.getBookingsForUser(u.id).length;
        const isSelf = u.id === currentUser.id;
        const maxDays = u.role === 'admin' ? '∞' : (u.maxBookingDays || 2);
        html += `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="user-avatar role-${u.role}" style="width:28px;height:28px;font-size:0.72rem;">${u.initials}</div>
          ${u.name}${isSelf ? ' <span style="font-size:0.75rem;color:var(--text-muted)">(you)</span>' : ''}
        </div>
      </td>
      <td style="color:var(--text-secondary)">${u.username}</td>
      <td><span class="role-badge ${u.role}">${u.role}</span></td>
      <td style="text-align:center;font-size:0.88rem;">${maxDays}</td>
      <td>${bookingCount}</td>
      <td>
        <div class="table-actions">
          <button class="btn-ghost btn-sm" onclick="openUserModal('${u.id}')">Edit</button>
          ${!isSelf ? `<button class="btn-danger btn-sm" onclick="deleteUser('${u.id}')">Delete</button>` : ''}
        </div>
      </td>
    </tr>`;
    });

    html += `</tbody></table></div>`;
    wrap.innerHTML = html;
}

function renderAdminBookings() {
    const bookings = BookingAPI.getAll_List();
    const todayStr = formatDateObj(new Date());
    const el = document.getElementById('all-bookings-list');

    if (bookings.length === 0) {
        el.innerHTML = `<div class="no-bookings">No bookings in the system</div>`;
        return;
    }

    const upcoming = bookings.filter(b => b.dateStr >= todayStr);
    const past = bookings.filter(b => b.dateStr < todayStr);

    function renderGroup(title, items) {
        if (items.length === 0) return '';
        let html = `<h4 style="font-size:0.82rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin:16px 0 8px;">${title}</h4>`;
        items.forEach(b => {
            const user = UserAPI.getById(b.userId);
            const floor = FloorAPI.getAll().find(f => f.id === b.floorId);
            const desks = DeskAPI.getForFloor(b.floorId);
            const desk = desks.find(d => d.id === b.deskId);

            html += `<div class="booking-card">
        <div class="booking-card-icon user-avatar role-${user ? user.role : 'user'}" style="width:40px;height:40px;font-size:0.82rem;">
          ${user ? user.initials : '?'}
        </div>
        <div class="booking-card-info">
          <div class="booking-card-title">${user ? user.name : 'Unknown'} — ${floor ? floor.name : b.floorId}, Desk ${desk ? desk.label : b.deskId}</div>
          <div class="booking-card-sub">${formatDate(b.dateStr)}</div>
        </div>
        <button class="btn-danger btn-sm" onclick="adminCancelBooking('${b.floorId}','${b.deskId}','${b.dateStr}')">Remove</button>
      </div>`;
        });
        return html;
    }

    el.innerHTML = renderGroup('Upcoming', upcoming) + renderGroup('Past', past);
}

function adminCancelBooking(floorId, deskId, dateStr) {
    BookingAPI.unbook(floorId, deskId, dateStr);
    playReleaseSound();
    renderAdminBookings();
    if (currentView === 'floor') renderFloor();
    showToast('Booking removed', 'info');
}

function renderAdminFloors() {
    const floors = FloorAPI.getAll();
    const el = document.getElementById('floor-config-form');

    let html = `
    <div class="admin-panel-header" style="margin-bottom:16px;">
      <h4 style="font-size:0.9rem;color:var(--text-secondary);font-weight:500;">Manage Floors</h4>
      <button class="btn-primary btn-sm" onclick="openAddFloorModal()">+ Add Floor</button>
    </div>
    <div style="margin-bottom:20px;font-size:0.83rem;color:var(--text-muted);">Rename floors, rooms, and zones below.</div>`;

    floors.forEach(f => {
        const deskCount = DeskAPI.getForFloor(f.id).length;
        const layout = FloorAPI.getLayout(f.id);
        html += `
        <details class="floor-config-section" open>
          <summary class="floor-config-summary">
            <span style="font-weight:600;">${f.name}</span>
            <span class="floor-config-meta">${deskCount} desk${deskCount !== 1 ? 's' : ''}</span>
          </summary>
          <div class="floor-config-body">
            <div class="floor-config-group">
              <label>Floor Name</label>
              <div class="floor-config-row">
                <input type="text" value="${f.name}" id="floor-name-${f.id}" placeholder="Floor name" />
                <button class="btn-primary btn-sm" onclick="saveFloorName('${f.id}')">Save</button>
                ${floors.length > 1 ? `<button class="btn-danger btn-sm" onclick="confirmDeleteFloor('${f.id}', '${f.name}')">Delete Floor</button>` : ''}
              </div>
            </div>`;

        if (layout.rooms && layout.rooms.length > 0) {
            html += `<div class="floor-config-group"><label>Rooms</label>`;
            layout.rooms.forEach(r => {
                html += `<div class="floor-config-row">
              <input type="text" value="${r.label}" id="room-label-${f.id}-${r.id}" placeholder="Room name" />
              <button class="btn-ghost btn-sm" onclick="saveRoomLabel('${f.id}','${r.id}')">Save</button>
            </div>`;
            });
            html += `</div>`;
        }

        if (layout.zones && layout.zones.length > 0) {
            html += `<div class="floor-config-group"><label>Open Zones</label>`;
            layout.zones.forEach(z => {
                html += `<div class="floor-config-row">
              <input type="text" value="${z.label}" id="zone-label-${f.id}-${z.id}" placeholder="Zone name" />
              <button class="btn-ghost btn-sm" onclick="saveZoneLabel('${f.id}','${z.id}')">Save</button>
            </div>`;
            });
            html += `</div>`;
        }

        html += `</div></details>`;
    });
    el.innerHTML = html;
}

function saveRoomLabel(floorId, roomId) {
    const input = document.getElementById(`room-label-${floorId}-${roomId}`);
    if (!input) return;
    FloorAPI.updateRoomLabel(floorId, roomId, input.value.trim());
    renderFloor();
    showToast('Room renamed', 'success');
}

function saveZoneLabel(floorId, zoneId) {
    const input = document.getElementById(`zone-label-${floorId}-${zoneId}`);
    if (!input) return;
    FloorAPI.updateZoneLabel(floorId, zoneId, input.value.trim());
    renderFloor();
    showToast('Zone renamed', 'success');
}

function openRenameDeskModal(floorId, deskId, currentLabel) {
    document.getElementById('modal-title').textContent = 'Rename Desk';
    document.getElementById('modal-body').innerHTML = `
    <div class="field-group">
      <label>Desk Name / Label</label>
      <input type="text" id="modal-desk-label" value="${currentLabel}" placeholder="e.g. D1 or Reception" maxlength="10" />
      <div style="font-size:0.8rem;color:var(--text-muted);margin-top:5px;">Short labels work best (max 10 characters)</div>
    </div>`;
    const footerEl = document.getElementById('modal-footer');
    footerEl.innerHTML = '';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeModalDirect);
    footerEl.appendChild(cancelBtn);
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-primary';
    saveBtn.textContent = 'Rename';
    saveBtn.addEventListener('click', () => {
        const newLabel = document.getElementById('modal-desk-label').value.trim();
        if (!newLabel) { showToast('Label cannot be empty', 'error'); return; }
        DeskAPI.renameDesk(floorId, deskId, newLabel);
        closeModalDirect();
        renderFloor();
        showToast(`Desk renamed to "${newLabel}"`, 'success');
    });
    footerEl.appendChild(saveBtn);
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function openAddFloorModal() {
    document.getElementById('modal-title').textContent = 'Add New Floor';
    document.getElementById('modal-body').innerHTML = `
    <div class="field-group">
      <label>Floor Name</label>
      <input type="text" id="modal-floor-name" placeholder="e.g. Floor 4" />
    </div>
    <div style="font-size:0.82rem;color:var(--text-muted);margin-top:6px;">
      The new floor will start empty. Use the floor map to reposition desks after adding them via drag mode.
    </div>`;

    const footerEl = document.getElementById('modal-footer');
    footerEl.innerHTML = '';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeModalDirect);
    footerEl.appendChild(cancelBtn);
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-primary';
    saveBtn.textContent = 'Create Floor';
    saveBtn.addEventListener('click', () => {
        const name = document.getElementById('modal-floor-name').value.trim();
        if (!name) { showToast('Please enter a floor name', 'error'); return; }
        FloorAPI.add(name);
        closeModalDirect();
        buildFloorTabs();
        renderAdminFloors();
        showToast(`Floor "${name}" created`, 'success');
    });
    footerEl.appendChild(saveBtn);
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function confirmDeleteFloor(floorId, floorName) {
    document.getElementById('modal-title').textContent = 'Delete Floor';
    document.getElementById('modal-body').innerHTML = `
    <p>Delete <strong>${floorName}</strong>?</p>
    <p style="font-size:0.85rem;color:var(--text-muted);margin-top:8px;">This will permanently remove all desks and bookings on this floor.</p>`;

    const footerEl = document.getElementById('modal-footer');
    footerEl.innerHTML = '';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeModalDirect);
    footerEl.appendChild(cancelBtn);
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-danger';
    delBtn.textContent = 'Delete Floor';
    delBtn.addEventListener('click', () => {
        const ok = FloorAPI.delete(floorId);
        closeModalDirect();
        if (!ok) { showToast('Cannot delete the last floor', 'error'); return; }
        // If we were on the deleted floor, switch to first available
        const remaining = FloorAPI.getAll();
        if (currentFloorId === floorId) {
            currentFloorId = remaining[0].id;
        }
        buildFloorTabs();
        renderAdminFloors();
        renderFloor();
        showToast(`Floor "${floorName}" deleted`, 'info');
    });
    footerEl.appendChild(delBtn);
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function saveFloorName(floorId) {
    const input = document.getElementById(`floor-name-${floorId}`);
    if (!input) return;
    FloorAPI.update(floorId, { name: input.value.trim() });
    buildFloorTabs();
    showToast('Floor name updated', 'success');
}

// ===== USER MODAL =====
function openUserModal(userId = null) {
    const isEdit = !!userId;
    const user = isEdit ? UserAPI.getById(userId) : null;

    document.getElementById('modal-title').textContent = isEdit ? 'Edit User' : 'Add New User';

    document.getElementById('modal-body').innerHTML = `
    <div class="field-group">
      <label>Full Name</label>
      <input type="text" id="modal-name" value="${user ? user.name : ''}" placeholder="Jane Doe" required />
    </div>
    <div class="field-group">
      <label>Username</label>
      <input type="text" id="modal-username" value="${user ? user.username : ''}" placeholder="janedoe" ${isEdit ? '' : 'required'} />
    </div>
    <div class="field-group">
      <label>${isEdit ? 'New Password (leave blank to keep)' : 'Password'}</label>
      <input type="password" id="modal-password" placeholder="${isEdit ? 'Leave blank to keep current' : 'Enter password'}" ${isEdit ? '' : 'required'} />
    </div>
    <div class="field-group">
      <label>Role</label>
      <select id="modal-role">
        <option value="user" ${!user || user.role === 'user' ? 'selected' : ''}>User</option>
        <option value="admin" ${user && user.role === 'admin' ? 'selected' : ''}>Admin</option>
      </select>
    </div>
    <div class="field-group">
      <label>Max Booking Days <span style="font-size:0.78rem;color:var(--text-muted);font-weight:400;">(days user can select at once; admins default 365)</span></label>
      <input type="number" id="modal-max-days" value="${user ? (user.maxBookingDays || 2) : 2}" min="1" max="365" />
    </div>
  `;

    document.getElementById('modal-footer').innerHTML = `
    <button class="btn-secondary" onclick="closeModalDirect()">Cancel</button>
    <button class="btn-primary" onclick="saveUser('${userId || ''}')">
      ${isEdit ? 'Save Changes' : 'Create User'}
    </button>
  `;

    document.getElementById('modal-overlay').classList.remove('hidden');
}

function saveUser(userId) {
    const name = document.getElementById('modal-name').value.trim();
    const username = document.getElementById('modal-username').value.trim();
    const password = document.getElementById('modal-password').value;
    const role = document.getElementById('modal-role').value;

    if (!name) { showToast('Name is required', 'error'); return; }

    if (userId) {
        // Edit
        const updates = { name, role };
        if (username) updates.username = username;
        if (password) updates.password = password;
        const maxDaysInput = document.getElementById('modal-max-days');
        if (maxDaysInput) updates.maxBookingDays = Math.max(1, parseInt(maxDaysInput.value) || 2);
        UserAPI.update(userId, updates);
        showToast('User updated', 'success');
    } else {
        // Add
        if (!username || !password) { showToast('Username and password are required', 'error'); return; }
        if (UserAPI.getByUsername(username)) { showToast('Username already exists', 'error'); return; }
        const maxDaysInput = document.getElementById('modal-max-days');
        const maxBookingDays = maxDaysInput ? Math.max(1, parseInt(maxDaysInput.value) || 2) : 2;
        UserAPI.add({ username, password, name, role, maxBookingDays });
        showToast('User created', 'success');
    }

    closeModalDirect();
    renderAdminUsers();
}

function deleteUser(userId) {
    if (!confirm('Delete this user and all their bookings?')) return;
    UserAPI.delete(userId);
    renderAdminUsers();
    renderAdminBookings();
    renderFloor();
    showToast('User deleted', 'info');
}

// ===== GENERIC MODAL =====
function closeModal(e) {
    if (e.target === document.getElementById('modal-overlay')) {
        closeModalDirect();
    }
}
function closeModalDirect() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

// ===== TOAST =====
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ===== DATE UTILITIES =====
function formatDateObj(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ===== FLOOR DESIGNER =====
// Admin-only drag-and-drop floor layout editor.
// Depends on: data.js (FloorAPI, DeskAPI), app.js (currentFloorId, showToast)

const Designer = {
    CANVAS_W: 1100,
    CANVAS_H: 760,
    MAX_HISTORY: 30,

    TYPES: {
        area: { w: 220, h: 160, label: 'Area', resizable: true },
        desk: { w: 46, h: 54, label: 'D', resizable: false },
        fixeddesk: { w: 46, h: 54, label: 'F', resizable: false },
        wall: { w: 140, h: 22, label: '', resizable: true },
        box: { w: 90, h: 60, label: 'Box', resizable: true },
    },

    state: {
        floorId: null,
        editMode: false,          // locked until user clicks Edit
        objects: [],
        selectedId: null,
        selectedIds: [],
        _drag: null,
        _resize: null,
        _selBox: null,
        _clipboard: [],           // deep-cloned objects ready to paste
        _history: [],             // undo stack of objects snapshots
    },

    // ---- Lifecycle ----

    init(floorId) {
        this.state.floorId = floorId;
        this.state.selectedId = null;
        this.state.selectedIds = [];
        this.state._drag = null;
        this.state._resize = null;
        this.state._selBox = null;
        this.loadFromData();
        this.renderFloorTabs();
        this.renderToolbar();
        this.render();
        this.renderProperties();
    },

    // ---- Data I/O ----

    loadFromData() {
        const fid = this.state.floorId;
        const layout = FloorAPI.getLayout(fid);
        const desks = DeskAPI.getForFloor(fid);
        const objs = [];
        (layout.rooms || []).forEach(r =>
            objs.push({ id: r.id, type: 'area', x: r.x, y: r.y, w: r.w, h: r.h, label: r.label || '' }));
        (layout.zones || []).forEach(z =>
            objs.push({ id: z.id, type: 'area', x: z.x, y: z.y, w: z.w, h: z.h, label: z.label || '' }));
        desks.forEach(d =>
            objs.push({ id: d.id, type: d.fixed ? 'fixeddesk' : 'desk', x: d.x, y: d.y, w: 46, h: 54, label: d.label || 'D' }));
        (layout.walls || []).forEach(w =>
            objs.push({ id: w.id, type: 'wall', x: w.x, y: w.y, w: w.w, h: w.h, label: '' }));
        (layout.boxes || []).forEach(b =>
            objs.push({ id: b.id, type: 'box', x: b.x, y: b.y, w: b.w, h: b.h, label: b.label || '' }));
        this.state.objects = objs;
    },

    saveToData() {
        const fid = this.state.floorId;
        const rooms = [], walls = [], boxes = [], desks = [];
        this.state.objects.forEach(o => {
            const base = { id: o.id, x: Math.round(o.x), y: Math.round(o.y) };
            if (o.type === 'area')
                rooms.push({ ...base, w: Math.round(o.w), h: Math.round(o.h), label: o.label || '' });
            else if (o.type === 'desk')
                desks.push({ ...base, label: o.label || 'D', fixed: false });
            else if (o.type === 'fixeddesk')
                desks.push({ ...base, label: o.label || 'F', fixed: true });
            else if (o.type === 'wall')
                walls.push({ ...base, w: Math.round(o.w), h: Math.round(o.h) });
            else if (o.type === 'box')
                boxes.push({ ...base, w: Math.round(o.w), h: Math.round(o.h), label: o.label || '' });
        });
        FloorAPI.saveLayout(fid, { rooms, zones: [], walls, boxes });
        const allDesks = DeskAPI.getAll();
        allDesks[fid] = desks;
        DeskAPI.save(allDesks);
        showToast('Floor saved \u2713', 'success');
    },

    // ---- Toolbar ----

    renderToolbar() {
        const wrap = document.getElementById('designer-toolbar-actions');
        if (!wrap) return;
        const em = this.state.editMode;
        const hasHistory = this.state._history.length > 0;
        const hasClipboard = this.state._clipboard.length > 0;
        wrap.innerHTML = `
            <button class="ds-tb-btn ${em ? 'ds-tb-edit' : 'ds-tb-locked'}" onclick="Designer.toggleEditMode()" title="${em ? 'Lock (disable editing)' : 'Unlock to edit'}">
                ${em
                ? '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6a3 3 0 0 1 6 0"/></svg> Editing'
                : '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/></svg> Edit'}
            </button>
            <div class="ds-tb-sep"></div>
            <button class="ds-tb-btn" onclick="Designer.undo()" title="Undo (Ctrl+Z)" ${!hasHistory || !em ? 'disabled' : ''}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8H13a5 5 0 0 1 0 10H5"/><polyline points="8 4 4 8 8 12"/></svg>
                Undo
            </button>
            <button class="ds-tb-btn" onclick="Designer.copy()" title="Copy (Ctrl+C)" ${!em ? 'disabled' : ''}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="7" width="10" height="12" rx="1.5"/><path d="M13 7V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>
                Copy
            </button>
            <button class="ds-tb-btn" onclick="Designer.paste()" title="Paste (Ctrl+V)" ${!hasClipboard || !em ? 'disabled' : ''}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="5" width="12" height="13" rx="1.5"/><path d="M8 5V3.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V5"/></svg>
                Paste
            </button>
            <div class="ds-tb-sep"></div>
            <button class="ds-tb-btn ds-add-floor-btn" onclick="Designer.createFloor()" title="Create a new floor" ${!em ? 'disabled' : ''}>+ Add Floor</button>
            <button class="ds-tb-btn ds-del-floor-btn" onclick="Designer.deleteFloor()" title="Delete this floor" ${!em ? 'disabled' : ''}>&#128465; Delete Floor</button>
            <button class="ds-tb-btn ds-save-btn" onclick="Designer.saveToData()" title="Save floor layout">&#128190; Save</button>
        `;
    },

    toggleEditMode() {
        this.state.editMode = !this.state.editMode;
        if (!this.state.editMode) {
            this.state.selectedIds = [];
            this.state.selectedId = null;
        }
        this.renderToolbar();
        this.renderProperties();
        // setupPalette() clones the canvas (strips old listeners) — MUST run before render()
        // so that render() adds fresh elements WITH listeners to the already-cloned canvas.
        this.setupPalette();
        this.render();
        showToast(this.state.editMode ? '\u270f\ufe0f Edit mode \u2014 make your changes' : '\uD83D\uDD12 Locked \u2014 changes saved', 'info');
    },

    // ---- Floor Management ----

    renderFloorTabs() {
        const el = document.getElementById('designer-floor-tabs');
        if (!el) return;
        el.innerHTML = FloorAPI.getAll().map(f =>
            `<button class="floor-tab-btn${f.id === this.state.floorId ? ' active' : ''}"
                onclick="Designer.switchFloor('${f.id}')">${f.name}</button>`
        ).join('');
    },

    switchFloor(fid) {
        this.state.floorId = fid;
        currentFloorId = fid;
        this.state.editMode = false;
        this.init(fid);
    },

    createFloor() {
        if (!this.state.editMode) return;
        const name = prompt('New floor name:', 'Floor ' + (FloorAPI.getAll().length + 1));
        if (!name || !name.trim()) return;
        const newFloor = FloorAPI.add(name.trim());
        this.switchFloor(newFloor.id);
        if (typeof buildFloorTabs === 'function') buildFloorTabs();
        showToast(`Floor "${newFloor.name}" created`, 'success');
    },

    deleteFloor() {
        if (!this.state.editMode) return;
        const floors = FloorAPI.getAll();
        if (floors.length <= 1) { showToast('Cannot delete the last floor', 'error'); return; }
        const floor = floors.find(f => f.id === this.state.floorId);
        if (!confirm(`Delete "${floor ? floor.name : 'this floor'}"? All desks and bookings will be lost.`)) return;
        const ok = FloorAPI.delete(this.state.floorId);
        if (ok) {
            if (typeof buildFloorTabs === 'function') buildFloorTabs();
            this.switchFloor(FloorAPI.getAll()[0].id);
            showToast('Floor deleted', 'info');
        }
    },

    // ---- Undo History ----

    _pushHistory() {
        this.state._history.push(JSON.parse(JSON.stringify(this.state.objects)));
        if (this.state._history.length > this.MAX_HISTORY) this.state._history.shift();
        this.renderToolbar();
    },

    undo() {
        if (!this.state.editMode || this.state._history.length === 0) return;
        this.state.objects = this.state._history.pop();
        this.state.selectedIds = [];
        this.state.selectedId = null;
        this.renderToolbar();
        this.render();
        this.renderProperties();
        showToast('Undone', 'info');
    },

    // ---- Clipboard ----

    copy() {
        if (!this.state.editMode) return;
        const objs = this.state.objects.filter(o => this.state.selectedIds.includes(o.id));
        if (objs.length === 0) return;
        this.state._clipboard = JSON.parse(JSON.stringify(objs));
        this.renderToolbar();
        showToast(`Copied ${objs.length} object${objs.length > 1 ? 's' : ''}`, 'info');
    },

    paste() {
        if (!this.state.editMode || this.state._clipboard.length === 0) return;
        this._pushHistory();
        const offset = 24;
        const newIds = [];
        this.state._clipboard.forEach(src => {
            const obj = {
                ...src, id: `${src.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                x: Math.min(this.CANVAS_W - src.w, src.x + offset),
                y: Math.min(this.CANVAS_H - src.h, src.y + offset)
            };
            this.state.objects.push(obj);
            newIds.push(obj.id);
        });
        // Update clipboard to paste FROM the pasted positions next time
        this.state._clipboard = this.state.objects.filter(o => newIds.includes(o.id)).map(o => JSON.parse(JSON.stringify(o)));
        this.render();
        this.selectMultiple(newIds);
        showToast(`Pasted ${newIds.length} object${newIds.length > 1 ? 's' : ''}`, 'success');
    },

    // ---- Canvas Render ----

    render() {
        const canvas = document.getElementById('designer-canvas');
        if (!canvas) return;
        canvas.querySelectorAll('.dsobj').forEach(el => el.remove());
        canvas.classList.toggle('ds-canvas-locked', !this.state.editMode);
        const order = ['area', 'wall', 'box', 'desk', 'fixeddesk'];
        [...this.state.objects]
            .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
            .forEach(obj => canvas.appendChild(this.createEl(obj)));
    },

    createEl(obj) {
        const isSelected = this.state.selectedIds.includes(obj.id);
        const em = this.state.editMode;
        const isFixed = obj.type === 'fixeddesk';
        const isDesk = obj.type === 'desk' || isFixed;
        const el = document.createElement('div');
        el.id = `dsobj-${obj.id}`;
        el.className = `dsobj dsobj-${isFixed ? 'desk dsobj-fixeddesk' : obj.type}${isSelected ? ' dsobj-selected' : ''}`;
        el.style.cssText = `left:${obj.x}px;top:${obj.y}px;width:${obj.w}px;height:${obj.h}px;`;

        // Label
        if (obj.type !== 'wall') {
            const lbl = document.createElement('span');
            lbl.className = 'dsobj-label';
            lbl.textContent = obj.label || '';
            el.appendChild(lbl);
        }

        // Desk / Fixed-desk icon
        if (isDesk) {
            const icon = document.createElement('div');
            icon.className = 'dsobj-desk-icon';
            if (isFixed) {
                icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="14" width="20" height="4" rx="1" stroke-opacity="0.7"/>
                    <circle cx="12" cy="6" r="3"/>
                    <path d="M7 14c0-3 2-5 5-5s5 2 5 5"/>
                    <text x="12" y="14" text-anchor="middle" font-size="6" fill="#e2e8f0" stroke="none" font-family="sans-serif">&#x1F512;</text>
                </svg>`;
            } else {
                icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="14" width="20" height="4" rx="1" stroke-opacity="0.7"/>
                    <circle cx="12" cy="6" r="3"/>
                    <path d="M7 14c0-3 2-5 5-5s5 2 5 5"/>
                </svg>`;
            }
            el.appendChild(icon);
        }

        // Box padlock icon in designer
        if (obj.type === 'box') {
            const lockIcon = document.createElement('div');
            lockIcon.className = 'box-lock-icon-ds';
            lockIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
            el.appendChild(lockIcon);
        }

        // Resize handles — only in edit mode, only for resizable types
        if (em && this.TYPES[obj.type]?.resizable) {
            ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(dir => {
                const h = document.createElement('div');
                h.className = `dsobj-handle dsobj-handle-${dir}`;
                h.addEventListener('mousedown', e => {
                    e.stopPropagation(); e.preventDefault();
                    this.selectSingle(obj.id);
                    this.startResize(e, obj.id, dir);
                });
                el.appendChild(h);
            });
        }

        // Drag & select — only in edit mode
        if (em) {
            el.style.cursor = 'move';
            el.addEventListener('mousedown', e => {
                if (e.target.classList.contains('dsobj-handle')) return;
                e.preventDefault(); e.stopPropagation();
                if (e.ctrlKey || e.metaKey || e.shiftKey) {
                    this.toggleSelect(obj.id);
                    return; // Ctrl+click = toggle only, no drag
                }
                if (!this.state.selectedIds.includes(obj.id)) this.selectSingle(obj.id);
                this.startDrag(e, obj.id);
            });
            el.addEventListener('dblclick', e => {
                e.stopPropagation();
                if (obj.type === 'wall') return;
                const input = document.getElementById('ds-label-input');
                if (input) { input.focus(); input.select(); }
            });
        }

        return el;
    },

    // ---- Selection ----

    selectSingle(id) {
        this.state.selectedIds = id ? [id] : [];
        this.state.selectedId = id || null;
        this._refreshSelectionStyles();
        this.renderProperties();
    },

    toggleSelect(id) {
        if (this.state.selectedIds.includes(id)) {
            this.state.selectedIds = this.state.selectedIds.filter(x => x !== id);
            this.state.selectedId = this.state.selectedIds[this.state.selectedIds.length - 1] || null;
        } else {
            this.state.selectedIds.push(id);
            this.state.selectedId = id;
        }
        this._refreshSelectionStyles();
        this.renderProperties();
    },

    selectMultiple(ids) {
        this.state.selectedIds = ids;
        this.state.selectedId = ids[ids.length - 1] || null;
        this._refreshSelectionStyles();
        this.renderProperties();
    },

    deselectAll() {
        this.state.selectedIds = [];
        this.state.selectedId = null;
        this._refreshSelectionStyles();
        this.renderProperties();
    },

    _refreshSelectionStyles() {
        document.querySelectorAll('.dsobj').forEach(el => {
            const id = el.id.replace('dsobj-', '');
            el.classList.toggle('dsobj-selected', this.state.selectedIds.includes(id));
        });
    },

    // ---- Properties Panel ----

    renderProperties() {
        const panel = document.getElementById('designer-properties');
        if (!panel) return;
        const { selectedIds, editMode } = this.state;

        if (!editMode) {
            panel.innerHTML = `<p class="ds-hint">Click <strong>Edit</strong> in the toolbar to start editing.</p>`;
            return;
        }
        if (selectedIds.length === 0) {
            panel.innerHTML = `<p class="ds-hint">Click an object to select it,<br>or drag from the palette.</p>`;
            return;
        }
        if (selectedIds.length > 1) {
            const n = selectedIds.length;
            panel.innerHTML = `
              <div class="ds-prop-row">
                <span class="ds-prop-label">Selected</span>
                <span class="ds-prop-val">${n} objects</span>
              </div>
              <div class="ds-align-section">
                <div class="ds-align-title">Align</div>
                <div class="ds-align-btns">
                  <button class="ds-align-btn" title="Center horizontally (same Y)" onclick="Designer.alignCenterH()">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="2" y1="10" x2="18" y2="10"/><rect x="4" y="6" width="4" height="8" rx="1"/><rect x="12" y="4" width="4" height="12" rx="1"/></svg>
                    <span>H Center</span>
                  </button>
                  <button class="ds-align-btn" title="Center vertically (same X)" onclick="Designer.alignCenterV()">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="10" y1="2" x2="10" y2="18"/><rect x="6" y="4" width="8" height="4" rx="1"/><rect x="4" y="12" width="12" height="4" rx="1"/></svg>
                    <span>V Center</span>
                  </button>
                </div>
                <div class="ds-align-title" style="margin-top:8px">Distribute</div>
                <div class="ds-align-btns">
                  <button class="ds-align-btn" title="Equal spacing horizontally" onclick="Designer.distributeH()">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="1" y1="4" x2="1" y2="16"/><line x1="19" y1="4" x2="19" y2="16"/><rect x="4" y="7" width="4" height="6" rx="1"/><rect x="12" y="7" width="4" height="6" rx="1"/></svg>
                    <span>H Space</span>
                  </button>
                  <button class="ds-align-btn" title="Equal spacing vertically" onclick="Designer.distributeV()">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="4" y1="1" x2="16" y2="1"/><line x1="4" y1="19" x2="16" y2="19"/><rect x="7" y="4" width="6" height="4" rx="1"/><rect x="7" y="12" width="6" height="4" rx="1"/></svg>
                    <span>V Space</span>
                  </button>
                </div>
              </div>
              <div class="ds-prop-actions" style="margin-top:8px">
                <button class="btn-danger btn-sm" onclick="Designer.deleteSelected()">&#128465; Delete All</button>
              </div>`;
            return;
        }

        const obj = this.state.objects.find(o => o.id === this.state.selectedId);
        if (!obj) { panel.innerHTML = ''; return; }
        const isFixed = obj.type === 'fixeddesk';
        const isDesk = obj.type === 'desk' || isFixed;
        const names = { area: 'Area', desk: 'Desk', fixeddesk: 'Fixed Desk', wall: 'Wall', box: 'Box' };
        panel.innerHTML = `
            <div class="ds-prop-row">
                <span class="ds-prop-label">Type</span>
                <span class="ds-prop-val ds-type-badge ds-type-${isFixed ? 'fixeddesk' : obj.type}">${names[obj.type]}</span>
            </div>
            ${obj.type !== 'wall' ? `
            <div class="ds-prop-row">
                <span class="ds-prop-label">Label</span>
                <input type="text" id="ds-label-input" class="ds-label-input"
                    value="${obj.label || ''}" maxlength="30" placeholder="Name\u2026" />
            </div>` : ''}
            ${isDesk ? `
            <div class="ds-prop-row">
                <span class="ds-prop-label">Bookable</span>
                <label class="ds-toggle-wrap">
                    <input type="checkbox" id="ds-fixed-toggle" ${isFixed ? '' : 'checked'}
                        onchange="Designer.toggleFixed()" />
                    <span class="ds-toggle-label">${isFixed ? 'Fixed (unbookable)' : 'Yes'}</span>
                </label>
            </div>` : ''}
            <div class="ds-prop-row">
                <span class="ds-prop-label">X, Y</span>
                <span class="ds-prop-val" id="ds-pos-val">${Math.round(obj.x)}, ${Math.round(obj.y)}</span>
            </div>
            ${obj.type !== 'desk' && obj.type !== 'fixeddesk' ? `
            <div class="ds-prop-row">
                <span class="ds-prop-label">W \xd7 H</span>
                <span class="ds-prop-val" id="ds-size-val">${Math.round(obj.w)} \xd7 ${Math.round(obj.h)}</span>
            </div>` : ''}
            <div class="ds-prop-actions">
                ${obj.type !== 'wall' ? `<button class="btn-ghost btn-sm" onclick="Designer.applyLabel()">Apply</button>` : ''}
                <button class="btn-danger btn-sm" onclick="Designer.deleteSelected()">&#128465; Delete</button>
            </div>`;
        const input = document.getElementById('ds-label-input');
        if (input) {
            input.addEventListener('input', () => this.applyLabel());
            input.addEventListener('keydown', e => { if (e.key === 'Enter') this.applyLabel(); });
        }
    },

    // ---- Editing Ops ----

    applyLabel() {
        const input = document.getElementById('ds-label-input');
        if (!input || !this.state.selectedId) return;
        const obj = this.state.objects.find(o => o.id === this.state.selectedId);
        if (!obj) return;
        obj.label = input.value;
        const lbl = document.querySelector(`#dsobj-${obj.id} .dsobj-label`);
        if (lbl) lbl.textContent = obj.label;
    },

    toggleFixed() {
        const obj = this.state.objects.find(o => o.id === this.state.selectedId);
        if (!obj || (obj.type !== 'desk' && obj.type !== 'fixeddesk')) return;
        this._pushHistory();
        obj.type = obj.type === 'fixeddesk' ? 'desk' : 'fixeddesk';
        this.render();
        this.selectSingle(obj.id);
    },

    deleteSelected() {
        if (this.state.selectedIds.length === 0) return;
        this._pushHistory();
        const del = new Set(this.state.selectedIds);
        this.state.objects = this.state.objects.filter(o => !del.has(o.id));
        this.state.selectedIds = [];
        this.state.selectedId = null;
        this.render();
        this.renderProperties();
    },

    // ---- Alignment & Distribution ----

    _selectedObjs() { return this.state.objects.filter(o => this.state.selectedIds.includes(o.id)); },

    _updateObjEl(obj) {
        const el = document.getElementById(`dsobj-${obj.id}`);
        if (el) el.style.cssText = `left:${obj.x}px;top:${obj.y}px;width:${obj.w}px;height:${obj.h}px;`;
    },

    alignCenterH() {
        const objs = this._selectedObjs(); if (objs.length < 2) return;
        this._pushHistory();
        const avg = objs.reduce((s, o) => s + o.y + o.h / 2, 0) / objs.length;
        objs.forEach(o => { o.y = Math.round(avg - o.h / 2); this._updateObjEl(o); });
        this.renderProperties();
    },

    alignCenterV() {
        const objs = this._selectedObjs(); if (objs.length < 2) return;
        this._pushHistory();
        const avg = objs.reduce((s, o) => s + o.x + o.w / 2, 0) / objs.length;
        objs.forEach(o => { o.x = Math.round(avg - o.w / 2); this._updateObjEl(o); });
        this.renderProperties();
    },

    distributeH() {
        const objs = this._selectedObjs(); if (objs.length < 2) return;
        this._pushHistory();
        objs.sort((a, b) => a.x - b.x);
        const span = (objs[objs.length - 1].x + objs[objs.length - 1].w) - objs[0].x;
        const gap = Math.max(0, (span - objs.reduce((s, o) => s + o.w, 0)) / (objs.length - 1));
        let cur = objs[0].x;
        objs.forEach(o => { o.x = Math.round(cur); this._updateObjEl(o); cur += o.w + gap; });
        this.renderProperties();
    },

    distributeV() {
        const objs = this._selectedObjs(); if (objs.length < 2) return;
        this._pushHistory();
        objs.sort((a, b) => a.y - b.y);
        const span = (objs[objs.length - 1].y + objs[objs.length - 1].h) - objs[0].y;
        const gap = Math.max(0, (span - objs.reduce((s, o) => s + o.h, 0)) / (objs.length - 1));
        let cur = objs[0].y;
        objs.forEach(o => { o.y = Math.round(cur); this._updateObjEl(o); cur += o.h + gap; });
        this.renderProperties();
    },

    // ---- Object Creation ----

    addObject(type, x, y) {
        if (!this.state.editMode) return;
        const info = this.TYPES[type] || { w: 80, h: 60, label: 'New' };
        this._pushHistory();
        const deskN = this.state.objects.filter(o => o.type === 'desk' || o.type === 'fixeddesk').length;
        const label = (type === 'desk') ? `D${deskN + 1}` : (type === 'fixeddesk') ? `F${deskN + 1}` : info.label;
        const obj = {
            id: `${type}_${Date.now()}`, type, label,
            x: Math.max(0, Math.min(this.CANVAS_W - info.w, x - info.w / 2)),
            y: Math.max(0, Math.min(this.CANVAS_H - info.h, y - info.h / 2)),
            w: info.w, h: info.h,
        };
        this.state.objects.push(obj);
        this.render();
        this.selectSingle(obj.id);
    },

    // ---- Drag & Resize ----

    startDrag(e, id) {
        const selectedObjs = this.state.objects.filter(o => this.state.selectedIds.includes(o.id));
        this._pushHistory();
        this.state._drag = {
            id, sx: e.clientX, sy: e.clientY,
            starts: selectedObjs.map(o => ({ id: o.id, ox: o.x, oy: o.y }))
        };
    },

    startResize(e, id, handle) {
        const obj = this.state.objects.find(o => o.id === id);
        if (!obj) return;
        this._pushHistory();
        this.state._resize = { id, handle, sx: e.clientX, sy: e.clientY, ox: obj.x, oy: obj.y, ow: obj.w, oh: obj.h };
    },

    // ---- Rubber-band Selection ----

    startSelBox(e) {
        if (!this.state.editMode) return;
        const canvas = document.getElementById('designer-canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        this.state._selBox = {
            sx: e.clientX - rect.left, sy: e.clientY - rect.top,
            ex: e.clientX - rect.left, ey: e.clientY - rect.top, canvasRect: rect
        };
        let sel = document.getElementById('ds-sel-box');
        if (!sel) { sel = document.createElement('div'); sel.id = 'ds-sel-box'; sel.className = 'ds-sel-box'; canvas.appendChild(sel); }
        sel.style.display = 'block';
        this._updateSelBoxEl();
    },

    _updateSelBoxEl() {
        const s = this.state._selBox; if (!s) return;
        const el = document.getElementById('ds-sel-box'); if (!el) return;
        const x = Math.min(s.sx, s.ex), y = Math.min(s.sy, s.ey), w = Math.abs(s.ex - s.sx), h = Math.abs(s.ey - s.sy);
        el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;display:block;`;
    },

    endSelBox() {
        const s = this.state._selBox; this.state._selBox = null;
        const el = document.getElementById('ds-sel-box'); if (el) el.style.display = 'none';
        if (!s) return;
        const x1 = Math.min(s.sx, s.ex), y1 = Math.min(s.sy, s.ey), x2 = Math.max(s.sx, s.ex), y2 = Math.max(s.sy, s.ey);
        if (x2 - x1 < 4 && y2 - y1 < 4) { this.deselectAll(); return; }
        const hit = this.state.objects.filter(o => o.x < x2 && o.x + o.w > x1 && o.y < y2 && o.y + o.h > y1).map(o => o.id);
        if (hit.length > 0) this.selectMultiple(hit); else this.deselectAll();
    },

    // ---- Mouse Events ----

    onMouseMove(e) {
        if (this.state._drag) {
            const d = this.state._drag, dx = e.clientX - d.sx, dy = e.clientY - d.sy;
            d.starts.forEach(({ id, ox, oy }) => {
                const obj = this.state.objects.find(o => o.id === id); if (!obj) return;
                obj.x = Math.max(0, Math.min(this.CANVAS_W - obj.w, ox + dx));
                obj.y = Math.max(0, Math.min(this.CANVAS_H - obj.h, oy + dy));
                const el = document.getElementById(`dsobj-${id}`);
                if (el) { el.style.left = obj.x + 'px'; el.style.top = obj.y + 'px'; }
            });
            const posEl = document.getElementById('ds-pos-val');
            if (posEl) { const p = this.state.objects.find(o => o.id === d.id); if (p) posEl.textContent = `${Math.round(p.x)}, ${Math.round(p.y)}`; }
        }
        if (this.state._resize) {
            const r = this.state._resize, obj = this.state.objects.find(o => o.id === r.id);
            if (obj) {
                const dx = e.clientX - r.sx, dy = e.clientY - r.sy, MIN = 30;
                let nx = r.ox, ny = r.oy, nw = r.ow, nh = r.oh;
                if (r.handle.includes('e')) nw = Math.max(MIN, r.ow + dx);
                if (r.handle.includes('s')) nh = Math.max(MIN, r.oh + dy);
                if (r.handle.includes('w')) { nw = Math.max(MIN, r.ow - dx); nx = r.ox + r.ow - nw; }
                if (r.handle.includes('n')) { nh = Math.max(MIN, r.oh - dy); ny = r.oy + r.oh - nh; }
                obj.x = nx; obj.y = ny; obj.w = nw; obj.h = nh;
                const el = document.getElementById(`dsobj-${r.id}`);
                if (el) el.style.cssText = `left:${nx}px;top:${ny}px;width:${nw}px;height:${nh}px;`;
                const sz = document.getElementById('ds-size-val'); if (sz) sz.textContent = `${Math.round(nw)}\xd7${Math.round(nh)}`;
            }
        }
        if (this.state._selBox) {
            const canvas = document.getElementById('designer-canvas');
            const rect = canvas ? canvas.getBoundingClientRect() : this.state._selBox.canvasRect;
            this.state._selBox.ex = e.clientX - rect.left; this.state._selBox.ey = e.clientY - rect.top;
            this._updateSelBoxEl();
        }
    },

    onMouseUp() {
        if (this.state._drag || this.state._resize) { this.state._drag = null; this.state._resize = null; this.renderProperties(); }
        if (this.state._selBox) this.endSelBox();
    },

    // ---- Palette & Canvas Events ----

    setupPalette() {
        const em = this.state.editMode;
        document.querySelectorAll('.ds-palette-item').forEach(item => {
            item.style.opacity = em ? '' : '0.4';
            item.style.pointerEvents = em ? '' : 'none';
            // Re-attach dragstart every time (cloneNode trick avoided — just overwrite)
            item.ondragstart = em ? (e => {
                this.state._palType = item.dataset.type;
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', item.dataset.type);
            }) : (e => e.preventDefault());
        });
        const canvas = document.getElementById('designer-canvas');
        if (!canvas) return;
        // Remove old listeners cleanly by replacing with a clone
        const fresh = canvas.cloneNode(true);
        canvas.parentNode.replaceChild(fresh, canvas);

        fresh.addEventListener('dragover', e => { if (em) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
        fresh.addEventListener('drop', e => {
            if (!em) return;
            e.preventDefault();
            const type = e.dataTransfer.getData('text/plain') || this.state._palType;
            if (!type) return;
            const rect = fresh.getBoundingClientRect();
            this.addObject(type, e.clientX - rect.left, e.clientY - rect.top);
        });
        fresh.addEventListener('mousedown', e => {
            if (!em || e.target !== fresh) return;
            e.preventDefault(); this.startSelBox(e);
        });
    },

    // ---- Global Listeners (once) ----

    setupGlobalListeners() {
        document.addEventListener('mousemove', e => this.onMouseMove(e));
        document.addEventListener('mouseup', () => this.onMouseUp());
        document.addEventListener('keydown', e => {
            if (!this.state.editMode) return;
            const tag = document.activeElement?.tagName;
            if (['INPUT', 'TEXTAREA'].includes(tag)) return;
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.state.selectedIds.length > 0) { this.deleteSelected(); return; }
            if ((e.ctrlKey || e.metaKey)) {
                if (e.key === 'a' || e.key === 'A') { e.preventDefault(); this.selectMultiple(this.state.objects.map(o => o.id)); }
                if (e.key === 'c' || e.key === 'C') { e.preventDefault(); this.copy(); }
                if (e.key === 'v' || e.key === 'V') { e.preventDefault(); this.paste(); }
                if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); this.undo(); }
            }
        });
        this._listenersSetup = true;
    },
};

// ===== FLOOR DESIGNER =====
// Admin-only drag-and-drop floor layout editor.
// Depends on: data.js (FloorAPI, DeskAPI), app.js (currentFloorId, showToast)

const Designer = {
    CANVAS_W: 1100,
    CANVAS_H: 760,

    TYPES: {
        area: { w: 220, h: 160, label: 'Area', resizable: true },
        desk: { w: 46, h: 54, label: 'D', resizable: false },
        wall: { w: 140, h: 22, label: '', resizable: true },
        box: { w: 90, h: 60, label: 'Box', resizable: true },
    },

    state: {
        floorId: null,
        objects: [],
        selectedId: null,
        _drag: null,   // { id, sx, sy, ox, oy }
        _resize: null, // { id, handle, sx, sy, ox, oy, ow, oh }
        _palType: null,// type being dragged from palette
    },

    // ---- Lifecycle ----

    init(floorId) {
        this.state.floorId = floorId;
        this.state.selectedId = null;
        this.state._drag = null;
        this.state._resize = null;
        this.loadFromData();
        this.renderFloorTabs();
        this.render();
        this.renderProperties();
    },

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
            objs.push({ id: d.id, type: 'desk', x: d.x, y: d.y, w: 46, h: 54, label: d.label || 'D' }));
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
            if (o.type === 'area') rooms.push({ ...base, w: Math.round(o.w), h: Math.round(o.h), label: o.label || '' });
            else if (o.type === 'desk') desks.push({ ...base, label: o.label || 'D' });
            else if (o.type === 'wall') walls.push({ ...base, w: Math.round(o.w), h: Math.round(o.h) });
            else if (o.type === 'box') boxes.push({ ...base, w: Math.round(o.w), h: Math.round(o.h), label: o.label || '' });
        });
        FloorAPI.saveLayout(fid, { rooms, zones: [], walls, boxes });
        const allDesks = DeskAPI.getAll();
        allDesks[fid] = desks;
        DeskAPI.save(allDesks);
        showToast('Floor saved! \u2713', 'success');
    },

    // ---- UI: Floor Tabs ----

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
        this.init(fid);
    },

    // ---- UI: Canvas Render ----

    render() {
        const canvas = document.getElementById('designer-canvas');
        if (!canvas) return;
        canvas.innerHTML = '';
        // Draw order: areas (back) \u2192 walls \u2192 boxes \u2192 desks (front)
        const order = ['area', 'wall', 'box', 'desk'];
        [...this.state.objects]
            .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
            .forEach(obj => canvas.appendChild(this.createEl(obj)));
    },

    createEl(obj) {
        const isSelected = this.state.selectedId === obj.id;
        const el = document.createElement('div');
        el.id = `dsobj-${obj.id}`;
        el.className = `dsobj dsobj-${obj.type}${isSelected ? ' dsobj-selected' : ''}`;
        el.style.cssText = `left:${obj.x}px;top:${obj.y}px;width:${obj.w}px;height:${obj.h}px;`;

        if (obj.type !== 'wall') {
            const lbl = document.createElement('span');
            lbl.className = 'dsobj-label';
            lbl.textContent = obj.label || '';
            el.appendChild(lbl);
        }

        if (obj.type === 'desk') {
            const icon = document.createElement('div');
            icon.className = 'dsobj-desk-icon';
            icon.innerHTML = `<svg viewBox="0 0 40 46" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="10" width="32" height="24" rx="2" fill="rgba(99,102,241,0.8)"/>
                <rect x="4" y="6" width="32" height="6" rx="1" fill="#818cf8"/>
                <rect x="6" y="34" width="4" height="8" rx="1" fill="#4f46e5"/>
                <rect x="30" y="34" width="4" height="8" rx="1" fill="#4f46e5"/>
            </svg>`;
            el.appendChild(icon);
        }

        if (this.TYPES[obj.type]?.resizable) {
            ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(dir => {
                const h = document.createElement('div');
                h.className = `dsobj-handle dsobj-handle-${dir}`;
                h.addEventListener('mousedown', e => {
                    e.stopPropagation(); e.preventDefault();
                    this.selectObj(obj.id);
                    this.startResize(e, obj.id, dir);
                });
                el.appendChild(h);
            });
        }

        el.addEventListener('mousedown', e => {
            if (e.target.classList.contains('dsobj-handle')) return;
            e.preventDefault();
            this.selectObj(obj.id);
            this.startDrag(e, obj.id);
        });
        el.addEventListener('dblclick', e => {
            e.stopPropagation();
            if (obj.type === 'wall') return;
            const input = document.getElementById('ds-label-input');
            if (input) { input.focus(); input.select(); }
        });

        return el;
    },

    // ---- Selection & Properties ----

    selectObj(id) {
        const prev = document.getElementById(`dsobj-${this.state.selectedId}`);
        if (prev) prev.classList.remove('dsobj-selected');
        this.state.selectedId = id;
        const el = document.getElementById(`dsobj-${id}`);
        if (el) el.classList.add('dsobj-selected');
        this.renderProperties();
    },

    deselectAll() {
        this.selectObj(null);
    },

    renderProperties() {
        const panel = document.getElementById('designer-properties');
        if (!panel) return;
        const obj = this.state.objects.find(o => o.id === this.state.selectedId);
        if (!obj) {
            panel.innerHTML = `<p class="ds-hint">Click an object to select it,<br>or drag one from the palette.</p>`;
            return;
        }
        const names = { area: 'Area', desk: 'Desk', wall: 'Wall', box: 'Box' };
        panel.innerHTML = `
            <div class="ds-prop-row">
                <span class="ds-prop-label">Type</span>
                <span class="ds-prop-val ds-type-badge ds-type-${obj.type}">${names[obj.type]}</span>
            </div>
            ${obj.type !== 'wall' ? `
            <div class="ds-prop-row">
                <span class="ds-prop-label">Label</span>
                <input type="text" id="ds-label-input" class="ds-label-input"
                    value="${obj.label || ''}" maxlength="12" placeholder="Name\u2026" />
            </div>` : ''}
            <div class="ds-prop-row">
                <span class="ds-prop-label">X, Y</span>
                <span class="ds-prop-val" id="ds-pos-val">${Math.round(obj.x)}, ${Math.round(obj.y)}</span>
            </div>
            ${obj.type !== 'desk' ? `
            <div class="ds-prop-row">
                <span class="ds-prop-label">W \xd7 H</span>
                <span class="ds-prop-val" id="ds-size-val">${Math.round(obj.w)} \xd7 ${Math.round(obj.h)}</span>
            </div>` : ''}
            <div class="ds-prop-actions">
                ${obj.type !== 'wall' ? `<button class="btn-ghost btn-sm" onclick="Designer.applyLabel()">Apply</button>` : ''}
                <button class="btn-danger btn-sm" onclick="Designer.deleteSelected()">\u{1F5D1} Delete</button>
            </div>`;
        const input = document.getElementById('ds-label-input');
        if (input) {
            input.addEventListener('input', () => this.applyLabel());
            input.addEventListener('keydown', e => { if (e.key === 'Enter') this.applyLabel(); });
        }
    },

    applyLabel() {
        const input = document.getElementById('ds-label-input');
        if (!input || !this.state.selectedId) return;
        const obj = this.state.objects.find(o => o.id === this.state.selectedId);
        if (!obj) return;
        obj.label = input.value;
        const lbl = document.querySelector(`#dsobj-${obj.id} .dsobj-label`);
        if (lbl) lbl.textContent = obj.label;
    },

    deleteSelected() {
        if (!this.state.selectedId) return;
        this.state.objects = this.state.objects.filter(o => o.id !== this.state.selectedId);
        this.state.selectedId = null;
        this.render();
        this.renderProperties();
    },

    // ---- Object Creation ----

    addObject(type, x, y) {
        const info = this.TYPES[type] || { w: 80, h: 60, label: 'New' };
        const deskN = this.state.objects.filter(o => o.type === 'desk').length;
        const label = type === 'desk' ? `D${deskN + 1}` : info.label;
        const obj = {
            id: `${type}_${Date.now()}`,
            type, label,
            x: Math.max(0, Math.min(this.CANVAS_W - info.w, x - info.w / 2)),
            y: Math.max(0, Math.min(this.CANVAS_H - info.h, y - info.h / 2)),
            w: info.w, h: info.h,
        };
        this.state.objects.push(obj);
        this.render();
        this.selectObj(obj.id);
    },

    // ---- Drag & Resize ----

    startDrag(e, id) {
        const obj = this.state.objects.find(o => o.id === id);
        if (!obj) return;
        this.state._drag = { id, sx: e.clientX, sy: e.clientY, ox: obj.x, oy: obj.y };
    },

    startResize(e, id, handle) {
        const obj = this.state.objects.find(o => o.id === id);
        if (!obj) return;
        this.state._resize = { id, handle, sx: e.clientX, sy: e.clientY, ox: obj.x, oy: obj.y, ow: obj.w, oh: obj.h };
    },

    onMouseMove(e) {
        const { _drag, _resize } = this.state;
        if (_drag) {
            const obj = this.state.objects.find(o => o.id === _drag.id);
            if (obj) {
                obj.x = Math.max(0, Math.min(this.CANVAS_W - obj.w, _drag.ox + e.clientX - _drag.sx));
                obj.y = Math.max(0, Math.min(this.CANVAS_H - obj.h, _drag.oy + e.clientY - _drag.sy));
                const el = document.getElementById(`dsobj-${obj.id}`);
                if (el) { el.style.left = obj.x + 'px'; el.style.top = obj.y + 'px'; }
                const posEl = document.getElementById('ds-pos-val');
                if (posEl) posEl.textContent = `${Math.round(obj.x)}, ${Math.round(obj.y)}`;
            }
        }
        if (_resize) {
            const obj = this.state.objects.find(o => o.id === _resize.id);
            if (obj) {
                const dx = e.clientX - _resize.sx, dy = e.clientY - _resize.sy;
                const MIN = 30;
                let nx = _resize.ox, ny = _resize.oy, nw = _resize.ow, nh = _resize.oh;
                if (_resize.handle.includes('e')) nw = Math.max(MIN, _resize.ow + dx);
                if (_resize.handle.includes('s')) nh = Math.max(MIN, _resize.oh + dy);
                if (_resize.handle.includes('w')) { nw = Math.max(MIN, _resize.ow - dx); nx = _resize.ox + _resize.ow - nw; }
                if (_resize.handle.includes('n')) { nh = Math.max(MIN, _resize.oh - dy); ny = _resize.oy + _resize.oh - nh; }
                obj.x = nx; obj.y = ny; obj.w = nw; obj.h = nh;
                const el = document.getElementById(`dsobj-${obj.id}`);
                if (el) { el.style.cssText = `left:${nx}px;top:${ny}px;width:${nw}px;height:${nh}px;`; }
                const sizeEl = document.getElementById('ds-size-val');
                if (sizeEl) sizeEl.textContent = `${Math.round(nw)} \xd7 ${Math.round(nh)}`;
            }
        }
    },

    onMouseUp() {
        if (this.state._drag || this.state._resize) {
            this.state._drag = null;
            this.state._resize = null;
            this.renderProperties();
        }
    },

    // ---- Palette Drag Setup ----

    setupPalette() {
        document.querySelectorAll('.ds-palette-item').forEach(item => {
            item.addEventListener('dragstart', e => {
                this.state._palType = item.dataset.type;
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', item.dataset.type);
            });
        });
        const canvas = document.getElementById('designer-canvas');
        if (!canvas) return;
        canvas.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
        canvas.addEventListener('drop', e => {
            e.preventDefault();
            const type = e.dataTransfer.getData('text/plain') || this.state._palType;
            if (!type) return;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.addObject(type, x, y);
        });
        canvas.addEventListener('mousedown', e => {
            if (e.target === canvas) this.deselectAll();
        });
    },

    // ---- Global Event Listeners (called once) ----

    setupGlobalListeners() {
        document.addEventListener('mousemove', e => this.onMouseMove(e));
        document.addEventListener('mouseup', () => this.onMouseUp());
        document.addEventListener('keydown', e => {
            if ((e.key === 'Delete' || e.key === 'Backspace') &&
                this.state.selectedId &&
                !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
                this.deleteSelected();
            }
        });
        this._listenersSetup = true;
    },
};

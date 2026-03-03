// ===== DESKFLOW DATA LAYER =====
// Persistent storage: localStorage (local cache) + Firebase Realtime Database (shared truth)

// Firebase Realtime Database — set this to your project's database URL
const FIREBASE_URL = 'https://deskflow-app-default-rtdb.asia-southeast1.firebasedatabase.app';

// Global organization state
let CURRENT_ORG = 'demoorg';
function setOrg(orgId) {
    if (orgId) CURRENT_ORG = orgId;
}

// Base keys used for both the suffix of local keys and the leaf of cloud paths
const BASE_KEYS = {
    USERS: 'df_users',
    BOOKINGS: 'df_bookings',
    FLOORS: 'df_floors',
    DESKS: 'df_desks',
    FLOOR_LAYOUTS: 'df_floor_layouts',
};

const STORAGE_KEYS = {
    get USERS() { return `${CURRENT_ORG}_${BASE_KEYS.USERS}`; },
    get BOOKINGS() { return `${CURRENT_ORG}_${BASE_KEYS.BOOKINGS}`; },
    get FLOORS() { return `${CURRENT_ORG}_${BASE_KEYS.FLOORS}`; },
    get DESKS() { return `${CURRENT_ORG}_${BASE_KEYS.DESKS}`; },
    get FLOOR_LAYOUTS() { return `${CURRENT_ORG}_${BASE_KEYS.FLOOR_LAYOUTS}`; },
    SESSION: 'df_session',
};

// ===== DEFAULT DATA =====
const DEFAULT_USERS = [
    { id: 'u1', username: 'admin', password: 'admin123', name: 'Admin User', role: 'admin', initials: 'AU', maxBookingDays: 365 },
    { id: 'u2', username: 'nara', password: 'pass123', name: 'Nara Regailo', role: 'user', initials: 'NR', maxBookingDays: 2 },
    { id: 'u3', username: 'bob', password: 'pass123', name: 'Bob Johnson', role: 'user', initials: 'BJ', maxBookingDays: 2 },
    { id: 'u4', username: 'carol', password: 'pass123', name: 'Carol White', role: 'user', initials: 'CW', maxBookingDays: 2 },
    { id: 'u5', username: 'dave', password: 'pass123', name: 'Dave Brown', role: 'user', initials: 'DB', maxBookingDays: 2 },
];

const DEFAULT_FLOORS = [
    { id: 'f1', name: 'Floor 1' },
    { id: 'f2', name: 'Floor 2' },
    { id: 'f3', name: 'Floor 3' },
];

// ===== FLOOR LAYOUTS =====
// Canvas is 1100 x 760px. Desk element is 58x46px.
// Spacing: desks placed on a 75px horizontal / 62px vertical grid inside zones.
// Zone/room padding: 30px top (for label), 14px sides, 14px bottom.

const DEFAULT_FLOOR_LAYOUTS = {
    f1: {
        rooms: [
            { id: 'r1', label: 'Meeting Room A', x: 14, y: 14, w: 230, h: 180 },
            { id: 'r2', label: 'Meeting Room B', x: 14, y: 210, w: 230, h: 180 },
            { id: 'r3', label: 'Server Room', x: 14, y: 406, w: 230, h: 150 },
            { id: 'r4', label: "Manager's Office", x: 856, y: 14, w: 230, h: 220 },
            { id: 'r5', label: 'HR Office', x: 856, y: 250, w: 230, h: 180 },
        ],
        zones: [
            { id: 'z1', label: 'Open Work Area', x: 260, y: 14, w: 580, h: 490 },
            { id: 'z2', label: 'Breakout Zone', x: 14, y: 572, w: 1072, h: 172 },
        ],
    },
    f2: {
        rooms: [
            { id: 'r1', label: 'Boardroom', x: 14, y: 14, w: 230, h: 250 },
            { id: 'r2', label: 'Focus Room 1', x: 14, y: 280, w: 110, h: 160 },
            { id: 'r3', label: 'Focus Room 2', x: 134, y: 280, w: 110, h: 160 },
            { id: 'r4', label: "Director's Suite", x: 856, y: 14, w: 230, h: 310 },
        ],
        zones: [
            { id: 'z1', label: 'Main Work Area', x: 260, y: 14, w: 580, h: 420 },
            { id: 'z2', label: 'Collaboration Zone', x: 14, y: 456, w: 1072, h: 288 },
        ],
    },
    f3: {
        rooms: [
            { id: 'r1', label: 'Lab A', x: 14, y: 14, w: 230, h: 280 },
            { id: 'r2', label: 'Lab B', x: 14, y: 310, w: 230, h: 250 },
            { id: 'r3', label: 'Print Room', x: 856, y: 14, w: 230, h: 130 },
            { id: 'r4', label: 'Storage', x: 856, y: 160, w: 230, h: 120 },
            { id: 'r5', label: 'Quiet Room', x: 856, y: 296, w: 230, h: 160 },
        ],
        zones: [
            { id: 'z1', label: 'Engineering Zone', x: 260, y: 14, w: 580, h: 310 },
            { id: 'z2', label: 'Agile Area', x: 260, y: 340, w: 580, h: 310 },
        ],
    },
};

// ===== DEFAULT DESKS =====
// Desk (x,y) = top-left corner of the 58x46 element.
// Grid: within zone starting at (zone.x + 18) for x, (zone.y + 38) for y,
//        75px horizontal step, 62px vertical step.

const DEFAULT_DESKS = {
    f1: [
        // --- Open Work Area (zone x=260,y=14,w=580,h=490) ---
        // Row 1: y = 14+38 = 52
        { id: 'd1', label: 'D1', x: 278, y: 52 },
        { id: 'd2', label: 'D2', x: 353, y: 52 },
        { id: 'd3', label: 'D3', x: 428, y: 52 },
        { id: 'd4', label: 'D4', x: 503, y: 52 },
        { id: 'd5', label: 'D5', x: 578, y: 52 },
        { id: 'd6', label: 'D6', x: 653, y: 52 },
        { id: 'd7', label: 'D7', x: 728, y: 52 },
        // Row 2: y = 114
        { id: 'd8', label: 'D8', x: 278, y: 114 },
        { id: 'd9', label: 'D9', x: 353, y: 114 },
        { id: 'd10', label: 'D10', x: 428, y: 114 },
        { id: 'd11', label: 'D11', x: 503, y: 114 },
        { id: 'd12', label: 'D12', x: 578, y: 114 },
        { id: 'd13', label: 'D13', x: 653, y: 114 },
        { id: 'd14', label: 'D14', x: 728, y: 114 },
        // Row 3: y = 176
        { id: 'd15', label: 'D15', x: 278, y: 176 },
        { id: 'd16', label: 'D16', x: 353, y: 176 },
        { id: 'd17', label: 'D17', x: 428, y: 176 },
        { id: 'd18', label: 'D18', x: 503, y: 176 },
        { id: 'd19', label: 'D19', x: 578, y: 176 },
        { id: 'd20', label: 'D20', x: 653, y: 176 },
        { id: 'd21', label: 'D21', x: 728, y: 176 },
        // Row 4: y = 238
        { id: 'd22', label: 'D22', x: 278, y: 238 },
        { id: 'd23', label: 'D23', x: 353, y: 238 },
        { id: 'd24', label: 'D24', x: 428, y: 238 },
        { id: 'd25', label: 'D25', x: 503, y: 238 },
        { id: 'd26', label: 'D26', x: 578, y: 238 },
        { id: 'd27', label: 'D27', x: 653, y: 238 },
        { id: 'd28', label: 'D28', x: 728, y: 238 },
        // Row 5: y = 300
        { id: 'd29', label: 'D29', x: 278, y: 300 },
        { id: 'd30', label: 'D30', x: 353, y: 300 },
        { id: 'd31', label: 'D31', x: 428, y: 300 },
        { id: 'd32', label: 'D32', x: 503, y: 300 },
        { id: 'd33', label: 'D33', x: 578, y: 300 },
        { id: 'd34', label: 'D34', x: 653, y: 300 },
        { id: 'd35', label: 'D35', x: 728, y: 300 },
        // Row 6: y = 362 (fits in zone: max = 14+490-46-14 = 444)
        { id: 'd36', label: 'D36', x: 278, y: 362 },
        { id: 'd37', label: 'D37', x: 353, y: 362 },
        { id: 'd38', label: 'D38', x: 428, y: 362 },
        { id: 'd39', label: 'D39', x: 503, y: 362 },
        { id: 'd40', label: 'D40', x: 578, y: 362 },
        { id: 'd41', label: 'D41', x: 653, y: 362 },
        { id: 'd42', label: 'D42', x: 728, y: 362 },
        // Row 7: y = 424
        { id: 'd43', label: 'D43', x: 278, y: 424 },
        { id: 'd44', label: 'D44', x: 353, y: 424 },
        { id: 'd45', label: 'D45', x: 428, y: 424 },
        { id: 'd46', label: 'D46', x: 503, y: 424 },

        // --- Meeting Room A (x=14,y=14,w=230,h=180) label area y+38=52 ---
        { id: 'd47', label: 'M1', x: 32, y: 60 },
        { id: 'd48', label: 'M2', x: 114, y: 60 },
        { id: 'd49', label: 'M3', x: 32, y: 122 },
        { id: 'd50', label: 'M4', x: 114, y: 122 },
        // --- Meeting Room B (x=14,y=210,w=230,h=180) ---
        { id: 'd51', label: 'M5', x: 32, y: 256 },
        { id: 'd52', label: 'M6', x: 114, y: 256 },
        { id: 'd53', label: 'M7', x: 32, y: 318 },
        { id: 'd54', label: 'M8', x: 114, y: 318 },
        // --- Manager's Office (x=856,y=14,w=230,h=220) ---
        { id: 'd55', label: 'MG1', x: 874, y: 60 },
        { id: 'd56', label: 'MG2', x: 958, y: 60 },
        { id: 'd57', label: 'MG3', x: 874, y: 122 },
        { id: 'd58', label: 'MG4', x: 958, y: 122 },
        // --- HR Office (x=856,y=250,w=230,h=180) ---
        { id: 'd59', label: 'HR1', x: 874, y: 294 },
        { id: 'd60', label: 'HR2', x: 958, y: 294 },
        { id: 'd61', label: 'HR3', x: 874, y: 356 },
        // --- Breakout Zone (x=14,y=572,w=1072,h=172) ---
        { id: 'd62', label: 'B1', x: 32, y: 610 },
        { id: 'd63', label: 'B2', x: 120, y: 610 },
        { id: 'd64', label: 'B3', x: 220, y: 610 },
        { id: 'd65', label: 'B4', x: 310, y: 610 },
        { id: 'd66', label: 'B5', x: 400, y: 610 },
        { id: 'd67', label: 'B6', x: 490, y: 610 },
        { id: 'd68', label: 'B7', x: 590, y: 610 },
        { id: 'd69', label: 'B8', x: 680, y: 610 },
        { id: 'd70', label: 'B9', x: 780, y: 610 },
        { id: 'd71', label: 'B10', x: 870, y: 610 },
        { id: 'd72', label: 'B11', x: 970, y: 610 },
    ],
    f2: [
        // --- Main Work Area (x=260,y=14,w=580,h=420) ---
        // Row 1: y=52
        { id: 'd1', label: 'D1', x: 278, y: 52 },
        { id: 'd2', label: 'D2', x: 353, y: 52 },
        { id: 'd3', label: 'D3', x: 428, y: 52 },
        { id: 'd4', label: 'D4', x: 503, y: 52 },
        { id: 'd5', label: 'D5', x: 578, y: 52 },
        { id: 'd6', label: 'D6', x: 653, y: 52 },
        { id: 'd7', label: 'D7', x: 728, y: 52 },
        // Row 2: y=114
        { id: 'd8', label: 'D8', x: 278, y: 114 },
        { id: 'd9', label: 'D9', x: 353, y: 114 },
        { id: 'd10', label: 'D10', x: 428, y: 114 },
        { id: 'd11', label: 'D11', x: 503, y: 114 },
        { id: 'd12', label: 'D12', x: 578, y: 114 },
        { id: 'd13', label: 'D13', x: 653, y: 114 },
        { id: 'd14', label: 'D14', x: 728, y: 114 },
        // Row 3: y=176
        { id: 'd15', label: 'D15', x: 278, y: 176 },
        { id: 'd16', label: 'D16', x: 353, y: 176 },
        { id: 'd17', label: 'D17', x: 428, y: 176 },
        { id: 'd18', label: 'D18', x: 503, y: 176 },
        { id: 'd19', label: 'D19', x: 578, y: 176 },
        { id: 'd20', label: 'D20', x: 653, y: 176 },
        { id: 'd21', label: 'D21', x: 728, y: 176 },
        // Row 4: y=238
        { id: 'd22', label: 'D22', x: 278, y: 238 },
        { id: 'd23', label: 'D23', x: 353, y: 238 },
        { id: 'd24', label: 'D24', x: 428, y: 238 },
        { id: 'd25', label: 'D25', x: 503, y: 238 },
        { id: 'd26', label: 'D26', x: 578, y: 238 },
        { id: 'd27', label: 'D27', x: 653, y: 238 },
        { id: 'd28', label: 'D28', x: 728, y: 238 },
        // Row 5: y=300
        { id: 'd29', label: 'D29', x: 278, y: 300 },
        { id: 'd30', label: 'D30', x: 353, y: 300 },
        { id: 'd31', label: 'D31', x: 428, y: 300 },
        { id: 'd32', label: 'D32', x: 503, y: 300 },
        { id: 'd33', label: 'D33', x: 578, y: 300 },
        { id: 'd34', label: 'D34', x: 653, y: 300 },
        { id: 'd35', label: 'D35', x: 728, y: 300 },
        // Row 6: y=362 (fits: max=14+420-46-14=374)
        { id: 'd36', label: 'D36', x: 278, y: 362 },
        { id: 'd37', label: 'D37', x: 353, y: 362 },
        { id: 'd38', label: 'D38', x: 428, y: 362 },

        // --- Boardroom (x=14,y=14,w=230,h=250) ---
        { id: 'd39', label: 'BR1', x: 32, y: 60 },
        { id: 'd40', label: 'BR2', x: 114, y: 60 },
        { id: 'd41', label: 'BR3', x: 32, y: 122 },
        { id: 'd42', label: 'BR4', x: 114, y: 122 },
        { id: 'd43', label: 'BR5', x: 32, y: 184 },
        { id: 'd44', label: 'BR6', x: 114, y: 184 },

        // --- Focus Room 1 (x=14,y=280,w=110,h=160) ---
        { id: 'd45', label: 'F1', x: 32, y: 320 },
        { id: 'd46', label: 'F2', x: 32, y: 382 },

        // --- Focus Room 2 (x=134,y=280,w=110,h=160) ---
        { id: 'd47', label: 'F3', x: 152, y: 320 },
        { id: 'd48', label: 'F4', x: 152, y: 382 },

        // --- Director's Suite (x=856,y=14,w=230,h=310) ---
        { id: 'd49', label: 'DS1', x: 874, y: 60 },
        { id: 'd50', label: 'DS2', x: 958, y: 60 },
        { id: 'd51', label: 'DS3', x: 874, y: 122 },
        { id: 'd52', label: 'DS4', x: 958, y: 122 },
        { id: 'd53', label: 'DS5', x: 874, y: 184 },
        { id: 'd54', label: 'DS6', x: 958, y: 184 },
        { id: 'd55', label: 'DS7', x: 874, y: 246 },

        // --- Collaboration Zone (x=14,y=456,w=1072,h=288) ---
        // Row 1: y = 456+38 = 494
        { id: 'd56', label: 'C1', x: 32, y: 494 },
        { id: 'd57', label: 'C2', x: 120, y: 494 },
        { id: 'd58', label: 'C3', x: 220, y: 494 },
        { id: 'd59', label: 'C4', x: 310, y: 494 },
        { id: 'd60', label: 'C5', x: 400, y: 494 },
        { id: 'd61', label: 'C6', x: 490, y: 494 },
        { id: 'd62', label: 'C7', x: 590, y: 494 },
        { id: 'd63', label: 'C8', x: 680, y: 494 },
        { id: 'd64', label: 'C9', x: 780, y: 494 },
        { id: 'd65', label: 'C10', x: 870, y: 494 },
        { id: 'd66', label: 'C11', x: 970, y: 494 },
        // Row 2: y = 556
        { id: 'd67', label: 'C12', x: 32, y: 556 },
        { id: 'd68', label: 'C13', x: 120, y: 556 },
        { id: 'd69', label: 'C14', x: 220, y: 556 },
        { id: 'd70', label: 'C15', x: 310, y: 556 },
        { id: 'd71', label: 'C16', x: 400, y: 556 },
        { id: 'd72', label: 'C17', x: 490, y: 556 },
        { id: 'd73', label: 'C18', x: 590, y: 556 },
        { id: 'd74', label: 'C19', x: 680, y: 556 },
        { id: 'd75', label: 'C20', x: 780, y: 556 },
        { id: 'd76', label: 'C21', x: 870, y: 556 },
        { id: 'd77', label: 'C22', x: 970, y: 556 },
        // Row 3: y=618 (fits: max = 456+288-46-14=684)
        { id: 'd78', label: 'C23', x: 32, y: 618 },
        { id: 'd79', label: 'C24', x: 120, y: 618 },
        { id: 'd80', label: 'C25', x: 220, y: 618 },
        { id: 'd81', label: 'C26', x: 310, y: 618 },
        { id: 'd82', label: 'C27', x: 400, y: 618 },
        { id: 'd83', label: 'C28', x: 490, y: 618 },
    ],
    f3: [
        // --- Engineering Zone (x=260,y=14,w=580,h=310) ---
        // Row 1: y=52
        { id: 'd1', label: 'E1', x: 278, y: 52 },
        { id: 'd2', label: 'E2', x: 353, y: 52 },
        { id: 'd3', label: 'E3', x: 428, y: 52 },
        { id: 'd4', label: 'E4', x: 503, y: 52 },
        { id: 'd5', label: 'E5', x: 578, y: 52 },
        { id: 'd6', label: 'E6', x: 653, y: 52 },
        { id: 'd7', label: 'E7', x: 728, y: 52 },
        // Row 2: y=114
        { id: 'd8', label: 'E8', x: 278, y: 114 },
        { id: 'd9', label: 'E9', x: 353, y: 114 },
        { id: 'd10', label: 'E10', x: 428, y: 114 },
        { id: 'd11', label: 'E11', x: 503, y: 114 },
        { id: 'd12', label: 'E12', x: 578, y: 114 },
        { id: 'd13', label: 'E13', x: 653, y: 114 },
        { id: 'd14', label: 'E14', x: 728, y: 114 },
        // Row 3: y=176
        { id: 'd15', label: 'E15', x: 278, y: 176 },
        { id: 'd16', label: 'E16', x: 353, y: 176 },
        { id: 'd17', label: 'E17', x: 428, y: 176 },
        { id: 'd18', label: 'E18', x: 503, y: 176 },
        { id: 'd19', label: 'E19', x: 578, y: 176 },
        { id: 'd20', label: 'E20', x: 653, y: 176 },
        { id: 'd21', label: 'E21', x: 728, y: 176 },
        // Row 4: y=238 (fits: max=14+310-46-14=264)
        { id: 'd22', label: 'E22', x: 278, y: 238 },
        { id: 'd23', label: 'E23', x: 353, y: 238 },
        { id: 'd24', label: 'E24', x: 428, y: 238 },
        { id: 'd25', label: 'E25', x: 503, y: 238 },

        // --- Agile Area (x=260,y=340,w=580,h=310) ---
        // Row 1: y=340+38=378
        { id: 'd26', label: 'A1', x: 278, y: 378 },
        { id: 'd27', label: 'A2', x: 353, y: 378 },
        { id: 'd28', label: 'A3', x: 428, y: 378 },
        { id: 'd29', label: 'A4', x: 503, y: 378 },
        { id: 'd30', label: 'A5', x: 578, y: 378 },
        { id: 'd31', label: 'A6', x: 653, y: 378 },
        { id: 'd32', label: 'A7', x: 728, y: 378 },
        // Row 2: y=440
        { id: 'd33', label: 'A8', x: 278, y: 440 },
        { id: 'd34', label: 'A9', x: 353, y: 440 },
        { id: 'd35', label: 'A10', x: 428, y: 440 },
        { id: 'd36', label: 'A11', x: 503, y: 440 },
        { id: 'd37', label: 'A12', x: 578, y: 440 },
        { id: 'd38', label: 'A13', x: 653, y: 440 },
        { id: 'd39', label: 'A14', x: 728, y: 440 },
        // Row 3: y=502
        { id: 'd40', label: 'A15', x: 278, y: 502 },
        { id: 'd41', label: 'A16', x: 353, y: 502 },
        { id: 'd42', label: 'A17', x: 428, y: 502 },
        { id: 'd43', label: 'A18', x: 503, y: 502 },
        { id: 'd44', label: 'A19', x: 578, y: 502 },
        { id: 'd45', label: 'A20', x: 653, y: 502 },
        // Row 4: y=564 (fits: max=340+310-46-14=590)
        { id: 'd46', label: 'A21', x: 278, y: 564 },
        { id: 'd47', label: 'A22', x: 353, y: 564 },
        { id: 'd48', label: 'A23', x: 428, y: 564 },

        // --- Lab A (x=14,y=14,w=230,h=280) ---
        { id: 'd49', label: 'L1', x: 32, y: 60 },
        { id: 'd50', label: 'L2', x: 114, y: 60 },
        { id: 'd51', label: 'L3', x: 32, y: 122 },
        { id: 'd52', label: 'L4', x: 114, y: 122 },
        { id: 'd53', label: 'L5', x: 32, y: 184 },
        { id: 'd54', label: 'L6', x: 114, y: 184 },
        { id: 'd55', label: 'L7', x: 32, y: 246 },
        { id: 'd56', label: 'L8', x: 114, y: 246 },

        // --- Lab B (x=14,y=310,w=230,h=250) ---
        { id: 'd57', label: 'LB1', x: 32, y: 356 },
        { id: 'd58', label: 'LB2', x: 114, y: 356 },
        { id: 'd59', label: 'LB3', x: 32, y: 418 },
        { id: 'd60', label: 'LB4', x: 114, y: 418 },
        { id: 'd61', label: 'LB5', x: 32, y: 480 },
        { id: 'd62', label: 'LB6', x: 114, y: 480 },

        // --- Quiet Room (x=856,y=296,w=230,h=160) ---
        { id: 'd63', label: 'Q1', x: 874, y: 340 },
        { id: 'd64', label: 'Q2', x: 958, y: 340 },
        { id: 'd65', label: 'Q3', x: 874, y: 402 },

        // --- Print Room (x=856,y=14,w=230,h=130) ---
        { id: 'd66', label: 'PR1', x: 874, y: 60 },
        { id: 'd67', label: 'PR2', x: 958, y: 60 },
    ],
};

// ===== STORAGE HELPERS =====
const Store = {
    get(key, defaultVal) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : defaultVal;
        } catch { return defaultVal; }
    },
    set(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch { }
        CloudSync.push(key, val);
    },
    // Local-only write — does NOT push to Firebase.
    // Used in initData() so blank defaults don't overwrite real cloud data.
    setLocal(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch { }
    },
};

// ===== CLOUD SYNC (Firebase Realtime Database REST API) =====
const CloudSync = {
    // Fetch all shared data from Firebase and update localStorage.
    async fetchAll() {
        await Promise.all(Object.values(BASE_KEYS).map(async baseKey => {
            try {
                const cloudPath = `orgs/${CURRENT_ORG}/${baseKey}`;
                const localKey = `${CURRENT_ORG}_${baseKey}`;
                const r = await fetch(`${FIREBASE_URL}/${cloudPath}.json`, { cache: 'no-store' });
                if (!r.ok) return;
                const data = await r.json();
                if (data !== null) {
                    localStorage.setItem(localKey, JSON.stringify(data));
                }
            } catch { /* network unavailable — use local cache */ }
        }));
    },

    // Fetch a single key from Firebase and update localStorage.
    async fetchKey(localKey) {
        const prefix = `${CURRENT_ORG}_`;
        if (!localKey.startsWith(prefix)) return;
        const baseKey = localKey.slice(prefix.length);
        if (!Object.values(BASE_KEYS).includes(baseKey)) return;

        try {
            const cloudPath = `orgs/${CURRENT_ORG}/${baseKey}`;
            const r = await fetch(`${FIREBASE_URL}/${cloudPath}.json`, { cache: 'no-store' });
            if (!r.ok) return;
            const data = await r.json();
            if (data !== null) {
                localStorage.setItem(localKey, JSON.stringify(data));
            }
        } catch { /* network unavailable — use local cache */ }
    },

    // Push a single key to Firebase (fire-and-forget).
    push(localKey, val) {
        const prefix = `${CURRENT_ORG}_`;
        if (!localKey.startsWith(prefix)) return;
        const baseKey = localKey.slice(prefix.length);
        if (!Object.values(BASE_KEYS).includes(baseKey)) return;

        const cloudPath = `orgs/${CURRENT_ORG}/${baseKey}`;
        fetch(`${FIREBASE_URL}/${cloudPath}.json`, {
            method: 'PUT',
            body: JSON.stringify(val),
            headers: { 'Content-Type': 'application/json' },
        }).catch(() => { /* ignore network errors on write */ });
    },
};

// ===== INITIALIZE DATA =====
// Seeds defaults (or completely new admin credentials) and handles legacy data migrations automatically.
async function initData(adminParams = null) {
    // Migration: if we are setting up 'demoorg' and there is no data...
    if (CURRENT_ORG === 'demoorg' && !localStorage.getItem(STORAGE_KEYS.USERS)) {
        let migrated = false;
        // 1. Check if legacy local cache exists (for instant offline migration)
        if (localStorage.getItem(BASE_KEYS.USERS)) {
            Object.values(BASE_KEYS).forEach(base => {
                const oldVal = localStorage.getItem(base);
                if (oldVal) {
                    localStorage.setItem(`demoorg_${base}`, oldVal);
                    CloudSync.push(`demoorg_${base}`, JSON.parse(oldVal));
                }
            });
            migrated = true;
            console.log('Migrated legacy local data to demoorg partition.');
        } else {
            // 2. Check if legacy cloud data exists
            try {
                const r = await fetch(`${FIREBASE_URL}/${BASE_KEYS.USERS}.json`);
                const legacyCloudUsers = await r.json();
                if (legacyCloudUsers) {
                    await Promise.all(Object.values(BASE_KEYS).map(async base => {
                        const r2 = await fetch(`${FIREBASE_URL}/${base}.json`);
                        const data = await r2.json();
                        if (data !== null) {
                            localStorage.setItem(`demoorg_${base}`, JSON.stringify(data));
                            CloudSync.push(`demoorg_${base}`, data);
                        }
                    }));
                    migrated = true;
                    console.log('Migrated legacy cloud data to demoorg partition.');
                }
            } catch (e) { }
        }

        if (migrated) return; // Skip seeding defaults since we migrated real data
    }

    if (!Store.get(STORAGE_KEYS.USERS, null)) {
        if (adminParams) {
            const adminUser = { id: 'u1', username: adminParams.username, password: adminParams.password, name: 'Admin User', role: 'admin', initials: 'AD', maxBookingDays: 365 };
            Store.setLocal(STORAGE_KEYS.USERS, [adminUser]);
        } else {
            Store.setLocal(STORAGE_KEYS.USERS, DEFAULT_USERS);
        }
    }
    if (!Store.get(STORAGE_KEYS.FLOORS, null)) {
        Store.setLocal(STORAGE_KEYS.FLOORS, DEFAULT_FLOORS);
    }
    if (!Store.get(STORAGE_KEYS.DESKS, null)) {
        Store.setLocal(STORAGE_KEYS.DESKS, DEFAULT_DESKS);
    }
    if (!Store.get(STORAGE_KEYS.BOOKINGS, null)) {
        Store.setLocal(STORAGE_KEYS.BOOKINGS, {});
    }
    if (!Store.get(STORAGE_KEYS.FLOOR_LAYOUTS, null)) {
        Store.setLocal(STORAGE_KEYS.FLOOR_LAYOUTS, DEFAULT_FLOOR_LAYOUTS);
    }
}

// ===== USER API =====
const UserAPI = {
    getAll() { return Store.get(STORAGE_KEYS.USERS, []); },
    getById(id) { return this.getAll().find(u => u.id === id) || null; },
    getByUsername(username) { return this.getAll().find(u => u.username === username) || null; },
    save(users) { Store.set(STORAGE_KEYS.USERS, users); },
    add(user) {
        const users = this.getAll();
        user.id = 'u_' + Date.now();
        user.initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        users.push(user);
        this.save(users);
        return user;
    },
    update(id, updates) {
        const users = this.getAll();
        const idx = users.findIndex(u => u.id === id);
        if (idx === -1) return false;
        if (updates.allowedFloors !== undefined) {
            users[idx].allowedFloors = updates.allowedFloors;
        }
        users[idx] = { ...users[idx], ...updates };
        if (updates.name) {
            users[idx].initials = updates.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        }
        this.save(users);
        return true;
    },
    delete(id) {
        const users = this.getAll().filter(u => u.id !== id);
        this.save(users);
        BookingAPI.removeAllForUser(id);
    },
};

// ===== FLOOR API =====
const FloorAPI = {
    getAll() { return Store.get(STORAGE_KEYS.FLOORS, DEFAULT_FLOORS); },
    save(floors) { Store.set(STORAGE_KEYS.FLOORS, floors); },
    update(id, updates) {
        const floors = this.getAll();
        const idx = floors.findIndex(f => f.id === id);
        if (idx === -1) return;
        floors[idx] = { ...floors[idx], ...updates };
        this.save(floors);
    },
    add(name) {
        const floors = this.getAll();
        const id = 'f_' + Date.now();
        const newFloor = { id, name };
        floors.push(newFloor);
        this.save(floors);
        const desks = DeskAPI.getAll();
        desks[id] = [];
        DeskAPI.save(desks);
        const layouts = this.getAllLayouts();
        layouts[id] = { rooms: [], zones: [], walls: [], boxes: [] };
        Store.set(STORAGE_KEYS.FLOOR_LAYOUTS, layouts);
        return newFloor;
    },
    delete(id) {
        // Prevent deleting last floor
        const floors = this.getAll();
        if (floors.length <= 1) return false;
        this.save(floors.filter(f => f.id !== id));
        // Remove desks
        const desks = DeskAPI.getAll();
        delete desks[id];
        DeskAPI.save(desks);
        // Remove bookings
        BookingAPI.removeAllForFloor(id);
        // Remove layout
        const layouts = this.getAllLayouts();
        delete layouts[id];
        Store.set(STORAGE_KEYS.FLOOR_LAYOUTS, layouts);
        return true;
    },
    getAllLayouts() {
        return Store.get(STORAGE_KEYS.FLOOR_LAYOUTS, DEFAULT_FLOOR_LAYOUTS);
    },
    getLayout(floorId) {
        const layouts = this.getAllLayouts();
        const l = layouts[floorId] || {};
        return {
            rooms: l.rooms || [],
            zones: l.zones || [],
            walls: l.walls || [],
            boxes: l.boxes || [],
        };
    },
    // Save a full layout object for a floor
    saveLayout(floorId, layout) {
        const layouts = this.getAllLayouts();
        layouts[floorId] = layout;
        Store.set(STORAGE_KEYS.FLOOR_LAYOUTS, layouts);
    },
    updateRoomLabel(floorId, roomId, newLabel) {
        const layouts = this.getAllLayouts();
        const layout = layouts[floorId] || { rooms: [], zones: [] };
        const room = (layout.rooms || []).find(r => r.id === roomId);
        if (room) room.label = newLabel;
        Store.set(STORAGE_KEYS.FLOOR_LAYOUTS, layouts);
    },
    updateZoneLabel(floorId, zoneId, newLabel) {
        const layouts = this.getAllLayouts();
        const layout = layouts[floorId] || { rooms: [], zones: [] };
        const zone = (layout.zones || []).find(z => z.id === zoneId);
        if (zone) zone.label = newLabel;
        Store.set(STORAGE_KEYS.FLOOR_LAYOUTS, layouts);
    },
};

// ===== DESK API =====
const DeskAPI = {
    getAll() { return Store.get(STORAGE_KEYS.DESKS, DEFAULT_DESKS); },
    getForFloor(floorId) {
        const all = this.getAll();
        return all[floorId] ? JSON.parse(JSON.stringify(all[floorId])) : [];
    },
    save(desks) { Store.set(STORAGE_KEYS.DESKS, desks); },
    updatePosition(floorId, deskId, x, y) {
        const all = this.getAll();
        if (!all[floorId]) return;
        const desk = all[floorId].find(d => d.id === deskId);
        if (!desk) return;
        desk.x = x;
        desk.y = y;
        this.save(all);
    },
    renameDesk(floorId, deskId, newLabel) {
        const all = this.getAll();
        if (!all[floorId]) return;
        const desk = all[floorId].find(d => d.id === deskId);
        if (desk) desk.label = newLabel;
        this.save(all);
    },
    addDesk(floorId, x, y) {
        const all = this.getAll();
        if (!all[floorId]) all[floorId] = [];
        const existing = all[floorId];
        const num = existing.length + 1;
        const id = 'd_' + Date.now();
        const newDesk = { id, label: `N${num}`, x, y };
        existing.push(newDesk);
        this.save(all);
        return newDesk;
    },
    deleteDesk(floorId, deskId) {
        const all = this.getAll();
        if (!all[floorId]) return;
        all[floorId] = all[floorId].filter(d => d.id !== deskId);
        this.save(all);
        // Remove bookings for this desk
        const bookings = BookingAPI.getAll();
        const prefix = `${floorId}__${deskId}__`;
        Object.keys(bookings).forEach(k => {
            if (k.startsWith(prefix)) delete bookings[k];
        });
        BookingAPI.save(bookings);
    },
};

// ===== BOOKING API =====
const BookingAPI = {
    getAll() { return Store.get(STORAGE_KEYS.BOOKINGS, {}); },
    save(bookings) { Store.set(STORAGE_KEYS.BOOKINGS, bookings); },

    key(floorId, deskId, dateStr) { return `${floorId}__${deskId}__${dateStr}`; },

    getBooking(floorId, deskId, dateStr) {
        return this.getAll()[this.key(floorId, deskId, dateStr)] || null;
    },

    isBooked(floorId, deskId, dateStr) {
        return !!this.getBooking(floorId, deskId, dateStr);
    },

    book(floorId, deskId, dateStr, userId) {
        const bookings = this.getAll();
        const k = this.key(floorId, deskId, dateStr);
        if (bookings[k]) return false;
        bookings[k] = { userId, bookedAt: new Date().toISOString() };
        this.save(bookings);
        return true;
    },

    unbook(floorId, deskId, dateStr) {
        const bookings = this.getAll();
        const k = this.key(floorId, deskId, dateStr);
        delete bookings[k];
        this.save(bookings);
    },

    getBookingsForUser(userId) {
        const bookings = this.getAll();
        return Object.entries(bookings)
            .filter(([, v]) => v.userId === userId)
            .map(([k, v]) => {
                const parts = k.split('__');
                const dateStr = parts[parts.length - 1];
                const deskId = parts[parts.length - 2];
                const floorId = parts.slice(0, parts.length - 2).join('__');
                return { floorId, deskId, dateStr, ...v };
            })
            .sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    },

    getBookingsForFloorDate(floorId, dateStr) {
        const bookings = this.getAll();
        const prefix = `${floorId}__`;
        const suffix = `__${dateStr}`;
        return Object.entries(bookings)
            .filter(([k]) => k.startsWith(prefix) && k.endsWith(suffix))
            .map(([k, v]) => {
                const deskId = k.replace(prefix, '').replace(suffix, '');
                return { deskId, ...v };
            });
    },

    countUserBookingsOnDates(userId, dates) {
        const all = this.getAll();
        return Object.entries(all).filter(([k, v]) => {
            const parts = k.split('__');
            const dateStr = parts[parts.length - 1];
            return v.userId === userId && dates.includes(dateStr);
        }).length;
    },

    // Returns true if the user already has ANY booking on this date (any floor, any desk).
    // Used to enforce the "max 1 desk per day" rule for non-admin users.
    userHasBookingOnDate(userId, dateStr) {
        const all = this.getAll();
        return Object.entries(all).some(([k, v]) => {
            const parts = k.split('__');
            return v.userId === userId && parts[parts.length - 1] === dateStr;
        });
    },

    removeAllForUser(userId) {
        const bookings = this.getAll();
        Object.keys(bookings).forEach(k => {
            if (bookings[k].userId === userId) delete bookings[k];
        });
        this.save(bookings);
    },

    removeAllForFloor(floorId) {
        const bookings = this.getAll();
        const prefix = `${floorId}__`;
        Object.keys(bookings).forEach(k => {
            if (k.startsWith(prefix)) delete bookings[k];
        });
        this.save(bookings);
    },

    getAll_List() {
        const bookings = this.getAll();
        return Object.entries(bookings).map(([k, v]) => {
            const parts = k.split('__');
            const dateStr = parts[parts.length - 1];
            const deskId = parts[parts.length - 2];
            const floorId = parts.slice(0, parts.length - 2).join('__');
            return { floorId, deskId, dateStr, ...v };
        }).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    },
};

// ===== SESSION API =====
const SessionAPI = {
    get() { return Store.get(STORAGE_KEYS.SESSION, null); },
    set(userId, orgId) { Store.set(STORAGE_KEYS.SESSION, { userId, orgId, loginAt: new Date().toISOString() }); },
    clear() { localStorage.removeItem(STORAGE_KEYS.SESSION); },
    getCurrentUser() {
        const session = this.get();
        if (!session) return null;
        return UserAPI.getById(session.userId);
    },
};

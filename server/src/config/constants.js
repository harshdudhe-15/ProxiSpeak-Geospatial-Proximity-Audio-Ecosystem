/**
 * Global Constants & Configuration for ProxiSpeak
 */

export const DEFAULT_OFFICE_WIDTH = 2000;
export const DEFAULT_OFFICE_HEIGHT = 1200;
export const AVATAR_RADIUS = 20;

export const DEFAULT_HEARING_RADIUS = Number(process.env.PROXIMITY_HEARING_RADIUS) || 120;
export const DEFAULT_EXIT_GRACE = Number(process.env.PROXIMITY_EXIT_GRACE) || 25; // Hysteresis buffer

// Socket Event Contract
export const SOCKET_EVENTS = {
  // Client -> Server
  OFFICE_JOIN: 'office:join',
  OFFICE_LEAVE: 'office:leave',
  USER_MOVE: 'user:move',
  AUDIO_STATE: 'audio:state',
  RTC_OFFER: 'rtc:offer',
  RTC_ANSWER: 'rtc:answer',
  RTC_ICE_CANDIDATE: 'rtc:ice-candidate',

  // Server -> Client
  OFFICE_STATE: 'office:state',
  USER_JOINED: 'user:joined',
  USER_MOVED: 'user:moved',
  USER_LEFT: 'user:left',
  PROXIMITY_ENTERED: 'proximity:entered',
  PROXIMITY_LEFT: 'proximity:left',
  PROXIMITY_PREWARM: 'proximity:prewarm',
  AUDIO_STATE_CHANGED: 'audio:state-changed',
  SERVER_ERROR: 'server:error',
};

// Default office layout template - ProxiSpeak Headquarters
export const DEFAULT_OFFICE_TEMPLATE = {
  name: 'ProxiSpeak Headquarters',
  width: DEFAULT_OFFICE_WIDTH,
  height: DEFAULT_OFFICE_HEIGHT,
  zones: [
    { id: 'zone-reception', name: 'Welcome Lounge & Reception', x: 40, y: 40, width: 480, height: 380, color: '#161c28' },
    { id: 'zone-conf-boardroom', name: 'Executive Boardroom (Apollo)', x: 40, y: 460, width: 480, height: 700, color: '#18151f' },
    { id: 'zone-central-atrium', name: 'Central Galleria & Atrium', x: 520, y: 40, width: 180, height: 1120, color: '#111622' },
    { id: 'zone-engineering', name: 'Engineering & AI Research Hall', x: 700, y: 40, width: 1260, height: 560, color: '#0f172a' },
    { id: 'zone-breakroom', name: 'The Hub Cafe & Cafeteria', x: 700, y: 640, width: 620, height: 520, color: '#131a24' },
    { id: 'zone-oasis-lounge', name: 'Oasis Lounge & Common Space', x: 1340, y: 640, width: 620, height: 520, color: '#171c26' }
  ],
  furniture: [
    // Reception & Welcome Lounge
    { id: 'f-reception-desk', type: 'reception-desk', x: 120, y: 60, width: 180, height: 50, label: 'Reception Concierge', soundBlocking: false },
    { id: 'f-couch-1', type: 'couch', x: 80, y: 220, width: 160, height: 60, label: 'Waiting Lounge Sofa', soundBlocking: false },
    { id: 'f-table-1', type: 'table', x: 80, y: 300, width: 140, height: 50, label: 'Glass Coffee Table', soundBlocking: false },
    { id: 'f-plant-1', type: 'plant', x: 380, y: 70, width: 44, height: 44, label: 'Monstera Palm', soundBlocking: false },

    // Boardroom
    { id: 'f-conf-table', type: 'conf-table', x: 160, y: 660, width: 240, height: 320, label: 'Executive Board Table', soundBlocking: false },
    { id: 'f-conf-screen', type: 'screen', x: 200, y: 470, width: 160, height: 20, label: '4K Ultra-Wide Display', soundBlocking: false },
    { id: 'f-conf-whiteboard', type: 'whiteboard', x: 60, y: 660, width: 20, height: 180, label: 'Sprint Whiteboard', soundBlocking: false },

    // Engineering Pods (Desks)
    { id: 'f-desk-1', type: 'desk', x: 760, y: 110, width: 180, height: 85, label: 'Frontend Pod', soundBlocking: false },
    { id: 'f-desk-2', type: 'desk', x: 1040, y: 110, width: 180, height: 85, label: 'Backend Pod', soundBlocking: false },
    { id: 'f-desk-3', type: 'desk', x: 1320, y: 110, width: 180, height: 85, label: 'AI/Audio Pod', soundBlocking: false },
    { id: 'f-desk-4', type: 'desk', x: 760, y: 310, width: 180, height: 85, label: 'DevOps Pod', soundBlocking: false },
    { id: 'f-desk-5', type: 'desk', x: 1040, y: 310, width: 180, height: 85, label: 'Design Studio', soundBlocking: false },
    { id: 'f-desk-6', type: 'desk', x: 1320, y: 310, width: 180, height: 85, label: 'QA Lab', soundBlocking: false },
    { id: 'f-table-turing', type: 'table', x: 1680, y: 220, width: 150, height: 120, label: 'Turing Meeting Table', soundBlocking: false },

    // The Hub Cafe & Cafeteria
    { id: 'f-cafe-bar', type: 'bar', x: 740, y: 700, width: 260, height: 60, label: 'Barista Counter', soundBlocking: false },
    { id: 'f-cafe-1', type: 'dining-table', x: 760, y: 840, width: 160, height: 90, label: 'Dining Table A', soundBlocking: false },
    { id: 'f-cafe-2', type: 'dining-table', x: 760, y: 990, width: 160, height: 90, label: 'Dining Table B', soundBlocking: false },
    { id: 'f-watercooler', type: 'watercooler', x: 1060, y: 700, width: 50, height: 50, label: 'Water Cooler', soundBlocking: false },
    { id: 'f-pantry', type: 'pantry', x: 1140, y: 700, width: 120, height: 50, label: 'Snack Station', soundBlocking: false },

    // Oasis Lounge & Common Area
    { id: 'f-couch-oasis', type: 'couch', x: 1420, y: 740, width: 220, height: 90, label: 'Modular Sofa', soundBlocking: false },
    { id: 'f-table-oasis', type: 'table', x: 1440, y: 860, width: 160, height: 60, label: 'Lounge Table', soundBlocking: false },
    { id: 'f-pingpong', type: 'pingpong', x: 1420, y: 1000, width: 180, height: 95, label: 'Game Table', soundBlocking: false },
    { id: 'f-bookshelf', type: 'bookshelf', x: 1880, y: 740, width: 40, height: 240, label: 'Design Library', soundBlocking: false },
    { id: 'f-plant-oasis', type: 'plant', x: 1780, y: 1010, width: 50, height: 50, label: 'Fiddle Leaf Fig', soundBlocking: false }
  ],
  walls: [
    // Boardroom acoustic glass walls
    { id: 'w-conf-top', x: 40, y: 440, width: 480, height: 16, soundBlocking: true, label: 'Acoustic Glass Wall' },
    { id: 'w-conf-east-top', x: 520, y: 440, width: 16, height: 220, soundBlocking: true, label: 'Acoustic Glass Wall' },
    // Doorway gap: y: 660 to 760 (100px wide open entrance doorway)
    { id: 'w-conf-east-bot', x: 520, y: 760, width: 16, height: 400, soundBlocking: true, label: 'Acoustic Glass Wall' },

    // Dividing acoustic barrier wall between Hall and Breakroom/Lounge
    { id: 'w-hall-div-1', x: 700, y: 620, width: 380, height: 16, soundBlocking: true, label: 'Acoustic Barrier Wall' },
    // Doorway gap: x: 1080 to 1200 (120px wide open entrance)
    { id: 'w-hall-div-2', x: 1200, y: 620, width: 760, height: 16, soundBlocking: true, label: 'Acoustic Barrier Wall' },

    // Turing Pod acoustic glass walls
    { id: 'w-turing-west-top', x: 1620, y: 40, width: 16, height: 160, soundBlocking: true, label: 'Glass Partition' },
    // Doorway gap: y: 200 to 280 (80px open doorway)
    { id: 'w-turing-west-bot', x: 1620, y: 280, width: 16, height: 180, soundBlocking: true, label: 'Glass Partition' },
    { id: 'w-turing-south', x: 1620, y: 460, width: 340, height: 16, soundBlocking: true, label: 'Glass Partition' }
  ]
};

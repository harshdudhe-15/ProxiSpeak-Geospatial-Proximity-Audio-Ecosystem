/**
 * Global Constants & Configuration for ProxiSpeak
 */

export const DEFAULT_OFFICE_WIDTH = 1400;
export const DEFAULT_OFFICE_HEIGHT = 900;
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
  AUDIO_STATE_CHANGED: 'audio:state-changed',
  SERVER_ERROR: 'server:error',
};

// Default office layout template
export const DEFAULT_OFFICE_TEMPLATE = {
  name: 'ProxiSpeak Headquarters',
  width: DEFAULT_OFFICE_WIDTH,
  height: DEFAULT_OFFICE_HEIGHT,
  zones: [
    { id: 'zone-lobby', name: 'Welcome Lounge', x: 50, y: 50, width: 350, height: 260, color: '#1e293b' },
    { id: 'zone-open-office', name: 'Engineering Hall', x: 450, y: 50, width: 900, height: 480, color: '#0f172a' },
    { id: 'zone-conf-room', name: 'Executive Boardroom', x: 50, y: 350, width: 350, height: 500, color: '#111827' },
    { id: 'zone-breakroom', name: 'Kitchen & Games', x: 450, y: 570, width: 900, height: 280, color: '#1e1e2f' }
  ],
  furniture: [
    // Lounge couches & coffee table
    { id: 'f-couch-1', type: 'couch', x: 100, y: 100, width: 140, height: 40, label: 'Lounge Sofa', soundBlocking: false },
    { id: 'f-table-1', type: 'table', x: 100, y: 160, width: 140, height: 60, label: 'Coffee Table', soundBlocking: false },

    // Boardroom long conference table & chairs (Glass acoustic walls isolate sound!)
    { id: 'f-conf-table', type: 'table', x: 130, y: 480, width: 190, height: 240, label: 'Conference Table', soundBlocking: false },

    // Engineering Desks Pod 1
    { id: 'f-desk-1', type: 'desk', x: 520, y: 120, width: 160, height: 80, label: 'Frontend Pod', soundBlocking: false },
    { id: 'f-desk-2', type: 'desk', x: 740, y: 120, width: 160, height: 80, label: 'Backend Pod', soundBlocking: false },
    { id: 'f-desk-3', type: 'desk', x: 960, y: 120, width: 160, height: 80, label: 'Design Pod', soundBlocking: false },

    // Engineering Desks Pod 2
    { id: 'f-desk-4', type: 'desk', x: 520, y: 300, width: 160, height: 80, label: 'DevOps Pod', soundBlocking: false },
    { id: 'f-desk-5', type: 'desk', x: 740, y: 300, width: 160, height: 80, label: 'AI/ML Pod', soundBlocking: false },
    { id: 'f-desk-6', type: 'desk', x: 960, y: 300, width: 160, height: 80, label: 'QA Lab', soundBlocking: false },

    // Breakroom cafeteria tables
    { id: 'f-cafe-1', type: 'table', x: 550, y: 660, width: 140, height: 90, label: 'Dining Table', soundBlocking: false },
    { id: 'f-cafe-2', type: 'table', x: 770, y: 660, width: 140, height: 90, label: 'Ping Pong Table', soundBlocking: false },
    { id: 'f-watercooler', type: 'watercooler', x: 1100, y: 640, width: 50, height: 50, label: 'Watercooler Chat', soundBlocking: false }
  ],
  walls: [
    // Outer boundaries are clamped in movement, inner acoustic walls:
    // Boardroom acoustic partition wall (Left to center) with a doorway gap
    { id: 'w-conf-top', x: 50, y: 330, width: 350, height: 16, soundBlocking: true, label: 'Acoustic Glass Partition' },
    { id: 'w-conf-right-top', x: 400, y: 330, width: 16, height: 180, soundBlocking: true, label: 'Acoustic Glass Partition' },
    // Doorway gap between y: 510 and y: 590
    { id: 'w-conf-right-bottom', x: 400, y: 590, width: 16, height: 260, soundBlocking: true, label: 'Acoustic Glass Partition' },

    // Partition between Engineering Hall and Breakroom with opening
    { id: 'w-hall-break-1', x: 450, y: 550, width: 420, height: 16, soundBlocking: true, label: 'Dividing Acoustic Wall' },
    { id: 'w-hall-break-2', x: 970, y: 550, width: 380, height: 16, soundBlocking: true, label: 'Dividing Acoustic Wall' }
  ]
};

// Shared DTOs — shapes the API returns and the display consumes. The display
// snapshot is also what gets cached in localStorage, so keep it JSON-plain.

export type ZoneTheme = "dark" | "light" | "liturgical";

export type ContentType = "announcement" | "verse" | "qr" | "image";

export type SnapshotItem = {
  id: string;
  type: ContentType;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  publishAt: string | null;
  expiresAt: string | null;
  durationSeconds: number | null;
  sortOrder: number;
};

export type ProgramRow = { time: string; title: string; subtitle?: string };

export type SnapshotEvent = {
  id: string;
  title: string;
  kind: "service" | "other";
  /** 0=Sunday … 6=Saturday (recurring) — XOR `date` (one-off, YYYY-MM-DD). */
  weekday: number | null;
  date: string | null;
  startTime: string; // "11:00:00"
  durationMinutes: number;
  program: ProgramRow[];
  preWindowMin: number;
  postWindowMin: number;
};

export type Emergency = { id: string; body: string; expiresAt: string };

export type ZoneSnapshot = {
  version: string;
  generatedAt: string;
  zone: {
    id: string;
    name: string;
    theme: ZoneTheme;
    settings: Record<string, unknown>;
  } | null;
  church: {
    id: string;
    name: string;
    timezone: string;
    vippsNumber: string | null;
    settings: Record<string, unknown>;
  } | null;
  items: SnapshotItem[];
  events: SnapshotEvent[];
  emergency: Emergency | null;
  screenId: string;
  screenName: string;
};

export type HeartbeatResponse = {
  screenId: string;
  zoneId: string | null;
  version: string | null;
  emergency: Emergency | null;
};

export type DisplayMode = "pre_service" | "in_service" | "post_service" | "weekly";

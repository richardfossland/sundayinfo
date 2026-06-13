// AI "paste → ferdig slide-pakke": the request-builder and response-parser for
// the Claude Messages API call live here as PURE functions so they can be
// unit-tested with canned fixtures — no network, no key. The route in
// app/api/compose wires them to the actual fetch; the editor form falls back to
// the offline heuristic (parseRawText) whenever the key is absent or the model
// output fails validation.
//
// The LLM only SUGGESTS. Every field below is validated against this strict
// schema and clamped before it ever touches app state; the server/engine and
// the editor decide what to keep. Bible verse TEXT is deliberately NOT
// generated (Bibel 2011 is copyrighted) — at most a reference string is
// detected, and the editor pastes the verse itself.

import type { ContentType, ZoneTheme } from "@/lib/types";

/** A zone the editor may route to — passed to the model as routing options. */
export type ComposeZone = { id: string; name: string; theme: ZoneTheme };

/** Liturgical accent names mirror lib/churchyear/calendar.ts LiturgicalColor. */
export type ChurchAccent = "fiolett" | "hvit" | "groenn" | "roed";

export const CONTENT_TYPES: ContentType[] = ["announcement", "verse", "qr", "image"];
export const CHURCH_ACCENTS: ChurchAccent[] = ["fiolett", "hvit", "groenn", "roed"];

/** What the model produces, after validation. A superset of ParsedContent so
 * the form can use it as a drop-in upgrade of the heuristic result. */
export type ComposedSlide = {
  type: ContentType;
  title: string;
  body: string;
  url: string | null;
  /** Bible reference only (e.g. "Joh 3,16") — never the verse text. */
  reference: string | null;
  /** ISO-8601 instant, or null. Suggested only — editor confirms. */
  expiresAt: string | null;
  /** Zone IDs the model recommends, filtered to the allowed set. */
  zoneIds: string[];
  /** Suggested rotation duration on screen, seconds (clamped 5..120) or null. */
  durationSeconds: number | null;
  /** Suggested church-year accent, or null when not seasonally relevant. */
  accent: ChurchAccent | null;
  /** Whether these values came from the model (true) or the fallback (false). */
  ai: boolean;
};

/** The Anthropic model id. Matches the suite default (current Opus). */
export const COMPOSE_MODEL = "claude-opus-4-8";

const MAX_RAW_CHARS = 8_000;
const MIN_DURATION = 5;
const MAX_DURATION = 120;

/** Tool the model must call exactly once. `strict: true` + the route's schema
 * validation keep the output inside these bounds. */
export const COMPOSE_TOOL = {
  name: "lag_slide",
  description:
    "Strukturer en innliming til ett infoskjerm-slide for en menighet. " +
    "IKKE skriv eller gjengi bibelvers-tekst (opphavsrettslig beskyttet) — " +
    "sett kun referansen i 'reference' om et vers limes inn; redaktøren limer selve verset.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      type: {
        type: "string",
        enum: CONTENT_TYPES,
        description:
          "announcement = vanlig kunngjøring; verse = bibelvers/sitat; " +
          "qr = lenke som skal bli QR (påmelding, Vipps); image = bilde-URL.",
      },
      title: { type: "string", description: "Kort, ryddig tittel. Tom for verse." },
      body: {
        type: "string",
        description: "Strammet brødtekst. For verse: selve sitatet UTEN referanse.",
      },
      url: { type: ["string", "null"], description: "Første relevante URL, ellers null." },
      reference: {
        type: ["string", "null"],
        description: "Bibelreferanse som 'Joh 3,16', ellers null. ALDRI versteksten.",
      },
      expiresAt: {
        type: ["string", "null"],
        description:
          "ISO-8601 utløpstidspunkt utledet av en dato i teksten, ellers null.",
      },
      zoneId: {
        type: ["string", "null"],
        description: "ID-en til sonen dette passer best i, fra listen, ellers null.",
      },
      durationSeconds: {
        type: ["integer", "null"],
        description: "Foreslått visningstid i sekunder (5–120), ellers null.",
      },
      accent: {
        type: ["string", "null"],
        enum: [...CHURCH_ACCENTS, null],
        description: "Liturgisk fargeaksent om relevant, ellers null.",
      },
    },
    required: ["type", "title", "body"],
  },
} as const;

/** A single Anthropic Messages API request body. Pure — no I/O. */
export function buildComposeRequest(
  raw: string,
  zones: ComposeZone[],
  now: Date = new Date(),
): {
  model: string;
  max_tokens: number;
  system: string;
  tool_choice: { type: "tool"; name: string };
  tools: (typeof COMPOSE_TOOL)[];
  messages: { role: "user"; content: string }[];
} {
  const text = raw.slice(0, MAX_RAW_CHARS);
  const zoneList =
    zones.length > 0
      ? zones.map((z) => `- ${z.name} (id: ${z.id}, tema: ${z.theme})`).join("\n")
      : "(ingen soner oppgitt)";

  const system = [
    "Du hjelper en norsk menighet med å lage ett pent infoskjerm-slide av en innliming.",
    "Innlimingen kan være en e-post, plakattekst, et bibelvers eller en enkel beskjed.",
    "Svar ALLTID ved å kalle verktøyet lag_slide nøyaktig én gang.",
    "Skriv på norsk. Hold tittelen kort og brødteksten strammet, men ikke finn på nye fakta.",
    "Hvis teksten ser ut som et bibelvers: sett type=verse, legg referansen i 'reference',",
    "og IKKE gjengi eller omskriv selve verset utover det brukeren limte inn (opphavsrett).",
    `Dagens dato er ${now.toISOString().slice(0, 10)}. Utled expiresAt kun fra en konkret dato i teksten.`,
    "Velg zoneId kun fra listen under; bruk null om du er usikker.",
    "",
    "Tilgjengelige soner:",
    zoneList,
  ].join("\n");

  return {
    model: COMPOSE_MODEL,
    max_tokens: 1024,
    system,
    tool_choice: { type: "tool", name: COMPOSE_TOOL.name },
    tools: [COMPOSE_TOOL],
    messages: [{ role: "user", content: text }],
  };
}

/** Raw tool-call input shape, before validation. */
type RawToolInput = {
  type?: unknown;
  title?: unknown;
  body?: unknown;
  url?: unknown;
  reference?: unknown;
  expiresAt?: unknown;
  zoneId?: unknown;
  durationSeconds?: unknown;
  accent?: unknown;
};

/** Minimal shape of an Anthropic Messages API response we depend on. */
export type AnthropicResponse = {
  stop_reason?: string;
  content?: Array<{ type: string; name?: string; input?: unknown }>;
};

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function firstHttpUrl(v: unknown): string | null {
  const s = asString(v);
  const m = s.match(/https?:\/\/[^\s)>\]]+/i);
  return m ? m[0] : null;
}

function validIso(v: unknown): string | null {
  const s = asString(v);
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

function clampDuration(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  if (n < MIN_DURATION) return MIN_DURATION;
  if (n > MAX_DURATION) return MAX_DURATION;
  return n;
}

/** Validate + sanitize a model response into a ComposedSlide, or null if the
 * model didn't call the tool / the input is unusable. PURE — no I/O. The set of
 * allowed zone IDs gates routing so the model can never place content in a zone
 * the editor may not touch. */
export function parseComposeResponse(
  res: AnthropicResponse,
  allowedZoneIds: string[],
): ComposedSlide | null {
  const block = (res.content ?? []).find(
    (b) => b.type === "tool_use" && b.name === COMPOSE_TOOL.name,
  );
  if (!block || typeof block.input !== "object" || block.input === null) return null;
  const input = block.input as RawToolInput;

  const typeStr = asString(input.type) as ContentType;
  const type: ContentType = CONTENT_TYPES.includes(typeStr) ? typeStr : "announcement";

  const reference = type === "verse" ? asString(input.reference) || null : null;
  const url = type === "qr" ? firstHttpUrl(input.url) : firstHttpUrl(input.url);

  const accentStr = asString(input.accent) as ChurchAccent;
  const accent: ChurchAccent | null = CHURCH_ACCENTS.includes(accentStr)
    ? accentStr
    : null;

  const allowed = new Set(allowedZoneIds);
  const zoneIdRaw = asString(input.zoneId);
  const zoneIds = zoneIdRaw && allowed.has(zoneIdRaw) ? [zoneIdRaw] : [];

  return {
    type,
    title: type === "verse" ? "" : asString(input.title).slice(0, 200),
    body: asString(input.body).slice(0, 4000),
    url,
    reference,
    expiresAt: validIso(input.expiresAt),
    zoneIds,
    durationSeconds: clampDuration(input.durationSeconds),
    accent,
    ai: true,
  };
}

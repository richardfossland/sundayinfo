import { describe, expect, it } from "vitest";

import {
  buildComposeRequest,
  parseComposeResponse,
  COMPOSE_MODEL,
  COMPOSE_TOOL,
  type AnthropicResponse,
  type ComposeZone,
} from "@/lib/compose/composeSchema";

const ZONES: ComposeZone[] = [
  { id: "z1", name: "Foajé", theme: "light" },
  { id: "z2", name: "Kirkesal", theme: "liturgical" },
];

/** A canned tool_use response — no network, no key. */
function toolResponse(input: Record<string, unknown>): AnthropicResponse {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", name: COMPOSE_TOOL.name, input }],
  };
}

describe("buildComposeRequest", () => {
  it("uses the current Opus model and forces the tool", () => {
    const req = buildComposeRequest("Høstfest", ZONES, new Date("2026-06-13T10:00:00Z"));
    expect(req.model).toBe(COMPOSE_MODEL);
    expect(COMPOSE_MODEL).toBe("claude-opus-4-8");
    expect(req.tool_choice).toEqual({ type: "tool", name: "lag_slide" });
    expect(req.tools).toHaveLength(1);
  });

  it("puts the date and the zone list into the system prompt", () => {
    const req = buildComposeRequest("x", ZONES, new Date("2026-06-13T10:00:00Z"));
    expect(req.system).toContain("2026-06-13");
    expect(req.system).toContain("z1");
    expect(req.system).toContain("Kirkesal");
  });

  it("forbids generating Bible text in the prompt", () => {
    const req = buildComposeRequest("x", ZONES);
    expect(req.system.toLowerCase()).toContain("opphavsrett");
    expect(COMPOSE_TOOL.description.toLowerCase()).toContain("ikke");
  });

  it("truncates very long input and carries it as a user message", () => {
    const huge = "a".repeat(20_000);
    const req = buildComposeRequest(huge, ZONES);
    expect(req.messages[0].role).toBe("user");
    expect(req.messages[0].content.length).toBeLessThanOrEqual(8_000);
  });
});

describe("parseComposeResponse", () => {
  it("maps a clean announcement", () => {
    const slide = parseComposeResponse(
      toolResponse({
        type: "announcement",
        title: "Høstfest 14. november",
        body: "Velkommen til høstfest i kjelleren.",
        url: null,
        reference: null,
        expiresAt: "2026-11-15T00:00:00Z",
        zoneId: "z1",
        durationSeconds: 20,
        accent: "groenn",
      }),
      ["z1", "z2"],
    );
    expect(slide).not.toBeNull();
    expect(slide!.type).toBe("announcement");
    expect(slide!.title).toBe("Høstfest 14. november");
    expect(slide!.zoneIds).toEqual(["z1"]);
    expect(slide!.durationSeconds).toBe(20);
    expect(slide!.accent).toBe("groenn");
    expect(slide!.ai).toBe(true);
  });

  it("drops a Bible reference's title and keeps only the reference for verse", () => {
    const slide = parseComposeResponse(
      toolResponse({
        type: "verse",
        title: "noe modellen ikke burde sette",
        body: "For så høyt har Gud elsket verden",
        reference: "Joh 3,16",
      }),
      [],
    );
    expect(slide!.type).toBe("verse");
    expect(slide!.title).toBe(""); // verse never carries a title
    expect(slide!.reference).toBe("Joh 3,16");
    expect(slide!.body).toContain("Gud elsket");
  });

  it("rejects routing to a zone the editor may not touch", () => {
    const slide = parseComposeResponse(
      toolResponse({ type: "announcement", title: "x", body: "y", zoneId: "z9" }),
      ["z1", "z2"], // z9 not allowed
    );
    expect(slide!.zoneIds).toEqual([]);
  });

  it("clamps an out-of-range duration", () => {
    const lo = parseComposeResponse(
      toolResponse({ type: "announcement", title: "x", body: "y", durationSeconds: 1 }),
      [],
    );
    const hi = parseComposeResponse(
      toolResponse({ type: "announcement", title: "x", body: "y", durationSeconds: 9999 }),
      [],
    );
    expect(lo!.durationSeconds).toBe(5);
    expect(hi!.durationSeconds).toBe(120);
  });

  it("nulls an invalid expiresAt and an unknown accent", () => {
    const slide = parseComposeResponse(
      toolResponse({
        type: "announcement",
        title: "x",
        body: "y",
        expiresAt: "not a date",
        accent: "lilla",
      }),
      [],
    );
    expect(slide!.expiresAt).toBeNull();
    expect(slide!.accent).toBeNull();
  });

  it("coerces an unknown type to announcement", () => {
    const slide = parseComposeResponse(
      toolResponse({ type: "banner", title: "x", body: "y" }),
      [],
    );
    expect(slide!.type).toBe("announcement");
  });

  it("extracts only a well-formed http URL", () => {
    const ok = parseComposeResponse(
      toolResponse({ type: "qr", title: "Påmelding", body: "", url: "https://ex.com/a" }),
      [],
    );
    const bad = parseComposeResponse(
      toolResponse({ type: "qr", title: "Påmelding", body: "", url: "ikke en url" }),
      [],
    );
    expect(ok!.url).toBe("https://ex.com/a");
    expect(bad!.url).toBeNull();
  });

  it("returns null when the model did not call the tool", () => {
    const res: AnthropicResponse = {
      stop_reason: "end_turn",
      content: [{ type: "text" }],
    };
    expect(parseComposeResponse(res, [])).toBeNull();
  });

  it("returns null on a missing / malformed input block", () => {
    expect(parseComposeResponse({ content: [] }, [])).toBeNull();
    expect(
      parseComposeResponse(
        { content: [{ type: "tool_use", name: "lag_slide", input: "nope" }] },
        [],
      ),
    ).toBeNull();
  });

  it("clamps overlong title and body", () => {
    const slide = parseComposeResponse(
      toolResponse({
        type: "announcement",
        title: "t".repeat(500),
        body: "b".repeat(5000),
      }),
      [],
    );
    expect(slide!.title.length).toBe(200);
    expect(slide!.body.length).toBe(4000);
  });
});

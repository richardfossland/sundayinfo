import { describe, expect, it } from "vitest";

import { parseRawText } from "@/lib/compose/parseRawText";

describe("parseRawText", () => {
  it("uses a short first line as title", () => {
    const r = parseRawText("Høstfest 14. november\nVelkommen til høstfest i kjelleren.\nTa med kake!");
    expect(r.title).toBe("Høstfest 14. november");
    expect(r.body).toContain("Velkommen");
    expect(r.body).toContain("kake");
  });

  it("extracts a URL for the QR card and strips it from the body", () => {
    const r = parseRawText("Påmelding leir\nMeld deg på her: https://example.com/leir innen fredag");
    expect(r.url).toBe("https://example.com/leir");
    expect(r.body).not.toContain("https://");
  });

  it("detects a Bible verse with reference", () => {
    const r = parseRawText("«For så høyt har Gud elsket verden»\nJoh 3,16");
    expect(r.reference).toBe("Joh 3,16");
    expect(r.body).toContain("For så høyt");
    expect(r.title).toBe("");
  });

  it("detects numbered-book references", () => {
    const r = parseRawText("Kjærligheten er tålmodig\n1 Kor 13,4-7");
    expect(r.reference).toBe("1 Kor 13,4-7");
  });

  it("does not title-ify a single long paragraph", () => {
    const long = "Dette er en veldig lang tekst som åpenbart ikke er noen tittel fordi den bare fortsetter og fortsetter uten stopp i det hele tatt.";
    const r = parseRawText(long);
    expect(r.title).toBe("");
    expect(r.body).toBe(long);
  });

  it("handles empty input", () => {
    expect(parseRawText("")).toEqual({ title: "", body: "", url: null, reference: null });
  });
});

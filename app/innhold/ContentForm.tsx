"use client";

// Shared create/edit form. The "genius" bit: paste anything into the top box
// and it becomes a structured slide — title/body split, URLs turned into a QR
// card, Bible references flipping the type to verse. Preview uses the same
// CSS classes as the real display.

import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api, errorText } from "@/lib/client/api";
import { parseRawText } from "@/lib/compose/parseRawText";
import type { ComposedSlide } from "@/lib/compose/composeSchema";

type Zone = { id: string; name: string };

export type ContentDraft = {
  id?: string;
  type: "announcement" | "verse" | "qr" | "image";
  title: string;
  bodyText: string;
  reference: string;
  url: string;
  imageUrl: string;
  publishAt: string; // datetime-local value or ""
  expiresAt: string;
  zoneIds: string[];
};

export const EMPTY_DRAFT: ContentDraft = {
  type: "announcement",
  title: "",
  bodyText: "",
  reference: "",
  url: "",
  imageUrl: "",
  publishAt: "",
  expiresAt: "",
  zoneIds: [],
};

function toIso(local: string): string | null {
  return local ? new Date(local).toISOString() : null;
}

/** ISO instant → a `datetime-local` input value in the browser's local zone. */
function toLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default function ContentForm({
  churchId,
  initial,
  vippsNumber,
}: {
  churchId: string;
  initial: ContentDraft;
  vippsNumber?: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ContentDraft>(initial);
  const [paste, setPaste] = useState("");
  const [zones, setZones] = useState<Zone[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // AI compose state: aiSuggested flips on when the last fill came from the
  // model, so we can show "foreslått av AI, rediger fritt". aiBusy gates the
  // button while the server route runs.
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSuggested, setAiSuggested] = useState(false);

  useEffect(() => {
    api
      .get<{ zones: Zone[] }>(`/api/zones?churchId=${churchId}`)
      .then((d) => {
        setZones(d.zones);
        // Default new content into every zone (one-zone churches never think
        // about zones at all).
        setDraft((cur) =>
          cur.id || cur.zoneIds.length > 0
            ? cur
            : { ...cur, zoneIds: d.zones.map((z) => z.id) },
        );
      })
      .catch(() => setZones([]));
  }, [churchId]);

  function applyPaste(text: string) {
    setPaste(text);
    setAiSuggested(false);
    if (!text.trim()) return;
    // Instant, offline heuristic on every keystroke — this is the floor and the
    // fallback. The AI upgrade is an explicit button so we don't call the model
    // on every keystroke.
    const parsed = parseRawText(text);
    setDraft((cur) => ({
      ...cur,
      type: parsed.reference ? "verse" : parsed.url ? "qr" : cur.type,
      title: parsed.title || cur.title,
      bodyText: parsed.body || cur.bodyText,
      reference: parsed.reference ?? cur.reference,
      url: parsed.url ?? cur.url,
    }));
  }

  async function suggestWithAi() {
    if (!paste.trim()) return;
    setAiBusy(true);
    setError(null);
    try {
      const { slide } = await api.post<{ slide: ComposedSlide }>("/api/compose", {
        churchId,
        raw: paste,
      });
      // The model only suggests — we map it onto the draft and the editor edits
      // freely. Zone routing is intersected with the zones we actually loaded.
      const allowed = new Set(zones.map((z) => z.id));
      const suggestedZones = slide.zoneIds.filter((id) => allowed.has(id));
      setDraft((cur) => ({
        ...cur,
        type: slide.type,
        title: slide.title || cur.title,
        bodyText: slide.body || cur.bodyText,
        reference: slide.reference ?? cur.reference,
        url: slide.url ?? cur.url,
        expiresAt: slide.expiresAt ? toLocal(slide.expiresAt) : cur.expiresAt,
        zoneIds: suggestedZones.length > 0 ? suggestedZones : cur.zoneIds,
      }));
      // slide.ai is false when the server fell back to the offline heuristic
      // (no key / model error) — only claim "AI" when it really was.
      setAiSuggested(slide.ai);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setAiBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      if (draft.type === "verse" && draft.reference) payload.reference = draft.reference;
      if (draft.type === "qr" && draft.url) {
        payload.url = draft.url;
        payload.qrDataUrl = await QRCode.toDataURL(draft.url, {
          width: 512,
          margin: 1,
        });
        payload.qrLabel = draft.url.replace(/^https?:\/\//, "").slice(0, 60);
      }
      if (draft.type === "image" && draft.imageUrl) payload.url = draft.imageUrl;

      const body = {
        churchId,
        type: draft.type,
        title: draft.title,
        bodyText: draft.bodyText,
        payload,
        publishAt: toIso(draft.publishAt),
        expiresAt: toIso(draft.expiresAt),
        zoneIds: draft.zoneIds,
      };
      if (draft.id) {
        await api.patch(`/api/content/${draft.id}`, body);
      } else {
        await api.post("/api/content", body);
      }
      router.push("/innhold");
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <>
      {!draft.id && (
        <div className="card">
          <h2>Lim inn tekst</h2>
          <div className="field">
            <textarea
              value={paste}
              onChange={(e) => applyPaste(e.target.value)}
              placeholder={
                "Lim inn hva som helst — en e-post, plakattekst eller et bibelvers.\nVi lager en pen slide av det automatisk."
              }
            />
            <p className="hint">
              Første linje blir tittel. Lenker blir QR-kode. Bibelvers gjenkjennes.
            </p>
            <button
              type="button"
              className="btn btn-sm"
              disabled={aiBusy || !paste.trim()}
              onClick={suggestWithAi}
            >
              {aiBusy ? "Tenker …" : "✨ Foreslå med AI"}
            </button>
            {aiSuggested && (
              <p className="hint" style={{ marginTop: 8, color: "var(--accent, #c9982f)" }}>
                Foreslått av AI, rediger fritt. Bibelvers limer du inn selv.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <h2>{draft.id ? "Rediger innhold" : "Detaljer"}</h2>
        <div className="field">
          <label htmlFor="c-type">Type</label>
          <select
            id="c-type"
            value={draft.type}
            onChange={(e) =>
              setDraft({ ...draft, type: e.target.value as ContentDraft["type"] })
            }
          >
            <option value="announcement">Kunngjøring</option>
            <option value="verse">Bibelvers / sitat</option>
            <option value="qr">QR-lenke (påmelding, Vipps …)</option>
            <option value="image">Bilde (URL)</option>
          </select>
        </div>

        {draft.type !== "verse" && (
          <div className="field">
            <label htmlFor="c-title">Tittel</label>
            <input
              id="c-title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              maxLength={200}
            />
          </div>
        )}

        {draft.type !== "image" && (
          <div className="field">
            <label htmlFor="c-body">{draft.type === "verse" ? "Verset" : "Tekst"}</label>
            <textarea
              id="c-body"
              value={draft.bodyText}
              onChange={(e) => setDraft({ ...draft, bodyText: e.target.value })}
              maxLength={4000}
            />
          </div>
        )}

        {draft.type === "verse" && (
          <div className="field">
            <label htmlFor="c-ref">Referanse</label>
            <input
              id="c-ref"
              value={draft.reference}
              onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
              placeholder="Joh 3,16"
            />
          </div>
        )}

        {draft.type === "qr" && (
          <div className="field">
            <label htmlFor="c-url">Lenke (blir QR-kode)</label>
            <input
              id="c-url"
              type="url"
              value={draft.url}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              placeholder="https://…"
            />
            {vippsNumber && (
              <p className="hint">
                Tips: Vipps-kollekt? Bruk{" "}
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      url: `https://qr.vipps.no/28/2/01/031/${vippsNumber}`,
                      title: draft.title || "Gi med Vipps",
                    })
                  }
                >
                  Vippsnummer {vippsNumber}
                </button>
              </p>
            )}
          </div>
        )}

        {draft.type === "image" && (
          <div className="field">
            <label htmlFor="c-img">Bilde-URL</label>
            <input
              id="c-img"
              type="url"
              value={draft.imageUrl}
              onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
              placeholder="https://…/plakat.jpg"
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="c-pub">Vis fra (valgfritt)</label>
          <input
            id="c-pub"
            type="datetime-local"
            value={draft.publishAt}
            onChange={(e) => setDraft({ ...draft, publishAt: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="c-exp">Utløper (anbefalt!)</label>
          <input
            id="c-exp"
            type="datetime-local"
            value={draft.expiresAt}
            onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })}
          />
          <p className="hint">
            Innhold med utløpsdato forsvinner av seg selv — skjermen viser aldri
            gammelt stoff.
          </p>
        </div>

        {zones.length > 1 && (
          <div className="field">
            <label>Vises i soner</label>
            {zones.map((z) => (
              <label key={z.id} style={{ display: "block", fontWeight: 400, margin: "4px 0" }}>
                <input
                  type="checkbox"
                  checked={draft.zoneIds.includes(z.id)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      zoneIds: e.target.checked
                        ? [...draft.zoneIds, z.id]
                        : draft.zoneIds.filter((id) => id !== z.id),
                    })
                  }
                />{" "}
                {z.name}
              </label>
            ))}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-block" disabled={busy} onClick={save}>
          {busy ? "Lagrer …" : draft.id ? "Lagre endringer" : "Publiser"}
        </button>
      </div>

      <Preview draft={draft} />
    </>
  );
}

function Preview({ draft }: { draft: ContentDraft }) {
  return (
    <div className="card">
      <h2>Forhåndsvisning</h2>
      <div
        className="disp theme-dark"
        style={{
          position: "relative",
          inset: "auto",
          borderRadius: 12,
          aspectRatio: "16/9",
          fontSize: "clamp(8px, 1.6vw, 12px)",
          overflow: "hidden",
        }}
      >
        <div className="disp-stage">
          <div className="disp-slide on">
            {draft.type === "verse" ? (
              <>
                <div className="disp-kicker">Ord for dagen</div>
                <div className="disp-body" style={{ fontSize: "1.6em" }}>
                  «{draft.bodyText || "…"}»
                </div>
                {draft.reference && <div className="disp-ref">{draft.reference}</div>}
              </>
            ) : (
              <>
                {draft.title && <div className="disp-title">{draft.title}</div>}
                {draft.bodyText && <div className="disp-body">{draft.bodyText}</div>}
                {draft.type === "qr" && draft.url && (
                  <div className="disp-ref">QR → {draft.url}</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

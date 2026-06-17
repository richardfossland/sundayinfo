"use client";

// The display loop. Design constraints (old TV browsers):
//  - no extra libraries, opacity-only CSS transitions, one slide DOM layer set
//  - network model: 30 s heartbeat poll is the source of truth; realtime
//    broadcast is a best-effort hint that only triggers an early poll
//  - offline: last snapshot lives in localStorage; rotation + auto-mode +
//    publish/expiry filtering all run on the local clock, so a screen that
//    loses the net keeps behaving correctly (content still expires on time)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useChannel } from "@/lib/client/useChannel";
import { liturgicalAccent } from "@/lib/churchyear/calendar";
import {
  clearToken,
  loadSnapshot,
  loadToken,
  saveSnapshot,
  saveToken,
} from "@/lib/display/cache";
import {
  formatCountdown,
  resolveMode,
  shortTime,
  upcomingOccurrences,
  weekdayName,
} from "@/lib/display/mode";
import type { HeartbeatResponse, SnapshotItem, ZoneSnapshot } from "@/lib/types";

const HEARTBEAT_MS = 30_000;
const PAIR_POLL_MS = 3_000;
const DEFAULT_SLIDE_S = 12;

export default function DisplayClient() {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  // Boot: kiosk deep-link (?t=…) wins, then localStorage.
  useEffect(() => {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("t");
    if (fromUrl) {
      saveToken(fromUrl);
      url.searchParams.delete("t");
      window.history.replaceState(null, "", url.toString());
      setToken(fromUrl);
      return;
    }
    setToken(loadToken());
  }, []);

  if (token === undefined) return null;
  if (token === null) return <Pairing onPaired={setToken} />;
  return (
    <Display
      token={token}
      onRevoked={() => {
        clearToken();
        setToken(null);
      }}
    />
  );
}

/* ── Pairing ───────────────────────────────────────────────────────────── */

function Pairing({ onPaired }: { onPaired: (token: string) => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const pollKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function start() {
      try {
        const res = await fetch("/api/pair/start", { method: "POST" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { code: string; pollKey: string };
        if (stopped) return;
        pollKeyRef.current = data.pollKey;
        setCode(data.code);
        setError(false);
        timer = setTimeout(poll, PAIR_POLL_MS);
      } catch {
        if (stopped) return;
        setError(true);
        timer = setTimeout(start, 10_000);
      }
    }

    async function poll() {
      try {
        const res = await fetch("/api/pair/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pollKey: pollKeyRef.current }),
        });
        if (res.status === 410 || res.status === 404) {
          // expired or spent — get a fresh code
          timer = setTimeout(start, 1_000);
          return;
        }
        if (res.ok) {
          const data = (await res.json()) as {
            status: string;
            deviceToken?: string;
          };
          if (data.status === "paired" && data.deviceToken) {
            saveToken(data.deviceToken);
            onPaired(data.deviceToken);
            return;
          }
        }
        timer = setTimeout(poll, PAIR_POLL_MS);
      } catch {
        timer = setTimeout(poll, PAIR_POLL_MS);
      }
    }

    start();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [onPaired]);

  return (
    <div className="pairing">
      <h1>
        Sunday<span style={{ color: "var(--gold)" }}>Info</span>
      </h1>
      {code ? (
        <>
          <div className="pcode">{code.split("").join(" ")}</div>
          <p className="psteps">
            Logg inn på <b>info.sundaysuite.app</b> på mobilen, gå til{" "}
            <b>Skjermer</b> og tast inn koden for å koble til denne skjermen.
          </p>
        </>
      ) : (
        <p className="psteps">{error ? "Prøver å nå tjeneren …" : "Henter kode …"}</p>
      )}
    </div>
  );
}

/* ── Display ───────────────────────────────────────────────────────────── */

type Slide =
  | { kind: "item"; item: SnapshotItem }
  | { kind: "countdown" }
  | { kind: "program" }
  | { kind: "thanks" }
  | { kind: "schedule" }
  | { kind: "facilities" }
  | { kind: "placeholder" };

function Display({ token, onRevoked }: { token: string; onRevoked: () => void }) {
  const [snapshot, setSnapshot] = useState<ZoneSnapshot | null>(() => loadSnapshot());
  const [now, setNow] = useState(() => new Date());
  const [online, setOnline] = useState(true);
  const versionRef = useRef<string | null>(null);
  const failuresRef = useRef(0);
  // Transient zone preview pushed via a remote command (null = assigned zone).
  // A ref so the heartbeat closure always reads the latest value.
  const overrideZoneRef = useRef<string | null>(null);
  // A short label of what's on screen right now, reported on the heartbeat so
  // the admin cockpit can show it. A ref so it never re-creates `beat`.
  const showingRef = useRef<string>("");

  const fetchSnapshot = useCallback(async () => {
    const zoneId = overrideZoneRef.current;
    const res = await fetch(
      `/api/display/snapshot${zoneId ? `?zoneId=${encodeURIComponent(zoneId)}` : ""}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.status === 401) {
      onRevoked();
      return;
    }
    if (!res.ok) throw new Error();
    const data = (await res.json()) as ZoneSnapshot;
    versionRef.current = data.version ?? null;
    setSnapshot(data);
    saveSnapshot(data);
  }, [token, onRevoked]);

  const beat = useCallback(async () => {
    try {
      const res = await fetch("/api/display/heartbeat", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          nowShowing: showingRef.current,
          version: versionRef.current,
        }),
      });
      if (res.status === 401) {
        onRevoked();
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as HeartbeatResponse;
      setOnline(true);
      failuresRef.current = 0;

      // Act on a remote command (consumed-once server-side). A zone push and a
      // refresh both resolve to a snapshot refetch with the current override.
      let mustRefetch = false;
      if (data.command) {
        if (data.command.gotoZoneId !== undefined) {
          overrideZoneRef.current = data.command.gotoZoneId;
          mustRefetch = true;
        }
        if (data.command.refreshNow) mustRefetch = true;
      }

      // While previewing an override zone, the heartbeat's version reflects the
      // ASSIGNED zone, not what's on screen — so don't let it trigger refetches;
      // only explicit commands move a previewing screen.
      const versionChanged =
        overrideZoneRef.current === null && data.version !== versionRef.current;
      if (mustRefetch || versionChanged) {
        await fetchSnapshot();
      } else if (data.emergency) {
        // same version but a fresh emergency payload — merge it in
        setSnapshot((s) => (s ? { ...s, emergency: data.emergency } : s));
      }
    } catch {
      failuresRef.current++;
      if (failuresRef.current >= 2) setOnline(false);
    }
  }, [token, fetchSnapshot, onRevoked]);

  // First load + steady 30 s pulse.
  useEffect(() => {
    versionRef.current = loadSnapshot()?.version ?? null;
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [beat]);

  // Local clock — drives rotation timing, auto-mode and expiry filtering.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);

  // Realtime hints (best effort): any event on our zone/church topic → poll now.
  useChannel(snapshot?.zone ? `info:zone:${snapshot.zone.id}` : null, beat);
  useChannel(snapshot?.church ? `info:church:${snapshot.church.id}` : null, beat);

  /* Build the slide reel from mode + live items. */
  const liveItems = useMemo(() => {
    if (!snapshot) return [];
    const t = now.getTime();
    return snapshot.items.filter(
      (it) =>
        (!it.publishAt || Date.parse(it.publishAt) <= t) &&
        (!it.expiresAt || Date.parse(it.expiresAt) > t),
    );
  }, [snapshot, now]);

  const resolution = useMemo(
    () => resolveMode(snapshot?.events ?? [], now),
    [snapshot, now],
  );

  const hasFacilities = (snapshot?.facilities?.length ?? 0) > 0;

  const slides = useMemo<Slide[]>(() => {
    const itemSlides: Slide[] = liveItems.map((item) => ({ kind: "item", item }));
    const facilitySlide: Slide[] = hasFacilities ? [{ kind: "facilities" }] : [];
    switch (resolution.mode) {
      case "pre_service":
        return [{ kind: "countdown" }, ...itemSlides, ...facilitySlide];
      case "in_service":
        return [
          ...(resolution.event && resolution.event.program.length > 0
            ? ([{ kind: "program" }] as Slide[])
            : []),
          ...itemSlides,
        ];
      case "post_service":
        return [{ kind: "thanks" }, ...itemSlides, ...facilitySlide];
      default: {
        const reel: Slide[] = [...itemSlides, ...facilitySlide];
        if ((snapshot?.events.length ?? 0) > 0) reel.push({ kind: "schedule" });
        return reel.length > 0 ? reel : [{ kind: "placeholder" }];
      }
    }
  }, [resolution, liveItems, snapshot, hasFacilities]);

  // Rotation: advance on a per-slide timer. The reel identity (kinds + ids)
  // resets the index only when it actually changes shape.
  const reelKey = slides
    .map((s) => (s.kind === "item" ? s.item.id : s.kind))
    .join("|");
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
  }, [reelKey]);

  const safeIndex = index % slides.length;
  const current = slides[safeIndex];
  const slideSeconds =
    current.kind === "item" && current.item.durationSeconds
      ? current.item.durationSeconds
      : ((snapshot?.zone?.settings?.slideDurationSeconds as number | undefined) ??
        DEFAULT_SLIDE_S);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = setTimeout(
      () => setIndex((i) => (i + 1) % slides.length),
      slideSeconds * 1_000,
    );
    return () => clearTimeout(id);
  }, [safeIndex, slides.length, slideSeconds, reelKey]);

  /* Theme */
  const theme = snapshot?.zone?.theme ?? "dark";
  const accent = theme === "liturgical" ? liturgicalAccent(now) : undefined;

  const emergency =
    snapshot?.emergency && Date.parse(snapshot.emergency.expiresAt) > now.getTime()
      ? snapshot.emergency
      : null;

  // Report a short, human label of what's on screen so the cockpit can show it.
  // Updated on every slide/zone change; read by the heartbeat via a ref.
  useEffect(() => {
    const zone = overrideZoneRef.current
      ? `[forhåndsvisning] ${snapshot?.zone?.name ?? ""}`
      : (snapshot?.zone?.name ?? "");
    const label = emergency ? "Viktig melding" : slideLabel(current);
    showingRef.current = [zone, label].filter(Boolean).join(" · ");
  }, [current, emergency, snapshot]);

  const next = resolution.next ?? upcomingOccurrences(snapshot?.events ?? [], now)[0];

  if (!snapshot) {
    return (
      <div className="pairing">
        <h1>
          Sunday<span style={{ color: "var(--gold)" }}>Info</span>
        </h1>
        <p className="psteps">{online ? "Henter innhold …" : "Venter på nett …"}</p>
      </div>
    );
  }

  return (
    <div
      className={`disp theme-${theme}`}
      style={accent ? ({ "--accent": accent } as React.CSSProperties) : undefined}
    >
      <div className="disp-stage">
        {slides.map((slide, i) => (
          <div
            key={slide.kind === "item" ? slide.item.id : `${slide.kind}-${i}`}
            className={`disp-slide${i === safeIndex ? " on" : ""}`}
          >
            <SlideContent slide={slide} snapshot={snapshot} now={now} resolution={resolution} />
          </div>
        ))}
        {emergency && (
          <div className="disp-emergency">
            <div className="etitle">Viktig melding</div>
            <div className="ebody">{emergency.body}</div>
          </div>
        )}
      </div>
      <div className="disp-footer">
        <span className="fchurch">
          {!online && <span className="disp-offline" title="Frakoblet" />}
          {snapshot.church?.name ?? ""}
        </span>
        {next && resolution.mode === "weekly" && (
          <span className="fnext">
            Neste: {next.event.title} {weekdayName(next.start.getDay())}{" "}
            {shortTime(next.start.toTimeString())}
          </span>
        )}
        <span className="disp-clock">
          {now.toTimeString().slice(0, 5)}
        </span>
      </div>
    </div>
  );
}

/* ── Slide renderers ───────────────────────────────────────────────────── */

function SlideContent({
  slide,
  snapshot,
  now,
  resolution,
}: {
  slide: Slide;
  snapshot: ZoneSnapshot;
  now: Date;
  resolution: ReturnType<typeof resolveMode>;
}) {
  switch (slide.kind) {
    case "countdown": {
      const start = resolution.start;
      const ms = start ? start.getTime() - now.getTime() : 0;
      return (
        <>
          <div className="disp-kicker">Velkommen til</div>
          <div className="disp-title">{resolution.event?.title ?? ""}</div>
          <div className="disp-count">{formatCountdown(Math.max(0, ms))}</div>
          <div className="disp-body">
            Vi begynner kl. {start ? start.toTimeString().slice(0, 5) : ""}
          </div>
        </>
      );
    }
    case "program":
      return (
        <>
          <div className="disp-kicker">{resolution.event?.title ?? "Program"}</div>
          <div className="disp-program">
            {(resolution.event?.program ?? []).map((row, i) => (
              <div className="prow" key={i}>
                <span className="ptime">{row.time}</span>
                <span>
                  {row.title}
                  {row.subtitle && <span className="psub">{row.subtitle}</span>}
                </span>
              </div>
            ))}
          </div>
        </>
      );
    case "thanks": {
      const next = resolution.next;
      return (
        <>
          <div className="disp-kicker">{snapshot.church?.name ?? ""}</div>
          <div className="disp-title">Takk for i dag!</div>
          {next && (
            <div className="disp-body">
              Neste samling: {next.event.title} {weekdayName(next.start.getDay())} kl.{" "}
              {next.start.toTimeString().slice(0, 5)}
            </div>
          )}
        </>
      );
    }
    case "schedule": {
      const upcoming = upcomingOccurrences(snapshot.events, now).slice(0, 6);
      return (
        <>
          <div className="disp-kicker">Denne uka</div>
          <div className="disp-title">Program</div>
          <div className="disp-program">
            {upcoming.map(({ event, start }, i) => (
              <div className="prow" key={`${event.id}-${i}`}>
                <span className="ptime">{start.toTimeString().slice(0, 5)}</span>
                <span>
                  {event.title}
                  <span className="psub">{capitalize(weekdayName(start.getDay()))}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      );
    }
    case "facilities": {
      const rooms = snapshot.facilities ?? [];
      return (
        <>
          <div className="disp-kicker">Denne uka</div>
          <div className="disp-title">Lokaler i bruk</div>
          <div className="disp-program">
            {rooms.map((r) => (
              <div className="prow" key={r.resourceId}>
                <span className="ptime">{r.room}</span>
                <span>{r.status}</span>
              </div>
            ))}
          </div>
        </>
      );
    }
    case "placeholder":
      return (
        <>
          <div className="disp-kicker">SundayInfo</div>
          <div className="disp-title">{snapshot.church?.name ?? "Velkommen"}</div>
          <div className="disp-body">
            Legg til innhold i adminpanelet, så dukker det opp her.
          </div>
        </>
      );
    case "item":
      return <ItemSlide item={slide.item} />;
  }
}

function ItemSlide({ item }: { item: SnapshotItem }) {
  const payload = item.payload as {
    reference?: string;
    qrDataUrl?: string;
    qrLabel?: string;
    url?: string;
  };
  switch (item.type) {
    case "verse":
      return (
        <>
          <div className="disp-kicker">Ord for dagen</div>
          <div className="disp-body" style={{ fontSize: "1.6em", maxWidth: "30ch" }}>
            «{item.body}»
          </div>
          {payload.reference && <div className="disp-ref">{payload.reference}</div>}
        </>
      );
    case "qr":
      return (
        <>
          {item.title && <div className="disp-title">{item.title}</div>}
          {item.body && <div className="disp-body">{item.body}</div>}
          {payload.qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="disp-qr" src={payload.qrDataUrl} alt={item.title || "QR"} />
          )}
          {payload.qrLabel && <div className="disp-ref">{payload.qrLabel}</div>}
        </>
      );
    case "image":
      return payload.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="disp-img" src={payload.url} alt={item.title} />
      ) : (
        <div className="disp-title">{item.title}</div>
      );
    default:
      return (
        <>
          <div className="disp-title">{item.title}</div>
          {item.body && <div className="disp-body">{item.body}</div>}
        </>
      );
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Short human label of a slide for the admin cockpit's "currently showing". */
function slideLabel(slide: Slide): string {
  switch (slide.kind) {
    case "countdown":
      return "Nedtelling til gudstjeneste";
    case "program":
      return "Program";
    case "thanks":
      return "Takk for i dag";
    case "schedule":
      return "Ukeprogram";
    case "facilities":
      return "Lokaler i bruk";
    case "placeholder":
      return "Velkommen";
    case "item": {
      const typeNo: Record<string, string> = {
        announcement: "Kunngjøring",
        verse: "Ord for dagen",
        qr: "QR-kode",
        image: "Bilde",
      };
      const kind = typeNo[slide.item.type] ?? "Innhold";
      return slide.item.title ? `${kind}: ${slide.item.title}` : kind;
    }
  }
}

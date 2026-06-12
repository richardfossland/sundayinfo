"use client";

import { useCallback, useEffect, useState } from "react";

import AdminShell from "@/app/components/AdminShell";
import { api, errorText } from "@/lib/client/api";
import { useChurch } from "@/lib/client/useChurch";
import { weekdayName } from "@/lib/display/mode";

type EventRow = {
  id: string;
  title: string;
  kind: string;
  weekday: number | null;
  date: string | null;
  start_time: string;
  duration_minutes: number;
  program: { time: string; title: string; subtitle?: string }[];
  active: boolean;
};

export default function ProgramPage() {
  const { me, loading, membership, select } = useChurch();
  const churchId = membership?.churchId ?? null;
  const [events, setEvents] = useState<EventRow[]>([]);
  const [editing, setEditing] = useState<EventRow | "new" | null>(null);

  const load = useCallback(async () => {
    if (!churchId) return;
    const data = await api.get<{ events: EventRow[] }>(`/api/events?churchId=${churchId}`);
    setEvents(data.events);
  }, [churchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Slette dette arrangementet?")) return;
    await api.del(`/api/events/${id}`);
    load();
  }

  if (loading || !me || !churchId) return null;

  return (
    <AdminShell me={me} selectedChurchId={churchId} onSelectChurch={select}>
      <h1 className="pagetitle">Program</h1>
      <p className="lede">
        Skjermen bytter selv til nedtelling før, program under og «takk for i
        dag» etter hvert arrangement.
      </p>

      <button className="btn btn-block" style={{ marginBottom: 14 }} onClick={() => setEditing("new")}>
        + Nytt arrangement
      </button>

      {editing && (
        <EventForm
          churchId={churchId}
          event={editing === "new" ? null : editing}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      <div className="card">
        {events.length === 0 ? (
          <p className="empty">Legg inn gudstjenesten først — det er hjerteslaget.</p>
        ) : (
          events.map((e) => (
            <div className="card-row" key={e.id}>
              <button
                style={{ background: "none", border: "none", color: "var(--txt)", textAlign: "left", flex: 1 }}
                onClick={() => setEditing(e)}
              >
                <b>{e.title}</b>
                <span style={{ color: "var(--txt-faint)", marginLeft: 8, fontSize: "0.82rem" }}>
                  {e.weekday !== null
                    ? `hver ${weekdayName(e.weekday)}`
                    : e.date}{" "}
                  kl. {e.start_time.slice(0, 5)}
                </span>
              </button>
              {!e.active && <span className="badge badge-dim">av</span>}
              <button className="btn btn-sm btn-ghost" onClick={() => remove(e.id)}>
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </AdminShell>
  );
}

function EventForm({
  churchId,
  event,
  onDone,
}: {
  churchId: string;
  event: EventRow | null;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "Gudstjeneste");
  const [recurring, setRecurring] = useState(event ? event.weekday !== null : true);
  const [weekday, setWeekday] = useState(event?.weekday ?? 0);
  const [date, setDate] = useState(event?.date ?? "");
  const [startTime, setStartTime] = useState(event?.start_time?.slice(0, 5) ?? "11:00");
  const [duration, setDuration] = useState(event?.duration_minutes ?? 90);
  const [programText, setProgramText] = useState(
    (event?.program ?? [])
      .map((r) => `${r.time} ${r.title}${r.subtitle ? " – " + r.subtitle : ""}`)
      .join("\n"),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    // "11:00 Lovsang – med barnekoret" → {time, title, subtitle}
    const program = programText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = /^(\d{1,2}[:.]\d{2})\s+(.+)$/.exec(l);
        const rest = m ? m[2] : l;
        const [t, sub] = rest.split(/\s+[–-]\s+/, 2);
        return {
          time: m ? m[1].replace(".", ":") : "",
          title: t.trim(),
          ...(sub ? { subtitle: sub.trim() } : {}),
        };
      });
    try {
      const body = {
        churchId,
        title: title.trim(),
        weekday: recurring ? weekday : null,
        date: recurring ? null : date || null,
        startTime: `${startTime}:00`,
        durationMinutes: duration,
        program,
      };
      if (event) await api.patch(`/api/events/${event.id}`, body);
      else await api.post("/api/events", body);
      onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>{event ? "Rediger arrangement" : "Nytt arrangement"}</h2>
      <div className="field">
        <label htmlFor="e-title">Navn</label>
        <input id="e-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="e-when">Gjentakelse</label>
        <select
          id="e-when"
          value={recurring ? "weekly" : "once"}
          onChange={(e) => setRecurring(e.target.value === "weekly")}
        >
          <option value="weekly">Hver uke</option>
          <option value="once">Én gang (dato)</option>
        </select>
      </div>
      {recurring ? (
        <div className="field">
          <label htmlFor="e-weekday">Ukedag</label>
          <select id="e-weekday" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <option key={d} value={d}>
                {weekdayName(d)}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="e-date">Dato</label>
          <input id="e-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      )}
      <div className="field">
        <label htmlFor="e-start">Starter kl.</label>
        <input id="e-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="e-dur">Varighet (minutter)</label>
        <input
          id="e-dur"
          type="number"
          min={5}
          max={720}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
        />
      </div>
      <div className="field">
        <label htmlFor="e-prog">Program (én linje per post)</label>
        <textarea
          id="e-prog"
          value={programText}
          onChange={(e) => setProgramText(e.target.value)}
          placeholder={"11:00 Lovsang\n11:20 Tale – «Såmannen»\n12:00 Nattverd"}
        />
        <p className="hint">Vises på skjermen mens arrangementet pågår.</p>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn" disabled={busy || !title.trim()} onClick={save}>
          {busy ? "Lagrer …" : "Lagre"}
        </button>
        <button className="btn btn-ghost" onClick={onDone}>
          Avbryt
        </button>
      </div>
    </div>
  );
}

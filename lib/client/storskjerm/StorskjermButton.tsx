"use client";

import { useState } from "react";
import { StorskjermPanel } from "./StorskjermPanel";
import { tekst } from "./tekst";
import "./storskjerm.css";

/** «Vis på storskjerm» — knapp som åpner veiviseren for skjermen på `path`
 * (adressen løses mot denne siden først ved klikk, så ingen hydreringsforskjell). */
export function StorskjermButton({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-sm"
        aria-haspopup="dialog"
        onClick={() => setUrl(new URL(path, window.location.origin).toString())}
      >
        <span aria-hidden="true">▶︎</span> {tekst.knapp}
      </button>
      {url && <StorskjermPanel url={url} onClose={() => setUrl(null)} />}
    </>
  );
}

"use client";

// Route-level error boundary — a transient render/runtime error shows a
// friendly recovery screen instead of a blank, unrecoverable page.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="shell shell-narrow" style={{ paddingTop: "12vh", textAlign: "center" }}>
      <h1 className="brand" style={{ fontSize: "2rem", marginBottom: 6 }}>
        Sunday<em>Info</em>
      </h1>
      <div className="card">
        <h2 style={{ fontFamily: "var(--display)", fontSize: "1.4rem" }}>Noe gikk galt</h2>
        <p className="lede" style={{ marginBottom: 16 }}>
          Det oppstod en uventet feil. Prøv på nytt — innholdet ditt er trygt
          lagret.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn" onClick={() => reset()}>
            Prøv igjen
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              window.location.href = "/";
            }}
          >
            Til forsiden
          </button>
        </div>
      </div>
    </div>
  );
}

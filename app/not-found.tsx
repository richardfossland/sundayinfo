import Link from "next/link";

// 404 — keep users inside the suite look instead of the bare Next.js page.
export default function NotFound() {
  return (
    <div className="shell shell-narrow" style={{ paddingTop: "12vh", textAlign: "center" }}>
      <h1 className="brand" style={{ fontSize: "2rem", marginBottom: 6 }}>
        Sunday<em>Info</em>
      </h1>
      <div className="card">
        <div
          style={{
            fontFamily: "var(--display)",
            fontSize: "3.4rem",
            fontWeight: 800,
            color: "var(--gold)",
            lineHeight: 1,
          }}
        >
          404
        </div>
        <h2 style={{ fontFamily: "var(--display)", fontSize: "1.3rem", margin: "10px 0 6px" }}>
          Fant ikke siden
        </h2>
        <p className="lede" style={{ marginBottom: 16 }}>
          Siden finnes ikke, eller har blitt flyttet.
        </p>
        <Link className="btn" href="/">
          Til forsiden
        </Link>
      </div>
    </div>
  );
}

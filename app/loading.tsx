// Route-level loading UI — a brief gold spinner instead of a blank flash while
// a segment streams in.
export default function Loading() {
  return (
    <div className="loading-screen" aria-busy="true" aria-live="polite">
      <div className="spinner" role="status" aria-label="Laster" />
      <p style={{ fontWeight: 600 }}>Laster …</p>
    </div>
  );
}

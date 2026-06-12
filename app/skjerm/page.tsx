import { Suspense } from "react";

import DisplayClient from "./DisplayClient";

// The one URL a TV ever opens. Static shell; everything else is the client
// loop (pairing or display) driven by the device token in localStorage.
export default function SkjermPage() {
  return (
    <Suspense fallback={null}>
      <DisplayClient />
    </Suspense>
  );
}

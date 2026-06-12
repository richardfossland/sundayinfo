"use client";

// Thin typed fetch wrapper for the admin UI. Throws ApiError with the server's
// snake_case code so forms can show a sensible Norwegian message.

export class ApiError extends Error {
  status: number;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let code = "request_failed";
    try {
      code = ((await res.json()) as { error?: string }).error ?? code;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, code);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

const ERROR_NO: Record<string, string> = {
  not_signed_in: "Du er ikke logget inn.",
  not_a_member: "Du har ikke tilgang til denne menigheten.",
  admin_required: "Bare administratorer kan gjøre dette.",
  zone_forbidden: "Du har ikke tilgang til denne sonen.",
  code_not_found: "Fant ingen skjerm med den koden — sjekk at den fortsatt vises på TV-en.",
  zone_not_found: "Sonen finnes ikke.",
  missing_fields: "Fyll ut alle feltene.",
  rate_limited: "For mange forsøk — vent litt og prøv igjen.",
  user_not_found: "Fant ingen bruker med den e-postadressen.",
};

export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    return ERROR_NO[err.message] ?? `Noe gikk galt (${err.message}).`;
  }
  return "Noe gikk galt — sjekk nettet og prøv igjen.";
}

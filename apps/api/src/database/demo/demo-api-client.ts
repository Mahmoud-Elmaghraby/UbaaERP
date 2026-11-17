/**
 * A tiny HTTP client for the demo seed: every record goes through the real API (validation,
 * guards, posting rules, events and the accounting outbox), exactly as if someone typed it in.
 */
export class DemoApiClient {
  private token: string | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly schema: string,
  ) {}

  async login(email: string, password: string): Promise<void> {
    const res = (await this.raw("POST", "/auth/login", {
      email,
      password,
    })) as { accessToken?: string };
    if (!res.accessToken)
      throw new Error(
        "Login did not return an access token (is MFA on for this user?).",
      );
    this.token = res.accessToken;
  }

  get<T = unknown>(path: string): Promise<T> {
    return this.raw("GET", path) as Promise<T>;
  }
  post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.raw("POST", path, body ?? {}) as Promise<T>;
  }
  patch<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.raw("PATCH", path, body) as Promise<T>;
  }
  put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.raw("PUT", path, body) as Promise<T>;
  }

  private async raw(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const headers: Record<string, string> = { "x-tenant-schema": this.schema };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      if (res.ok) return text ? JSON.parse(text) : null;
      // The API throttles bursts (auth and some writes): wait and retry.
      if (res.status === 429 && attempt < 15) {
        await new Promise((r) =>
          setTimeout(r, Math.min(15_000, 2000 * attempt)),
        );
        continue;
      }
      throw new Error(
        `${method} ${path} → ${res.status}: ${text.slice(0, 800)}`,
      );
    }
  }
}

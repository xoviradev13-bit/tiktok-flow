/**
 * GPMLogin Local REST API Client (v1)
 * Official API Documentation: https://api-docs.gpmloginapp.com/
 * Default Base URL: http://localhost:9495/api/v1
 */

export interface GpmProfileItem {
  id: string;
  name: string;
  group_id: string;
  storage_path: string;
  raw_proxy: string;
  browser: {
    name: string;
    version: string;
  };
  os: string;
  note: string;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface GpmStartResponse {
  profile_id: string;
  driver_path: string;
  remote_debugging_port: number;
  websocket_debugging_url: string;
  addition_info?: {
    process_id: number;
    profile_name: string;
    window_handle: number;
    exec_time: number;
  };
}

export interface GpmApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  sender?: string;
}

export interface GpmPagination<T> {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  data: T[];
}

export class GpmApiClient {
  private baseUrl: string;

  constructor(baseUrl = "http://127.0.0.1:9495/api/v1") {
    this.baseUrl = baseUrl.replace(/\/$/, "").replace("localhost", "127.0.0.1");
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, "").replace("localhost", "127.0.0.1");
  }

  public getBaseUrl() {
    return this.baseUrl;
  }

  /**
   * Health check to see if GPM-Login app HTTP server is actively running
   * Probes default port and common GPM ports (9495, 19995)
   */
  async checkConnection(): Promise<{ isOnline: boolean; message: string; version?: string; baseUrl: string }> {
    const candidateUrls = [
      this.baseUrl,
      "http://127.0.0.1:9495/api/v1",
      "http://127.0.0.1:9495/api/v3",
      "http://127.0.0.1:19995/api/v3",
      "http://127.0.0.1:19995/api/v1",
    ];

    const uniqueUrls = Array.from(new Set(candidateUrls));

    for (const candidate of uniqueUrls) {
      try {
        const res = await fetch(`${candidate}/profiles?page=1&page_size=1`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(2000),
        });

        if (res.ok) {
          const json: GpmApiResponse<any> = await res.json();
          this.baseUrl = candidate;
          return {
            isOnline: json.success !== false,
            message: json.message || "GPMLogin is online",
            version: json.sender,
            baseUrl: this.baseUrl,
          };
        }
      } catch {
        // Try next candidate
      }
    }

    return {
      isOnline: false,
      message: "Không thể kết nối đến GPMLogin (Port 9495/19995). Vui lòng mở ứng dụng GPMLogin.",
      baseUrl: this.baseUrl,
    };
  }

  /**
   * List all profiles with pagination and search
   */
  async listProfiles(
    page = 1,
    pageSize = 100,
    search = ""
  ): Promise<GpmPagination<GpmProfileItem> | null> {
    try {
      const url = new URL(`${this.baseUrl}/profiles`);
      url.searchParams.set("page", String(page));
      url.searchParams.set("page_size", String(pageSize));
      if (search) url.searchParams.set("search", search);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) throw new Error(`GPMLogin responded with status ${res.status}`);
      const json: GpmApiResponse<GpmPagination<GpmProfileItem>> = await res.json();
      return json.data;
    } catch (err) {
      console.warn("[GpmApiClient] Failed to list profiles:", err);
      return null;
    }
  }

  /**
   * Get single profile details (including full fingerprint)
   */
  async getProfile(profileId: string): Promise<GpmProfileItem | null> {
    try {
      const res = await fetch(`${this.baseUrl}/profiles/${profileId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) return null;
      const json: GpmApiResponse<GpmProfileItem> = await res.json();
      return json.data;
    } catch (err) {
      console.warn(`[GpmApiClient] Failed to get profile ${profileId}:`, err);
      return null;
    }
  }

  /**
   * Start profile browser and get WebSocket debugging URL
   */
  async startProfile(
    profileId: string,
    options?: {
      skipProxyCheck?: boolean;
      windowScale?: number;
      additionArgs?: string;
      url?: string;
    }
  ): Promise<GpmStartResponse | null> {
    const candidateBaseUrls = Array.from(
      new Set([
        this.baseUrl,
        "http://127.0.0.1:9495/api/v1",
        "http://127.0.0.1:9495/api/v3",
        "http://127.0.0.1:19995/api/v3",
        "http://127.0.0.1:19995/api/v1",
      ])
    );

    const targetUrl = options?.url || (options?.additionArgs?.startsWith("http") ? options.additionArgs : null);

    for (const base of candidateBaseUrls) {
      try {
        const url = new URL(`${base}/profiles/start/${profileId}`);
        if (options?.skipProxyCheck) url.searchParams.set("skip_proxy_check", "true");
        if (options?.windowScale) url.searchParams.set("window_scale", String(options.windowScale));
        if (options?.additionArgs) {
          url.searchParams.set("addition_args", options.additionArgs);
        } else if (targetUrl) {
          url.searchParams.set("addition_args", targetUrl);
        }
        if (options?.url) {
          url.searchParams.set("url", options.url);
        }

        const res = await fetch(url.toString(), {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(4000),
        });

        if (res.ok) {
          const json: GpmApiResponse<GpmStartResponse> = await res.json();
          this.baseUrl = base;

          // Đảm bảo target URL (ví dụ TikTok Studio) được mở ngay cả khi GPM profile có tab mặc định
          if (targetUrl && json?.data?.remote_debugging_port) {
            const port = json.data.remote_debugging_port;
            (async () => {
              try {
                await new Promise((resolve) => setTimeout(resolve, 1500));
                const listRes = await fetch(`http://127.0.0.1:${port}/json/list`).catch(() => null);
                if (listRes && listRes.ok) {
                  const pages = (await listRes.json()) as Array<{ id: string; url: string; type: string }>;
                  const hasTarget = pages.some((p) => p.url && (p.url.includes("tiktokstudio") || p.url === targetUrl));
                  if (!hasTarget) {
                    await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`, { method: "PUT" }).catch(() => {
                      return fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`);
                    });
                  }
                }
              } catch {
                // Ignore
              }
            })();
          }

          return json.data;
        }
      } catch {
        // Try next candidate port
      }
    }

    console.warn(`[GpmApiClient] Failed to start profile ${profileId} on all candidate ports (9495, 19995).`);
    return null;
  }

  /**
   * Stop profile browser instance
   */
  async stopProfile(profileId: string): Promise<boolean> {
    const candidateBaseUrls = Array.from(
      new Set([
        this.baseUrl,
        "http://127.0.0.1:9495/api/v1",
        "http://127.0.0.1:9495/api/v3",
        "http://127.0.0.1:19995/api/v3",
      ])
    );

    for (const base of candidateBaseUrls) {
      try {
        const res = await fetch(`${base}/profiles/stop/${profileId}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const json: GpmApiResponse<null> = await res.json();
          this.baseUrl = base;
          return json.success;
        }
      } catch {
        // Try next candidate
      }
    }

    console.warn(`[GpmApiClient] Failed to stop profile ${profileId} on candidate ports.`);
    return false;
  }
}

export const gpmClient = new GpmApiClient();

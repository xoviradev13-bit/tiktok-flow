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

  constructor(baseUrl = "http://localhost:9495/api/v1") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, "");
  }

  public getBaseUrl() {
    return this.baseUrl;
  }

  /**
   * Health check to see if GPM-Login app HTTP server is actively running
   */
  async checkConnection(): Promise<{ isOnline: boolean; message: string; version?: string; baseUrl: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/profiles?page=1&page_size=1`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const json: GpmApiResponse<any> = await res.json();
        return {
          isOnline: json.success,
          message: json.message || "GPMLogin is online",
          version: json.sender,
          baseUrl: this.baseUrl,
        };
      }
      return {
        isOnline: false,
        message: `HTTP ${res.status}: ${res.statusText}`,
        baseUrl: this.baseUrl,
      };
    } catch (err: any) {
      return {
        isOnline: false,
        message: err.message || "Cannot connect to GPMLogin at " + this.baseUrl,
        baseUrl: this.baseUrl,
      };
    }
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
    }
  ): Promise<GpmStartResponse | null> {
    try {
      const url = new URL(`${this.baseUrl}/profiles/start/${profileId}`);
      if (options?.skipProxyCheck) url.searchParams.set("skip_proxy_check", "true");
      if (options?.windowScale) url.searchParams.set("window_scale", String(options.windowScale));
      if (options?.additionArgs) url.searchParams.set("addition_args", options.additionArgs);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) throw new Error(`Start profile failed: status ${res.status}`);
      const json: GpmApiResponse<GpmStartResponse> = await res.json();
      return json.data;
    } catch (err) {
      console.warn(`[GpmApiClient] Failed to start profile ${profileId}:`, err);
      return null;
    }
  }

  /**
   * Stop profile browser instance
   */
  async stopProfile(profileId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/profiles/stop/${profileId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const json: GpmApiResponse<null> = await res.json();
      return json.success;
    } catch (err) {
      console.warn(`[GpmApiClient] Failed to stop profile ${profileId}:`, err);
      return false;
    }
  }
}

export const gpmClient = new GpmApiClient();

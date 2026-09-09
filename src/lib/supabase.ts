import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// Polyfill global WebSocket for Node.js 20 environment if not present
if (typeof globalThis !== "undefined" && !globalThis.WebSocket) {
  (globalThis as any).WebSocket = WebSocket;
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ijgsjckixpijaelkspjf.supabase.co";

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const BUCKET_NAME = "bug-reports";
export const MAX_IMAGE_COUNT = 5;
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

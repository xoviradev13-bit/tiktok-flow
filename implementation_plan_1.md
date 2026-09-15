# Kế Hoạch Triển Khai: Ràng Buộc Mã Máy Trạm (Machine ID Binding) & Quản Lý Thiết Bị

> **Cập nhật sau khi đọc code thực tế** – Phiên bản này phản ánh chính xác từng file/function hiện có trong codebase.
>
> **Trạng thái (v9+ polish):** Track A **sẵn sàng implementation**. Không còn quyết định kiến trúc/bảo mật mở trước khi code. Track B/C giữ tách PR (§7).
>
> **Chốt kiến trúc attest (bắt buộc đọc trước khi code Tầng 2/3):** xem **§0** — một luồng duy nhất, không để Agent và Extension hiểu khác nhau.

---

## 0. Chốt kiến trúc: ai gọi server? (một luồng duy nhất)

### Quyết định

| Caller | Gọi API nào | Attest thế nào |
|--------|-------------|----------------|
| **Chrome Extension** | `/api/extension/pair`, `/api/extension/session` (exchange) cho **Extension auth** (giữ UX zip pairing hiện tại) | Extension **không** biết `agentAttestSecret`. Gửi nonce → Agent ký → Extension **forward nguyên** `{ machineId, machineName, osUsername, nonce, ts, sig }` lên server |
| **Client Agent** | Cùng `/pair` hoặc `/session` **với personalToken/pairing của cùng User** (đã nhúng `config.json` zip Agent) — **bắt buộc** vì Agent hiện đã `redeemPairing` / `exchangeSession` rồi gọi `GET /api/gpm/client-sync` bằng Bearer | Agent **tự ký in-process** (`signAttest()`), **không** HTTP round-trip `POST /attest` của chính nó. Cùng `userId` + `machineId` → bind idempotent |

**Không** để Extension “tự bịa” machineId. **Không** đổi UX thành “chỉ Agent pair hộ Extension”.

**Không** invent “Agent service account” / User thứ hai trong DB. **`agentAttestSecret` chỉ nằm trong Client Agent zip / `config.json` trên máy — tuyệt đối không nhúng vào Extension zip.** Extension chỉ forward khối đã ký.

**Agent self-sign thuộc Track A (không cắt):** sau khi pair/exchange bắt buộc attest, luồng Agent hiện có (`client-agent/agent.js` → pair → session → `client-sync`) **gãy** nếu thiếu chữ ký. Đây không phải tính năng “sweeper mới”; là harden đường auth Agent đã ship.
### Luồng Extension (canonical cho GPM browser)

```
1. GET /api/extension/challenge → { challengeTs }   // server clock (§6.1d)
2. Extension sinh nonce
3. POST http://127.0.0.1:39741/attest  { nonce, challengeTs }
4. Agent trả { machineId, machineName, osUsername, nonce, ts, sig }
   sig = HMAC-SHA256(secret, canonicalPayload)  // §6.1e — gồm cả name/osUser
5. Extension KHÔNG sửa field đã ký; POST server /pair hoặc /session kèm nguyên khối attest
6. Server verify HMAC + nonce DB + bind
```

### Luồng Agent (canonical cho daemon — giữ client-sync sống)

```
1. Agent đọc secret + fingerprint từ config (in-process)
2. Agent GET /api/extension/challenge → challengeTs (hoặc Date.now() chỉ khi challenge fail + non-prod)
3. Agent tự sinh nonce = crypto.randomBytes(16).toString("hex") (mỗi lần pair/exchange — không xin server, không tái dùng)
4. Agent gọi signAttest({ nonce, challengeTs }) TRỰC TIẾP trong process — CẤM fetch localhost /attest
5. Agent POST /pair hoặc /session kèm attest → cùng checkAndBindMachine
6. Bearer dùng cho /api/gpm/client-sync (đã có sẵn hôm nay)
```
### Dọn code path song song

- Tầng 2 **không** mô tả Agent “pair thay Extension”.
- Tầng 3 **không** gửi machineId thô không chữ ký.
- GET `/` trên `:39741` = health only (ok, role, pid) — **không** dùng để bind.
- Một endpoint Agent: `POST /attest` (ký). Session-bind `/resolve-browser` = Track C sau.

---

## 1. Kiến Trúc & Luồng Hoạt Động

```
┌──────────────────── MÁY TÍNH WINDOWS ───────────────────────┐
│                                                              │
│  ┌─────────── CLIENT AGENT (Service / agent.js) ─────────┐  │
│  │ Fingerprint (cache ProgramData) + agentAttestSecret   │  │
│  │ HTTP 127.0.0.1:39741:                                 │  │
│  │   GET  /        → health only                         │  │
│  │   POST /attest  → ký {machineId,name,osUser,nonce,ts} │  │
│  │   CORS: chỉ chrome-extension:// / moz-extension://    │  │
│  │ Agent pair/session cùng User token + tự ký in-process │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │ POST /attest (nonce)               │
│  ┌───────────────────────▼───────────────────────────────┐  │
│  │ EXTENSION: redeemPairing / exchangeSession            │  │
│  │ Forward attest block (không biết secret) → HTTPS      │  │
│  └───────────────────────┬───────────────────────────────┘  │
└──────────────────────────┼──────────────────────────────────┘
                           │ HTTPS + attest fields
                           ▼
                POST /api/extension/pair | session
                → verify HMAC (timingSafeEqual) + nonce DB
                → checkAndBindMachine()
```

**Khi nào kiểm tra Machine ID + attest:**
- ✅ `/api/extension/pair` — bắt buộc attest hợp lệ
- ✅ `/api/extension/session` exchange (personalToken) — bắt buộc attest
- ❌ `/api/extension/session` refresh — không bắt attest mỗi lần

---

## 2. Kế Hoạch Thay Đổi Chi Tiết
### Tầng 1: Cơ Sở Dữ Liệu

#### [MODIFY] [schema.prisma](file:///c:/Users/datng/tiktok-automation/prisma/schema.prisma)

Thêm field vào model `User` (sau `extensionAuthEvents`):

```prisma
boundMachineId            String?   @unique @map("bound_machine_id")
boundMachineName          String?   @map("bound_machine_name")   // VD: DESKTOP-VANA
boundOsUser               String?   @map("bound_os_user")        // VD: datng
boundMachineAt            DateTime? @map("bound_machine_at")
agentAttestSecretSealed   String?   @map("agent_attest_secret_sealed") // AES-GCM, KHÔNG one-way hash

machineBindingLogs        MachineBindingLog[]
machineChangeRequests     MachineChangeRequest[]
```

```prisma
model ExtensionAttestNonce {
  nonce     String   @id
  userId    String   @map("user_id")
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")
  @@index([expiresAt])
  @@map("extension_attest_nonces")
}

model MachineBindingLog {
  id            String   @id @default(cuid())
  userId        String   @map("user_id")
  action        String   // BIND | UNLINK | BIND_REJECTED | FORCE_RESET | CHANGE_REQUESTED | CHANGE_APPROVED | CHANGE_DENIED
  machineId     String?  @map("machine_id")
  machineName   String?  @map("machine_name")
  osUsername    String?  @map("os_username")
  actorUserId   String?  @map("actor_user_id")
  actorName     String?  @map("actor_name")
  reason        String?
  ip            String?
  metadata      Json?
  createdAt     DateTime @default(now()) @map("created_at")
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, createdAt])
  @@index([machineId, createdAt])
  @@map("machine_binding_logs")
}

model MachineChangeRequest {
  id               String    @id @default(cuid())
  userId           String    @map("user_id")
  fromMachineId    String    @map("from_machine_id")
  fromMachineName  String?   @map("from_machine_name") // snapshot lúc tạo — audit CHANGE_APPROVED
  fromOsUsername   String?   @map("from_os_username")
  reason           String
  status           String    // PENDING | APPROVED | REJECTED
  reviewedById     String?   @map("reviewed_by_id")
  reviewedAt       DateTime? @map("reviewed_at")
  reviewNote       String?   @map("review_note")
  createdAt        DateTime  @default(now()) @map("created_at")
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, status])
  @@index([status, createdAt])
  @@map("machine_change_requests")
}
```

> [!IMPORTANT]
> `@unique` trên `boundMachineId` đảm bảo 1 máy = 1 user tại DB. `MachineChangeRequest` thuộc **Track A** (Q2) — schema cùng Tầng 1, không để chỉ mô tả ở §6.3.

Sau đó chạy: `npx prisma db push`

---

### Tầng 2: Client Agent

> Theo **§0**: Agent phục vụ `POST /attest` cho Extension; Agent **tự** pair/session với **cùng** personalToken/pairing để **client-sync không gãy** sau khi attest bắt buộc — gọi `signAttest()` in-process (không HTTP /attest; không service-account; không pair hộ Extension).

#### [MODIFY] [client-agent/agent.js](file:///c:/Users/datng/tiktok-automation/client-agent/agent.js)

**Thay đổi 1 – `computeMachineFingerprint()`**
- Giữ logic MachineGuid + Motherboard UUID → SHA256.
- Cache file: `%ProgramData%\TikTokFlow\machine-fp.cache` (TTL 24h). **Không** dùng `%LOCALAPPDATA%` (§6.1b / §6.3 thống nhất).

**Thay đổi 2 – HTTP lock server**
- `GET /` → `{ ok, role, pid, hostname }` only (health). **Không** trả machineId để bind.
- `POST /attest` body `{ nonce, challengeTs? }` → ký và trả `{ machineId, machineName, osUsername, nonce, ts, sig }` theo §6.1e; `ts` ưu tiên `challengeTs` (§6.1d).
- **CORS / Origin cho `/attest` (bắt buộc):** chỉ cho phép `Origin` bắt đầu bằng `chrome-extension://` hoặc `moz-extension://` (giống probe Agent hiện tại). Reject thiếu Origin / Origin web thường (`https://...`) với 403 — tránh trang web độc hại trên máy gọi localhost lấy sig hợp lệ rồi POST lên server.
- Preflight `OPTIONS` cùng allow-list.

**Thay đổi 3 – `main()`:** gọi `computeMachineFingerprint()` rồi `acquireAgentLock()`.

**Thay đổi 4 – Agent exchange JWT (cùng User; bắt buộc để client-sync không gãy):**
Khi `redeemPairingIfNeeded` / `exchangeSession` (đã có trong `agent.js` hôm nay): gọi `signAttest()` **in-process** rồi POST server kèm attest. Cùng `checkAndBindMachine` → cùng `boundMachineId`. **Không** tạo User riêng.

**Quy tắc bắt buộc:** self-pairing / self-exchange: sinh `nonce = crypto.randomBytes(16).toString("hex")`, rồi `signAttest(...)` **in-process**. **Tuyệt đối không** `fetch('http://127.0.0.1:39741/attest')` — thiếu Origin extension → CORS tự chặn (self-DoS).
---

### Tầng 3: Chrome Extension

#### [MODIFY] [extension/background.js](file:///c:/Users/datng/tiktok-automation/extension/background.js)

**Thay đổi 1 – `requestAgentAttest(nonce, challengeTs)`:**
Trước đó: `GET ${serverUrl}/api/extension/challenge` → `{ challengeTs }`.
Rồi `POST http://127.0.0.1:39741/attest` với `{ nonce, challengeTs }` → nhận khối đã ký; verify echo `nonce` + `ts === challengeTs`. Extension **không** có / không đọc `agentAttestSecret`.

**Thay đổi 2 – `redeemPairingIfNeeded()` / `exchangeSessionFromPersonalToken()`:**
Trước khi gọi server: lấy attest → forward nguyên `{ machineId, machineName, osUsername, nonce, ts, sig }` kèm pairing/token. Agent offline → poll 3–5s / ~60s (§6.4); không gửi machineId thô không chữ ký.

**Thay đổi 3 – 403 machine binding:** badge/message rõ (thiết bị / attest / occupied).

**Thay đổi 4 – `probeClientAgent()`:** chỉ `GET /` health; không dùng để bind.

---

### Tầng 4: Server – Helper Function & API Routes

#### [MODIFY] [src/lib/extension-auth.ts](file:///c:/Users/datng/tiktok-automation/src/lib/extension-auth.ts)

Thêm function mới `checkAndBindMachine()` (sau `revokeExtensionCredentials`).
**Snippet dưới đây là nguồn chân lý — phải khớp §0 / §6.1c–e; không copy bản cũ chỉ check machineId.**

```ts
export type MachineAttestInput = {
  machineId?: string | null;
  machineName?: string | null;
  osUsername?: string | null;
  nonce?: string | null;
  ts?: number | string | null; // challengeTs (server clock), Unix ms
  sig?: string | null;
};

export type MachineBindResult =
  | { ok: true }
  | { ok: false; status: 403 | 429; error: string; reason?: string; retryAfterSec?: number };

/**
 * 1) Verify Agent attest (HMAC + challengeTs + nonce DB)
 * 2) Bind / conflict / refresh display fields
 * Gọi trong /api/extension/pair và /api/extension/session (exchange only).
 *
 * Rate-limit bad_sig: xử lý **trong helper** (không để caller đoán).
 * meta.rlPrefix = "pair" | "session" → bucket keys §6.1f.
 * - dưới hạn: { ok:false, status:403, reason:"bad_sig" }
 * - vượt hạn sau bump: { ok:false, status:429, reason:"attest_rate_limited" }
 * Caller: `return NextResponse.json({...}, { status: machineCheck.status, headers: Retry-After nếu 429 })`.
 */
export async function checkAndBindMachine(
  userId: string,
  input: MachineAttestInput,
  meta: { ip?: string; actorName?: string; rlPrefix?: "pair" | "session" } = {},
  db: DbClient = prisma
): Promise<MachineBindResult> {
  const machineId = typeof input.machineId === "string" ? input.machineId.trim() : "";
  const machineName = typeof input.machineName === "string" ? input.machineName.trim() : "";
  const osUsername = typeof input.osUsername === "string" ? input.osUsername.trim() : "";
  const nonce = typeof input.nonce === "string" ? input.nonce.trim() : "";
  const sig = typeof input.sig === "string" ? input.sig.trim().toLowerCase() : "";
  const ts = Number(input.ts);

  if (!machineId || !nonce || !sig || !Number.isFinite(ts)) {
    await writeMachineBindingLog(db, { userId, action: "BIND_REJECTED", reason: "missing_attest", ip: meta.ip });
    return {
      ok: false,
      status: 403,
      error:
        "Thiếu chứng thực Client Agent (machineId/nonce/ts/sig). Hãy đảm bảo Agent đang chạy (Windows Service) rồi thử lại.",
    };
  }

  // challengeTs window (±120s) — server clock
  if (Math.abs(Date.now() - ts) > 120_000) {
    await writeMachineBindingLog(db, { userId, action: "BIND_REJECTED", reason: "ts_window", machineId, ip: meta.ip });
    return { ok: false, status: 403, error: "Chứng thực Agent hết hạn hoặc đồng bộ thời gian thất bại. Thử lại." };
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      boundMachineId: true,
      boundMachineName: true,
      agentAttestSecretSealed: true, // encrypted-at-rest; NOT one-way hash
    },
  });
  if (!user) return { ok: false, status: 403, error: "Người dùng không tồn tại." };
  if (!user.agentAttestSecretSealed) {
    return {
      ok: false,
      status: 403,
      error: "Thiếu agentAttestSecret. Tải lại zip Client Agent (pairing mới) để nhận secret.",
    };
  }

  // Decrypt sealed secret (same pattern as sealPersonalToken — reversible AES-GCM)
  const attestSecret = revealAgentAttestSecret(user.agentAttestSecretSealed);

  const canonical = [machineId, machineName || "", osUsername || "", nonce, String(ts)].join("\n");
  const expected = crypto.createHmac("sha256", attestSecret).update(canonical).digest("hex");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await writeMachineBindingLog(db, { userId, action: "BIND_REJECTED", reason: "bad_sig", machineId, ip: meta.ip });
    const prefix = meta.rlPrefix ?? "pair";
    const ip = meta.ip || "unknown";
    const ipLim = checkRateLimit(`${prefix}:attestfail:ip:${ip}`, 20);
    const userLim = checkRateLimit(`${prefix}:attestfail:user:${userId}`, 10);
    if (!ipLim.ok || !userLim.ok) {
      const retryAfterSec = Math.max(ipLim.retryAfterSec, userLim.retryAfterSec, 1);
      return {
        ok: false,
        status: 429,
        reason: "attest_rate_limited",
        retryAfterSec,
        error: "Quá nhiều lần xác thực Agent thất bại. Thử lại sau.",
      };
    }
    return { ok: false, status: 403, reason: "bad_sig", error: "Chữ ký Client Agent không hợp lệ." };
  }

  // Replay guard — shared DB (multi-instance safe)
  try {
    await db.extensionAttestNonce.create({
      data: {
        nonce,
        userId,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      },
    });
  } catch (e: any) {
    if (e?.code === "P2002") {
      await writeMachineBindingLog(db, { userId, action: "BIND_REJECTED", reason: "nonce_replay", machineId, ip: meta.ip });
      return { ok: false, status: 403, error: "Nonce attest đã dùng. Thử lại." };
    }
    throw e;
  }

  // --- Bind / conflict (after attest passed) ---
  try {
    if (!user.boundMachineId) {
      const conflict = await db.user.findFirst({
        where: { boundMachineId: machineId, NOT: { id: userId } },
        select: { id: true, email: true, username: true },
      });
      if (conflict) {
        await writeMachineBindingLog(db, {
          userId,
          action: "BIND_REJECTED",
          reason: "occupied",
          machineId,
          metadata: { conflictUserId: conflict.id },
          ip: meta.ip,
        });
        return {
          ok: false,
          status: 403,
          error: "Thiết bị máy tính này đã được liên kết với một nhân sự khác. Liên hệ Admin để được hỗ trợ.",
        };
      }

      await db.user.update({
        where: { id: userId },
        data: {
          boundMachineId: machineId,
          boundMachineName: machineName || null,
          boundOsUser: osUsername || null,
          boundMachineAt: new Date(),
        },
      });
      clearUserCache(userId);
      await writeMachineBindingLog(db, {
        userId,
        action: "BIND",
        machineId,
        machineName,
        osUsername,
        ip: meta.ip,
        actorName: meta.actorName,
      });
      return { ok: true };
    }

    if (user.boundMachineId !== machineId) {
      await writeMachineBindingLog(db, { userId, action: "BIND_REJECTED", reason: "mismatch", machineId, ip: meta.ip });
      return {
        ok: false,
        status: 403,
        error: `Tài khoản đã được gắn cố định với máy tính "${user.boundMachineName || user.boundMachineId}". Không thể kích hoạt trên máy tính khác. Gửi yêu cầu đổi máy hoặc liên hệ Admin.`,
      };
    }

    // Same machineId → refresh display fields
    await db.user.update({
      where: { id: userId },
      data: {
        boundMachineName: machineName || user.boundMachineName,
        boundOsUser: osUsername || undefined,
        boundMachineAt: new Date(),
      },
    });
    return { ok: true };
  } catch (e: any) {
    if (e?.code === "P2002") {
      await writeMachineBindingLog(db, { userId, action: "BIND_REJECTED", reason: "race_occupied", machineId, ip: meta.ip });
      return {
        ok: false,
        status: 403,
        error: "Máy này vừa được liên kết với tài khoản khác. Liên hệ Admin.",
      };
    }
    throw e;
  }
}
```

**Schema:** nguồn chân lý = **Tầng 1** (`boundMachine*`, `agentAttestSecretSealed`, `ExtensionAttestNonce`, `MachineBindingLog`, `MachineChangeRequest`). Không copy lệch ở đây.

**Lưu secret:** `sealAgentAttestSecret` / `revealAgentAttestSecret` — **reuse đúng** `getPersonalTokenCryptoKey()` / `EXTENSION_SESSION_SECRET` (cùng AES-256-GCM format `e1.…` như `sealPersonalToken`). **Không** thêm env key riêng / key-management path mới.

**Helper audit (khai báo cùng file):**

```ts
export async function writeMachineBindingLog(
  db: DbClient,
  entry: {
    userId: string;
    action: string; // BIND | BIND_REJECTED | UNLINK | FORCE_RESET | CHANGE_REQUESTED | CHANGE_APPROVED | CHANGE_DENIED | ...
    reason?: string | null;
    machineId?: string | null;
    machineName?: string | null;
    osUsername?: string | null;
    ip?: string | null;
    actorUserId?: string | null; // admin/user id — prefer over free-text for audit
    actorName?: string | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  await db.machineBindingLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      reason: entry.reason ?? null,
      machineId: entry.machineId ?? null,
      machineName: entry.machineName ?? null,
      osUsername: entry.osUsername ?? null,
      ip: entry.ip ?? null,
      actorUserId: entry.actorUserId ?? null,
      actorName: entry.actorName ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    },
  });
}
```

#### [NEW] [src/app/api/extension/challenge/route.ts](file:///c:/Users/datng/tiktok-automation/src/app/api/extension/challenge/route.ts)

Contract **duy nhất** cho §6.1d (không dùng Date header / endpoint khác):

```ts
// GET /api/extension/challenge — public nhẹ
// Rate limit: checkRateLimit(`challenge:ip:${ip}`, 600) — 600/60s / IP
// (NAT văn phòng: nới so với 120; endpoint chỉ echo time — rủi ro thấp)
export async function GET(req: Request) {
  const ip = getClientIp(req);
  const lim = checkRateLimit(`challenge:ip:${ip}`, 600);
  if (!lim.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(lim.retryAfterSec) } }
    );
  }
  return NextResponse.json({ challengeTs: Date.now() });
}
```

Extension **và** Agent gọi endpoint này **trước** khi ký / gọi `/attest`. Không fallback wall-clock Agent trên production.

#### [MODIFY] [src/app/api/extension/pair/route.ts](file:///c:/Users/datng/tiktok-automation/src/app/api/extension/pair/route.ts)

Sau khi xác nhận pairing code hợp lệ và user hợp lệ, trước `issueSessionBundle`:

```ts
const { pairingCode, machineId, machineName, osUsername, nonce, ts, sig } = body;

const machineCheck = await checkAndBindMachine(
  row.user.id,
  { machineId, machineName, osUsername, nonce, ts, sig },
  { ip: getClientIp(req), rlPrefix: "pair" }
);
if (!machineCheck.ok) {
  const headers =
    machineCheck.status === 429
      ? { "Retry-After": String(machineCheck.retryAfterSec ?? 60) }
      : undefined;
  return NextResponse.json(
    { success: false, error: machineCheck.error, reason: machineCheck.reason },
    { status: machineCheck.status, headers }
  );
}
```

Khi tạo pairing zip / `createPairingCodeForUser` / **Agent download**:

**Vòng đời `agentAttestSecret` (chốt — tránh support M10 nhầm):**

| Hành động | Rotate secret server? | Ghi chú |
|-----------|----------------------|---------|
| `GET /api/client-agent/download` **mặc định** | **Không** | Nếu user đã có `agentAttestSecretSealed` → **reveal + nhúng lại cùng plaintext** vào zip. Máy wipe/mất → tải lại zip vẫn pair được với secret cũ (sau unlink/change-request nếu cần đổi `boundMachineId`). Re-download khi Agent cũ còn chạy **không** làm 403 bad_sig. |
| Download lần đầu (sealed = null) | **Mint một lần** | Sinh 32 bytes → seal → nhúng zip. |
| Admin **Rotate Agent attest** (mutation / `?rotateAttest=1` chỉ admin) | **Có** | Seal mới; zip mới có secret mới. Agent đang chạy **403 bad_sig** đến khi thay `config.json` + **restart Service** ([3] hoặc `nssm restart`). |
| `setup-agent.bat` **[3] DOI TOKEN** | **Không** | Chỉ ghi personalToken/pairing user nhập + restart. **Không** tự sinh secret mới trên server. |
| Admin unlink / change-request duyệt | **Không** | Chỉ clear bind; secret giữ (trừ khi admin cũng rotate). |
| Extension zip download | N/A | **Không** chứa secret. |

**Khôi phục máy chết/wipe:** (1) admin unlink hoặc change-request nếu còn bind máy cũ; (2) user tải Agent zip **mặc định** (reuse secret); (3) `setup-agent.bat` [1] trên máy mới. **Không** cần rotate trừ khi nghi lộ secret.

#### [MODIFY] [src/app/api/extension/session/route.ts](file:///c:/Users/datng/tiktok-automation/src/app/api/extension/session/route.ts)

Trên **exchange path** (personalToken → JWT) — **bắt buộc attest giống pair** (§0 / §1):

```ts
const { refreshToken, machineId, machineName, osUsername, nonce, ts, sig } = body;

// Chỉ trên exchange path (có personalToken / không phải refresh-only):
const machineCheck = await checkAndBindMachine(
  user.id,
  { machineId, machineName, osUsername, nonce, ts, sig },
  { ip: getClientIp(req), rlPrefix: "session" }
);
if (!machineCheck.ok) {
  const headers =
    machineCheck.status === 429
      ? { "Retry-After": String(machineCheck.retryAfterSec ?? 60) }
      : undefined;
  return NextResponse.json(
    { success: false, error: machineCheck.error, reason: machineCheck.reason },
    { status: machineCheck.status, headers }
  );
}
```

Refresh-token-only path: **không** gọi `checkAndBindMachine` (Q3).

> [!NOTE]> Refresh token rotation path **không** cần kiểm tra machineId vì binding đã xảy ra tại pair/exchange. Chỉ enforce ở 2 điểm đầu vào.

---

### Tầng 5: Admin tRPC Router

#### [MODIFY] [src/trpc/routers/admin.ts](file:///c:/Users/datng/tiktok-automation/src/trpc/routers/admin.ts)

**Thay đổi 1 – `listUsers`:** Thêm vào `select`:
```ts
boundMachineId: true,
boundMachineName: true,
boundOsUser: true,
boundMachineAt: true,
```

Thêm vào `return users.map(...)`:
```ts
boundMachineId: u.boundMachineId || null,
boundMachineName: u.boundMachineName || null,
boundOsUser: u.boundOsUser || null,
boundMachineAt: u.boundMachineAt || null,
```

**Thay đổi 2 – Thêm mutation `unlinkUserMachine`:**
```ts
unlinkUserMachine: adminProcedure
  .input(z.object({ userId: z.string(), reason: z.string().min(3).optional() }))
  .mutation(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        boundMachineId: true,
        boundMachineName: true,
        boundOsUser: true,
      },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy người dùng." });
    if (!user.boundMachineId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Người dùng chưa liên kết thiết bị nào." });
    }

    const prevMachineId = user.boundMachineId;
    await ctx.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: input.userId },
        data: {
          boundMachineId: null,
          boundMachineName: null,
          boundOsUser: null,
          boundMachineAt: null,
          extensionSessionVersion: { increment: 1 },
        },
      });
      await tx.extensionRefreshToken.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await writeMachineBindingLog(tx, {
        userId: input.userId,
        action: "UNLINK",
        machineId: prevMachineId,
        machineName: user.boundMachineName,
        osUsername: user.boundOsUser,
        reason: input.reason ?? "admin_unlink",
        actorUserId: ctx.session.user.id,
        actorName: ctx.session.user.name ?? ctx.session.user.email ?? null,
      });
    });

    clearUserCache(input.userId);
    return { success: true };
  }),
```

> [!NOTE]
> Dùng logic kill sessions (không `revokeExtensionCredentials`) để giữ `personalToken`. **Bắt buộc** `writeMachineBindingLog` với `actorUserId` (§6.5) — không chỉ update User.

**Thay đổi 3 – Machine change-request (Track A — bắt buộc ngang unlink):**

```ts
// userProcedure — tạo yêu cầu đổi máy (1 PENDING / user)
requestMachineChange: protectedProcedure
  .input(z.object({ reason: z.string().min(5).max(500) }))
  .mutation(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        boundMachineId: true,
        boundMachineName: true,
        boundOsUser: true,
      },
    });
    if (!user?.boundMachineId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Tài khoản chưa gắn máy." });
    }
    const pending = await ctx.prisma.machineChangeRequest.findFirst({
      where: { userId: user.id, status: "PENDING" },
    });
    if (pending) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Đã có yêu cầu đang chờ duyệt." });
    }
    const row = await ctx.prisma.machineChangeRequest.create({
      data: {
        userId: user.id,
        reason: input.reason,
        fromMachineId: user.boundMachineId,
        fromMachineName: user.boundMachineName,
        fromOsUsername: user.boundOsUser,
        status: "PENDING",
      },
    });
    await writeMachineBindingLog(ctx.prisma, {
      userId: user.id,
      action: "CHANGE_REQUESTED",
      machineId: user.boundMachineId,
      machineName: user.boundMachineName,
      osUsername: user.boundOsUser,
      reason: input.reason,
      actorUserId: user.id,
    });
    return row;
  }),

// adminProcedure — duyệt / từ chối
reviewMachineChangeRequest: adminProcedure
  .input(z.object({
    requestId: z.string(),
    decision: z.enum(["APPROVED", "REJECTED"]),
    note: z.string().max(500).optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const req = await ctx.prisma.machineChangeRequest.findUnique({ where: { id: input.requestId } });
    if (!req || req.status !== "PENDING") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Yêu cầu không hợp lệ." });
    }

    const user = await ctx.prisma.user.findUnique({
      where: { id: req.userId },
      select: { boundMachineId: true, boundMachineName: true, boundOsUser: true },
    });
    // Re-verify: máy hiện tại vẫn khớp snapshot request (tránh audit confuse nếu đã unlink/pair khác)
    const stillMatches =
      Boolean(user?.boundMachineId) && user!.boundMachineId === req.fromMachineId;
    if (input.decision === "APPROVED" && !stillMatches) {
      await ctx.prisma.machineChangeRequest.update({
        where: { id: req.id },
        data: {
          status: "REJECTED",
          reviewedById: ctx.session.user.id,
          reviewedAt: new Date(),
          reviewNote: input.note ?? "auto_stale: boundMachineId no longer matches fromMachineId",
        },
      });
      await writeMachineBindingLog(ctx.prisma, {
        userId: req.userId,
        action: "CHANGE_DENIED",
        machineId: req.fromMachineId,
        machineName: req.fromMachineName,
        osUsername: req.fromOsUsername,
        reason: "stale_request_machine_mismatch",
        actorUserId: ctx.session.user.id,
        actorName: ctx.session.user.name ?? ctx.session.user.email ?? null,
        metadata: {
          requestId: req.id,
          currentBoundMachineId: user?.boundMachineId ?? null,
        },
      });
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Yêu cầu đã lỗi thời (máy hiện tại không còn khớp). Đã đánh dấu từ chối.",
      });
    }

    await ctx.prisma.$transaction(async (tx) => {
      await tx.machineChangeRequest.update({
        where: { id: req.id },
        data: {
          status: input.decision,
          reviewedById: ctx.session.user.id,
          reviewedAt: new Date(),
          reviewNote: input.note ?? null,
        },
      });
      if (input.decision === "APPROVED") {
        await tx.user.update({
          where: { id: req.userId },
          data: {
            boundMachineId: null,
            boundMachineName: null,
            boundOsUser: null,
            boundMachineAt: null,
            extensionSessionVersion: { increment: 1 },
          },
        });
        await tx.extensionRefreshToken.updateMany({
          where: { userId: req.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await writeMachineBindingLog(tx, {
        userId: req.userId,
        action: input.decision === "APPROVED" ? "CHANGE_APPROVED" : "CHANGE_DENIED",
        machineId: req.fromMachineId,
        machineName: req.fromMachineName,
        osUsername: req.fromOsUsername,
        reason: input.note ?? req.reason,
        actorUserId: ctx.session.user.id,
        actorName: ctx.session.user.name ?? ctx.session.user.email ?? null,
        metadata: { requestId: req.id },
      });
    });
    clearUserCache(req.userId);
    return { success: true };
  }),

listPendingMachineChangeRequests: adminProcedure.query(async ({ ctx }) => {
  return ctx.prisma.machineChangeRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          boundMachineId: true,
          boundMachineName: true,
          boundOsUser: true,
        },
      },
    },
  });
}),
```

---

### Tầng 6: Admin UI – Trang Quản Lý Nhân Sự

#### [MODIFY] [src/app/(protected)/users/page.tsx](file:///c:/Users/datng/tiktok-automation/src/app/(protected)/users/page.tsx)

> [!NOTE]
> File này có 2910 dòng. Các thay đổi sau đây là **có chủ đích và tối thiểu**, tránh làm hỏng code hiện có.

**Thay đổi 1 – Import thêm icon:**
```ts
import { Monitor, MonitorX } from "lucide-react";
```

**Thay đổi 2 – Thêm `"boundDevice"` vào `visibleColumns` state:**
```ts
const [visibleColumns, setVisibleColumns] = useState({
  // ... existing columns ...
  boundDevice: true, // NEW
});
```

**Thay đổi 3 – Thêm cột header "Thiết Bị" trong bảng:**
Trong phần render `<th>` (cạnh cột "Trạng thái"):
```tsx
{visibleColumns.boundDevice && (
  <th>Thiết Bị</th>
)}
```

**Thay đổi 4 – Thêm cell dữ liệu "Thiết Bị" trong bảng:**
```tsx
{visibleColumns.boundDevice && (
  <td>
    {u.boundMachineId ? (
      <Tooltip>
        <TooltipTrigger>
          <span className="flex items-center gap-1 text-emerald-400 text-xs font-mono">
            <Monitor size={13} /> {u.boundMachineName || "Đã liên kết"}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>OS User: {u.boundOsUser || "—"}</p>
          <p>Liên kết lúc: {u.boundMachineAt ? new Date(u.boundMachineAt).toLocaleString("vi-VN") : "—"}</p>
        </TooltipContent>
      </Tooltip>
    ) : (
      <span className="text-zinc-500 text-xs flex items-center gap-1">
        <MonitorX size={13} /> Chưa kích hoạt
      </span>
    )}
  </td>
)}
```

**Thay đổi 5 – Thêm option "Hủy Liên Kết Máy Tính" vào DropdownMenu 3 chấm:**
```tsx
{u.boundMachineId && (
  <>
    <DropdownMenuSeparator />
    <DropdownMenuItem
      className="text-amber-400"
      onClick={() => setUnlinkMachineTarget(u)}
    >
      <MonitorX size={14} className="mr-2" />
      Hủy Liên Kết Máy Tính
    </DropdownMenuItem>
  </>
)}
```

**Thay đổi 6 – Modal xác nhận hủy liên kết + gọi tRPC `unlinkUserMachine` (kèm reason tùy chọn).**

**Thay đổi 7 – Admin: danh sách `MachineChangeRequest` PENDING** (panel/tab trên `/users` hoặc modal):
- Query `listPendingMachineChangeRequests`
- Nút Duyệt / Từ chối → `reviewMachineChangeRequest` (note bắt buộc khi từ chối)
- Sau duyệt: UI toast “User có thể pair lại trên máy mới”

---

### Tầng 6b: User UI – Yêu cầu đổi máy (Track A)

#### [MODIFY] [src/app/(protected)/settings/page.tsx](file:///c:/Users/datng/tiktok-automation/src/app/(protected)/settings/page.tsx)

Khi user đã có `boundMachineId` (lấy từ session/me query):

- Section **“Thiết bị đã gắn”**: hiện `boundMachineName` / `boundOsUser` (read-only).
- Nút **“Yêu cầu đổi máy”** → dialog lý do (min 5 ký tự) → `requestMachineChange`.
- Nếu đã có PENDING: hiện trạng thái “Đang chờ Admin duyệt” (disable nút tạo mới).
- **Không** cho user tự unlink.

---

### Tầng 7: Tài Liệu Hướng Dẫn

#### [MODIFY] [src/app/docs/_components/ClientAgentSection.tsx](file:///c:/Users/datng/tiktok-automation/src/app/docs/_components/ClientAgentSection.tsx)
- Bổ sung giải thích về cơ chế Machine ID Binding và tầm quan trọng.

#### [MODIFY] [src/app/docs/_components/ExtensionSection.tsx](file:///c:/Users/datng/tiktok-automation/src/app/docs/_components/ExtensionSection.tsx)
- Thêm banner cảnh báo **đầu trang**:

> ⚠️ **BẮT BUỘC: Khởi chạy Client Agent TRƯỚC khi nạp Extension vào GPMLogin**
>
> Hệ thống sử dụng cơ chế bảo mật khóa thiết bị phần cứng (Machine ID Binding). Bạn phải giải nén Client Agent và chạy `setup-agent.bat` **một lần** (phím **1** → cài **Windows Service** vào Program Files; UAC) **trước** khi nạp Extension. Nếu Agent chưa chạy (`localhost:39741` offline), Extension không xác thực được thiết bị. (Liên kết GPM theo session cookie là giai đoạn riêng — xem §5/§7.)

---

## 3. Câu Hỏi Mở (Cần Xác Nhận Trước Khi Code)

> Đã chốt mặc định sau review bảo mật — chi tiết §6.8. Giữ các Q dưới đây nếu muốn đổi trước khi code.

> [!IMPORTANT]
> **Q1 – machineId bắt buộc hay tùy chọn?**
> **Mặc định sau review:** bắt buộc kèm **HMAC attest** (không chỉ gửi machineId thô). Thiếu Agent / sai chữ ký → 403.

> [!IMPORTANT]
> **Q2 – Khi Admin hủy liên kết máy / user đổi máy hợp lệ?**
> **Mặc định:** (1) Admin unlink/force-reset có lý do + `MachineBindingLog`; (2) User gửi **yêu cầu đổi máy** → admin duyệt — **không** bắt tải lại ZIP trừ khi revoke token riêng.

> [!IMPORTANT]
> **Q3 – Enforce machineId ở refresh path?**
> **Mặc định:** **KHÔNG** trên refresh JWT; chỉ pair + personalToken exchange (+ attest).

> [!IMPORTANT]
> **Q4 – Chống giả cổng 39741?**
> **Mặc định:** `agentAttestSecret` + nonce HMAC (§6.1). Không triển khai Machine ID Binding nếu bỏ bước này.
---

## 4. Kế Hoạch Kiểm Thử

| # | Test Case | Kết Quả Mong Đợi |
|---|-----------|-----------------|
| 1 | Agent chạy → `curl http://127.0.0.1:39741/` | Health only (`ok`, role, pid) — **không** machineId bind |
| 2 | Pair lần đầu (user chưa có máy) | Server bind máy, trả về session thành công |
| 3 | Pair lại trên cùng máy | Server xác nhận khớp, cho qua |
| 4 | Pair trên máy khác (user đã có máy khác) | Server từ chối 403 |
| 5 | Pair trên máy bị người khác chiếm | Server từ chối 403 |
| 6 | Pair không có Agent (machineId = null) | Server từ chối 403 |
| 7 | Admin hủy liên kết → user pair lại trên máy mới | Thành công, bound mới |
| 8 | Bảng `/users` → cột "Thiết Bị" hiển thị tên máy | ✅ `🖥️ DESKTOP-VANA` |
| 9 | Bảng `/users` → user chưa pair | ✅ `⚪ Chưa kích hoạt` |
| 10 | Menu 3 chấm → Hủy Liên Kết Máy Tính | Modal xác nhận, hủy thành công |
| 11+ | Xem **§6.7** (M1–M7): race 2 user/1 máy, đổi mainboard, cache CIM, fake :39741, replay nonce, change-request, Ghost trùng GUID | |

---

## 5. [TÁCH PR] Liên Kết GPM Theo Session (Multi-Browser) + Agent Windows Service

> **⚠️ Không gộp critical path với Machine ID Binding.**  
> §5 tăng surface bảo mật local (CDP đọc cookie mọi tab trong profile GPM có remote-debugging mở — không chỉ TikTok). Review bảo mật **độc lập**, ship **PR/kế hoạch riêng** sau khi Machine ID + Service cứng ACL đã ổn.  
> Chi tiết đầy đủ vẫn giữ dưới đây để không mất ngữ cảnh; **thứ tự triển khai: Machine ID (§1–4, §6) → Service ACL (§5.4/§6.1b) → Session-bind (§5.1–5.3, §7) sau.**  
> **Track C blocked:** không ship `/resolve-browser` nếu chưa wire attest (HMAC) trên endpoint này — xem §5.3.1.

### 5.0 Rủi ro CDP (bắt buộc review riêng trước khi code session-bind)

- GPM `profiles/start` trả `remote_debugging_port` → **mọi process local** (không chỉ Agent) có thể CDP attach và đọc cookie/session **mọi tab** trong profile đó, không chỉ TikTok.
- `/resolve-browser` lộ mapping **TikTok session ↔ GPM profile đang mở** — nhạy cảm. Loopback **không** tin mặc định: process local khác (và trang web nếu CORS lỏng) có thể probe.
- **Bắt buộc:** hash sessionid **chỉ trong memory**; audit không ghi raw cookie ra disk/log.  
- **Bắt buộc trước ship C:** attest trên `/resolve-browser` + CORS extension-only (§5.3.1). Machine ID (A) có thể ship trước **không** có resolve-browser.

### 5.1 Vấn đề (session-bind + auto-start)

- Hiện Extension chỉ gắn TikTok → GPM bằng `@handle` trong **tên/note** profile → không phản ánh “account đang mở trong browser này”, và kém tin cậy khi nhiều profile mở cùng lúc.
- Auto-start hiện dùng Task Scheduler (`setup-agent.bat` → `TikTokFlow_Agent_Daemon` onlogon) — dễ bỏ bước cài, lỗi im lặng, không restart khi crash.

### 5.2 Hướng xử lý đã chọn

1. **Resolver = Client Agent** tại `127.0.0.1:39741` (đã có lock HTTP + `playwright-core` + đường dẫn GPM).
2. **Khóa bind = hash TikTok `sessionid`** (fail-closed: đúng **một** profile đang mở khớp).
3. **Auto-start = Windows Service qua NSSM** kèm trong zip. `setup-agent.bat` = UI cài **một lần** (Install / Uninstall / Đổi Token), không phải launcher hàng ngày.
4. **Fallback:** unique `@handle` trong name/note (logic hiện tại) nếu Agent offline / unsupported / session match thất bại.

```
Extension (trong từng GPM browser)
  → GET /api/extension/challenge → challengeTs
  → đọc sessionid cookie + detect @username
  → POST http://127.0.0.1:39741/resolve-browser
       { sessionHash, username, nonce, challengeTs }
Client Agent
  → CORS chrome-extension only
  → “đang mở”: ưu tiên GPM API running/stopped; SingletonLock chỉ secondary
  → CDP walk có per-profile + overall timeout
  → đúng 1 match → { ok, gpmProfileId, gpmProfileName, matchedVia, nonce, ts, sig }
Extension
  → POST /api/extension/report kèm khối attest resolve (server verify HMAC)
  → cache linkedGpm* ; invalidate khi username ≠ linkedGpmUsername (cố ý — multi-account cùng profile)
```

### 5.3 Thay đổi code — Session resolve

#### [MODIFY] [client-agent/agent.js](file:///c:/Users/datng/tiktok-automation/client-agent/agent.js)

- Mở rộng lock HTTP server thêm `POST /resolve-browser`.
- **§5.3.1 Attest (ship-blocker cho Track C — không chỉ “dependency”):**
  - Body bắt buộc: `{ sessionHash, username, nonce, challengeTs }`.
  - CORS / Origin: chỉ `chrome-extension://` / `moz-extension://` (giống `/attest`); thiếu Origin → 403.
  - Response (mọi nhánh ok/fail): kèm `{ nonce, ts: challengeTs, sig }` với  
    `sig = HMAC-SHA256(agentAttestSecret, canonicalResolve)`  
    `canonicalResolve = [machineId, sessionHash, gpmProfileId || "", reason || "", nonce, String(ts)].join("\n")`.
  - Extension **forward** khối này lên `POST /api/extension/report` (hoặc endpoint verify cạnh report). Server `revealAgentAttestSecret` + `timingSafeEqual` — **không** tin `gpmProfileId` thô từ client không chữ ký.
  - **Không ship** resolve-browser chỉ CORS + JSON parse mà bỏ bước này.
- Bước xử lý resolve:
  1. List profile GPM local (reuse discovery/list hiện có).
  2. **“Đang mở” — tín hiệu chính = GPM local API** (`status` / `is_running` / tương đương nếu API trả). **SingletonLock chỉ secondary** (xác nhận / khi API thiếu field). Stale lock sau crash Chromium **không** được coi là đủ để gọi `start` / CDP — tránh hang hoặc double-instance tranh lock.
  3. Chỉ CDP trên profile đã xác định đang chạy; **không** `start` profile GPM báo stopped.
  4. Mỗi profile: lấy `remote_debugging_port` cho instance đang chạy → CDP → hash cookie TikTok (cùng thuật toán Extension).
  5. **Timeout:** per-profile CDP **3s** (skip + tiếp tục); overall request **15s** (trả `reason: "timeout"`). Mutex serialize vẫn giữ — timeout tránh một profile treo block cả hàng đợi.
  6. Đúng 1 hash khớp → ok + attest; không thì `no_match` | `ambiguous` | `gpm_offline` | `timeout` + attest.
- Không log raw session cookie — chỉ hash / profile id.

#### [MODIFY] [extension/background.js](file:///c:/Users/datng/tiktok-automation/extension/background.js)

Trong `resolveGpmProfileForUsername`, **trước** label match:

1. `GET /api/extension/challenge` → `challengeTs`.
2. `chrome.cookies.get` TikTok session cookie(s) → hash (Web Crypto).
3. `POST http://127.0.0.1:39741/resolve-browser` kèm nonce + challengeTs.
4. Thành công + có sig → report kèm attest → cache `linkedGpm*`.
5. Thất bại / Agent cũ:
   - **404** hoặc body không đúng shape (`ok`/`sig` thiếu) → `reason: "agent_unsupported"` → **fallback label `@handle`**, **không** map thành `gpm_offline`.
   - Agent unreachable → offline → fallback label.
6. Invalidate cache khi username khác `linkedGpmUsername` — **cố ý** (đổi account trong cùng GPM profile / cookie jar chung).
7. Popup: phân biệt Offline vs Agent chưa hỗ trợ resolve vs session-bind fail.

#### [MODIFY] report API (server)

Verify HMAC resolve trước khi chấp nhận cập nhật `gpmProfileId` từ Extension (cùng secret / timingSafeEqual). Reject thiếu/sai sig.

### 5.4 Thay đổi — Windows Service auto-start

> Phần **Service install** có thể đi cùng Machine ID (giảm ma sát bat) **trước** session-bind; nhưng phải tuân §6.1b (ProgramFiles + ACL).

#### [MODIFY] [client-agent/setup-agent.bat](file:///c:/Users/datng/tiktok-automation/client-agent/setup-agent.bat)

| Menu | Hành vi mới |
|------|-------------|
| `[1] CAI DAT` | UAC: **kill** process `agent.js` / task `TikTokFlow_Agent_*` / giải phóng `:39741` **trước**; copy ProgramFiles + ACL; cài Service NSSM; Delayed Auto-start; xóa schtasks cũ; start service |
| `[2] GO BO` | Stop + delete service; dọn schtasks; **không** bắt buộc xóa ProgramFiles (có option) |
| `[3] DOI TOKEN` | Ghi config trong install root + `nssm restart` |

#### [MODIFY] [client-agent/stop-agent.bat](file:///c:/Users/datng/tiktok-automation/client-agent/stop-agent.bat)

- Ưu tiên stop Windows Service nếu có; fallback kill process `agent.js`.

### 5.4b NSSM / AV / EDR (rủi ro vận hành)

NSSM thường bị Defender/EDR gắn cờ (persistence / dual-use tooling) — **heads-up ops/support** trước rollout.

**Bắt buộc trước rollout rộng:**

1. **Code-signing** (Authenticode) cho `nssm.exe`, `node.exe` nếu redistribute, ideally installer.
2. **Pin + checksum** NSSM trong `pack-client-agent-base.ps1` (URL version cố định + SHA256 verify). **Không** tin fetch ad-hoc lúc pack.
3. **Truyền thông IT/Sec:** whitelist `%ProgramFiles%\TikTokFlow\ClientAgent\` + hash NSSM đã pin.
4. **Test:** Defender mặc định + ≥1 EDR trên máy sạch trước GA.
5. Fallback nếu NSSM bị block hàng loạt: Task Scheduler onlogon **nhưng** binary vẫn trong ProgramFiles.

**Wiring Service** (`setup-agent.bat [1]`, elevated):

```bat
:: Sau khi kill Agent/schtasks cũ và copy sang %ProgramFiles%\TikTokFlow\ClientAgent\
nssm.exe install TikTokFlowAgent "%PF%\bin\node.exe" "%PF%\agent.js" --daemon
nssm set TikTokFlowAgent AppDirectory "%PF%"
nssm set TikTokFlowAgent AppStdout "%ProgramData%\TikTokFlow\logs\agent-out.log"
nssm set TikTokFlowAgent AppStderr "%ProgramData%\TikTokFlow\logs\agent-err.log"
nssm set TikTokFlowAgent Start SERVICE_DELAYED_AUTO_START
nssm set TikTokFlowAgent AppExit Default Restart
nssm set TikTokFlowAgent AppRestartDelay 5000
:: AppRestartDelay = chờ cố định giữa các lần restart (ms).
:: AppThrottle = ngưỡng "uptime tối thiểu coi là chạy thành công"; chết sớm hơn
:: liên tục → NSSM tăng dần backoff restart — KHÔNG phải "delay 10s mỗi restart".
nssm set TikTokFlowAgent AppThrottle 10000
:: ObjectName: mặc định LocalSystem (NSSM không set). Chấp nhận Track B — xem §5.4d.
```

- **Log:** ghi dưới `%ProgramData%\TikTokFlow\logs\`; document rotate (giữ N file / max size qua script ops) — không để AppStdout phình vô hạn khi restart loop.
- **Cấm** AppDirectory / binary dưới `%LOCALAPPDATA%` khi service chạy LocalSystem.
- **Migration:** `[1]` luôn kill daemon Task Scheduler / process cũ **trước** `nssm start` (tránh tranh `:39741`).

### 5.4d Service account — LocalSystem (chốt rõ)

NSSM **không** set `ObjectName` → Service chạy **LocalSystem** (quyền tối đa).

**Chấp nhận cho Track B GA** với lý do:
- Việc Agent chỉ HTTP loopback + gọi GPM/CDP local; §6.1a đã khung “không insider-proof”.
- LocalSystem đơn giản hóa ACL/install; tránh thêm account + password management trên fleet.

**Không** coi đây là hardening tối ưu: process LocalSystem + binary/secret phải **Admin-write-only** (§6.1b) là bắt buộc. Nếu §5.4c Session 0 fail, ưu tiên fallback **user-interactive / Task Scheduler từ ProgramFiles** (V4) trước khi invent dedicated low-priv service account (ngoài scope PR2 trừ khi V4 bắt buộc).

### 5.4c Session 0 — verify trước khi gọi “accepted”

Loopback TCP (CDP, GPM API `:9495`…) **có thể** hoạt động từ Service Session 0, nhưng **chưa coi là đã chứng minh**.

**Gate trước GA Track B+C:** test trên máy thật (Service installed, user logged on, GPM đang chạy interactive):

| # | Kiểm tra |
|---|----------|
| V1 | `GET :39741/` health từ Extension |
| V2 | Agent gọi GPM local API list profiles thành công từ Service |
| V3 | (Track C) CDP attach profile đang mở từ Service |
| V4 | Nếu fail: document fallback — chạy Agent dưới user account / Task Scheduler onlogon từ ProgramFiles (không LocalSystem) |

Session 0 fail → **chặn** coi Service migration “done”; sửa account Service hoặc fallback path trước GA.

### 5.5 Đóng gói Client Agent zip (giữ pipeline hiện tại)

Download: [src/app/api/client-agent/download/route.ts](file:///c:/Users/datng/tiktok-automation/src/app/api/client-agent/download/route.ts)

1. **Fast path:** `client-agent-base.zip` ở repo root → inject `config.json` → trả zip. Zip **phải** chứa `bin/node.exe` + `bin/nssm.exe` (pack script verify).
2. **Không fallback** zip thư mục `client-agent/` live khi thiếu base zip (hoặc base zip thiếu `bin/nssm.exe` / `bin/node.exe`) → **HTTP 500** rõ (“client-agent-base.zip chưa được pack”). Silent degradation tạo zip “đẹp” nhưng không cài Service được — **cấm**.

**Rebuild `client-agent-base.zip`** trước mỗi release/deploy.

Nội dung base zip mục tiêu:

```text
TikTokFlow-ClientAgent/
  agent.js                 # + resolve-browser (Track C) + attest
  package.json
  node_modules/            # playwright-core
  bin/
    node.exe               # portable Node
    nssm.exe               # win64 NSSM (pinned + checksum lúc pack)
  setup-agent.bat
  stop-agent.bat
  run-agent.bat
  run-agent-silent.vbs     # giữ tạm migrate; Service primary
  config.json              # inject lúc download (+ agentAttestSecret)
  README.md
```

#### [NEW] `scripts/pack-client-agent-base.ps1` (hoặc `.mjs`)

1. Copy payload `client-agent/` (bỏ `config.json`, `.git`, junk).
2. Đảm bảo `bin/node.exe`.
3. Tải **pinned** NSSM win64 → verify SHA256 → `bin/nssm.exe`.
4. Fail script nếu thiếu binaries.
5. Ghi `client-agent-base.zip` ở root.
6. Chạy trước mỗi release/deploy.

**Service binary wiring** — §5.4b: copy ProgramFiles rồi mới `nssm install`.

**Không làm:** Electron; npm trên máy nhân sự; Personal Token/`agentAttestSecret` trong Extension zip; Service từ `%LOCALAPPDATA%` / Downloads.

### 5.6 Docs / UX (tối thiểu)

#### [MODIFY] [client-agent/README.md](file:///c:/Users/datng/tiktok-automation/client-agent/README.md)

- Cài một lần = Windows Service; Agent Online cần cho session-bind GPM; `@handle` chỉ fallback; NSSM có thể bị AV quarantine.

#### [MODIFY] docs / extensions copy đang nhắc `setup-agent.bat`

- Đổi wording: phím 1 = cài Service; banner Agent Online / unsupported.

### 5.7 Checklist tin cậy

| # | Rule |
|---|------|
| 1 | Match theo session hash + **server verify HMAC resolve** |
| 2 | “Đang mở” = GPM API primary; SingletonLock secondary |
| 3 | Đúng một match hoặc không gắn |
| 4 | Per-profile 3s + overall 15s timeout |
| 5 | Agent Service + restart **có throttle** |
| 6 | Fallback `@handle` khi offline / `agent_unsupported` / match fail |
| 7 | Cache invalidate khi username đổi (multi-account cùng profile) — cố ý |
| 8 | Download hard-fail nếu thiếu `client-agent-base.zip` đầy đủ bin |

### 5.8 Ngoài phạm vi phần này

- Đọc omnibox `GPM | Profile 3359` từ MV3.
- Đổi contract report ngoài việc thêm verify attest resolve.
- Multi-machine Agent (vẫn 1 Agent / PC).

### 5.9 Todo triển khai

| ID | Track | Việc |
|----|-------|------|
| nssm-service / service-acl / nssm-throttle / nssm-av-ops | **B** | Service ProgramFiles + ACL + AppRestartDelay/AppThrottle + kill old + AV runbook + Session 0 verify |
| pack-base-zip / download-hard-fail | **B** | pack script pin NSSM; download **500** nếu thiếu base zip |
| docs-copy | **B** | README + AV heads-up |
| agent-resolve-api / resolve-auth / cdp-timeouts / open-signal | **C** | resolve + HMAC + GPM running primary + timeouts |
| ext-session-bind / agent-unsupported | **C** | Extension challenge + fallback 404/shape |

### 5.10 Test bổ sung

| # | Test Case | Kết quả mong đợi |
|---|-----------|------------------|
| S1 | 2+ GPM browser mở, mỗi cái 1 TikTok khác nhau | Mỗi Extension report đúng `gpmProfileId` + server accept sig |
| S2 | Profile GPM stopped (kể cả stale SingletonLock) | Không `start`/CDP nhầm |
| S3 | Agent offline | Fallback label; không crash |
| S3b | Agent cũ (404 / thiếu sig) | `agent_unsupported` → label fallback; **không** `gpm_offline` |
| S4 | Hai profile cùng session | `ambiguous` → không gắn |
| S5 | `setup-agent.bat` [1] khi schtasks Agent cũ còn chạy | Kill cũ trước; Service Running; không tranh `:39741` |
| S6 | Reboot | Delayed Auto-start → Online |
| S7 | Kill Agent process | Restart sau delay; **không** spin CPU vô hạn nếu port bind fail (throttle) |
| S8 | `[3]` đổi token / secret | config + restart; pair OK |
| S9 | Session 0: Service + GPM interactive | V1–V3 §5.4c pass hoặc fallback account documented |
| S10 | Thiếu `client-agent-base.zip` trên server | Download **500**, không zip live-folder |
| S11 | Đổi @username trong cùng GPM profile | Cache invalidate; resolve lại |
| S12 | Fake `:39741` resolve không có secret | Report reject (bad sig) |
| S13 | Một Chromium hang khi CDP | Skip profile ≤3s; overall ≤15s; request khác không treo vô hạn |

---

## 6. Rủi Ro Kỹ Thuật & Biện Pháp Bắt Buộc (Review trước triển khai)

> Phần này **bắt buộc** đưa vào scope Machine ID Binding + Agent localhost API trước khi code. Không triển khai “tin tuyệt đối payload do client tự khai”.

### 6.1 Bảo mật — Agent attestation (chống giả cổng 39741)

**Rủi ro:** Extension lấy `machineId` qua `http://127.0.0.1:39741` rồi gửi lên server. Process bất kỳ có thể bind `:39741` khi Agent chưa chạy và trả `machineId` tùy ý → né ràng buộc / mạo danh máy khác.

**Biện pháp đã chọn:**

1. **Per-user `agentAttestSecret`** (random 32 bytes):
   - Sinh khi tạo pairing zip / cấp lại credentials.
   - Nhúng **plaintext chỉ** vào `config.json` của **Client Agent** (install root / Agent zip). **Không bao giờ** nhúng vào Extension zip.
   - Server lưu **`agentAttestSecretSealed`**: AES-256-GCM qua **cùng** `getPersonalTokenCryptoKey()` (= `EXTENSION_SESSION_SECRET`, format `e1.…` như `sealPersonalToken`). Decrypt khi verify HMAC. **Không** one-way hash; **không** env key riêng.
2. **Nonce challenge Agent ↔ Extension:**
   - Extension sinh `nonce` (16+ bytes), gọi `POST /attest` (hoặc mở rộng probe) với `{ nonce }`.
   - Agent trả `{ machineId, machineName, osUsername, ts, nonce, sig }` với  
     `sig = HMAC-SHA256(agentAttestSecret, canonicalPayload)` — **§6.1e** (gồm machineId + machineName + osUsername + nonce + ts).
   - Extension **từ chối** nếu `nonce` không khớp echo. Cửa sổ thời gian theo **§6.1d** (server `challengeTs`, không phụ thuộc đồng hồ Agent thuần).
3. **Server verify (không tin Extension):**
   - Pair / session exchange body thêm `machineId`, `nonce`, `ts`, `sig` (và optional `machineName` / `osUsername`).
   - `checkAndBindMachine` chỉ chấp nhận nếu HMAC khớp secret của user (so sánh bằng **`crypto.timingSafeEqual`**, không dùng `===`) + nonce chưa dùng (xem §6.1b replay store) + ts trong cửa sổ.
   - GET `/` status probe **không** trả `sig` dùng để bind; chỉ health. Attest bắt buộc qua endpoint có chữ ký.
4. **`/resolve-browser` (session GPM):** Track C tách — **ship-blocker:** HMAC resolve (§5.3.1) + CORS; không implement trong PR Machine ID Binding (A).

### 6.1d Clock skew & challenge timestamp

**Rủi ro:** Cửa sổ dựa đồng hồ máy nhân viên (NTP lệch / sai múi giờ) → false-reject hàng loạt.

**Đã chọn (một contract duy nhất — không 2 phương án):**

1. **`GET /api/extension/challenge`** → `{ challengeTs: Date.now() }` (Unix ms, server clock). Rate limit **`challenge:ip` = 600/60s** (§6.1f — NAT văn phòng).  
2. Extension **và** Agent gọi endpoint này **trước** khi ký attest.  
3. Gửi `{ nonce, challengeTs }` vào Agent `POST /attest` (Extension) hoặc vào `signAttest()` in-process (Agent).  
4. Agent **ký với `ts = challengeTs`** (không lấy wall-clock Agent làm nguồn chân lý).  
5. Server verify: `ts` trong ±**120s** so với server now; thiếu `ts` trên production → 403.  
6. Dev-only fallback Agent `Date.now()` — **không** dùng GA.

**Không** dùng `Date` response header của pair/session hay endpoint khác — tránh hai phía hiểu khác nhau.
### 6.1e Canonical HMAC payload (audit integrity)

```
canonical = [
  machineId,
  machineName || "",
  osUsername || "",
  nonce,
  String(ts),
].join("\n")

sig = HMAC-SHA256(agentAttestSecret, canonical)  // hex lowercase
```

- **Bắt buộc** đưa `machineName` + `osUsername` vào HMAC — audit / `MachineBindingLog` / cột Thiết Bị không bị sửa giữa đường mà vẫn pass sig.
- Verify bằng `crypto.timingSafeEqual` trên Buffer cùng length.

### 6.1f Rate-limit attest / pair (Track A) — spec cụ thể (không TODO)

Dùng `checkRateLimit(key, limit, windowMs = 60_000)` hiện có trong [`extension-auth.ts`](src/lib/extension-auth.ts).

**Store (chấp nhận có ý thức — không quên):** `checkRateLimit` = **`Map` in-memory theo process** (cùng cơ chế `pair:ip` / `session:ip` **đã ship**). **Không** shared Redis/DB trong PR1.

- Replay cứng = **`ExtensionAttestNonce` DB** (§6.1c) — RL **không** thay thế nonce.
- **Xác nhận trước merge:** nếu production **single Node process** (1 VM/`next start` không cluster) → soft RL chấp nhận được, cùng mức hiện tại. Nếu đã **multi-instance / load balancer / serverless nhiều isolate** → `attestfail` gần như vô hiệu khi rải request — **không** giả vờ đã chặn dò sig cross-instance.
- **Backlog bắt buộc (không optional):** todo `rl-shared-store` trong §6.9 — migrate attestfail (+ ideally toàn bộ `checkRateLimit`) sang Redis hoặc DB khi scale >1 instance. PR1 vẫn ship in-memory; **không** xóa todo này khi đóng PR.

| Bucket key | Limit / window | Khi nào bump | Response khi vượt |
|------------|----------------|--------------|-------------------|
| `pair:attestfail:ip:${ip}` | **20 / 60s** | HMAC fail (`bad_sig`) trên `/pair` | **429** + `Retry-After: retryAfterSec` |
| `pair:attestfail:user:${userId}` | **10 / 60s** | HMAC fail trên `/pair` | **429** |
| `session:attestfail:ip:${ip}` | **20 / 60s** | HMAC fail trên session exchange | **429** |
| `session:attestfail:user:${userId}` | **10 / 60s** | HMAC fail trên exchange | **429** |
| `challenge:ip:${ip}` | **600 / 60s** | mỗi `GET /challenge` | **429** (nới từ 120 — NAT văn phòng / rollout đầu giờ) |

- Missing attest / ts window: **không** đếm `attestfail`.
- `Retry-After`: lấy **`machineCheck.retryAfterSec`** / `lim.retryAfterSec` — **không** hard-code `"60"`.
- Helper tự bump + trả `403`/`429`; caller forward status.
- Agent `POST /attest` localhost: cap in-process ~30/phút.
- **`getClientIp` (tin cậy ngầm):** hiện đọc `X-Forwarded-For` (first hop) / `X-Real-Ip` **không** lọc trusted proxy ([`extension-auth.ts`](src/lib/extension-auth.ts)). Client spoof header → bucket theo IP giả → RL theo IP yếu. **Gap pre-existing** (mọi `pair:ip` / `session:ip` hiện có cùng vấn đề) — không block PR1; polish lúc code hoặc backlog `getClientIp-trusted-proxy` khi harden RL (`rl-shared-store`). Phòng thủ chính chống dò sig vẫn là HMAC + nonce DB.

### 6.1g Migration fleet Agent cũ → Service ProgramFiles

Khi `setup-agent.bat [1]`:
1. Detect process `agent.js` / chiếm `:39741` / task `TikTokFlow_Agent_*` → **stop + kill trước**.
2. Xóa schtasks cũ **trước** khi bind Service mới.
3. Copy payload → `%ProgramFiles%\TikTokFlow\ClientAgent\` + ACL.
4. Install/start Service; verify `GET :39741/` health.
5. **Rotate secret:** server **không** push xuống Agent. Download **mặc định reuse** secret (máy wipe khôi phục được). Rotate **chỉ** admin rotate / `?rotateAttest=1`. Sau rotate: thay config + **restart** ([3] chỉ restart/ghi token — **không** tự rotate). Xem bảng vòng đời Tầng 4. M10 = restart-required **sau rotate**, không phải sau mọi download.

**Test M13:** máy đang chạy schtasks Agent cũ → setup [1] → chỉ còn 1 Service, không tranh cổng; pair OK.

### 6.1a Kỳ vọng attestation với stakeholder (nói rõ)

| Mức | Chặn được? | Không chặn được? |
|-----|------------|------------------|
| Attest HMAC + secret trong zip | Script tay ngang, fake process `:39741` **không** có secret | Nhân viên **cố ý** đọc `config.json` / thay binary rồi tự ký |
| + Service ACL cứng (§6.1b / §5.4 sửa) | User thường khó đọc/ghi secret & binary | Admin local / malware SYSTEM / attacker đã có quyền cao |

**Thông điệp cho stakeholder:** Machine ID Binding + attest là **rào chống gian lận vận hành thường** và giả lập Agent, **không** phải DRM chống insider kỹ thuật cao. Nếu yêu cầu chống nhân viên cố tình lách: bắt buộc cài Agent vào thư mục **Admin-write-only**, secret không nằm chỗ user-writable, Service chạy dưới account phù hợp.

### 6.1b Cứng hóa secret & đường cài (bắt buộc trước production)

1. **Install root (Service binaries):**  
   `%ProgramFiles%\TikTokFlow\ClientAgent\` (ưu tiên) hoặc `%ProgramData%\TikTokFlow\ClientAgent\`.  
   - ACL: Administrators + SYSTEM = Full; Users = Read+Execute **chỉ**.  
   - **Cấm** đặt `node.exe` / `agent.js` / `nssm.exe` / `agentAttestSecret` dưới `%LOCALAPPDATA%` hoặc thư mục giải nén Desktop/Downloads khi Service chạy LocalSystem (lỗ hổng replace-binary → leo quyền SYSTEM).
2. **`setup-agent.bat [1]`:** copy payload từ zip giải nén → Program Files (cần UAC); đăng ký Service trỏ tới path đó; xóa/không dùng path user-writable cho AppDirectory.
3. **Secret file:** `config.json` (hoặc `attest.secret`) chỉ trong install root với ACL trên; log/cache fingerprint có thể ở `%ProgramData%\TikTokFlow\` (không executable).
4. **Logs Service:** `%ProgramData%\TikTokFlow\logs\` (không `%LOCALAPPDATA%` cho binary).

### 6.1c Replay-guard nonce — store chia sẻ (multi-instance)

**Cấm** `Map` in-memory trên process Node nếu server có >1 instance / load balancer.

**Đã chọn:** bảng (hoặc Redis nếu đã có sẵn infra) với TTL:

```prisma
model ExtensionAttestNonce {
  nonce     String   @id
  userId    String   @map("user_id")
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([expiresAt])
  @@map("extension_attest_nonces")
}
```

- Insert nonce trong transaction khi verify thành công; trùng PK → reject replay.  
- **TTL 2 phút.** Cleanup **bắt buộc**: cron `GET|POST /api/cron/extension-attest-nonce-purge` chạy **mỗi 5 phút** xóa `WHERE expiresAt < now()`.  
- **Auth cron:** giống `extension-auth-purge` — yêu cầu `Authorization: Bearer ${CRON_SECRET}` (hoặc admin session). **Không** public không secret.  
- Mặc định = **DB** (`ExtensionAttestNonce`).

**Giới hạn chấp nhận (cũ — giữ + bổ sung):** Attacker đọc được secret trên disk vẫn giả Agent được nếu ACL lỏng. Mục tiêu tầng attest cơ bản = chặn spoof không có secret; tầng ACL/ProgramFiles = nâng chi phí insider.

#### Todo bảo mật

| ID | Việc |
|----|------|
| attest-secret | Cấp `agentAttestSecret` trong zip + lưu server; Agent ký attest |
| attest-nonce | Extension nonce + verify echo; server replay guard (DB) |
| attest-api | `checkAndBindMachine` verify HMAC **timingSafeEqual** + payload §6.1e |
| attest-nonce-store | `ExtensionAttestNonce` TTL + **cron purge mỗi 5 phút** |
| attest-challenge-ts | **`GET /api/extension/challenge`** → `{ challengeTs }` (§6.1d) |
| attest-rate-limit | RL riêng pair/exchange khi HMAC fail (§6.1f) |
| refresh-display-fields | Update boundMachineName/OsUser/At khi machineId khớp |
| migrate-old-agent | setup [1] kill schtasks/process cũ trước khi cài Service (§6.1g) |
| service-acl-path | Cài Service vào ProgramFiles/ProgramData; ACL Admin-write-only |
| resolve-auth | Track **C** ship-blocker: HMAC trên `/resolve-browser` + verify lúc report (§5.3.1) |

---

### 6.2 Race bind lần đầu (2 user / 1 máy)

**Rủi ro:** Hai request pair gần như đồng thời trên cùng `machineId` → unique constraint DB có thể ném lỗi 500.

**Biện pháp:**

- Giữ `@unique` trên `boundMachineId`.
- Trong `checkAndBindMachine`: dùng transaction + `updateMany`/`create` có điều kiện; bắt `P2002` (unique violation) → trả **403** với message rõ (“Máy này vừa được liên kết với tài khoản khác”), **không** 500.
- Log auth event `machine_bind_race` / `machine_taken`.

---

### 6.3 Ổn định Machine ID (Ghost / VM / đổi máy)

**Rủi ro:**

- Ghost/Clonezilla không sysprep → trùng `MachineGuid` giữa nhiều máy → false “thiết bị bị chiếm”.
- VM/VDI clone → trùng Motherboard UUID.
- Đổi mainboard: UUID đổi, MachineGuid giữ → hệ thống coi máy mới (đúng theo hash hiện tại) nhưng cần quy trình hợp lệ, không chỉ admin unlink thủ công.

**Biện pháp:**

1. **Fingerprint cache local (Agent):**  
   - Ghi `%ProgramData%\TikTokFlow\machine-fp.cache` (nội dung fingerprint + ngày).  
   - TTL mặc định **24h**; không gọi `Get-CimInstance` mỗi probe.  
   - Force refresh khi cache thiếu / hết hạn / flag `--refresh-fp`.
   - Thống nhất với §6.1b (không dùng `%LOCALAPPDATA%` cho cache fingerprint).
2. **Self-heal / điều tra trùng:**  
   - Khi bind bị từ chối vì `machineId` đã thuộc user khác → response 403 kèm `conflictUserHint` (masked email/username) + ghi `MachineBindingLog`.  
   - Admin UI: xem log conflict; action **force-reset** (unlink) có confirm + lý do bắt buộc.
3. **User tự xin đổi máy (giảm support) — chi tiết Tầng 1 / 5 / 6b:**  
   - Schema `MachineChangeRequest` trong **Tầng 1** (không chỉ mô tả ở đây).  
   - Mutations: `requestMachineChange` (user), `reviewMachineChangeRequest` + `listPending…` (admin) — **Tầng 5**.  
   - UI: Settings user + panel admin — **Tầng 6 / 6b**.  
   - Duyệt → unlink + kill sessions + `CHANGE_APPROVED` log (`actorUserId`); từ chối → `CHANGE_DENIED`.  
   - **Không** cho user tự unlink không duyệt.

---

### 6.4 UX / vận hành

| Vấn đề | Biện pháp |
|--------|-----------|
| Agent chưa chạy → user bấm đi bấm lại | Extension: poll `probeClientAgent` / attest mỗi 3–5s trong ~60s khi pair/redeem fail vì agent offline; hiện countdown “Đang chờ Client Agent…” |
| Phải nhớ mở `.bat` mỗi ngày | **§5.4 / §6.1b** — Windows Service vào **ProgramFiles** + ACL; Delayed Auto-start; `setup-agent.bat` chỉ cài **một lần** (không chạy Service từ LOCALAPPDATA) |
| PowerShell UUID chậm | Cache fingerprint §6.3 — không gọi CIM mỗi probe |

---

### 6.5 Audit — `MachineBindingLog`

Chỉ overwrite field trên `User` → mất lịch sử tranh chấp.

**Schema nguồn chân lý:** Tầng 1 (cùng `MachineChangeRequest`). Không copy lệch `actorUserId`.

Ghi log mọi: bind thành công, reject (occupied / bad sig / missing agent), **admin unlink** (`UNLINK` + `actorUserId`), force-reset, user `CHANGE_REQUESTED`, admin `CHANGE_APPROVED` / `CHANGE_DENIED`. Helper **phải** nhận `actorUserId` (không chỉ `actorName`).

---

### 6.6 Cập nhật `checkAndBindMachine` (tóm tắt thứ tự)

Thứ tự **bắt buộc** (khớp snippet Tầng 4 — nguồn chân lý):

1. Thiếu `machineId` / `sig` / `nonce` / `ts` → 403 agent/attest required.  
2. `challengeTs` ngoài ±120s → 403.  
3. Load user → **decrypt** `agentAttestSecretSealed` (AES-GCM) → HMAC §6.1e → **`timingSafeEqual`** → fail → 403 + rate-limit.  
4. Insert `ExtensionAttestNonce` (PK = nonce); P2002 → 403 replay.  
5. Chỉ sau bước 1–4: bind mới / occupied / mismatch / refresh display fields (như logic hiện có).  
6. **Log:** mọi nhánh **reject / bind mới / unlink-equivalent** ghi `MachineBindingLog`. Nhánh **refresh display-only** (cùng `machineId`, chỉ cập nhật name/osUser/At) **không** log — tránh spam audit mỗi lần pair/exchange hàng ngày (chủ đích, khớp snippet Tầng 4).

---

### 6.7 Kiểm thử bổ sung (bắt buộc)

| # | Test Case | Kết quả mong đợi |
|---|-----------|------------------|
| M1 | 2 nhân viên active cùng 1 máy (pair gần như đồng thời) | Người 1 OK; người 2 **403** rõ; không 500; có log race/occupied |
| M2 | Đổi RAM/mainboard thật (GUID giữ, UUID đổi) | `machineId` đổi → coi máy mới; cần unlink hoặc change-request được duyệt rồi pair lại |
| M3 | N lần probe liên tiếp | Không spam `Get-CimInstance` (đọc cache); máy yếu không treo |
| M4 | Fake server `:39741` trả `machineId` tùy ý **không** có `agentAttestSecret` | Extension/server **từ chối** (sai/ thiếu chữ ký) |
| M5 | Replay cùng `nonce+sig` lần 2 | Server reject |
| M6 | User gửi yêu cầu đổi máy → admin duyệt | Unlink + audit; pair máy mới OK |
| M7 | Ghost image trùng MachineGuid hai máy vật lý | Conflict 403 + log; admin force-reset có lý do |
| M8 | Fake `:39741` **có** đọc được secret nếu config nằm user-writable | Document: fail expectation nếu ACL lỏng; với ProgramFiles ACL → user thường **không** đọc được secret |
| M9 | Defender mặc định (+ 1 EDR) trên zip có `nssm.exe` | Không quarantine im lặng; hoặc có runbook whitelist |
| M10 | Admin **rotate** attest secret; Agent Service còn secret cũ | 403 bad_sig đến khi zip/config mới + restart; **re-download mặc định không rotate** (không gây M10) |
| M10b | Máy wipe; secret mất trên disk; user tải zip mặc định (reuse) + [1] sau unlink | Pair OK với secret cũ; không cần admin rotate |
| M11 | `setup-agent.bat` [2] khi service hang / file lock | Gỡ service sạch, không orphan `TikTokFlowAgent` |
| M12 | User thường thử ghi đè `node.exe`/`agent.js` trong ProgramFiles | Access denied; Service không load binary user thay |
| M13 | Upgrade từ schtasks Agent cũ → Service ProgramFiles | Kill cũ trước; không tranh `:39741`; pair OK |
| M14 | Đồng hồ Agent lệch >2 phút nhưng `challengeTs` server đúng | Attest vẫn pass (§6.1d) |
| M15 | Cron nonce purge mỗi 5 phút | Hàng `expiresAt < now()` bị xóa |
| M16 | Đổi hostname Windows, pair lại cùng machineId | `boundMachineName` cập nhật trên UI admin |

---

### 6.8 Câu hỏi mở — cập nhật sau review

| ID | Quyết định mặc định trong kế hoạch (có thể đổi trước khi code) |
|----|------------------------------------------------------------------|
| Q1 | `machineId` + attest **bắt buộc** khi pair/exchange |
| Q2 | Đổi máy hợp lệ: **user request + admin duyệt** (không chỉ admin unlink); không bắt tải lại ZIP trừ khi revoke token riêng |
| Q3 | Refresh JWT path: vẫn **không** bắt attest mỗi lần (tránh spam); chỉ pair + personalToken exchange |
| Q4 | Secret attest: nhúng **chỉ** Agent zip; download **reuse** mặc định; rotate **chỉ** admin / `?rotateAttest=1` |
| Q5 | Kỳ vọng bảo mật: **chống spoof/script**, không phải chống insider đọc disk — trừ khi bật ACL ProgramFiles (§6.1a–b) |
| Q6 | Session-bind CDP (§5): **PR tách**; **blocked** đến khi wire HMAC resolve (§5.3.1); không block ship Machine ID (A) |
| Q7 | **Ai gọi server:** Extension forward attest; Agent **signAttest in-process** (không HTTP /attest) để giữ `client-sync` — §0 |
| Q8 | **ts:** `GET /api/extension/challenge` → `{ challengeTs }` rồi ký; ±120s — §6.1d |
| Q9 | **Secret at rest:** seal bằng **cùng** key `sealPersonalToken` (`EXTENSION_SESSION_SECRET`) |
| Q10 | **`POST /attest` Origin:** chỉ `chrome-extension://` / `moz-extension://` |
| Q11 | **Secret distribution:** chỉ Agent zip — **không** Extension zip |
| Q12 | **Rotate vs download vs [3]:** rotate ≠ mọi download; [3] = ghi token + restart, **không** rotate secret |
| Q13 | Open profiles: **GPM API running primary**, SingletonLock secondary |
| Q14 | CDP timeouts: **3s/profile**, **15s overall** |
| Q15 | Session 0: **verify on real machine** before GA (§5.4c) — not assumed accepted |
| Q16 | Download: **hard-fail** nếu thiếu `client-agent-base.zip` (+ bin); cấm live-folder fallback |
| Q17 | Agent cũ: 404/bad shape → `agent_unsupported` → label fallback (không `gpm_offline`) |
| Q18 | **Service account:** LocalSystem mặc định **chấp nhận** Track B (§5.4d) |
| Q19 | **AppThrottle:** minimum successful uptime / backoff — không phải flat delay; comment trong `.bat` |
| Q20 | **attestfail RL:** in-memory **chấp nhận có ý thức** (cùng RL hiện có); multi-instance = soft — backlog bắt buộc `rl-shared-store`; `challenge:ip` 600/60s |
| Q21 | Agent self-sign: **tự sinh** `crypto.randomBytes(16).toString("hex")` mỗi lần — không xin nonce server |
| Q22 | Change-request: snapshot `fromMachineName`/`fromOsUsername`; APPROVED re-verify `boundMachineId === fromMachineId` |
| Q23 | Refresh display-only: **không** `MachineBindingLog` (tránh spam) — §6.6 |
| Q24 | `getClientIp` tin XFF không trusted-proxy — gap pre-existing; không block PR1 |
---

### 6.9 Todo tổng hợp thêm (Machine ID hardening)

| ID | Việc |
|----|------|
| attest-secret / attest-nonce / attest-api | §6.1 + **timingSafeEqual** + payload **§6.1e** |
| attest-nonce-store | DB TTL + **cron purge mỗi 5 phút** |
| attest-challenge-ts | **`GET /api/extension/challenge`** → `{ challengeTs }` (§6.1d) |
| attest-rate-limit | §6.1f buckets (attestfail 20/10, challenge **600**); in-memory OK PR1 |
| rl-shared-store | **BACKLOG bắt buộc:** Redis/DB cho `checkRateLimit` khi >1 instance — không xóa khi đóng PR1 |
| attest-secret-lifecycle | Download reuse; admin rotate only; wipe = M10b |
| nssm-av-ops | Code-sign / IT whitelist / AppThrottle / LocalSystem §5.4d / Defender+EDR |
| refresh-display-fields | Update name/osUser/At khi machineId khớp |
| migrate-old-agent | Kill schtasks/process cũ trước Service (§6.1g) |
| service-acl-path | ProgramFiles/ProgramData + ACL Admin-write-only |
| bind-race-403 | Bắt P2002 → 403 + log |
| fp-cache | Cache fingerprint 24h tại **%ProgramData%** |
| MachineBindingLog | Schema + ghi mọi bind/unbind/reject + actorUserId |
| change-request-ui | Tầng 1 schema (+ fromMachineName/OsUser) + mutations + listPending đầy đủ + UI |
| ext-agent-poll | Retry/poll khi Agent offline lúc pair |
| tests-M1-M16 | §6.7 |

---

### 6.10 Code review checklist (HMAC / attest)

- [ ] `checkAndBindMachine` nhận + xử lý `nonce/ts/sig` (không chỉ machineId)
- [ ] Decrypt `agentAttestSecretSealed` bằng **cùng** key personalToken — không bcrypt / không env key mới
- [ ] `crypto.timingSafeEqual` + payload **§6.1e** (gồm name/osUser)
- [ ] Nonce DB + cron **CRON_SECRET** mỗi 5 phút
- [ ] `GET /api/extension/challenge`; ±120s; RL `challenge:ip` **600**/60s; `Retry-After` = `retryAfterSec`
- [ ] `/session` exchange đọc đủ attest fields như `/pair`
- [ ] `bad_sig`: helper bump RL + **429**/`retryAfterSec` vs **403**; caller forward (không hard-code 60)
- [ ] RL store = in-memory **chấp nhận có ý thức**; todo `rl-shared-store` còn trong backlog
- [ ] Agent self-sign: tự `randomBytes(16)` nonce mỗi lần
- [ ] Refresh display-only **không** log (khớp §6.6); reject/bind mới có log
- [ ] Biết gap `getClientIp`/XFF (pre-existing); không block ship
- [ ] Download Agent: **reuse** secret mặc định; rotate chỉ admin; [3] không rotate
- [ ] `POST /attest` CORS chỉ extension; Agent self-sign in-process
- [ ] `agentAttestSecret` **chỉ** Agent zip
- [ ] `writeMachineBindingLog` có **`actorUserId`**; `unlinkUserMachine` **ghi log UNLINK**
- [ ] `MachineChangeRequest` schema + user/admin mutations + Settings/admin UI (Track A)
- [ ] LocalSystem chấp nhận (§5.4d); AppThrottle comment đúng semantics
- [ ] setup [1] kill Agent cũ trước bind :39741
- [ ] Agent pair/session có attest để `client-sync` không gãy

---

## 7. Tách phạm vi triển khai (bắt buộc)

| Track | Nội dung | PR |
|-------|----------|-----|
| **A – Machine ID Binding** | Schema bind + attest + nonce DB + MachineBindingLog (`actorUserId`) + **MachineChangeRequest** (schema/mutations/UI) + unlink audit + fp-cache + Extension poll | PR1 (critical path) |
| **B – Agent Windows Service** | ProgramFiles + ACL, NSSM pin/checksum, AppRestartDelay/AppThrottle (đúng semantics), LocalSystem chấp nhận (§5.4d), kill old daemon, download hard-fail, Session 0 verify gate | PR2 (có thể song song A sau attest design) |
| **C – Session GPM bind** | `/resolve-browser` + **HMAC resolve + report verify**, GPM running primary, CDP timeouts, `agent_unsupported` fallback | **PR3** sau A+B; **không ship** nếu thiếu §5.3.1 |

Không merge C vào A. Windows Service (B) không phụ thuộc CDP session-bind. Track C **blocked** trên attest resolve — không chỉ CORS + JSON.

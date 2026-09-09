# TikTokFlow Companion Extension - Implementation Walkthrough

We have successfully designed, built, and packaged the **TikTokFlow Companion Chrome Extension** (Manifest V3) for GPMLogin, alongside the dedicated server reporting endpoint.

---

## 1. What Was Built

### A. Companion Chrome Extension ([extension/](file:///c:/Users/datng/tiktok-automation/extension/))
* [manifest.json](file:///c:/Users/datng/tiktok-automation/extension/manifest.json): Manifest V3 configuration with permissions for cookies, storage, alarms, and local GPM API access (`localhost:9495`).
* [content.js](file:///c:/Users/datng/tiktok-automation/extension/content.js): Silently extracts active TikTok `@username`, nickname, avatar URL, follower counts, video counts, and verified login state in-memory from `__UNIVERSAL_DATA_FOR_REHYDRATION__` or DOM without making any network requests to TikTok.
* [background.js](file:///c:/Users/datng/tiktok-automation/extension/background.js):
  * Listens for TikTok `sessionid` cookie lifecycle events (instant login / logout detection).
  * Automatically coordinates scheduled GPM fleet sync via `chrome.alarms`.
  * Queries `http://127.0.0.1:9495/api/v3/profiles` in the background and forwards the profile fleet to `POST /api/gpm/client-sync`.
  * Employs a 5-minute cooldown guard so multiple open browser profiles never spam duplicate requests.
  * Manages dynamic extension badges (Green **OK** for logged in, Gray **OFF** for logged out).
* [popup.html](file:///c:/Users/datng/tiktok-automation/extension/popup.html), [popup.css](file:///c:/Users/datng/tiktok-automation/extension/popup.css), [popup.js](file:///c:/Users/datng/tiktok-automation/extension/popup.js):
  * Modern dark-themed popup showing live TikTok account info, follower count, and connection status.
  * Inputs for Member Email / Username and Server URL (persisted in `chrome.storage.local`).
  * Real-time GPMLogin health indicator (`localhost:9495` Online / Offline).
  * 1-Click **"Đồng bộ GPM ngay"** button.

### B. Server API Route
* [src/app/api/extension/report/route.ts](file:///c:/Users/datng/tiktok-automation/src/app/api/extension/report/route.ts):
  * Receives live login reports from the extension (`POST /api/extension/report`).
  * Finds or creates the `TiktokAccount` in PostgreSQL.
  * Sets status to `ACTIVE`, updates live metrics (`totalFollowers`, `totalVideos`), and auto-resolves any open `NOT_LOGGED_IN` alerts.
  * Auto-claims account for the staff member if unassigned.
  * Records verification event in `AccountLog`.

### C. Distribution Package
* [TikTokFlow-Companion-Extension.zip](file:///c:/Users/datng/tiktok-automation/TikTokFlow-Companion-Extension.zip): Pre-packaged 10.7 KB zip archive containing all required files and icons ready for GPMLogin.
* [scripts/package-extension.ps1](file:///c:/Users/datng/tiktok-automation/scripts/package-extension.ps1): Automated script to rebuild the zip package at any time.

---

## 2. How to Install in GPMLogin (1-Click for All Profiles)

1. Open **GPMLogin**.
2. In the left navigation menu, click **Extensions** (Tiện ích mở rộng).
3. Click **Add Extension** (Thêm tiện ích):
   * Select **Load unpacked** and choose folder: `c:\Users\datng\tiktok-automation\extension`  
   *(or select the zip file `TikTokFlow-Companion-Extension.zip`)*.
4. Check the box **"Apply to all profiles"** (Áp dụng cho tất cả profile).
5. **Done!** Every time any GPM profile is opened, the TikTokFlow extension is automatically loaded.

---

## 3. How to Configure & Test

1. Open any GPMLogin profile.
2. Click the **TikTokFlow Companion** puzzle icon in the Chrome toolbar.
3. Enter your **Member Email** or **Username** (e.g., `datnguyen@company.com`) and click **Lưu cấu hình**.
4. Navigate to `https://www.tiktok.com`:
   * The extension badge turns **green (OK)**.
   * Open the extension popup: you will see your `@handle`, avatar, and followers.
   * Your TikTokFlow server dashboard will automatically show the account as **`ACTIVE`** and verified!

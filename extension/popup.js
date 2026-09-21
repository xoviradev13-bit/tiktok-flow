// TikTokFlow Companion - Popup Controller

document.addEventListener("DOMContentLoaded", async () => {
  // Elements
  const statusPill = document.getElementById("statusPill");
  const statusPillText = document.getElementById("statusPillText");
  const memberNameText = document.getElementById("memberNameText");
  const serverUrlText = document.getElementById("serverUrlText");

  const userAvatar = document.getElementById("userAvatar");
  const userHandle = document.getElementById("userHandle");
  const userNickname = document.getElementById("userNickname");

  const gpmIndicator = document.getElementById("gpmIndicator");
  const gpmStatusText = document.getElementById("gpmStatusText");
  const gpmProfileCount = document.getElementById("gpmProfileCount");
  const serverScheduleText = document.getElementById("serverScheduleText");
  const syncNowBtn = document.getElementById("syncNowBtn");
  const syncBtnText = document.getElementById("syncBtnText");
  const lastSyncText = document.getElementById("lastSyncText");
  const fleetSyncBar = document.getElementById("fleetSyncBar");
  const fleetSyncText = document.getElementById("fleetSyncText");
  const agentIndicator = document.getElementById("agentIndicator");
  const agentStatusText = document.getElementById("agentStatusText");
  const agentHintText = document.getElementById("agentHintText");

  const personalTokenInput = document.getElementById("personalTokenInput");
  const testTokenBtn = document.getElementById("testTokenBtn");
  const saveTokenBtn = document.getElementById("saveTokenBtn");
  const tokenSaveMsg = document.getElementById("tokenSaveMsg");
  const authBanner = document.getElementById("authBanner");
  const authBannerText = document.getElementById("authBannerText");
  const identityCard = document.querySelector(".identity-card");

  // FIX: sendMsg now has a timeout. A suspended or hung background SW could
  // otherwise leave the popup waiting forever on every .then() chain.
  function sendMsg(type, payload = {}, timeoutMs = 8000) {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        console.warn(`[TikTokFlow Popup] sendMsg(${type}) timed out after ${timeoutMs}ms`);
        resolve(null);
      }, timeoutMs);

      try {
        chrome.runtime.sendMessage({ type, ...payload }, (res) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(res);
          }
        });
      } catch (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        console.warn(`[TikTokFlow Popup] sendMsg(${type}) threw:`, err?.message || err);
        resolve(null);
      }
    });
  }

  function setSyncBar(barEl, textEl, status, message) {
    if (!barEl || !textEl) return;
    const st = status || "idle";
    barEl.className = `sync-status-bar status-${st}`;
    textEl.textContent = message || (
      st === "syncing" ? "Đang đồng bộ…" :
        st === "ok" ? "Đã đồng bộ" :
          st === "error" ? "Đồng bộ lỗi" :
            "Chưa đồng bộ"
    );
  }

  function renderAccountIdentity(acc) {
    if (!acc) return;
    if (userHandle) userHandle.textContent = acc.username ? `@${acc.username}` : "@chua_phat_hien";
    if (userNickname) userNickname.textContent = acc.nickname || (acc.isLoggedIn ? "Đã xác minh phiên" : "Chưa đăng nhập");
    if (acc.avatarUrl && userAvatar) userAvatar.src = acc.avatarUrl;
    if (!statusPill || !statusPillText) return;
    if (acc.isLoggedIn) {
      statusPill.className = "status-pill status-active";
      statusPillText.textContent = "Đã đăng nhập";
    } else {
      statusPill.className = "status-pill status-idle";
      statusPillText.textContent = "Chưa đăng nhập";
    }
  }

  function setReauthUi(show, reason) {
    if (authBanner) {
      authBanner.style.display = show ? "block" : "none";
    }
    if (show && authBannerText) {
      authBannerText.textContent =
        reason ||
        "Personal Token đã bị thu hồi hoặc vô hiệu hóa. Dán token mới từ trang Cài đặt rồi bấm Lưu.";
    }
    if (personalTokenInput) {
      personalTokenInput.classList.toggle("needs-reauth", !!show);
    }
    if (identityCard) {
      identityCard.classList.toggle("needs-reauth", !!show);
    }
    if (show && statusPill && statusPillText) {
      statusPill.className = "status-pill status-idle";
      statusPillText.textContent = "Cần xác thực";
    }
  }

  function applyGpmStatus(online, port) {
    if (!gpmIndicator || !gpmStatusText) return;
    if (online) {
      gpmIndicator.className = "gpm-indicator online";
      gpmStatusText.textContent = `localhost:${port || "?"} Online`;
    } else {
      gpmIndicator.className = "gpm-indicator offline";
      gpmStatusText.textContent = "GPM Offline";
    }
  }

  function applyAgentStatus(online) {
    if (!agentIndicator || !agentStatusText) return;
    if (online) {
      agentIndicator.className = "gpm-indicator online";
      agentStatusText.textContent = "Online · 1 Agent đang chạy";
      if (agentHintText) {
        agentHintText.textContent =
          "OK — 1 Extension + 1 Agent trên máy này. Số liệu do Agent cập nhật.";
      }
    } else {
      agentIndicator.className = "gpm-indicator offline";
      agentStatusText.textContent = "Offline — chạy run-agent.bat";
      if (agentHintText) {
        agentHintText.textContent =
          "Mỗi máy: 1 Extension + 1 Agent. Bật Agent để đồng bộ số liệu TikTok.";
      }
    }
  }

  function renderScheduleText(summary, intervalMinutes, autoEnabled) {
    if (!serverScheduleText) return;
    if (autoEnabled === false) {
      serverScheduleText.textContent = "Đang tắt";
      serverScheduleText.style.color = "#94a3b8";
    } else if (summary) {
      serverScheduleText.textContent = summary;
      serverScheduleText.style.color = "#38bdf8";
    } else {
      const min = intervalMinutes || 30;
      serverScheduleText.textContent = min >= 60 ? `Mỗi ${min / 60} giờ` : `Mỗi ${min} phút`;
      serverScheduleText.style.color = "#38bdf8";
    }
  }

  function showTokenMsg(text, isSuccess) {
    if (!tokenSaveMsg) return;
    tokenSaveMsg.textContent = text;
    tokenSaveMsg.className = `token-save-msg ${isSuccess ? "success" : "error"}`;
    tokenSaveMsg.style.display = "block";
  }

  // 1. Single upfront batched storage read (all keys across the whole popup)
  // FIX: guard against a corrupt storage profile returning a rejected promise.
  // Previously a rejection aborted the whole handler and left a blank popup.
  let state;
  try {
    state = await chrome.storage.local.get([
      "serverUrl",
      "personalToken",
      "memberName",
      "userEmail",
      "latestAccount",
      "lastFleetSyncTime",
      "gpmProfileCount",
      "tokenRevoked",
      "tokenRevokedReason",
      "tokenRevokedAt",
      "authRequired",
      "fleetSyncStatus",
      "fleetSyncMessage",
      "serverScheduleSummary",
      "serverIntervalMinutes",
      "serverAutoEnabled",
      "agentOnline",
      "gpmApiPort",
      "gpmApiOnline",
      "gpmApiBase",
    ]);
  } catch (err) {
    console.warn("[TikTokFlow Popup] Initial storage read failed:", err?.message || err);
    state = {};
  }

  // Clear stuck banner from the old email-mismatch 403 if applicable
  const staleReason = String(state.tokenRevokedReason || "");
  if (state.tokenRevoked && /không khớp|khong khop/i.test(staleReason) && state.personalToken) {
    await chrome.storage.local.set({
      tokenRevoked: false,
      tokenRevokedReason: "",
      tokenRevokedAt: null,
      authRequired: false,
    });
    state.tokenRevoked = false;
    state.tokenRevokedReason = "";
    state.authRequired = false;
  }

  // 2. Only fetch config.json if configuration is missing or needs pairing
  const needsConfigSeed = !state.personalToken || state.tokenRevoked || state.authRequired || !state.memberName;
  if (needsConfigSeed) {
    try {
      const resp = await fetch(chrome.runtime.getURL("config.json"));
      if (resp.ok) {
        const fileCfg = await resp.json();
        const freshPairing =
          typeof fileCfg.pairingCode === "string" &&
          fileCfg.pairingCode.startsWith("ttf_pair_");

        if (freshPairing && (state.tokenRevoked || !state.personalToken)) {
          // Re-check storage to avoid wiping a token that another path just redeemed.
          const latest = await chrome.storage.local.get([
            "personalToken",
            "tokenRevoked",
            "pairingCode",
          ]);
          if (latest.personalToken && !latest.tokenRevoked) {
            state.personalToken = latest.personalToken;
            state.tokenRevoked = false;
          } else {
            const updates = {
              serverUrl: fileCfg.serverUrl || state.serverUrl,
              memberName: fileCfg.memberName || state.memberName,
              userEmail: fileCfg.userEmail || state.userEmail,
              pairingCode: fileCfg.pairingCode,
              tokenRevoked: false,
              tokenRevokedReason: "",
              tokenRevokedAt: null,
              authRequired: false,
            };
            await chrome.storage.local.set(updates);
            Object.assign(state, updates);
            void sendMsg("FORCE_PAIR_REDEEM");
          }
        } else if (!state.tokenRevoked && (!state.memberName || !state.personalToken)) {
          const updates = {
            serverUrl: fileCfg.serverUrl || state.serverUrl,
            memberName: fileCfg.memberName || state.memberName,
            userEmail: fileCfg.userEmail || state.userEmail,
          };
          await chrome.storage.local.set(updates);
          Object.assign(state, updates);
        }
      }
    } catch (err) {
      console.warn("[TikTokFlow Popup] Optional config.json load bypassed:", err?.message || err);
    }
  }

  // 3. Immediate synchronous paint from batched storage cache (no spinner lag / no flicker)
  // FIX: guard every direct textContent write — a UI refactor that removes any
  // of these elements should not abort the popup.
  if (memberNameText) memberNameText.textContent = state.memberName || state.userEmail || "Nhân sự hệ thống";
  if (serverUrlText) serverUrlText.textContent = state.serverUrl || "http://localhost:3000";

  if (state.personalToken && personalTokenInput) {
    personalTokenInput.value = state.personalToken;
  }

  if (state.tokenRevoked || state.authRequired) {
    setReauthUi(true, state.tokenRevokedReason);
    if (personalTokenInput) {
      personalTokenInput.value = "";
      personalTokenInput.focus();
    }
  }

  if (state.latestAccount) {
    renderAccountIdentity(state.latestAccount);
  }

  setSyncBar(fleetSyncBar, fleetSyncText, state.fleetSyncStatus, state.fleetSyncMessage);

  if (state.gpmProfileCount && gpmProfileCount) {
    gpmProfileCount.textContent = `${state.gpmProfileCount} profiles`;
  }

  if (state.lastFleetSyncTime && lastSyncText) {
    const d = new Date(state.lastFleetSyncTime);
    lastSyncText.textContent = `Đồng bộ lần cuối: ${d.toLocaleTimeString("vi-VN")}`;
  }

  renderScheduleText(state.serverScheduleSummary, state.serverIntervalMinutes, state.serverAutoEnabled);

  // Paint cached GPM & Agent statuses immediately
  if (state.gpmApiOnline && (state.gpmApiPort || state.gpmApiBase)) {
    const port = state.gpmApiPort || String(state.gpmApiBase || "").match(/:(\d+)/)?.[1];
    applyGpmStatus(true, port);
  } else if (state.gpmApiOnline === false) {
    applyGpmStatus(false);
  }

  if (state.agentOnline === true || state.agentOnline === false) {
    applyAgentStatus(!!state.agentOnline);
  }

  // 4. Token Management & Security Validation Handlers
  async function verifyTokenOnline(tokenToVerify) {
    if (!tokenToVerify) {
      return { ok: false, error: "Vui lòng nhập mã Token.", authRequired: true };
    }
    if (!tokenToVerify.startsWith("ttf_sec_")) {
      return {
        ok: false,
        error: "Định dạng sai! Token hợp lệ phải bắt đầu bằng 'ttf_sec_'.",
      };
    }
    if (tokenToVerify.length < 24) {
      return { ok: false, error: "Mã Token quá ngắn hoặc thiếu ký tự." };
    }

    const currentServer = (state.serverUrl || "http://localhost:3000").replace(/\/+$/, "");
    try {
      const resp = await fetch(`${currentServer}/api/extension/verify-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenToVerify}`,
        },
        body: JSON.stringify({ token: tokenToVerify }),
      });
      const resData = await resp.json().catch(() => ({}));
      if (resp.ok && resData.valid) {
        return { ok: true, user: resData.user };
      }
      const revoked = resp.status === 401 || resp.status === 403;
      return {
        ok: false,
        authRequired: revoked,
        error:
          resData.error ||
          (revoked
            ? "Mã Token không tồn tại hoặc đã bị thu hồi!"
            : "Mã Token không hợp lệ!"),
      };
    } catch (err) {
      return {
        ok: false,
        error: "Không thể kết nối đến máy chủ để xác thực.",
      };
    }
  }

  testTokenBtn?.addEventListener("click", async () => {
    const candidate = (personalTokenInput?.value || "").trim();
    testTokenBtn.disabled = true;
    testTokenBtn.textContent = "...";
    const result = await verifyTokenOnline(candidate);
    testTokenBtn.disabled = false;
    testTokenBtn.textContent = "Kiểm tra";

    if (result.ok) {
      showTokenMsg(`✓ Token hợp lệ! Nhân sự: ${result.user?.name || result.user?.email}`, true);
    } else {
      showTokenMsg(`✕ ${result.error}`, false);
      if (result.authRequired) setReauthUi(true, result.error);
    }
  });

  saveTokenBtn?.addEventListener("click", async () => {
    const candidate = (personalTokenInput?.value || "").trim();
    saveTokenBtn.disabled = true;
    saveTokenBtn.textContent = "...";
    const result = await verifyTokenOnline(candidate);
    saveTokenBtn.disabled = false;
    saveTokenBtn.textContent = "Lưu";

    if (!result.ok) {
      showTokenMsg(`✕ Không thể lưu: ${result.error}`, false);
      if (result.authRequired) setReauthUi(true, result.error);
      return;
    }

    const updates = {
      personalToken: candidate,
      memberName: result.user?.name || state.memberName,
      userEmail: result.user?.email || state.userEmail,
      tokenRevoked: false,
      tokenRevokedReason: "",
      tokenRevokedAt: null,
      authRequired: false,
      accessToken: "",
      accessExpiresAt: 0,
      refreshToken: "",
    };

    await chrome.storage.local.set(updates);
    Object.assign(state, updates);

    void sendMsg("CLEAR_TOKEN_REVOKED", {
      updates: {
        personalToken: candidate,
        memberName: updates.memberName,
        userEmail: updates.userEmail,
      },
    });

    if (result.user?.name && memberNameText) {
      memberNameText.textContent = result.user.name;
    }
    setReauthUi(false);
    showTokenMsg(`✓ Đã lưu token thành công cho: ${result.user?.name || "Nhân sự"}`, true);
    setTimeout(() => {
      if (tokenSaveMsg) tokenSaveMsg.style.display = "none";
    }, 4000);
  });

  // 5. Live updates listener — keeps mutable `state` fresh to prevent stale closure bugs
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const key of Object.keys(changes)) {
      state[key] = changes[key].newValue;
    }

    if (changes.tokenRevoked?.newValue === true || changes.authRequired?.newValue === true) {
      setReauthUi(true, state.tokenRevokedReason);
      if (personalTokenInput) personalTokenInput.value = "";
    }
    if (changes.fleetSyncStatus || changes.fleetSyncMessage) {
      setSyncBar(
        fleetSyncBar,
        fleetSyncText,
        state.fleetSyncStatus,
        state.fleetSyncMessage
      );
    }
    if (changes.latestAccount?.newValue) {
      renderAccountIdentity(changes.latestAccount.newValue);
    }
    if (changes.gpmApiPort || changes.gpmApiOnline) {
      applyGpmStatus(!!state.gpmApiOnline, state.gpmApiPort);
    }
    if (changes.agentOnline) {
      applyAgentStatus(!!state.agentOnline);
    }
    if (changes.serverScheduleSummary || changes.serverIntervalMinutes || changes.serverAutoEnabled) {
      renderScheduleText(state.serverScheduleSummary, state.serverIntervalMinutes, state.serverAutoEnabled);
    }
  });

  // 6. Background probes & refresh (run concurrently without blocking initial UI paint)
  void sendMsg("REQUEST_IDENTITY_SCAN");

  sendMsg("REFRESH_SCHEDULE").then((res) => {
    if (res) {
      renderScheduleText(res.serverScheduleSummary, res.serverIntervalMinutes, res.serverAutoEnabled);
    }
  });

  sendMsg("PROBE_GPM").then((res) => {
    if (res) {
      applyGpmStatus(!!res.online, res.port);
    } else {
      applyGpmStatus(false);
    }
  });

  sendMsg("PROBE_AGENT").then((res) => {
    if (res) {
      applyAgentStatus(!!res.online);
    } else {
      applyAgentStatus(false);
    }
  });

  // 7. Trigger Manual Sync Action
  // FIX: optional chaining — a UI refactor that renames/removes the button
  // should not throw and abort the whole handler.
  syncNowBtn?.addEventListener("click", () => {
    syncNowBtn.disabled = true;
    syncNowBtn.classList.add("spinning");
    if (syncBtnText) syncBtnText.textContent = "Đang quét GPM...";
    setSyncBar(fleetSyncBar, fleetSyncText, "syncing", "Đang quét GPMLogin…");

    // FIX: manual sync can legitimately take longer than the default 8s
    // (full GPM fleet fetch on a slow machine). Give it 30s.
    sendMsg("TRIGGER_MANUAL_SYNC", {}, 30000).then((response) => {
      syncNowBtn.disabled = false;
      syncNowBtn.classList.remove("spinning");
      if (syncBtnText) syncBtnText.textContent = "Đồng bộ GPM ngay";

      if (!response) {
        setSyncBar(fleetSyncBar, fleetSyncText, "error", "Lỗi kết nối background");
        alert("Lỗi kết nối đến background service worker.");
        return;
      }

      if (response.success) {
        if (gpmProfileCount) gpmProfileCount.textContent = `${response.count} profiles`;
        const now = new Date();
        if (lastSyncText) lastSyncText.textContent = `Đồng bộ lần cuối: ${now.toLocaleTimeString("vi-VN")}`;
        setSyncBar(fleetSyncBar, fleetSyncText, "ok", `Đã đồng bộ ${response.count} profiles lên server.`);
        sendMsg("PROBE_GPM").then((res) => applyGpmStatus(!!res?.online, res?.port));
      } else if (response.authRequired) {
        setReauthUi(true, response.error);
        setSyncBar(fleetSyncBar, fleetSyncText, "error", response.error || "Cần xác thực lại");
        if (personalTokenInput) {
          personalTokenInput.value = "";
          personalTokenInput.focus();
        }
        alert(
          response.error ||
          "Token đã bị thu hồi. Vui lòng nhập Personal Token mới từ trang Cài đặt."
        );
      } else if (response.skipped) {
        const reason = response.reason || "unknown";
        if (reason === "GPMLogin offline") {
          setSyncBar(fleetSyncBar, fleetSyncText, "error", "GPMLogin offline");
          alert("Không thể kết nối đến GPMLogin. Hãy chắc chắn GPMLogin đang mở (extension tự dò cổng 9495/19995/19996…).");
        } else {
          setSyncBar(fleetSyncBar, fleetSyncText, "idle", `Bỏ qua: ${reason}`);
          alert(`Bỏ qua: ${reason}`);
        }
      } else {
        setSyncBar(fleetSyncBar, fleetSyncText, "error", response?.error || "Đồng bộ thất bại");
        alert(
          response?.error ||
          "Đồng bộ thất bại. Kiểm tra Personal Token và máy chủ TikTokFlow."
        );
      }
    });
  });
});
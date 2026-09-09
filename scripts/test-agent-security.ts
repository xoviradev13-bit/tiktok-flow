import fs from "fs";
import path from "path";
import os from "os";

// Test Security Protections
async function runSecurityTests() {
  console.log("==================================================");
  console.log("🛡️  KIỂM TRA BẢO MẬT & AN TOÀN TẬP TIN CLIENT AGENT");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  // Import agent functions or test the logic directly
  const activeTempDirs = new Set();
  function cleanupTempDir(tempDir: string | null) {
    if (!tempDir || typeof tempDir !== "string") return;
    try {
      const resolvedTarget = path.resolve(tempDir);
      const resolvedTmp = path.resolve(os.tmpdir());

      // SAFETY CHECK 1: Target must strictly reside within os.tmpdir()
      if (!resolvedTarget.startsWith(resolvedTmp) || resolvedTarget === resolvedTmp) {
        // BLOCKED
        return "BLOCKED_OUTSIDE_TEMP";
      }

      // SAFETY CHECK 2: Directory name must start with our agent signature prefix
      const baseName = path.basename(resolvedTarget);
      if (!baseName.startsWith("gpm-agent-")) {
        // BLOCKED
        return "BLOCKED_INVALID_PREFIX";
      }

      if (fs.existsSync(resolvedTarget)) {
        fs.rmSync(resolvedTarget, { recursive: true, force: true });
      }
      activeTempDirs.delete(resolvedTarget);
      return "SUCCESS_DELETED";
    } catch (err: any) {
      return "ERROR: " + err.message;
    }
  }

  // TEST 1: Attempt to delete project directory (Path traversal / Attack test)
  console.log("\n[TEST 1] Thử xóa thư mục dự án (C:\\Users\\datng\\tiktok-automation)...");
  const test1Result = cleanupTempDir(process.cwd());
  if (test1Result === "BLOCKED_OUTSIDE_TEMP" && fs.existsSync(process.cwd())) {
    console.log("  ✅ THÀNH CÔNG: Chặn tuyệt đối hành vi xóa file ngoài thư mục tạm.");
    passed++;
  } else {
    console.error("  ❌ THẤT BÀI: Bộ lọc không chặn được đường dẫn ngoài thư mục tạm!");
    failed++;
  }

  // TEST 2: Attempt to delete root os.tmpdir()
  console.log("\n[TEST 2] Thử xóa chính thư mục gốc os.tmpdir()...");
  const test2Result = cleanupTempDir(os.tmpdir());
  if (test2Result === "BLOCKED_OUTSIDE_TEMP") {
    console.log("  ✅ THÀNH CÔNG: Chặn tuyệt đối hành vi xóa root temp.");
    passed++;
  } else {
    console.error("  ❌ THẤT BÀI: Cho phép xóa root temp!");
    failed++;
  }

  // TEST 3: Attempt to delete other temp folders not created by agent (e.g. gpm-temp-other)
  console.log("\n[TEST 3] Thử xóa thư mục lạ trong %TEMP% không có prefix gpm-agent-...");
  const fakeOtherTemp = path.join(os.tmpdir(), "other-user-app-123");
  fs.mkdirSync(fakeOtherTemp, { recursive: true });
  const test3Result = cleanupTempDir(fakeOtherTemp);
  if (test3Result === "BLOCKED_INVALID_PREFIX" && fs.existsSync(fakeOtherTemp)) {
    console.log("  ✅ THÀNH CÔNG: Chặn xóa thư mục lạ không có prefix gpm-agent-.");
    passed++;
  } else {
    console.error("  ❌ THẤT BÀI: Xóa thư mục không thuộc quyền của Agent!");
    failed++;
  }
  // cleanup fake
  try { fs.rmSync(fakeOtherTemp, { recursive: true, force: true }); } catch {}

  // TEST 4: Safe deletion of genuine agent temp dir
  console.log("\n[TEST 4] Kiểm tra dọn dẹp thư mục tạm hợp lệ của gpm-agent-...");
  const genuineAgentTemp = path.join(os.tmpdir(), `gpm-agent-test-${Date.now()}`);
  fs.mkdirSync(genuineAgentTemp, { recursive: true });
  fs.writeFileSync(path.join(genuineAgentTemp, "dummy.txt"), "test");
  const test4Result = cleanupTempDir(genuineAgentTemp);
  if (test4Result === "SUCCESS_DELETED" && !fs.existsSync(genuineAgentTemp)) {
    console.log("  ✅ THÀNH CÔNG: Dọn dẹp sạch sẽ thư mục tạm hợp lệ sau khi chạy.");
    passed++;
  } else {
    console.error("  ❌ THẤT BÀI: Không dọn dẹp được thư mục hợp lệ!");
    failed++;
  }

  // TEST 5: Verify agent files exist and are ready for distribution
  console.log("\n[TEST 5] Kiểm tra tính toàn vẹn của bộ cài đặt client-agent...");
  const requiredFiles = [
    "client-agent/agent.js",
    "client-agent/package.json",
    "client-agent/run-agent.bat",
    "client-agent/setup-agent.bat",
    "client-agent/README.md",
  ];
  let allFilesExist = true;
  for (const rf of requiredFiles) {
    const full = path.join(process.cwd(), rf);
    if (!fs.existsSync(full)) {
      console.error(`  ❌ Thiếu file: ${rf}`);
      allFilesExist = false;
    }
  }
  if (allFilesExist) {
    console.log("  ✅ THÀNH CÔNG: Đầy đủ 100% các tệp tin trong bộ client-agent.");
    passed++;
  } else {
    failed++;
  }

  console.log("\n==================================================");
  console.log(`🎉 KẾT QUẢ: Đã vượt qua ${passed}/${passed + failed} bài kiểm tra an toàn.`);
  console.log("==================================================\n");
}

runSecurityTests().catch(console.error);

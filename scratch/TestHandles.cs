using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

class TestHandles {
    const int SystemExtendedHandleInformation = 64;
    const uint STATUS_INFO_LENGTH_MISMATCH = 0xC0000004;
    const uint PROCESS_DUP_HANDLE = 0x0040;
    const uint DUPLICATE_SAME_ACCESS = 0x00000002;

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

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint GetFileType(IntPtr hFile);

    static void Main() {
        int[] targetPids = new int[] { 972, 15576 };
        foreach (int pid in targetPids) {
            IntPtr hProc = OpenProcess(PROCESS_DUP_HANDLE, false, pid);
            Console.WriteLine("OpenProcess for " + pid + ": " + (hProc != IntPtr.Zero ? "SUCCESS" : "FAILED err=" + Marshal.GetLastWin32Error()));
            if (hProc != IntPtr.Zero) CloseHandle(hProc);
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
                Console.WriteLine("Failed NtQuery: " + status);
                return;
            }
        }

        long handleCount = Marshal.ReadIntPtr(ptr).ToInt64();
        IntPtr currentProcess = Process.GetCurrentProcess().Handle;
        int structSize = Marshal.SizeOf(typeof(SYSTEM_HANDLE_TABLE_ENTRY_INFO_EX));
        IntPtr itemPtr = new IntPtr(ptr.ToInt64() + IntPtr.Size * 2);

        int dupSuccess = 0;
        int dupFail = 0;
        Dictionary<uint, int> fileTypes = new Dictionary<uint, int>();

        for (long i = 0; i < handleCount; i++) {
            var entry = (SYSTEM_HANDLE_TABLE_ENTRY_INFO_EX)Marshal.PtrToStructure(itemPtr, typeof(SYSTEM_HANDLE_TABLE_ENTRY_INFO_EX));
            itemPtr = new IntPtr(itemPtr.ToInt64() + structSize);

            long pid = entry.UniqueProcessId.ToInt64();
            if (pid != 972 && pid != 15576) continue;

            IntPtr procHandle = OpenProcess(PROCESS_DUP_HANDLE, false, (int)pid);
            if (procHandle == IntPtr.Zero) continue;

            IntPtr dupHandle;
            if (DuplicateHandle(procHandle, entry.HandleValue, currentProcess, out dupHandle, 0, false, DUPLICATE_SAME_ACCESS)) {
                dupSuccess++;
                uint type = GetFileType(dupHandle);
                if (!fileTypes.ContainsKey(type)) fileTypes[type] = 0;
                fileTypes[type]++;
                CloseHandle(dupHandle);
            } else {
                dupFail++;
            }
            CloseHandle(procHandle);
        }

        Marshal.FreeHGlobal(ptr);
        Console.WriteLine("dupSuccess: " + dupSuccess + ", dupFail: " + dupFail);
        foreach (var kvp in fileTypes) {
            Console.WriteLine("FileType " + kvp.Key + ": " + kvp.Value);
        }
    }
}

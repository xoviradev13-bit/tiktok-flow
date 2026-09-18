using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

class TestDup {
    const int SystemExtendedHandleInformation = 64;
    const uint STATUS_INFO_LENGTH_MISMATCH = 0xC0000004;

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

    static void Main() {
        int pid = 15576; // PID of Network Service found by Restart Manager
        Process proc = Process.GetProcessById(pid);
        Console.WriteLine("Target process: " + proc.ProcessName + " (" + pid + ")");

        IntPtr hProc = OpenProcess(0x0040, false, pid); // PROCESS_DUP_HANDLE
        if (hProc == IntPtr.Zero) {
            Console.WriteLine("OpenProcess failed: " + Marshal.GetLastWin32Error());
            return;
        }

        IntPtr currentProcess = Process.GetCurrentProcess().Handle;

        int length = 0x10000;
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
                Console.WriteLine("NtQuery failed: " + status);
                return;
            }
        }

        long handleCount = Marshal.ReadIntPtr(ptr).ToInt64();
        int structSize = Marshal.SizeOf(typeof(SYSTEM_HANDLE_TABLE_ENTRY_INFO_EX));
        IntPtr itemPtr = new IntPtr(ptr.ToInt64() + IntPtr.Size * 2);

        int count = 0;
        for (long i = 0; i < handleCount; i++) {
            var entry = (SYSTEM_HANDLE_TABLE_ENTRY_INFO_EX)Marshal.PtrToStructure(itemPtr, typeof(SYSTEM_HANDLE_TABLE_ENTRY_INFO_EX));
            itemPtr = new IntPtr(itemPtr.ToInt64() + structSize);

            if (entry.UniqueProcessId.ToInt64() != pid) continue;

            count++;
            IntPtr dupHandle;
            // DUPLICATE_SAME_ACCESS = 2
            if (DuplicateHandle(hProc, entry.HandleValue, currentProcess, out dupHandle, 0, false, 2)) {
                StringBuilder sb = new StringBuilder(1024);
                uint r = GetFinalPathNameByHandle(dupHandle, sb, (uint)sb.Capacity, 0);
                if (r > 0) {
                    Console.WriteLine("Handle 0x" + entry.HandleValue.ToString("X") + " Path: " + sb.ToString());
                }
                CloseHandle(dupHandle);
            } else {
                int err = Marshal.GetLastWin32Error();
                // print first few errors
                if (count <= 5) Console.WriteLine("Dup error on handle 0x" + entry.HandleValue.ToString("X") + ": " + err);
            }
        }
        Console.WriteLine("Total handles for PID " + pid + ": " + count);
        CloseHandle(hProc);
        Marshal.FreeHGlobal(ptr);
    }
}

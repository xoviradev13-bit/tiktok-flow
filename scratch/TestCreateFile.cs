using System;
using System.IO;
using System.Runtime.InteropServices;

class TestCreateFile {
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern IntPtr CreateFile(
        string lpFileName,
        uint dwDesiredAccess,
        uint dwShareMode,
        IntPtr lpSecurityAttributes,
        uint dwCreationDisposition,
        uint dwFlagsAndAttributes,
        IntPtr hTemplateFile
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool ReadFile(IntPtr hFile, [Out] byte[] lpBuffer, uint nNumberOfBytesToRead, out uint lpNumberOfBytesRead, IntPtr lpOverlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint GetFileSize(IntPtr hFile, out uint lpFileSizeHigh);

    const uint GENERIC_READ = 0x80000000;
    const uint FILE_SHARE_READ = 0x00000001;
    const uint FILE_SHARE_WRITE = 0x00000002;
    const uint FILE_SHARE_DELETE = 0x00000004;
    const uint OPEN_EXISTING = 3;
    const uint FILE_ATTRIBUTE_NORMAL = 0x80;

    static void Main() {
        string path = @"D:\Tiktok automation\500a1071-8dd2-43dd-9685-220721b0c4a4\Default\Network\Cookies";
        Console.WriteLine("Testing CreateFile on: " + path);

        // Try combinations of share modes:
        uint[] shares = new uint[] {
            FILE_SHARE_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE
        };

        foreach (uint s in shares) {
            IntPtr hFile = CreateFile(path, GENERIC_READ, s, IntPtr.Zero, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, IntPtr.Zero);
            if (hFile == new IntPtr(-1)) {
                int err = Marshal.GetLastWin32Error();
                Console.WriteLine("ShareMode " + s + " FAILED: Win32 Error = " + err);
            } else {
                Console.WriteLine("ShareMode " + s + " SUCCESS! Handle: 0x" + hFile.ToString("X"));
                uint high;
                uint sz = GetFileSize(hFile, out high);
                Console.WriteLine("Size = " + sz);

                byte[] buf = new byte[sz];
                uint read;
                if (ReadFile(hFile, buf, sz, out read, IntPtr.Zero)) {
                    Console.WriteLine("Successfully read " + read + " bytes!");
                    File.WriteAllBytes(@"scratch\cookies_copied_direct.db", buf);
                    Console.WriteLine("Wrote to scratch\\cookies_copied_direct.db successfully!");
                } else {
                    Console.WriteLine("ReadFile failed: " + Marshal.GetLastWin32Error());
                }
                CloseHandle(hFile);
                return;
            }
        }
    }
}

using System;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Win32.SafeHandles;

public static class ClockNativeFaultDriver {
    [DllImport("kernel32.dll",SetLastError=true)] private static extern bool DeviceIoControl(SafeFileHandle file,uint code,IntPtr input,uint inputSize,IntPtr output,uint outputSize,out uint returned,IntPtr overlapped);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern uint GetCompressedFileSize(string file,out uint high);
    public static int Main(string[] args) {
        try {
            if(args.Length!=2) return 2;
            if(args[0]=="sparse") {
                string file=Path.GetFullPath(args[1]);
                if(Path.GetFileName(file)!="node.exe" || !Path.GetFileName(Path.GetDirectoryName(file)).StartsWith("g16a-native-timeout-")) return 2;
                using(var stream=new FileStream(file,FileMode.CreateNew,FileAccess.ReadWrite,FileShare.None)) {
                    uint returned;
                    if(!DeviceIoControl(stream.SafeFileHandle,0x000900C4,IntPtr.Zero,0,IntPtr.Zero,0,out returned,IntPtr.Zero)) return 3;
                    stream.SetLength(64L*1024*1024*1024);
                }
                uint high; uint low=GetCompressedFileSize(file,out high);
                if(low==UInt32.MaxValue && Marshal.GetLastWin32Error()!=0) return 4;
                ulong allocated=((ulong)high<<32)+low;
                if((File.GetAttributes(file)&FileAttributes.SparseFile)==0 || allocated>1024*1024) return 5;
                Console.WriteLine("{\"logicalBytes\":68719476736,\"allocatedBytes\":"+allocated+"}");return 0;
            }
            if(args[0]=="cpu") {
                int pid; if(!Int32.TryParse(args[1],out pid)||pid<1) return 2;
                using(var process=Process.GetProcessById(pid)) {
                    long baseline=process.TotalProcessorTime.Ticks;
                    Console.WriteLine("{\"baselineTicks\":"+baseline+"}");Console.Out.Flush();
                    if(Console.Read()!=0x47) return 2;
                    var clock=Stopwatch.StartNew();
                    while(clock.ElapsedMilliseconds<3000) {
                        process.Refresh(); if(process.HasExited) return 6;
                        long current=process.TotalProcessorTime.Ticks;
                        if(current>baseline) { Console.WriteLine("{\"runningTicks\":"+current+",\"deltaTicks\":"+(current-baseline)+"}"); return 0; }
                        Thread.Sleep(10);
                    }
                    return 7;
                }
            }
            return 2;
        } catch { Console.Error.WriteLine("fixture_native_fault_driver_failed");return 1; }
    }
}

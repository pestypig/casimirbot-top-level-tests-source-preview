using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using CasimirBot.Desktop.Native;

// Diagnostic driver only. Never substituted for the approved bridge.
public static class EnvironmentClockStartupProbe {
    private static readonly Stopwatch Clock=Stopwatch.StartNew();
    private static void Mark(string phase) {
        using(var process=Process.GetCurrentProcess())
            Console.WriteLine("{\"phase\":\""+phase+"\",\"elapsedMs\":"+Clock.ElapsedMilliseconds+
                ",\"cpuMs\":"+(long)process.TotalProcessorTime.TotalMilliseconds+"}");
        Console.Out.Flush();
    }
    public static int Main(string[] args) {
        Mark("main");
        try {
            if(args.Length!=3) throw new Exception("clock_probe_arguments_invalid");
            string root=Path.GetFullPath(args[0]);
            string temp=Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
            if(!root.StartsWith(temp+"casimirbot-clock-startup-",StringComparison.OrdinalIgnoreCase))
                throw new Exception("clock_probe_root_invalid");
            byte[] request;
            using(var input=Console.OpenStandardInput()) {
                request=new byte[65537];int total=0,count;
                while(total<request.Length && (count=input.Read(request,total,request.Length-total))>0) total+=count;
                if(total<1||total>65536) throw new Exception("clock_probe_input_invalid");
                Array.Resize(ref request,total);
            }
            Mark("input");
            using(var lease=EnvironmentClockIsolationLease.Create(root,args[1],args[2])) {
                Mark("lease");
                var job=lease.StartSuspended();Mark("suspended");
                byte[] output=job.Exchange(request,5000);Mark("exchange");
                Console.WriteLine("{\"outputBase64\":\""+Convert.ToBase64String(output)+"\"}");
            }
            Mark("cleaned");return 0;
        } catch(Exception error) {
            string code=error.Message;
            if(!System.Text.RegularExpressions.Regex.IsMatch(code,"^clock_[a-z_]+$")) code="clock_probe_failed";
            Console.Error.WriteLine(code);return 1;
        }
    }
}

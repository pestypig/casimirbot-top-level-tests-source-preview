using System;
using System.IO;
using CasimirBot.Desktop.Native;

// Local verification driver only. Not packaged or callable from the desktop.
public static class EnvironmentJobProbe {
    public static int Main(string[] args) {
        try {
            if(args.Length != 3) return 64;
            using(var job=EnvironmentClockJob.CreateSuspended(args[1],args[2])) {
                Console.WriteLine("{\"pid\":"+job.ProcessId+",\"suspended\":true}");
                Console.Out.Flush();
                if(args[0]=="suspended") { Console.ReadLine(); return 0; }
                if(args[0]=="exchange" || args[0]=="exchange-short") {
                    using(var input=new MemoryStream()) {
                        var source=Console.OpenStandardInput(); var buffer=new byte[4096]; int count;
                        while((count=source.Read(buffer,0,Math.Min(buffer.Length,65537-(int)input.Length)))>0) {
                            input.Write(buffer,0,count); if(input.Length>65536) break;
                        }
                        byte[] output=job.Exchange(input.ToArray(),args[0]=="exchange-short"?300:5000);
                        Console.WriteLine("{\"outputBase64\":\""+Convert.ToBase64String(output)+"\"}");
                    }
                    return 0;
                }
                job.Resume();
                if(args[0]=="hold") { Console.ReadLine(); job.StopAndWait(); }
                else if(!job.WaitForExit(5000)) { job.StopAndWait(); return 124; }
                Console.WriteLine("{\"exit\":"+job.ExitCode+",\"peakJobMemory\":"+job.PeakJobMemory+"}");
                return 0;
            }
        } catch(Exception error) {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }
}

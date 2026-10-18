using System;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using CasimirBot.Desktop.Native;

// Standalone local verification only; never shipped or invoked by the UI.
public static class EnvironmentIsolationProbe {
    [DllImport("userenv.dll",CharSet=CharSet.Unicode)]
    private static extern int CreateAppContainerProfile(string name,string display,string description,IntPtr capabilities,uint count,out IntPtr sid);
    [DllImport("userenv.dll",CharSet=CharSet.Unicode)] private static extern int DeleteAppContainerProfile(string name);
    [DllImport("advapi32.dll")] private static extern IntPtr FreeSid(IntPtr sid);
    [DllImport("advapi32.dll",SetLastError=true)] private static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
    [DllImport("advapi32.dll",SetLastError=true)] private static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr value,int size,out int needed);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernelbase.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    private static extern bool DeriveCapabilitySidsFromName(string name,out IntPtr groups,out uint groupCount,out IntPtr sids,out uint sidCount);
    [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr value);

    private static bool OnlyRegistryRead(IntPtr token) {
        IntPtr groups=IntPtr.Zero,sids=IntPtr.Zero,buffer=IntPtr.Zero; uint groupCount=0,sidCount=0;
        try {
            if(!DeriveCapabilitySidsFromName("registryRead",out groups,out groupCount,out sids,out sidCount)||sidCount!=1)
                throw new Exception("probe_expected_capability_failed");
            int needed; GetTokenInformation(token,30,IntPtr.Zero,0,out needed);
            if(needed<24||needed>65536) throw new Exception("probe_capabilities_size_failed");
            buffer=Marshal.AllocHGlobal(needed);
            if(!GetTokenInformation(token,30,buffer,needed,out needed)) throw new Exception("probe_capabilities_query_failed");
            // x64 TOKEN_GROUPS: DWORD count, padding, then SID_AND_ATTRIBUTES.
            return Marshal.ReadInt32(buffer)==1 &&
                new SecurityIdentifier(Marshal.ReadIntPtr(buffer,8)).Equals(new SecurityIdentifier(Marshal.ReadIntPtr(sids)));
        } finally {
            if(buffer!=IntPtr.Zero) Marshal.FreeHGlobal(buffer);
            if(groups!=IntPtr.Zero) { for(uint i=0;i<groupCount;i++) LocalFree(Marshal.ReadIntPtr(groups,(int)i*IntPtr.Size)); LocalFree(groups); }
            if(sids!=IntPtr.Zero) { for(uint i=0;i<sidCount;i++) LocalFree(Marshal.ReadIntPtr(sids,(int)i*IntPtr.Size)); LocalFree(sids); }
        }
    }

    private static int ReadTokenInt(IntPtr token,int kind) {
        int needed; GetTokenInformation(token,kind,IntPtr.Zero,0,out needed);
        if(needed<4 || needed>65536) throw new Exception("probe_token_size_failed");
        IntPtr buffer=Marshal.AllocHGlobal(needed);
        try {
            if(!GetTokenInformation(token,kind,buffer,needed,out needed)) throw new Exception("probe_token_query_failed");
            return Marshal.ReadInt32(buffer);
        } finally { Marshal.FreeHGlobal(buffer); }
    }
    private static void Grant(string path,SecurityIdentifier sid,bool remove) {
        var rule=new FileSystemAccessRule(sid,FileSystemRights.ReadAndExecute,AccessControlType.Allow);
        if(Directory.Exists(path)) {
            var acl=Directory.GetAccessControl(path);
            if(remove) acl.RemoveAccessRuleSpecific(rule); else acl.AddAccessRule(rule);
            Directory.SetAccessControl(path,acl);
        } else {
            var acl=File.GetAccessControl(path);
            if(remove) acl.RemoveAccessRuleSpecific(rule); else acl.AddAccessRule(rule);
            File.SetAccessControl(path,acl);
        }
    }
    public static int Main(string[] args) {
        string profile="CasimirBot.ClockProbe."+Guid.NewGuid().ToString("N");
        IntPtr sidPointer=IntPtr.Zero; SecurityIdentifier sid=null;
        bool created=false; string[] granted=new string[0]; int result=1;
        string packageCanary=null; var allPackages=new SecurityIdentifier("S-1-15-2-1");
        try {
            if(args.Length!=1) throw new Exception("probe_arguments_invalid");
            string root=Path.GetFullPath(args[0]);
            string temp=Path.GetFullPath(Path.Combine(Environment.CurrentDirectory,".tmp"))+Path.DirectorySeparatorChar;
            if(!root.StartsWith(temp,StringComparison.OrdinalIgnoreCase) || !Path.GetFileName(root).StartsWith("g16a-clock-isolation-",StringComparison.Ordinal))
                throw new Exception("probe_root_invalid");
            for(string cursor=root;cursor!=null;cursor=Path.GetDirectoryName(cursor))
                if((File.GetAttributes(cursor)&FileAttributes.ReparsePoint)!=0) throw new Exception("probe_root_reparse");
            string runtime=Path.Combine(root,"node.exe"),entry=Path.Combine(root,"clock.cjs");
            foreach(string file in new string[]{runtime,entry})
                if(!File.Exists(file)||(File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0) throw new Exception("probe_file_invalid");
            int hr=CreateAppContainerProfile(profile,profile,"Temporary clock isolation verification",IntPtr.Zero,0,out sidPointer);
            if(hr!=0) throw new Exception("probe_profile_create_failed:"+hr);
            created=true; sid=new SecurityIdentifier(sidPointer);
            // Only our fresh root and its two copied files receive non-inherited RX.
            granted=new string[]{root,runtime,entry};
            foreach(string path in granted) Grant(path,sid,false);
            packageCanary=Path.Combine(root,"app-packages-canary.txt");
            if(File.Exists(packageCanary)) Grant(packageCanary,allPackages,false);
            using(var job=EnvironmentClockJob.CreateIsolatedSuspended(runtime,entry,sid)) {
                IntPtr token=IntPtr.Zero;
                try {
                    using(var process=Process.GetProcessById((int)job.ProcessId))
                        if(!OpenProcessToken(process.Handle,8,out token)) throw new Exception("probe_token_open_failed");
                    int container=ReadTokenInt(token,29),capabilities=ReadTokenInt(token,30);
                    if(container!=1 || capabilities!=1 || !OnlyRegistryRead(token)) throw new Exception("probe_token_boundary_failed");
                    Console.WriteLine("{\"pid\":"+job.ProcessId+",\"appContainer\":true,\"capabilityCount\":1,\"onlyRegistryRead\":true}");
                    Console.Out.Flush();
                } finally { if(token!=IntPtr.Zero) CloseHandle(token); }
                using(var input=new MemoryStream()) {
                    var source=Console.OpenStandardInput(); byte[] buffer=new byte[4096]; int count;
                    while((count=source.Read(buffer,0,Math.Min(buffer.Length,65537-(int)input.Length)))>0) {
                        input.Write(buffer,0,count); if(input.Length>65536) break;
                    }
                    byte[] output;
                    try { output=job.Exchange(input.ToArray(),5000); }
                    catch { Console.Error.WriteLine("probe_child_exit:"+job.ExitCode); throw; }
                    Console.WriteLine("{\"outputBase64\":\""+Convert.ToBase64String(output)+"\"}");
                }
            }
            result=0;
        } catch(Exception error) { Console.Error.WriteLine(error.Message); }
        finally {
            if(packageCanary!=null && File.Exists(packageCanary)) {
                try { Grant(packageCanary,allPackages,true); } catch { Console.Error.WriteLine("probe_canary_cleanup_failed"); result=1; }
            }
            if(sid!=null) foreach(string path in granted) {
                try { Grant(path,sid,true); } catch { Console.Error.WriteLine("probe_acl_cleanup_failed"); result=1; }
            }
            if(sidPointer!=IntPtr.Zero) FreeSid(sidPointer);
            if(created) {
                int hr=DeleteAppContainerProfile(profile);
                if(hr!=0) { Console.Error.WriteLine("probe_profile_cleanup_failed:"+hr); result=1; }
                else Console.WriteLine("{\"temporaryProfileRemoved\":true}");
            }
        }
        return result;
    }
}

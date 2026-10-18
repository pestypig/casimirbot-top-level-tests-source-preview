using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using CasimirBot.Desktop.Native;

public static class EnvironmentIsolationLifecycleProbe {
    [DllImport("userenv.dll",CharSet=CharSet.Unicode)] private static extern int GetAppContainerFolderPath(string sid,out IntPtr path);
    [DllImport("userenv.dll",CharSet=CharSet.Unicode)] private static extern int DeriveAppContainerSidFromAppContainerName(string name,out IntPtr sid);
    [DllImport("advapi32.dll")] private static extern IntPtr FreeSid(IntPtr sid);
    private static string Folder(string sid) {
        IntPtr pointer=IntPtr.Zero;
        try {
            int hr=GetAppContainerFolderPath(sid,out pointer);
            if(hr==unchecked((int)0x80070002)||hr==unchecked((int)0x80070003)) return null;
            if(hr!=0) throw new Exception("probe_folder_failed:"+hr);
            return Marshal.PtrToStringUni(pointer);
        } finally { if(pointer!=IntPtr.Zero) Marshal.FreeCoTaskMem(pointer); }
    }
    private static string SidForProfile(string profile) {
        IntPtr pointer=IntPtr.Zero;
        try {
            if(DeriveAppContainerSidFromAppContainerName(profile,out pointer)!=0) throw new Exception("probe_sid_failed");
            return new SecurityIdentifier(pointer).Value;
        } finally { if(pointer!=IntPtr.Zero) FreeSid(pointer); }
    }
    private static bool HasGrant(string root,string sid) {
        foreach(string path in new string[]{root,Path.Combine(root,"node.exe"),Path.Combine(root,"clock.cjs")}) {
            if(!File.Exists(path)&&!Directory.Exists(path)) continue;
            FileSystemSecurity acl=Directory.Exists(path)?(FileSystemSecurity)Directory.GetAccessControl(path):File.GetAccessControl(path);
            foreach(FileSystemAccessRule rule in acl.GetAccessRules(true,true,typeof(SecurityIdentifier)))
                if(rule.IdentityReference.Value==sid && rule.AccessControlType==AccessControlType.Allow) return true;
        }
        return false;
    }
    private static string RecordedProfile(string root) {
        string path=Path.Combine(root,"clock-isolation.journal");
        if(!File.Exists(path)) return null;
        string[] fields=File.ReadAllText(path).Split('\n'); Guid nonce;
        if(fields.Length!=5||!Guid.TryParseExact(fields[2],"N",out nonce)) return null;
        return "CasimirBot.ClockLease."+nonce.ToString("N");
    }
    private static void CleanupEvidence(string root,string profile,string knownFolder) {
        if(profile==null) { Console.WriteLine("{\"noLease\":true}"); return; }
        string sid=SidForProfile(profile);
        string remaining=Folder(sid);
        Console.WriteLine("{\"profileRemoved\":"+(remaining==null && (knownFolder==null||!Directory.Exists(knownFolder))).ToString().ToLowerInvariant()+
            ",\"grantsRemoved\":"+(!HasGrant(root,sid)).ToString().ToLowerInvariant()+"}");
    }
    public static int Main(string[] args) {
        try {
            if(args.Length!=4) throw new Exception("probe_arguments_invalid");
            string root=Path.GetFullPath(args[1]);
            string temp=Path.GetFullPath(Path.Combine(Environment.CurrentDirectory,".tmp"))+Path.DirectorySeparatorChar;
            if(!root.StartsWith(temp,StringComparison.OrdinalIgnoreCase)||!Path.GetFileName(root).StartsWith("g16a-clock-lease-",StringComparison.Ordinal))
                throw new Exception("probe_root_invalid");
            if(args[0]=="recover") {
                string profile=RecordedProfile(root);
                string folder=profile==null?null:Folder(SidForProfile(profile));
                EnvironmentClockIsolationLease.Recover(root); CleanupEvidence(root,profile,folder); return 0;
            }
            string ownedProfile,ownedFolder;
            using(var lease=EnvironmentClockIsolationLease.Create(root,args[2],args[3])) {
                ownedProfile=lease.ProfileName;
                ownedFolder=Folder(lease.ProfileSid);
                if(args[0]=="granted") {
                    Console.WriteLine("{\"phase\":\"granted\",\"profileExists\":"+Directory.Exists(Folder(lease.ProfileSid)).ToString().ToLowerInvariant()+"}");
                    Console.Out.Flush();Console.ReadLine();
                } else {
                    var job=lease.StartSuspended();
                    if(args[0]=="normal") {
                        byte[] result=job.Exchange(new byte[0],5000);
                        Console.WriteLine("{\"pid\":"+job.ProcessId+",\"outputBase64\":\""+Convert.ToBase64String(result)+"\"}");
                    } else {
                        if(args[0]=="running") {
                            job.Resume();
                            Thread.Sleep(250);
                            if(job.WaitForExit(0)) throw new Exception("probe_child_exited_before_crash:"+job.ExitCode);
                        } else if(args[0]!="suspended") throw new Exception("probe_mode_invalid");
                        Console.WriteLine("{\"pid\":"+job.ProcessId+",\"phase\":\""+args[0]+"\",\"profileExists\":"+Directory.Exists(ownedFolder).ToString().ToLowerInvariant()+"}");
                        Console.Out.Flush();Console.ReadLine();
                    }
                }
            }
            CleanupEvidence(root,ownedProfile,ownedFolder);return 0;
        } catch(Exception error) { Console.Error.WriteLine(error.Message);return 1; }
    }
}

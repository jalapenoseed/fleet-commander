using System;
using System.IO;
using System.Collections.Generic;
using FleetCommander.Core;
using UnityEngine;
namespace FleetCommander.Systems
{
    [Serializable] public sealed class FleetSave
    {
        public string kind="fleet-commander-unity";
        public int version=1;
        public string name="My fleet";
        public FleetConfig config;
        public DroneState[] drones;
        public float elapsed;
        public string source="formation ring\nwait 12\nformation heart\nwait 12\nrepeat 24";
    }
    public static class FleetStorage
    {
        public static FleetSave Capture(FleetWorld world,string name,string source) => new FleetSave
        {name=name,config=JsonUtility.FromJson<FleetConfig>(JsonUtility.ToJson(world.Config)),drones=(DroneState[])world.States.Clone(),elapsed=world.Time,source=source};
        public static void Validate(FleetSave s)
        {
            if(s==null||s.kind!="fleet-commander-unity"||s.version!=1||string.IsNullOrWhiteSpace(s.name)||s.name.Length>64||s.config==null||s.drones==null||s.drones.Length>10000||
                float.IsNaN(s.elapsed)||float.IsInfinity(s.elapsed)||s.elapsed<0||s.source!=null&&s.source.Length>32000)throw new ArgumentException("Invalid Fleet Commander save.");
            s.config.Validate();var probe=new FleetWorld(s.config,0);probe.Restore(s.drones,s.elapsed);
            var ids=new HashSet<int>();foreach(var d in s.drones)if(!ids.Add(d.id))throw new ArgumentException("Duplicate drone ID.");
        }
        public static string ToJson(FleetSave s){Validate(s);return JsonUtility.ToJson(s,true);}
        public static FleetSave Parse(string text)
        {
            if(string.IsNullOrWhiteSpace(text)||text.Length>12000000)throw new ArgumentException("Fleet JSON is empty or exceeds 12 MB.");
            var header=JsonUtility.FromJson<Header>(text);
            if(header.kind=="fleet-commander-fleet"||header.kind=="gridrunner-commander-fleet")return ImportBrowser(text);
            var s=JsonUtility.FromJson<FleetSave>(text);Validate(s);return s;
        }
        public static void Write(string path,FleetSave s)
        {
            string json=ToJson(s),full=Path.GetFullPath(path);Directory.CreateDirectory(Path.GetDirectoryName(full));
            string temp=full+".tmp";File.WriteAllText(temp,json);
            if(File.Exists(full))File.Replace(temp,full,full+".bak");else File.Move(temp,full);
        }
        [Serializable] class Header { public string kind; }
        [Serializable] class BrowserFleet { public int version; public string name; public BrowserDrone[] roster; public BrowserProgram program; public BrowserOptions options; }
        [Serializable] class BrowserDrone { public string id,name,type,team,color; }
        [Serializable] class BrowserProgram { public BrowserSettings settings; public string source; }
        [Serializable] class BrowserSettings
        {
            public string shape="grid",pattern="none",field="none",field2="none",field3="none",field4="none",boids="off";
            public float height=28,spacing=14,scale=1,rotation,moveX,moveZ,patternSpeed=1;
            public float strength=8,strength2=8,strength3=8,strength4=8,frequency=.6f,frequency2=.6f,frequency3=.6f,frequency4=.6f;
        }
        [Serializable] class BrowserOptions {public bool unlimited,obstacles=true;public float batteryDrain=1;}
        static FleetSave ImportBrowser(string text)
        {
            var raw=JsonUtility.FromJson<BrowserFleet>(text);
            if(raw.version!=1||raw.roster==null||raw.roster.Length>10000||raw.program?.settings==null)throw new ArgumentException("Invalid browser fleet.");
            var a=raw.program.settings;var c=new FleetConfig{formation=ParseShape(a.shape),height=a.height,spacing=a.spacing,scale=a.scale,rotation=a.rotation,origin=new Vector3(a.moveX,0,a.moveZ),boids=a.boids=="on"};
            if(Enum.TryParse<MotionPattern>(a.pattern,true,out var pattern))c.pattern=pattern;
            string[] fields={a.field,a.field2,a.field3,a.field4};float[] strength={a.strength,a.strength2,a.strength3,a.strength4},freq={a.frequency,a.frequency2,a.frequency3,a.frequency4};
            for(int i=0;i<4;i++){if(Enum.TryParse<InfluenceKind>(fields[i],true,out var kind))c.layers[i].kind=kind;c.layers[i].strength=strength[i];c.layers[i].frequency=freq[i];}
            if(raw.options!=null){c.unlimited=raw.options.unlimited;c.obstacles=raw.options.obstacles;c.drainScale=raw.options.batteryDrain;}
            c.Validate();var world=new FleetWorld(c,raw.roster.Length);var seen=new HashSet<string>();
            string[] teams={"alpha","bravo","charlie","delta"},colors={"cyan","blue","purple","pink","red","orange","yellow","green","white"};
            for(int i=0;i<raw.roster.Length;i++)
            {
                var d=raw.roster[i];if(d==null||string.IsNullOrEmpty(d.id)||!seen.Add(d.id))throw new ArgumentException("Invalid or duplicate browser drone.");
                world.States[i].fleetId=Mathf.Max(0,Array.IndexOf(teams,d.team));world.States[i].palette=Mathf.Max(0,Array.IndexOf(colors,d.color));
                world.States[i].frame=d.type=="cargo"?FrameKind.Cargo:d.type=="relay"?FrameKind.Relay:d.type=="engineer"?FrameKind.Utility:FrameKind.Scout;
            }
            var s=Capture(world,raw.name,raw.program.source);Validate(s);return s;
        }
        public static FormationKind ParseShape(string value)
        {
            value=(value??"").Replace("_","").Replace("-","");
            if(Enum.TryParse<FormationKind>(value,true,out var shape)&&Enum.IsDefined(typeof(FormationKind),shape))return shape;
            if(value=="word")return FormationKind.Art;
            throw new ArgumentException("Unknown formation: "+value);
        }
    }
}

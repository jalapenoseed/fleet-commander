using System;
using System.Collections.Generic;
using System.Globalization;
using FleetCommander.Core;
using UnityEngine;
namespace FleetCommander.Systems
{
    // A bounded command language. No eval, file access, or arbitrary C# execution.
    public sealed class CueProgram
    {
        sealed class Cue {public float time;public string[] args;}
        readonly List<Cue> cues=new List<Cue>();
        public bool Running {get;private set;}
        public float Time {get;private set;}
        float loop;int cursor,group=-1;
        public void Compile(string source)
        {
            Stop();var compiled=new List<Cue>();float clock=0,newLoop=0;
            if(source==null||source.Length>32000)throw new ArgumentException("Program exceeds 32,000 characters.");
            foreach(string raw in source.Split('\n'))
            {
                string line=raw.Trim();if(line.Length==0||line.StartsWith("#"))continue;
                var a=line.Split(new[]{' '},StringSplitOptions.RemoveEmptyEntries);a[0]=a[0].ToLowerInvariant();
                if(a[0]=="wait"){Require(a,2);clock+=Number(a[1],.05f,600);continue;}
                if(a[0]=="repeat"){Require(a,2);newLoop=Number(a[1],.1f,3600);continue;}
                Validate(a);compiled.Add(new Cue{time=clock,args=a});if(compiled.Count>512)throw new ArgumentException("Maximum 512 cues.");
            }
            if(newLoop>0&&newLoop<=clock)throw new ArgumentException("Repeat duration must be later than the last cue.");
            cues.Clear();cues.AddRange(compiled);loop=newLoop;cursor=0;Time=0;group=-1;
        }
        public void Start(){cursor=0;Time=0;group=-1;Running=cues.Count>0;}
        public void Stop(){Running=false;}
        static void Require(string[] a,int n){if(a.Length!=n)throw new ArgumentException("Wrong number of arguments for "+a[0]);}
        static float Number(string s,float min,float max)
        {
            if(!float.TryParse(s,NumberStyles.Float,CultureInfo.InvariantCulture,out float n)||float.IsNaN(n)||float.IsInfinity(n)||n<min||n>max)throw new ArgumentException("Number outside "+min+"–"+max+": "+s);return n;
        }
        static void Validate(string[] a)
        {
            switch(a[0])
            {
                case "formation":Require(a,2);FleetStorage.ParseShape(a[1]);break;
                case "pattern":Require(a,2);if(!Enum.TryParse<MotionPattern>(a[1],true,out var p)||!Enum.IsDefined(typeof(MotionPattern),p))throw new ArgumentException("Unknown pattern.");break;
                case "select":Require(a,2);if(Array.IndexOf(new[]{"all","alpha","bravo","charlie","delta"},a[1].ToLowerInvariant())<0)throw new ArgumentException("Select all, alpha, bravo, charlie or delta.");break;
                case "height":Require(a,2);Number(a[1],2,260);break;
                case "spacing":Require(a,2);Number(a[1],.5f,20);break;
                case "scale":Require(a,2);Number(a[1],.1f,5);break;
                case "bpm":Require(a,2);Number(a[1],40,240);break;
                case "speed":Require(a,2);Number(a[1],1,60);break;
                case "boids":Require(a,2);if(a[1]!="on"&&a[1]!="off")throw new ArgumentException("Use boids on/off.");break;
                case "influence":
                    Require(a,4);if(!Enum.TryParse<InfluenceKind>(a[1],true,out var f)||!Enum.IsDefined(typeof(InfluenceKind),f))throw new ArgumentException("Unknown influence.");Number(a[2],0,24);Number(a[3],.05f,3);break;
                case "layer":
                    Require(a,5);int slot=(int)Number(a[1],1,4);Validate(new[]{"influence",a[2],a[3],a[4]});break;
                case "word":if(a.Length<2)throw new ArgumentException("Word needs text.");break;
                case "show":Require(a,2);if(Array.IndexOf(new[]{"fireworks","halftime","aurora","galaxy"},a[1])<0)throw new ArgumentException("Unknown show.");break;
                case "reset":Require(a,1);break;
                case "launch":case "land":Require(a,1);break;
                default:throw new ArgumentException("Unsupported command: "+a[0]);
            }
        }
        public void Step(float dt,FleetWorld world)
        {
            if(!Running)return;Time+=dt;
            if(loop>0&&Time>=loop){Time%=loop;cursor=0;group=-1;}
            while(cursor<cues.Count&&cues[cursor].time<=Time)Execute(cues[cursor++].args,world);
            if(cursor==cues.Count&&loop==0)Running=false;
        }
        void Execute(string[] a,FleetWorld w)
        {
            var c=w.Config;float N(int i)=>float.Parse(a[i],CultureInfo.InvariantCulture);
            switch(a[0])
            {
                case "select":group=Array.IndexOf(new[]{"all","alpha","bravo","charlie","delta"},a[1].ToLowerInvariant())-1;break;
                case "formation":if(group<0){c.formation=FleetStorage.ParseShape(a[1]);foreach(var g in c.groups)g.enabled=false;}else{c.groups[group].enabled=true;c.groups[group].formation=FleetStorage.ParseShape(a[1]);}break;
                case "height":if(group<0)c.height=N(1);else c.groups[group].offset.y=N(1)-c.height;break;
                case "spacing":c.spacing=N(1);break;case "scale":c.scale=N(1);break;case "speed":c.speed=N(1);break;case "bpm":c.bpm=N(1);break;
                case "boids":c.boids=a[1]=="on";break;
                case "pattern":c.pattern=(MotionPattern)Enum.Parse(typeof(MotionPattern),a[1],true);break;
                case "influence":c.layers[0].kind=(InfluenceKind)Enum.Parse(typeof(InfluenceKind),a[1],true);c.layers[0].strength=N(2);c.layers[0].frequency=N(3);break;
                case "layer":int s=(int)N(1)-1;c.layers[s].kind=(InfluenceKind)Enum.Parse(typeof(InfluenceKind),a[2],true);c.layers[s].strength=N(3);c.layers[s].frequency=N(4);break;
                case "reset":c.ResetInfluences();c.boids=false;break;
                case "launch":w.Launch(group);break;case "land":w.Recall(group);break;
                case "word":c.art=ArtStudio.Text(string.Join(" ",a,1,a.Length-1));c.formation=FormationKind.Art;break;
                case "show":ApplyShow(c,a[1]);break;
            }
        }
        public static void ApplyShow(FleetConfig c,string name)
        {
            c.ResetInfluences();foreach(var g in c.groups)g.enabled=false;c.sky=SkyKind.Night;c.height=60;
            c.formation=name=="fireworks"?FormationKind.Sphere:name=="aurora"?FormationKind.Line:name=="galaxy"?FormationKind.Helix:FormationKind.Grid;
            c.pattern=name=="fireworks"?MotionPattern.Pulse:name=="galaxy"?MotionPattern.Orbit:MotionPattern.Wave;
            c.layers[0].kind=name=="aurora"?InfluenceKind.Braid:InfluenceKind.Wave;c.layers[0].strength=8;
        }
    }
}

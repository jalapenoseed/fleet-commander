using System;
using System.Collections.Generic;
using FleetCommander.Core;
using UnityEngine;
namespace FleetCommander.Systems
{
    [Serializable] public sealed class ReplayFrame { public float time; public DroneState[] drones; public string config; }
    [Serializable] public sealed class ReplayArchive { public int version=1; public ReplayFrame[] frames; }
    public sealed class ReplayBuffer
    {
        public const int Capacity=180, MaxRecordedDrones=2000;
        public readonly List<ReplayFrame> Frames=new List<ReplayFrame>(Capacity);
        public readonly List<string> Highlights=new List<string>();
        public readonly List<float> HighlightTimes=new List<float>();
        public DroneState[] Display {get;private set;}=Array.Empty<DroneState>();
        public FleetConfig DisplayConfig {get;private set;}
        public bool Playing {get;private set;}
        public bool Paused;
        public float Rate=1;
        public float Cursor {get;private set;}
        public float Duration => Frames.Count<2?0:Frames[Frames.Count-1].time-Frames[0].time;
        public float Normalized => Duration<=0?0:(Cursor-Frames[0].time)/Duration;
        float accumulator,lastMark=-99;
        int lastConfigFrame=-1;
        public void Record(FleetWorld world,float dt)
        {
            if(Playing||world.Count>MaxRecordedDrones)return;
            accumulator+=dt;if(accumulator<.1f)return;accumulator-=.1f;
            if(Frames.Count>0 && Frames[0].drones.Length!=world.Count)Clear();
            ReplayFrame frame;
            if(Frames.Count==Capacity){frame=Frames[0];Frames.RemoveAt(0);}else frame=new ReplayFrame();
            if(frame.drones==null||frame.drones.Length!=world.Count)frame.drones=new DroneState[world.Count];
            Array.Copy(world.States,frame.drones,world.Count);frame.time=world.Time;frame.config=JsonUtility.ToJson(world.Config);Frames.Add(frame);
        }
        public void Mark(string label,float time)
        {
            if(time-lastMark<2)return;lastMark=time;Highlights.Add(label+" · "+time.ToString("F1")+"s");HighlightTimes.Add(time);
            if(Highlights.Count>12){Highlights.RemoveAt(0);HighlightTimes.RemoveAt(0);}
        }
        public bool Play(float around=-1)
        {
            if(Frames.Count<2)return false;
            Playing=true;Paused=false;Cursor=Mathf.Max(Frames[0].time,(around<0?Frames[Frames.Count-1].time:around)-8);
            Display=new DroneState[Frames[0].drones.Length];lastConfigFrame=-1;Sample();return true;
        }
        public void Update(float dt)
        {
            if(!Playing)return;
            if(!Paused)Cursor=Mathf.Min(Frames[Frames.Count-1].time,Cursor+dt*Mathf.Clamp(Rate,.125f,2));
            if(Cursor>=Frames[Frames.Count-1].time)Paused=true;Sample();
        }
        public void Seek(float t){if(!Playing)return;Cursor=Mathf.Lerp(Frames[0].time,Frames[Frames.Count-1].time,Mathf.Clamp01(t));Sample();}
        void Sample()
        {
            int k=0;while(k<Frames.Count-2&&Frames[k+1].time<Cursor)k++;
            var a=Frames[k];var b=Frames[k+1];float t=Mathf.InverseLerp(a.time,b.time,Cursor);
            for(int i=0;i<Display.Length;i++){Display[i]=a.drones[i];Display[i].position=Vector3.Lerp(a.drones[i].position,b.drones[i].position,t);Display[i].rotation=Quaternion.Slerp(a.drones[i].rotation,b.drones[i].rotation,t);}
            if(k!=lastConfigFrame){DisplayConfig=JsonUtility.FromJson<FleetConfig>(a.config);lastConfigFrame=k;}
        }
        public void Stop(){Playing=false;Paused=false;}
        public void Clear(){Stop();Frames.Clear();Highlights.Clear();HighlightTimes.Clear();accumulator=0;lastMark=-99;}
        public void Export(string path)=>System.IO.File.WriteAllText(path,JsonUtility.ToJson(new ReplayArchive{frames=Frames.ToArray()}));
    }
}

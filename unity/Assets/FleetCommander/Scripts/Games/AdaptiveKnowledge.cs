using System;
using System.Collections.Generic;
using System.IO;
using FleetCommander.Core;
using UnityEngine;
namespace FleetCommander.Games
{
    [Serializable] public sealed class ActivityKnowledge
    {public string activity;public AdaptivePolicy blue=new AdaptivePolicy(),red=new AdaptivePolicy();}
    [Serializable] public sealed class AdaptiveKnowledge
    {
        public List<ActivityKnowledge> activities=new List<ActivityKnowledge>();
        public int completed;
        public string PathName=>Path.Combine(Application.persistentDataPath,FleetCommander.Systems.RuntimeSmoke.Running?"qa-adaptive-knowledge.json":"adaptive-knowledge.json");
        public void Load(){try{if(File.Exists(PathName)){var data=JsonUtility.FromJson<AdaptiveKnowledge>(File.ReadAllText(PathName));activities=data?.activities??new List<ActivityKnowledge>();completed=data?.completed??0;}}catch(Exception e){Debug.LogWarning("Learning data: "+e.Message);}}
        public void Bind(AdaptiveDuelLab lab,string activity,int seed)
        {
            var entry=activities.Find(x=>x.activity==activity);if(entry==null){entry=new ActivityKnowledge{activity=activity};activities.Add(entry);}
            entry.blue.Choose(seed+completed*17);entry.red.Choose(seed+completed*31+7);lab.UsePolicies(entry.blue,entry.red);
        }
        public void Finish(AdaptiveDuelLab lab,int winner){lab.Complete(winner);completed++;Save();}
        public void Save(){try{File.WriteAllText(PathName,JsonUtility.ToJson(this,true));}catch(Exception e){Debug.LogWarning("Could not save learning: "+e.Message);}}
        public void Export(AdaptiveDuelLab lab)
        {
            var b=new System.Text.StringBuilder("time,agent,target,effector,sensors,uncertainty,reward,fired,hit,lockLost\n");var ci=System.Globalization.CultureInfo.InvariantCulture;
            foreach(var s in lab.Samples)b.Append(s.time.ToString(ci)).Append(',').Append(s.agent).Append(',').Append(s.target).Append(',').Append(s.effector).Append(',').Append((int)s.sensors).Append(',').Append(s.uncertainty.ToString(ci)).Append(',').Append(s.reward.ToString(ci)).Append(',').Append(s.fired).Append(',').Append(s.hit).Append(',').Append(s.lockLost).Append('\n');
            File.WriteAllText(Path.Combine(Application.persistentDataPath,"adaptive-engagement-log.csv"),b.ToString());Save();
        }
    }
}

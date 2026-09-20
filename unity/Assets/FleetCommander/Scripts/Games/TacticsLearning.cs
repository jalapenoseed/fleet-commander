using System;
using System.IO;
using FleetCommander.Core;
using UnityEngine;
namespace FleetCommander.Games
{
    // Small, inspectable UCB bandit: learns opening formations from completed arena trials.
    // No neural network or claim of general combat intelligence.
    [Serializable] public sealed class TacticsLearning
    {
        public int[] trials=new int[40];public float[] rewards=new float[40];public int completed;
        static string FileName=>Path.Combine(Application.persistentDataPath,FleetCommander.Systems.RuntimeSmoke.Running?"qa-arena-tactics.json":"arena-tactics.json");
        public int Choose(int team,int seed){int start=Mathf.Clamp(team,0,1)*20;for(int k=0;k<20;k++){int j=(k+Math.Abs(seed%20))%20;if(trials[start+j]==0)return j;}float best=float.MinValue;int picked=0;for(int j=0;j<20;j++){int i=start+j;float score=rewards[i]/trials[i]+.5f*Mathf.Sqrt(Mathf.Log(completed+1)/trials[i]);if(score>best){best=score;picked=j;}}return picked;}
        public void Bind(FleetWorld world,int seed){if(!world.IsBattle||!world.Battle.adaptive||!world.Battle.lab.learn)return;for(int team=0;team<2;team++)if((team==0?world.Battle.bluePlan:world.Battle.redPlan).automatic)world.LearnedOpening[team]=Choose(team,seed+team*7);}
        public void Finish(FleetWorld w){if(!w.RoundEnded||!w.Battle.adaptive||!w.Battle.lab.learn)return;for(int team=0;team<2;team++){int choice=w.LearnedOpening[team];if(choice<0)continue;int i=team*20+choice;float accuracy=0;int count=0;foreach(var s in w.States)if(s.fleetId==team){accuracy+=s.shotsFired==0?0:Mathf.Min(1,s.hitsLanded/(float)s.shotsFired);count++;}float reward=(w.Winner==team?1:w.Winner==2?.5f:0)*.8f+accuracy/Mathf.Max(1,count)*.2f;trials[i]++;rewards[i]+=reward;}completed++;}
        public void Save(){File.WriteAllText(FileName,JsonUtility.ToJson(this,true));}
        public void Load(){if(!File.Exists(FileName))return;try{var p=JsonUtility.FromJson<TacticsLearning>(File.ReadAllText(FileName));if(p.trials.Length==40&&p.rewards.Length==40){trials=p.trials;rewards=p.rewards;completed=Mathf.Max(0,p.completed);}}catch(Exception e){Debug.LogWarning(e.Message);}}
        public string Summary(){string s="Opening formation learning · "+completed+" completed trials\n";for(int team=0;team<2;team++){int count=0;float best=-1;int pick=-1;for(int j=0;j<20;j++){int k=team*20+j;if(trials[k]>0){count++;float mean=rewards[k]/trials[k];if(mean>best){best=mean;pick=j;}}}s+=(team==0?"Blue":"Red")+": "+count+" / 20 explored · "+(pick<0?"no evidence yet":((ArenaFormation)pick)+" mean reward "+best.ToString("F2"))+"\n";}return s;}
    }
}

using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using FleetCommander.Systems;
namespace FleetCommander.Systems
{
    [Serializable] public sealed class MatchResult
    {public string mode,ended,result;public int blue,red,winner;}
    [Serializable] public sealed class MatchResults
    {
        public List<MatchResult> matches=new List<MatchResult>();
        string PathName=>Path.Combine(Application.persistentDataPath,RuntimeSmoke.Running?"qa-match-results.json":"match-results.json");
        public void Load(){try{if(File.Exists(PathName)){var saved=JsonUtility.FromJson<MatchResults>(File.ReadAllText(PathName));matches=saved?.matches??new List<MatchResult>();matches.RemoveAll(m=>m==null);if(matches.Count>200)matches=matches.GetRange(matches.Count-200,200);}}catch(Exception e){Debug.LogWarning("Results could not be loaded: "+e.Message);}}
        public void Add(string mode,int blue,int red,int winner,string result)
        {
            matches.Add(new MatchResult{mode=mode,blue=blue,red=red,winner=winner,result=result,ended=DateTime.UtcNow.ToString("u")});
            if(matches.Count>200)matches.RemoveAt(0);
            try{Directory.CreateDirectory(Application.persistentDataPath);string temp=PathName+".tmp";File.WriteAllText(temp,JsonUtility.ToJson(this,true));if(File.Exists(PathName))File.Copy(temp,PathName,true);else File.Move(temp,PathName);if(File.Exists(temp))File.Delete(temp);}
            catch(Exception e){Debug.LogWarning("Results could not be saved: "+e.Message);}
        }
        public string Tally(string mode)
        {int a=0,b=0,d=0;foreach(var m in matches)if(m!=null&&m.mode==mode){if(m.winner==0)a++;else if(m.winner==1)b++;else d++;}return (mode=="Chess"?"White":"Blue")+" "+a+" wins · "+(mode=="Chess"?"Black":"Red")+" "+b+" wins · "+d+" draws";}
    }
}

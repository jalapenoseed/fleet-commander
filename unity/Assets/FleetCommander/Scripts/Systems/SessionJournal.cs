using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
namespace FleetCommander.Systems
{
    [Serializable] public sealed class SessionJournal
    {
        public List<string> entries=new List<string>();
        public void Add(string text){entries.Add(DateTime.UtcNow.ToString("u")+"  "+text);while(entries.Count>100)entries.RemoveAt(0);Save();}
        string Path => System.IO.Path.Combine(Application.persistentDataPath,"journal.json");
        public void Save(){Directory.CreateDirectory(Application.persistentDataPath);File.WriteAllText(Path,JsonUtility.ToJson(this,true));}
        public void Load(){if(File.Exists(Path)){var s=JsonUtility.FromJson<SessionJournal>(File.ReadAllText(Path));if(s?.entries!=null)entries=s.entries;}}
    }
}

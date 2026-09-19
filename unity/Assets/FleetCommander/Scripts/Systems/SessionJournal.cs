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
        // Automated player checks must not append test rounds to the player's real journal.
        string DirectoryPath => Array.IndexOf(Environment.GetCommandLineArgs(),"-fleetSmoke")>=0
            ? System.IO.Path.Combine(RuntimeSmoke.Argument("-fleetQA",System.IO.Path.Combine(Application.persistentDataPath,"QA")),"Session")
            : Application.persistentDataPath;
        string Path => System.IO.Path.Combine(DirectoryPath,"journal.json");
        public void Save(){Directory.CreateDirectory(DirectoryPath);File.WriteAllText(Path,JsonUtility.ToJson(this,true));}
        public void Load(){if(File.Exists(Path)){var s=JsonUtility.FromJson<SessionJournal>(File.ReadAllText(Path));if(s?.entries!=null)entries=s.entries;}}
    }
}

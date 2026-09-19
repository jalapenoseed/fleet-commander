using System;
using System.Collections;
using System.IO;
using FleetCommander.Core;
using FleetCommander.Cameras;
using FleetCommander.UI;
using UnityEngine;
namespace FleetCommander.Systems
{
    // Opt-in executable QA: exercises the assembled player, captures real GPU frames, then exits.
    public sealed class RuntimeSmoke : MonoBehaviour
    {
        int errors;string output;
        void OnEnable(){Application.logMessageReceived+=Log;}
        void OnDisable(){Application.logMessageReceived-=Log;}
        void Log(string text,string trace,LogType type){if(type==LogType.Exception||type==LogType.Error||type==LogType.Assert)errors++;}
        IEnumerator Start()
        {
            output=Argument("-fleetQA",Path.Combine(Application.persistentDataPath,"QA"));Directory.CreateDirectory(output);
            yield return null;yield return null;
            var sim=GetComponent<SwarmSimulator>();var ui=GetComponent<CommanderUI>();var rig=FindFirstObjectByType<DroneCameraRig>();
            foreach(string page in "Fleet,Squads,Fields,Arena,Director,Art Studio,Program,Physics,Nerd Lab,Replays,Journal,Saves,Help".Split(',')){ui.OpenPage(page);yield return null;}
            ui.OpenPage("Fleet");sim.Paused=true;for(int i=0;i<720;i++)sim.Tick(SwarmSimulator.FixedStep);
            rig.Fit();yield return new WaitForSecondsRealtime(2);yield return Capture("show.png");
            foreach(CameraMode mode in Enum.GetValues(typeof(CameraMode))){rig.Mode=mode;yield return null;}
            rig.Mode=CameraMode.Mounted;yield return new WaitForSecondsRealtime(.3f);yield return Capture("mounted.png");
            sim.StartBattle(16);sim.Paused=true;for(int i=0;i<480;i++)sim.Tick(SwarmSimulator.FixedStep);ui.OpenPage("Arena");rig.Mode=CameraMode.Action;
            yield return new WaitForSecondsRealtime(1);yield return Capture("arena.png");
            sim.Replay.Play();ui.OpenPage("Replays");yield return new WaitForSecondsRealtime(.2f);yield return Capture("replay.png");sim.ExitReplay();
            sim.EndBattle();sim.Resize(2000);sim.LaunchAll();sim.Paused=true;var watch=System.Diagnostics.Stopwatch.StartNew();for(int i=0;i<60;i++)sim.Tick(SwarmSimulator.FixedStep);watch.Stop();
            ui.OpenPage("Fleet");rig.Fit();yield return new WaitForSecondsRealtime(1);yield return Capture("2000-drones.png");
            File.WriteAllText(Path.Combine(output,"runtime-smoke.json"),"{\"errors\":"+errors+",\"drones\":2000,\"sixtySimulationStepsMs\":"+watch.ElapsedMilliseconds+",\"graphicsDevice\":\""+SystemInfo.graphicsDeviceName.Replace("\"","")+"\"}");
            Debug.Log("FLEET_RUNTIME_SMOKE errors="+errors+" 2000-drone-60-steps-ms="+watch.ElapsedMilliseconds);Application.Quit(errors==0?0:1);
        }
        IEnumerator Capture(string name){yield return new WaitForEndOfFrame();var tex=ScreenCapture.CaptureScreenshotAsTexture();File.WriteAllBytes(Path.Combine(output,name),tex.EncodeToPNG());Destroy(tex);}
        public static string Argument(string key,string fallback){var a=Environment.GetCommandLineArgs();int i=Array.IndexOf(a,key);return i>=0&&i+1<a.Length?a[i+1]:fallback;}
    }
}

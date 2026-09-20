using System;
using System.Collections;
using System.IO;
using System.Collections.Generic;
using FleetCommander.Games;
using FleetCommander.Core;
using UnityEngine;
using UnityEngine.Networking;
namespace FleetCommander.Systems
{
    public sealed class FleetAudio : MonoBehaviour
    {
        public SwarmSimulator Simulator;
        public float Volume=.35f,EffectsVolume=.7f,MusicVolume=.7f,MotorVolume=.15f,AmbienceVolume=.3f;
        public int EffectsPlayed {get;private set;}
        public int LoadedEffects=>clips.Count;
        readonly Dictionary<string,AudioClip> clips=new Dictionary<string,AudioClip>();
        AudioSource effects,ambience;float lastBattleSound;int oldScore,oldMoves,oldAirborne;SportsMatch sport;DroneRangeGame range;FleetWorld lastWorld;
        public bool Muted,Sequencer;
        public bool[] Steps={true,false,false,false,true,false,true,false,true,false,false,false,true,false,true,false};
        public int CurrentStep {get;private set;}
        AudioSource motor,music,beat;AudioClip motorClip,beatClip;float beatClock;
        public string MusicName {get;private set;}="No track loaded";
        void Start()
        {
            foreach(string name in new[]{"ui","laser","impact","net","water","win","penalty","goal","launch","chess","hit"}){var clip=Resources.Load<AudioClip>("Audio/"+name);if(clip)clips[name]=clip;}
            effects=gameObject.AddComponent<AudioSource>();effects.playOnAwake=false;effects.spatialBlend=0;
            ambience=gameObject.AddComponent<AudioSource>();ambience.loop=true;ambience.spatialBlend=0;if(clips.TryGetValue("water",out var water)){ambience.clip=water;ambience.Play();}
            Simulator.OnBattleEvent+=BattleSound;
            motor=gameObject.AddComponent<AudioSource>();motor.loop=true;motor.spatialBlend=0;
            var data=new float[48000];for(int i=0;i<data.Length;i++){float t=i/48000f;data[i]=(Mathf.Sin(t*188.49556f)+Mathf.Sin(t*376.99112f)*.23f)*.13f;}
            motorClip=AudioClip.Create("Soft motor bed",data.Length,1,48000,false);motorClip.SetData(data,0);motor.clip=motorClip;motor.Play();
            var m=new GameObject("User music");m.transform.SetParent(transform);music=m.AddComponent<AudioSource>();music.loop=true;
            var b=new GameObject("Step synth");b.transform.SetParent(transform);beat=b.AddComponent<AudioSource>();
            var hit=new float[12000];for(int i=0;i<hit.Length;i++){float t=i/48000f;hit[i]=Mathf.Sin(2*Mathf.PI*(95*t-80*t*t))*Mathf.Exp(-t*22)*.6f;}
            beatClip=AudioClip.Create("Step hit",hit.Length,1,48000,false);beatClip.SetData(hit,0);
        }
        void Update()
        {
            if(motor==null||Simulator==null)return;float volume=Muted?0:Volume;var c=Simulator.Replay.Playing?Simulator.Replay.DisplayConfig:Simulator.Config;
            int active=0;var roster=Simulator.Replay.Playing?Simulator.Replay.Display:Simulator.Active.States;foreach(var d in roster)if(d.airborne)active++;
            motor.volume=volume*MotorVolume*(c.planet==PlanetKind.Moon?0:c.planet==PlanetKind.Mars?.15f:1)*Mathf.Clamp01(active/20f)*.4f;
            motor.pitch=.8f+Mathf.Sin(Time.time*.27f)*.025f;music.volume=volume*MusicVolume;beat.volume=volume*MusicVolume;effects.volume=volume*EffectsVolume;
            bool waterScene=c.scenery==SceneryKind.Coast||c.scenery==SceneryKind.Creek||c.scenery==SceneryKind.Harbor||c.scenery==SceneryKind.ForestLake;ambience.volume=waterScene&&Simulator.Chess==null?volume*AmbienceVolume:.0f;
            if(lastWorld!=Simulator.Active){lastWorld=Simulator.Active;oldAirborne=active;}else if(oldAirborne==0&&active>0)PlayFx("launch");oldAirborne=active;
            if(sport!=Simulator.Sports){sport=Simulator.Sports;oldScore=sport==null?0:sport.BlueScore+sport.RedScore;}if(sport!=null&&oldScore!=sport.BlueScore+sport.RedScore){PlayFx("goal");oldScore=sport.BlueScore+sport.RedScore;}
            if(range!=Simulator.Range){if(range!=null)range.OnEvent-=RangeSound;range=Simulator.Range;if(range!=null)range.OnEvent+=RangeSound;}
            int moves=Simulator.Chess?.History.Count??0;if(moves>oldMoves)PlayFx("chess");oldMoves=moves;
            if(Sequencer&&!Simulator.Paused&&!Simulator.Replay.Playing){beatClock+=Time.deltaTime;float interval=60/c.bpm/4;if(beatClock>=interval){beatClock%=interval;CurrentStep=(CurrentStep+1)%16;if(Steps[CurrentStep])beat.PlayOneShot(beatClip);}}
        }
        public IEnumerator LoadMusic(string path,Action<string> done)
        {
            if(!File.Exists(path)){done("Audio file not found.");yield break;}
            string ext=Path.GetExtension(path).ToLowerInvariant();AudioType type=ext==".wav"?AudioType.WAV:ext==".ogg"?AudioType.OGGVORBIS:ext==".mp3"?AudioType.MPEG:AudioType.UNKNOWN;
            if(type==AudioType.UNKNOWN){done("Use WAV, OGG or MP3.");yield break;}
            using(var request=UnityWebRequestMultimedia.GetAudioClip(new Uri(Path.GetFullPath(path)).AbsoluteUri,type))
            {
                yield return request.SendWebRequest();
                if(request.result!=UnityWebRequest.Result.Success){done(request.error);yield break;}
                if(music.clip)Destroy(music.clip);music.clip=DownloadHandlerAudioClip.GetContent(request);music.Play();MusicName=Path.GetFileName(path);done("Playing "+MusicName);
            }
        }
        public bool PlayFx(string name)
        {if(!effects||!clips.TryGetValue(name,out var clip))return false;effects.volume=Muted?0:Volume*EffectsVolume;effects.PlayOneShot(clip);EffectsPlayed++;return true;}
        void BattleSound(BattleEvent e){if(Time.unscaledTime-lastBattleSound<.055f&&!e.destruction)return;lastBattleSound=Time.unscaledTime;PlayFx(e.destruction?"impact":e.impact?"hit":"laser");}
        void RangeSound(RangeEvent e,Vector3 from,Vector3 to){PlayFx(e==RangeEvent.Complete?"win":e==RangeEvent.Penalty?"penalty":e==RangeEvent.Hit?"hit":e==RangeEvent.Shot?"laser":"ui");}
        public void StopMusic(){if(music)music.Stop();}
        public void ResetDefaults()
        {
            Muted=false;Volume=.35f;EffectsVolume=.7f;MusicVolume=.7f;MotorVolume=.15f;AmbienceVolume=.3f;Sequencer=false;Steps=new[]{true,false,false,false,true,false,true,false,true,false,false,false,true,false,true,false};
            CurrentStep=0;beatClock=0;StopMusic();if(beat)beat.Stop();
        }
        void OnDestroy(){if(Simulator)Simulator.OnBattleEvent-=BattleSound;if(range!=null)range.OnEvent-=RangeSound;if(motorClip)Destroy(motorClip);if(beatClip)Destroy(beatClip);if(music&&music.clip)Destroy(music.clip);}
    }
}

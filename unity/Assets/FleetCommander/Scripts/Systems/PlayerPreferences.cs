using System;
using System.IO;
using FleetCommander.Cameras;
using FleetCommander.Rendering;
using UnityEngine;
namespace FleetCommander.Systems
{
    [Serializable] public sealed class PlayerPreferences
    {
        public float master=.35f,effects=.7f,music=.7f,motor=.15f,ambience=.3f,fov=58,sensitivity=2;
        public bool muted,bloom=true,health=true,target=true,shadows=true,vsync=true;
        public int frameRate=60,modelQuality=1;public float shake=.3f,hitstop=.5f;public bool stack=true;
        static string PathName=>Path.Combine(Application.persistentDataPath,"player-settings.json");
        public static PlayerPreferences Load(){if(!RuntimeSmoke.Running&&File.Exists(PathName)){try{return JsonUtility.FromJson<PlayerPreferences>(File.ReadAllText(PathName))??new PlayerPreferences();}catch(Exception e){Debug.LogWarning("Settings: "+e.Message);}}return new PlayerPreferences();}
        public void Apply(FleetAudio audio,DronePilot pilot,Camera camera,DroneRenderer render,LabRenderer lab)
        {
            master=Mathf.Clamp01(master);effects=Mathf.Clamp01(effects);music=Mathf.Clamp01(music);motor=Mathf.Clamp01(motor);ambience=Mathf.Clamp01(ambience);fov=Mathf.Clamp(fov,40,100);sensitivity=Mathf.Clamp(sensitivity,.2f,5);frameRate=frameRate==30||frameRate==120?frameRate:60;
            audio.Volume=master;audio.Muted=muted;audio.EffectsVolume=effects;audio.MusicVolume=music;audio.MotorVolume=motor;audio.AmbienceVolume=ambience;pilot.MouseSensitivity=sensitivity;camera.fieldOfView=fov;camera.GetComponent<FleetBloom>().enabled=bloom;render.ShowHealth=health;render.Quality=Mathf.Clamp(modelQuality,0,2);render.Simulator.HitstopStrength=Mathf.Clamp01(hitstop);camera.GetComponent<DroneCameraRig>().ShakeStrength=Mathf.Clamp01(shake);lab.ShowTarget=target;QualitySettings.shadows=shadows?ShadowQuality.All:ShadowQuality.Disable;QualitySettings.vSyncCount=vsync?1:0;Application.targetFrameRate=frameRate;
        }
        public void Save(){Directory.CreateDirectory(Application.persistentDataPath);File.WriteAllText(PathName,JsonUtility.ToJson(this,true));}
    }
}

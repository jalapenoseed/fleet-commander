using FleetCommander.Core;
using FleetCommander.Cameras;
using FleetCommander.Rendering;
using FleetCommander.Systems;
using FleetCommander.UI;
using UnityEngine;
namespace FleetCommander
{
    public sealed class FleetBootstrap : MonoBehaviour
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot(){if(FindFirstObjectByType<FleetBootstrap>()==null)new GameObject("Fleet Commander").AddComponent<FleetBootstrap>();}
        void Awake()
        {
            Application.targetFrameRate=60;Application.runInBackground=true;
            var sim=gameObject.AddComponent<SwarmSimulator>();
            var old=Camera.main;if(old)old.gameObject.SetActive(false);
            var cameraObject=new GameObject("Director camera");cameraObject.tag="MainCamera";cameraObject.transform.SetParent(transform);
            var camera=cameraObject.AddComponent<Camera>();camera.fieldOfView=58;camera.nearClipPlane=.04f;camera.farClipPlane=2500;camera.allowHDR=true;camera.allowMSAA=true;camera.clearFlags=CameraClearFlags.Skybox;cameraObject.AddComponent<AudioListener>();
            var rig=cameraObject.AddComponent<DroneCameraRig>();rig.Simulator=sim;
            var environment=new GameObject("Arena environment");environment.transform.SetParent(transform);environment.AddComponent<ArenaEnvironment>().Simulator=sim;
            gameObject.AddComponent<DroneRenderer>().Simulator=sim;gameObject.AddComponent<BattleEffects>().Simulator=sim;
            var sound=gameObject.AddComponent<FleetAudio>();sound.Simulator=sim;
            var ui=gameObject.AddComponent<CommanderUI>();ui.Simulator=sim;ui.Rig=rig;ui.Audio=sound;rig.UI=ui;
            cameraObject.AddComponent<FleetBloom>();
            if(System.Array.IndexOf(System.Environment.GetCommandLineArgs(),"-fleetSmoke")>=0)gameObject.AddComponent<RuntimeSmoke>();
        }
    }
}

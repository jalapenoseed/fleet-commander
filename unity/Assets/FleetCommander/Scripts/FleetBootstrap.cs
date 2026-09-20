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
            bool mobile=Application.isMobilePlatform || System.Array.IndexOf(System.Environment.GetCommandLineArgs(),"-mobilePreview")>=0;
            Application.targetFrameRate=60;Application.runInBackground=!mobile;
            var sim=gameObject.AddComponent<SwarmSimulator>();
            var old=Camera.main;if(old)old.gameObject.SetActive(false);
            var cameraObject=new GameObject("Director camera");cameraObject.tag="MainCamera";cameraObject.transform.SetParent(transform);
            var camera=cameraObject.AddComponent<Camera>();camera.fieldOfView=58;camera.nearClipPlane=.04f;camera.farClipPlane=mobile?1800:2500;camera.allowHDR=!mobile;camera.allowMSAA=true;camera.clearFlags=CameraClearFlags.Skybox;cameraObject.AddComponent<AudioListener>();
            var rig=cameraObject.AddComponent<DroneCameraRig>();rig.Simulator=sim;
            var environment=new GameObject("Arena environment");environment.transform.SetParent(transform);environment.AddComponent<ArenaEnvironment>().Simulator=sim;
            gameObject.AddComponent<DroneRenderer>().Simulator=sim;gameObject.AddComponent<BattleEffects>().Simulator=sim;
            gameObject.AddComponent<WeatherRenderer>().Simulator=sim;
            var sound=gameObject.AddComponent<FleetAudio>();sound.Simulator=sim;
            var ui=gameObject.AddComponent<CommanderUI>();ui.Simulator=sim;ui.Rig=rig;ui.Audio=sound;rig.UI=ui;
            var mobileProfile=gameObject.AddComponent<MobileRuntimeProfile>();mobileProfile.ForceMobilePreview=mobile&&!Application.isMobilePlatform;
            var mobileControls=gameObject.AddComponent<MobileControls>();mobileControls.ForceMobilePreview=mobile&&!Application.isMobilePlatform;
            var pilot=gameObject.AddComponent<DronePilot>();pilot.Simulator=sim;pilot.Rig=rig;pilot.UI=ui;pilot.Mobile=mobileControls;rig.Pilot=pilot;ui.Pilot=pilot;mobileControls.Pilot=pilot;
            cameraObject.AddComponent<FleetBloom>();
            if(System.Array.IndexOf(System.Environment.GetCommandLineArgs(),"-fleetSmoke")>=0)gameObject.AddComponent<RuntimeSmoke>();
        }
    }
}

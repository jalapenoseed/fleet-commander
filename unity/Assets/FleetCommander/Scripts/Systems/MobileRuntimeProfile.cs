using UnityEngine;

namespace FleetCommander.Systems
{
    [DefaultExecutionOrder(-100)]
    public sealed class MobileRuntimeProfile : MonoBehaviour
    {
        public bool ForceMobilePreview;
        public int TargetFrameRate=60;
        public int MaxQualityLevel=2;
        public bool AdaptiveQuality=true;

        bool commandLinePreview;
        float smoothedFps=60,nextQualityCheck;

        public bool Active => Application.isMobilePlatform || ForceMobilePreview || commandLinePreview;

        void Awake()
        {
            foreach(var arg in System.Environment.GetCommandLineArgs())
                if(arg=="-mobilePreview")commandLinePreview=true;
            if(!Active)return;

            Application.targetFrameRate=TargetFrameRate;
            Application.runInBackground=false;
            QualitySettings.vSyncCount=0;
            if(QualitySettings.GetQualityLevel()>MaxQualityLevel)
                QualitySettings.SetQualityLevel(MaxQualityLevel,true);
            Screen.sleepTimeout=SleepTimeout.NeverSleep;
            Input.multiTouchEnabled=true;

            Screen.orientation=ScreenOrientation.AutoRotation;
            Screen.autorotateToLandscapeLeft=true;
            Screen.autorotateToLandscapeRight=true;
            Screen.autorotateToPortrait=false;
            Screen.autorotateToPortraitUpsideDown=false;
        }

        void Start()
        {
            if(!Active)return;
            var camera=Camera.main;
            if(camera!=null)
            {
                camera.allowHDR=false;
                camera.allowMSAA=true;
                camera.farClipPlane=Mathf.Min(camera.farClipPlane,1800);
            }
        }

        void Update()
        {
            if(!Active||!AdaptiveQuality)return;
            float fps=1f/Mathf.Max(.001f,Time.unscaledDeltaTime);
            smoothedFps=Mathf.Lerp(smoothedFps,fps,1-Mathf.Exp(-Time.unscaledDeltaTime*2));
            if(Time.unscaledTime<nextQualityCheck)return;
            nextQualityCheck=Time.unscaledTime+4;

            int quality=QualitySettings.GetQualityLevel();
            if(smoothedFps<38 && quality>0)QualitySettings.SetQualityLevel(quality-1,true);
            else if(smoothedFps>57 && quality<MaxQualityLevel)QualitySettings.SetQualityLevel(quality+1,true);
        }
    }
}

using UnityEngine;

namespace FleetCommander.Systems
{
    [DefaultExecutionOrder(-30)]
    public sealed class MobileControls : MonoBehaviour
    {
        public DronePilot Pilot;
        public bool ForceMobilePreview;
        public bool ShowOverlay=true;
        public float LookDegreesPerPixel=.16f;
        public Vector2 Move { get; private set; }
        public Vector2 LookDelta { get; private set; }
        public bool FireHeld { get; private set; }
        public bool BoostHeld { get; private set; }
        public bool AscendHeld { get; private set; }
        public bool DescendHeld { get; private set; }

        bool payloadPressed,viewPressed,commandLinePreview;
        public bool Active => Application.isMobilePlatform || ForceMobilePreview || commandLinePreview;
        public bool FlightActive => Active && Pilot!=null && Pilot.IsPiloting;

        void Awake()
        {
            foreach(var arg in System.Environment.GetCommandLineArgs())
                if(arg=="-mobilePreview")commandLinePreview=true;
            Input.multiTouchEnabled=true;
            if(Active)ConfigureOrientation();
        }

        void ConfigureOrientation()
        {
            Screen.orientation=ScreenOrientation.AutoRotation;
            Screen.autorotateToLandscapeLeft=true;
            Screen.autorotateToLandscapeRight=true;
            Screen.autorotateToPortrait=false;
            Screen.autorotateToPortraitUpsideDown=false;
        }

        void Update()
        {
            LookDelta=Vector2.zero;
            payloadPressed=false;
            viewPressed=false;
            ResetHeld();
            if(!FlightActive)return;
            ProcessTouches();
        }

        void ResetHeld()
        {
            Move=Vector2.zero;
            FireHeld=false;
            BoostHeld=false;
            AscendHeld=false;
            DescendHeld=false;
        }

        void ProcessTouches()
        {
            var safe=Screen.safeArea;
            float min=Mathf.Min(safe.width,safe.height);
            float stickRadius=Mathf.Clamp(min*.105f,64,110);
            float buttonRadius=Mathf.Clamp(min*.055f,36,62);
            Vector2 stickCenter=new Vector2(safe.xMin+stickRadius*1.25f,safe.yMin+stickRadius*1.25f);
            Vector2 fireCenter=new Vector2(safe.xMax-buttonRadius*1.35f,safe.yMin+buttonRadius*1.35f);
            Vector2 boostCenter=new Vector2(fireCenter.x-buttonRadius*2.1f,fireCenter.y);
            Vector2 upCenter=new Vector2(fireCenter.x,fireCenter.y+buttonRadius*2.15f);
            Vector2 downCenter=new Vector2(boostCenter.x,boostCenter.y+buttonRadius*2.15f);
            Vector2 pulseCenter=new Vector2(safe.xMax-buttonRadius*1.35f,safe.yMax-buttonRadius*1.45f);
            Vector2 viewCenter=new Vector2(pulseCenter.x-buttonRadius*2.15f,pulseCenter.y);

            bool moveAssigned=false,lookAssigned=false;
            for(int i=0;i<Input.touchCount;i++)
            {
                var touch=Input.GetTouch(i);
                if(touch.phase==TouchPhase.Ended||touch.phase==TouchPhase.Canceled)continue;
                Vector2 p=touch.position;
                if(InCircle(p,fireCenter,buttonRadius)){FireHeld=true;continue;}
                if(InCircle(p,boostCenter,buttonRadius)){BoostHeld=true;continue;}
                if(InCircle(p,upCenter,buttonRadius)){AscendHeld=true;continue;}
                if(InCircle(p,downCenter,buttonRadius)){DescendHeld=true;continue;}
                if(InCircle(p,pulseCenter,buttonRadius))
                {
                    if(touch.phase==TouchPhase.Began)payloadPressed=true;
                    continue;
                }
                if(InCircle(p,viewCenter,buttonRadius))
                {
                    if(touch.phase==TouchPhase.Began)viewPressed=true;
                    continue;
                }

                if(!moveAssigned && p.x<safe.center.x && p.y<safe.yMin+safe.height*.58f)
                {
                    Move=Vector2.ClampMagnitude((p-stickCenter)/stickRadius,1);
                    moveAssigned=true;
                    continue;
                }
                if(!lookAssigned && p.x>=safe.center.x && p.y<safe.yMin+safe.height*.78f)
                {
                    LookDelta+=touch.deltaPosition*LookDegreesPerPixel;
                    lookAssigned=true;
                }
            }
        }

        static bool InCircle(Vector2 point,Vector2 center,float radius)=>(point-center).sqrMagnitude<=radius*radius;
        public bool ConsumePayload(){bool value=payloadPressed;payloadPressed=false;return value;}
        public bool ConsumeView(){bool value=viewPressed;viewPressed=false;return value;}

        Rect GuiCircle(Vector2 center,float radius)
        {
            return new Rect(center.x-radius,Screen.height-center.y-radius,radius*2,radius*2);
        }

        void OnGUI()
        {
            if(!FlightActive||!ShowOverlay)return;
            var safe=Screen.safeArea;
            float min=Mathf.Min(safe.width,safe.height);
            float stickRadius=Mathf.Clamp(min*.105f,64,110);
            float buttonRadius=Mathf.Clamp(min*.055f,36,62);
            Vector2 stickCenter=new Vector2(safe.xMin+stickRadius*1.25f,safe.yMin+stickRadius*1.25f);
            Vector2 fireCenter=new Vector2(safe.xMax-buttonRadius*1.35f,safe.yMin+buttonRadius*1.35f);
            Vector2 boostCenter=new Vector2(fireCenter.x-buttonRadius*2.1f,fireCenter.y);
            Vector2 upCenter=new Vector2(fireCenter.x,fireCenter.y+buttonRadius*2.15f);
            Vector2 downCenter=new Vector2(boostCenter.x,boostCenter.y+buttonRadius*2.15f);
            Vector2 pulseCenter=new Vector2(safe.xMax-buttonRadius*1.35f,safe.yMax-buttonRadius*1.45f);
            Vector2 viewCenter=new Vector2(pulseCenter.x-buttonRadius*2.15f,pulseCenter.y);

            GUI.Box(GuiCircle(stickCenter,stickRadius),"MOVE");
            GUI.Box(GuiCircle(fireCenter,buttonRadius),"FIRE");
            GUI.Box(GuiCircle(boostCenter,buttonRadius),"BOOST");
            GUI.Box(GuiCircle(upCenter,buttonRadius),"UP");
            GUI.Box(GuiCircle(downCenter,buttonRadius),"DOWN");
            GUI.Box(GuiCircle(pulseCenter,buttonRadius),"PULSE");
            GUI.Box(GuiCircle(viewCenter,buttonRadius),"CAM");

            var look=new Rect(safe.center.x,Screen.height-(safe.yMin+safe.height*.78f),safe.width*.48f,safe.height*.45f);
            GUI.Label(look,"LOOK");
        }
    }
}

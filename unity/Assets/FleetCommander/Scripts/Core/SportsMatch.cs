using System;
using UnityEngine;

namespace FleetCommander.Core
{
    public enum SportKind { CaptureTheFlag, Soccer, FlagFootball }
    public enum SportFormation { Balanced, Wide, Diamond, Defensive, Custom }
    public enum SportRole { Runner, Support, Defender }
    [Serializable] public sealed class SportsRoster
    {
        public SportFormation formation;
        public FrameKind[] frames = { FrameKind.Scout, FrameKind.Relay, FrameKind.Cargo, FrameKind.Utility, FrameKind.Scout };
        public SportRole[] roles = { SportRole.Runner, SportRole.Runner, SportRole.Support, SportRole.Defender, SportRole.Defender };
        public Vector2[] slots = { new Vector2(-8,0),new Vector2(-14,16),new Vector2(-14,-16),new Vector2(-30,12),new Vector2(-36,-10) };
        public SkinKind skin = SkinKind.Cobalt;
        public SportsRoster Clone() => new SportsRoster { formation=formation,skin=skin,frames=(FrameKind[])frames.Clone(),roles=(SportRole[])roles.Clone(),slots=(Vector2[])slots.Clone() };
        public Vector3 Slot(int index,int team)
        {
            Vector2 p=slots[index];
            if(formation==SportFormation.Wide)p=new Vector2(-10-index*6,(index-2)*12);
            if(formation==SportFormation.Diamond)p=new[]{new Vector2(-6,0),new Vector2(-20,19),new Vector2(-20,-19),new Vector2(-34,0),new Vector2(-43,0)}[index];
            if(formation==SportFormation.Defensive)p=new Vector2(-24-index*5,(index-2)*10);
            if(formation==SportFormation.Balanced)p=new[]{new Vector2(-8,0),new Vector2(-14,16),new Vector2(-14,-16),new Vector2(-30,12),new Vector2(-36,-10)}[index];
            return new Vector3(p.x*(team==0?1:-1),2.5f,p.y);
        }
    }
    [Serializable] public sealed class SportsSettings
    {
        public SportKind sport;
        public float seconds=180;
        public int targetScore=3;
        public SportsRoster blue=new SportsRoster(),red=new SportsRoster { skin=SkinKind.Crimson };
        public SportsSettings Clone()=>new SportsSettings{sport=sport,seconds=seconds,targetScore=targetScore,blue=blue.Clone(),red=red.Clone()};
        public void Validate()
        {
            if(!Enum.IsDefined(typeof(SportKind),sport)||float.IsNaN(seconds)||float.IsInfinity(seconds)||seconds<10||seconds>1800||targetScore<1||targetScore>99)throw new ArgumentException("Invalid sports rules.");
            foreach(var roster in new[]{blue,red})
            {
                if(roster==null||roster.frames==null||roster.roles==null||roster.slots==null||roster.frames.Length!=5||roster.roles.Length!=5||roster.slots.Length!=5||!Enum.IsDefined(typeof(SportFormation),roster.formation)||!Enum.IsDefined(typeof(SkinKind),roster.skin))throw new ArgumentException("Each sports team needs five valid slots.");
                for(int i=0;i<5;i++)if(!Enum.IsDefined(typeof(FrameKind),roster.frames[i])||!Enum.IsDefined(typeof(SportRole),roster.roles[i])||!FleetConfig.Finite(new Vector3(roster.slots[i].x,0,roster.slots[i].y))||roster.slots[i].x>0||roster.slots[i].x< -46||Mathf.Abs(roster.slots[i].y)>27)throw new ArgumentException("Sports slots must stay in their own half.");
            }
        }
    }
    // Self-contained, scripted sports rules. No battle controller, damage, or learned tactics.
    public sealed class SportsMatch
    {
        public readonly SportsSettings Settings;
        public readonly FleetWorld World;
        public int BlueScore {get;private set;}
        public int RedScore {get;private set;}
        public float Elapsed {get;private set;}
        public float Remaining=>Mathf.Max(0,Settings.seconds-Elapsed);
        public int Winner {get;private set;}=-1;
        public bool Ended=>Winner>=0;
        public string Event {get;private set;}="Kickoff";
        public Vector3 Ball;
        public Vector3 BallVelocity;
        public readonly int[] FlagCarrier={-1,-1}; // index of carrier of each team's flag
        public int Possession {get;private set;}
        public int Carrier {get;private set;}=-1;
        public int Down {get;private set;}=1;
        public float Scrimmage {get;private set;}=-30;
        public float FirstDownLine {get;private set;}=-10;
        public float PlayRemaining=>Mathf.Max(0,20-playTime);
        readonly float[] waiting=new float[10];
        float restart=1.2f,kickCooldown,playTime,passTime;
        int passTarget=-1;bool passed;
        public SportsMatch(SportsSettings settings)
        {
            settings.Validate();Settings=settings.Clone();
            World=new FleetWorld(new FleetConfig{scenery=SceneryKind.Stadium,sky=SkyKind.Day,unlimited=true,obstacles=false,boids=false},10);
            for(int i=0;i<10;i++)
            {
                var roster=i<5?Settings.blue:Settings.red;
                var state=DroneState.Create(i,i/5,roster.Slot(i%5,i/5));state.frame=roster.frames[i%5];state.skin=roster.skin;state.palette=i<5?0:4;state.phase=FlightPhase.Flying;World.States[i]=state;
            }
            ResetPositions();if(Settings.sport==SportKind.FlagFootball)BeginDrive(0,-30);
        }
        public static Vector3 Base(int team)=>new Vector3(team==0?-46:46,2.5f,0);
        void ResetPositions()
        {
            for(int i=0;i<10;i++){var s=World.States[i];s.position=(i<5?Settings.blue:Settings.red).Slot(i%5,i/5);s.velocity=Vector3.zero;s.rotation=Quaternion.LookRotation(i<5?Vector3.right:Vector3.left);World.States[i]=s;waiting[i]=0;}
            Ball=new Vector3(0,1.2f,0);BallVelocity=Vector3.zero;FlagCarrier[0]=FlagCarrier[1]=-1;restart=1.2f;kickCooldown=.3f;
        }
        public void Step(float dt)
        {
            if(Ended||float.IsNaN(dt)||float.IsInfinity(dt)||dt<=0)return;dt=Mathf.Min(dt,.1f);
            Elapsed=Mathf.Min(Settings.seconds,Elapsed+dt);
            if(Remaining<=0){Finish();return;}
            kickCooldown=Mathf.Max(0,kickCooldown-dt);
            if(restart>0){restart-=dt;return;}
            for(int i=0;i<10;i++)waiting[i]=Mathf.Max(0,waiting[i]-dt);
            MovePlayers(dt);
            switch(Settings.sport){case SportKind.Soccer:Soccer(dt);break;case SportKind.CaptureTheFlag:Flags();break;case SportKind.FlagFootball:Football(dt);break;}
        }
        int Nearest(int team,Vector3 position,bool available=true)
        {
            int best=-1;float distance=float.MaxValue;
            for(int i=team*5;i<team*5+5;i++){if(available&&waiting[i]>0)continue;float d=(World.States[i].position-position).sqrMagnitude;if(d<distance){distance=d;best=i;}}
            return best;
        }
        void MovePlayers(float dt)
        {
            for(int i=0;i<10;i++)
            {
                int team=i/5,other=1-team,dir=team==0?1:-1;var roster=team==0?Settings.blue:Settings.red;var state=World.States[i];Vector3 target=roster.Slot(i%5,team);
                if(waiting[i]>0){state.velocity=Vector3.zero;World.States[i]=state;continue;}
                if(Settings.sport==SportKind.Soccer)
                {
                    if(i==Nearest(team,Ball))target=Ball;
                    else if(roster.roles[i%5]==SportRole.Defender)target=new Vector3(-dir*39,2.5f,Mathf.Clamp(Ball.z*.65f+(i%2==0?6:-6),-24,24));
                    else target+=new Vector3(Mathf.Clamp(Ball.x,-20,20),0,Mathf.Sin(Elapsed*.4f+i)*4);
                }
                else if(Settings.sport==SportKind.CaptureTheFlag)
                {
                    if(FlagCarrier[other]==i)target=Base(team);
                    else if(FlagCarrier[team]>=0&&(roster.roles[i%5]==SportRole.Defender||i==Nearest(team,World.States[FlagCarrier[team]].position)))target=World.States[FlagCarrier[team]].position;
                    else if(roster.roles[i%5]==SportRole.Runner)target=FlagCarrier[other]<0?Base(other):World.States[FlagCarrier[other]].position+new Vector3(0,0,(i%2==0?5:-5));
                    else target=new Vector3(target.x,2.5f,Mathf.Sin(Elapsed*.5f+i)*12);
                }
                else
                {
                    if(i==Carrier)target=new Vector3(dir*53,2.5f,state.position.z+Mathf.Sin(Elapsed+i)*2);
                    else if(team!=Possession)
                    {
                        Vector3 objective=Carrier>=0?World.States[Carrier].position:Ball;
                        int pursuer=Nearest(team,objective);
                        target=i==pursuer?objective:new Vector3(Mathf.Clamp(Scrimmage-dir*(16+i%5*4),-47,47),2.5f,(i%5-2)*10);
                    }
                    else target=new Vector3(Mathf.Clamp(Scrimmage+dir*(10+i%5*5),-47,47),2.5f,(i%5-2)*10);
                }
                target.y=2.5f;target.z=Mathf.Clamp(target.z,-28,28);
                Vector3 direction=target-state.position;direction.y=0;
                // Small separation keeps sports lanes and aircraft readable.
                for(int j=0;j<10;j++)if(i!=j){Vector3 away=state.position-World.States[j].position;float d=away.magnitude;if(d>.01f&&d<2)direction+=away.normalized*(2-d)*2;}
                float speed=Settings.sport==SportKind.FlagFootball?(i==Carrier?8:7.4f):10;
                if(Settings.sport==SportKind.CaptureTheFlag&&FlagCarrier[other]==i)speed=8.5f;
                state.velocity=Vector3.ClampMagnitude(direction*2,speed);state.position+=state.velocity*dt;
                state.position.x=Mathf.Clamp(state.position.x,-54,54);state.position.z=Mathf.Clamp(state.position.z,-29,29);
                if(state.velocity.sqrMagnitude>.01f)state.rotation=Quaternion.Slerp(state.rotation,Quaternion.LookRotation(state.velocity),dt*7);
                World.States[i]=state;
            }
        }
        void Soccer(float dt)
        {
            Vector3 before=Ball;Ball+=BallVelocity*dt;BallVelocity*=Mathf.Exp(-dt*.45f);Ball.y=1.2f;
            if(Mathf.Abs(Ball.x)>=50)
            {
                float t=(Mathf.Sign(Ball.x)*50-before.x)/(Ball.x-before.x);
                float crossZ=Mathf.Lerp(before.z,Ball.z,Mathf.Clamp01(t));
                if(Mathf.Abs(crossZ)<8){Score(Ball.x>0?0:1,1,"GOAL");return;}
                Ball.x=Mathf.Sign(Ball.x)*49.8f;BallVelocity.x*=-.7f;Event="Goal-line rebound";
            }
            if(Mathf.Abs(Ball.z)>30){Ball.z=Mathf.Sign(Ball.z)*29.8f;BallVelocity.z*=-.7f;Event="Touchline rebound";}
            if(kickCooldown>0)return;
            int a=Nearest(0,Ball),b=Nearest(1,Ball),i=(World.States[a].position-Ball).sqrMagnitude<=(World.States[b].position-Ball).sqrMagnitude?a:b;
            Vector3 p=World.States[i].position;p.y=Ball.y;
            if(Vector3.Distance(p,Ball)<2.5f)
            {
                Possession=i/5;int dir=Possession==0?1:-1;Vector3 goal=new Vector3(dir*51,1.2f,Mathf.Sin(Elapsed)*5);
                BallVelocity=(goal-Ball).normalized*24;kickCooldown=.65f;Event=(Possession==0?"Blue":"Red")+" shoots";
            }
        }
        void Flags()
        {
            for(int flag=0;flag<2;flag++)
            {
                int carrier=FlagCarrier[flag],attacker=1-flag;
                if(carrier<0){int i=Nearest(attacker,Base(flag));if(i>=0&&Vector3.Distance(World.States[i].position,Base(flag))<2.7f){FlagCarrier[flag]=i;Event=(attacker==0?"Blue":"Red")+" took the flag";}}
                else
                {
                    int defender=Nearest(flag,World.States[carrier].position);
                    if(defender>=0&&Vector3.Distance(World.States[defender].position,World.States[carrier].position)<2.2f)
                    {
                        FlagCarrier[flag]=-1;waiting[carrier]=3;var s=World.States[carrier];s.position=(attacker==0?Settings.blue:Settings.red).Slot(carrier%5,attacker);World.States[carrier]=s;Event="Tag! Flag returned";
                    }
                    else if(FlagCarrier[attacker]<0&&Vector3.Distance(World.States[carrier].position,Base(attacker))<3){Score(attacker,1,"CAPTURE");return;}
                }
            }
        }
        void BeginDrive(int team,float spot)
        {
            Possession=team;Down=1;FirstDownLine=Mathf.Clamp(spot+(team==0?20:-20),-50,50);SetPlay(spot);
        }
        void SetPlay(float spot)
        {
            Scrimmage=Mathf.Clamp(spot,-46,46);playTime=0;passed=false;passTarget=-1;Carrier=Possession*5;restart=1.5f;
            for(int i=0;i<10;i++)
            {
                int dir=Possession==0?1:-1;bool attack=i/5==Possession;
                var s=World.States[i];var slot=(i<5?Settings.blue:Settings.red).Slot(i%5,i/5);
                s.position=new Vector3(Mathf.Clamp(Scrimmage+dir*(attack?-4-Mathf.Abs(slot.x)*.12f:7+Mathf.Abs(slot.x)*.16f),-48,48),2.5f,slot.z);s.velocity=Vector3.zero;World.States[i]=s;
            }
            Ball=World.States[Carrier].position;
        }
        void EndPlay(float spot,string reason)
        {
            int dir=Possession==0?1:-1;
            if((spot-FirstDownLine)*dir>=0){Down=1;FirstDownLine=Mathf.Clamp(spot+dir*20,-50,50);Event="FIRST DOWN · "+reason;}
            else {Down++;Event=reason;}
            if(Down>4){int other=1-Possession;BeginDrive(other,spot);Event="TURNOVER ON DOWNS";}else SetPlay(spot);
        }
        void Football(float dt)
        {
            playTime+=dt;int dir=Possession==0?1:-1;
            if(Carrier<0)
            {
                passTime+=dt;Ball=Vector3.MoveTowards(Ball,World.States[passTarget].position,28*dt);
                int defender=Nearest(1-Possession,Ball);
                if(defender>=0&&Vector3.Distance(World.States[defender].position,Ball)<1.6f){int other=1-Possession;float spot=Ball.x;BeginDrive(other,spot);Event="INTERCEPTION";return;}
                if(Vector3.Distance(Ball,World.States[passTarget].position)<1.5f){Carrier=passTarget;Event="PASS COMPLETE";}
                else if(passTime>2){EndPlay(Scrimmage,"INCOMPLETE PASS");return;}
            }
            else
            {
                Ball=World.States[Carrier].position;
                if(Ball.x*dir>=50){int scoring=Possession;Score(scoring,6,"TOUCHDOWN");if(!Ended)BeginDrive(1-scoring,scoring==0?30:-30);return;}
                int defender=Nearest(1-Possession,Ball);
                float gap=Vector3.Distance(World.States[defender].position,Ball);
                if(gap<2.1f){EndPlay(Ball.x,"FLAG PULLED");return;}
                if(!passed&&gap<12&&playTime>.25f&&Ball.x*dir<=Scrimmage*dir)
                {
                    int receiver=-1;float best=-1000;
                    for(int i=Possession*5;i<Possession*5+5;i++)if(i!=Carrier){float gain=(World.States[i].position.x-Ball.x)*dir;int nearest=Nearest(1-Possession,World.States[i].position);if(gain>3&&Vector3.Distance(World.States[nearest].position,World.States[i].position)>4&&gain>best){receiver=i;best=gain;}}
                    if(receiver>=0){passTarget=receiver;Carrier=-1;passTime=0;passed=true;Event="PASS IN FLIGHT";}
                }
            }
            if(playTime>=20)EndPlay(Carrier<0?Scrimmage:Ball.x,"PLAY CLOCK EXPIRED");
        }
        void Score(int team,int points,string label)
        {
            if(Ended)return;if(team==0)BlueScore+=points;else RedScore+=points;Event=(team==0?"BLUE ":"RED ")+label;
            if(BlueScore>=Settings.targetScore||RedScore>=Settings.targetScore)Finish();else ResetPositions();
        }
        void Finish(){Winner=BlueScore==RedScore?2:BlueScore>RedScore?0:1;Event=Winner==2?"DRAW":Winner==0?"BLUE WINS":"RED WINS";BallVelocity=Vector3.zero;for(int i=0;i<10;i++)World.States[i].velocity=Vector3.zero;}
    }
}

using System;
using UnityEngine;
using FleetCommander.Core;
namespace FleetCommander.Games
{
    public enum SportKind { Soccer, CaptureTheFlag, FlagFootball, TagDuel, KingOfHill }
    // Native five-a-side arcade rules. Positions and ball travel are in metres on a 100 x 60 pitch.
    public sealed class SportsMatch
    {
        public ToyDuelEngine Toy {get;private set;}
        public bool IsToy=>Kind==SportKind.TagDuel||Kind==SportKind.KingOfHill;
        public SportKind Kind {get;private set;}
        public FleetWorld World {get;private set;}
        public int BlueScore {get;private set;}
        public int RedScore {get;private set;}
        public float Remaining {get;private set;}
        public float Duration {get;private set;}
        public bool Finished {get;private set;}
        public int Winner {get;private set;}=-1; // 0 blue, 1 red, 2 draw
        public string Event {get;private set;}="Kickoff";
        public int Carrier {get;private set;}=-1;
        public Vector3 Ball {get;private set;}
        public Vector3 BallVelocity {get;private set;}
        public int Possession {get;private set;}
        public int Down {get;private set;}=1;
        public float PlayClock {get;private set;}=20;
        public float FirstDownLine {get;private set;}
        public SportsSettings Settings {get;private set;}
        public int TargetScore=>Settings?.targetScore??0;
        string finishReason="Full time";
        public float Scrimmage {get;private set;}
        public bool ForwardPassUsed {get;private set;}
        public readonly int[] FlagCarrier={-1,-1};
        public readonly Vector3[] Flags={new Vector3(-45,3,0),new Vector3(45,3,0)};
        public readonly bool[] FlagHome={true,true};
        public readonly float[] Stunned=new float[10];
        readonly float[] flagAge=new float[2];
        readonly Vector3[] targets=new Vector3[10];
        float decision,ballAge,freeze,tagCooldown,clock;
        int lastTouch=-1,passTarget=-1;
        bool passInFlight;
        public string ScoreText=>"BLUE  "+BlueScore+"  :  "+RedScore+"  RED";
        public string ClockText=>Mathf.CeilToInt(Remaining/60).ToString();
        public string Title=>Kind==SportKind.TagDuel?"TOY TAG DUEL":Kind==SportKind.KingOfHill?"KING OF THE HILL":Kind==SportKind.Soccer?"SOCCER":Kind==SportKind.CaptureTheFlag?"CAPTURE THE FLAG":"FLAG FOOTBALL";
        public string Status=>Finished?(Winner==2?"DRAW":Winner==0?"BLUE WINS":"RED WINS")+" · "+finishReason:Kind==SportKind.FlagFootball?(Possession==0?"Blue":"Red")+" possession · Down "+Down+" / 4 · "+Mathf.Abs(FirstDownLine-Scrimmage).ToString("F0")+" to gain · Play "+Mathf.CeilToInt(PlayClock)+"s":Event;
        public string Rules=>IsToy?"Toy tags only · Foam darts travel with drop; nets disable; laser tags require a continuous lock; bumpers require contact; water streams build tags. Tagged drones return after a short timeout. Duel scores tags; Hill scores uncontested seconds inside the ring. Target score or the clock ends the match; ties are draws.":Kind==SportKind.Soccer?"5 v 5 · goal = 1 · no offside or fouls · touchline exits give an opponent kick-in; goal-line misses give a goalkeeper restart · score target or clock ends the match; a tie is a draw.":Kind==SportKind.CaptureTheFlag?"5 v 5 · capture = 1 · carry the enemy flag home while your flag is home · tags work in the defender's half · tagged drones sit out 3s · dropped flags return after 8s, carried flags after 25s · score target or clock ends the match; a tie is a draw.":"5 v 5 flag football · touchdown = 6 · four downs to gain 20 field units (yellow line) · one forward pass per down, thrown behind the line · flag pull, incomplete pass, out of bounds or 20s play clock ends a down · fourth down turns over · no kicks or extra points · score target or clock ends the match; a tie is a draw.";
        public SportsMatch(SportKind kind,FleetConfig source,float seconds=180,BattleSettings settings=null,SportsSettings setup=null)
        {
            Kind=kind;if(setup!=null&&!IsToy){setup.Validate();Settings=setup.Clone();Settings.sport=kind;Settings.seconds=seconds;}Duration=Remaining=Mathf.Clamp(seconds,30,1800);
            var c=JsonUtility.FromJson<FleetConfig>(JsonUtility.ToJson(source));c.scenery=SceneryKind.Stadium;c.planet=PlanetKind.Earth;c.height=3.3f;c.speed=13;c.acceleration=32;c.boids=false;c.obstacles=false;c.unlimited=true;c.wind=0;c.sky=SkyKind.Day;
            var rules=settings?.Clone()??new BattleSettings();rules.engage=false;
            rules.lab.activity=kind==SportKind.Soccer?AdaptiveActivity.Soccer:kind==SportKind.CaptureTheFlag?AdaptiveActivity.CaptureFlag:kind==SportKind.FlagFootball?AdaptiveActivity.Football:kind==SportKind.KingOfHill?AdaptiveActivity.KingOfHill:AdaptiveActivity.Duel;
            World=new FleetWorld(c,IsToy?Mathf.Clamp(rules.lab.agentsPerTeam,1,4)*2:10,rules);World.ExternalTargets=targets;World.Launch();
            if(Settings!=null)for(int i=0;i<World.Count;i++){var roster=Roster(Team(i));var drone=World.States[i];drone.frame=roster.frames[i/2];drone.skin=roster.skin;World.States[i]=drone;}
            if(IsToy){Toy=new ToyDuelEngine(this,rules.lab);Event=kind==SportKind.TagDuel?"Score tags to win":"Hold the center ring";}
            ResetPlayers();if(kind==SportKind.FlagFootball)NewDrive(0,-30);else if(kind==SportKind.Soccer){SetCarrier(2);Event="Blue kickoff";}
        }
        static int Team(int id)=>id%2;
        static float Direction(int team)=>team==0?1:-1;
        public static Vector3 Base(int team)=>new Vector3(team==0?-45:45,3.3f,0);
        SportsRoster Roster(int team)=>team==0?Settings.blue:Settings.red;
        Vector3 Home(int i){int team=Team(i),slot=i/2;if(Settings!=null){var p=Roster(team).Slot(slot,team);p.y=3.3f;return p;}return new Vector3(Direction(team)*(slot==0?-43:slot<3?-24:-10),3.3f,slot==0?0:(slot%2==0?1:-1)*(slot<3?16:9));}
        void Put(int i,Vector3 p){var s=World.States[i];s.position=s.target=p;s.velocity=Vector3.zero;s.rotation=Quaternion.LookRotation(Vector3.right*Direction(Team(i)));World.States[i]=s;targets[i]=p;}
        void ResetPlayers(){for(int i=0;i<World.Count;i++){Put(i,Home(i));Stunned[i]=0;}}
        void SetCarrier(int i){Carrier=i;lastTouch=Team(i);Ball=World.States[i].position+Vector3.down*.9f;BallVelocity=Vector3.zero;passInFlight=false;ballAge=0;decision=.8f;}
        public void Tick(float dt)
        {
            World.Events.Clear();if(Finished||dt<=0||float.IsNaN(dt)||float.IsInfinity(dt))return;dt=Mathf.Min(dt,.05f);Remaining=Mathf.Max(0,Remaining-dt);clock+=dt;
            if(Remaining<=0){End();return;}
            tagCooldown=Mathf.Max(0,tagCooldown-dt);decision-=dt;
            if(freeze>0){freeze-=dt;return;}
            for(int i=0;i<World.Count;i++)Stunned[i]=Mathf.Max(0,Stunned[i]-dt);
            Plan();World.Step(dt);
            for(int i=0;i<World.Count;i++)
            {
                var s=World.States[i];bool outside=Mathf.Abs(s.position.z)>30||Mathf.Abs(s.position.x)>54;
                s.position.y=IsToy?Mathf.Clamp(s.position.y,3.3f,35):3.3f;if(!IsToy)s.velocity.y=0;s.position.x=Mathf.Clamp(s.position.x,-54,54);s.position.z=Mathf.Clamp(s.position.z,-30,30);World.States[i]=s;
                if(Kind==SportKind.FlagFootball&&Carrier==i&&outside){EndDown("Out of bounds");return;}
                if(Stunned[i]>0)Put(i,Home(i));
            }
            if(IsToy){Toy.Tick(dt);return;}
            if(Kind==SportKind.CaptureTheFlag){FlagsStep(dt);return;}
            if(Carrier>=0)
            {
                Ball=World.States[Carrier].position+Vector3.down*.9f;
                if(Kind==SportKind.Soccer&&(Mathf.Abs(Ball.x)>=50||Mathf.Abs(Ball.z)>=30))
                {
                    if(Mathf.Abs(Ball.x)>=50&&Mathf.Abs(Ball.z)<7){int scoring=Ball.x>0?0:1;Score(scoring,1);ResetPlayers();SetCarrier(scoring==0?3:2);freeze=1.5f;Event="GOAL! · Opponent kickoff";}
                    else {int team=Mathf.Abs(Ball.x)>=50?(Ball.x>0?1:0):1-Team(Carrier);int id=NearestPlayer(Ball,team,1);Put(id,new Vector3(Mathf.Clamp(Ball.x,-44,44),3.3f,Mathf.Clamp(Ball.z,-28,28)));SetCarrier(id);tagCooldown=1.5f;Event="Opponent restart";}
                    return;
                }
            }
            else BallStep(dt);
            if(Kind==SportKind.FlagFootball){FootballStep(dt);return;}
            SoccerStep();
        }
        void Plan()
        {
            for(int i=0;i<World.Count;i++)
            {
                int team=Team(i),slot=i/2;float dir=Direction(team);Vector3 p=Home(i);
                // Sports observations share the estimator and retained playbook learner.
                int foe=NearestEnemy(i,false);if(foe>=0){var seen=World.AdaptiveLab.Observe(World.States[i],World.States[foe],World.Time,1f/60);if(Mathf.FloorToInt(clock*30)!=Mathf.FloorToInt((clock-1f/60)*30))World.AdaptiveLab.Log(i,foe,team,seen.position,p-World.States[i].position,false,false,!seen.detected,0);}
                if(IsToy){var toyTarget=Toy.Target(i);targets[i]=Stunned[i]>0?Home(i):i==World.ControlledDrone?World.States[i].position:toyTarget;continue;}
                if(Stunned[i]>0){targets[i]=p;continue;}
                if(i==World.ControlledDrone){targets[i]=World.States[i].position;continue;}
                if(Kind==SportKind.CaptureTheFlag)
                {
                    int enemy=1-team;
                    if(FlagCarrier[enemy]==i)p=Base(team);
                    else if(FlagCarrier[team]>=0&&slot<3)p=World.States[FlagCarrier[team]].position;
                    else if(slot<2){int near=NearestEnemy(i,true);p=near>=0?World.States[near].position:Base(team)+new Vector3(dir*12,0,(slot*2-1)*9);}
                    else p=Flags[enemy]+new Vector3(0,0,FlagCarrier[enemy]>=0?(slot-3)*8:0);
                }
                else if(Kind==SportKind.Soccer)
                {
                    int nearest=NearestPlayer(Ball,team,1);
                    if(i==Carrier){p=new Vector3(dir*52,3.3f,Mathf.Sin(clock+i)*5);int defender=NearestEnemy(i,false);if(defender>=0&&World.AdaptiveLab.TryGetTrack(i,defender,out var track)&&FlatDistance(World.States[i].position,track.position)<10)p.z=World.States[i].position.z+(track.position.z>World.States[i].position.z?-6:6);}
                    else if(slot==0)p=new Vector3(-dir*46,3.3f,Mathf.Clamp(Ball.z,-7,7));
                    else if(nearest==i||Carrier>=0&&Team(Carrier)!=team&&slot==1)p=Ball;
                    else p=new Vector3(Mathf.Clamp(Ball.x-dir*(slot<3?20:-6),-36,36),3.3f,(slot%2==0?1:-1)*(slot<3?18:12));
                }
                else
                {
                    if(i==Carrier)p=new Vector3(dir*54,3.3f,Mathf.Sin(clock*.7f+i)*18);
                    else if(team!=Possession)p=Carrier>=0?World.States[Carrier].position+Vector3.right*dir*(slot-2)*2:Ball;
                    else p=new Vector3(Mathf.Clamp(Scrimmage+dir*(12+slot*5),-47,47),3.3f,(slot-2)*11);
                    if(passInFlight&&i==passTarget)p=Ball+BallVelocity*.25f;
                }
                if(Settings!=null&&i!=Carrier&&Kind!=SportKind.FlagFootball)
                {
                    var role=Roster(team).roles[slot];Vector3 home=Home(i);
                    if(Kind==SportKind.Soccer&&slot>0&&NearestPlayer(Ball,team,1)!=i)
                    {p=role==SportRole.Defender?Vector3.Lerp(home,new Vector3(Mathf.Clamp(Ball.x-dir*22,-40,40),3.3f,Ball.z),.35f):role==SportRole.Support?Vector3.Lerp(home,p,.6f):p;}
                    if(Kind==SportKind.CaptureTheFlag&&FlagCarrier[1-team]!=i)
                    {int thief=FlagCarrier[team];p=role==SportRole.Defender?(thief>=0?World.States[thief].position:home):role==SportRole.Support?Vector3.Lerp(home,Flags[1-team],.55f):Flags[1-team];}
                }
                if(Settings!=null&&Kind==SportKind.FlagFootball&&i!=Carrier&&Team(i)==Possession)
                {var home=Home(i);p.z=home.z;p.x=Mathf.Clamp(Scrimmage+dir*(8+Mathf.Abs(home.x)*.5f),-47,47);if(passInFlight&&i==passTarget)p=Ball+BallVelocity*.25f;}
                var policy=World.AdaptiveLab.Policy(team);if(i!=Carrier&&slot>0){p.z*=policy.selectedPlay==1?1.25f:.95f;p.x+=dir*(policy.selectedPlay==2?5:policy.selectedPlay==3?-7:0);}
                p.x=Mathf.Clamp(p.x,-52,52);p.z=Mathf.Clamp(p.z,-28,28);p.y=3.3f;targets[i]=p;
            }
        }
        static float FlatDistance(Vector3 a,Vector3 b){a.y=b.y=0;return Vector3.Distance(a,b);}
        int NearestPlayer(Vector3 p,int team,int minSlot=0,int exclude=-1)
        {int best=-1;float distance=float.MaxValue;for(int i=team+minSlot*2;i<World.Count;i+=2)if(i!=exclude&&Stunned[i]<=0){float d=FlatDistance(p,World.States[i].position);if(d<distance){best=i;distance=d;}}return best;}
        int NearestEnemy(int id,bool homeHalf)
        {int best=-1;float distance=float.MaxValue;for(int i=1-Team(id);i<World.Count;i+=2)if(Stunned[i]<=0&&(!homeHalf||World.States[i].position.x*Direction(Team(id))<0)){float d=FlatDistance(World.States[id].position,World.States[i].position);if(d<distance){best=i;distance=d;}}return best;}
        void SoccerStep()
        {
            if(Carrier>=0)
            {
                int other=NearestEnemy(Carrier,false);
                if(tagCooldown<=0&&other>=0&&FlatDistance(Ball,World.States[other].position)<2.7f){SetCarrier(other);tagCooldown=1.5f;Event="Possession won";return;}
                if(Carrier!=World.ControlledDrone&&decision<=0)
                {
                    if(World.States[Carrier].position.x*Direction(Team(Carrier))>25)Act(Carrier,true);
                    else if(Carrier/2==0||other>=0&&FlatDistance(Ball,World.States[other].position)<7)Act(Carrier,false);
                    decision=.8f;
                }
            }
        }
        public bool Act(int player,bool shoot)
        {
            if(IsToy){if(!Finished&&freeze<=0&&player>=0&&player<World.Count){Toy.RequestFire(player);return true;}return false;}
            if(Finished||freeze>0||player!=Carrier||player<0||Kind==SportKind.CaptureTheFlag)return false;
            int team=Team(player);float dir=Direction(team);Vector3 destination;
            if(Kind==SportKind.Soccer&&shoot){destination=new Vector3(dir*54,2.4f,Mathf.Sin(clock*1.7f)*5);passTarget=-1;Event=(team==0?"Blue":"Red")+" shoots";}
            else
            {
                int target=-1;float best=-10000;
                for(int i=team;i<World.Count;i+=2)if(i!=player){float progress=(World.States[i].position.x-Ball.x)*dir;float score=progress-FlatDistance(Ball,World.States[i].position)*.2f;if(score>best){best=score;target=i;}}
                if(target<0)return false;destination=World.States[target].position+World.States[target].velocity*.3f;destination.y=2.4f;
                if(Kind==SportKind.FlagFootball&&destination.x*dir>Ball.x*dir)
                {if(ForwardPassUsed||Ball.x*dir>Scrimmage*dir+.5f){Event="Forward pass unavailable · run or use a lateral";return false;}ForwardPassUsed=true;}
                passTarget=target;Event=(team==0?"Blue":"Red")+" passes";
            }
            BallVelocity=(destination-Ball).normalized*(Kind==SportKind.Soccer?30:24);BallVelocity=new Vector3(BallVelocity.x,0,BallVelocity.z);Carrier=-1;ballAge=0;passInFlight=Kind==SportKind.FlagFootball;lastTouch=team;tagCooldown=.45f;return true;
        }
        void BallStep(float dt)
        {
            Vector3 previous=Ball;Ball+=BallVelocity*dt;ballAge+=dt;
            if(Kind==SportKind.Soccer)
            {
                BallVelocity*=Mathf.Exp(-.11f*dt);
                if(Mathf.Abs(Ball.x)>=50)
                {
                    float crossingZ=Mathf.Lerp(previous.z,Ball.z,Mathf.Clamp01((Mathf.Sign(Ball.x)*50-previous.x)/(Ball.x-previous.x)));
                    if(Mathf.Abs(crossingZ)<7){Score(Ball.x>0?0:1,1);ResetPlayers();SetCarrier(Ball.x>0?3:2);Event="GOAL! · Opponent kickoff";freeze=1.5f;return;}
                    int team=Ball.x>0?1:0;Put(team,new Vector3(Direction(team)*-43,3.3f,0));SetCarrier(team);Event="Goalkeeper restart";tagCooldown=1.5f;return;
                }
                if(Mathf.Abs(Ball.z)>30){int team=lastTouch<0?0:1-lastTouch;int id=NearestPlayer(Ball,team,1);Put(id,new Vector3(Mathf.Clamp(Ball.x,-45,45),3.3f,Mathf.Sign(Ball.z)*28));SetCarrier(id);Event="Kick-in";tagCooldown=1.5f;return;}
            }
            else if(Mathf.Abs(Ball.x)>54||Mathf.Abs(Ball.z)>30||ballAge>2.5f){EndDown("Incomplete pass");return;}
            if(ballAge<.16f)return;
            int closest=-1;float distance=2.6f;
            for(int i=0;i<World.Count;i++)
            {
                Vector3 a=previous,b=Ball,p=World.States[i].position;a.y=b.y=p.y=0;Vector3 ab=b-a;float t=ab.sqrMagnitude>.00001f?Mathf.Clamp01(Vector3.Dot(p-a,ab)/ab.sqrMagnitude):0;
                float d=Vector3.Distance(p,a+ab*t);if(d<distance){closest=i;distance=d;}
            }
            if(closest>=0)
            {
                bool interception=Kind==SportKind.FlagFootball&&Team(closest)!=Possession;SetCarrier(closest);tagCooldown=1;
                if(interception){Possession=Team(closest);Down=1;Scrimmage=Ball.x;FirstDownLine=Mathf.Clamp(Scrimmage+Direction(Possession)*20,-50,50);ForwardPassUsed=false;PlayClock=20;Event="Interception · new possession";}else Event="Pass collected";
            }
        }
        void FootballStep(float dt)
        {
            PlayClock-=dt;if(PlayClock<=0){EndDown("Play clock expired");return;}
            if(Carrier<0)return;
            int team=Team(Carrier);float dir=Direction(team);
            if(World.States[Carrier].position.x*dir>=50){Score(team,6);NewDrive(1-team,dir*30);freeze=1.5f;Event="TOUCHDOWN! · Opponent possession";return;}
            int defender=NearestEnemy(Carrier,false);
            if(tagCooldown<=0&&defender>=0&&FlatDistance(Ball,World.States[defender].position)<3){EndDown("Flag pulled");return;}
            if(Carrier!=World.ControlledDrone&&decision<=0&&!ForwardPassUsed&&World.States[Carrier].position.x*dir<=Scrimmage*dir+.3f)Act(Carrier,false);
        }
        void EndDown(string reason)
        {
            if(Finished)return;float x=Carrier>=0?World.States[Carrier].position.x:Scrimmage;
            if(x*Direction(Possession)>=FirstDownLine*Direction(Possession)){NewDrive(Possession,Mathf.Clamp(x,-44,44));Event=reason+" · FIRST DOWN";}
            else if(Down>=4){int next=1-Possession;NewDrive(next,Mathf.Clamp(x,-40,40));Event=reason+" · turnover on downs";}
            else{Down++;Scrimmage=Mathf.Clamp(x,-44,44);SetupDown();Event=reason+" · down "+Down;}
            freeze=.8f;
        }
        void NewDrive(int team,float x){Possession=team;Down=1;Scrimmage=x;FirstDownLine=Mathf.Clamp(x+Direction(team)*20,-50,50);SetupDown();}
        void SetupDown()
        {
            ForwardPassUsed=false;PlayClock=20;float dir=Direction(Possession);
            for(int i=0;i<World.Count;i++){bool offense=Team(i)==Possession;int slot=i/2;Put(i,new Vector3(Mathf.Clamp(Scrimmage+(offense?-3:8)*dir,-47,47),3.3f,Settings!=null?Home(i).z:(slot-2)*10));}
            SetCarrier(Possession);tagCooldown=1.2f;decision=.6f;passInFlight=false;
        }
        void FlagsStep(float dt)
        {
            // Tags precede pickups/captures. Only a defender in its own half may tag.
            if(tagCooldown<=0)for(int i=0;i<World.Count;i++)if(Stunned[i]<=0&&World.States[i].position.x*Direction(Team(i))<0)
            {
                int foe=NearestEnemy(i,true);if(foe>=0&&FlatDistance(World.States[i].position,World.States[foe].position)<3)
                {
                    for(int f=0;f<2;f++)if(FlagCarrier[f]==foe){Flags[f]=World.States[foe].position;FlagCarrier[f]=-1;flagAge[f]=0;}
                    Put(foe,Home(foe));Stunned[foe]=3;tagCooldown=.25f;Event="Tagged · 3 second return to base";break;
                }
            }
            for(int f=0;f<2;f++)
            {
                if(!FlagHome[f])flagAge[f]+=dt;
                if(flagAge[f]>(FlagCarrier[f]>=0?25:8)){ReturnFlag(f);Event="Flag returned by timeout";}
                if(FlagCarrier[f]>=0)
                {
                    int id=FlagCarrier[f],team=Team(id);Flags[f]=World.States[id].position;
                    if(FlagHome[team]&&FlatDistance(Flags[f],Base(team))<4){Score(team,1);ReturnFlag(0);ReturnFlag(1);ResetPlayers();freeze=1.5f;Event="FLAG CAPTURED!";return;}
                    continue;
                }
                for(int i=0;i<World.Count;i++)if(Stunned[i]<=0&&FlatDistance(World.States[i].position,Flags[f])<3)
                {
                    if(Team(i)==f){if(!FlagHome[f]){ReturnFlag(f);Event="Own flag returned";}continue;}
                    FlagCarrier[f]=i;FlagHome[f]=false;flagAge[f]=0;Event=(Team(i)==0?"Blue":"Red")+" has the enemy flag";break;
                }
            }
        }
        void ReturnFlag(int f){Flags[f]=Base(f);FlagHome[f]=true;FlagCarrier[f]=-1;flagAge[f]=0;}
        void Score(int team,int points){AddPoints(team,points);}
        public void AddPoints(int team,int points){if(Finished)return;if(team==0)BlueScore+=points;else RedScore+=points;for(int i=0;i<World.Count;i++){int enemy=NearestEnemy(i,false);if(enemy>=0)World.AdaptiveLab.Log(i,enemy,Team(i),targets[i],Vector3.zero,false,false,false,Team(i)==team?points:-points);}if(!IsToy&&TargetScore>0&&Mathf.Max(BlueScore,RedScore)>=TargetScore)End("Score target reached");}
        public void EndMatch()=>End("Score target reached");
        void End(string reason="Full time"){finishReason=reason;Finished=true;Winner=BlueScore==RedScore?2:BlueScore>RedScore?0:1;World.ClearControl();BallVelocity=Vector3.zero;Event=Status;}
    }
}

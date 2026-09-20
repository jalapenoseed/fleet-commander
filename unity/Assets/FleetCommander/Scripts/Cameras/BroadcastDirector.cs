using FleetCommander.Core;
using UnityEngine;
namespace FleetCommander.Cameras
{
    // Event-ranked shots with dwell time, screen-space framing, axis continuity and occlusion repair.
    public sealed class BroadcastDirector
    {
        FleetWorld world;float age,shotAge;int subject=-1,partner=-1,eventSubject=-1,eventPartner=-1,sequence;float eventWeight;
        Vector3 smoothedLook;public string Shot {get;private set;}="Opening wide";public int Subject=>subject;
        public float MinimumShotSeconds=4,LookAhead=.22f,Damping=2.8f;
        public void Event(BattleEvent e){float weight=e.destruction?5:e.impact?2:0;if(weight>eventWeight){eventWeight=weight;eventSubject=e.source;eventPartner=e.victim;}}
        bool Valid(DroneState[] s,int i)=>i>=0&&i<s.Length&&!s[i].disabled&&s[i].airborne;
        public void Pose(SwarmSimulator simulator,Camera cam,float dt,out Vector3 position,out Vector3 look)
        {
            var w=simulator.Active;var states=simulator.Replay.Playing?simulator.Replay.Display:w.States;
            if(world!=w){world=w;age=shotAge=0;sequence=0;subject=partner=-1;eventWeight=0;smoothedLook=Vector3.zero;}
            age+=dt;shotAge+=dt;Vector3 center=Vector3.zero;int n=0;for(int i=0;i<states.Length;i++)if(!states[i].disabled){center+=states[i].position;n++;}center/=Mathf.Max(1,n);
            bool sports=simulator.Sports!=null;if(sports)center=simulator.Sports.Ball;
            if(age<3.5f||states.Length==0){Shot="Opening wide";look=new Vector3(0,sports?2:22,0);position=look+new Vector3(0,95,-150);smoothedLook=look;return;}
            if(shotAge>=MinimumShotSeconds||!Valid(states,subject))
            {
                if(eventWeight>0&&Valid(states,eventSubject)){subject=eventSubject;partner=eventPartner;Shot=eventWeight>=5?"Decisive impact":"Duel two-shot";}
                else
                {
                    float best=float.MaxValue;subject=partner=-1;
                    for(int i=0;i<states.Length;i+=Mathf.Max(1,states.Length/80))if(Valid(states,i))
                    {if(subject<0)subject=i;for(int j=i+1;j<states.Length;j+=Mathf.Max(1,states.Length/80))if(Valid(states,j)&&states[j].fleetId!=states[i].fleetId){float d=(states[i].position-states[j].position).sqrMagnitude;if(d<best){best=d;subject=i;partner=j;}}}
                    Shot=sequence%3==0?"Tactical skycam":sequence%3==1?"Tracking pair":"Field wide";
                }
                sequence++;shotAge=0;eventWeight=0;
            }
            if(w.RoundEnded){Shot="Winner salute";subject=-1;for(int i=0;i<states.Length;i++)if(Valid(states,i)&&states[i].fleetId==w.Winner){subject=i;break;}partner=-1;}
            Vector3 wanted=center;float extent=30;
            if(Valid(states,subject))
            {
                wanted=states[subject].position+Vector3.ClampMagnitude(states[subject].velocity*LookAhead,5);extent=8;
                if(Valid(states,partner)){wanted=(wanted+states[partner].position+Vector3.ClampMagnitude(states[partner].velocity*LookAhead,5))*.5f;extent=Mathf.Clamp(Vector3.Distance(states[subject].position,states[partner].position)*.65f+5,9,70);}
            }
            if(Shot=="Field wide"||!w.IsBattle){wanted=center;extent=sports?65:Mathf.Clamp(Mathf.Sqrt(states.Length)*w.Config.spacing,35,240);}
            if(sports&&Shot=="Tactical skycam"){wanted=simulator.Sports.Ball;extent=38;}
            smoothedLook=Vector3.Lerp(smoothedLook,wanted,1-Mathf.Exp(-Damping*dt));look=smoothedLook;
            float distance=extent/Mathf.Tan(cam.fieldOfView*Mathf.Deg2Rad*.5f)*1.35f;
            // Keep the broadcast on the near touchline to preserve left/right team direction.
            Vector3 offset=Shot=="Tactical skycam"?new Vector3(.18f,1,-.35f):Shot=="Winner salute"?new Vector3(.3f,.25f,-1):new Vector3(.2f,.4f,-1);
            position=look+offset.normalized*Mathf.Clamp(distance,14,520);
            position.y=Mathf.Max(SceneryTerrain.Height(w.Config,position.x,position.z)+3,position.y);
            if(w.Config.obstacles)foreach(var box in FleetWorld.Obstacles)if(box.IntersectRay(new Ray(look,(position-look).normalized),out float hit)&&hit<Vector3.Distance(look,position))position.y=Mathf.Max(position.y,box.max.y+15);
        }
    }
}

using System.Collections.Generic;
using FleetCommander.Core;
using UnityEngine;
namespace FleetCommander.Games
{
    public struct ToyProjectile
    {public Vector3 position,velocity;public int source,target;public float age;public ToyEffectorKind kind;}
    // Toy game physics only: scored tags, recoverable disables and no explosive payloads.
    public sealed class ToyDuelEngine
    {
        readonly SportsMatch match;readonly FleetWorld world;readonly AdaptiveLabSettings settings;
        readonly float[] cooldown=new float[10],dwell=new float[10],damage=new float[10];readonly int[] lockTarget=new int[10];
        readonly bool[] manualFire=new bool[10];float hillClock;
        public readonly List<ToyProjectile> Projectiles=new List<ToyProjectile>();
        public int Shots {get;private set;} public int Hits {get;private set;}
        public ToyDuelEngine(SportsMatch match,AdaptiveLabSettings settings){this.match=match;world=match.World;this.settings=settings;for(int i=0;i<lockTarget.Length;i++)lockTarget[i]=-1;for(int i=0;i<world.Count;i++){var e=world.AdaptiveLab.AgentEffector(world.States[i]);int ammo=e==ToyEffectorKind.Net?4:e==ToyEffectorKind.Water?120:e==ToyEffectorKind.LaserTag?40:30;world.States[i].ammo=world.States[i].ammoCapacity=ammo;world.States[i].reserveAmmo=ammo*3;world.States[i].reloadSeconds=e==ToyEffectorKind.Net?3:2;}}
        public void RequestFire(int agent){if(agent>=0&&agent<world.Count)manualFire[agent]=true;}
        public Vector3 Target(int i)
        {
            var self=world.States[i];int best=-1;float nearest=float.MaxValue;Vector3 perceived=Vector3.zero;
            for(int j=0;j<world.Count;j++)if(world.States[j].fleetId!=self.fleetId&&match.Stunned[j]<=0)
            {
                world.AdaptiveLab.Observe(self,world.States[j],world.Time,1f/60);
                if(world.AdaptiveLab.TryGetTrack(i,j,out var track)){float d=(track.position-self.position).sqrMagnitude;if(d<nearest){best=j;nearest=d;perceived=track.position;}}
            }
            lockTarget[i]=best;world.TargetIds[i]=best;if(best>=0)world.AimPoints[i]=perceived;
            float side=self.fleetId==0?1:-1;
            var plan=self.fleetId==0?world.Battle.bluePlan:world.Battle.redPlan;var role=plan.Role(i/2,world.Count/2);
            if(best<0)return new Vector3(side*(-12+Mathf.Sin(world.Time*.2f+i)*8),12,Mathf.Cos(world.Time*.3f+i)*18);
            if(match.Kind==SportKind.KingOfHill)return new Vector3(Mathf.Sin(i*2.4f)*7,6+ i%3,Mathf.Cos(i*2.4f)*7);
            var policy=world.AdaptiveLab.Policy(self.fleetId);var effector=world.AdaptiveLab.AgentEffector(self);
            float range=effector==ToyEffectorKind.Ram?0:effector==ToyEffectorKind.Net?10:effector==ToyEffectorKind.Water?16:effector==ToyEffectorKind.LaserTag?30:22;
            var away=(self.position-perceived).normalized;var target=perceived+away*range*(1.2f-policy.aggression*.4f);
            target+=new Vector3(0,Mathf.Sin(world.Time+i)*2,Mathf.Sin(world.Time*.9f+i)*policy.dodge*6);
            if(role!=null)target+=role.offset*.25f;
            target.y=Mathf.Clamp(target.y,4,30);target.x=Mathf.Clamp(target.x,-48,48);target.z=Mathf.Clamp(target.z,-28,28);return target;
        }
        public void Tick(float dt)
        {
            for(int i=0;i<world.Count;i++)
            {
                cooldown[i]=Mathf.Max(0,cooldown[i]-dt);var self=world.States[i];int target=lockTarget[i];bool user=world.ControlledDrone==i;
                if(match.Stunned[i]>0||target<0){dwell[i]=0;manualFire[i]=false;continue;}
                var other=world.States[target];var effector=world.AdaptiveLab.AgentEffector(self);bool valid=world.AdaptiveLab.ShouldEngage(self,other)&&world.AdaptiveLab.Visible(self.position,other.position);
                bool action=user?manualFire[i]:valid;
                manualFire[i]=false;
                if(effector==ToyEffectorKind.Ram)
                {if(cooldown[i]<=0&&valid&&Vector3.Distance(self.position,other.position)<2.4f){if(Spend(i,0,.001f))Tag(i,target,effector);cooldown[i]=2;}continue;}
                if(!action){dwell[i]=0;continue;}
                Vector3 aim=world.AdaptiveLab.AimPoint(self,other,world.Time)-self.position;
                if(user){aim=world.PilotAim;valid=Vector3.Dot(aim.normalized,(other.position-self.position).normalized)>.995f&&valid;}
                if(effector==ToyEffectorKind.LaserTag)
                {
                    dwell[i]=valid?dwell[i]+dt:0;
                    if(dwell[i]>=settings.laserDwell&&cooldown[i]<=0){if(Spend(i,1,.002f))Tag(i,target,effector);cooldown[i]=.8f;dwell[i]=0;}continue;
                }
                if(cooldown[i]>0||!Spend(i,1,.0005f))continue;
                float speed=effector==ToyEffectorKind.Net?18:effector==ToyEffectorKind.Water?22:32;
                float drop=effector==ToyEffectorKind.Net?3:effector==ToyEffectorKind.Water?5:9.8f;
                float flight=Mathf.Min(2,aim.magnitude/speed);if(!user)aim.y+=.5f*drop*flight*flight;
                float spread=(FormationMath.Hash(i*170+Shots)-.5f)*(effector==ToyEffectorKind.Water?.16f:.04f);
                Vector3 velocity=(aim.normalized+new Vector3(spread,0,-spread)).normalized*speed;
                Projectiles.Add(new ToyProjectile{source=i,target=target,kind=effector,position=self.position+velocity.normalized*1.2f,velocity=velocity});Shots++;
                cooldown[i]=effector==ToyEffectorKind.Net?1.5f:effector==ToyEffectorKind.Water?.12f:.45f;
                world.AdaptiveLab.Log(i,target,self.fleetId,self.position+aim,velocity,true,false,false,0,false);
            }
            for(int index=Projectiles.Count-1;index>=0;index--)
            {
                var shot=Projectiles[index];shot.age+=dt;Vector3 before=shot.position;
                shot.velocity+=Vector3.down*(shot.kind==ToyEffectorKind.Net?3:shot.kind==ToyEffectorKind.Water?5:9.8f)*dt;shot.position+=shot.velocity*dt;
                bool done=shot.age>3||shot.position.y<.2f||Mathf.Abs(shot.position.x)>56||Mathf.Abs(shot.position.z)>35;
                if(done)world.AdaptiveLab.Log(shot.source,shot.target,world.States[shot.source].fleetId,shot.position,shot.velocity,true,false,false,-.05f);
                for(int j=0;j<world.Count&&!done;j++)if(world.States[j].fleetId!=world.States[shot.source].fleetId&&match.Stunned[j]<=0)
                {
                    Vector3 ab=shot.position-before;float t=ab.sqrMagnitude<.00001f?0:Mathf.Clamp01(Vector3.Dot(world.States[j].position-before,ab)/ab.sqrMagnitude);
                    if(Vector3.Distance(before+ab*t,world.States[j].position)<(shot.kind==ToyEffectorKind.Net?2.4f:shot.kind==ToyEffectorKind.Water?1.4f:1.1f))
                    {
                        Hits++;damage[j]+=shot.kind==ToyEffectorKind.Net?100:shot.kind==ToyEffectorKind.Water?18:40;
                        world.AdaptiveLab.Log(shot.source,j,world.States[shot.source].fleetId,shot.position,shot.velocity,true,true,false,.25f);
                        if(damage[j]>=100)Tag(shot.source,j,shot.kind);done=true;
                    }
                }
                if(done)Projectiles.RemoveAt(index);else Projectiles[index]=shot;
            }
            if(match.Kind==SportKind.KingOfHill)
            {
                hillClock+=dt;if(hillClock>=1){hillClock-=1;bool blue=false,red=false;for(int i=0;i<world.Count;i++)if(match.Stunned[i]<=0&&new Vector2(world.States[i].position.x,world.States[i].position.z).magnitude<10){if(world.States[i].fleetId==0)blue=true;else red=true;}if(blue!=red)match.AddPoints(blue?0:1,1);}
            }
            if(match.BlueScore>=settings.targetTags||match.RedScore>=settings.targetTags)match.EndMatch();
        }
        bool Spend(int id,int ammo,float energy)
        {var s=world.States[id];if(s.reloadTime>0)return false;if(world.Battle.finiteAmmo&&s.ammo<ammo){world.Reload(id);return false;}if(!world.Config.unlimited&&s.battery01<energy)return false;if(world.Battle.finiteAmmo)s.ammo-=ammo;if(!world.Config.unlimited)s.battery01=Mathf.Max(0,s.battery01-energy);world.States[id]=s;return true;}
        void Tag(int attacker,int target,ToyEffectorKind kind)
        {
            if(match.Stunned[target]>0)return;Hits++;damage[target]=0;match.Stunned[target]=kind==ToyEffectorKind.Net?4:2.5f;
            if(match.Kind==SportKind.TagDuel)match.AddPoints(world.States[attacker].fleetId,1);
            world.AdaptiveLab.Log(attacker,target,world.States[attacker].fleetId,world.States[target].position,Vector3.zero,true,true,false,1);
            world.AdaptiveLab.Log(target,attacker,world.States[target].fleetId,world.States[attacker].position,Vector3.zero,false,false,false,-1);
            world.Events.Add(new BattleEvent{from=world.States[attacker].position,to=world.States[target].position,source=attacker,victim=target,team=world.States[attacker].fleetId,impact=true,weapon=WeaponKind.Pulse});
        }
    }
}

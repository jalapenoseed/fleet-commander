using System;
using System.Collections.Generic;
using UnityEngine;

namespace FleetCommander.Core
{
    public enum ToyEffectorKind { FoamDart, Net, LaserTag, Ram, Water }
    public enum AdaptiveActivity { Duel, CaptureFlag, KingOfHill, Soccer, Football }
    [Flags] public enum SensorKind
    {
        None=0, Camera=1, Yolo=2, Range=4, Imu=8, OpticalFlow=16, Thermal=32, RF=64, UV=128
    }

    [Serializable] public sealed class AdaptiveLabSettings
    {
        public bool enabled=true, learn=true, autoSensors=true;
        public AdaptiveActivity activity=AdaptiveActivity.Duel;
        public ToyEffectorKind blueEffector=ToyEffectorKind.FoamDart, redEffector=ToyEffectorKind.LaserTag;
        public SensorKind blueSensors=SensorKind.Camera|SensorKind.Yolo|SensorKind.Range|SensorKind.Imu;
        public SensorKind redSensors=SensorKind.Camera|SensorKind.Yolo|SensorKind.Range|SensorKind.Imu;
        public float cameraNoise=.7f, rangeNoise=.25f, yoloConfidence=.82f, processNoise=.45f;
        public float predictionHorizon=.65f, laserDwell=.35f, learningRate=.08f;
        public int targetTags=10;

        public void ResetDefaults()
        {
            enabled=learn=autoSensors=true;activity=AdaptiveActivity.Duel;
            blueEffector=ToyEffectorKind.FoamDart;redEffector=ToyEffectorKind.LaserTag;
            blueSensors=redSensors=SensorKind.Camera|SensorKind.Yolo|SensorKind.Range|SensorKind.Imu;
            cameraNoise=.7f;rangeNoise=.25f;yoloConfidence=.82f;processNoise=.45f;
            predictionHorizon=.65f;laserDwell=.35f;learningRate=.08f;targetTags=10;
        }
        public void Validate()
        {
            if(!Enum.IsDefined(typeof(AdaptiveActivity),activity)||!Enum.IsDefined(typeof(ToyEffectorKind),blueEffector)||
               !Enum.IsDefined(typeof(ToyEffectorKind),redEffector))throw new ArgumentException("Invalid adaptive lab mode.");
            cameraNoise=Mathf.Clamp(cameraNoise,.01f,8);rangeNoise=Mathf.Clamp(rangeNoise,.01f,4);
            yoloConfidence=Mathf.Clamp01(yoloConfidence);processNoise=Mathf.Clamp(processNoise,.001f,8);
            predictionHorizon=Mathf.Clamp(predictionHorizon,.05f,3);laserDwell=Mathf.Clamp(laserDwell,.05f,2);
            learningRate=Mathf.Clamp(learningRate,.001f,.5f);targetTags=Mathf.Clamp(targetTags,1,100);
        }
    }

    [Serializable] public struct SensorObservation
    {
        public float time, confidence, variance;
        public int observer, target;
        public SensorKind sensors;
        public Vector3 position, velocity;
        public bool detected;
    }

    [Serializable] public struct AdaptiveTrainingSample
    {
        public float time, uncertainty, reward;
        public int agent,target;
        public SensorKind sensors;
        public ToyEffectorKind effector;
        public Vector3 estimatedPosition, estimatedVelocity, aimPoint, action;
        public bool fired, hit, lockLost;
    }

    public sealed class TargetTrack
    {
        public bool valid;
        public Vector3 position,velocity;
        public float positionVariance=16,velocityVariance=9,lastTime;

        public void Predict(float dt,float processNoise)
        {
            if(!valid||dt<=0)return;
            position+=velocity*dt;
            positionVariance+=dt*dt*velocityVariance+processNoise*dt;
            velocityVariance+=processNoise*dt*.35f;
        }

        public void Update(Vector3 measurement,float measurementVariance,float time)
        {
            measurementVariance=Mathf.Max(.0001f,measurementVariance);
            if(!valid)
            {
                valid=true;position=measurement;velocity=Vector3.zero;
                positionVariance=measurementVariance;velocityVariance=9;lastTime=time;return;
            }
            float dt=Mathf.Max(.001f,time-lastTime);
            Vector3 innovation=measurement-position;
            float k=positionVariance/(positionVariance+measurementVariance);
            position+=innovation*k;
            Vector3 measuredVelocity=innovation/dt;
            float kv=velocityVariance/(velocityVariance+measurementVariance/(dt*dt));
            velocity=Vector3.Lerp(velocity,velocity+measuredVelocity,Mathf.Clamp01(kv*.35f));
            positionVariance=Mathf.Max(.001f,(1-k)*positionVariance);
            velocityVariance=Mathf.Max(.001f,(1-kv)*velocityVariance);
            lastTime=time;
        }

        public Vector3 Project(float seconds)=>position+velocity*Mathf.Max(0,seconds);
        public float Uncertainty=>Mathf.Sqrt(Mathf.Max(0,positionVariance));
    }

    public sealed class AdaptivePolicy
    {
        public float aggression=.55f,dodge=.55f,leadGain=1f,conservation=.5f,confidenceGate=.35f;
        public int SamplesSeen {get;private set;}

        public void Learn(IReadOnlyList<AdaptiveTrainingSample> samples,float rate)
        {
            if(samples==null||samples.Count==0)return;
            float hit=0,spent=0,survival=0,uncertainty=0;
            foreach(var s in samples)
            {
                if(s.fired){spent++;if(s.hit)hit++;}
                survival+=s.reward>0?1:0;uncertainty+=s.uncertainty;
            }
            float accuracy=spent<=0?.5f:hit/spent;
            float meanUncertainty=uncertainty/Mathf.Max(1,samples.Count);
            aggression=Mathf.Clamp01(aggression+(accuracy-.5f)*rate);
            conservation=Mathf.Clamp01(conservation+(.55f-accuracy)*rate);
            dodge=Mathf.Clamp01(dodge+(survival/samples.Count-.5f)*rate*.5f);
            leadGain=Mathf.Clamp(leadGain+(accuracy-.5f)*rate*.2f,.65f,1.35f);
            confidenceGate=Mathf.Clamp01(confidenceGate+(meanUncertainty>4?.08f:-.03f)*rate);
            SamplesSeen+=samples.Count;
        }
    }

    public sealed class AdaptiveDuelLab
    {
        readonly Dictionary<long,TargetTrack> tracks=new Dictionary<long,TargetTrack>();
        readonly List<AdaptiveTrainingSample> samples=new List<AdaptiveTrainingSample>(4096);
        readonly AdaptivePolicy[] policies={new AdaptivePolicy(),new AdaptivePolicy()};
        AdaptiveLabSettings settings;
        int seed;

        public IReadOnlyList<AdaptiveTrainingSample> Samples=>samples;
        public AdaptivePolicy Policy(int team)=>policies[Mathf.Clamp(team,0,1)];

        public void Reset(AdaptiveLabSettings config,int deterministicSeed=1337)
        {
            settings=config;settings?.Validate();seed=deterministicSeed;tracks.Clear();samples.Clear();
        }

        static long Key(int observer,int target)=>((long)observer<<32)|(uint)target;
        TargetTrack Track(int observer,int target)
        {
            long key=Key(observer,target);
            if(!tracks.TryGetValue(key,out var track)){track=new TargetTrack();tracks[key]=track;}
            return track;
        }

        public SensorKind SensorsFor(int team)=>settings==null?SensorKind.None:(team==0?settings.blueSensors:settings.redSensors);
        public ToyEffectorKind EffectorFor(int team)=>settings==null?ToyEffectorKind.FoamDart:(team==0?settings.blueEffector:settings.redEffector);

        public SensorObservation Observe(DroneState observer,DroneState target,float time,float dt)
        {
            var sensors=SensorsFor(observer.fleetId);
            var track=Track(observer.id,target.id);track.Predict(dt,settings.processNoise);
            float distance=Vector3.Distance(observer.position,target.position);
            bool camera=(sensors&SensorKind.Camera)!=0;
            bool yolo=(sensors&SensorKind.Yolo)!=0;
            bool range=(sensors&SensorKind.Range)!=0;
            float confidence=camera?Mathf.Clamp01(1-distance/180f):.15f;
            if(yolo)confidence=Mathf.Clamp01(confidence*.65f+settings.yoloConfidence*.35f);
            if((sensors&SensorKind.Thermal)!=0)confidence=Mathf.Max(confidence,distance<130?.72f:.25f);
            if((sensors&SensorKind.RF)!=0)confidence=Mathf.Max(confidence,distance<220?.62f:.2f);
            float pseudo=PseudoNoise(observer.id,target.id,time);
            bool detected=confidence>Policy(observer.fleetId).confidenceGate && pseudo<confidence;
            float variance=settings.cameraNoise*settings.cameraNoise;
            if(range)variance=Mathf.Min(variance,settings.rangeNoise*settings.rangeNoise);
            if(yolo)variance*=Mathf.Lerp(1,.45f,settings.yoloConfidence);
            Vector3 measured=target.position+NoiseVector(observer.id,target.id,time)*Mathf.Sqrt(variance);
            if(detected)track.Update(measured,variance,time);
            return new SensorObservation{time=time,observer=observer.id,target=target.id,sensors=sensors,confidence=confidence,variance=variance,position=track.position,velocity=track.velocity,detected=detected};
        }

        public Vector3 AimPoint(DroneState observer,DroneState target,float time)
        {
            var track=Track(observer.id,target.id);
            if(!track.valid)return target.position;
            float distance=Vector3.Distance(observer.position,track.position);
            var effector=EffectorFor(observer.fleetId);
            float horizon=settings.predictionHorizon;
            switch(effector)
            {
                case ToyEffectorKind.FoamDart:horizon=Mathf.Clamp(distance/32f,.08f,1.8f);break;
                case ToyEffectorKind.Water:horizon=Mathf.Clamp(distance/22f,.08f,1.2f);break;
                case ToyEffectorKind.Net:horizon=Mathf.Clamp(distance/18f,.05f,.65f);break;
                case ToyEffectorKind.Ram:horizon=Mathf.Clamp(distance/Mathf.Max(6,observer.velocity.magnitude+8),.05f,1f);break;
                case ToyEffectorKind.LaserTag:horizon=settings.laserDwell*.5f;break;
            }
            return track.Project(horizon*Policy(observer.fleetId).leadGain);
        }

        public bool ShouldEngage(DroneState observer,DroneState target)
        {
            var track=Track(observer.id,target.id);if(!track.valid)return false;
            float d=Vector3.Distance(observer.position,track.position);
            float range=EffectorFor(observer.fleetId) switch
            {
                ToyEffectorKind.Net=>16,
                ToyEffectorKind.Ram=>7,
                ToyEffectorKind.Water=>24,
                ToyEffectorKind.LaserTag=>80,
                _=>45
            };
            float confidence=1/(1+track.Uncertainty);
            return d<=range && confidence>=Policy(observer.fleetId).confidenceGate && UnityEngine.Random.value>Policy(observer.fleetId).conservation*.08f;
        }

        public void Log(int agent,int target,int team,Vector3 aimPoint,Vector3 action,bool fired,bool hit,bool lockLost,float reward)
        {
            var track=Track(agent,target);
            if(samples.Count>=4096)samples.RemoveRange(0,512);
            samples.Add(new AdaptiveTrainingSample{
                time=track.lastTime,agent=agent,target=target,sensors=SensorsFor(team),effector=EffectorFor(team),
                estimatedPosition=track.position,estimatedVelocity=track.velocity,uncertainty=track.Uncertainty,
                aimPoint=aimPoint,action=action,fired=fired,hit=hit,lockLost=lockLost,reward=reward
            });
        }

        public void LearnRound()
        {
            if(settings==null||!settings.learn||samples.Count==0)return;
            for(int team=0;team<2;team++)
            {
                var teamSamples=new List<AdaptiveTrainingSample>();
                foreach(var sample in samples)if(sample.agent>=0 && sample.agent%2==team)teamSamples.Add(sample);
                policies[team].Learn(teamSamples,settings.learningRate);
            }
        }

        public bool TryGetTrack(int observer,int target,out TargetTrack track)=>tracks.TryGetValue(Key(observer,target),out track)&&track.valid;

        float PseudoNoise(int a,int b,float time)
        {
            unchecked{int t=Mathf.FloorToInt(time*37);uint x=(uint)(a*73856093^b*19349663^t*83492791^seed);x^=x<<13;x^=x>>17;x^=x<<5;return (x&0x00ffffff)/16777215f;}
        }
        Vector3 NoiseVector(int a,int b,float time)
        {
            return new Vector3(PseudoNoise(a,b,time)-.5f,PseudoNoise(a+17,b+7,time+.17f)-.5f,PseudoNoise(a+31,b+13,time+.31f)-.5f)*2;
        }
    }
}

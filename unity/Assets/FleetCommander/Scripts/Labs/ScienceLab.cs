using System;
using System.IO;
using System.Text;
using UnityEngine;
using FleetCommander.Core;
namespace FleetCommander.Labs
{
    public enum ScienceView { InfluenceField, HarmonicOscillator, LorenzAttractor }
    public sealed class ScienceLab
    {
        public ScienceView view;
        public bool vectors,trace=true,axes=true,paused;
        public float previewTime,amplitude=15,frequency=1,sigma=10,rho=28,beta=2.666667f;
        public static string Formula(InfluenceKind kind)
        {
            switch(kind){case InfluenceKind.Vortex:return "normalize((-z/20, sin(a+x/20), x/20))";case InfluenceKind.Attract:return "-normalize(p)";case InfluenceKind.Repel:return "normalize(p)";case InfluenceKind.Wave:return "(0, sin(a+x/20), 0)";case InfluenceKind.Lissajous:return "(sin(2a+0.1i), sin(3a+0.1i), cos(a))";case InfluenceKind.Spiral:return "(cos(a+0.15i), sin(a+x/20), sin(a+0.15i))";case InfluenceKind.Braid:return "(sin(a+z/20), cos(a+2.094(i mod 3)), 0)";case InfluenceKind.Twin:return "((-1 if i even else 1) sin(a), cos(a+x/20), 0)";case InfluenceKind.Square:return "(sign(sin(a+x/20)), 0, sign(sin(a+z/20)))";case InfluenceKind.Riemann:return "(sin(X²-Z²+a), sin(2XZ+a), cos(X²+Z²-a)); X=x/20, Z=z/20";default:return "(0, 0, 0)";}
        }
        public static Vector3 Field(FleetConfig c,Vector3 p,int i,float time){Vector3 v=Vector3.zero;foreach(var l in c.layers)v+=FormationMath.Influence(l,p,i,time);return Vector3.ClampMagnitude(v,32);}
        public string Description(FleetConfig c)
        {
            if(view==ScienceView.HarmonicOscillator)return "Harmonic oscillator\nx(t)=A cos(ωt), v(t)=-Aω sin(ωt)\nx''(t)=-ω²x(t)\nA="+amplitude.ToString("F1")+" m; ω="+frequency.ToString("F2")+" rad/s. Phase plot: position vs velocity.\nThis analytical preview is separate from the drone flight solver.";
            if(view==ScienceView.LorenzAttractor)return "Lorenz system\ndx/dt=σ(y-x)\ndy/dt=x(ρ-z)-y\ndz/dt=xy-βz\nσ="+sigma.ToString("F2")+", ρ="+rho.ToString("F2")+", β="+beta.ToString("F3")+"\nRK4 integration, h=0.01. Dimensionless teaching model; not weather prediction.";
            var s=new StringBuilder("ACTIVE FORMATION INFLUENCES\na=t × frequency + phase; displacement=strength × blend × vector\n");
            for(int i=0;i<c.layers.Length;i++){var l=c.layers[i];s.Append("\nLayer ").Append(i+1).Append(": ").Append(l.kind).Append(" · strength ").Append(l.strength.ToString("F1")).Append(" · blend ").Append(l.blend.ToString("F2")).Append("\nf=").Append(l.frequency.ToString("F2")).Append("; phase=").Append(l.phase.ToString("F2")).Append("\n").Append(Formula(l.kind)).Append('\n');}
            s.Append("\nThe summed displacement is clamped to 32 m, then added to the transformed formation slot. These are target-position offsets, not physical forces. Riemann is a named complex-square-inspired deformation, not a Riemann tensor solver.\nBoids separately adds separation, alignment and cohesion to steering acceleration.");return s.ToString();
        }
        Vector3 Derivative(Vector3 p)=>new Vector3(sigma*(p.y-p.x),p.x*(rho-p.z)-p.y,p.x*p.y-beta*p.z);
        public Vector3 LorenzStep(Vector3 p,float dt){var a=Derivative(p);var b=Derivative(p+a*dt*.5f);var c=Derivative(p+b*dt*.5f);var d=Derivative(p+c*dt);return p+(a+2*b+2*c+d)*(dt/6);}
        public Vector3[] Curve(int count=600)
        {
            var p=new Vector3[count];Vector3 v=new Vector3(.1f,0,0);
            for(int i=0;i<count;i++){if(view==ScienceView.LorenzAttractor){for(int j=0;j<3;j++)v=LorenzStep(v,.01f);p[i]=new Vector3(v.x,v.z-25,v.y);}else{float t=i*.025f;p[i]=new Vector3(amplitude*Mathf.Cos(frequency*t),-amplitude*frequency*Mathf.Sin(frequency*t),0);}}
            return p;
        }
        public string Export(FleetConfig c,string directory)
        {
            Directory.CreateDirectory(directory);var template=Resources.Load<TextAsset>("SciencePython");if(!template)throw new InvalidOperationException("Python example asset is missing.");
            var data=new ExportData{layers=c.layers,time=previewTime,amplitude=amplitude,frequency=frequency,sigma=sigma,rho=rho,beta=beta};
            string path=Path.Combine(directory,"fleet_science.py");File.WriteAllText(path,template.text.Replace("__CONFIG_JSON__",JsonUtility.ToJson(data)));File.WriteAllText(Path.Combine(directory,"formulas.txt"),Description(c));return path;
        }
        [Serializable] sealed class ExportData {public InfluenceLayer[] layers;public float time,amplitude,frequency,sigma,rho,beta;}
    }
}

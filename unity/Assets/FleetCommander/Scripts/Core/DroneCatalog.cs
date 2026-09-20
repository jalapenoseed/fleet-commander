using UnityEngine;

namespace FleetCommander.Core
{
    public enum SkinKind { Graphite, Arctic, Desert, Crimson, Cobalt, Industrial }
    public enum WeaponKind { Pulse, RapidFire, Scatter, Shockwave, PrecisionBeam, IonDisruptor, BurstTagger, ArcLink, Repulsor, DrainRay }

    // Deliberately game-balanced profiles, not specifications for real aircraft or weapons.
    public readonly struct DroneProfile
    {
        public readonly string name;
        public readonly float speed, agility, armor, energy, mass;
        public DroneProfile(string name, float speed, float agility, float armor, float energy, float mass)
        { this.name=name; this.speed=speed; this.agility=agility; this.armor=armor; this.energy=energy; this.mass=mass; }
    }
    public readonly struct WeaponProfile
    {
        public readonly float range, damage, interval, cone;
        public readonly int targets, magazine, reserve;
        public readonly float energy, heat, reload;
        public WeaponProfile(float range, float damage, float interval, float cone, int targets,int magazine=24,int reserve=120,float energy=.0006f,float heat=.08f,float reload=1.8f)
        { this.range=range; this.damage=damage; this.interval=interval; this.cone=cone; this.targets=targets;this.magazine=magazine;this.reserve=reserve;this.energy=energy;this.heat=heat;this.reload=reload; }
    }
    public static class DroneCatalog
    {
        public static DroneProfile Profile(FrameKind frame)
        {
            switch(frame)
            {
                case FrameKind.Relay: return new DroneProfile("Relay", .9f, .82f, 1.12f, .88f, 1.1f);
                case FrameKind.Cargo: return new DroneProfile("Cargo", .65f, .62f, 1.55f, 1.35f, 1.75f);
                case FrameKind.Utility: return new DroneProfile("Utility", .85f, .9f, 1.25f, 1.08f, 1.28f);
                default: return new DroneProfile("Scout", 1.15f, 1.25f, .88f, .92f, .84f);
            }
        }
        public static WeaponProfile Weapon(WeaponKind weapon)
        {
            switch(weapon)
            {
                case WeaponKind.RapidFire: return new WeaponProfile(32, .4f, .27f, .986f, 1,60,240,.0003f,.035f,2.1f);
                case WeaponKind.Scatter: return new WeaponProfile(23, .74f, 1.45f, .86f, 3,8,48,.001f,.18f,2.5f);
                case WeaponKind.Shockwave: return new WeaponProfile(15, 1.7f, 2.7f, -1, 256,4,16,.003f,.32f,3.5f);
                case WeaponKind.PrecisionBeam:return new WeaponProfile(64,2.8f,2.2f,.999f,1,6,36,.002f,.24f,2.8f);
                case WeaponKind.IonDisruptor:return new WeaponProfile(28,.6f,1.7f,.993f,1,12,60,.002f,.16f,2.4f);
                case WeaponKind.BurstTagger:return new WeaponProfile(35,.62f,.38f,.99f,1,30,150,.0005f,.055f,2.2f);
                case WeaponKind.ArcLink:return new WeaponProfile(21,.55f,1.4f,.90f,3,15,75,.002f,.2f,2.6f);
                case WeaponKind.Repulsor:return new WeaponProfile(18,.5f,1.8f,.8f,3,10,50,.001f,.14f,2.1f);
                case WeaponKind.DrainRay:return new WeaponProfile(24,.3f,.6f,.992f,1,40,160,.0004f,.055f,2.3f);
                default: return new WeaponProfile(38, 1.25f, 1, .99f, 1);
            }
        }
        public static Color SkinColor(SkinKind skin)
        {
            switch(skin)
            {
                case SkinKind.Arctic: return new Color(.78f,.84f,.89f);
                case SkinKind.Desert: return new Color(.65f,.48f,.29f);
                case SkinKind.Crimson: return new Color(.55f,.075f,.065f);
                case SkinKind.Cobalt: return new Color(.055f,.2f,.55f);
                case SkinKind.Industrial: return new Color(.94f,.57f,.045f);
                default: return new Color(.11f,.14f,.18f);
            }
        }
    }
}

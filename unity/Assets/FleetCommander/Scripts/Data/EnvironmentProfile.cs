using UnityEngine;

namespace FleetCommander.Data
{
    [CreateAssetMenu(menuName = "Fleet Commander/Environment Profile", fileName = "EnvironmentProfile")]
    public sealed class EnvironmentProfile : ScriptableObject
    {
        public string displayName = "Earth";
        public float gravityMps2 = 9.80665f;
        [Min(0f)] public float atmosphereDensityKgM3 = 1.225f;
        public bool constrainedRotorFlight = true;
        public bool arcadeLift;
    }
}

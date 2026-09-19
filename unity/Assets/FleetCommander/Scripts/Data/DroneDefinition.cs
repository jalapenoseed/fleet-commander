using UnityEngine;

namespace FleetCommander.Data
{
    [CreateAssetMenu(menuName = "Fleet Commander/Drone Definition", fileName = "DroneDefinition")]
    public sealed class DroneDefinition : ScriptableObject
    {
        public string displayName = "Scout";
        [Min(0.01f)] public float massKg = 1f;
        [Min(0f)] public float batteryWh = 80f;
        [Min(0f)] public float hoverPowerW = 180f;
        [Min(0f)] public float maxSpeedMps = 18f;
        [Min(0f)] public float beaconIntensity = 1f;
        public GameObject visualPrefab;
    }
}

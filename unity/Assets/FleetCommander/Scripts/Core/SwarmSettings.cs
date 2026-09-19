using UnityEngine;

namespace FleetCommander.Core
{
    [CreateAssetMenu(menuName = "Fleet Commander/Swarm Settings", fileName = "SwarmSettings")]
    public sealed class SwarmSettings : ScriptableObject
    {
        [Header("Simulation")]
        [Min(0.001f)] public float fixedStep = 1f / 60f;
        [Min(0f)] public float maxSpeed = 18f;
        [Min(0f)] public float maxAcceleration = 25f;

        [Header("Boids")]
        [Min(0f)] public float neighborRadius = 8f;
        [Min(0f)] public float separationRadius = 2f;
        [Min(0f)] public float separationWeight = 1.5f;
        [Min(0f)] public float alignmentWeight = 0.7f;
        [Min(0f)] public float cohesionWeight = 0.8f;
        [Min(0f)] public float targetWeight = 1.2f;

        [Header("Energy")]
        [Min(0f)] public float idleDrainPerSecond = 0.00015f;
        [Min(0f)] public float motionDrainPerMeter = 0.00002f;
    }
}

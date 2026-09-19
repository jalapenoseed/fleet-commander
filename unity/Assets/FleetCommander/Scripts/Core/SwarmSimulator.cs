using System.Collections.Generic;
using UnityEngine;

namespace FleetCommander.Core
{
    public sealed class SwarmSimulator : MonoBehaviour
    {
        [SerializeField] private SwarmSettings settings;
        [SerializeField, Min(0)] private int initialDroneCount = 24;
        [SerializeField] private Transform dronePrefab;
        [SerializeField] private Vector3 formationOrigin = new Vector3(0f, 12f, 0f);
        [SerializeField] private float formationSpacing = 3f;

        public BehaviorStack Behaviors;
        public IReadOnlyList<DroneState> States => states;

        private readonly List<DroneState> states = new();
        private readonly List<Transform> views = new();
        private float accumulator;

        private void Awake()
        {
            if (settings == null)
            {
                settings = ScriptableObject.CreateInstance<SwarmSettings>();
            }

            Behaviors.SetOnly(
                SwarmBehavior.Separation |
                SwarmBehavior.Alignment |
                SwarmBehavior.Cohesion |
                SwarmBehavior.Formation);

            Resize(initialDroneCount);
        }

        private void Update()
        {
            accumulator += Time.deltaTime;
            float dt = Mathf.Max(0.001f, settings.fixedStep);

            while (accumulator >= dt)
            {
                Step(dt);
                accumulator -= dt;
            }

            SyncViews();
        }

        public void Resize(int count)
        {
            count = Mathf.Max(0, count);

            while (states.Count < count)
            {
                int id = states.Count;
                Vector3 spawn = formationOrigin + FormationMath.Grid(id, count, formationSpacing);
                states.Add(DroneState.Create(id, 0, spawn));

                if (dronePrefab != null)
                {
                    Transform instance = Instantiate(dronePrefab, spawn, Quaternion.identity, transform);
                    instance.name = $"Drone_{id:0000}";
                    views.Add(instance);
                }
                else
                {
                    views.Add(null);
                }
            }

            while (states.Count > count)
            {
                int last = states.Count - 1;
                if (views[last] != null) Destroy(views[last].gameObject);
                views.RemoveAt(last);
                states.RemoveAt(last);
            }
        }

        public void LaunchAll()
        {
            for (int i = 0; i < states.Count; i++)
            {
                DroneState s = states[i];
                if (!s.disabled) s.airborne = true;
                states[i] = s;
            }
        }

        public void LandAll()
        {
            for (int i = 0; i < states.Count; i++)
            {
                DroneState s = states[i];
                s.airborne = false;
                s.velocity = Vector3.zero;
                states[i] = s;
            }
        }

        public void ClearBehaviors() => Behaviors.Clear();

        private void Step(float dt)
        {
            int count = states.Count;
            if (count == 0) return;

            for (int i = 0; i < count; i++)
            {
                DroneState s = states[i];
                if (!s.airborne || s.disabled || s.battery01 <= 0f) continue;

                Vector3 force = Vector3.zero;
                Vector3 center = Vector3.zero;
                Vector3 avgVelocity = Vector3.zero;
                Vector3 separation = Vector3.zero;
                int neighbors = 0;

                for (int j = 0; j < count; j++)
                {
                    if (i == j) continue;
                    DroneState other = states[j];
                    float d = Vector3.Distance(s.position, other.position);
                    if (d > settings.neighborRadius) continue;

                    center += other.position;
                    avgVelocity += other.velocity;
                    neighbors++;

                    if (d > 0.0001f && d < settings.separationRadius)
                    {
                        separation += (s.position - other.position) / d;
                    }
                }

                if (neighbors > 0)
                {
                    center /= neighbors;
                    avgVelocity /= neighbors;

                    if (Behaviors.Has(SwarmBehavior.Separation))
                        force += separation * settings.separationWeight;

                    if (Behaviors.Has(SwarmBehavior.Alignment))
                        force += (avgVelocity - s.velocity) * settings.alignmentWeight;

                    if (Behaviors.Has(SwarmBehavior.Cohesion))
                        force += (center - s.position) * settings.cohesionWeight;
                }

                if (Behaviors.Has(SwarmBehavior.Formation))
                {
                    Vector3 target = formationOrigin + FormationMath.Grid(i, count, formationSpacing);
                    force += (target - s.position) * settings.targetWeight;
                }

                s.acceleration = Vector3.ClampMagnitude(force, settings.maxAcceleration);
                s.velocity = Vector3.ClampMagnitude(s.velocity + s.acceleration * dt, settings.maxSpeed);
                Vector3 old = s.position;
                s.position += s.velocity * dt;

                if (s.velocity.sqrMagnitude > 0.01f)
                {
                    s.rotation = Quaternion.Slerp(
                        s.rotation,
                        Quaternion.LookRotation(s.velocity.normalized, Vector3.up),
                        1f - Mathf.Exp(-8f * dt));
                }

                float traveled = Vector3.Distance(old, s.position);
                s.battery01 = Mathf.Max(
                    0f,
                    s.battery01 - settings.idleDrainPerSecond * dt - settings.motionDrainPerMeter * traveled);

                if (s.battery01 <= 0f)
                {
                    s.airborne = false;
                    s.velocity = Vector3.zero;
                }

                states[i] = s;
            }
        }

        private void SyncViews()
        {
            for (int i = 0; i < states.Count && i < views.Count; i++)
            {
                Transform view = views[i];
                if (view == null) continue;
                DroneState s = states[i];
                view.SetPositionAndRotation(s.position, s.rotation);
                view.gameObject.SetActive(!s.disabled);
            }
        }
    }
}

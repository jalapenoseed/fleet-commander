using System;
using UnityEngine;

namespace FleetCommander.Core
{
    [Flags]
    public enum SwarmBehavior
    {
        None = 0,
        Separation = 1 << 0,
        Alignment = 1 << 1,
        Cohesion = 1 << 2,
        Formation = 1 << 3,
        Orbit = 1 << 4,
        Follow = 1 << 5,
        InfluenceField = 1 << 6
    }

    [Serializable]
    public struct BehaviorStack
    {
        public SwarmBehavior active;

        public bool Has(SwarmBehavior behavior) => (active & behavior) != 0;

        public void SetOnly(SwarmBehavior behavior)
        {
            active = behavior;
        }

        public void Add(SwarmBehavior behavior)
        {
            active |= behavior;
        }

        public void Remove(SwarmBehavior behavior)
        {
            active &= ~behavior;
        }

        public void Clear()
        {
            active = SwarmBehavior.None;
        }
    }
}

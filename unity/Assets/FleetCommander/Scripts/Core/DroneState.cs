using System;
using UnityEngine;

namespace FleetCommander.Core
{
    [Serializable]
    public struct DroneState
    {
        public int id;
        public int fleetId;
        public Vector3 position;
        public Vector3 velocity;
        public Vector3 acceleration;
        public Quaternion rotation;
        public float battery01;
        public float massKg;
        public bool airborne;
        public bool disabled;

        public static DroneState Create(int id, int fleetId, Vector3 position)
        {
            return new DroneState
            {
                id = id,
                fleetId = fleetId,
                position = position,
                velocity = Vector3.zero,
                acceleration = Vector3.zero,
                rotation = Quaternion.identity,
                battery01 = 1f,
                massKg = 1f,
                airborne = false,
                disabled = false
            };
        }
    }
}

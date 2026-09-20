using System;
using UnityEngine;
namespace FleetCommander.Core
{
    public enum FlightPhase { Grounded, Flying, Returning, Falling, Wreck }
    [Serializable] public struct DroneState
    {
        public int id, fleetId, palette;
        public FrameKind frame;
        public SkinKind skin;
        public WeaponKind weapon;
        public int kills;
        public float destructionAge;
        public Vector3 position, velocity, acceleration, home, target;
        public Quaternion rotation;
        public float battery01, massKg, health, cooldown;
        public int payloads;
        public int ammoCapacity;public float reloadSeconds;
        public int ammo, reserveAmmo, combo, shotsFired, hitsLanded;
        public bool resourcesInitialized, guarding;
        public float stamina, heat, reloadTime, abilityCooldown, guardAge, stunTime, hitAge, comboWindow;
        public Vector3 hitDirection;
        public string aiState;
        public FlightPhase phase;
        public bool airborne => phase == FlightPhase.Flying || phase == FlightPhase.Returning || phase == FlightPhase.Falling;
        public bool disabled => phase == FlightPhase.Wreck || health <= 0;
        public static DroneState Create(int id, int fleetId, Vector3 position) => new DroneState
        {
            id = id, fleetId = fleetId, palette = id % 9, position = position, home = position, target = position,
            rotation = Quaternion.identity, battery01 = 1, massKg = .65f, health = 100, payloads = 3,
            frame = (FrameKind)(id % 4), skin = (SkinKind)(id % 6), weapon = WeaponKind.Pulse, phase = FlightPhase.Grounded
        };
    }
}

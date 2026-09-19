using FleetCommander.Core;
using UnityEngine;

namespace FleetCommander.Cameras
{
    public sealed class DroneCameraRig : MonoBehaviour
    {
        [SerializeField] private SwarmSimulator simulator;
        [SerializeField] private int droneIndex;
        [SerializeField] private Vector3 localOffset = new Vector3(0f, 0.12f, -0.35f);
        [SerializeField] private float positionSharpness = 18f;
        [SerializeField] private float rotationSharpness = 14f;

        private void LateUpdate()
        {
            if (simulator == null || simulator.States.Count == 0) return;

            droneIndex = Mathf.Clamp(droneIndex, 0, simulator.States.Count - 1);
            DroneState s = simulator.States[droneIndex];
            Vector3 desiredPosition = s.position + s.rotation * localOffset;

            float p = 1f - Mathf.Exp(-positionSharpness * Time.deltaTime);
            float r = 1f - Mathf.Exp(-rotationSharpness * Time.deltaTime);

            transform.position = Vector3.Lerp(transform.position, desiredPosition, p);
            transform.rotation = Quaternion.Slerp(transform.rotation, s.rotation, r);
        }

        public void SetDrone(int index) => droneIndex = Mathf.Max(0, index);
    }
}

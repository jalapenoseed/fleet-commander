using FleetCommander.Core;
using NUnit.Framework;
using UnityEngine;

namespace FleetCommander.Tests
{
    public sealed class FormationMathTests
    {
        [Test]
        public void Grid_IsFinite_ForLargeFleet()
        {
            const int count = 10000;
            for (int i = 0; i < count; i++)
            {
                Vector3 p = FormationMath.Grid(i, count, 2f);
                Assert.IsFalse(float.IsNaN(p.x) || float.IsNaN(p.y) || float.IsNaN(p.z));
            }
        }

        [Test]
        public void Ring_ReturnsRequestedRadius()
        {
            Vector3 p = FormationMath.Ring(3, 16, 25f);
            Assert.That(p.magnitude, Is.EqualTo(25f).Within(0.001f));
        }

        [Test]
        public void BehaviorStack_Clear_RemovesStickyState()
        {
            BehaviorStack stack = new BehaviorStack();
            stack.Add(SwarmBehavior.Orbit);
            stack.Add(SwarmBehavior.Formation);
            stack.Clear();
            Assert.AreEqual(SwarmBehavior.None, stack.active);
        }
    }
}

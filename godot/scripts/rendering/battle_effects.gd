class_name BattleEffects
extends Node3D

## Small, bounded visual effect pool for impacts and crashes.
## These flashes are cosmetic. Damage is calculated once in CombatSystem.

const POOL_SIZE := 40

var _slots: Array[Dictionary] = []
var _last_event_id := 0
var _cursor := 0


func _ready() -> void:
	for index in POOL_SIZE:
		var mesh_instance := MeshInstance3D.new()
		mesh_instance.name = "Effect%02d" % index
		var sphere := SphereMesh.new()
		sphere.radius = 0.5
		sphere.height = 1.0
		sphere.radial_segments = 8
		sphere.rings = 4
		var material := StandardMaterial3D.new()
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		material.albedo_color = Color(1.0, 0.45, 0.08, 0.0)
		sphere.material = material
		mesh_instance.mesh = sphere
		mesh_instance.visible = false
		add_child(mesh_instance)
		_slots.append({"node": mesh_instance, "age": 0.0, "life": 0.0, "kind": &"impact"})


func sync_events(events: Array) -> void:
	for raw_event in events:
		if not raw_event is Dictionary:
			continue
		var event: Dictionary = raw_event
		var event_id := int(event.get("id", 0))
		if event_id <= _last_event_id:
			continue
		_last_event_id = event_id
		var kind := StringName(event.get("type", &""))
		if kind in [&"impact", &"collision", &"blast", &"explosion", &"destroy", &"wreck"]:
			_spawn(kind, event.get("position", Vector3.ZERO))


func reset() -> void:
	_last_event_id = 0
	for slot in _slots:
		var node: MeshInstance3D = slot.node
		node.visible = false
		slot.age = 0.0
		slot.life = 0.0


func _process(delta: float) -> void:
	for slot in _slots:
		var node: MeshInstance3D = slot.node
		if not node.visible:
			continue
		slot.age = float(slot.age) + delta
		var fraction := clampf(float(slot.age) / maxf(0.001, float(slot.life)), 0.0, 1.0)
		var kind: StringName = slot.kind
		var end_scale := 8.0 if kind in [&"explosion", &"destroy", &"blast"] else 2.5
		node.scale = Vector3.ONE * lerpf(0.25, end_scale, fraction)
		var material := node.get_active_material(0) as StandardMaterial3D
		if material:
			var color := Color(1.0, 0.42, 0.08, 1.0 - fraction)
			if kind in [&"impact", &"collision"]:
				color = Color(1.0, 0.88, 0.45, 1.0 - fraction)
			material.albedo_color = color
		if fraction >= 1.0:
			node.visible = false


func _spawn(kind: StringName, position: Variant) -> void:
	var slot := _slots[_cursor]
	_cursor = (_cursor + 1) % _slots.size()
	var node: MeshInstance3D = slot.node
	node.position = position if position is Vector3 else Vector3.ZERO
	node.scale = Vector3.ONE * 0.25
	node.visible = true
	slot.age = 0.0
	slot.life = 0.75 if kind in [&"explosion", &"destroy", &"blast"] else 0.28
	slot.kind = kind

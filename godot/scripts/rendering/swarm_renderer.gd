class_name SwarmRenderer
extends Node3D

## Draws the complete fleet with two MultiMeshes.
##
## ELI5: A normal Godot node for every aircraft would mean 10,000 little scene
## trees. MultiMesh sends one big batch to the graphics card instead. The
## simulation still keeps every aircraft's own position, velocity, battery and
## orders; this class only draws those numbers.

const FIELD_AABB := AABB(Vector3(-1100.0, -12.0, -1100.0), Vector3(2200.0, 370.0, 2200.0))
const MODE_WRECK := 7

var simulation: Variant
var display_state: Dictionary = {}
var selected_index := 0
var hidden_index := -1
var _capacity := 0

var _body_instance: MultiMeshInstance3D
var _beacon_instance: MultiMeshInstance3D
var _selection_marker: MeshInstance3D
var _body_multimesh: MultiMesh
var _beacon_multimesh: MultiMesh


func _ready() -> void:
	_build_renderer()


func set_simulation(value: Variant) -> void:
	simulation = value


func set_display_state(value: Dictionary) -> void:
	display_state = value


func clear_display_state() -> void:
	display_state = {}


func set_selected_index(value: int) -> void:
	selected_index = maxi(0, value)


func set_hidden_index(value: int) -> void:
	hidden_index = value


func sync_from_simulation() -> void:
	var state := display_state
	if state.is_empty() and simulation != null and simulation.has_method("render_state"):
		state = simulation.render_state()
	sync_state(state)


func sync_state(state: Dictionary) -> void:
	if not is_inside_tree():
		return
	var positions: PackedVector3Array = state.get("positions", PackedVector3Array())
	var velocities: PackedVector3Array = state.get("velocities", PackedVector3Array())
	var colors_value: Variant = state.get("colors", PackedByteArray())
	var types: PackedByteArray = state.get("types", PackedByteArray())
	var modes: PackedByteArray = state.get("modes", PackedByteArray())
	var count := mini(int(state.get("count", positions.size())), positions.size())
	_ensure_capacity(count)
	_body_multimesh.visible_instance_count = count
	_beacon_multimesh.visible_instance_count = count

	for index in count:
		var position := positions[index]
		var velocity := velocities[index] if index < velocities.size() else Vector3.ZERO
		var yaw := atan2(velocity.x, velocity.z) if velocity.length_squared() > 0.01 else 0.0
		var drone_type := int(types[index]) if index < types.size() else 0
		var scale: float = float([1.0, 1.18, 1.65, 1.12][clampi(drone_type, 0, 3)])
		if index == hidden_index:
			scale = 0.0
		var basis := Basis(Vector3.UP, yaw).scaled(Vector3.ONE * scale)
		if index < modes.size() and modes[index] == MODE_WRECK:
			basis = Basis(Vector3.FORWARD, PI * 0.5).scaled(Vector3.ONE * scale)
		var transform := Transform3D(basis, position)
		_body_multimesh.set_instance_transform(index, transform)
		_beacon_multimesh.set_instance_transform(
			index,
			Transform3D(Basis.IDENTITY.scaled(Vector3.ONE * maxf(0.0, scale)), position + Vector3.UP * 0.28 * scale)
		)
		var beacon_color := _state_color(colors_value, index)
		_body_multimesh.set_instance_color(index, beacon_color.darkened(0.52))
		_beacon_multimesh.set_instance_color(index, beacon_color)

	if selected_index >= 0 and selected_index < count:
		_selection_marker.visible = true
		_selection_marker.position = positions[selected_index] + Vector3.DOWN * 0.3
		var selected_scale := 1.2 + sin(Time.get_ticks_msec() * 0.006) * 0.12
		_selection_marker.scale = Vector3.ONE * selected_scale
	else:
		_selection_marker.visible = false


func _ensure_capacity(count: int) -> void:
	if count == _capacity:
		return
	_capacity = count
	# Godot clears MultiMesh data when instance_count changes, so resize only
	# when the player actually changes the fleet roster.
	_body_multimesh.instance_count = count
	_beacon_multimesh.instance_count = count
	_body_multimesh.visible_instance_count = count
	_beacon_multimesh.visible_instance_count = count


func _build_renderer() -> void:
	_body_instance = MultiMeshInstance3D.new()
	_body_instance.name = "DroneBodies"
	_body_instance.custom_aabb = FIELD_AABB
	_body_multimesh = MultiMesh.new()
	_body_multimesh.transform_format = MultiMesh.TRANSFORM_3D
	_body_multimesh.use_colors = true
	_body_multimesh.mesh = _make_proxy_drone_mesh()
	_body_instance.multimesh = _body_multimesh
	add_child(_body_instance)

	_beacon_instance = MultiMeshInstance3D.new()
	_beacon_instance.name = "DroneBeacons"
	_beacon_instance.custom_aabb = FIELD_AABB
	_beacon_multimesh = MultiMesh.new()
	_beacon_multimesh.transform_format = MultiMesh.TRANSFORM_3D
	_beacon_multimesh.use_colors = true
	var beacon_mesh := SphereMesh.new()
	beacon_mesh.radius = 0.11
	beacon_mesh.height = 0.22
	beacon_mesh.radial_segments = 6
	beacon_mesh.rings = 3
	var beacon_material := StandardMaterial3D.new()
	beacon_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	beacon_material.vertex_color_use_as_albedo = true
	beacon_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	beacon_material.albedo_color = Color(1.0, 1.0, 1.0, 0.94)
	beacon_mesh.material = beacon_material
	_beacon_multimesh.mesh = beacon_mesh
	_beacon_instance.multimesh = _beacon_multimesh
	add_child(_beacon_instance)

	_selection_marker = MeshInstance3D.new()
	_selection_marker.name = "SelectedAircraftMarker"
	var ring := TorusMesh.new()
	ring.inner_radius = 0.72
	ring.outer_radius = 0.9
	ring.rings = 8
	ring.ring_segments = 24
	var marker_material := StandardMaterial3D.new()
	marker_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	marker_material.albedo_color = Color(0.25, 0.95, 1.0, 0.78)
	marker_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ring.material = marker_material
	_selection_marker.mesh = ring
	_selection_marker.rotation.x = PI * 0.5
	add_child(_selection_marker)


func _make_proxy_drone_mesh() -> ArrayMesh:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	_add_box(surface, Vector3.ZERO, Vector3(0.72, 0.22, 0.92), 0.0)
	_add_box(surface, Vector3.ZERO, Vector3(1.35, 0.08, 0.11), PI * 0.25)
	_add_box(surface, Vector3.ZERO, Vector3(1.35, 0.08, 0.11), -PI * 0.25)
	for rotor in [
		Vector3(-0.48, 0.06, -0.48),
		Vector3(0.48, 0.06, -0.48),
		Vector3(-0.48, 0.06, 0.48),
		Vector3(0.48, 0.06, 0.48),
	]:
		_add_box(surface, rotor, Vector3(0.34, 0.035, 0.34), 0.0)
	var material := StandardMaterial3D.new()
	material.vertex_color_use_as_albedo = true
	material.metallic = 0.62
	material.roughness = 0.3
	material.albedo_color = Color.WHITE
	var mesh := surface.commit()
	mesh.surface_set_material(0, material)
	return mesh


func _add_box(surface: SurfaceTool, center: Vector3, size: Vector3, yaw: float) -> void:
	var half := size * 0.5
	var points := [
		Vector3(-half.x, -half.y, -half.z),
		Vector3(half.x, -half.y, -half.z),
		Vector3(half.x, half.y, -half.z),
		Vector3(-half.x, half.y, -half.z),
		Vector3(-half.x, -half.y, half.z),
		Vector3(half.x, -half.y, half.z),
		Vector3(half.x, half.y, half.z),
		Vector3(-half.x, half.y, half.z),
	]
	var faces := [
		[0, 2, 1, 0, 3, 2],
		[4, 5, 6, 4, 6, 7],
		[0, 4, 7, 0, 7, 3],
		[1, 2, 6, 1, 6, 5],
		[3, 7, 6, 3, 6, 2],
		[0, 1, 5, 0, 5, 4],
	]
	var normals := [Vector3.BACK, Vector3.FORWARD, Vector3.LEFT, Vector3.RIGHT, Vector3.UP, Vector3.DOWN]
	var rotation := Basis(Vector3.UP, yaw)
	for face_index in faces.size():
		for point_index in faces[face_index]:
			surface.set_normal(rotation * normals[face_index])
			surface.set_color(Color.WHITE)
			surface.add_vertex(rotation * points[point_index] + center)


func _fallback_color(index: int) -> Color:
	var palette := [
		Color("50e3ff"), Color("ff5aa5"), Color("ffd65a"),
		Color("8dff6a"), Color("aa7cff"), Color("ff7b4f"),
		Color("54a4ff"), Color("ffefef"), Color.WHITE,
	]
	return palette[index % palette.size()]


func _state_color(values: Variant, index: int) -> Color:
	if values is PackedColorArray:
		var packed_colors: PackedColorArray = values
		if index >= 0 and index < packed_colors.size():
			return packed_colors[index]
	elif values is PackedByteArray:
		var palette_indices: PackedByteArray = values
		if index >= 0 and index < palette_indices.size():
			return _fallback_color(int(palette_indices[index]))
	elif values is Array and index >= 0 and index < values.size():
		var value: Variant = values[index]
		if value is Color:
			return value
		if value is String:
			return Color(value)
	return _fallback_color(index)

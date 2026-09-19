extends RefCounted
class_name BoidsSolver

## ELI5: Boids are gentle steering suggestions, not a second autopilot.
## Separation spreads neighbors out, alignment points them the same way,
## cohesion gathers them, and avoidance looks ahead for buildings. The fleet's
## assigned formation target and emergency spacing still get the final say.

const MAX_NEIGHBORS := 24

const DEFAULTS := {
	"enabled": false,
	"boids": "none",
	"separation": 1.4,
	"alignment": 0.6,
	"cohesion": 0.35,
	"avoidance": 1.5,
	"attraction": 0.3,
	"matching": 0.5,
	"radius": 32.0,
	"distance": 6.0,
	"force": 8.0,
}


static func default_settings() -> Dictionary:
	return DEFAULTS.duplicate(true)


static func normalize_settings(raw: Dictionary = {}) -> Dictionary:
	var enabled := bool(raw.get("enabled", false)) or str(raw.get("boids", "none")) == "on"
	return {
		"enabled": enabled,
		"boids": "on" if enabled else "none",
		"separation": clampf(float(raw.get("separation", raw.get("boidSeparation", 1.4))), 0.0, 3.0),
		"alignment": clampf(float(raw.get("alignment", raw.get("boidAlignment", 0.6))), 0.0, 3.0),
		"cohesion": clampf(float(raw.get("cohesion", raw.get("boidCohesion", 0.35))), 0.0, 3.0),
		"avoidance": clampf(float(raw.get("avoidance", raw.get("boidAvoidance", 1.5))), 0.0, 3.0),
		"attraction": clampf(float(raw.get("attraction", raw.get("boidAttraction", 0.3))), 0.0, 3.0),
		"matching": clampf(float(raw.get("matching", raw.get("boidMatching", 0.5))), 0.0, 3.0),
		"radius": clampf(float(raw.get("radius", raw.get("boidRadius", 32.0))), 8.0, 48.0),
		"distance": clampf(float(raw.get("distance", raw.get("boidDistance", 6.0))), 2.0, 16.0),
		"force": clampf(float(raw.get("force", raw.get("boidForce", 8.0))), 0.0, 16.0),
	}


static func reset(_settings: Dictionary = {}) -> Dictionary:
	## Explicit reset prevents an old flocking value from sticking to a preset.
	return default_settings()


static func steering(
	index: int,
	positions: PackedVector3Array,
	velocities: PackedVector3Array,
	target: Vector3,
	target_velocity: Vector3,
	spatial_hash: SpatialHash3D,
	settings: Dictionary,
	obstacles: Array = []
) -> Vector3:
	# FleetSimulation passes settings that were already normalized. Keeping this
	# hot function allocation-light matters when thousands of drones are active.
	if not bool(settings.get("enabled", false)):
		return Vector3.ZERO
	if index < 0 or index >= positions.size() or index >= velocities.size():
		return Vector3.ZERO

	var neighbor_buffer := PackedInt32Array()
	var distance_buffer := PackedFloat32Array()
	neighbor_buffer.resize(MAX_NEIGHBORS)
	distance_buffer.resize(MAX_NEIGHBORS)
	var neighbor_count := spatial_hash.query_nearest_into(
		positions[index],
		index,
		float(settings.get("radius", 32.0)),
		MAX_NEIGHBORS,
		neighbor_buffer,
		distance_buffer
	)
	return steering_from_neighbors(
		index,
		positions,
		velocities,
		target,
		target_velocity,
		neighbor_buffer,
		neighbor_count,
		settings,
		obstacles
	)


static func steering_from_neighbors(
	index: int,
	positions: PackedVector3Array,
	velocities: PackedVector3Array,
	target: Vector3,
	target_velocity: Vector3,
	neighbors: PackedInt32Array,
	neighbor_count: int,
	settings: Dictionary,
	obstacles: Array = []
) -> Vector3:
	if not bool(settings.get("enabled", false)):
		return Vector3.ZERO
	if index < 0 or index >= positions.size() or index >= velocities.size():
		return Vector3.ZERO
	var body_position := positions[index]
	var body_velocity := velocities[index]
	var radius := float(settings.get("radius", 32.0))
	var separation := Vector3.ZERO
	var heading := Vector3.ZERO
	var center := Vector3.ZERO
	var average_velocity := Vector3.ZERO
	var count := 0
	var heading_count := 0
	var personal_space := minf(radius, float(settings.get("distance", 6.0)))

	for neighbor_slot in range(mini(neighbor_count, neighbors.size())):
		var neighbor := neighbors[neighbor_slot]
		var delta := body_position - positions[neighbor]
		var distance := delta.length()
		if distance > radius:
			continue
		count += 1
		center += positions[neighbor]
		average_velocity += velocities[neighbor]
		if velocities[neighbor].length() > 0.1:
			heading_count += 1
			heading += velocities[neighbor].normalized()
		if distance < personal_space:
			var direction := Vector3.ZERO
			if distance > 0.000001:
				direction = delta / distance
			else:
				# Stable tie-break: identical points always separate the same way.
				direction.x = -1.0 if index < neighbor else 1.0
			separation += direction * (1.0 - distance / personal_space) * 8.0

	var alignment := Vector3.ZERO
	if heading_count > 0:
		alignment = heading.normalized() * body_velocity.length() - body_velocity
	var cohesion := Vector3.ZERO
	var matching := target_velocity - body_velocity
	if count > 0:
		cohesion = (center / count - body_position) * 0.25
		matching = average_velocity / count - body_velocity

	# Arrive at the existing assignment instead of inventing a new orbit.
	var attraction := _limited((target - body_position) * 0.6, 12.0)
	attraction += target_velocity - body_velocity
	var avoidance := _obstacle_avoidance(body_position, body_velocity, obstacles)

	var output := Vector3.ZERO
	output += _limited(separation, 10.0) * float(settings.get("separation", 1.4))
	output += _limited(alignment, 10.0) * float(settings.get("alignment", 0.6))
	output += _limited(cohesion, 10.0) * float(settings.get("cohesion", 0.35))
	output += _limited(avoidance, 10.0) * float(settings.get("avoidance", 1.5))
	output += _limited(attraction, 10.0) * float(settings.get("attraction", 0.3))
	output += _limited(matching, 10.0) * float(settings.get("matching", 0.5))
	return _limited(output, float(settings.get("force", 8.0)))


static func _obstacle_avoidance(
	position: Vector3, velocity: Vector3, obstacles: Array
) -> Vector3:
	var output := Vector3.ZERO
	var probe := position + velocity * 0.75
	var margin := 4.0
	for value in obstacles:
		if not value is Dictionary:
			continue
		var box: Dictionary = value
		if box.get("drone", true) == false:
			continue
		var low := Vector3(
			float(box.get("x", 0.0)) - float(box.get("w", 0.0)) - margin,
			float(box.get("min_y", box.get("minY", 0.0))) - margin,
			float(box.get("z", 0.0)) - float(box.get("d", 0.0)) - margin
		)
		var high := Vector3(
			float(box.get("x", 0.0)) + float(box.get("w", 0.0)) + margin,
			float(box.get("max_y", box.get("maxY", box.get("h", 12.0)))) + margin,
			float(box.get("z", 0.0)) + float(box.get("d", 0.0)) + margin
		)
		if _segment_hits_box(position, probe, low, high):
			output.y += 10.0
			output.x -= velocity.x * 0.5
			output.z -= velocity.z * 0.5
	return output


static func _segment_hits_box(origin: Vector3, end: Vector3, low: Vector3, high: Vector3) -> bool:
	# Slab test: checking the whole look-ahead line prevents thin walls from
	# slipping between its starting and ending points.
	var enter := 0.0
	var exit := 1.0
	var delta := end - origin
	for axis in range(3):
		var movement := delta[axis]
		if absf(movement) < 0.00000001:
			if origin[axis] < low[axis] or origin[axis] > high[axis]:
				return false
		else:
			var first := (low[axis] - origin[axis]) / movement
			var second := (high[axis] - origin[axis]) / movement
			enter = maxf(enter, minf(first, second))
			exit = minf(exit, maxf(first, second))
	return enter <= exit and exit >= 0.0 and enter <= 1.0


static func _limited(value: Vector3, maximum: float) -> Vector3:
	var magnitude := value.length()
	if magnitude > maximum and magnitude > 0.000001:
		return value * (maximum / magnitude)
	return value

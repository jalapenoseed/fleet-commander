extends RefCounted
class_name FormationLibrary

## ELI5: A formation is a numbered set of parking spaces in the sky.
## Given a drone number and the fleet size, this file returns that drone's
## personal space. Influence layers then bend those spaces without changing
## which drone owns which slot.

const SHAPES := [
	"grid",
	"ring",
	"wedge",
	"line",
	"column",
	"double_orbit",
	"scatter",
	"staggered",
	"high_low",
	"overwatch",
	"helix",
	"sphere",
	"heart",
]

const INFLUENCES := [
	"none",
	"vortex",
	"attract",
	"repel",
	"wave",
	"lissajous",
	"spiral",
	"braid",
	"twin",
	"square",
	"riemann",
]

const GOLDEN_ANGLE := 2.399963229728653
const MAX_INFLUENCE_LAYERS := 4
const MAX_FIELD_DISPLACEMENT := 32.0


static func default_influence() -> Dictionary:
	return {
		"type": "none",
		"strength": 8.0,
		"frequency": 0.6,
		"phase": 0.0,
		"blend": 1.0,
		"field_scale": 20.0,
		"axis": Vector3.ONE,
	}


static func default_settings() -> Dictionary:
	var layers: Array[Dictionary] = []
	for _slot in range(MAX_INFLUENCE_LAYERS):
		layers.append(default_influence())
	return {
		"shape": "grid",
		"spacing": 14.0,
		"height": 28.0,
		"move_x": 0.0,
		"move_z": -25.0,
		"rotation_degrees": 0.0,
		"scale": 1.0,
		"origin": "fixed",
		"pattern": "none",
		"pattern_speed": 1.0,
		"pattern_amount": 1.0,
		"influences": layers,
	}


static func normalize_settings(raw: Dictionary = {}) -> Dictionary:
	var settings := default_settings()
	var shape := _shape_key(str(raw.get("shape", settings.shape)))
	settings.shape = shape if SHAPES.has(shape) else "grid"
	settings.spacing = clampf(float(raw.get("spacing", settings.spacing)), 4.0, 80.0)
	settings.height = clampf(float(raw.get("height", settings.height)), 0.0, 300.0)
	settings.move_x = clampf(float(raw.get("move_x", raw.get("moveX", 0.0))), -900.0, 900.0)
	settings.move_z = clampf(float(raw.get("move_z", raw.get("moveZ", -25.0))), -900.0, 900.0)
	settings.rotation_degrees = clampf(
		float(raw.get("rotation_degrees", raw.get("rotation", 0.0))), -360.0, 360.0
	)
	settings.scale = clampf(float(raw.get("scale", 1.0)), 0.1, 8.0)
	settings.origin = str(raw.get("origin", "fixed"))
	settings.pattern = str(raw.get("pattern", "none"))
	settings.pattern_speed = clampf(
		float(raw.get("pattern_speed", raw.get("patternSpeed", 1.0))), 0.0, 3.0
	)
	settings.pattern_amount = clampf(
		float(raw.get("pattern_amount", raw.get("patternAmount", 1.0))), 0.0, 2.0
	)

	# Accept both the Godot list and the browser's field/field2/... save format.
	var layers: Array[Dictionary] = []
	var raw_layers: Variant = raw.get("influences", [])
	for slot in range(MAX_INFLUENCE_LAYERS):
		var layer_raw: Dictionary = {}
		if raw_layers is Array and slot < raw_layers.size() and raw_layers[slot] is Dictionary:
			layer_raw = raw_layers[slot]
		else:
			var suffix := "" if slot == 0 else str(slot + 1)
			layer_raw = {
				"type": raw.get("field" + suffix, "none"),
				"strength": raw.get("strength" + suffix, 8.0),
				"frequency": raw.get("frequency" + suffix, 0.6),
				"phase": raw.get("phase" + suffix, 0.0),
				"blend": raw.get("blend" + suffix, 1.0),
				"field_scale": raw.get("fieldScale", 20.0),
				"axis": Vector3(
					float(raw.get("axisX", 1.0)),
					float(raw.get("axisY", 1.0)),
					float(raw.get("axisZ", 1.0))
				),
			}
		layers.append(normalize_influence(layer_raw))
	settings.influences = layers
	return settings


static func normalize_influence(raw: Dictionary = {}) -> Dictionary:
	var layer := default_influence()
	var kind := str(raw.get("type", raw.get("field", "none"))).to_lower()
	layer.type = kind if INFLUENCES.has(kind) else "none"
	layer.strength = clampf(float(raw.get("strength", 8.0)), 0.0, 24.0)
	layer.frequency = clampf(float(raw.get("frequency", 0.6)), 0.05, 3.0)
	layer.phase = clampf(float(raw.get("phase", 0.0)), -TAU, TAU)
	layer.blend = clampf(float(raw.get("blend", 1.0)), 0.0, 1.0)
	layer.field_scale = clampf(float(raw.get("field_scale", raw.get("fieldScale", 20.0))), 5.0, 80.0)
	var axis: Variant = raw.get("axis", Vector3.ONE)
	layer.axis = axis if axis is Vector3 else Vector3.ONE
	return layer


static func reset_influences(settings: Dictionary) -> Dictionary:
	## ELI5: This is the big OFF switch. Old effects cannot secretly stack.
	var clean := normalize_settings(settings)
	var layers: Array[Dictionary] = []
	for _slot in range(MAX_INFLUENCE_LAYERS):
		layers.append(default_influence())
	clean.influences = layers
	return clean


static func set_influence(settings: Dictionary, slot: int, layer: Dictionary) -> Dictionary:
	var next := normalize_settings(settings)
	if slot < 0 or slot >= MAX_INFLUENCE_LAYERS:
		return next
	next.influences[slot] = normalize_influence(layer)
	return next


static func formation_point(shape_name: String, index: int, count: int, spacing: float) -> Vector3:
	return formation_point_scaled(shape_name, index, count, spacing, 1.0)


static func formation_point_scaled(
	shape_name: String, index: int, count: int, spacing: float, scale: float
) -> Vector3:
	if count <= 0:
		return Vector3.ZERO
	var shape := _shape_key(shape_name)
	if count > 100:
		return _large_fleet_point(shape, index, count, spacing, scale)
	return _basic_point(shape, index, count, spacing)


static func sample_target(
	index: int,
	count: int,
	settings: Dictionary,
	time: float,
	anchor: Vector3 = Vector3.ZERO
) -> Vector3:
	var s := normalize_settings(settings)
	return sample_target_cached(index, count, s, time, anchor)


static func sample_target_cached(
	index: int,
	count: int,
	settings: Dictionary,
	time: float,
	anchor: Vector3 = Vector3.ZERO
) -> Vector3:
	## FleetSimulation normalizes settings only when a menu value changes, then
	## uses this allocation-light path for every aircraft.
	var shape := str(settings.get("shape", "grid"))
	var spacing := float(settings.get("spacing", 14.0))
	var scale := float(settings.get("scale", 1.0))
	var local := formation_point_scaled(shape, index, count, spacing, scale)
	return sample_from_slot_cached(local, index, count, settings, time, anchor)


static func sample_from_slot_cached(
	formation_slot: Vector3,
	index: int,
	count: int,
	settings: Dictionary,
	time: float,
	anchor: Vector3 = Vector3.ZERO
) -> Vector3:
	var scale := float(settings.get("scale", 1.0))
	var local := formation_slot
	local = _apply_pattern(local, settings, time, index)

	var angle := deg_to_rad(float(settings.get("rotation_degrees", 0.0)))
	local = Vector3(
		local.x * cos(angle) - local.z * sin(angle),
		local.y,
		local.x * sin(angle) + local.z * cos(angle)
	) * scale

	var layers: Array = settings.get("influences", [])
	var field := influence_vector_cached(local, time, index, count, layers)
	return anchor + local + field + Vector3(
		float(settings.get("move_x", 0.0)),
		float(settings.get("height", 28.0)),
		float(settings.get("move_z", -25.0))
	)


static func influence_vector(
	point: Vector3, time: float, index: int, count: int, layers: Array
) -> Vector3:
	var normalized: Array[Dictionary] = []
	for layer in layers:
		normalized.append(normalize_influence(layer if layer is Dictionary else {}))
	return influence_vector_cached(point, time, index, count, normalized)


static func influence_vector_cached(
	point: Vector3, time: float, index: int, count: int, layers: Array
) -> Vector3:
	var total := Vector3.ZERO
	for slot in range(mini(MAX_INFLUENCE_LAYERS, layers.size())):
		if not layers[slot] is Dictionary:
			continue
		var layer: Dictionary = layers[slot]
		if layer.type == "none":
			continue
		var contribution := _single_influence(point, time, index, count, layer)
		if contribution.length() > MAX_FIELD_DISPLACEMENT:
			contribution = contribution.normalized() * MAX_FIELD_DISPLACEMENT
		total += contribution
	if total.length() > MAX_FIELD_DISPLACEMENT:
		total = total.normalized() * MAX_FIELD_DISPLACEMENT
	return total


static func _basic_point(shape: String, index: int, count: int, spacing: float) -> Vector3:
	var middle := (count - 1) * 0.5
	var angle := (float(index) / maxf(1.0, float(count))) * TAU
	match shape:
		"line":
			return Vector3((index - middle) * spacing, 0.0, 0.0)
		"wedge":
			var row := ceili(index / 2.0)
			var side := 0.0 if index == 0 else (-1.0 if index % 2 == 1 else 1.0)
			return Vector3(side * row * spacing * 0.65, 0.0, row * spacing * 0.7)
		"column":
			return Vector3(0.0, 0.0, (index - middle) * spacing)
		"double_orbit":
			var ring := index % 2
			var slots := floori(count / 2.0) if ring == 1 else ceili(count / 2.0)
			var ring_angle := (floori(index / 2.0) / maxf(1.0, float(slots))) * TAU
			var radius := spacing * (1.55 if ring == 1 else 1.0)
			return Vector3(cos(ring_angle) * radius, 5.0 if ring == 1 else -5.0, sin(ring_angle) * radius)
		"scatter":
			var scatter_radius := spacing * sqrt(index + 1.0) * 0.6
			return Vector3(
				cos(index * GOLDEN_ANGLE) * scatter_radius,
				sin(index * 1.7) * 5.0,
				sin(index * GOLDEN_ANGLE) * scatter_radius
			)
		"staggered":
			return Vector3(
				(-1.0 if index % 2 == 0 else 1.0) * spacing * 2.0,
				(index % 3) * 2.0,
				(floori(index / 2.0) - floori(count / 2.0) * 0.5) * spacing
			)
		"high_low", "overwatch":
			var base := _basic_point("grid", index, count, spacing)
			base.y = (5.0 if index % 2 == 1 else -5.0) if shape == "high_low" else 6.0 + (index % 3) * 3.0
			return base
		"helix":
			return _helix_point(index, count, spacing)
		"sphere":
			return _sphere_point(index, count, spacing)
		"heart":
			return _heart_point(index, count, spacing)
		"grid":
			var columns := ceili(sqrt(count))
			var rows := ceili(float(count) / columns)
			return Vector3(
				((index % columns) - (columns - 1) * 0.5) * spacing,
				0.0,
				(floori(float(index) / columns) - (rows - 1) * 0.5) * spacing
			)
		_:
			return Vector3(cos(angle) * spacing, 0.0, sin(angle) * spacing)


static func _large_fleet_point(
	shape: String, index: int, count: int, spacing: float, scale: float
) -> Vector3:
	var fit := 1.0 / maxf(1.0, scale)
	if shape in ["helix", "sphere", "heart"]:
		return _basic_point(shape, index, count, spacing) * fit
	if shape in ["ring", "double_orbit"]:
		var slots := 200
		var row := floori(float(index) / slots)
		var row_count := mini(slots, count - row * slots)
		var angle := ((index % slots) / maxf(1.0, float(row_count))) * TAU
		var radius := 140.0
		if shape == "double_orbit":
			radius = 146.0 if row % 2 == 1 else 110.0
		var total_rows := ceili(float(count) / slots)
		var vertical_row := float(row) if count > 2000 else row - (total_rows - 1) * 0.5
		return Vector3(
			cos(angle) * radius * fit,
			vertical_row * 4.0 * fit,
			sin(angle) * radius * fit
		)
	if shape in ["line", "column", "wedge", "staggered"]:
		var width := mini(64, count)
		var rows := ceili(float(count) / width)
		var row := floori(float(index) / width)
		var column := index % width
		var x := (column - (width - 1) * 0.5) * 5.0
		var z := (row - (rows - 1) * 0.5) * minf(8.0, spacing)
		if shape == "column":
			return Vector3(z, 0.0, x) * fit
		var point := Vector3(
			x,
			3.0 if shape == "staggered" and column % 2 == 1 else 0.0,
			z + (absf(x) * 0.15 if shape == "wedge" else 0.0)
		)
		return point * fit

	# Grid/scatter use spacing that contracts just enough to stay in the field.
	var side := ceili(sqrt(count))
	var fitted_spacing := maxf(4.0, minf(spacing, 320.0 / maxf(1.0, side - 1.0)))
	return _basic_point(shape, index, count, fitted_spacing) * fit


static func _helix_point(index: int, count: int, spacing: float) -> Vector3:
	var progress := float(index) / maxf(1.0, count - 1.0)
	var turns := maxf(2.0, ceilf(count / 80.0))
	var angle := progress * turns * TAU
	var radius := minf(140.0, maxf(spacing, sqrt(count) * 1.45))
	var height_span := minf(210.0, maxf(spacing * 2.0, sqrt(count) * 2.2))
	return Vector3(cos(angle) * radius, (progress - 0.5) * height_span, sin(angle) * radius)


static func _sphere_point(index: int, count: int, spacing: float) -> Vector3:
	var y := 1.0 - 2.0 * ((index + 0.5) / maxf(1.0, float(count)))
	var radial := sqrt(maxf(0.0, 1.0 - y * y))
	var angle := index * GOLDEN_ANGLE
	var radius := minf(140.0, maxf(spacing * 1.5, sqrt(count) * 1.8))
	return Vector3(cos(angle) * radial * radius, y * radius, sin(angle) * radial * radius)


static func _heart_point(index: int, count: int, spacing: float) -> Vector3:
	var t := (float(index) / maxf(1.0, float(count))) * TAU
	var size := minf(8.0, maxf(1.0, sqrt(count) / 10.0)) * spacing / 14.0
	var x := 16.0 * pow(sin(t), 3.0)
	var y := 13.0 * cos(t) - 5.0 * cos(2.0 * t) - 2.0 * cos(3.0 * t) - cos(4.0 * t)
	var depth := ((index % 5) - 2) * 0.8
	return Vector3(x * size, y * size, depth)


static func _apply_pattern(local: Vector3, settings: Dictionary, time: float, index: int) -> Vector3:
	var moved := local
	var phase := time * float(settings.pattern_speed)
	var spacing := float(settings.spacing)
	match str(settings.pattern):
		"orbit":
			var angle := phase * 0.25
			moved = Vector3(
				local.x * cos(angle) - local.z * sin(angle),
				local.y,
				local.x * sin(angle) + local.z * cos(angle)
			)
		"weave":
			moved.x += sin(phase * 1.8 + index * 0.8) * spacing * 0.28
			moved.y += cos(phase + index * 0.6) * 2.0
		"wave":
			moved.y += sin(phase + index * 0.8) * 4.0
		"pulse":
			var pulse := 1.0 + sin(phase * 0.6) * 0.25
			moved.x *= pulse
			moved.z *= pulse
		"search":
			moved.x += sin(phase * 0.2) * spacing
			moved.z += sin(phase * 0.1) * spacing
	return local.lerp(moved, float(settings.pattern_amount))


static func _single_influence(
	point: Vector3, time: float, index: int, count: int, layer: Dictionary
) -> Vector3:
	var kind: String = layer.type
	var q := time * float(layer.frequency) + float(layer.phase) + index * 0.7
	var amplitude := float(layer.strength) * float(layer.blend)
	var radius := maxf(1.0, Vector2(point.x, point.z).length())
	var value := Vector3.ZERO
	match kind:
		"vortex":
			value = Vector3(-point.z / radius, 0.0, point.x / radius)
		"attract":
			value = Vector3(-point.x / radius, 0.0, -point.z / radius)
		"repel":
			value = Vector3(point.x / radius, 0.0, point.z / radius)
		"wave":
			value = Vector3(0.0, sin(q), 0.0)
		"lissajous":
			value = Vector3(sin(q * 2.0), sin(q * 3.0) * 0.4, cos(q * 3.0))
		"spiral":
			value = Vector3(cos(q), sin(q * 0.5) * 0.35, sin(q))
		"braid":
			var side := 1.0 if index % 2 == 1 else -1.0
			value = Vector3(
				sin(q) * side * (0.4 + 0.3 * (1.0 + sin(time * 0.3))),
				cos(q) * 0.35,
				sin(q * 0.5) * 0.5
			)
		"twin":
			var first := Vector2(cos(time * 0.4), sin(time * 0.4)) * 25.0
			var weight := (1.0 + sin(q)) * 0.5
			var mixed := first * weight + (-first) * (1.0 - weight)
			value = Vector3(
				(mixed.x - point.x) / 40.0,
				0.25 * sin(q),
				(mixed.y - point.z) / 40.0
			)
		"square", "riemann":
			var u := point.x / float(layer.field_scale)
			var v := point.z / float(layer.field_scale)
			if kind == "square":
				value = Vector3(u * u - v * v, 0.0, 2.0 * u * v)
			else:
				var denominator := 1.0 + u * u + v * v
				value = Vector3(
					2.0 * u / denominator,
					(u * u + v * v - 1.0) / denominator,
					2.0 * v / denominator
				)
	value *= amplitude
	var axis: Vector3 = layer.axis
	return value * axis


static func _shape_key(value: String) -> String:
	var key := value.to_lower().replace("-", "_").replace(" ", "_")
	if key == "doubleorbit":
		key = "double_orbit"
	return key

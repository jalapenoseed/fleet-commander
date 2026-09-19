extends RefCounted
class_name FleetSimulation

## ELI5: This is the sandbox's rulebook and giant spreadsheet. Each packed
## array is one column: all positions live together, all batteries live
## together, and so on. That lets Godot move thousands of drones without making
## 10,000 scene nodes. Combat has its own smaller physics simulation.

signal fleet_rebuilt(count: int)
signal notice_changed(message: String)

const MAX_DRONES := 10_000
const FIELD_LIMIT := 1024.0
const ALTITUDE_LIMIT := 320.0
const TYPE_KEYS := ["scout", "relay", "cargo", "engineer"]
const TYPE_NAMES := ["Scout", "Relay", "Cargo", "Utility"]
const TYPE_SPEEDS := [24.0, 22.0, 13.0, 16.0]
const TYPE_SPANS := [0.52, 0.68, 1.9, 0.7]
const TEAM_KEYS := ["alpha", "bravo", "charlie", "delta"]
const COLOR_KEYS := ["red", "orange", "amber", "lime", "cyan", "blue", "violet", "pink", "white"]
const MODE_KEYS := ["DOCK", "QUEUED", "FLY", "RETURN", "LAND", "LANDED"]
const ORDER_KEYS := ["formation", "scout", "relay", "operator", "bike", "hold"]
const PLANET_MODEL_PATH := "res://scripts/simulation/planet_model.gd"
const COLLISION_NEIGHBOR_LIMIT := 96

const OBSTACLES := [
	{"x": -76.0, "z": -32.0, "w": 12.0, "d": 16.0, "h": 17.0},
	{"x": 78.0, "z": -58.0, "w": 10.0, "d": 14.0, "h": 30.0},
	{"x": 62.0, "z": 66.0, "w": 13.0, "d": 10.0, "h": 13.0},
]

enum AirframeType { SCOUT, RELAY, CARGO, ENGINEER }
enum DroneMode { DOCK, QUEUED, FLY, RETURNING, EMERGENCY_LAND, LANDED }
enum DroneOrder { FORMATION, SCOUT, RELAY, OPERATOR, BIKE, HOLD }

# Human-readable identity is only consulted by menus and saves.
var ids := PackedStringArray()
var names := PackedStringArray()

# Hot simulation columns. PackedByteArray values are enum numbers from above.
var types := PackedByteArray()
var colors := PackedByteArray()
var teams := PackedByteArray()
var modes := PackedByteArray()
var orders := PackedByteArray()
var program_active := PackedByteArray()

var positions := PackedVector3Array()
var velocities := PackedVector3Array()
var targets := PackedVector3Array()
var homes := PackedVector3Array()
var landing_positions := PackedVector3Array()
var batteries := PackedFloat32Array()
var health := PackedFloat32Array()
var launch_times := PackedFloat32Array()
var yaw := PackedFloat32Array()
var pitch := PackedFloat32Array()
var roll := PackedFloat32Array()
var status_text := PackedStringArray()

var fleet_name := "100 drone field kit"
var objective := Vector3(0.0, 28.0, -70.0)
var elapsed := 0.0
var program_time := 0.0
var running := true
var program_enabled := false
var program_running := false
var notice := "Fleet ready. Launch to begin."
var last_error := ""

var unlimited_battery := false
var battery_drain := 1.0
var reduced_motion := false
var obstacles_enabled := true
var beacon_size := 9.0

var formation_settings := FormationLibrary.default_settings()
var boid_settings := BoidsSolver.default_settings()
var lab_settings := {
	"planet": "earth",
	"rotor_mode": "arcade",
	"energy_model": false,
	"material": "composite",
	"battery_mass": 0.24,
	"battery_wh": 45.0,
	"flight_watts": 140.0,
	"electronics_watts": 8.0,
	"cargo_mass": 0.0,
}

# These stay untyped on purpose. The project can provide PlanetModel and
# weather later, while this file still parses and runs by itself.
var planet_model: Variant = null
var weather_model: Variant = null
var logic_speed_scale := 1.0

var neighbor_checks := 0
var separation_corrections := 0
var target_clamps := 0

var _accelerations := PackedVector3Array()
var _order_indices := PackedInt32Array()
var _order_counts := PackedInt32Array()
var _flight_mask := PackedByteArray()
var _collision_mask := PackedByteArray()
var _formation_slots := PackedVector3Array()
var _formation_signature := ""
var _boid_neighbor_indices := PackedInt32Array()
var _boid_neighbor_distances := PackedFloat32Array()
var _collision_neighbor_indices := PackedInt32Array()
var _boid_hash := SpatialHash3D.new(24.0)
var _collision_hash := SpatialHash3D.new(6.0)


func _init(count: int = 100) -> void:
	_boid_neighbor_indices.resize(BoidsSolver.MAX_NEIGHBORS)
	_boid_neighbor_distances.resize(BoidsSolver.MAX_NEIGHBORS)
	_collision_neighbor_indices.resize(COLLISION_NEIGHBOR_LIMIT)
	_order_counts.resize(ORDER_KEYS.size())
	_ensure_planet_model()
	build_fleet(count)


func drone_count() -> int:
	return positions.size()


func build_fleet(requested_count: int = 100, mix: String = "recon") -> int:
	var count := clampi(requested_count, 0, MAX_DRONES)
	_resize_state(count)
	var mixed_types := [
		AirframeType.SCOUT,
		AirframeType.SCOUT,
		AirframeType.RELAY,
		AirframeType.CARGO,
		AirframeType.ENGINEER,
	]
	for index in range(count):
		var number := index + 1
		ids[index] = "drone-%03d" % number
		names[index] = "DRONE %03d" % number
		if mix == "mixed":
			types[index] = mixed_types[index % mixed_types.size()]
		elif mix == "relay":
			types[index] = AirframeType.RELAY
		else:
			types[index] = AirframeType.RELAY if index % 3 == 2 else AirframeType.SCOUT
		colors[index] = index % COLOR_KEYS.size()
		teams[index] = index % TEAM_KEYS.size()
		modes[index] = DroneMode.DOCK
		orders[index] = DroneOrder.FORMATION
		program_active[index] = 0
		var pad := _launch_pad(index, count)
		positions[index] = pad
		velocities[index] = Vector3.ZERO
		targets[index] = pad
		homes[index] = pad
		landing_positions[index] = pad
		batteries[index] = 100.0
		health[index] = 100.0
		launch_times[index] = 0.0
		yaw[index] = 0.0
		pitch[index] = 0.0
		roll[index] = 0.0
		status_text[index] = "Docked"

	fleet_name = "%d drone field kit" % count
	objective = Vector3(0.0, 28.0, -70.0)
	elapsed = 0.0
	program_time = 0.0
	running = true
	program_enabled = false
	program_running = false
	neighbor_checks = 0
	separation_corrections = 0
	target_clamps = 0
	_formation_signature = ""
	_refresh_formation_slots()
	_set_notice("Fleet ready. Launch to begin.")
	fleet_rebuilt.emit(count)
	return count


func load_config(config: Dictionary) -> int:
	## Imports are untrusted. Validate the small metadata first, then mutate.
	last_error = ""
	var kind := str(config.get("kind", "fleet-commander-fleet"))
	if kind not in ["fleet-commander-fleet", "gridrunner-commander-fleet"]:
		return _fail("Choose a Fleet Commander fleet file.")
	if int(config.get("version", 1)) != 1:
		return _fail("This fleet version is not supported.")
	var roster_value: Variant = config.get("roster", [])
	if not roster_value is Array:
		return _fail("Fleet roster is missing.")
	var roster: Array = roster_value
	if roster.size() > MAX_DRONES:
		return _fail("Fleet size must be 0-10,000 drones.")
	var seen := {}
	for value in roster:
		if not value is Dictionary:
			return _fail("Fleet contains an invalid drone.")
		var drone: Dictionary = value
		var drone_id := str(drone.get("id", ""))
		if drone_id.is_empty() or seen.has(drone_id):
			return _fail("Fleet contains an invalid or duplicate drone.")
		seen[drone_id] = true
		if TYPE_KEYS.find(str(drone.get("type", ""))) < 0:
			return _fail("Fleet contains an unknown airframe.")
		if TEAM_KEYS.find(str(drone.get("team", ""))) < 0:
			return _fail("Fleet contains an unknown team.")
		if COLOR_KEYS.find(str(drone.get("color", ""))) < 0:
			return _fail("Fleet contains an unknown beacon color.")

	var point := _variant_to_vector3(config.get("objective", objective), objective)
	if not _valid_world_point(point):
		return _fail("Objective must be inside the practice field.")
	var options_value: Variant = config.get("options", {})
	var options: Dictionary = options_value if options_value is Dictionary else {}
	var drain := float(options.get("batteryDrain", options.get("battery_drain", 1.0)))
	if drain < 0.25 or drain > 10.0:
		return _fail("Battery drain must be between 0.25 and 10.")

	build_fleet(roster.size())
	for index in range(roster.size()):
		var drone: Dictionary = roster[index]
		ids[index] = str(drone.id)
		names[index] = str(drone.get("name", drone.id)).left(30)
		types[index] = TYPE_KEYS.find(str(drone.type))
		colors[index] = COLOR_KEYS.find(str(drone.color))
		teams[index] = TEAM_KEYS.find(str(drone.team))
	fleet_name = str(config.get("name", fleet_name)).strip_edges().left(48)
	if fleet_name.is_empty():
		fleet_name = "%d drone field kit" % roster.size()
	objective = point
	unlimited_battery = bool(options.get("unlimited", false))
	battery_drain = drain
	reduced_motion = bool(options.get("reducedMotion", options.get("reduced_motion", false)))
	obstacles_enabled = bool(options.get("obstacles", true))
	beacon_size = clampf(float(options.get("beaconSize", options.get("beacon_size", 9.0))), 4.0, 14.0)
	var lab_value: Variant = config.get("lab", {})
	if lab_value is Dictionary:
		set_lab_settings(lab_value)

	var program_value: Variant = config.get("program", {})
	var program: Dictionary = program_value if program_value is Dictionary else {}
	var settings_value: Variant = program.get("settings", {})
	var settings: Dictionary = settings_value if settings_value is Dictionary else {}
	formation_settings = FormationLibrary.normalize_settings(settings)
	boid_settings = BoidsSolver.normalize_settings(settings)
	_formation_signature = ""
	_refresh_formation_slots()
	_set_notice("Fleet loaded. Launch when ready.")
	return OK


func apply_config(config: Dictionary) -> int:
	# Applying a program should not teleport a matching live fleet. Save the
	# runtime columns, validate/load metadata, then restore those live columns.
	var roster_value: Variant = config.get("roster", [])
	var roster: Array = roster_value if roster_value is Array else []
	var same_roster: bool = roster.size() == drone_count()
	if same_roster:
		for index in range(drone_count()):
			if not roster[index] is Dictionary or str(roster[index].get("id", "")) != ids[index]:
				same_roster = false
				break
	var live := {}
	if same_roster:
		live = {
			"positions": positions,
			"velocities": velocities,
			"targets": targets,
			"homes": homes,
			"landing_positions": landing_positions,
			"batteries": batteries,
			"health": health,
			"launch_times": launch_times,
			"yaw": yaw,
			"pitch": pitch,
			"roll": roll,
			"modes": modes,
			"orders": orders,
			"program_active": program_active,
			"status_text": status_text,
			"elapsed": elapsed,
			"program_time": program_time,
			"running": running,
			"program_enabled": program_enabled,
			"program_running": program_running,
		}
	var result := load_config(config)
	if result != OK or not same_roster:
		return result
	positions = live.positions
	velocities = live.velocities
	targets = live.targets
	homes = live.homes
	landing_positions = live.landing_positions
	batteries = live.batteries
	health = live.health
	launch_times = live.launch_times
	yaw = live.yaw
	pitch = live.pitch
	roll = live.roll
	modes = live.modes
	orders = live.orders
	program_active = live.program_active
	status_text = live.status_text
	elapsed = live.elapsed
	program_time = live.program_time
	running = live.running
	program_enabled = live.program_enabled
	program_running = live.program_running
	_set_notice("Program applied without resetting live aircraft.")
	return OK


func snapshot_config() -> Dictionary:
	var roster: Array = []
	for index in range(drone_count()):
		roster.append({
			"id": ids[index],
			"name": names[index],
			"type": TYPE_KEYS[types[index]],
			"color": COLOR_KEYS[colors[index]],
			"team": TEAM_KEYS[teams[index]],
		})
	var active_ids: Array = []
	for index in range(drone_count()):
		if program_active[index] != 0:
			active_ids.append(ids[index])
	return {
		"kind": "fleet-commander-fleet",
		"version": 1,
		"name": fleet_name,
		"roster": roster,
		"program": {
			"version": 1,
			"mode": "manual",
			"ids": _packed_strings_to_array(ids),
			"settings": _legacy_program_settings(),
			"strokes": [],
			"source": "# Godot manual formation",
			"enabled": program_enabled,
			"running": program_running,
			"time": program_time,
			"activeIds": active_ids,
		},
		"objective": _vector_to_array(objective),
		"options": {
			"unlimited": unlimited_battery,
			"batteryDrain": battery_drain,
			"reducedMotion": reduced_motion,
			"obstacles": obstacles_enabled,
			"beaconSize": beacon_size,
		},
		# The browser safely ignores this extra object. Godot uses it to retain
		# the chosen planet, rotor rules, mass, and energy lesson settings.
		"lab": lab_settings.duplicate(true),
	}


func launch(selection: Variant = null) -> int:
	var selected := _resolve_selection(selection)
	var queued := 0
	var stagger := minf(0.035, 12.0 / maxf(1.0, drone_count()))
	for index in selected:
		if modes[index] in [DroneMode.DOCK, DroneMode.LANDED] and batteries[index] >= 20.0:
			modes[index] = DroneMode.QUEUED
			launch_times[index] = elapsed + queued * stagger
			orders[index] = DroneOrder.FORMATION
			program_active[index] = 1
			_set_status(index, "Launch queued")
			queued += 1
	program_enabled = queued > 0 or program_enabled
	program_running = program_enabled
	running = true
	_set_notice(
		"Launching %d drones." % queued
		if queued > 0
		else "Fleet is already airborne, or needs a recharge."
	)
	return queued


func launch_all() -> int:
	return launch()


func recall(selection: Variant = null) -> int:
	var changed := 0
	for index in _resolve_selection(selection):
		if modes[index] == DroneMode.QUEUED:
			modes[index] = DroneMode.DOCK
			changed += 1
		elif modes[index] == DroneMode.FLY:
			modes[index] = DroneMode.RETURNING
			changed += 1
		else:
			continue
		program_active[index] = 0
		_set_status(index, "Returning to launch pad")
	program_running = _has_program_aircraft()
	_set_notice("Return ordered for %d drones." % changed)
	return changed


func recall_all() -> int:
	return recall()


func assign(selection: Variant, order_value: Variant) -> int:
	var order := _order_from_variant(order_value)
	if order < 0:
		last_error = "Unknown fleet assignment."
		return 0
	var assigned := 0
	for index in _resolve_selection(selection):
		if modes[index] not in [DroneMode.FLY, DroneMode.QUEUED]:
			continue
		orders[index] = order
		program_active[index] = 1 if order == DroneOrder.FORMATION else 0
		if order == DroneOrder.HOLD:
			targets[index] = Vector3(positions[index].x, maxf(12.0, positions[index].y), positions[index].z)
		assigned += 1
	_set_notice("%d drones assigned to %s." % [assigned, ORDER_KEYS[order]])
	return assigned


func assign_indices(indices: PackedInt32Array, order_value: int) -> int:
	return assign(indices, order_value)


func set_objective(point: Vector3) -> int:
	if not point.is_finite():
		return _fail("Objective coordinates must be finite.")
	objective = Vector3(
		clampf(point.x, -FIELD_LIMIT + 30.0, FIELD_LIMIT - 30.0),
		clampf(point.y, 8.0, ALTITUDE_LIMIT - 20.0),
		clampf(point.z, -FIELD_LIMIT + 30.0, FIELD_LIMIT - 30.0)
	)
	return OK


func recharge(selection: Variant = null) -> int:
	var charged := 0
	for index in _resolve_selection(selection):
		if modes[index] in [DroneMode.DOCK, DroneMode.LANDED]:
			batteries[index] = 100.0
			charged += 1
	_set_notice("%d parked drones recharged." % charged)
	return charged


func set_charge(selection: Variant, percent: float) -> int:
	if not is_finite(percent) or percent < 0.0 or percent > 100.0:
		return _fail("Charge must be 0-100%.")
	var selected := _resolve_selection(selection)
	for index in selected:
		batteries[index] = percent
	_set_notice("Test charge set to %.0f%% for %d aircraft." % [percent, selected.size()])
	return OK


func set_charge_indices(indices: PackedInt32Array, percent: float) -> int:
	return set_charge(indices, percent)


func set_formation(patch: Dictionary) -> void:
	var merged := formation_settings.duplicate(true)
	for key in patch:
		merged[key] = patch[key]
	formation_settings = FormationLibrary.normalize_settings(merged)
	_formation_signature = ""
	_refresh_formation_slots()


func set_influence(slot: int, layer: Dictionary) -> int:
	if slot < 0 or slot >= FormationLibrary.MAX_INFLUENCE_LAYERS:
		return _fail("Influence slot must be 0-3.")
	formation_settings = FormationLibrary.set_influence(formation_settings, slot, layer)
	return OK


func reset_influences() -> void:
	formation_settings = FormationLibrary.reset_influences(formation_settings)
	_set_notice("All influence layers reset to None.")


func set_boids(patch: Dictionary) -> void:
	var merged := boid_settings.duplicate(true)
	for key in patch:
		merged[key] = patch[key]
	boid_settings = BoidsSolver.normalize_settings(merged)


func reset_boids() -> void:
	boid_settings = BoidsSolver.reset()
	_set_notice("Boids reset to off.")


func set_planet_model(model: Variant) -> void:
	planet_model = model


func set_weather_model(model: Variant) -> void:
	weather_model = model


func set_lab_settings(raw: Dictionary) -> void:
	_ensure_planet_model()
	if _model_has("lab_settings"):
		# PlanetModel normalizes a complete record. Merge a small UI patch first
		# so changing only the planet cannot reset battery/material experiments.
		var complete := lab_settings.duplicate(true)
		for key in raw:
			complete[key] = raw[key]
		var value: Variant = planet_model.call("lab_settings", complete)
		if value is Dictionary:
			lab_settings = value
			return
	var merged := lab_settings.duplicate(true)
	for key in raw:
		merged[key] = raw[key]
	merged.planet = str(merged.get("planet", "earth"))
	if merged.planet not in ["earth", "moon", "mars"]:
		merged.planet = "earth"
	merged.rotor_mode = str(merged.get("rotor_mode", merged.get("rotorMode", "arcade")))
	if merged.rotor_mode not in ["arcade", "constrained"]:
		merged.rotor_mode = "arcade"
	merged.energy_model = bool(merged.get("energy_model", merged.get("energyModel", false)))
	merged.battery_mass = clampf(float(merged.get("battery_mass", merged.get("batteryMass", 0.24))), 0.05, 5.0)
	merged.battery_wh = clampf(float(merged.get("battery_wh", merged.get("batteryWh", 45.0))), 1.0, 2000.0)
	merged.flight_watts = clampf(float(merged.get("flight_watts", merged.get("flightWatts", 140.0))), 1.0, 5000.0)
	merged.electronics_watts = clampf(float(merged.get("electronics_watts", merged.get("electronicsWatts", 8.0))), 0.0, 200.0)
	merged.cargo_mass = clampf(float(merged.get("cargo_mass", merged.get("cargoMass", 0.0))), 0.0, 10.0)
	lab_settings = merged


func step(delta: float) -> void:
	simulate_step(delta)


func simulate_step(delta: float) -> void:
	if not running:
		return
	var dt := clampf(delta, 0.0, 0.05)
	if dt <= 0.0:
		return
	if _run_external_planet_step(dt):
		return
	if _run_constrained_planet_step(dt):
		return

	elapsed += dt
	if program_enabled and program_running:
		program_time = minf(100_000_000.0, program_time + dt)
	neighbor_checks = 0
	separation_corrections = 0
	target_clamps = 0
	_transition_queued()
	_prepare_indexes()
	_refresh_formation_slots()
	_boid_hash.rebuild(positions, _flight_mask)
	_collision_hash.rebuild(positions, _collision_mask)

	var mass_scale := _arcade_mass_scale()
	var battery_load := _weather_battery_multiplier()
	var boids_on := bool(boid_settings.get("enabled", false))
	var boid_radius := float(boid_settings.get("radius", 32.0))
	# Normalize the energy lesson once per tick, not twice for every aircraft.
	# At 10,000 bodies, rebuilding the same settings dictionary 20,000 times is
	# far more expensive than the actual battery arithmetic.
	var energy_model := bool(lab_settings.get("energy_model", lab_settings.get("energyModel", false)))
	var flight_watts := float(lab_settings.get("flight_watts", lab_settings.get("flightWatts", 140.0)))
	var electronics_watts := float(lab_settings.get("electronics_watts", lab_settings.get("electronicsWatts", 8.0)))
	var battery_wh := maxf(1.0, float(lab_settings.get("battery_wh", lab_settings.get("batteryWh", 45.0))))
	var reserve_rates := PackedFloat32Array()
	reserve_rates.resize(TYPE_SPEEDS.size())
	for type_index in TYPE_SPEEDS.size():
		var reserve_speed: float = float(TYPE_SPEEDS[type_index])
		var reserve_legacy := 0.06 + reserve_speed * 0.003
		reserve_rates[type_index] = (
			(flight_watts * (1.0 + minf(1.0, reserve_speed / 24.0) * 0.35) + electronics_watts)
			/ 3600.0 / battery_wh * 100.0
			if energy_model
			else reserve_legacy
		)
	var weather_velocity_enabled: bool = weather_model != null and weather_model.has_method("velocity_at")
	for index in range(drone_count()):
		pitch[index] = 0.0
		roll[index] = 0.0
		if modes[index] not in [DroneMode.FLY, DroneMode.RETURNING, DroneMode.EMERGENCY_LAND]:
			_accelerations[index] = Vector3.ZERO
			continue

		var speed := velocities[index].length()
		if not unlimited_battery:
			var legacy_drain := 0.06 + speed * 0.003
			var rate := legacy_drain
			if energy_model:
				rate = (flight_watts * (1.0 + minf(1.0, speed / 24.0) * 0.35) + electronics_watts) / 3600.0 / battery_wh * 100.0
			rate *= battery_drain * battery_load
			batteries[index] = maxf(0.0, batteries[index] - dt * rate)
			var home_distance := positions[index].distance_to(homes[index])
			var type_speed: float = float(TYPE_SPEEDS[types[index]])
			var reserve_rate := reserve_rates[types[index]]
			var reserve := maxf(
				12.0,
				(home_distance / type_speed + 25.0) * reserve_rate * battery_drain * battery_load
			)
			if batteries[index] <= 0.0 and modes[index] != DroneMode.EMERGENCY_LAND:
				modes[index] = DroneMode.EMERGENCY_LAND
				landing_positions[index] = _safe_landing_below(positions[index])
				program_active[index] = 0
				_set_status(index, "Empty battery / emergency descent")
			elif batteries[index] < reserve and modes[index] == DroneMode.FLY:
				modes[index] = DroneMode.RETURNING
				program_active[index] = 0
				_set_status(index, "Battery reserve return")

		var previous_target := targets[index]
		var desired_target := _target_for(index)
		var minimum_y := 1.0 if modes[index] in [DroneMode.RETURNING, DroneMode.EMERGENCY_LAND] else 6.0
		var bounded := Vector3(
			clampf(desired_target.x, -FIELD_LIMIT + 10.0, FIELD_LIMIT - 10.0),
			clampf(desired_target.y, minimum_y, ALTITUDE_LIMIT - 2.0),
			clampf(desired_target.z, -FIELD_LIMIT + 10.0, FIELD_LIMIT - 10.0)
		)
		if not desired_target.is_equal_approx(bounded):
			target_clamps += 1
			_set_status(index, "Field boundary / altitude limit")
		targets[index] = bounded
		var acceleration := (bounded - positions[index]) * 1.7 - velocities[index] * 2.6

		var wind := Vector3.ZERO
		if weather_velocity_enabled:
			wind = _variant_to_vector3(weather_model.call("velocity_at", positions[index], elapsed, ids[index]), Vector3.ZERO)
		var weather_load := minf(1.0, Vector2(wind.x, wind.z).length() / 25.0 + absf(wind.y) * 0.08)
		var weather_force := minf(1.0, weather_load * 1.5)
		acceleration += Vector3(
			(wind.x - velocities[index].x * 0.12) * 0.18,
			(wind.y - velocities[index].y * 0.12) * 0.10,
			(wind.z - velocities[index].z * 0.12) * 0.18
		) * weather_force

		if (
			boids_on
			and modes[index] == DroneMode.FLY
			and orders[index] != DroneOrder.HOLD
		):
			var neighbor_count := _boid_hash.query_nearest_into(
				positions[index],
				index,
				boid_radius,
				BoidsSolver.MAX_NEIGHBORS,
				_boid_neighbor_indices,
				_boid_neighbor_distances
			)
			var target_velocity := (bounded - previous_target) / maxf(0.001, dt)
			target_velocity = Vector3(
				clampf(target_velocity.x, -24.0, 24.0),
				clampf(target_velocity.y, -24.0, 24.0),
				clampf(target_velocity.z, -24.0, 24.0)
			)
			acceleration += BoidsSolver.steering_from_neighbors(
				index,
				positions,
				velocities,
				bounded,
				target_velocity,
				_boid_neighbor_indices,
				neighbor_count,
				boid_settings,
				OBSTACLES if obstacles_enabled else []
			)

		var close_count := _collision_hash.query_radius_into(
			positions[index],
			index,
			6.0,
			_collision_neighbor_indices,
			COLLISION_NEIGHBOR_LIMIT
		)
		for slot in range(close_count):
			var peer := _collision_neighbor_indices[slot]
			neighbor_checks += 1
			var delta_position := positions[index] - positions[peer]
			var distance := delta_position.length()
			var safe: float = 1.7 + (
				float(TYPE_SPANS[types[index]]) + float(TYPE_SPANS[types[peer]])
			) * 0.5
			if distance >= safe:
				continue
			separation_corrections += 1
			if distance < 0.001:
				delta_position = Vector3(-1.0 if index < peer else 1.0, 0.0, 0.0)
				distance = 1.0
			acceleration += delta_position / distance * (safe - distance) * 12.0
			_set_status(index, "Spacing correction")

		if obstacles_enabled:
			for box in OBSTACLES:
				if _inside_obstacle_margin(positions[index], box, 7.0, 5.0):
					acceleration.y += 28.0
					_set_status(index, "Obstacle clearance")
		var acceleration_limit := 28.0 * mass_scale
		if acceleration.length() > acceleration_limit:
			acceleration = acceleration.normalized() * acceleration_limit
		_accelerations[index] = acceleration

	# The hashes refer to the old position buffer. Only integrate after every
	# drone has finished reading it, so results do not depend on roster order.
	for index in range(drone_count()):
		if modes[index] not in [DroneMode.FLY, DroneMode.RETURNING, DroneMode.EMERGENCY_LAND]:
			continue
		var old_position := positions[index]
		var velocity := velocities[index] + _accelerations[index] * dt
		var maximum_speed: float = float(TYPE_SPEEDS[types[index]]) * logic_speed_scale
		if velocity.length() > maximum_speed:
			velocity = velocity.normalized() * maximum_speed
		var position := positions[index] + velocity * dt
		position.x = clampf(position.x, -FIELD_LIMIT, FIELD_LIMIT)
		position.y = clampf(position.y, 1.0, ALTITUDE_LIMIT)
		position.z = clampf(position.z, -FIELD_LIMIT, FIELD_LIMIT)
		if obstacles_enabled:
			for box in OBSTACLES:
				if _inside_obstacle_margin(position, box, 1.0, 1.0):
					position = Vector3(old_position.x, maxf(old_position.y, position.y), old_position.z)
					velocity.x = 0.0
					velocity.z = 0.0
					velocity.y = maxf(3.0, velocity.y)
					_set_status(index, "Obstacle clearance")
		positions[index] = position
		velocities[index] = velocity
		var current_speed := velocity.length()
		if current_speed > 0.2:
			yaw[index] = atan2(velocity.x, velocity.z)
		if modes[index] == DroneMode.EMERGENCY_LAND:
			if position.distance_to(landing_positions[index]) < 0.6 and current_speed < 1.0:
				modes[index] = DroneMode.LANDED
				positions[index] = landing_positions[index]
				velocities[index] = Vector3.ZERO
				_set_status(index, "Landed / recharge to relaunch")
		elif modes[index] == DroneMode.RETURNING:
			if position.distance_to(homes[index]) < 0.6 and current_speed < 1.0:
				modes[index] = DroneMode.DOCK
				positions[index] = homes[index]
				velocities[index] = Vector3.ZERO
				_set_status(index, "Docked")
	program_running = _has_program_aircraft()


func render_state() -> Dictionary:
	## Packed arrays are copy-on-write references. The renderer should read them
	## during the frame and must never resize or modify them.
	return {
		"count": drone_count(),
		"positions": positions,
		"velocities": velocities,
		"targets": targets,
		"homes": homes,
		"batteries": batteries,
		"health": health,
		"modes": modes,
		"types": types,
		"teams": teams,
		"colors": colors,
		"ids": ids,
		# Replay calls this column "yaws"; keep the singular alias too because
		# it reads naturally when someone inspects this dictionary by hand.
		"yaws": yaw,
		"yaw": yaw,
		"pitch": pitch,
		"roll": roll,
		"elapsed": elapsed,
		"running": running,
		"combat": false,
		"events": [],
		"objective": objective,
	}


func get_render_snapshot() -> Dictionary:
	return render_state()


func get_drone_state(index: int) -> Dictionary:
	if index < 0 or index >= drone_count():
		return {}
	return {
		"index": index,
		"id": ids[index],
		"name": names[index],
		"type": TYPE_KEYS[types[index]],
		"team": TEAM_KEYS[teams[index]],
		"color": COLOR_KEYS[colors[index]],
		"mode": MODE_KEYS[modes[index]],
		"order": ORDER_KEYS[orders[index]],
		"position": positions[index],
		"velocity": velocities[index],
		"target": targets[index],
		"home": homes[index],
		"battery": batteries[index],
		"health": health[index],
		"yaw": yaw[index],
		"pitch": pitch[index],
		"roll": roll[index],
		"status": status_text[index],
	}


func metrics() -> Dictionary:
	var active := 0
	var returning := 0
	var landed := 0
	var battery_sum := 0.0
	var lowest := 100.0
	var target_error := 0.0
	for index in range(drone_count()):
		battery_sum += batteries[index]
		lowest = minf(lowest, batteries[index])
		if modes[index] == DroneMode.FLY:
			active += 1
			target_error += positions[index].distance_to(targets[index])
		elif modes[index] == DroneMode.RETURNING:
			returning += 1
		elif modes[index] == DroneMode.LANDED:
			landed += 1
	var average_error := target_error / maxf(1.0, active)
	return {
		"active": active,
		"total": drone_count(),
		"cohesion": roundi(clampf(100.0 - average_error * 2.0, 0.0, 100.0)) if active > 0 else 0,
		"battery": roundi(battery_sum / maxf(1.0, drone_count())),
		"lowest": floori(lowest) if drone_count() > 0 else 0,
		"returning": returning,
		"landed": landed,
		"checks": neighbor_checks,
		"separations": separation_corrections,
		"clamps": target_clamps,
	}


func indices_for_group(group: String) -> PackedInt32Array:
	return _resolve_selection(group)


func index_for_id(drone_id: String) -> int:
	return ids.find(drone_id)


func _resize_state(count: int) -> void:
	# ELI5: Resize each real spreadsheet column directly. Packed arrays use
	# copy-on-write, so resizing a temporary array from a loop can resize only
	# that temporary copy and leave the real column unchanged.
	ids.resize(count)
	names.resize(count)
	status_text.resize(count)
	types.resize(count)
	colors.resize(count)
	teams.resize(count)
	modes.resize(count)
	orders.resize(count)
	program_active.resize(count)
	_flight_mask.resize(count)
	_collision_mask.resize(count)
	positions.resize(count)
	velocities.resize(count)
	targets.resize(count)
	homes.resize(count)
	landing_positions.resize(count)
	_accelerations.resize(count)
	_formation_slots.resize(count)
	batteries.resize(count)
	health.resize(count)
	launch_times.resize(count)
	yaw.resize(count)
	pitch.resize(count)
	roll.resize(count)
	_order_indices.resize(count)


func _launch_pad(index: int, count: int) -> Vector3:
	if count <= 0:
		return Vector3.ZERO
	var width := ceili(sqrt(count))
	var rows := ceili(float(count) / width)
	var position := Vector3(
		((index % width) - (width - 1) * 0.5) * 4.0,
		1.0,
		minf(72.0, 206.0 - (rows - 1) * 4.0) + floori(float(index) / width) * 4.0
	)
	for box in OBSTACLES:
		if (
			absf(position.x - float(box.x)) < float(box.w) + 4.0
			and absf(position.z - float(box.z)) < float(box.d) + 4.0
		):
			position.y = float(box.h) + 6.0
	return position


func _transition_queued() -> void:
	for index in range(drone_count()):
		if modes[index] == DroneMode.QUEUED and elapsed >= launch_times[index]:
			modes[index] = DroneMode.FLY
			_set_status(index, "Flying")


func _prepare_indexes() -> void:
	_order_counts.fill(0)
	_flight_mask.fill(0)
	_collision_mask.fill(0)
	for index in range(drone_count()):
		if modes[index] in [DroneMode.FLY, DroneMode.RETURNING, DroneMode.EMERGENCY_LAND]:
			_collision_mask[index] = 1
		if modes[index] != DroneMode.FLY:
			continue
		_flight_mask[index] = 1
		var order := orders[index]
		_order_indices[index] = _order_counts[order]
		_order_counts[order] += 1


func _target_for(index: int) -> Vector3:
	if modes[index] == DroneMode.EMERGENCY_LAND:
		return landing_positions[index]
	if modes[index] == DroneMode.RETURNING:
		var home := homes[index]
		if Vector2(positions[index].x - home.x, positions[index].z - home.z).length() > 3.0:
			home.y = maxf(12.0, positions[index].y)
		return home

	var order := orders[index]
	var order_index := _order_indices[index]
	var order_count := maxi(1, _order_counts[order])
	var angle := (float(order_index) / order_count) * TAU
	match order:
		DroneOrder.OPERATOR, DroneOrder.BIKE:
			var center_x := 12.0 if order == DroneOrder.BIKE else 0.0
			return Vector3(
				center_x + cos(angle + elapsed * 0.15) * 14.0,
				14.0 + floori(float(order_index) / 12.0) * 4.0,
				62.0 + sin(angle + elapsed * 0.15) * 14.0
			)
		DroneOrder.SCOUT:
			var radius := minf(7.0, sqrt(order_count))
			return objective + Vector3(
				cos(angle) * radius,
				((order_index % 3) - 1) * 2.0,
				sin(angle) * radius
			)
		DroneOrder.RELAY:
			var fraction := float(order_index + 1) / (order_count + 1.0)
			return Vector3(
				objective.x * fraction,
				20.0 + (order_index % 3) * 3.0,
				62.0 + (objective.z - 62.0) * fraction
			)
		DroneOrder.HOLD:
			return targets[index]
		_:
			if program_active[index] == 0:
				return targets[index]
			return FormationLibrary.sample_from_slot_cached(
				_formation_slots[index],
				index,
				drone_count(),
				formation_settings,
				0.0 if reduced_motion else program_time,
				_formation_anchor()
			)


func _formation_anchor() -> Vector3:
	match str(formation_settings.get("origin", "fixed")):
		"objective":
			return objective
		"operator":
			return Vector3(0.0, 0.0, 62.0)
		"bike":
			return Vector3(12.0, 0.0, 62.0)
		_:
			return Vector3.ZERO


func _refresh_formation_slots() -> void:
	var signature := "%s|%d|%.5f|%.5f" % [
		str(formation_settings.get("shape", "grid")),
		drone_count(),
		float(formation_settings.get("spacing", 14.0)),
		float(formation_settings.get("scale", 1.0)),
	]
	if signature == _formation_signature and _formation_slots.size() == drone_count():
		return
	_formation_signature = signature
	_formation_slots.resize(drone_count())
	for index in range(drone_count()):
		_formation_slots[index] = FormationLibrary.formation_point_scaled(
			str(formation_settings.get("shape", "grid")),
			index,
			drone_count(),
			float(formation_settings.get("spacing", 14.0)),
			float(formation_settings.get("scale", 1.0))
		)


func _safe_landing_below(position: Vector3) -> Vector3:
	var landing := Vector3(position.x, 1.0, position.z)
	if obstacles_enabled:
		for box in OBSTACLES:
			if (
				absf(position.x - float(box.x)) < float(box.w) + 3.0
				and absf(position.z - float(box.z)) < float(box.d) + 3.0
			):
				landing.y = maxf(landing.y, float(box.h) + 6.0)
	return landing


func _inside_obstacle_margin(
	position: Vector3, box: Dictionary, horizontal_margin: float, vertical_margin: float
) -> bool:
	return (
		position.y < float(box.h) + vertical_margin
		and absf(position.x - float(box.x)) < float(box.w) + horizontal_margin
		and absf(position.z - float(box.z)) < float(box.d) + horizontal_margin
	)


func _resolve_selection(selection: Variant) -> PackedInt32Array:
	var result := PackedInt32Array()
	if selection == null:
		for index in range(drone_count()):
			result.append(index)
		return result
	if selection is int:
		if selection >= 0 and selection < drone_count():
			result.append(selection)
		return result
	if selection is String:
		var group := str(selection)
		if group == "all":
			return _resolve_selection(null)
		var type_key := group.trim_suffix("s")
		for index in range(drone_count()):
			if (
				ids[index] == group
				or TYPE_KEYS[types[index]] == type_key
				or TEAM_KEYS[teams[index]] == group
				or COLOR_KEYS[colors[index]] == group
			):
				result.append(index)
		return result
	if selection is PackedInt32Array:
		for index in selection:
			if index >= 0 and index < drone_count() and result.find(index) < 0:
				result.append(index)
		return result
	if selection is Array:
		for value in selection:
			var subset := _resolve_selection(value)
			for index in subset:
				if result.find(index) < 0:
					result.append(index)
	return result


func _order_from_variant(value: Variant) -> int:
	if value is int:
		return value if value >= 0 and value < ORDER_KEYS.size() else -1
	return ORDER_KEYS.find(str(value).to_lower())


func _has_program_aircraft() -> bool:
	for index in range(drone_count()):
		if program_active[index] != 0 and modes[index] in [DroneMode.FLY, DroneMode.QUEUED]:
			return true
	return false


func _ensure_planet_model() -> void:
	if planet_model == null and ResourceLoader.exists(PLANET_MODEL_PATH):
		planet_model = load(PLANET_MODEL_PATH)


func _model_has(method_name: StringName) -> bool:
	return planet_model != null and planet_model.has_method(method_name)


func _run_external_planet_step(dt: float) -> bool:
	_ensure_planet_model()
	if not _model_has("constrained_step"):
		return false
	var handled: Variant = planet_model.call("constrained_step", self, dt)
	return handled is bool and handled


func _run_constrained_planet_step(dt: float) -> bool:
	var planet := str(lab_settings.get("planet", "earth"))
	var rotor_mode := str(lab_settings.get("rotor_mode", lab_settings.get("rotorMode", "arcade")))
	if planet == "earth" or rotor_mode != "constrained":
		return false
	var gravity := 1.62 if planet == "moon" else 3.73
	var density := 0.0 if planet == "moon" else 0.016
	if _model_has("get_profile"):
		var profile: Variant = planet_model.call("get_profile", planet)
		if profile is Dictionary:
			gravity = float(profile.get("gravity", gravity))
			density = float(profile.get("density", density))

	elapsed += dt
	if program_enabled and program_running:
		program_time = minf(100_000_000.0, program_time + dt)
	_transition_queued()
	for index in range(drone_count()):
		if modes[index] not in [DroneMode.FLY, DroneMode.RETURNING, DroneMode.EMERGENCY_LAND]:
			continue
		var velocity := velocities[index]
		velocity.y -= gravity * dt
		velocity *= exp(-density * 0.18 * dt)
		var position := positions[index] + velocity * dt
		if position.y <= homes[index].y:
			position.y = homes[index].y
			velocity = Vector3.ZERO
			modes[index] = DroneMode.LANDED
			program_active[index] = 0
		positions[index] = position
		velocities[index] = velocity
		targets[index] = Vector3(position.x, homes[index].y, position.z)
		_set_status(index, ("Moon" if planet == "moon" else "Mars") + ": insufficient rotor lift")
		if not unlimited_battery:
			batteries[index] = maxf(
				0.0,
				batteries[index] - _free_flight_drain(0.0, 0.06) * dt * battery_drain
			)
	program_running = _has_program_aircraft()
	return true


func _free_flight_drain(speed: float, legacy: float) -> float:
	_ensure_planet_model()
	if _model_has("free_flight_drain"):
		return float(planet_model.call("free_flight_drain", lab_settings, speed, legacy))
	if not bool(lab_settings.get("energy_model", lab_settings.get("energyModel", false))):
		return legacy
	var flight_watts := float(lab_settings.get("flight_watts", lab_settings.get("flightWatts", 140.0)))
	var electronics := float(lab_settings.get("electronics_watts", lab_settings.get("electronicsWatts", 8.0)))
	var capacity := maxf(1.0, float(lab_settings.get("battery_wh", lab_settings.get("batteryWh", 45.0))))
	var watts := flight_watts * (1.0 + minf(1.0, maxf(0.0, speed) / 24.0) * 0.35) + electronics
	return watts / 3600.0 / capacity * 100.0


func _arcade_mass_scale() -> float:
	_ensure_planet_model()
	if _model_has("arcade_mass_scale"):
		return float(planet_model.call("arcade_mass_scale", lab_settings))
	if not bool(lab_settings.get("energy_model", lab_settings.get("energyModel", false))):
		return 1.0
	var material_mass: float = float({"composite": 0.18, "aluminum": 0.32, "polymer": 0.24}.get(
		str(lab_settings.get("material", "composite")), 0.18
	))
	var total_mass := (
		float(material_mass)
		+ 0.12
		+ 0.024
		+ 0.065
		+ float(lab_settings.get("battery_mass", lab_settings.get("batteryMass", 0.24)))
		+ 0.045
		+ float(lab_settings.get("cargo_mass", lab_settings.get("cargoMass", 0.0)))
	)
	return clampf(0.674 / total_mass, 0.25, 1.5)


func _weather_battery_multiplier() -> float:
	if weather_model != null and weather_model.has_method("battery_multiplier"):
		return maxf(0.0, float(weather_model.call("battery_multiplier")))
	return 1.0


func _weather_velocity(position: Vector3, drone_id: String) -> Vector3:
	if weather_model == null or not weather_model.has_method("velocity_at"):
		return Vector3.ZERO
	var value: Variant = weather_model.call("velocity_at", position, elapsed, drone_id)
	return _variant_to_vector3(value, Vector3.ZERO)


func _legacy_program_settings() -> Dictionary:
	var shape := str(formation_settings.get("shape", "grid"))
	if shape == "double_orbit":
		shape = "double-orbit"
	elif shape == "high_low":
		shape = "high-low"
	var output := {
		"shape": shape,
		"spacing": float(formation_settings.get("spacing", 14.0)),
		"height": float(formation_settings.get("height", 28.0)),
		"moveX": float(formation_settings.get("move_x", 0.0)),
		"moveZ": float(formation_settings.get("move_z", -25.0)),
		"rotation": float(formation_settings.get("rotation_degrees", 0.0)),
		"scale": float(formation_settings.get("scale", 1.0)),
		"origin": str(formation_settings.get("origin", "fixed")),
		"pattern": str(formation_settings.get("pattern", "none")),
		"patternSpeed": float(formation_settings.get("pattern_speed", 1.0)),
		"patternAmount": float(formation_settings.get("pattern_amount", 1.0)),
		"boids": "on" if bool(boid_settings.get("enabled", false)) else "none",
		"boidSeparation": float(boid_settings.get("separation", 1.4)),
		"boidAlignment": float(boid_settings.get("alignment", 0.6)),
		"boidCohesion": float(boid_settings.get("cohesion", 0.35)),
		"boidAvoidance": float(boid_settings.get("avoidance", 1.5)),
		"boidAttraction": float(boid_settings.get("attraction", 0.3)),
		"boidMatching": float(boid_settings.get("matching", 0.5)),
		"boidRadius": float(boid_settings.get("radius", 32.0)),
		"boidDistance": float(boid_settings.get("distance", 6.0)),
		"boidForce": float(boid_settings.get("force", 8.0)),
	}
	var layers: Array = formation_settings.get("influences", [])
	for slot in range(FormationLibrary.MAX_INFLUENCE_LAYERS):
		var suffix := "" if slot == 0 else str(slot + 1)
		var layer := FormationLibrary.default_influence()
		if slot < layers.size() and layers[slot] is Dictionary:
			layer = layers[slot]
		output["field" + suffix] = str(layer.get("type", "none"))
		output["strength" + suffix] = float(layer.get("strength", 8.0))
		output["frequency" + suffix] = float(layer.get("frequency", 0.6))
		output["phase" + suffix] = float(layer.get("phase", 0.0))
		output["blend" + suffix] = float(layer.get("blend", 1.0))
	return output


func _valid_world_point(point: Vector3) -> bool:
	return (
		point.is_finite()
		and absf(point.x) <= FIELD_LIMIT
		and point.y >= 0.0
		and point.y <= ALTITUDE_LIMIT
		and absf(point.z) <= FIELD_LIMIT
	)


func _variant_to_vector3(value: Variant, fallback: Vector3) -> Vector3:
	if value is Vector3:
		return value
	if value is Array and value.size() == 3:
		return Vector3(float(value[0]), float(value[1]), float(value[2]))
	if value is PackedFloat32Array and value.size() == 3:
		return Vector3(value[0], value[1], value[2])
	return fallback


func _vector_to_array(value: Vector3) -> Array:
	return [value.x, value.y, value.z]


func _packed_strings_to_array(values: PackedStringArray) -> Array:
	var output: Array = []
	for value in values:
		output.append(value)
	return output


func _set_notice(message: String) -> void:
	notice = message
	notice_changed.emit(message)


func _set_status(index: int, message: String) -> void:
	if status_text[index] != message:
		status_text[index] = message


func _fail(message: String) -> int:
	last_error = message
	return ERR_INVALID_DATA

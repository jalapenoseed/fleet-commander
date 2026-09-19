class_name CameraDirector
extends Node3D

## ELI5: This node is the game's camera operator. The simulation hands it a
## read-only snapshot of every drone, and it chooses where the Camera3D should
## stand and what it should look at. It never moves or edits a real drone.

signal view_changed(view_name: StringName)
signal subject_changed(drone_id: String)
signal label_changed(text: String)
signal pose_changed(pose: Dictionary)

const VIEW_ORBIT := &"orbit"
const VIEW_TOP := &"top"
const VIEW_FRONT := &"front"
const VIEW_FOLLOW := &"follow"
const VIEW_FPV := &"fpv"
const VIEW_SHOULDER := &"shoulder"
const VIEW_MOUNTED := &"mounted"
const VIEW_GROUND := &"ground"
const VIEW_FREE := &"free"
const VIEW_CINEMATIC := &"cinematic"
const VIEW_ACTION := &"action"
const VIEW_BEST_FIGHT := &"best_fight"
const VIEW_LONGEST_SURVIVOR := &"longest_survivor"

const DIRECTED_VIEWS := [
	VIEW_FPV,
	VIEW_SHOULDER,
	VIEW_MOUNTED,
	VIEW_GROUND,
	VIEW_FREE,
	VIEW_CINEMATIC,
	VIEW_ACTION,
	VIEW_BEST_FIGHT,
	VIEW_LONGEST_SURVIVOR,
]
const AUTOMATIC_VIEWS := [
	VIEW_CINEMATIC,
	VIEW_ACTION,
	VIEW_BEST_FIGHT,
	VIEW_LONGEST_SURVIVOR,
]
const CINEMATIC_SHOTS := [
	"Establishing orbit",
	"Wing chase",
	"Formation sweep",
	"Onboard FPV",
	"Ground spectator",
	"Overhead reveal",
]
const FLYING_MODES := ["FLY", "RETURN", "LAND"]
# Camera composition only needs a representative cast for a giant formation.
# Rendering and simulation still keep all 10,000 aircraft; this cap prevents
# the director from building 10,000 temporary dictionaries every frame.
const MAX_SHOW_CAMERA_SAMPLES := 640
const FPV_DEFAULTS := {
	"fov": 88.0,
	"sensitivity": 1.0,
	"stabilization": 0.65,
	"smoothing": 0.08,
	"tilt": 0.0,
}

@export var camera: Camera3D
@export var read_input_actions := true
@export_range(5.0, 20.0, 1.0) var cut_seconds := 8.0

var view: StringName = VIEW_ORBIT
var selected_subject_id := ""
var subject_id := ""
var hidden_subject_id := ""
var fight_pair: Array[String] = []
var camera_label := "Overview"

# Overview camera values match the browser game.
var orbit_center := Vector3(0.0, 55.0, -20.0)
var orbit_distance := 310.0
var orbit_azimuth := 0.2
var orbit_elevation := 0.24
var camera_zoom := 1.0

# The walking spectator begins at normal eye height.
var ground_position := Vector3(0.0, 1.7, 210.0)
var ground_yaw := PI
var ground_pitch := 0.3
var ground_auto_aim := true
var movement_input := Vector3.ZERO

var fpv_settings := FPV_DEFAULTS.duplicate(true)
var fpv_yaw := 0.0
var fpv_pitch := 0.0
var fpv_rotation := Quaternion.IDENTITY
var fpv_subject_id := ""

var cinematic_time := 0.0
var cinematic_shot := -1
var combat_cut_at := -INF
var combat_event_id := 0
var combat_shot := "duel"
var combat_generation: Variant = null

var _reset_pending := true
var _pose_ready := false
var _camera_position := Vector3.ZERO
var _camera_target := Vector3.ZERO
var _camera_up := Vector3.UP
var _base_fov := 55.0
var _last_pose: Dictionary = {}
var _normalized_drones: Array = []


func _ready() -> void:
	if camera == null:
		camera = get_node_or_null("Camera3D") as Camera3D
	if camera != null:
		camera.current = true


## Accept the browser names too, so old replay files and menus remain useful.
func normalize_view(value: Variant) -> StringName:
	var name := String(value).to_lower()
	match name:
		"combat", "action", "best_action", "best action", "cinematic_action":
			return VIEW_ACTION
		"bestfight", "best_fight", "best fight":
			return VIEW_BEST_FIGHT
		"survivor", "longest_survivor", "longest survivor":
			return VIEW_LONGEST_SURVIVOR
		"top_down":
			return VIEW_TOP
		_:
			return StringName(name)


func set_camera(value: Camera3D) -> void:
	camera = value
	if camera != null:
		camera.current = true
		_apply_camera_node()


func set_view(value: Variant) -> void:
	var next_view := normalize_view(value)
	if not supported_views().has(next_view):
		return
	view = next_view
	_reset_pending = true
	movement_input = Vector3.ZERO
	fpv_yaw = 0.0
	fpv_pitch = 0.0
	combat_cut_at = -INF
	fight_pair.clear()
	if view == VIEW_FOLLOW:
		orbit_distance = 20.0
	elif view == VIEW_ORBIT:
		orbit_distance = 310.0
	elif not DIRECTED_VIEWS.has(view):
		orbit_distance = 240.0
	orbit_center = Vector3(0.0, 55.0, -20.0)
	view_changed.emit(view)


func supported_views() -> Array[StringName]:
	return [
		VIEW_ORBIT,
		VIEW_TOP,
		VIEW_FRONT,
		VIEW_FOLLOW,
		VIEW_FPV,
		VIEW_SHOULDER,
		VIEW_MOUNTED,
		VIEW_GROUND,
		VIEW_FREE,
		VIEW_CINEMATIC,
		VIEW_ACTION,
		VIEW_BEST_FIGHT,
		VIEW_LONGEST_SURVIVOR,
	]


func set_selected_subject(drone_id: String) -> void:
	selected_subject_id = drone_id
	recenter_fpv()


func configure_fpv(settings: Dictionary) -> Dictionary:
	for key in FPV_DEFAULTS:
		if settings.has(key):
			fpv_settings[key] = float(settings[key])
	fpv_settings.fov = clampf(float(fpv_settings.fov), 50.0, 115.0)
	fpv_settings.sensitivity = clampf(float(fpv_settings.sensitivity), 0.25, 2.5)
	fpv_settings.stabilization = clampf(float(fpv_settings.stabilization), 0.0, 1.0)
	fpv_settings.smoothing = clampf(float(fpv_settings.smoothing), 0.0, 0.4)
	fpv_settings.tilt = clampf(float(fpv_settings.tilt), -20.0, 30.0)
	return fpv_settings.duplicate(true)


func recenter_fpv() -> void:
	fpv_yaw = 0.0
	fpv_pitch = 0.0
	_reset_pending = true


func reset_ground() -> void:
	ground_position = Vector3(0.0, 1.7, 210.0)
	ground_yaw = PI
	ground_pitch = 0.3
	ground_auto_aim = true
	_reset_pending = true


func reset_camera() -> void:
	camera_zoom = 1.0
	orbit_azimuth = 0.2
	orbit_elevation = 0.24
	reset_ground()
	set_view(view)


## Pass mouse/touch movement here. Positive x means the pointer moved right.
func look_delta(delta: Vector2, drone_relative := false) -> void:
	var sensitivity := float(fpv_settings.sensitivity)
	if drone_relative or [VIEW_FPV, VIEW_SHOULDER, VIEW_MOUNTED].has(view):
		fpv_yaw = clampf(fpv_yaw - delta.x * 0.004 * sensitivity, -1.5, 1.5)
		fpv_pitch = clampf(fpv_pitch - delta.y * 0.004 * sensitivity, -1.1, 1.1)
	elif [VIEW_GROUND, VIEW_FREE].has(view):
		ground_auto_aim = false
		ground_yaw -= delta.x * 0.004 * sensitivity
		ground_pitch = clampf(ground_pitch - delta.y * 0.004 * sensitivity, -1.3, 1.4)
	elif [VIEW_ORBIT, VIEW_FOLLOW].has(view):
		orbit_azimuth -= delta.x * 0.005
		orbit_elevation = clampf(orbit_elevation + delta.y * 0.004, -0.15, 1.45)


## factor below 1 zooms in; factor above 1 zooms out.
func zoom_by(factor: float) -> void:
	if not is_finite(factor) or factor <= 0.0:
		return
	if DIRECTED_VIEWS.has(view):
		camera_zoom = clampf(camera_zoom / factor, 0.65, 4.0)
	else:
		orbit_distance = clampf(orbit_distance * factor, 8.0, 1800.0)


func set_movement_input(local_input: Vector3) -> void:
	# x = strafe right, y = rise, z = move forward.
	movement_input = local_input.limit_length(1.0)


func next_cinematic_shot() -> void:
	cinematic_time = (floorf(cinematic_time / cut_seconds) + 1.0) * cut_seconds


func current_pose() -> Dictionary:
	return _last_pose.duplicate(true)


## Main entry point. `snapshot` is never changed.
func update_camera(snapshot: Dictionary, selected_index: int = -1, delta := 1.0 / 60.0) -> Dictionary:
	# The simulation uses packed arrays. A selected index is cheaper and safer than
	# handing the camera a live drone object.
	var snapshot_ids: Variant = _read_any(snapshot, ["ids"], [])
	if selected_index >= 0:
		var selected_value: Variant = _indexed_value(snapshot_ids, selected_index, "")
		if not String(selected_value).is_empty():
			selected_subject_id = String(selected_value)
	var drones := _drones(snapshot)
	if selected_subject_id.is_empty() and selected_index >= 0 and selected_index < drones.size():
		selected_subject_id = _id(_dictionary(drones[selected_index]))
	if read_input_actions and [VIEW_GROUND, VIEW_FREE].has(view):
		movement_input = Vector3(
			Input.get_axis("move_left", "move_right"),
			Input.get_axis("move_down", "move_up"),
			Input.get_axis("move_back", "move_forward")
		).limit_length(1.0)

	var cast: Array = []
	for drone in drones:
		if FLYING_MODES.has(_mode(drone)):
			cast.append(drone)
	if cast.is_empty():
		cast = drones.duplicate()

	var center := Vector3(0.0, 65.0, -30.0)
	if not cast.is_empty():
		center = Vector3.ZERO
		for drone in cast:
			center += _position(drone)
		center /= float(cast.size())
	var radius := 35.0
	for drone in cast:
		radius = maxf(radius, _position(drone).distance_to(center))
	radius = minf(radius, 1200.0)

	var running := bool(_read_any(snapshot, ["running"], true))
	var reduced_motion := _reduced_motion(snapshot)
	var selected := _find_drone(drones, selected_subject_id)
	if selected.is_empty() and not cast.is_empty():
		selected = cast[0]

	# Like the browser version, automatic shots hold perfectly still on pause.
	if AUTOMATIC_VIEWS.has(view) and not running and _pose_ready and not _reset_pending:
		return current_pose()

	hidden_subject_id = ""
	var desired_position := _camera_position
	var desired_target := _camera_target
	var desired_up := Vector3.UP
	var fov := 55.0
	var snap := _reset_pending
	_reset_pending = false

	match view:
		VIEW_ORBIT:
			desired_position = orbit_center + Vector3(
				sin(orbit_azimuth) * cos(orbit_elevation) * orbit_distance,
				sin(orbit_elevation) * orbit_distance,
				cos(orbit_azimuth) * cos(orbit_elevation) * orbit_distance
			)
			desired_target = orbit_center
			fov = 50.0
			camera_label = "Overview"
			snap = true
		VIEW_TOP:
			desired_position = Vector3(0.0, orbit_distance, 1.0)
			desired_target = Vector3.ZERO
			fov = 50.0
			camera_label = "Top down"
			snap = true
		VIEW_FRONT:
			desired_position = Vector3(0.0, 30.0, orbit_distance)
			desired_target = Vector3(0.0, 30.0, 0.0)
			fov = 50.0
			camera_label = "Front / words"
			snap = true
		VIEW_FOLLOW:
			if not selected.is_empty():
				orbit_center = _position(selected)
			desired_position = orbit_center + Vector3(
				sin(orbit_azimuth) * orbit_distance,
				sin(orbit_elevation) * orbit_distance,
				cos(orbit_azimuth) * orbit_distance
			)
			desired_target = orbit_center
			fov = 50.0
			camera_label = "Follow selected"
			snap = true
		VIEW_GROUND, VIEW_FREE:
			if ground_auto_aim:
				var to_center := center - ground_position
				ground_yaw = atan2(to_center.x, to_center.z)
				ground_pitch = atan2(to_center.y, Vector2(to_center.x, to_center.z).length())
			_update_ground(delta)
			desired_position = ground_position
			desired_target = ground_position + Vector3(
				sin(ground_yaw) * cos(ground_pitch),
				sin(ground_pitch),
				cos(ground_yaw) * cos(ground_pitch)
			) * 100.0
			fov = 70.0
			camera_label = "Free camera · %d m" % roundi(ground_position.y) if view == VIEW_FREE else "Ground · eye height 1.7 m"
			snap = true
		VIEW_FPV, VIEW_SHOULDER, VIEW_MOUNTED:
			var drone_pose := _drone_camera_pose(selected, view, delta, running, reduced_motion, snap)
			desired_position = drone_pose.position
			desired_target = drone_pose.target
			desired_up = drone_pose.up
			fov = drone_pose.fov
			hidden_subject_id = drone_pose.hidden_id
			camera_label = drone_pose.label
			subject_id = drone_pose.subject_id
			snap = bool(drone_pose.snap)
		VIEW_CINEMATIC:
			var cinematic_pose := _cinematic_pose(snapshot, cast, drones, center, radius, selected, delta, running, reduced_motion)
			desired_position = cinematic_pose.position
			desired_target = cinematic_pose.target
			desired_up = cinematic_pose.up
			fov = cinematic_pose.fov
			hidden_subject_id = cinematic_pose.hidden_id
			camera_label = cinematic_pose.label
			subject_id = cinematic_pose.subject_id
			snap = snap or bool(cinematic_pose.snap)
		VIEW_ACTION:
			var action_pose := _action_pose(snapshot, drones, center, selected, running, reduced_motion)
			desired_position = action_pose.position
			desired_target = action_pose.target
			fov = action_pose.fov
			camera_label = action_pose.label
			subject_id = action_pose.subject_id
		VIEW_BEST_FIGHT:
			var fight_pose := (
				_best_fight_pose(snapshot, drones, center)
				if _is_combat_snapshot(snapshot)
				else _pose(Vector3(70.0, 65.0, 110.0), center, Vector3.UP, 58.0, "", "Best fight · enter Battle mode", "", false)
			)
			desired_position = fight_pose.position
			desired_target = fight_pose.target
			fov = fight_pose.fov
			camera_label = fight_pose.label
			subject_id = fight_pose.subject_id
		VIEW_LONGEST_SURVIVOR:
			var survivor_pose := (
				_survivor_pose(snapshot, drones, center)
				if _is_combat_snapshot(snapshot)
				else _pose(Vector3(0.0, 48.0, 110.0), center, Vector3.UP, 67.0, "", "Longest survivor · enter Battle mode", "", false)
			)
			desired_position = survivor_pose.position
			desired_target = survivor_pose.target
			fov = survivor_pose.fov
			camera_label = survivor_pose.label
			subject_id = survivor_pose.subject_id

	if subject_id != "":
		subject_changed.emit(subject_id)
	label_changed.emit(camera_label)
	return _commit_pose(snapshot, desired_position, desired_target, desired_up, fov, delta, snap)


func _update_ground(delta: float) -> void:
	var horizontal := Vector2(movement_input.x, movement_input.z)
	if horizontal.length() > 1.0:
		horizontal = horizontal.normalized()
	var forward := horizontal.y
	var side := horizontal.x
	ground_position.x += (sin(ground_yaw) * forward - cos(ground_yaw) * side) * delta * 18.0
	ground_position.z += (cos(ground_yaw) * forward + sin(ground_yaw) * side) * delta * 18.0
	ground_position.x = clampf(ground_position.x, -1000.0, 1000.0)
	ground_position.z = clampf(ground_position.z, -1000.0, 1000.0)
	if view == VIEW_FREE:
		ground_position.y = clampf(ground_position.y + movement_input.y * delta * 18.0, 1.7, 300.0)
	else:
		ground_position.y = 1.7


func _drone_camera_pose(
	drone: Dictionary,
	mode: StringName,
	delta: float,
	running: bool,
	reduced_motion: bool,
	snap: bool
) -> Dictionary:
	if drone.is_empty():
		return _pose(Vector3(0.0, 45.0, 100.0), Vector3.ZERO, Vector3.UP, 70.0, "", "Build a fleet to follow a drone", "", snap)
	var drone_id := _id(drone)
	var body := _body_rotation(drone)
	var yaw := float(_read_any(drone, ["yaw"], 0.0))
	var heading := Basis.from_euler(Vector3(0.0, yaw + fpv_yaw, 0.0), EULER_ORDER_YXZ).get_rotation_quaternion()
	var scale := 1.65 if String(_read_any(drone, ["type"], "")) == "cargo" else 1.0
	var position := _position(drone)
	if mode == VIEW_SHOULDER:
		var shoulder_pos := position + heading * (Vector3(2.5, 2.5, -5.0) * scale)
		var shoulder_target := position + heading * Vector3(0.0, 1.0 + fpv_pitch * 9.0, 5.0)
		return _pose(shoulder_pos, shoulder_target, Vector3.UP, 70.0, drone_id, "Shoulder / isometric · " + drone_id, "", snap)
	if mode == VIEW_MOUNTED:
		var mounted_pos := position + body * (Vector3(0.0, 0.85, -1.25) * scale)
		var mounted_target := position + heading * Vector3(0.0, 0.15 + fpv_pitch * 5.0, 7.0)
		return _pose(mounted_pos, mounted_target, Vector3.UP, 95.0, drone_id, "Top-mounted · airframe visible · " + drone_id, "", snap)

	var level := Basis.from_euler(Vector3(0.0, yaw, 0.0), EULER_ORDER_YXZ).get_rotation_quaternion()
	var desired_rotation := body.slerp(level, float(fpv_settings.stabilization))
	var look_rotation := Basis.from_euler(
		Vector3(fpv_pitch - deg_to_rad(float(fpv_settings.tilt)), fpv_yaw, 0.0),
		EULER_ORDER_YXZ
	).get_rotation_quaternion()
	desired_rotation = desired_rotation * look_rotation
	var changed_subject := fpv_subject_id != drone_id
	fpv_subject_id = drone_id
	var smooth_seconds := float(fpv_settings.smoothing)
	if snap or changed_subject or smooth_seconds <= 0.0 or not running or reduced_motion:
		fpv_rotation = desired_rotation
	else:
		fpv_rotation = fpv_rotation.slerp(desired_rotation, 1.0 - exp(-delta / smooth_seconds))
	var fpv_position := position + body * Vector3(0.0, 0.3, 0.65)
	fpv_position.y = maxf(1.7, fpv_position.y)
	var fpv_target := fpv_position + fpv_rotation * Vector3(0.0, 0.0, 100.0)
	var fpv_up := fpv_rotation * Vector3.UP
	return _pose(fpv_position, fpv_target, fpv_up, float(fpv_settings.fov), drone_id, "Onboard · " + drone_id, drone_id, true)


func _cinematic_pose(
	snapshot: Dictionary,
	cast: Array,
	drones: Array,
	center: Vector3,
	radius: float,
	selected: Dictionary,
	delta: float,
	running: bool,
	reduced_motion: bool
) -> Dictionary:
	if running and not reduced_motion:
		cinematic_time += delta
	var shot := floori(cinematic_time / cut_seconds)
	var phase := fmod(cinematic_time, cut_seconds)
	var changed := shot != cinematic_shot
	if changed:
		cinematic_shot = shot
		var ranked: Array = []
		for drone in cast:
			if _mode(drone) == "FLY":
				ranked.append(drone)
		ranked.sort_custom(func(a, b): return _velocity(a).length() > _velocity(b).length())
		if not ranked.is_empty():
			subject_id = _id(ranked[(shot * 17) % mini(64, ranked.size())])
		elif not cast.is_empty():
			subject_id = _id(cast[0])
	var drone := _find_drone(drones, subject_id)
	if drone.is_empty():
		drone = selected
	var internal_mode := shot % CINEMATIC_SHOTS.size()
	var shot_label: String = CINEMATIC_SHOTS[internal_mode]
	if internal_mode == 1 or internal_mode == 3:
		if not drone.is_empty():
			shot_label += " · " + _id(drone)
	match internal_mode:
		1: # Wing chase
			if not drone.is_empty():
				var forward := _yaw_forward(drone)
				return _pose(_position(drone) - forward * 14.0 + Vector3(8.0, 6.0, 0.0), _position(drone) + forward * 8.0, Vector3.UP, 70.0, _id(drone), shot_label, "", changed)
		3: # Onboard FPV
			var fpv_pose := _drone_camera_pose(drone, VIEW_FPV, delta, running, reduced_motion, changed)
			fpv_pose.label = shot_label
			return fpv_pose
		2: # Formation sweep
			return _pose(center + Vector3((phase / cut_seconds - 0.5) * radius * 2.0, radius * 0.25, radius * 1.65), center, Vector3.UP, 65.0, subject_id, shot_label, "", changed)
		4: # Ground spectator
			return _pose(Vector3(center.x - radius * 0.7, 1.7, center.z + radius * 2.5 + 90.0), center, Vector3.UP, 60.0, subject_id, shot_label, "", changed)
		5: # Overhead reveal
			return _pose(center + Vector3(sin(phase * 0.1) * radius * 0.3, radius * 2.7, 5.0), center, Vector3.UP, 55.0, subject_id, shot_label, "", changed)
		_: # Establishing orbit
			var angle := cinematic_time * 0.035
			return _pose(center + Vector3(sin(angle) * radius * 2.8, radius * 0.9 + 30.0, cos(angle) * radius * 2.8), center, Vector3.UP, 55.0, subject_id, shot_label, "", changed)
	# A chase shot with an empty fleet falls back to the safe establishing view.
	var fallback_angle := cinematic_time * 0.035
	return _pose(center + Vector3(sin(fallback_angle) * radius * 2.8, radius * 0.9 + 30.0, cos(fallback_angle) * radius * 2.8), center, Vector3.UP, 55.0, subject_id, shot_label, "", changed)


func _action_pose(
	snapshot: Dictionary,
	drones: Array,
	center: Vector3,
	selected: Dictionary,
	running: bool,
	reduced_motion: bool
) -> Dictionary:
	if running and not reduced_motion:
		_select_action_subject(snapshot, drones, selected)
	elif subject_id == "":
		_select_action_subject(snapshot, drones, selected)
	var drone := _find_drone(drones, subject_id)
	if drone.is_empty():
		drone = selected
	if drone.is_empty():
		return _pose(Vector3(70.0, 70.0, 100.0), center, Vector3.UP, 62.0, "", "Combat camera · no aircraft", "", false)
	var target_drone := _find_drone(drones, _target_id(drone))
	if not target_drone.is_empty() and _mode(target_drone) != "FLY":
		target_drone = {}
	var crash := combat_shot == "crash"
	var target := _position(drone)
	if not target_drone.is_empty() and not crash:
		target = target.lerp(_position(target_drone), 0.35)
	var gap := 8.0
	if not target_drone.is_empty() and not crash:
		gap = minf(38.0, _position(drone).distance_to(_position(target_drone)))
	var position := target + Vector3(8.0 + gap * 0.45, 5.0 if crash else 7.0 + gap * 0.22, -10.0 - gap * 0.55)
	var prefix := "Cinematic action · Crash tracking" if crash else "Cinematic action · live engagement"
	return _pose(position, target, Vector3.UP, 62.0, _id(drone), prefix + " · " + _id(drone), "", false)


func _select_action_subject(snapshot: Dictionary, drones: Array, selected: Dictionary) -> void:
	var combat := _combat_state(snapshot)
	var generation: Variant = _read_any(combat, ["world", "generation", "world_id"], null)
	var time := float(_read_any(combat, ["time"], 0.0))
	if combat_generation != generation:
		combat_generation = generation
		combat_cut_at = -INF
		combat_event_id = 0
	var crash_event: Dictionary = {}
	for item in _array(_read_any(combat, ["events"], [])):
		var event := _dictionary(item)
		if (
			String(_read_any(event, ["type"], "")) == "destroy"
			and int(_read_any(event, ["id"], 0)) > combat_event_id
			and time - float(_read_any(event, ["time"], time)) < 1.0
		):
			crash_event = event
	if not crash_event.is_empty() and time - combat_cut_at > 1.5:
		combat_event_id = int(_read_any(crash_event, ["id"], combat_event_id))
		subject_id = String(_read_any(crash_event, ["droneId", "drone_id"], ""))
		combat_cut_at = time
		combat_shot = "crash"
	if time - combat_cut_at > 5.0 or _find_drone(drones, subject_id).is_empty():
		var best: Dictionary = {}
		var best_score := -INF
		for drone_value in drones:
			var drone := _dictionary(drone_value)
			if _mode(drone) != "FLY":
				continue
			var target := _find_drone(drones, _target_id(drone))
			var distance := _position(drone).distance_to(_position(target)) if not target.is_empty() else 200.0
			var health := float(_read_any(drone, ["health"], 100.0))
			var ai := _dictionary(_read_any(drone, ["ai"], {}))
			var score := 120.0 / (distance + 3.0) + (100.0 - health) * 0.04 + _velocity(drone).length() * 0.08
			if String(_read_any(ai, ["state"], "")) == "Payload run":
				score += 3.0
			if score > best_score:
				best_score = score
				best = drone
		if best.is_empty():
			best = selected
		if best.is_empty() and not drones.is_empty():
			best = _dictionary(drones[0])
		subject_id = _id(best)
		combat_shot = "duel"
		combat_cut_at = time


func _best_fight_pose(snapshot: Dictionary, drones: Array, center: Vector3) -> Dictionary:
	var pair := best_fight_pair(drones)
	if pair.is_empty():
		fight_pair.clear()
		return _pose(Vector3(70.0, 65.0, 110.0), center, Vector3.UP, 58.0, "", "Best fight · waiting for opposing aircraft", "", false)
	var first: Dictionary = pair[0]
	var second: Dictionary = pair[1]
	var first_pos := _position(first)
	var second_pos := _position(second)
	var middle := first_pos.lerp(second_pos, 0.5)
	var line := second_pos - first_pos
	var gap := maxf(5.0, line.length())
	var side := line.cross(Vector3.UP).normalized()
	var combat := _combat_state(snapshot)
	var phase := float(_read_any(combat, ["time"], _read_any(snapshot, ["elapsed"], 0.0))) * 0.32
	var position := middle + side * minf(48.0, 13.0 + gap * 0.65)
	position += Vector3(sin(phase) * 5.0, minf(28.0, 7.0 + gap * 0.28), cos(phase) * 5.0)
	subject_id = _id(first)
	fight_pair = [_id(first), _id(second)]
	return _pose(position, middle, Vector3.UP, 58.0, subject_id, "Best fight · %s vs %s" % fight_pair, "", false)


func _survivor_pose(snapshot: Dictionary, drones: Array, center: Vector3) -> Dictionary:
	var drone := longest_survivor(drones, subject_id)
	if drone.is_empty():
		return _pose(Vector3(0.0, 48.0, 110.0), center, Vector3.UP, 67.0, "", "Longest survivor · no aircraft", "", false)
	subject_id = _id(drone)
	var forward := _yaw_forward(drone)
	var combat := _combat_state(snapshot)
	var time := float(_read_any(combat, ["battleTime", "battle_time", "time"], _read_any(snapshot, ["elapsed"], 0.0)))
	var position := _position(drone) - forward * 11.0 + Vector3(7.0, 5.5, 0.0)
	var target := _position(drone) + forward * 5.0
	return _pose(position, target, Vector3.UP, 67.0, subject_id, "Longest survivor · %s · %d s" % [subject_id, floori(time)], "", false)


## Returns [first drone, second drone, score], or an empty Array.
func best_fight_pair(drones_or_snapshot: Variant) -> Array:
	var drones := _array(drones_or_snapshot)
	if drones_or_snapshot is Dictionary:
		drones = _drones(drones_or_snapshot)
	var live: Array = []
	for value in drones:
		var drone := _dictionary(value)
		if _mode(drone) == "FLY":
			live.append(drone)
	var best: Array = []
	var best_score := -INF
	var seen := {}
	for drone_value in live:
		var drone := _dictionary(drone_value)
		var target := _find_drone(live, _target_id(drone))
		if target.is_empty() or _side(target) == _side(drone):
			continue
		var ids := [_id(drone), _id(target)]
		ids.sort()
		var pair_key := "%s|%s" % ids
		if seen.has(pair_key):
			continue
		seen[pair_key] = true
		var distance := _position(drone).distance_to(_position(target))
		var relative := (_velocity(drone) - _velocity(target)).length()
		var mutual := 28.0 if _target_id(target) == _id(drone) else 0.0
		var stats_a := _dictionary(_read_any(drone, ["combatStats", "combat_stats"], {}))
		var stats_b := _dictionary(_read_any(target, ["combatStats", "combat_stats"], {}))
		var recent := float(_read_any(stats_a, ["lastAction", "last_action"], 0.0)) + float(_read_any(stats_b, ["lastAction", "last_action"], 0.0))
		var health_sum := float(_read_any(drone, ["health"], 100.0)) + float(_read_any(target, ["health"], 100.0))
		var score := 120.0 / (distance + 5.0) + relative * 0.55 + mutual + recent * 0.08 + (200.0 - health_sum) * 0.05
		if score > best_score:
			best_score = score
			best = [drone, target, score]
	if not best.is_empty():
		return best
	for i in live.size():
		for j in range(i + 1, live.size()):
			var first := _dictionary(live[i])
			var second := _dictionary(live[j])
			if _side(first) == _side(second):
				continue
			var distance := _position(first).distance_to(_position(second))
			var score := 80.0 / (distance + 5.0)
			if score > best_score:
				best_score = score
				best = [first, second, score]
	return best


func longest_survivor(drones_or_snapshot: Variant, current_id := "") -> Dictionary:
	var drones := _array(drones_or_snapshot)
	if drones_or_snapshot is Dictionary:
		drones = _drones(drones_or_snapshot)
	var live: Array = []
	for value in drones:
		var drone := _dictionary(value)
		if _mode(drone) == "FLY":
			live.append(drone)
	var held := _find_drone(live, current_id)
	if not held.is_empty():
		return held
	var counts := {"friendly": 0, "enemy": 0}
	for drone_value in live:
		var side := _side(_dictionary(drone_value))
		counts[side] = int(counts.get(side, 0)) + 1
	live.sort_custom(func(a, b):
		var side_count_a := int(counts.get(_side(a), 0))
		var side_count_b := int(counts.get(_side(b), 0))
		if side_count_a != side_count_b:
			return side_count_a < side_count_b
		var stats_a := _dictionary(_read_any(a, ["combatStats", "combat_stats"], {}))
		var stats_b := _dictionary(_read_any(b, ["combatStats", "combat_stats"], {}))
		var kills_a := int(_read_any(stats_a, ["kills"], 0))
		var kills_b := int(_read_any(stats_b, ["kills"], 0))
		if kills_a != kills_b:
			return kills_a > kills_b
		var health_a := float(_read_any(a, ["health"], 100.0))
		var health_b := float(_read_any(b, ["health"], 100.0))
		if not is_equal_approx(health_a, health_b):
			return health_a > health_b
		return _id(a) < _id(b)
	)
	if not live.is_empty():
		return _dictionary(live[0])
	for i in range(drones.size() - 1, -1, -1):
		var drone := _dictionary(drones[i])
		if ["FALLING", "WRECK"].has(_mode(drone)):
			return drone
	return _dictionary(drones[0]) if not drones.is_empty() else {}


func _commit_pose(
	snapshot: Dictionary,
	desired_position: Vector3,
	desired_target: Vector3,
	desired_up: Vector3,
	fov: float,
	delta: float,
	snap: bool
) -> Dictionary:
	desired_position.y = maxf(1.7, desired_position.y)
	if _obstacles_enabled(snapshot):
		for obstacle_value in _array(_read_any(snapshot, ["obstacles"], [])):
			var obstacle := _dictionary(obstacle_value)
			var x := float(_read_any(obstacle, ["x"], 0.0))
			var z := float(_read_any(obstacle, ["z"], 0.0))
			var width := float(_read_any(obstacle, ["w", "width"], 0.0))
			var depth := float(_read_any(obstacle, ["d", "depth"], 0.0))
			if absf(desired_position.x - x) < width + 1.0 and absf(desired_position.z - z) < depth + 1.0:
				desired_position.y = maxf(desired_position.y, float(_read_any(obstacle, ["h", "height"], 0.0)) + 1.5)
	if snap or not _pose_ready:
		_camera_position = desired_position
		_camera_target = desired_target
	else:
		var alpha := 1.0 - exp(-delta * 5.0)
		_camera_position = _camera_position.lerp(desired_position, alpha)
		_camera_target = _camera_target.lerp(desired_target, alpha)
	_camera_up = desired_up.normalized() if desired_up.length_squared() > 0.0001 else Vector3.UP
	_base_fov = fov
	_pose_ready = true
	_apply_camera_node()
	_last_pose = {
		"view": view,
		"position": _camera_position,
		"target": _camera_target,
		"up": _camera_up,
		"base_fov": _base_fov,
		"fov": _effective_fov(_base_fov),
		"subject_id": subject_id,
		"hidden_subject_id": hidden_subject_id,
		"hidden_id": hidden_subject_id,
		"fight_pair": fight_pair.duplicate(),
		"label": camera_label,
	}
	pose_changed.emit(_last_pose.duplicate(true))
	return current_pose()


func _apply_camera_node() -> void:
	if camera == null or not _pose_ready:
		return
	camera.global_position = _camera_position
	camera.fov = _effective_fov(_base_fov)
	camera.look_at(_camera_target, _camera_up)


func _effective_fov(fov: float) -> float:
	if not DIRECTED_VIEWS.has(view):
		return fov
	return rad_to_deg(2.0 * atan(tan(deg_to_rad(fov) * 0.5) / camera_zoom))


func _pose(position: Vector3, target: Vector3, up: Vector3, fov: float, drone_id: String, text: String, hidden_id: String, snap: bool) -> Dictionary:
	return {
		"position": position,
		"target": target,
		"up": up,
		"fov": fov,
		"subject_id": drone_id,
		"label": text,
		"hidden_id": hidden_id,
		"snap": snap,
	}


func _drones(snapshot: Dictionary) -> Array:
	var object_rows := _array(_read_any(snapshot, ["drones", "aircraft"], []))
	if not object_rows.is_empty():
		return object_rows

	# FleetSimulation and CombatSystem expose structure-of-arrays snapshots. We
	# reuse these little view dictionaries instead of allocating thousands every
	# rendered frame. They are camera-owned copies, never live simulation state.
	var positions: Variant = _read_any(snapshot, ["positions"], PackedVector3Array())
	# An incomplete imported replay should produce an empty view, not a crash.
	if not (positions is PackedVector3Array or positions is Array):
		return []
	var ids: Variant = _read_any(snapshot, ["ids"], [])
	var source_count := clampi(int(_read_any(snapshot, ["count"], positions.size())), 0, positions.size())
	var source_indices := PackedInt32Array()
	if source_count > MAX_SHOW_CAMERA_SAMPLES and not _is_combat_snapshot(snapshot):
		var stride := ceili(float(source_count) / MAX_SHOW_CAMERA_SAMPLES)
		for source_index in range(0, source_count, stride):
			source_indices.append(source_index)
		var selected_source := -1
		if ids is Array or ids is PackedStringArray:
			selected_source = ids.find(selected_subject_id)
		if selected_source >= 0 and source_indices.find(selected_source) < 0:
			source_indices.append(selected_source)
	else:
		source_indices.resize(source_count)
		for source_index in source_count:
			source_indices[source_index] = source_index
	var count := source_indices.size()
	if _normalized_drones.size() != count:
		_normalized_drones.resize(count)
		for index in count:
			_normalized_drones[index] = {}
	var velocities: Variant = _read_any(snapshot, ["velocities"], PackedVector3Array())
	var health_values: Variant = _read_any(snapshot, ["health"], PackedFloat32Array())
	var battery_values: Variant = _read_any(snapshot, ["batteries", "battery"], PackedFloat32Array())
	var modes: Variant = _read_any(snapshot, ["modes"], PackedByteArray())
	var teams: Variant = _read_any(snapshot, ["teams"], PackedByteArray())
	var types: Variant = _read_any(snapshot, ["types"], PackedByteArray())
	var kills: Variant = _read_any(snapshot, ["kills"], PackedInt32Array())
	var last_actions: Variant = _read_any(snapshot, ["last_action", "last_actions"], PackedFloat32Array())
	var target_indices: Variant = _read_any(snapshot, ["target_indices", "ai_target_indices"], PackedInt32Array())
	var ammo_values: Variant = _read_any(snapshot, ["ammo"], PackedInt32Array())
	var yaws: Variant = _read_any(snapshot, ["yaws", "yaw"], PackedFloat32Array())
	var pitches: Variant = _read_any(snapshot, ["pitches", "pitch"], PackedFloat32Array())
	var rolls: Variant = _read_any(snapshot, ["rolls", "roll"], PackedFloat32Array())
	var rotations: Variant = _read_any(snapshot, ["rotations", "quaternions"], [])
	for index in count:
		var source_index := source_indices[index]
		var row: Dictionary = _dictionary(_normalized_drones[index])
		var position := _indexed_vector3(positions, source_index, Vector3.ZERO)
		var velocity := _indexed_vector3(velocities, source_index, Vector3.ZERO)
		var target_index := _indexed_int(target_indices, source_index, -1)
		var yaw := _indexed_float(yaws, source_index, atan2(velocity.x, velocity.z) if velocity.length_squared() > 0.0001 else 0.0)
		row.id = String(_indexed_value(ids, source_index, "drone-%03d" % (source_index + 1)))
		row.index = source_index
		row.pos = position
		row.velocity = velocity
		row.yaw = yaw
		row.attitude = {
			"pitch": _indexed_float(pitches, source_index, 0.0),
			"roll": _indexed_float(rolls, source_index, 0.0),
		}
		row.mode = _mode_name(_indexed_int(modes, source_index, 2))
		row.health = _indexed_float(health_values, source_index, 100.0)
		row.battery = _indexed_float(battery_values, source_index, 100.0)
		row.combatSide = _team_name(_indexed_int(teams, source_index, -1))
		row.type = _type_name(_indexed_int(types, source_index, 0))
		row.ammo = _indexed_int(ammo_values, source_index, 0)
		row.combatStats = {
			"kills": _indexed_int(kills, source_index, 0),
			"lastAction": _indexed_float(last_actions, source_index, 0.0),
		}
		row.ai = {
			"targetId": String(_indexed_value(ids, target_index, "")) if target_index >= 0 else "",
			"state": String(_indexed_value(_read_any(snapshot, ["ai_states"], []), source_index, "")),
		}
		var rotation: Variant = _indexed_value(rotations, source_index, null)
		if rotation is Quaternion:
			row.physicsQuaternion = rotation
		else:
			row.erase("physicsQuaternion")
		_normalized_drones[index] = row
	return _normalized_drones


func _mode_name(value: int) -> String:
	return ["DOCK", "QUEUED", "FLY", "RETURN", "LAND", "LANDED", "FALLING", "WRECK"][clampi(value, 0, 7)]


func _team_name(value: int) -> String:
	return "friendly" if value == 0 else ("enemy" if value == 1 else "")


func _type_name(value: int) -> String:
	return ["scout", "relay", "cargo", "engineer"][clampi(value, 0, 3)]


func _indexed_value(values: Variant, index: int, fallback: Variant) -> Variant:
	if index < 0:
		return fallback
	if values is Array and index < values.size():
		return values[index]
	if values is PackedStringArray and index < values.size():
		return values[index]
	if values is PackedFloat32Array and index < values.size():
		return values[index]
	if values is PackedFloat64Array and index < values.size():
		return values[index]
	if values is PackedInt32Array and index < values.size():
		return values[index]
	if values is PackedInt64Array and index < values.size():
		return values[index]
	if values is PackedByteArray and index < values.size():
		return values[index]
	if values is PackedVector3Array and index < values.size():
		return values[index]
	return fallback


func _indexed_int(values: Variant, index: int, fallback: int) -> int:
	return int(_indexed_value(values, index, fallback))


func _indexed_float(values: Variant, index: int, fallback: float) -> float:
	return float(_indexed_value(values, index, fallback))


func _indexed_vector3(values: Variant, index: int, fallback: Vector3) -> Vector3:
	return _vector3(_indexed_value(values, index, fallback))


func _find_drone(drones: Array, drone_id: String) -> Dictionary:
	if drone_id == "":
		return {}
	for value in drones:
		var drone := _dictionary(value)
		if _id(drone) == drone_id:
			return drone
	return {}


func _id(drone: Dictionary) -> String:
	return String(_read_any(drone, ["id", "drone_id"], ""))


func _mode(drone: Dictionary) -> String:
	return String(_read_any(drone, ["mode"], "")).to_upper()


func _side(drone: Dictionary) -> String:
	return String(_read_any(drone, ["combatSide", "combat_side", "side", "team"], ""))


func _target_id(drone: Dictionary) -> String:
	var ai := _dictionary(_read_any(drone, ["ai"], {}))
	return String(_read_any(ai, ["targetId", "target_id"], _read_any(drone, ["target_id"], "")))


func _position(drone: Dictionary) -> Vector3:
	return _vector3(_read_any(drone, ["pos", "position"], Vector3.ZERO))


func _velocity(drone: Dictionary) -> Vector3:
	return _vector3(_read_any(drone, ["velocity", "vel"], Vector3.ZERO))


func _yaw_forward(drone: Dictionary) -> Vector3:
	var yaw := float(_read_any(drone, ["yaw"], 0.0))
	return Vector3(sin(yaw), 0.0, cos(yaw))


func _body_rotation(drone: Dictionary) -> Quaternion:
	var raw: Variant = _read_any(drone, ["physicsQuaternion", "physics_quaternion", "rotation"], null)
	if raw is Quaternion:
		return raw.normalized()
	if raw is Array and raw.size() == 4:
		return Quaternion(float(raw[0]), float(raw[1]), float(raw[2]), float(raw[3])).normalized()
	var attitude := _dictionary(_read_any(drone, ["attitude"], {}))
	var pitch := float(_read_any(attitude, ["pitch"], _read_any(drone, ["pitch"], 0.0)))
	var roll := float(_read_any(attitude, ["roll"], _read_any(drone, ["roll"], 0.0)))
	var yaw := float(_read_any(drone, ["yaw"], 0.0))
	return Basis.from_euler(Vector3(pitch, yaw, roll), EULER_ORDER_YXZ).get_rotation_quaternion()


func _reduced_motion(snapshot: Dictionary) -> bool:
	if snapshot.has("reduced_motion"):
		return bool(snapshot.reduced_motion)
	var fleet := _dictionary(_read_any(snapshot, ["fleet"], {}))
	var options := _dictionary(_read_any(fleet, ["options"], {}))
	return bool(_read_any(options, ["reducedMotion", "reduced_motion"], false))


func _combat_state(snapshot: Dictionary) -> Dictionary:
	var nested: Variant = _read_any(snapshot, ["combat"], null)
	return nested if nested is Dictionary else snapshot


func _is_combat_snapshot(snapshot: Dictionary) -> bool:
	var combat: Variant = _read_any(snapshot, ["combat"], false)
	return bool(combat.get("enabled", true)) if combat is Dictionary else bool(combat)


func _obstacles_enabled(snapshot: Dictionary) -> bool:
	if snapshot.has("obstacles_enabled"):
		return bool(snapshot.obstacles_enabled)
	var fleet := _dictionary(_read_any(snapshot, ["fleet"], {}))
	var options := _dictionary(_read_any(fleet, ["options"], {}))
	return bool(_read_any(options, ["obstacles"], false))


func _read_any(source: Dictionary, keys: Array, fallback: Variant) -> Variant:
	for key in keys:
		if source.has(key):
			return source[key]
	return fallback


func _dictionary(value: Variant) -> Dictionary:
	return value if value is Dictionary else {}


func _array(value: Variant) -> Array:
	return value if value is Array else []


func _vector3(value: Variant) -> Vector3:
	if value is Vector3:
		return value
	if value is Array and value.size() >= 3:
		return Vector3(float(value[0]), float(value[1]), float(value[2]))
	if value is PackedFloat32Array and value.size() >= 3:
		return Vector3(value[0], value[1], value[2])
	return Vector3.ZERO

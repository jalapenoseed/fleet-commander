class_name ReplaySystem
extends Node

## ELI5: A replay is a flipbook, not a second physics simulation. Ten times a
## second we copy only the facts needed to draw the drones. Playback reads those
## copies and never writes a position, health value, or command into the live game.

signal buffer_changed(seconds: float, frame_count: int)
signal clip_added(clip: Dictionary)
signal playback_started(clip: Dictionary)
signal playback_stopped
signal playback_updated(snapshot: Dictionary, position: float, rate: float)
signal playback_pause_changed(paused: bool)

const SAMPLE_INTERVAL := 0.099
const MAX_FRAMES := 180
const MAX_DRONES := 256
const MAX_CLIPS := 6
const MAX_PENDING := 4
const PRE_ROLL_SECONDS := 5.0
const POST_ROLL_SECONDS := 2.0
const MANUAL_SECONDS := 8.0
const REPLAY_SPEEDS := [0.125, 0.25, 0.5, 1.0, 2.0]

@export var automatic_playback := true
@export var auto_highlights := true

var frames: Array[Dictionary] = []
var clips: Array[Dictionary] = []
var pending: Array[Dictionary] = []

var playback_active := false
var playback_paused := false
var playback_position := 0.0
var playback_speed := 0.25
var smart_slow_motion := true
var playing_clip: Dictionary = {}

var _generation: Variant = null
var _last_sample := -INF
var _last_highlight := -INF
var _last_event_id := 0
var _sequence := 0
var _last_stand := {}
var _event_timeline: Array[Dictionary] = []


func _ready() -> void:
	# Replay controls should still work while the live simulation is paused.
	process_mode = Node.PROCESS_MODE_ALWAYS
	set_process(false)


func _process(delta: float) -> void:
	if automatic_playback and playback_active:
		advance(delta)


## Add one live-state sample if enough simulation time has passed.
func sample(state: Dictionary) -> bool:
	if not _combat_enabled(state) or not bool(state.get("running", true)):
		return false
	var count := _state_count(state)
	if count <= 0 or count > MAX_DRONES:
		return false
	var generation: Variant = state.get("generation", _nested_combat(state).get("generation", 0))
	if generation != _generation:
		reset_run(generation)
	var time := _state_time(state)
	if time - _last_sample < SAMPLE_INTERVAL:
		return false
	_last_sample = time
	var frame := _capture_frame(state, time, count)
	frames.append(frame)
	while frames.size() > MAX_FRAMES:
		frames.pop_front()

	if auto_highlights:
		_detect_event_highlights(state, frame, time)
		_detect_last_stands(state, frame, time)
		_detect_close_call(state, frame, time)

	for item_value in pending.duplicate():
		var item: Dictionary = item_value
		if time >= float(item.end):
			_finish_pending(item)
			pending.erase(item)
	buffer_changed.emit(float(frames.size()) / 10.0, frames.size())
	return true


func reset_run(generation: Variant = null) -> void:
	frames.clear()
	pending.clear()
	_last_sample = -INF
	_last_highlight = -INF
	_last_event_id = 0
	_generation = generation
	_last_stand.clear()
	buffer_changed.emit(0.0, 0)


func clear_session() -> void:
	stop_playback()
	reset_run(null)
	clips.clear()


## Starts a seven-second highlight: five seconds before, two seconds after.
func mark_highlight(
	label: String,
	state: Dictionary,
	subject_id := "",
	event_time := NAN
) -> bool:
	if frames.is_empty():
		return false
	var time := _state_time(state) if is_nan(event_time) else event_time
	if not is_finite(time):
		return false
	_last_highlight = time
	_sequence += 1
	pending.append({
		"id": _sequence,
		"label": label.left(80),
		"subject": subject_id if subject_id != "" else _first_flying_id(state),
		"time": time,
		"start": maxf(float(frames[0].time), time - PRE_ROLL_SECONDS),
		"end": time + POST_ROLL_SECONDS,
		"context": _capture_context(state),
	})
	while pending.size() > MAX_PENDING:
		pending.pop_front()
	return true


## Immediately keeps the most recent eight seconds.
func capture_recent(state: Dictionary) -> Dictionary:
	if frames.size() < 2:
		return {}
	var end := float(frames.back().time)
	_sequence += 1
	return _finish_pending({
		"id": _sequence,
		"label": "Manual highlight",
		"subject": _first_flying_id(state),
		"time": end,
		"start": maxf(float(frames[0].time), end - MANUAL_SECONDS),
		"end": end,
		"context": _capture_context(state),
	})


func get_clips() -> Array[Dictionary]:
	return clips.duplicate(true)


func remove_clip(clip_id: int) -> bool:
	for index in clips.size():
		if int(clips[index].get("id", -1)) == clip_id:
			clips.remove_at(index)
			return true
	return false


## Playback owns only its private copy of the clip.
func play_clip(clip: Dictionary, slow := false) -> bool:
	if not validate_clip(clip):
		return false
	playing_clip = clip.duplicate(true)
	playback_active = true
	playback_paused = false
	playback_position = 0.0
	# Starting another clip should not forget the speed the player picked.
	# The optional slow button is the one case that deliberately selects 1/8 speed.
	if slow:
		playback_speed = 0.125
	elif not REPLAY_SPEEDS.has(playback_speed):
		playback_speed = 0.25
	smart_slow_motion = true
	_event_timeline = _build_event_timeline(playing_clip)
	set_process(automatic_playback)
	playback_started.emit(playing_clip.duplicate(true))
	_emit_playback()
	return true


func stop_playback() -> void:
	if not playback_active:
		return
	playback_active = false
	playback_paused = false
	playing_clip.clear()
	_event_timeline.clear()
	set_process(false)
	playback_stopped.emit()


func set_playback_paused(paused: bool) -> void:
	if not playback_active:
		return
	playback_paused = paused
	playback_pause_changed.emit(paused)


func set_playback_speed(speed: float) -> float:
	playback_speed = speed if REPLAY_SPEEDS.has(speed) else 0.25
	return playback_speed


func set_smart_slow_motion(enabled: bool) -> void:
	smart_slow_motion = enabled


func seek(seconds: float) -> Dictionary:
	if not playback_active:
		return {}
	playback_position = clampf(seconds, 0.0, clip_duration(playing_clip))
	set_playback_paused(true)
	return _emit_playback()


func advance(delta: float) -> Dictionary:
	if not playback_active:
		return {}
	var rate := current_playback_rate()
	if not playback_paused:
		playback_position += maxf(0.0, delta) * rate
		if playback_position >= clip_duration(playing_clip):
			playback_position = clip_duration(playing_clip)
			set_playback_paused(true)
	return _emit_playback()


func current_playback_rate() -> float:
	var base := playback_speed if REPLAY_SPEEDS.has(playback_speed) else 0.25
	if not smart_slow_motion or playing_clip.is_empty():
		return base
	var event_at := float(playing_clip.get("time", INF)) - float(playing_clip.get("start", 0.0))
	if not is_finite(event_at):
		event_at = clip_duration(playing_clip) * 0.65
	# The browser calls this a ramp, but parity is a deliberate hard 1/8-speed window.
	return minf(base, 0.125) if absf(playback_position - event_at) < 0.8 else base


func current_snapshot() -> Dictionary:
	if not playback_active:
		return {}
	return snapshot_at(playing_clip, playback_position)


func clip_duration(clip: Dictionary) -> float:
	return maxf(0.0, float(clip.get("end", 0.0)) - float(clip.get("start", 0.0)))


## Build a render-only state at any point in a clip. No live object is accepted
## here, so this function cannot accidentally change the battle.
func snapshot_at(clip: Dictionary, seconds: float) -> Dictionary:
	var clip_frames: Array = clip.get("frames", [])
	if clip_frames.size() < 2:
		return {}
	var start := float(clip.get("start", clip_frames[0].time))
	var end := float(clip.get("end", clip_frames.back().time))
	var time := clampf(start + seconds, start, end)
	var upper := clip_frames.size() - 1
	for index in clip_frames.size():
		if float(clip_frames[index].time) >= time:
			upper = index
			break
	var frame_b: Dictionary = clip_frames[upper]
	var frame_a: Dictionary = clip_frames[maxi(0, upper - 1)]
	var time_a := float(frame_a.time)
	var time_b := float(frame_b.time)
	var weight := 0.0 if is_equal_approx(time_a, time_b) else (time - time_a) / (time_b - time_a)
	var count := mini(int(frame_a.count), int(frame_b.count))

	var positions_a: PackedVector3Array = frame_a.positions
	var positions_b: PackedVector3Array = frame_b.positions
	var positions := PackedVector3Array()
	positions.resize(count)
	var yaws_a: PackedFloat32Array = frame_a.yaws
	var yaws_b: PackedFloat32Array = frame_b.yaws
	var yaws := PackedFloat32Array()
	yaws.resize(count)
	for index in count:
		positions[index] = positions_a[index].lerp(positions_b[index], weight)
		yaws[index] = lerp_angle(yaws_a[index], yaws_b[index], weight)

	var crossed_upper := time >= time_b
	var discrete: Dictionary = frame_b if crossed_upper else frame_a
	var context := _dictionary(clip.get("context", {}))
	var result := {
		"count": count,
		"positions": positions,
		"velocities": _copy_variant(frame_a.velocities),
		"homes": _copy_variant(frame_a.get("homes", PackedVector3Array())),
		"health": _copy_variant(discrete.health),
		"batteries": _copy_variant(frame_a.batteries),
		"modes": _copy_variant(discrete.modes),
		"teams": _copy_variant(frame_a.teams),
		"types": _copy_variant(frame_a.types),
		"colors": _copy_variant(frame_a.get("colors", PackedColorArray())),
		"ids": _copy_variant(frame_a.ids),
		"kills": _copy_variant(frame_a.kills),
		"last_action": _copy_variant(frame_a.last_action),
		"target_indices": _copy_variant(frame_a.target_indices),
		"ammo": _copy_variant(frame_a.ammo),
		"yaws": yaws,
		"rotations": _copy_variant(discrete.get("rotations", [])),
		"events": _events_at(time),
		"payloads": _copy_variant(frame_a.payloads),
		"teams_summary": _copy_variant(frame_a.teams_summary),
		"elapsed": lerpf(float(frame_a.elapsed), float(frame_b.elapsed), weight),
		"time": time,
		"running": not playback_paused,
		"combat": true,
		"replay": true,
		"generation": "replay-%s" % str(clip.get("id", 0)),
		"context": _copy_variant(context),
	}
	# Keep the bundle for storage, and also restore its familiar top-level keys.
	# That lets the camera and HUD read a replay exactly like they read live state.
	result.fleet = _copy_variant(context.get("fleet", {}))
	result.program = _copy_variant(context.get("program", {}))
	result.lab = _copy_variant(context.get("lab", {}))
	result.planet = String(context.get("planet", "earth"))
	result.obstacles = _copy_variant(context.get("obstacles", []))
	result.obstacles_enabled = bool(context.get("obstacles_enabled", false))
	result.reduced_motion = bool(context.get("reduced_motion", false))
	return result


## Lightweight guard for UI/import callers. It also catches damaged session data.
func validate_clip(clip: Dictionary) -> bool:
	var clip_frames: Variant = clip.get("frames", null)
	if not clip_frames is Array or clip_frames.size() < 2 or clip_frames.size() > 190:
		return false
	var start := float(clip.get("start", NAN))
	var end := float(clip.get("end", NAN))
	if not is_finite(start) or not is_finite(end) or end <= start or end - start > 20.0:
		return false
	if String(clip.get("label", "")).length() > 80:
		return false
	var previous := -INF
	for value in clip_frames:
		if not value is Dictionary:
			return false
		var frame: Dictionary = value
		var time := float(frame.get("time", NAN))
		var count := int(frame.get("count", -1))
		if not is_finite(time) or time <= previous or count < 0 or count > MAX_DRONES:
			return false
		if not _frame_arrays_are_safe(frame, count):
			return false
		previous = time
	return true


## Every list we index during playback must describe the same number of drones.
## This turns a broken save file into a friendly `false` instead of a crash.
func _frame_arrays_are_safe(frame: Dictionary, count: int) -> bool:
	var positions: Variant = frame.get("positions", null)
	var velocities: Variant = frame.get("velocities", null)
	var homes: Variant = frame.get("homes", null)
	var health: Variant = frame.get("health", null)
	var batteries: Variant = frame.get("batteries", null)
	var modes: Variant = frame.get("modes", null)
	var teams: Variant = frame.get("teams", null)
	var types: Variant = frame.get("types", null)
	var ids: Variant = frame.get("ids", null)
	var kills: Variant = frame.get("kills", null)
	var last_action: Variant = frame.get("last_action", null)
	var target_indices: Variant = frame.get("target_indices", null)
	var ammo: Variant = frame.get("ammo", null)
	var yaws: Variant = frame.get("yaws", null)
	if not positions is PackedVector3Array or positions.size() != count:
		return false
	if not velocities is PackedVector3Array or velocities.size() != count:
		return false
	if not homes is PackedVector3Array or homes.size() != count:
		return false
	if not health is PackedFloat32Array or health.size() != count:
		return false
	if not batteries is PackedFloat32Array or batteries.size() != count:
		return false
	if not modes is PackedByteArray or modes.size() != count:
		return false
	if not teams is PackedByteArray or teams.size() != count:
		return false
	if not types is PackedByteArray or types.size() != count:
		return false
	if not (ids is Array or ids is PackedStringArray) or ids.size() != count:
		return false
	if not kills is PackedInt32Array or kills.size() != count:
		return false
	if not last_action is PackedFloat32Array or last_action.size() != count:
		return false
	if not target_indices is PackedInt32Array or target_indices.size() != count:
		return false
	if not ammo is PackedInt32Array or ammo.size() != count:
		return false
	if not yaws is PackedFloat32Array or yaws.size() != count:
		return false
	return frame.get("events", null) is Array and frame.get("payloads", null) is Array and frame.get("teams_summary", null) is Dictionary


func _capture_frame(state: Dictionary, time: float, count: int) -> Dictionary:
	var positions := _packed_vectors(state.get("positions", PackedVector3Array()), count)
	var velocities := _packed_vectors(state.get("velocities", PackedVector3Array()), count)
	var yaws := _packed_floats(state.get("yaws", PackedFloat32Array()), count, NAN)
	# A snapshot can know some headings but not others. Repair only each missing
	# entry, so one bad value cannot erase all the good drone headings.
	for index in count:
		if is_finite(yaws[index]):
			continue
		var velocity := velocities[index] if index < velocities.size() else Vector3.ZERO
		yaws[index] = atan2(velocity.x, velocity.z) if velocity.length_squared() > 0.0001 else 0.0
	var recent_events: Array[Dictionary] = []
	for event_value in _state_events(state):
		var event: Dictionary = event_value
		if time - float(event.get("time", time)) < 2.0:
			recent_events.append(event.duplicate(true))
	return {
		"time": time,
		"elapsed": float(state.get("elapsed", time)),
		"count": count,
		"positions": positions,
		"velocities": velocities,
		"homes": _packed_vectors(state.get("homes", PackedVector3Array()), count),
		"health": _packed_floats(state.get("health", PackedFloat32Array()), count, 100.0),
		"batteries": _packed_floats(state.get("batteries", PackedFloat32Array()), count, 100.0),
		"modes": _packed_bytes(state.get("modes", PackedByteArray()), count, 2),
		"teams": _packed_bytes(state.get("teams", PackedByteArray()), count, 0),
		"types": _packed_bytes(state.get("types", PackedByteArray()), count, 0),
		"colors": _copy_variant(state.get("colors", PackedColorArray())),
		"ids": _copy_variant(state.get("ids", [])),
		"kills": _packed_ints(state.get("kills", PackedInt32Array()), count, 0),
		"last_action": _packed_floats(state.get("last_action", PackedFloat32Array()), count, 0.0),
		"target_indices": _packed_ints(state.get("target_indices", state.get("ai_target_indices", PackedInt32Array())), count, -1),
		"ammo": _packed_ints(state.get("ammo", PackedInt32Array()), count, 0),
		"yaws": yaws,
		"rotations": _copy_variant(state.get("rotations", state.get("quaternions", []))),
		"payloads": _copy_variant(state.get("payloads", [])),
		"events": recent_events,
		"teams_summary": _team_summary(state),
	}


func _detect_event_highlights(state: Dictionary, _frame: Dictionary, time: float) -> void:
	for event_value in _state_events(state):
		var event: Dictionary = event_value
		var event_id := int(event.get("id", 0))
		if event_id <= _last_event_id:
			continue
		_last_event_id = event_id
		var kind := String(event.get("type", ""))
		if not ["destroy", "explosion", "impact"].has(kind) or time - _last_highlight <= 2.5:
			continue
		var label := "Aircraft down" if kind == "destroy" else ("Blast highlight" if kind == "explosion" else "Impact")
		var subject := String(event.get("drone_id", event.get("droneId", event.get("attacker", ""))))
		mark_highlight(label, state, subject, float(event.get("time", time)))


func _detect_last_stands(state: Dictionary, frame: Dictionary, time: float) -> void:
	var summary: Dictionary = frame.teams_summary
	for side in ["friendly", "enemy"]:
		var team: Dictionary = summary.get(side, {})
		if int(team.get("total", 0)) > 1 and int(team.get("flying", 0)) == 1 and not _last_stand.has(side):
			_last_stand[side] = true
			mark_highlight("Last survivor · " + side, state, _first_flying_id(state, side), time)


func _detect_close_call(state: Dictionary, frame: Dictionary, time: float) -> void:
	if time - _last_highlight <= 5.0:
		return
	var positions: PackedVector3Array = frame.positions
	var velocities: PackedVector3Array = frame.velocities
	var modes: PackedByteArray = frame.modes
	var teams: PackedByteArray = frame.teams
	var best_distance := INF
	var subject := ""
	for first in frame.count:
		if modes[first] != 2:
			continue
		for second in range(first + 1, int(frame.count)):
			if modes[second] != 2 or teams[first] == teams[second]:
				continue
			var distance := positions[first].distance_to(positions[second])
			if distance <= 1.5 or distance >= 4.0 or distance >= best_distance:
				continue
			if (velocities[first] - velocities[second]).length() <= 7.0:
				continue
			best_distance = distance
			subject = _state_id(frame, first)
	if subject != "":
		mark_highlight("Close call", state, subject, time)


func _finish_pending(item: Dictionary) -> Dictionary:
	var clip_frames: Array[Dictionary] = []
	for frame in frames:
		if float(frame.time) >= float(item.start) and float(frame.time) <= float(item.end):
			clip_frames.append(frame.duplicate(true))
	if clip_frames.size() < 2:
		return {}
	var clip := item.duplicate(true)
	clip.frames = clip_frames
	clip.start = float(clip_frames[0].time)
	clip.end = float(clip_frames.back().time)
	clips.push_front(clip)
	while clips.size() > MAX_CLIPS:
		clips.pop_back()
	clip_added.emit(clip.duplicate(true))
	return clip.duplicate(true)


func _emit_playback() -> Dictionary:
	var snapshot := current_snapshot()
	if not snapshot.is_empty():
		playback_updated.emit(snapshot, playback_position, current_playback_rate())
	return snapshot


func _build_event_timeline(clip: Dictionary) -> Array[Dictionary]:
	var by_id := {}
	for frame_value in clip.get("frames", []):
		var frame: Dictionary = frame_value
		for event_value in frame.get("events", []):
			var event: Dictionary = event_value
			by_id[int(event.get("id", 0))] = event.duplicate(true)
	var timeline: Array[Dictionary] = []
	for event in by_id.values():
		timeline.append(event)
	timeline.sort_custom(func(a, b): return float(a.get("time", 0.0)) < float(b.get("time", 0.0)))
	return timeline


func _events_at(time: float) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for event in _event_timeline:
		var event_time := float(event.get("time", 0.0))
		if event_time <= time and time - event_time < 2.0:
			result.append(event.duplicate(true))
	return result


func _capture_context(state: Dictionary) -> Dictionary:
	var fleet := _dictionary(state.get("fleet", {}))
	var options := _dictionary(fleet.get("options", {}))
	return {
		"fleet": _copy_variant(fleet),
		"program": _copy_variant(state.get("program", {})),
		"lab": _copy_variant(state.get("lab", {})),
		"planet": String(state.get("planet", _dictionary(state.get("lab", {})).get("planet", "earth"))),
		"obstacles": _copy_variant(state.get("obstacles", [])),
		"obstacles_enabled": bool(state.get("obstacles_enabled", options.get("obstacles", false))),
		"reduced_motion": bool(state.get("reduced_motion", options.get("reducedMotion", options.get("reduced_motion", false)))),
	}


func _combat_enabled(state: Dictionary) -> bool:
	var combat: Variant = state.get("combat", false)
	return bool(combat.get("enabled", true)) if combat is Dictionary else bool(combat)


func _nested_combat(state: Dictionary) -> Dictionary:
	var combat: Variant = state.get("combat", {})
	return combat if combat is Dictionary else state


func _state_time(state: Dictionary) -> float:
	return float(_nested_combat(state).get("time", state.get("time", state.get("elapsed", 0.0))))


func _state_count(state: Dictionary) -> int:
	if state.has("count"):
		return int(state.count)
	var positions: Variant = state.get("positions", [])
	return positions.size()


func _state_events(state: Dictionary) -> Array:
	return _array(_nested_combat(state).get("events", state.get("events", [])))


func _team_summary(state: Dictionary) -> Dictionary:
	var supplied: Variant = state.get("teams_summary", _nested_combat(state).get("teams_summary", null))
	if supplied is Dictionary:
		return supplied.duplicate(true)
	var result := {
		"friendly": {"total": 0, "flying": 0, "returning": 0, "landed": 0, "downed": 0},
		"enemy": {"total": 0, "flying": 0, "returning": 0, "landed": 0, "downed": 0},
	}
	var count := _state_count(state)
	var teams: Variant = state.get("teams", PackedByteArray())
	var modes: Variant = state.get("modes", PackedByteArray())
	for index in count:
		var side := "friendly" if int(_indexed(teams, index, 0)) == 0 else "enemy"
		var row: Dictionary = result[side]
		row.total += 1
		match int(_indexed(modes, index, 2)):
			2:
				row.flying += 1
			3, 4:
				row.returning += 1
			5:
				row.landed += 1
			6, 7:
				row.downed += 1
	return result


func _first_flying_id(state: Dictionary, wanted_side := "") -> String:
	var count := _state_count(state)
	var modes: Variant = state.get("modes", PackedByteArray())
	var teams: Variant = state.get("teams", PackedByteArray())
	for index in count:
		if int(_indexed(modes, index, 2)) != 2:
			continue
		var side := "friendly" if int(_indexed(teams, index, 0)) == 0 else "enemy"
		if wanted_side == "" or side == wanted_side:
			return _state_id(state, index)
	return ""


func _state_id(state: Dictionary, index: int) -> String:
	return String(_indexed(state.get("ids", []), index, "drone-%03d" % (index + 1)))


func _packed_vectors(value: Variant, count: int) -> PackedVector3Array:
	var result := PackedVector3Array()
	result.resize(count)
	for index in count:
		var item: Variant = _indexed(value, index, Vector3.ZERO)
		if item is Vector3:
			result[index] = item
		elif item is Array and item.size() >= 3:
			result[index] = Vector3(float(item[0]), float(item[1]), float(item[2]))
	return result


func _packed_floats(value: Variant, count: int, fallback: float) -> PackedFloat32Array:
	var result := PackedFloat32Array()
	result.resize(count)
	for index in count:
		result[index] = float(_indexed(value, index, fallback))
	return result


func _packed_ints(value: Variant, count: int, fallback: int) -> PackedInt32Array:
	var result := PackedInt32Array()
	result.resize(count)
	for index in count:
		result[index] = int(_indexed(value, index, fallback))
	return result


func _packed_bytes(value: Variant, count: int, fallback: int) -> PackedByteArray:
	var result := PackedByteArray()
	result.resize(count)
	for index in count:
		result[index] = clampi(int(_indexed(value, index, fallback)), 0, 255)
	return result


func _indexed(values: Variant, index: int, fallback: Variant) -> Variant:
	if index < 0:
		return fallback
	if values is Array and index < values.size():
		return values[index]
	if values is PackedStringArray and index < values.size():
		return values[index]
	if values is PackedVector3Array and index < values.size():
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
	if values is PackedColorArray and index < values.size():
		return values[index]
	return fallback


func _copy_variant(value: Variant) -> Variant:
	if value is Dictionary or value is Array:
		return value.duplicate(true)
	if (
		value is PackedVector3Array
		or value is PackedFloat32Array
		or value is PackedFloat64Array
		or value is PackedInt32Array
		or value is PackedInt64Array
		or value is PackedByteArray
		or value is PackedStringArray
		or value is PackedColorArray
	):
		return value.duplicate()
	return value


func _array(value: Variant) -> Array:
	return value if value is Array else []


func _dictionary(value: Variant) -> Dictionary:
	return value if value is Dictionary else {}

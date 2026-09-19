extends Node

## Fleet Commander Godot entry point.
##
## ELI5: This is the conductor. The simulation calculates aircraft positions,
## the renderer draws them, the camera chooses what you see, replay stores pose
## copies, and the interface sends requests. Keeping those jobs separate makes
## it much safer to change measurements without breaking the whole game.

const SAVE_PATH := "user://fleet_commander_godot_fleet.json"
const UI_REFRESH_SECONDS := 0.1

var fleet: FleetSimulation
var combat := CombatSystem.new()
var replay: ReplaySystem
var environment: EnvironmentController
var renderer: SwarmRenderer
var effects: BattleEffects
var camera_director: CameraDirector
var view_camera: Camera3D
var interface: CommanderUI
var audio: ArenaAudio

var selected_index := 0
var current_planet := "earth"
var constrained_rotors := false
var replay_state: Dictionary = {}
var _live_was_running := true
var _audio_was_enabled := false
var _camera_before_replay: StringName = &"orbit"
var _ui_clock := 0.0
var _camera_mode_index := 0
var _last_state: Dictionary = {}


func _ready() -> void:
	_build_world()
	_build_services()
	_connect_interface()
	_apply_planet(&"earth", false)
	fleet.launch_all()
	print("Fleet Commander Godot port ready: %d independently simulated aircraft." % fleet.drone_count())


func _process(delta: float) -> void:
	var state: Dictionary
	if replay.playback_active:
		state = replay.current_snapshot()
	else:
		if combat.enabled:
			var profile := PlanetModel.get_profile(current_planet)
			combat.step(delta, float(profile.gravity), float(profile.density))
			state = combat.render_state()
			_add_shared_context(state)
			replay.sample(state)
		else:
			fleet.simulate_step(delta)
			state = fleet.render_state()
			_add_shared_context(state)
	_last_state = state

	var pose := camera_director.update_camera(state, selected_index, delta)
	state["camera_mode"] = String(camera_director.view)
	renderer.set_hidden_index(_index_for_id(state, String(pose.get("hidden_subject_id", ""))))
	renderer.sync_state(state)
	effects.sync_events(state.get("events", []))
	audio.set_state(state)

	_ui_clock += delta
	if _ui_clock >= UI_REFRESH_SECONDS:
		_ui_clock = 0.0
		interface.set_status(state, String(pose.get("label", "Fleet view")), _replay_status(), audio.enabled)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
		camera_director.look_delta(event.relative)
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			camera_director.zoom_by(0.8)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			camera_director.zoom_by(1.25)
	elif event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_SPACE:
				_on_pause_requested()
			KEY_B:
				_on_payload_requested()
			KEY_TAB:
				_on_next_subject_requested(1)
			KEY_C:
				_cycle_camera()
			KEY_F8:
				camera_director.set_view(&"cinematic")
			KEY_ESCAPE:
				if replay.playback_active:
					_on_replay_stop_requested()


func _build_world() -> void:
	var world := Node3D.new()
	world.name = "ArenaWorld"
	add_child(world)

	environment = EnvironmentController.new()
	environment.name = "Environment"
	world.add_child(environment)

	renderer = SwarmRenderer.new()
	renderer.name = "SwarmRenderer"
	world.add_child(renderer)

	effects = BattleEffects.new()
	effects.name = "BattleEffects"
	world.add_child(effects)

	camera_director = CameraDirector.new()
	camera_director.name = "CameraDirector"
	world.add_child(camera_director)
	view_camera = Camera3D.new()
	view_camera.name = "Camera3D"
	view_camera.near = 0.08
	view_camera.far = 3600.0
	camera_director.add_child(view_camera)
	camera_director.set_camera(view_camera)


func _build_services() -> void:
	fleet = FleetSimulation.new(100)
	fleet.set_planet_model(PlanetModel)
	renderer.set_simulation(fleet)

	replay = ReplaySystem.new()
	replay.name = "ReplaySystem"
	add_child(replay)
	replay.playback_started.connect(_on_replay_started)
	replay.playback_stopped.connect(_on_replay_stopped)
	replay.playback_updated.connect(_on_replay_updated)

	audio = ArenaAudio.new()
	audio.name = "ArenaAudio"
	add_child(audio)
	audio.set_mix(0.75, 0.65, 0.45, 0.8)

	interface = CommanderUI.new()
	interface.name = "CommanderUI"
	add_child(interface)


func _connect_interface() -> void:
	interface.launch_requested.connect(_on_launch_requested)
	interface.pause_requested.connect(_on_pause_requested)
	interface.land_requested.connect(_on_land_requested)
	interface.recharge_requested.connect(_on_recharge_requested)
	interface.roster_requested.connect(_on_roster_requested)
	interface.formation_requested.connect(_on_formation_requested)
	interface.boids_requested.connect(_on_boids_requested)
	interface.boid_value_requested.connect(_on_boid_value_requested)
	interface.influence_requested.connect(_on_influence_requested)
	interface.camera_requested.connect(_on_camera_requested)
	interface.next_subject_requested.connect(_on_next_subject_requested)
	interface.next_shot_requested.connect(camera_director.next_cinematic_shot)
	interface.planet_requested.connect(_apply_planet)
	interface.battle_prepare_requested.connect(_on_battle_prepare_requested)
	interface.battle_engage_requested.connect(_on_battle_engage_requested)
	interface.battle_exit_requested.connect(_on_battle_exit_requested)
	interface.payload_requested.connect(_on_payload_requested)
	interface.replay_capture_requested.connect(_on_replay_capture_requested)
	interface.replay_play_requested.connect(_on_replay_play_requested)
	interface.replay_stop_requested.connect(_on_replay_stop_requested)
	interface.replay_speed_requested.connect(replay.set_playback_speed)
	interface.audio_requested.connect(_on_audio_requested)
	interface.save_requested.connect(_on_save_requested)
	interface.load_requested.connect(_on_load_requested)


func _on_launch_requested() -> void:
	if replay.playback_active:
		return
	if combat.enabled:
		combat.engage()
	else:
		fleet.launch_all()


func _on_pause_requested() -> void:
	if replay.playback_active:
		replay.set_playback_paused(not replay.playback_paused)
	elif combat.enabled:
		combat.set_paused(combat.running)
	else:
		fleet.running = not fleet.running


func _on_land_requested() -> void:
	if replay.playback_active:
		return
	if combat.enabled:
		combat.retreat_team(CombatSystem.TEAM_FRIENDLY)
	else:
		fleet.recall_all()


func _on_recharge_requested() -> void:
	if not combat.enabled and not replay.playback_active:
		fleet.recharge()


func _on_roster_requested(count: int) -> void:
	if combat.enabled or replay.playback_active:
		return
	fleet.build_fleet(count)
	selected_index = clampi(selected_index, 0, maxi(0, fleet.drone_count() - 1))
	renderer.set_selected_index(selected_index)


func _on_formation_requested(formation: StringName) -> void:
	if combat.enabled or replay.playback_active:
		return
	fleet.set_formation({"shape": String(formation)})


func _on_boids_requested(enabled: bool) -> void:
	if not combat.enabled and not replay.playback_active:
		if enabled:
			fleet.set_boids({"enabled": true, "boids": "on"})
		else:
			# "Off" is a real reset: old experimental weights cannot surprise
			# someone when they enable Boids again later.
			fleet.reset_boids()


func _on_boid_value_requested(key: StringName, value: float) -> void:
	if not combat.enabled and not replay.playback_active:
		fleet.set_boids({String(key): value})


func _on_influence_requested(slot: int, kind: StringName, strength: float) -> void:
	if combat.enabled or replay.playback_active:
		return
	if slot < 0:
		fleet.reset_influences()
	else:
		fleet.set_influence(slot, {"type": String(kind), "strength": strength * 16.0, "blend": 1.0})


func _on_camera_requested(mode: StringName) -> void:
	camera_director.set_view(mode)
	_camera_mode_index = maxi(0, camera_director.supported_views().find(camera_director.view))


func _on_next_subject_requested(direction: int) -> void:
	var count := int(_last_state.get("count", 0))
	if count <= 0:
		selected_index = 0
		return
	selected_index = posmod(selected_index + direction, count)
	renderer.set_selected_index(selected_index)
	var ids: Variant = _last_state.get("ids", [])
	if ids is Array and selected_index < ids.size():
		camera_director.set_selected_subject(String(ids[selected_index]))
	elif ids is PackedStringArray and selected_index < ids.size():
		camera_director.set_selected_subject(String(ids[selected_index]))


func _cycle_camera() -> void:
	var views := camera_director.supported_views()
	_camera_mode_index = (_camera_mode_index + 1) % views.size()
	camera_director.set_view(views[_camera_mode_index])


func _apply_planet(planet: StringName, constrained: bool) -> void:
	if combat.enabled or replay.playback_active:
		return
	current_planet = PlanetModel.normalize_planet_id(planet)
	constrained_rotors = constrained
	fleet.set_lab_settings({
		"planet": current_planet,
		"rotor_mode": "constrained" if constrained else "arcade",
	})
	environment.set_planet(current_planet)
	var weather := environment.get_effective_weather()
	weather.planet = current_planet
	audio.set_weather(weather)


func _on_battle_prepare_requested(friendly: int, enemy: int) -> void:
	if replay.playback_active:
		return
	combat.prepare(friendly, enemy)
	selected_index = 0
	renderer.set_selected_index(selected_index)
	effects.reset()
	camera_director.set_view(&"action")


func _on_battle_engage_requested() -> void:
	if replay.playback_active:
		return
	if not combat.enabled:
		combat.prepare()
	combat.engage()
	camera_director.set_view(&"action")


func _on_battle_exit_requested() -> void:
	if replay.playback_active:
		return
	combat.exit_battle()
	replay.reset_run()
	selected_index = clampi(selected_index, 0, maxi(0, fleet.drone_count() - 1))
	renderer.set_selected_index(selected_index)
	effects.reset()
	camera_director.set_view(&"orbit")


func _on_payload_requested() -> void:
	if combat.enabled and not replay.playback_active:
		combat.drop_payload(selected_index)


func _on_replay_capture_requested() -> void:
	if combat.enabled and not replay.playback_active:
		var state := combat.render_state()
		_add_shared_context(state)
		replay.capture_recent(state)


func _on_replay_play_requested() -> void:
	if replay.playback_active:
		return
	var clips := replay.get_clips()
	if clips.is_empty():
		var state := combat.render_state() if combat.enabled else _last_state
		var clip := replay.capture_recent(state)
		if not clip.is_empty():
			clips = [clip]
	if not clips.is_empty():
		# Keep the speed chosen in the Replay page. Smart slow motion still
		# drops to 1/8 speed around the highlight moment when it is enabled.
		replay.play_clip(clips[0], false)


func _on_replay_stop_requested() -> void:
	replay.stop_playback()


func _on_replay_started(_clip: Dictionary) -> void:
	_live_was_running = combat.running if combat.enabled else fleet.running
	_audio_was_enabled = audio.enabled
	_camera_before_replay = camera_director.view
	if combat.enabled:
		combat.running = false
	else:
		fleet.running = false
	camera_director.set_view(&"action")
	# Event IDs repeat inside the flipbook, so give replay its own clean visual
	# effects cursor. This changes only sparks/explosions, never combat state.
	effects.reset()
	audio.set_enabled(false)


func _on_replay_stopped() -> void:
	replay_state.clear()
	if combat.enabled:
		combat.running = _live_was_running
	else:
		fleet.running = _live_was_running
	renderer.clear_display_state()
	effects.reset()
	camera_director.set_view(_camera_before_replay)
	if _audio_was_enabled:
		audio.set_enabled(true)


func _on_replay_updated(snapshot: Dictionary, _position: float, _rate: float) -> void:
	replay_state = snapshot


func _on_audio_requested() -> void:
	if not replay.playback_active:
		audio.toggle()


func _on_save_requested() -> void:
	if combat.enabled or replay.playback_active:
		return
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(fleet.snapshot_config(), "  "))


func _on_load_requested() -> void:
	if combat.enabled or replay.playback_active or not FileAccess.file_exists(SAVE_PATH):
		return
	var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if not file:
		return
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		if fleet.load_config(parsed) != OK:
			return
		current_planet = PlanetModel.normalize_planet_id(fleet.lab_settings.get("planet", "earth"))
		constrained_rotors = String(fleet.lab_settings.get("rotor_mode", "arcade")) == "constrained"
		environment.set_planet(current_planet)
		environment.set_obstacles_enabled(fleet.obstacles_enabled)
		var weather := environment.get_effective_weather()
		weather.planet = current_planet
		audio.set_weather(weather)
		selected_index = clampi(selected_index, 0, maxi(0, fleet.drone_count() - 1))
		renderer.set_selected_index(selected_index)


func _add_shared_context(state: Dictionary) -> void:
	state["planet"] = current_planet
	state["lab"] = fleet.lab_settings.duplicate(true)
	state["fleet"] = {
		"name": fleet.fleet_name,
		"count": fleet.drone_count(),
		"unlimited_battery": fleet.unlimited_battery,
		"battery_drain": fleet.battery_drain,
	}
	state["program"] = {
		"formation": fleet.formation_settings.duplicate(true),
		"boids": fleet.boid_settings.duplicate(true),
	}
	state["obstacles"] = environment.get_obstacles()
	state["obstacles_enabled"] = fleet.obstacles_enabled
	state["reduced_motion"] = fleet.reduced_motion


func _index_for_id(state: Dictionary, wanted_id: String) -> int:
	if wanted_id.is_empty():
		return -1
	var ids: Variant = state.get("ids", [])
	if ids is Array or ids is PackedStringArray:
		return ids.find(wanted_id)
	return -1


func _replay_status() -> String:
	if replay.playback_active:
		return "Replay %.1fs • %.3gx" % [replay.playback_position, replay.current_playback_rate()]
	return "%d highlight%s • %.1fs buffer" % [
		replay.clips.size(),
		"" if replay.clips.size() == 1 else "s",
		float(replay.frames.size()) / 10.0,
	]

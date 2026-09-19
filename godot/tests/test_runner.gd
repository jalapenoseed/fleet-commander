extends SceneTree

## Dependency-free headless tests.
## Run: godot --headless --path godot --script res://tests/test_runner.gd

var failures: Array[String] = []
var checks := 0


func _initialize() -> void:
	_run_all.call_deferred()


func _run_all() -> void:
	print("Fleet Commander Godot tests")
	_test_planets_and_energy()
	_test_formations_and_reset()
	_test_fleet_lifecycle()
	_test_large_fleet()
	_test_combat()
	_test_replay_and_cameras()
	_test_browser_save_round_trip()
	await _test_main_integration()
	# Let queued test nodes and their generated meshes leave the SceneTree before
	# the headless runner asks ObjectDB whether anything leaked.
	await process_frame
	await process_frame
	if failures.is_empty():
		print("PASS: %d checks" % checks)
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		print("FAIL: %d of %d checks" % [failures.size(), checks])
		quit(1)


func _test_planets_and_energy() -> void:
	_check(is_equal_approx(float(PlanetModel.get_profile("earth").gravity), 9.81), "Earth gravity")
	_check(is_equal_approx(float(PlanetModel.get_profile("moon").gravity), 1.62), "Moon gravity")
	_check(is_equal_approx(float(PlanetModel.get_profile("mars").density), 0.016), "Mars density")
	var budget := PlanetModel.energy_budget()
	_check(is_equal_approx(float(budget.mass), 0.674), "Default mass is 0.674 kg")
	_check(is_equal_approx(float(budget.watts), 148.0), "Default hover electronics budget is 148 W")
	_check(not PlanetModel.can_sustain_rotor_flight("moon", "constrained"), "Moon constrained rotors fall")
	_check(PlanetModel.can_sustain_rotor_flight("moon", "arcade"), "Moon arcade mode remains playable")


func _test_formations_and_reset() -> void:
	for shape in FormationLibrary.SHAPES:
		for index in 24:
			var point := FormationLibrary.formation_point(String(shape), index, 24, 14.0)
			_check(point.is_finite(), "Finite %s formation target %d" % [shape, index])
	var settings := FormationLibrary.default_settings()
	settings = FormationLibrary.set_influence(settings, 0, {"type": "vortex", "strength": 12.0})
	_check(String(settings.influences[0].type) == "vortex", "Influence applies to one layer")
	settings = FormationLibrary.reset_influences(settings)
	_check(String(settings.influences[0].type) == "none", "Influence None/reset clears layer")
	var boids := BoidsSolver.normalize_settings({"enabled": true, "separation": 2.0})
	_check(bool(boids.enabled), "Boids enable")
	boids = BoidsSolver.reset(boids)
	_check(not bool(boids.enabled), "Boids explicit reset")


func _test_fleet_lifecycle() -> void:
	var sim := FleetSimulation.new(100)
	_check(sim.drone_count() == 100, "100-drone fleet builds")
	var pads := {}
	for home in sim.homes:
		pads[home] = true
	_check(pads.size() == 100, "Launch pads are unique")
	_check(sim.launch_all() == 100, "Launch all queues every ready drone")
	for _frame in 180:
		sim.simulate_step(1.0 / 60.0)
	var metrics := sim.metrics()
	_check(int(metrics.active) > 0, "Queued drones become airborne")
	_check(sim.batteries[0] < 100.0, "Finite battery drains")
	sim.set_formation({"shape": "heart"})
	sim.set_boids({"enabled": true})
	for _frame in 12:
		sim.simulate_step(1.0 / 60.0)
	_check(String(sim.formation_settings.shape) == "heart", "Formation can change live")
	_check(bool(sim.boid_settings.enabled), "Boids can compose with formation")
	_check(sim.recall_all() > 0, "Recall addresses active fleet")


func _test_large_fleet() -> void:
	var started := Time.get_ticks_msec()
	var sim := FleetSimulation.new(10_000)
	var build_ms := Time.get_ticks_msec() - started
	_check(sim.drone_count() == 10_000, "10,000 independent states build")
	_check(sim.positions.size() == 10_000 and sim.batteries.size() == 10_000, "10,000 packed arrays align")
	var first := sim.positions[0]
	var last := sim.positions[9999]
	_check(not first.is_equal_approx(last), "Large fleet has independent launch pads")
	_check(int(sim.render_state().count) == 10_000, "Renderer receives 10,000-aircraft state")
	print("  10,000-aircraft build: %d ms" % build_ms)


func _test_combat() -> void:
	var capped := CombatSystem.new()
	capped.prepare(140, 140)
	_check(capped.positions.size() == 256, "Combat roster caps at 256")

	var damage_probe := CombatSystem.new()
	damage_probe.prepare(1, 1)
	damage_probe.apply_damage(1, 500.0, &"impact", 0)
	_check(damage_probe.modes[1] == CombatSystem.MODE_FALLING, "Lethal damage starts a falling wreck")
	_check(damage_probe.kills[0] == 1, "Lethal damage credits the attacker")
	for _frame in 300:
		damage_probe.step(1.0 / 60.0)
		if damage_probe.modes[1] == CombatSystem.MODE_WRECK:
			break
	_check(damage_probe.modes[1] == CombatSystem.MODE_WRECK, "Falling aircraft eventually becomes a wreck")

	var battle := CombatSystem.new()
	battle.prepare(8, 8)
	battle.engage()
	for _frame in 600:
		battle.step(1.0 / 60.0)
	var state := battle.render_state()
	_check(bool(state.combat), "Combat state is marked for replay/camera")
	_check(float(state.time) >= 9.9, "Combat advances on fixed steps")
	_check(state.events.size() > 1, "Combat creates action events")
	_check(int(state.teams_summary.friendly.total) == 8, "Friendly team counter")
	_check(int(state.teams_summary.enemy.total) == 8, "Hostile team counter")

	var retreat_probe := CombatSystem.new()
	retreat_probe.prepare(1, 1)
	retreat_probe.retreat(0)
	retreat_probe.positions[0] = retreat_probe.homes[0]
	retreat_probe.velocities[0] = Vector3.ZERO
	retreat_probe.step(1.0 / 60.0)
	_check(retreat_probe.modes[0] == CombatSystem.MODE_LANDED, "A returned combat aircraft reaches landed state")
	_check(int(retreat_probe.team_summary().friendly.landed) == 1, "Combat summary counts landed retreats")


func _test_replay_and_cameras() -> void:
	var battle := CombatSystem.new()
	battle.prepare(4, 4)
	battle.engage()
	var replay := ReplaySystem.new()
	get_root().add_child(replay)
	var replay_obstacles := [
		{"x": 4.0, "z": -7.0, "w": 2.0, "d": 3.0, "h": 5.0},
	]
	for _frame in 120:
		battle.step(1.0 / 60.0)
		var live_state := battle.render_state()
		live_state["obstacles"] = replay_obstacles
		live_state["obstacles_enabled"] = false
		live_state["reduced_motion"] = true
		replay.sample(live_state)
	var capture_state := battle.render_state()
	capture_state["obstacles"] = replay_obstacles
	capture_state["obstacles_enabled"] = false
	capture_state["reduced_motion"] = true
	var clip := replay.capture_recent(capture_state)
	_check(not clip.is_empty(), "Replay captures recent combat")
	_check(replay.validate_clip(clip), "Replay validates bounded pose data")
	var live_before := battle.positions[0]
	_check(replay.play_clip(clip, true), "Replay begins at 1/8 speed")
	var replay_snapshot := replay.advance(0.5)
	_check(bool(replay_snapshot.get("replay", false)), "Playback state is render-only replay")
	_check(replay_snapshot.get("obstacles", []) == replay_obstacles, "Replay restores obstacle context at top level")
	_check(not bool(replay_snapshot.get("obstacles_enabled", true)), "Replay restores obstacle enable state")
	_check(bool(replay_snapshot.get("reduced_motion", false)), "Replay restores reduced-motion context")
	_check(battle.positions[0].is_equal_approx(live_before), "Replay does not mutate live physics")
	_check(is_equal_approx(replay.set_playback_speed(2.0), 2.0), "Replay accepts 2x")
	replay.stop_playback()
	replay.set_playback_speed(0.5)
	_check(replay.play_clip(clip, false), "Replay can restart at a selected speed")
	_check(is_equal_approx(replay.playback_speed, 0.5), "Replay keeps the player's selected speed")

	var director := CameraDirector.new()
	get_root().add_child(director)
	for view in director.supported_views():
		director.set_view(view)
		var pose := director.update_camera(replay_snapshot, 0, 1.0 / 60.0)
		_check(pose.has("position") and pose.has("target"), "Camera %s returns a pose" % view)
		if view == &"fpv":
			_check(not String(pose.get("hidden_subject_id", "")).is_empty(), "FPV hides only its camera aircraft")
	var giant_show := FleetSimulation.new(10_000)
	var camera_rows := director._drones(giant_show.render_state())
	_check(camera_rows.size() <= CameraDirector.MAX_SHOW_CAMERA_SAMPLES + 1, "Large-show camera uses a bounded representative cast")
	director.set_view(&"best_fight")
	var show_pose := director.update_camera(giant_show.render_state(), 0, 1.0 / 60.0)
	_check(String(show_pose.label).contains("enter Battle mode"), "Best Fight is safely gated to combat")
	replay.queue_free()
	director.queue_free()


func _test_browser_save_round_trip() -> void:
	var source := FleetSimulation.new(24)
	source.set_formation({"shape": "double_orbit", "height": 42.0})
	source.set_boids({"enabled": true, "separation": 1.8})
	source.set_lab_settings({"planet": "mars", "rotor_mode": "constrained", "battery_wh": 72.0})
	var encoded := JSON.stringify(source.snapshot_config())
	var decoded: Variant = JSON.parse_string(encoded)
	var restored := FleetSimulation.new(0)
	var result := restored.load_config(decoded)
	_check(result == OK, "Browser-compatible fleet JSON loads")
	_check(restored.drone_count() == 24, "Save round trip keeps roster")
	_check(String(restored.formation_settings.shape) == "double_orbit", "Save round trip keeps formation")
	_check(String(restored.lab_settings.planet) == "mars", "Save round trip keeps planet")
	_check(String(restored.lab_settings.rotor_mode) == "constrained", "Save round trip keeps rotor rules")
	_check(is_equal_approx(float(restored.lab_settings.battery_wh), 72.0), "Save round trip keeps energy settings")


func _test_main_integration() -> void:
	var packed := load("res://scenes/main.tscn") as PackedScene
	_check(packed != null, "Main scene loads")
	var app := packed.instantiate()
	get_root().add_child(app)
	await process_frame
	_check(app.fleet.drone_count() == 100, "Main wires initial fleet")
	_check(app.renderer != null and app.camera_director != null, "Main wires renderer and cameras")
	_check(app.interface != null and app.environment != null, "Main wires UI and environment")
	_check(app.interface._root.mouse_filter == Control.MOUSE_FILTER_IGNORE, "UI shell leaves empty screen space available to camera input")
	app._on_roster_requested(32)
	app._process(1.0 / 60.0)
	_check(int(app._last_state.count) == 32, "UI roster request reaches simulation")
	app._on_formation_requested(&"helix")
	_check(String(app.fleet.formation_settings.shape) == "helix", "UI formation request reaches simulation")
	app._apply_planet(&"moon", true)
	_check(app.current_planet == "moon", "Planet request reaches rules and environment")
	app._on_battle_prepare_requested(4, 5)
	app._on_battle_engage_requested()
	for _frame in 60:
		app._process(1.0 / 60.0)
	_check(app.combat.enabled and app.combat.engaged, "Battle controls activate separate combat mode")
	_check(int(app._last_state.count) == 9, "Main renders combat roster")
	app._on_battle_exit_requested()
	app._process(1.0 / 60.0)
	_check(not app.combat.enabled and int(app._last_state.count) == 32, "Exiting combat restores show fleet")
	app.camera_director.set_view(&"fpv")
	app._process(1.0 / 60.0)
	_check(app.renderer.hidden_index >= 0, "FPV hides its selected camera aircraft")
	app._on_battle_prepare_requested(2, 2)
	app._on_battle_engage_requested()
	for _frame in 30:
		app._process(1.0 / 60.0)
	var audio_clip: Dictionary = app.replay.capture_recent(app._last_state)
	_check(not audio_clip.is_empty(), "Audio integration has a playable replay clip")
	app.audio.set_enabled(true)
	_check(app.replay.play_clip(audio_clip, true), "Audio integration starts replay through its signal")
	_check(not app.audio.enabled, "Replay silences live audio")
	app.replay.stop_playback()
	_check(app.audio.enabled, "Leaving replay restores prior audio state")
	app.audio.set_enabled(false)
	app.queue_free()


func _check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures.append(message)

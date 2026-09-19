class_name ArenaAudio
extends Node

## Lightweight procedural arena audio for the Godot port.
##
## ELI5: This makes sound waves from numbers instead of loading a song. Audio
## starts OFF on purpose. It never opens the microphone. The browser game used
## separate mixer groups, so this port keeps Drones, Weather, and Effects buses.

signal enabled_changed(enabled: bool)

const MIX_RATE := 22050.0
const TWO_PI := TAU

var enabled := false
var master_volume := 0.75
var drone_volume := 0.65
var weather_volume := 0.45
var effects_volume := 0.8
var _state: Dictionary = {}
var _weather: Dictionary = {}
var _motor_phase := 0.0
var _weather_phase := 0.0
var _noise_seed := 0x1234567

var _motor_player: AudioStreamPlayer
var _weather_player: AudioStreamPlayer
var _motor_playback: AudioStreamGeneratorPlayback
var _weather_playback: AudioStreamGeneratorPlayback


func _ready() -> void:
	_ensure_bus(&"Drones")
	_ensure_bus(&"Weather")
	_ensure_bus(&"Effects")
	_motor_player = _make_generator_player(&"Drones")
	_weather_player = _make_generator_player(&"Weather")
	add_child(_motor_player)
	add_child(_weather_player)
	process_mode = Node.PROCESS_MODE_ALWAYS


func _exit_tree() -> void:
	# Release generator playbacks explicitly so short headless tests and scene
	# reloads do not leave audio-server objects waiting for the next mix tick.
	if is_instance_valid(_motor_player):
		_motor_player.stop()
		_motor_player.stream = null
	if is_instance_valid(_weather_player):
		_weather_player.stop()
		_weather_player.stream = null
	_motor_playback = null
	_weather_playback = null


func set_enabled(value: bool) -> void:
	if enabled == value:
		return
	enabled = value
	if enabled:
		_motor_player.play()
		_weather_player.play()
		_motor_playback = _motor_player.get_stream_playback() as AudioStreamGeneratorPlayback
		_weather_playback = _weather_player.get_stream_playback() as AudioStreamGeneratorPlayback
	else:
		_motor_player.stop()
		_weather_player.stop()
		_motor_playback = null
		_weather_playback = null
	enabled_changed.emit(enabled)


func toggle() -> bool:
	set_enabled(not enabled)
	return enabled


func set_state(state: Dictionary) -> void:
	_state = state


func set_weather(weather: Dictionary) -> void:
	_weather = weather


func set_mix(master: float, drones: float, weather: float, effects: float) -> void:
	master_volume = clampf(master, 0.0, 1.0)
	drone_volume = clampf(drones, 0.0, 1.0)
	weather_volume = clampf(weather, 0.0, 1.0)
	effects_volume = clampf(effects, 0.0, 1.0)
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index(&"Master"), linear_to_db(master_volume))
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index(&"Drones"), linear_to_db(drone_volume))
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index(&"Weather"), linear_to_db(weather_volume))
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index(&"Effects"), linear_to_db(effects_volume))


func meter() -> float:
	if not enabled:
		return 0.0
	var count := int(_state.get("count", 0))
	var rain := float(_weather.get("rain", 0.0))
	var wind := float(_weather.get("wind_speed", 0.0)) / 35.0
	return clampf((minf(float(count), 24.0) / 24.0) * 0.7 + rain * 0.2 + wind * 0.1, 0.0, 1.0)


func _process(_delta: float) -> void:
	if not enabled or not is_instance_valid(_motor_playback) or not is_instance_valid(_weather_playback):
		return
	_fill_motor_buffer()
	_fill_weather_buffer()


func _fill_motor_buffer() -> void:
	var frames := _motor_playback.get_frames_available()
	if frames <= 0:
		return
	var count := int(_state.get("count", 0))
	var velocities: PackedVector3Array = _state.get("velocities", PackedVector3Array())
	var types: PackedByteArray = _state.get("types", PackedByteArray())
	var active := mini(count, mini(velocities.size(), 6))
	for _frame in frames:
		var sample := 0.0
		for index in active:
			var drone_type := int(types[index]) if index < types.size() else 0
			var base_frequency: float = float([185.0, 148.0, 88.0, 126.0][clampi(drone_type, 0, 3)])
			var load := clampf(velocities[index].length() / 24.0, 0.0, 1.0)
			var frequency: float = base_frequency * (0.88 + load * 0.5)
			var phase := _motor_phase + float(index) * 0.71
			sample += sin(phase) * 0.65 + sin(phase * 2.01) * 0.22 + sin(phase * 3.98) * 0.08
			_motor_phase = fmod(_motor_phase + TWO_PI * frequency / MIX_RATE, TWO_PI)
		if active > 0:
			sample *= 0.12 / sqrt(float(active))
		_motor_playback.push_frame(Vector2(sample, sample))


func _fill_weather_buffer() -> void:
	var frames := _weather_playback.get_frames_available()
	if frames <= 0:
		return
	var rain := clampf(float(_weather.get("rain", 0.0)), 0.0, 1.0)
	var wind := clampf(float(_weather.get("wind_speed", 0.0)) / 35.0, 0.0, 1.0)
	var planet := String(_weather.get("planet", "earth"))
	var air_scale := 0.0 if planet == "moon" else (0.25 if planet == "mars" else 1.0)
	for _frame in frames:
		_noise_seed = int((_noise_seed * 1103515245 + 12345) & 0x7fffffff)
		var noise := (float(_noise_seed) / float(0x7fffffff)) * 2.0 - 1.0
		_weather_phase = fmod(_weather_phase + TWO_PI * 0.27 / MIX_RATE, TWO_PI)
		var gust := 0.65 + sin(_weather_phase) * 0.35
		var sample := noise * (rain * 0.045 + wind * gust * 0.055) * air_scale
		_weather_playback.push_frame(Vector2(sample, sample))


func _ensure_bus(bus_name: StringName) -> void:
	if AudioServer.get_bus_index(bus_name) >= 0:
		return
	AudioServer.add_bus()
	AudioServer.set_bus_name(AudioServer.bus_count - 1, bus_name)


func _make_generator_player(bus_name: StringName) -> AudioStreamPlayer:
	var stream := AudioStreamGenerator.new()
	stream.mix_rate = MIX_RATE
	stream.buffer_length = 0.35
	var player := AudioStreamPlayer.new()
	player.stream = stream
	player.bus = bus_name
	return player

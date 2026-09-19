class_name EnvironmentController
extends Node3D

## Builds Fleet Commander's first Godot arena without external art assets.
##
## ELI5: Think of this as the stage crew. It lays down a flat floor, puts the
## three visible practice obstacles in the same places as the browser game, and
## changes the sky/lighting when Earth, Moon, or Mars is selected. It does not
## decide how drones fly.


signal environment_changed(planet_id: String, scenery: String, sky_key: String)
signal atmosphere_changed(settings: Dictionary)

const FIELD_LIMIT := 1024.0
const ALTITUDE_LIMIT := 320.0

# ELI5: x/z are the box center, w/d are HALF sizes, and h is full height.
# Simulation collision and rendered boxes should both read this exact data.
const SHARED_OBSTACLES: Array[Dictionary] = [
	{"x": -76.0, "z": -32.0, "w": 12.0, "d": 16.0, "h": 17.0},
	{"x": 78.0, "z": -58.0, "w": 10.0, "d": 14.0, "h": 30.0},
	{"x": 62.0, "z": 66.0, "w": 13.0, "d": 10.0, "h": 13.0},
]

const SCENERIES: Dictionary = {
	"stadium": "Stadium bowl",
	"coast": "Coastal launch site",
	"alpine": "Alpine valley",
	"city": "City waterfront",
	"moon": "Lunar test range",
	"mars": "Martian test range",
}

const SKIES: Dictionary = {
	"day": "Clear daylight",
	"golden": "Golden hour",
	"sunset": "Coral sunset",
	"dusk": "Blue hour",
	"night": "Starry night",
	"blackout": "Pitch black · moon & stars",
	"lunar": "Lunar vacuum",
	"martian": "Martian daylight",
}

# These are the browser game's exact weather defaults. Keeping every layer in
# one dictionary lets visuals, flight physics, screen effects, and audio share
# the same knobs even though this class only draws the visual layers.
const WEATHER_DEFAULTS: Dictionary = {
	"rain": 0.0,
	"wind_speed": 0.0,
	"wind_direction": 225.0,
	"gust": 0.0,
	"clouds": 0.4,
	"fog": 0.08,
	"lightning": 0.0,
	"flash_brightness": 1.0,
	"screen_fx": 0.65,
	"visual_fx": 1.0,
	"physics_fx": 0.65,
	"audio_fx": 0.85,
	"fluid_enabled": false,
	"viscosity": 0.018,
}

# Values match the browser palette. Godot's native sky is a first-port visual
# approximation; the colors and relative light/exposure remain authoritative.
const SKY_PALETTES: Dictionary = {
	"lunar": {
		"top": Color("000000"), "horizon": Color("000000"), "fog": Color("000000"),
		"sun": Color("fff9ed"), "elevation": 0.32, "ambient": 0.06, "direct": 3.5,
		"exposure": 1.0, "night": 0.0, "vacuum": true,
	},
	"martian": {
		"top": Color("493a34"), "horizon": Color("d4a984"), "fog": Color("b48668"),
		"sun": Color("fff0d4"), "elevation": 0.35, "ambient": 0.7, "direct": 1.5,
		"exposure": 1.1, "night": 0.0, "mars": true,
	},
	"day": {
		"top": Color("2476b4"), "horizon": Color("c6dfed"), "fog": Color("aec7cd"),
		"sun": Color("fff0d4"), "elevation": 0.68, "ambient": 1.1, "direct": 3.2,
		"exposure": 1.0, "night": 0.0,
	},
	"golden": {
		"top": Color("4275ab"), "horizon": Color("f9c790"), "fog": Color("bca68d"),
		"sun": Color("ffd49e"), "elevation": 0.18, "ambient": 0.95, "direct": 3.0,
		"exposure": 1.0, "night": 0.1,
	},
	"sunset": {
		"top": Color("283962"), "horizon": Color("f2a080"), "fog": Color("8e858f"),
		"sun": Color("ffaf79"), "elevation": 0.055, "ambient": 0.9, "direct": 1.6,
		"exposure": 1.1, "night": 0.5,
	},
	"dusk": {
		"top": Color("102542"), "horizon": Color("839cbd"), "fog": Color("596e85"),
		"sun": Color("c6d4ff"), "elevation": 0.025, "ambient": 0.8, "direct": 0.65,
		"exposure": 1.25, "night": 0.9,
	},
	"night": {
		"top": Color("020916"), "horizon": Color("263d5b"), "fog": Color("162b40"),
		"sun": Color("bfd4ff"), "elevation": 0.4, "ambient": 0.45, "direct": 0.5,
		"exposure": 1.45, "night": 1.0,
	},
	"blackout": {
		"top": Color("000001"), "horizon": Color("010205"), "fog": Color("000001"),
		"sun": Color("d4e0fa"), "elevation": 0.4, "ambient": 0.0, "direct": 0.0,
		"exposure": 1.0, "night": 1.0, "blackout": true,
	},
}

const GROUND_COLORS: Dictionary = {
	"stadium": Color("50654b"),
	"coast": Color("a99a76"),
	"alpine": Color("536447"),
	"city": Color("535b57"),
	"moon": Color("737479"),
	"mars": Color("a27350"),
}

const OBSTACLE_COLORS: Array[Color] = [
	Color("59646a"),
	Color("47545e"),
	Color("6e6961"),
]

var planet_id := PlanetModel.EARTH_ID
var earth_scenery := "stadium"
var earth_sky := "golden"
var active_scenery := "stadium"
var active_sky := "golden"

var wetness := 0.0
var cloud_cover := 0.4
var haze := 1.0
var exposure_ev := 0.0
var stage_level := 1.0
var weather_settings: Dictionary = {}

var _manual_wetness := 0.0
var _manual_cloud_cover := 0.4
var _manual_haze := 1.0

var world_environment: WorldEnvironment
var sun_light: DirectionalLight3D
var lightning_light: OmniLight3D
var ground_mesh: MeshInstance3D
var sun_disc: MeshInstance3D
var moon_disc: MeshInstance3D
var stars: MultiMeshInstance3D

var _arena_root: Node3D
var _obstacle_root: Node3D
var _scenery_root: Node3D
var _environment: Environment
var _sky_material: ProceduralSkyMaterial
var _surface_records: Array[Dictionary] = []
var _obstacles_enabled := true


func _ready() -> void:
	build_world()


static func shared_obstacle_data() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for obstacle: Dictionary in SHARED_OBSTACLES:
		result.append(obstacle.duplicate(true))
	return result


func get_obstacles() -> Array[Dictionary]:
	## Instance API used by both the renderer and simulation wiring.
	return shared_obstacle_data()


func build_world() -> void:
	## Public port API. This first port's world is the flat shared arena.
	build_arena()


func build_arena() -> void:
	## Safe to call again while developing; the old generated stage is replaced.
	if is_instance_valid(_arena_root):
		if _arena_root.get_parent() == self:
			remove_child(_arena_root)
		_arena_root.queue_free()
	_surface_records.clear()

	_arena_root = Node3D.new()
	_arena_root.name = "GeneratedArena"
	add_child(_arena_root)
	_build_environment_nodes()
	_build_flat_field()
	_build_obstacles()
	_build_celestial_impression()
	apply_planet(planet_id)


func apply_planet(value: Variant) -> void:
	planet_id = PlanetModel.normalize_planet_id(value)
	var planet := PlanetModel.get_planet(planet_id)
	if planet_id == PlanetModel.EARTH_ID:
		active_scenery = earth_scenery
		active_sky = earth_sky
	else:
		# Moon/Mars own their scene. Director choices remain remembered for Earth.
		active_scenery = str(planet["scenery"])
		active_sky = str(planet["sky"])
	_rebuild_scenery()
	_apply_effective_weather()
	emit_signal("environment_changed", planet_id, active_scenery, active_sky)


func set_planet(value: Variant) -> void:
	## Public port API matching the rest of the Godot integration.
	apply_planet(value)


func set_director_environment(scenery_key: String, sky_key: String) -> void:
	if SCENERIES.has(scenery_key):
		earth_scenery = scenery_key
	if SKIES.has(sky_key) and sky_key != "lunar" and sky_key != "martian":
		earth_sky = sky_key
	if planet_id == PlanetModel.EARTH_ID:
		active_scenery = earth_scenery
		active_sky = earth_sky
		_apply_sky()
		_rebuild_scenery()
		emit_signal("environment_changed", planet_id, active_scenery, active_sky)


func set_scenery(scenery_key: String) -> void:
	set_director_environment(scenery_key, earth_sky)


func set_sky(sky_key: String) -> void:
	set_director_environment(earth_scenery, sky_key)


func set_lighting(new_exposure_ev: float, new_stage_level: float) -> void:
	exposure_ev = clampf(new_exposure_ev, -2.0, 2.0)
	stage_level = clampf(new_stage_level, 0.0, 1.0)
	_apply_sky()


func set_atmosphere(new_wetness: float, new_cloud_cover: float, new_haze: float) -> void:
	_manual_wetness = clampf(new_wetness, 0.0, 1.0)
	_manual_cloud_cover = clampf(new_cloud_cover, 0.0, 1.0)
	_manual_haze = clampf(new_haze, 0.5, 2.0)
	_apply_effective_weather()


func apply_weather(settings: Dictionary = {}) -> Dictionary:
	## Weather owns gameplay forces elsewhere. This hook only applies its visual
	## fog/cloud/wet-surface request and returns the planet-filtered values.
	var previous := WEATHER_DEFAULTS.duplicate(true)
	for key in weather_settings:
		previous[key] = weather_settings[key]
	weather_settings = {
		"rain": _number(_weather_input(settings, "rain", "rain", previous["rain"]), 0.0, 1.0, 0.0),
		"wind_speed": _number(_weather_input(settings, "wind_speed", "windSpeed", previous["wind_speed"]), 0.0, 35.0, 0.0),
		"wind_direction": _number(_weather_input(settings, "wind_direction", "windDirection", previous["wind_direction"]), 0.0, 360.0, 225.0),
		"gust": _number(_weather_input(settings, "gust", "gust", previous["gust"]), 0.0, 25.0, 0.0),
		"clouds": _number(_weather_input(settings, "clouds", "clouds", previous["clouds"]), 0.0, 1.0, 0.4),
		"fog": _number(_weather_input(settings, "fog", "fog", previous["fog"]), 0.0, 1.0, 0.08),
		"lightning": _number(_weather_input(settings, "lightning", "lightning", previous["lightning"]), 0.0, 1.0, 0.0),
		"flash_brightness": _number(_weather_input(settings, "flash_brightness", "flashBrightness", previous["flash_brightness"]), 0.0, 2.0, 1.0),
		"screen_fx": _number(_weather_input(settings, "screen_fx", "screenFx", previous["screen_fx"]), 0.0, 1.0, 0.65),
		"visual_fx": _number(_weather_input(settings, "visual_fx", "visualFx", previous["visual_fx"]), 0.0, 1.0, 1.0),
		"physics_fx": _number(_weather_input(settings, "physics_fx", "physicsFx", previous["physics_fx"]), 0.0, 1.0, 0.65),
		"audio_fx": _number(_weather_input(settings, "audio_fx", "audioFx", previous["audio_fx"]), 0.0, 1.0, 0.85),
		"fluid_enabled": _weather_bool(settings, "fluid_enabled", "fluidEnabled", bool(previous["fluid_enabled"])),
		"viscosity": _number(_weather_input(settings, "viscosity", "viscosity", previous["viscosity"]), 0.001, 0.12, 0.018),
	}
	_apply_effective_weather()
	return get_effective_weather()


func set_weather(settings: Dictionary = {}) -> Dictionary:
	## Public port API. Returns the planet-filtered settings actually shown.
	return apply_weather(settings)


func get_effective_weather() -> Dictionary:
	var effective := weather_settings.duplicate(true)
	if effective.is_empty():
		effective = WEATHER_DEFAULTS.duplicate(true)
	if not PlanetModel.terrestrial_weather_allowed(planet_id):
		effective["rain"] = 0.0
		effective["lightning"] = 0.0
	# Include the world identity so this same returned dictionary can feed the
	# audio and flight controllers without either one guessing the active planet.
	effective["planet"] = planet_id
	effective["wind_scale"] = PlanetModel.game_wind_scale(planet_id)
	effective["sound_air_scale"] = PlanetModel.atmospheric_sound_scale(planet_id)
	effective["wind_speed"] = float(effective["wind_speed"]) * float(effective["wind_scale"])
	effective["gust"] = float(effective["gust"]) * float(effective["wind_scale"])
	return effective


func set_lightning_flash(amount: float) -> void:
	# The weather controller can call this for a short flash. Moon/Mars reject it.
	if not is_instance_valid(lightning_light):
		return
	if not PlanetModel.terrestrial_weather_allowed(planet_id):
		amount = 0.0
	lightning_light.light_energy = clampf(amount, 0.0, 2.0) * 24.0
	lightning_light.visible = lightning_light.light_energy > 0.001


func set_obstacles_enabled(enabled: bool) -> void:
	_obstacles_enabled = enabled
	if not is_instance_valid(_obstacle_root):
		return
	_obstacle_root.visible = enabled
	for child: Node in _obstacle_root.get_children():
		var body := child as StaticBody3D
		if body:
			body.collision_layer = 1 if enabled else 0


func get_environment_state() -> Dictionary:
	return {
		"planet": planet_id,
		"scenery": active_scenery,
		"sky": active_sky,
		"wetness": wetness,
		"clouds": cloud_cover,
		"haze": haze,
		"exposure_ev": exposure_ev,
		"stage_level": stage_level,
		"weather": get_effective_weather(),
	}


func _build_environment_nodes() -> void:
	_environment = Environment.new()
	_environment.background_mode = Environment.BG_SKY
	# COLOR makes the palette's ambient amount predictable. The sky still supplies
	# reflections, so shiny wet ground continues to echo the current time of day.
	_environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	_environment.ambient_light_sky_contribution = 0.0
	_environment.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	_environment.tonemap_mode = Environment.TONE_MAPPER_ACES
	_environment.glow_enabled = true
	_environment.glow_intensity = 0.8

	_sky_material = ProceduralSkyMaterial.new()
	var sky := Sky.new()
	sky.sky_material = _sky_material
	_environment.sky = sky

	world_environment = WorldEnvironment.new()
	world_environment.name = "WorldEnvironment"
	world_environment.environment = _environment
	_arena_root.add_child(world_environment)

	sun_light = DirectionalLight3D.new()
	sun_light.name = "SunMoonKeyLight"
	sun_light.shadow_enabled = true
	sun_light.directional_shadow_max_distance = 1800.0
	# We draw a simple sun sphere ourselves, so the procedural sky should use this
	# light for illumination only instead of drawing a second sun disc.
	sun_light.sky_mode = DirectionalLight3D.SKY_MODE_LIGHT_ONLY
	_arena_root.add_child(sun_light)

	lightning_light = OmniLight3D.new()
	lightning_light.name = "WeatherFlash"
	lightning_light.light_color = Color("c6dcff")
	lightning_light.omni_range = 650.0
	lightning_light.position = Vector3(0.0, 90.0, -100.0)
	lightning_light.visible = false
	_arena_root.add_child(lightning_light)


func _build_flat_field() -> void:
	var ground_material := _make_surface_material(Color("50654b"), 0.88, 0.0)
	var plane := PlaneMesh.new()
	# The visible ground continues into the scenery like the browser's 10 km
	# plane; collision stays at the real ±1,024 m simulation boundary below.
	plane.size = Vector2(10000.0, 10000.0)
	plane.material = ground_material
	ground_mesh = MeshInstance3D.new()
	ground_mesh.name = "FlatFlightField"
	ground_mesh.mesh = plane
	ground_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_arena_root.add_child(ground_mesh)

	var floor_body := StaticBody3D.new()
	floor_body.name = "FlightFieldCollision"
	floor_body.collision_layer = 1
	var floor_shape := CollisionShape3D.new()
	var box_shape := BoxShape3D.new()
	box_shape.size = Vector3(FIELD_LIMIT * 2.0, 0.2, FIELD_LIMIT * 2.0)
	floor_shape.shape = box_shape
	floor_shape.position.y = -0.1
	floor_body.add_child(floor_shape)
	_arena_root.add_child(floor_body)

	# A close-range apron gives the ground camera a useful sense of scale.
	var apron_material := _make_surface_material(Color("777a76"), 0.78, 0.0)
	var apron_plane := PlaneMesh.new()
	apron_plane.size = Vector2(62.0, 68.0)
	apron_plane.material = apron_material
	var apron := MeshInstance3D.new()
	apron.name = "LaunchApron"
	apron.mesh = apron_plane
	apron.position = Vector3(0.0, 0.012, 88.0)
	_arena_root.add_child(apron)


func _build_obstacles() -> void:
	_obstacle_root = Node3D.new()
	_obstacle_root.name = "SharedPracticeObstacles"
	_arena_root.add_child(_obstacle_root)
	for index in range(SHARED_OBSTACLES.size()):
		var data: Dictionary = SHARED_OBSTACLES[index]
		var size := Vector3(float(data["w"]) * 2.0, float(data["h"]), float(data["d"]) * 2.0)
		var position := Vector3(float(data["x"]), size.y * 0.5, float(data["z"]))

		var body := StaticBody3D.new()
		body.name = "Obstacle%02d" % (index + 1)
		body.collision_layer = 1
		body.position = position
		body.set_meta("fleet_obstacle", data.duplicate(true))
		var shape_node := CollisionShape3D.new()
		var shape := BoxShape3D.new()
		shape.size = size
		shape_node.shape = shape
		body.add_child(shape_node)

		var mesh_node := MeshInstance3D.new()
		var mesh := BoxMesh.new()
		mesh.size = size
		mesh.material = _make_surface_material(OBSTACLE_COLORS[index], 0.62, 0.25)
		mesh_node.mesh = mesh
		mesh_node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		body.add_child(mesh_node)
		_obstacle_root.add_child(body)
	set_obstacles_enabled(_obstacles_enabled)


func _build_celestial_impression() -> void:
	sun_disc = _make_disc("SunDisc", Color("fff2cb"), 34.0)
	moon_disc = _make_disc("MoonDisc", Color("d4e0fa"), 27.0)
	_arena_root.add_child(sun_disc)
	_arena_root.add_child(moon_disc)

	var star_mesh := SphereMesh.new()
	star_mesh.radius = 0.8
	star_mesh.height = 1.6
	star_mesh.radial_segments = 4
	star_mesh.rings = 2
	var star_material := StandardMaterial3D.new()
	star_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	star_material.albedo_color = Color("cadfff")
	star_material.emission_enabled = true
	star_material.emission = Color("cadfff")
	star_material.emission_energy_multiplier = 1.8
	star_mesh.material = star_material
	var star_multimesh := MultiMesh.new()
	star_multimesh.transform_format = MultiMesh.TRANSFORM_3D
	star_multimesh.mesh = star_mesh
	star_multimesh.instance_count = 192
	var random := RandomNumberGenerator.new()
	random.seed = 70421
	for index in range(star_multimesh.instance_count):
		var azimuth := random.randf_range(0.0, TAU)
		var elevation := random.randf_range(0.12, 1.25)
		var radius := random.randf_range(1450.0, 1850.0)
		var point := Vector3(
			cos(azimuth) * cos(elevation), sin(elevation), sin(azimuth) * cos(elevation)
		) * radius
		var scale := random.randf_range(0.45, 1.45)
		star_multimesh.set_instance_transform(index, Transform3D(Basis.IDENTITY.scaled(Vector3.ONE * scale), point))
	stars = MultiMeshInstance3D.new()
	stars.name = "Stars"
	stars.multimesh = star_multimesh
	stars.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_arena_root.add_child(stars)


func _make_disc(node_name: String, color: Color, radius: float) -> MeshInstance3D:
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2.0
	mesh.radial_segments = 24
	mesh.rings = 12
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = color
	material.emission_enabled = true
	material.emission = color
	material.emission_energy_multiplier = 2.5
	mesh.material = material
	var instance := MeshInstance3D.new()
	instance.name = node_name
	instance.mesh = mesh
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return instance


func _rebuild_scenery() -> void:
	if not is_instance_valid(_arena_root):
		return
	if is_instance_valid(_scenery_root):
		if _scenery_root.get_parent() == _arena_root:
			_arena_root.remove_child(_scenery_root)
		_scenery_root.queue_free()
	_scenery_root = Node3D.new()
	_scenery_root.name = "DecorativeScenery_%s" % active_scenery
	_arena_root.add_child(_scenery_root)

	if is_instance_valid(ground_mesh):
		var plane := ground_mesh.mesh as PlaneMesh
		var material: StandardMaterial3D = null
		if plane:
			material = plane.material as StandardMaterial3D
		if material:
			material.albedo_color = GROUND_COLORS.get(active_scenery, GROUND_COLORS["stadium"])

	# Decorative geometry begins outside the flat/colliding simulator square.
	# It intentionally has no StaticBody3D, so it cannot create invisible walls.
	match active_scenery:
		"stadium":
			_build_stadium_impression()
		"city":
			_build_city_impression()
		"coast":
			_build_coast_impression()
		"alpine":
			_build_mountain_impression(Color("69736d"))
		"moon":
			_build_planet_rocks(Color("85868b"))
		"mars":
			_build_planet_rocks(Color("a87150"))
	_apply_wetness()


func _build_stadium_impression() -> void:
	var material := _make_decor_material(Color("39464d"), 0.72, 0.15)
	for index in range(48):
		var angle := TAU * float(index) / 48.0
		var mesh := BoxMesh.new()
		mesh.size = Vector3(46.0, 42.0, 24.0)
		mesh.material = material
		var block := MeshInstance3D.new()
		block.mesh = mesh
		block.position = Vector3(sin(angle) * 1190.0, 21.0, cos(angle) * 1190.0)
		block.rotation.y = angle
		_scenery_root.add_child(block)


func _build_city_impression() -> void:
	var material := _make_decor_material(Color("536772"), 0.56, 0.38)
	for index in range(34):
		var height := 55.0 + float((index * 47) % 230)
		var mesh := BoxMesh.new()
		mesh.size = Vector3(44.0 + float(index % 4) * 8.0, height, 48.0)
		mesh.material = material
		var building := MeshInstance3D.new()
		building.mesh = mesh
		var row := floori(float(index) / 17.0)
		building.position = Vector3(-900.0 + float(index % 17) * 110.0, height * 0.5, -1280.0 - float(row) * 180.0)
		_scenery_root.add_child(building)


func _build_coast_impression() -> void:
	var water_material := _make_decor_material(Color("214e61"), 0.22, 0.45)
	var water_mesh := PlaneMesh.new()
	water_mesh.size = Vector2(5200.0, 2600.0)
	water_mesh.material = water_material
	var water := MeshInstance3D.new()
	water.name = "DecorativeWater"
	water.mesh = water_mesh
	water.position = Vector3(0.0, 0.03, -2350.0)
	_scenery_root.add_child(water)
	_build_mountain_impression(Color("77736a"))


func _build_mountain_impression(color: Color) -> void:
	var material := _make_decor_material(color, 0.95, 0.0)
	for index in range(28):
		var mesh := CylinderMesh.new()
		mesh.top_radius = 0.0
		mesh.bottom_radius = 95.0 + float((index * 19) % 80)
		mesh.height = 130.0 + float((index * 31) % 220)
		mesh.radial_segments = 7
		mesh.material = material
		var mountain := MeshInstance3D.new()
		mountain.mesh = mesh
		var angle := TAU * float(index) / 28.0
		var radius := 1320.0 + float((index * 53) % 430)
		mountain.position = Vector3(sin(angle) * radius, mesh.height * 0.5 - 8.0, cos(angle) * radius)
		mountain.rotation.y = angle * 0.7
		_scenery_root.add_child(mountain)


func _build_planet_rocks(color: Color) -> void:
	var material := _make_decor_material(color, 0.96, 0.0)
	for index in range(52):
		var mesh := SphereMesh.new()
		mesh.radius = 8.0 + float((index * 7) % 24)
		# SphereMesh expects a diameter-sized height. The node scale below does
		# the actual rock squashing without creating an invalid primitive.
		mesh.height = mesh.radius * 2.0
		mesh.radial_segments = 7
		mesh.rings = 4
		mesh.material = material
		var rock := MeshInstance3D.new()
		rock.mesh = mesh
		var angle := float(index) * 2.399963
		var radius := 1120.0 + float((index * 71) % 620)
		rock.position = Vector3(sin(angle) * radius, mesh.height * 0.25, cos(angle) * radius)
		rock.scale = Vector3(1.0, 0.55 + float(index % 5) * 0.11, 0.75 + float(index % 3) * 0.2)
		_scenery_root.add_child(rock)


func _apply_sky() -> void:
	if not is_instance_valid(world_environment) or not SKY_PALETTES.has(active_sky):
		return
	var palette: Dictionary = SKY_PALETTES[active_sky]
	var vacuum := bool(palette.get("vacuum", false))
	var mars := bool(palette.get("mars", false))
	var blackout := bool(palette.get("blackout", false))
	var visual_clouds := 0.0 if vacuum or mars else cloud_cover
	var cloud_gray := Color("8c9298")
	var palette_top: Color = palette["top"]
	var palette_horizon: Color = palette["horizon"]
	var top: Color = palette_top.lerp(cloud_gray * 0.42, visual_clouds * 0.42)
	var horizon: Color = palette_horizon.lerp(cloud_gray, visual_clouds * 0.52)
	_sky_material.sky_top_color = top
	_sky_material.sky_horizon_color = horizon
	var ground_color: Color = GROUND_COLORS.get(active_scenery, Color("50654b"))
	_sky_material.ground_bottom_color = ground_color * 0.28
	_sky_material.ground_horizon_color = horizon.darkened(0.18)
	_sky_material.sun_angle_max = 6.0
	_sky_material.sun_curve = 0.08
	_sky_material.energy_multiplier = 0.03 if blackout else 1.0
	_sky_material.sky_energy_multiplier = 0.03 if blackout else 1.0

	_environment.background_energy_multiplier = 0.0 if blackout else 0.8
	_environment.ambient_light_color = horizon
	_environment.ambient_light_energy = float(palette["ambient"]) * stage_level
	_environment.tonemap_exposure = float(palette["exposure"]) * pow(2.0, exposure_ev)
	_environment.fog_light_color = palette["fog"]
	_environment.fog_enabled = not vacuum and not blackout
	var weather := get_effective_weather()
	var fog_amount := float(weather.get("fog", 0.08)) * float(weather.get("visual_fx", 1.0))
	_environment.fog_density = clampf((0.00018 + fog_amount * 0.0018) * haze, 0.0, 0.01)
	_environment.fog_aerial_perspective = clampf(0.25 + fog_amount * 0.65, 0.0, 1.0)

	var elevation := float(palette["elevation"])
	sun_light.light_color = palette["sun"]
	sun_light.light_energy = float(palette["direct"]) * stage_level
	sun_light.rotation_degrees = Vector3(-rad_to_deg(elevation), -143.0, 0.0)
	sun_light.visible = not blackout

	var direction := Vector3(-0.6, elevation, -0.8).normalized()
	sun_disc.position = direction * 1350.0
	moon_disc.position = Vector3(0.55, 0.48, -0.78).normalized() * 1320.0
	var night := float(palette["night"])
	stars.visible = night > 0.7 or active_sky == "lunar"
	sun_disc.visible = not blackout and active_sky != "night" and active_sky != "lunar"
	moon_disc.visible = active_sky == "night" or active_sky == "blackout" or active_sky == "lunar"


func _apply_effective_weather() -> void:
	var weather := get_effective_weather()
	var visual_fx := float(weather.get("visual_fx", 1.0))
	cloud_cover = _manual_cloud_cover
	haze = _manual_haze
	wetness = _manual_wetness
	if planet_id == PlanetModel.EARTH_ID:
		cloud_cover = maxf(_manual_cloud_cover, float(weather.get("clouds", 0.0)) * visual_fx)
		haze = minf(2.0, _manual_haze * (1.0 + float(weather.get("fog", 0.0)) * visual_fx * 0.9))
		# Rain adds a wet look on Earth only. Manual wetness remains a floor, and
		# selecting clear weather can dry a field whose manual wetness is zero.
		var rain_wetness := float(weather.get("rain", 0.0)) * visual_fx
		wetness = maxf(_manual_wetness, rain_wetness * 0.95)
	_apply_wetness()
	_apply_sky()
	emit_signal("atmosphere_changed", get_environment_state())


func _apply_wetness() -> void:
	for record: Dictionary in _surface_records:
		var material := record["material"] as StandardMaterial3D
		if not material:
			continue
		var dry_roughness := float(record["dry_roughness"])
		material.roughness = lerpf(dry_roughness, maxf(0.08, dry_roughness * 0.28), wetness)
		material.metallic = lerpf(float(record["dry_metallic"]), minf(1.0, float(record["dry_metallic"]) + 0.12), wetness)


func _make_surface_material(color: Color, roughness: float, metallic: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = metallic
	_surface_records.append({
		"material": material,
		"dry_roughness": roughness,
		"dry_metallic": metallic,
	})
	return material


func _make_decor_material(color: Color, roughness: float, metallic: float) -> StandardMaterial3D:
	# Decorative materials are not added to the wetness registry; rain primarily
	# changes the playable field and close obstacles in this first port.
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = metallic
	return material


func _number(value: Variant, minimum: float, maximum: float, fallback: float) -> float:
	var kind := typeof(value)
	if kind != TYPE_INT and kind != TYPE_FLOAT:
		return fallback
	var number := float(value)
	if not is_finite(number):
		return fallback
	return clampf(number, minimum, maximum)


func _weather_input(
	raw: Dictionary,
	snake_key: String,
	camel_key: String,
	fallback: Variant
) -> Variant:
	if raw.has(snake_key):
		return raw[snake_key]
	if raw.has(camel_key):
		return raw[camel_key]
	return fallback


func _weather_bool(
	raw: Dictionary,
	snake_key: String,
	camel_key: String,
	fallback: bool
) -> bool:
	var value: Variant = _weather_input(raw, snake_key, camel_key, fallback)
	return bool(value) if typeof(value) == TYPE_BOOL else fallback

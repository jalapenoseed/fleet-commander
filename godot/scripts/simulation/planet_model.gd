class_name PlanetModel
extends RefCounted

## Fleet Commander's small, deterministic world-and-energy rulebook.
##
## ELI5: This class does not draw anything. It is the calculator that answers
## questions such as "how strong is gravity on Mars?" and "how many minutes of
## energy does this example battery contain?" Keeping those numbers out of the
## renderer means changing the sky cannot secretly change the flight rules.


const EARTH_ID := "earth"
const MOON_ID := "moon"
const MARS_ID := "mars"

const ROTOR_ARCADE := "arcade"
const ROTOR_CONSTRAINED := "constrained"

# These values intentionally match the browser game's 0.9 teaching model.
# Density is a representative value, not a complete atmosphere simulation.
const PLANETS: Dictionary = {
	EARTH_ID: {
		"name": "Earth",
		"gravity": 9.81,
		"density": 1.225,
		"sky": "golden",
		"scenery": "stadium",
		"wind_scale": 1.0,
		"sound_air_scale": 1.0,
		"note": "Sea-level reference atmosphere. Weather and altitude variation are not modeled.",
	},
	MOON_ID: {
		"name": "Moon",
		"gravity": 1.62,
		"density": 0.0,
		"sky": "lunar",
		"scenery": "moon",
		"wind_scale": 0.0,
		"sound_air_scale": 0.0,
		"note": "Vacuum: ordinary propellers cannot generate lift. Constrained rotors fall; arcade lift is fictional.",
	},
	MARS_ID: {
		"name": "Mars",
		"gravity": 3.73,
		"density": 0.016,
		"sky": "martian",
		"scenery": "mars",
		"wind_scale": 0.45,
		"sound_air_scale": 0.25,
		"note": "Thin atmosphere: these Earth-style game quads cannot sustain flight. Arcade lift is fictional; this is not a Mars helicopter model.",
	},
}

const FRAME_MATERIALS: Dictionary = {
	"composite": {"name": "Composite laminate", "mass": 0.18},
	"aluminum": {"name": "Aluminum alloy", "mass": 0.32},
	"polymer": {"name": "Molded polymer", "mass": 0.24},
}

# ELI5: These values appear before a saved Lab configuration replaces them.
const LAB_DEFAULTS: Dictionary = {
	"planet": EARTH_ID,
	"rotor_mode": ROTOR_ARCADE,
	"energy_model": false,
	"material": "composite",
	"battery_mass": 0.24,
	"battery_wh": 45.0,
	"flight_watts": 140.0,
	"electronics_watts": 8.0,
	"cargo_mass": 0.0,
}

const LAB_RANGES: Dictionary = {
	"battery_mass": Vector2(0.05, 5.0),
	"battery_wh": Vector2(1.0, 2000.0),
	"flight_watts": Vector2(1.0, 5000.0),
	"electronics_watts": Vector2(0.0, 200.0),
	"cargo_mass": Vector2(0.0, 10.0),
}


static func planet_ids() -> PackedStringArray:
	return PackedStringArray([EARTH_ID, MOON_ID, MARS_ID])


static func normalize_planet_id(value: Variant) -> String:
	var key := str(value).to_lower()
	return key if PLANETS.has(key) else EARTH_ID


static func get_planet(value: Variant = EARTH_ID) -> Dictionary:
	# A deep copy stops callers from accidentally changing the canonical constants.
	return PLANETS[normalize_planet_id(value)].duplicate(true)


static func get_profile(value: Variant = EARTH_ID) -> Dictionary:
	## Public port API. `get_planet` remains as a readable internal alias.
	return get_planet(value)


static func gravity_vector(value: Variant = EARTH_ID) -> Vector3:
	return Vector3.DOWN * float(PLANETS[normalize_planet_id(value)]["gravity"])


static func terrestrial_weather_allowed(value: Variant) -> bool:
	return normalize_planet_id(value) == EARTH_ID


static func game_wind_scale(value: Variant) -> float:
	return float(PLANETS[normalize_planet_id(value)]["wind_scale"])


static func atmospheric_sound_scale(value: Variant) -> float:
	return float(PLANETS[normalize_planet_id(value)]["sound_air_scale"])


static func can_sustain_rotor_flight(planet_id: Variant, rotor_mode: Variant) -> bool:
	# Arcade mode is an explicit fiction used to keep Moon and Mars playable.
	if str(rotor_mode) == ROTOR_ARCADE:
		return true
	return normalize_planet_id(planet_id) == EARTH_ID


static func can_launch_arena(planet_id: Variant, rotor_mode: Variant) -> bool:
	return can_sustain_rotor_flight(planet_id, rotor_mode)


static func needs_constrained_fall(planet_id: Variant, rotor_mode: Variant) -> bool:
	return str(rotor_mode) == ROTOR_CONSTRAINED and normalize_planet_id(planet_id) != EARTH_ID


static func rotor_rule_note(planet_id: Variant, rotor_mode: Variant) -> String:
	var planet := get_planet(planet_id)
	if str(rotor_mode) == ROTOR_ARCADE:
		return "%s uses fictional arcade lift." % planet["name"]
	if can_sustain_rotor_flight(planet_id, rotor_mode):
		return "Constrained Earth-style rotors are enabled."
	return "%s: insufficient rotor lift; aircraft fall under local gravity." % planet["name"]


static func constrained_body_step(
	planet_id: Variant,
	position: Vector3,
	velocity: Vector3,
	ground_y: float,
	delta: float
) -> Dictionary:
	## Advances one unsupported rotorcraft on Moon/Mars.
	## The calling simulation still owns mode, battery, and collision decisions.
	var planet := get_planet(planet_id)
	var safe_delta := clampf(delta, 0.0, 0.25)
	var next_velocity := velocity
	var next_position := position
	next_velocity.y -= float(planet["gravity"]) * safe_delta
	var drag := exp(-float(planet["density"]) * 0.18 * safe_delta)
	next_velocity *= drag
	next_position += next_velocity * safe_delta
	var landed := false
	if next_position.y <= ground_y:
		next_position.y = ground_y
		next_velocity = Vector3.ZERO
		landed = true
	return {
		"position": next_position,
		"velocity": next_velocity,
		"landed": landed,
		"override": "%s: insufficient rotor lift" % planet["name"],
	}


static func normalize_lab_settings(raw: Dictionary = {}) -> Dictionary:
	var result := LAB_DEFAULTS.duplicate(true)
	result["planet"] = normalize_planet_id(raw.get("planet", result["planet"]))

	var material := str(raw.get("material", result["material"]))
	if FRAME_MATERIALS.has(material):
		result["material"] = material

	var rotor_mode := str(raw.get("rotor_mode", raw.get("rotorMode", result["rotor_mode"])))
	if rotor_mode == ROTOR_ARCADE or rotor_mode == ROTOR_CONSTRAINED:
		result["rotor_mode"] = rotor_mode

	var energy_value: Variant = raw.get("energy_model", raw.get("energyModel", false))
	result["energy_model"] = typeof(energy_value) == TYPE_BOOL and bool(energy_value)

	# Accept snake_case Godot keys and the browser JSON's camelCase keys.
	var aliases: Dictionary = {
		"battery_mass": "batteryMass",
		"battery_wh": "batteryWh",
		"flight_watts": "flightWatts",
		"electronics_watts": "electronicsWatts",
		"cargo_mass": "cargoMass",
	}
	for key: String in LAB_RANGES.keys():
		var value: Variant = raw.get(key, raw.get(aliases[key], result[key]))
		if _is_finite_number(value):
			var limits: Vector2 = LAB_RANGES[key]
			result[key] = clampf(float(value), limits.x, limits.y)
	return result


static func lab_settings(raw: Dictionary = {}) -> Dictionary:
	## Public port API matching the browser module's naming.
	return normalize_lab_settings(raw)


static func mass_ledger(settings: Dictionary = {}) -> Array[Dictionary]:
	var config := normalize_lab_settings(settings)
	var frame: Dictionary = FRAME_MATERIALS[config["material"]]
	return [
		{"name": "Frame", "material": frame["name"], "kg": float(frame["mass"])},
		{"name": "Motors × 4", "material": "Steel / copper / magnets", "kg": 0.12},
		{"name": "Propellers × 4", "material": "Polymer", "kg": 0.024},
		{"name": "Electronics & wiring", "material": "FR-4 / copper / silicon", "kg": 0.065},
		{
			"name": "Battery assembly",
			"material": "Cell chemistry unspecified",
			"kg": float(config["battery_mass"]),
		},
		{"name": "Fasteners & landing gear", "material": "Steel / elastomer", "kg": 0.045},
		{"name": "Inert cargo", "material": "User-entered mass", "kg": float(config["cargo_mass"])},
	]


static func energy_budget(settings: Dictionary = {}, speed_mps: float = 0.0) -> Dictionary:
	var config := normalize_lab_settings(settings)
	var total_mass := 0.0
	for row: Dictionary in mass_ledger(config):
		total_mass += float(row["kg"])
	var planet: Dictionary = PLANETS[config["planet"]]
	var movement_load := clampf(maxf(0.0, speed_mps) / 24.0, 0.0, 1.0) * 0.35
	var watts := float(config["flight_watts"]) * (1.0 + movement_load) + float(config["electronics_watts"])
	var battery_wh := float(config["battery_wh"])
	var drain_per_second := watts / 3600.0 / battery_wh * 100.0
	return {
		"mass": total_mass,
		"weight": total_mass * float(planet["gravity"]),
		"watts": watts,
		"wh": battery_wh,
		"minutes": battery_wh / watts * 60.0,
		"drain_per_second": drain_per_second,
		# Browser-shaped consumers can migrate without rewriting this one key.
		"drainPerSecond": drain_per_second,
	}


static func free_flight_drain_per_second(
	settings: Dictionary,
	speed_mps: float,
	legacy_percent_per_second: float
) -> float:
	var config := normalize_lab_settings(settings)
	if not bool(config["energy_model"]):
		return legacy_percent_per_second
	return float(energy_budget(config, speed_mps)["drain_per_second"])


static func free_flight_drain(
	settings: Dictionary,
	speed_mps: float,
	legacy_percent_per_second: float
) -> float:
	## Public port API matching the browser module's naming.
	return free_flight_drain_per_second(settings, speed_mps, legacy_percent_per_second)


static func arcade_mass_scale(settings: Dictionary = {}) -> float:
	var config := normalize_lab_settings(settings)
	if not bool(config["energy_model"]):
		return 1.0
	# 0.674 kg is the exact default ledger mass from the browser version.
	return clampf(0.674 / float(energy_budget(config)["mass"]), 0.25, 1.5)


static func browser_lab_json(settings: Dictionary = {}) -> Dictionary:
	## Produces the same key names used by existing exported browser files.
	var config := normalize_lab_settings(settings)
	return {
		"planet": config["planet"],
		"rotorMode": config["rotor_mode"],
		"energyModel": config["energy_model"],
		"material": config["material"],
		"batteryMass": config["battery_mass"],
		"batteryWh": config["battery_wh"],
		"flightWatts": config["flight_watts"],
		"electronicsWatts": config["electronics_watts"],
		"cargoMass": config["cargo_mass"],
	}


static func _is_finite_number(value: Variant) -> bool:
	var kind := typeof(value)
	return (kind == TYPE_INT or kind == TYPE_FLOAT) and is_finite(float(value))

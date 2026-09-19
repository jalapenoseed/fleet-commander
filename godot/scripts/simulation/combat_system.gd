class_name CombatSystem
extends RefCounted

## Fleet Commander's battle mode.
##
## ELI5: The 10,000-drone show and the dogfight are two different games under
## the same hood. The show uses a very cheap controller. This class keeps the
## battle to 256 aircraft so it can afford collisions, damage, decisions, and
## replay snapshots. Nothing here connects to a physical drone.

signal event_created(event: Dictionary)
signal round_finished(summary: Dictionary)

const MAX_COMBAT_DRONES := 256
const FIXED_STEP := 1.0 / 60.0
const MAX_CATCH_UP_STEPS := 3
const MAX_EVENTS := 256
const MAX_PAYLOADS := 128

const MODE_FLY := 2
const MODE_RETURN := 3
const MODE_LANDED := 5
const MODE_FALLING := 6
const MODE_WRECK := 7

const TEAM_FRIENDLY := 0
const TEAM_ENEMY := 1

const TYPE_SCOUT := 0
const TYPE_RELAY := 1
const TYPE_CARGO := 2
const TYPE_UTILITY := 3

var enabled := false
var engaged := false
var running := true
var time := 0.0
var battle_time := 0.0
var generation := 0
var accumulator := 0.0
var round_limit := 120.0

var speed_scale := 1.0
var damage_scale := 1.0
var aggression := 0.65
var evasion := 0.35
var reaction_seconds := 0.4
var retreat_health := 15.0
var payload_cooldown := 3.5
var friendly_fire := false

var positions := PackedVector3Array()
var velocities := PackedVector3Array()
var homes := PackedVector3Array()
var health := PackedFloat32Array()
var batteries := PackedFloat32Array()
var last_action := PackedFloat32Array()
var damage_dealt := PackedFloat32Array()
var spawn_time := PackedFloat32Array()
var next_decision := PackedFloat32Array()
var next_shot := PackedFloat32Array()
var next_payload := PackedFloat32Array()
var survival_time := PackedFloat32Array()
var modes := PackedByteArray()
var teams := PackedByteArray()
var types := PackedByteArray()
var ammo := PackedInt32Array()
var kills := PackedInt32Array()
var target_indices := PackedInt32Array()
var ids: Array[String] = []
var colors := PackedColorArray()
var events: Array[Dictionary] = []
var payloads: Array[Dictionary] = []

var _event_sequence := 0
var _rng := RandomNumberGenerator.new()


func _init() -> void:
	_rng.seed = 0xF1EE7


func prepare(
	friendly_count: int = 12,
	enemy_count: int = 12,
	friendly_formation: StringName = &"wedge",
	enemy_formation: StringName = &"pincer"
) -> void:
	var friendly := clampi(friendly_count, 1, MAX_COMBAT_DRONES - 1)
	var enemy := clampi(enemy_count, 1, MAX_COMBAT_DRONES - friendly)
	var total := friendly + enemy
	_resize(total)
	time = 0.0
	battle_time = 0.0
	accumulator = 0.0
	generation += 1
	events.clear()
	payloads.clear()
	_event_sequence = 0
	enabled = true
	engaged = false
	running = true

	for index in total:
		var side := TEAM_FRIENDLY if index < friendly else TEAM_ENEMY
		var side_index := index if side == TEAM_FRIENDLY else index - friendly
		var side_count := friendly if side == TEAM_FRIENDLY else enemy
		var formation := friendly_formation if side == TEAM_FRIENDLY else enemy_formation
		teams[index] = side
		types[index] = index % 4
		ids[index] = ("FRIEND-%03d" if side == TEAM_FRIENDLY else "HOSTILE-%03d") % (side_index + 1)
		colors[index] = Color("4ee9ff") if side == TEAM_FRIENDLY else Color("ff6b49")
		homes[index] = _battle_slot(side_index, side_count, side, formation)
		positions[index] = homes[index]
		velocities[index] = Vector3.ZERO
		health[index] = 100.0
		batteries[index] = 100.0
		modes[index] = MODE_FLY
		ammo[index] = 6 if types[index] == TYPE_CARGO else 3
		kills[index] = 0
		target_indices[index] = -1
		last_action[index] = 0.0
		damage_dealt[index] = 0.0
		spawn_time[index] = 0.0
		next_decision[index] = 0.0
		next_shot[index] = 0.2 + float(index % 7) * 0.06
		next_payload[index] = 1.0 + float(index % 5) * 0.17
		survival_time[index] = 0.0

	_add_event(&"prepare", Vector3.ZERO, -1, -1)


func engage() -> void:
	if not enabled:
		prepare()
	engaged = true
	running = true
	_add_event(&"engage", Vector3.ZERO, -1, -1)


func cease_fire() -> void:
	engaged = false
	_add_event(&"cease_fire", Vector3.ZERO, -1, -1)


func set_paused(paused: bool) -> void:
	running = not paused


func exit_battle() -> void:
	enabled = false
	engaged = false
	running = false


func retreat(index: int) -> void:
	if _is_alive(index):
		modes[index] = MODE_RETURN
		target_indices[index] = -1


func retreat_team(side: int) -> void:
	for index in positions.size():
		if teams[index] == side:
			retreat(index)


func step(delta: float, gravity: float = 9.81, density: float = 1.225) -> void:
	if not enabled or not running:
		return
	accumulator += minf(delta, 0.05)
	var steps := 0
	while accumulator >= FIXED_STEP and steps < MAX_CATCH_UP_STEPS:
		_fixed_step(FIXED_STEP, gravity, density)
		accumulator -= FIXED_STEP
		steps += 1
	if steps == MAX_CATCH_UP_STEPS:
		accumulator = minf(accumulator, FIXED_STEP)


func drop_payload(index: int) -> bool:
	if not _is_alive(index) or ammo[index] <= 0 or payloads.size() >= MAX_PAYLOADS:
		return false
	if time < next_payload[index]:
		return false
	ammo[index] -= 1
	next_payload[index] = time + payload_cooldown
	var forward := _forward_for(index)
	payloads.append({
		"id": _event_sequence + payloads.size() + 1,
		"owner": index,
		"side": int(teams[index]),
		"position": positions[index] + Vector3.DOWN * 0.4,
		"velocity": velocities[index] + forward * 4.0 + Vector3.DOWN * 2.0,
		"age": 0.0,
	})
	last_action[index] = time
	_add_event(&"drop", positions[index], index, index)
	return true


func apply_damage(index: int, amount: float, cause: StringName = &"impact", attacker: int = -1) -> void:
	if not _is_alive(index) or amount <= 0.0:
		return
	var before := health[index]
	health[index] = maxf(0.0, before - amount * damage_scale)
	last_action[index] = time
	if attacker >= 0 and attacker < positions.size():
		damage_dealt[attacker] += before - health[index]
		last_action[attacker] = time
	_add_event(cause, positions[index], index, attacker)
	if health[index] <= 0.0:
		modes[index] = MODE_FALLING
		target_indices[index] = -1
		velocities[index] += Vector3(
			_rng.randf_range(-3.0, 3.0),
			_rng.randf_range(1.0, 4.0),
			_rng.randf_range(-3.0, 3.0)
		)
		if attacker >= 0 and attacker < positions.size() and attacker != index:
			kills[attacker] += 1
		_add_event(&"destroy", positions[index], index, attacker)


func team_summary() -> Dictionary:
	var friendly := _empty_team_summary()
	var enemy := _empty_team_summary()
	for index in positions.size():
		var row: Dictionary = friendly if teams[index] == TEAM_FRIENDLY else enemy
		row.total += 1
		match modes[index]:
			MODE_FLY:
				row.flying += 1
			MODE_RETURN:
				row.returning += 1
			MODE_LANDED:
				row.landed += 1
			MODE_WRECK:
				row.downed += 1
			MODE_FALLING:
				row.downed += 1
	return {"friendly": friendly, "enemy": enemy}


func render_state() -> Dictionary:
	# ELI5: Cameras, replays, and drawing code receive copies of the small
	# battle arrays. They never get permission to move a live aircraft.
	return {
		"count": positions.size(),
		"positions": positions.duplicate(),
		"velocities": velocities.duplicate(),
		"homes": homes.duplicate(),
		"health": health.duplicate(),
		"batteries": batteries.duplicate(),
		"modes": modes.duplicate(),
		"teams": teams.duplicate(),
		"types": types.duplicate(),
		"colors": colors.duplicate(),
		"ids": ids.duplicate(),
		"kills": kills.duplicate(),
		"last_action": last_action.duplicate(),
		"target_indices": target_indices.duplicate(),
		"ammo": ammo.duplicate(),
		"events": events.duplicate(true),
		"payloads": payloads.duplicate(true),
		"teams_summary": team_summary(),
		"elapsed": time,
		"time": time,
		"running": running,
		"combat": true,
		"engaged": engaged,
		"generation": generation,
	}


func _fixed_step(delta: float, gravity: float, density: float) -> void:
	time += delta
	if engaged:
		battle_time += delta
	var drag := exp(-maxf(0.0, density) * 0.018 * delta)

	for index in positions.size():
		match modes[index]:
			MODE_WRECK, MODE_LANDED:
				continue
			MODE_FALLING:
				var falling_velocity := velocities[index]
				falling_velocity.y -= gravity * delta
				falling_velocity *= drag
				velocities[index] = falling_velocity
				positions[index] += falling_velocity * delta
				if positions[index].y <= 0.35:
					positions[index] = Vector3(positions[index].x, 0.35, positions[index].z)
					velocities[index] = Vector3.ZERO
					modes[index] = MODE_WRECK
					_add_event(&"wreck", positions[index], index, -1)
				continue
			MODE_RETURN:
				_step_return(index, delta)
				continue

		batteries[index] = maxf(
			0.0,
			batteries[index] - delta * (0.08 + velocities[index].length() * 0.003)
		)
		survival_time[index] = time - spawn_time[index]
		if batteries[index] <= 0.0:
			modes[index] = MODE_FALLING
			continue
		if batteries[index] < 12.0 or health[index] <= retreat_health:
			modes[index] = MODE_RETURN
			continue
		if not engaged:
			_step_staging(index, delta)
			continue
		if time >= next_decision[index] or not _valid_enemy(index, target_indices[index]):
			target_indices[index] = _choose_target(index)
			next_decision[index] = time + reaction_seconds * _rng.randf_range(0.75, 1.25)
		_step_ai(index, delta)

	_step_pair_collisions()
	_step_payloads(delta, gravity, density)
	_trim_events()

	if engaged and (battle_time >= round_limit or _team_defeated(TEAM_FRIENDLY) or _team_defeated(TEAM_ENEMY)):
		engaged = false
		round_finished.emit(team_summary())


func _step_staging(index: int, delta: float) -> void:
	var hover := homes[index] + Vector3(0.0, sin(time * 1.4 + float(index)) * 0.35, 0.0)
	_steer_toward(index, hover, 12.0, delta)


func _step_return(index: int, delta: float) -> void:
	var home := homes[index]
	_steer_toward(index, home, 14.0, delta)
	if positions[index].distance_to(home) < 1.2 and velocities[index].length() < 2.0:
		positions[index] = home
		velocities[index] = Vector3.ZERO
		modes[index] = MODE_LANDED
		target_indices[index] = -1
		_add_event(&"land", home, index, index)


func _step_ai(index: int, delta: float) -> void:
	var target := target_indices[index]
	if not _valid_enemy(index, target):
		_step_staging(index, delta)
		return
	var to_target := positions[target] - positions[index]
	var distance := to_target.length()
	var intercept_time := clampf(distance / 32.0, 0.0, 1.8)
	var aim := positions[target] + velocities[target] * intercept_time
	var weave := Vector3(
		sin(time * 2.1 + float(index) * 1.73),
		cos(time * 1.7 + float(index) * 0.31) * 0.45,
		cos(time * 2.1 + float(index) * 1.73)
	) * evasion * 8.0
	var stand_off := 5.5 + (1.0 - aggression) * 10.0
	if distance < stand_off:
		aim -= to_target.normalized() * (stand_off - distance)
	_steer_toward(index, aim + weave, 18.0 + aggression * 12.0, delta)

	if distance < 42.0 and time >= next_shot[index]:
		var hit_chance := clampf(0.86 - distance / 80.0 + aggression * 0.12, 0.18, 0.9)
		next_shot[index] = time + _rng.randf_range(0.42, 0.78) / maxf(0.35, aggression)
		last_action[index] = time
		_add_event(&"shot", positions[index], target, index)
		if _rng.randf() <= hit_chance:
			apply_damage(target, _rng.randf_range(4.0, 11.0), &"impact", index)

	if types[index] == TYPE_CARGO and distance < 14.0 and ammo[index] > 0:
		drop_payload(index)


func _steer_toward(index: int, target: Vector3, max_speed: float, delta: float) -> void:
	var error := target - positions[index]
	var wanted := error.limit_length(max_speed * speed_scale)
	var acceleration := (wanted - velocities[index] * 0.72).limit_length(28.0)
	var velocity := velocities[index] + acceleration * delta
	velocity = velocity.limit_length(max_speed * speed_scale)
	var position := positions[index] + velocity * delta
	position.x = clampf(position.x, -1024.0, 1024.0)
	position.y = clampf(position.y, 1.0, 320.0)
	position.z = clampf(position.z, -1024.0, 1024.0)
	velocities[index] = velocity
	positions[index] = position


func _step_pair_collisions() -> void:
	for first in positions.size():
		if not _is_alive(first):
			continue
		for second in range(first + 1, positions.size()):
			if not _is_alive(second):
				continue
			var radius := _radius_for(first) + _radius_for(second)
			var delta := positions[second] - positions[first]
			var distance := delta.length()
			if distance >= radius:
				continue
			var normal := delta / distance if distance > 0.0001 else Vector3.RIGHT
			var overlap := radius - distance
			positions[first] -= normal * overlap * 0.5
			positions[second] += normal * overlap * 0.5
			var relative_speed := (velocities[first] - velocities[second]).length()
			var impact_damage := minf(100.0, maxf(0.0, relative_speed - 2.0) * 5.5)
			if impact_damage > 0.0:
				apply_damage(first, impact_damage, &"collision", second)
				apply_damage(second, impact_damage, &"collision", first)


func _step_payloads(delta: float, gravity: float, density: float) -> void:
	for payload_index in range(payloads.size() - 1, -1, -1):
		var payload := payloads[payload_index]
		payload.age += delta
		var velocity: Vector3 = payload.velocity
		velocity.y -= gravity * delta
		velocity *= exp(-maxf(0.0, density) * 0.03 * delta)
		payload.velocity = velocity
		payload.position += velocity * delta
		payloads[payload_index] = payload
		if payload.position.y <= 0.25 or payload.age >= 12.0:
			_explode_payload(payload)
			payloads.remove_at(payload_index)


func _explode_payload(payload: Dictionary) -> void:
	var center: Vector3 = payload.position
	_add_event(&"explosion", center, -1, int(payload.owner))
	for index in positions.size():
		if not _is_alive(index):
			continue
		if not friendly_fire and int(teams[index]) == int(payload.side):
			continue
		var distance := positions[index].distance_to(center)
		if distance >= 11.0:
			continue
		var falloff := 1.0 - distance / 11.0
		apply_damage(index, 125.0 * falloff, &"blast", int(payload.owner))
		velocities[index] += (positions[index] - center).normalized() * falloff * 12.0


func _choose_target(index: int) -> int:
	var best := -1
	var best_score := INF
	for candidate in positions.size():
		if not _valid_enemy(index, candidate):
			continue
		var score := positions[index].distance_squared_to(positions[candidate])
		# Slight deterministic noise keeps every aircraft from selecting one victim.
		score *= 0.9 + float((index * 17 + candidate * 13) % 21) * 0.01
		if score < best_score:
			best_score = score
			best = candidate
	return best


func _valid_enemy(index: int, candidate: int) -> bool:
	return (
		candidate >= 0
		and candidate < positions.size()
		and candidate != index
		and teams[candidate] != teams[index]
		and _is_alive(candidate)
	)


func _is_alive(index: int) -> bool:
	return index >= 0 and index < modes.size() and modes[index] in [MODE_FLY, MODE_RETURN]


func _team_defeated(side: int) -> bool:
	for index in positions.size():
		if teams[index] == side and _is_alive(index):
			return false
	return true


func _forward_for(index: int) -> Vector3:
	var velocity := velocities[index]
	return velocity.normalized() if velocity.length_squared() > 0.01 else Vector3.FORWARD


func _radius_for(index: int) -> float:
	var span: float = float([0.52, 0.68, 1.9, 0.7][types[index]])
	return maxf(0.42, span * 0.6)


func _battle_slot(index: int, count: int, side: int, formation: StringName) -> Vector3:
	var direction := -1.0 if side == TEAM_FRIENDLY else 1.0
	var row := index / 12
	var column := index % 12
	var centered := float(column) - (minf(12.0, float(count)) - 1.0) * 0.5
	var x := centered * 7.0
	var z := direction * (85.0 + float(row) * 8.0)
	var y := 18.0 + float(index % 4) * 2.4
	match formation:
		&"wedge", &"pincer":
			z += absf(centered) * (4.0 if formation == &"wedge" else -3.0) * direction
		&"line":
			z = direction * 92.0
		&"column":
			x = float((index % 3) - 1) * 7.0
			z = direction * (75.0 + float(index / 3) * 7.0)
	return Vector3(x, y, z)


func _add_event(type: StringName, position: Vector3, drone_index: int, attacker: int) -> void:
	_event_sequence += 1
	var event := {
		"id": _event_sequence,
		"type": type,
		"time": time,
		"position": position,
		"drone_index": drone_index,
		"drone_id": ids[drone_index] if drone_index >= 0 and drone_index < ids.size() else "",
		"attacker_index": attacker,
		"attacker": ids[attacker] if attacker >= 0 and attacker < ids.size() else "",
	}
	events.append(event)
	event_created.emit(event)


func _trim_events() -> void:
	while events.size() > MAX_EVENTS or (events.size() > 1 and time - float(events[0].time) > 20.0):
		events.pop_front()


func _empty_team_summary() -> Dictionary:
	return {"total": 0, "flying": 0, "returning": 0, "landed": 0, "downed": 0}


func _resize(count: int) -> void:
	positions.resize(count)
	velocities.resize(count)
	homes.resize(count)
	health.resize(count)
	batteries.resize(count)
	last_action.resize(count)
	damage_dealt.resize(count)
	spawn_time.resize(count)
	next_decision.resize(count)
	next_shot.resize(count)
	next_payload.resize(count)
	survival_time.resize(count)
	modes.resize(count)
	teams.resize(count)
	types.resize(count)
	ammo.resize(count)
	kills.resize(count)
	target_indices.resize(count)
	colors.resize(count)
	ids.resize(count)

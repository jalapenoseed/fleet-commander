extends RefCounted
class_name SpatialHash3D

## ELI5: Instead of asking every drone about every other drone, divide the
## world into invisible boxes. A drone only checks its box and nearby boxes.
## This changes an impossible 10,000 x 10,000 search into a small local search.

var cell_size: float = 24.0
var _heads: Dictionary = {}
var _next := PackedInt32Array()
var _positions := PackedVector3Array()


func _init(size: float = 24.0) -> void:
	cell_size = maxf(0.25, size)


func clear() -> void:
	_heads.clear()
	_next = PackedInt32Array()
	_positions = PackedVector3Array()


func rebuild(
	positions: PackedVector3Array,
	active_mask: PackedByteArray = PackedByteArray()
) -> void:
	_heads.clear()
	_positions = positions
	_next.resize(positions.size())
	_next.fill(-1)
	var use_mask := active_mask.size() == positions.size()
	for index in range(positions.size()):
		if use_mask and active_mask[index] == 0:
			continue
		var key := cell_for(positions[index])
		_next[index] = int(_heads.get(key, -1))
		_heads[key] = index


func cell_for(position: Vector3) -> Vector3i:
	return Vector3i(
		floori(position.x / cell_size),
		floori(position.y / cell_size),
		floori(position.z / cell_size)
	)


func query_nearest(
	position: Vector3,
	exclude_index: int = -1,
	radius: float = 48.0,
	limit: int = 24
) -> PackedInt32Array:
	## ELI5: Keep only the closest `limit` neighbors. Fleet Commander uses 24
	## for Boids so a packed crowd cannot make one drone inspect thousands.
	var scratch := PackedInt32Array()
	var distances := PackedFloat32Array()
	scratch.resize(maxi(0, limit))
	distances.resize(maxi(0, limit))
	var count := query_nearest_into(
		position, exclude_index, radius, limit, scratch, distances
	)
	var result := PackedInt32Array()
	for slot in range(count):
		result.append(scratch[slot])
	return result


func query_nearest_into(
	position: Vector3,
	exclude_index: int,
	radius: float,
	limit: int,
	result: PackedInt32Array,
	distances: PackedFloat32Array,
	offset: int = 0
) -> int:
	## Hot-loop version: callers reuse the same two packed scratch arrays.
	## They must already have `offset + limit` slots.
	if (
		_positions.is_empty()
		or radius <= 0.0
		or limit <= 0
		or result.size() < offset + limit
		or distances.size() < offset + limit
	):
		return 0
	var found := 0
	var radius_squared := radius * radius
	var worst_distance := radius_squared
	var worst_slot := -1
	var center := cell_for(position)
	var reach := ceili(radius / cell_size)

	for x in range(center.x - reach, center.x + reach + 1):
		for y in range(center.y - reach, center.y + reach + 1):
			for z in range(center.z - reach, center.z + reach + 1):
				var key := Vector3i(x, y, z)
				if not _heads.has(key):
					continue
				# Skip a whole box if even its nearest corner is already too far.
				var box_min := Vector3(x, y, z) * cell_size
				var box_max := box_min + Vector3.ONE * cell_size
				var nearest := Vector3(
					clampf(position.x, box_min.x, box_max.x),
					clampf(position.y, box_min.y, box_max.y),
					clampf(position.z, box_min.z, box_max.z)
				)
				if position.distance_squared_to(nearest) >= worst_distance:
					continue
				var candidate := int(_heads[key])
				while candidate >= 0:
					if candidate == exclude_index:
						candidate = _next[candidate]
						continue
					var distance_squared := position.distance_squared_to(_positions[candidate])
					if distance_squared >= worst_distance:
						candidate = _next[candidate]
						continue
					if found < limit:
						result[offset + found] = candidate
						distances[offset + found] = distance_squared
						found += 1
					else:
						result[offset + worst_slot] = candidate
						distances[offset + worst_slot] = distance_squared
					if found == limit:
						worst_slot = 0
						worst_distance = distances[offset]
						for slot in range(1, limit):
							if distances[offset + slot] > worst_distance:
								worst_distance = distances[offset + slot]
								worst_slot = slot
					candidate = _next[candidate]
	return found


func query_radius(
	position: Vector3,
	exclude_index: int = -1,
	radius: float = 6.0,
	limit: int = 0
) -> PackedInt32Array:
	## A limit of zero means "return every nearby index." This is useful for
	## hard collision spacing, while Boids normally uses query_nearest instead.
	var result := PackedInt32Array()
	if _positions.is_empty() or radius <= 0.0:
		return result
	var center := cell_for(position)
	var reach := ceili(radius / cell_size)
	var radius_squared := radius * radius
	for x in range(center.x - reach, center.x + reach + 1):
		for y in range(center.y - reach, center.y + reach + 1):
			for z in range(center.z - reach, center.z + reach + 1):
				var candidate := int(_heads.get(Vector3i(x, y, z), -1))
				while candidate >= 0:
					if candidate == exclude_index:
						candidate = _next[candidate]
						continue
					if position.distance_squared_to(_positions[candidate]) > radius_squared:
						candidate = _next[candidate]
						continue
					result.append(candidate)
					if limit > 0 and result.size() >= limit:
						return result
					candidate = _next[candidate]
	return result


func query_radius_into(
	position: Vector3,
	exclude_index: int,
	radius: float,
	result: PackedInt32Array,
	maximum: int,
	offset: int = 0
) -> int:
	if (
		_positions.is_empty()
		or radius <= 0.0
		or maximum <= 0
		or result.size() < offset + maximum
	):
		return 0
	var found := 0
	var center := cell_for(position)
	var reach := ceili(radius / cell_size)
	var radius_squared := radius * radius
	for x in range(center.x - reach, center.x + reach + 1):
		for y in range(center.y - reach, center.y + reach + 1):
			for z in range(center.z - reach, center.z + reach + 1):
				var candidate := int(_heads.get(Vector3i(x, y, z), -1))
				while candidate >= 0:
					if (
						candidate != exclude_index
						and position.distance_squared_to(_positions[candidate]) <= radius_squared
					):
						result[offset + found] = candidate
						found += 1
						if found >= maximum:
							return found
					candidate = _next[candidate]
	return found


func bucket_count() -> int:
	return _heads.size()


func indexed_count() -> int:
	var total := 0
	for head in _heads.values():
		var index := int(head)
		while index >= 0:
			total += 1
			index = _next[index]
	return total

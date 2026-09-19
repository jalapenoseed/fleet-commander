class_name CommanderUI
extends CanvasLayer

## Compact command-center interface.
##
## ELI5: This file builds buttons and menus. It does not fly a drone. Each
## button emits a request, and main.gd decides which simulation receives it.

signal launch_requested
signal pause_requested
signal land_requested
signal recharge_requested
signal roster_requested(count: int)
signal formation_requested(formation: StringName)
signal boids_requested(enabled: bool)
signal boid_value_requested(key: StringName, value: float)
signal influence_requested(slot: int, kind: StringName, strength: float)
signal camera_requested(mode: StringName)
signal next_subject_requested(direction: int)
signal next_shot_requested
signal planet_requested(planet: StringName, constrained: bool)
signal battle_prepare_requested(friendly: int, enemy: int)
signal battle_engage_requested
signal battle_exit_requested
signal payload_requested
signal replay_capture_requested
signal replay_play_requested
signal replay_stop_requested
signal replay_speed_requested(speed: float)
signal audio_requested
signal save_requested
signal load_requested

const PAGES := [
	"Arena", "Squads", "Fleet", "Program", "Art Studio", "Director",
	"Physics", "Nerd Lab", "Replays", "Journal", "Challenges", "Saves",
]

const CAMERA_MODES := [
	"orbit", "top", "front", "follow", "fpv", "shoulder", "mounted",
	"ground", "free", "cinematic", "action", "best_fight", "longest_survivor",
]

var current_page := "Arena"
var interface_visible := true
var _latest_state: Dictionary = {}
var _camera_label := "Overview"
var _replay_label := "Replay ready"
var _audio_enabled := false
var _selected_replay_speed := 0.25

var _root: Control
var _rail: VBoxContainer
var _inspector: VBoxContainer
var _status_label: Label
var _team_label: Label
var _camera_label_node: Label
var _page_title: Label
var _search: LineEdit
var _replay_status_label: Label


func _ready() -> void:
	_build_shell()
	_show_page(current_page)


func toggle_interface() -> void:
	interface_visible = not interface_visible
	_root.visible = interface_visible


func set_status(state: Dictionary, camera_text: String, replay_text: String, audio_on: bool) -> void:
	_latest_state = state
	_camera_label = camera_text
	_replay_label = replay_text
	_audio_enabled = audio_on
	if not is_instance_valid(_status_label):
		return
	var count := int(state.get("count", 0))
	var batteries: PackedFloat32Array = state.get("batteries", PackedFloat32Array())
	var average_battery := 0.0
	for value in batteries:
		average_battery += value
	if not batteries.is_empty():
		average_battery /= float(batteries.size())
	_status_label.text = "%s  •  %s  •  %d aircraft  •  %.0f%% avg battery" % [
		"RUNNING" if bool(state.get("running", false)) else "PAUSED",
		"BATTLE" if bool(state.get("combat", false)) else "SHOW",
		count,
		average_battery,
	]
	_camera_label_node.text = camera_text
	if is_instance_valid(_replay_status_label):
		_replay_status_label.text = replay_text
	var summaries: Dictionary = state.get("teams_summary", {})
	if summaries.has("friendly") and summaries.has("enemy"):
		var friendly: Dictionary = summaries.friendly
		var enemy: Dictionary = summaries.enemy
		_team_label.text = "FRIENDLY %d/%d     HOSTILE %d/%d" % [
			int(friendly.get("flying", 0)), int(friendly.get("total", 0)),
			int(enemy.get("flying", 0)), int(enemy.get("total", 0)),
		]
	else:
		_team_label.text = "FLEET %d" % count


func _build_shell() -> void:
	_root = Control.new()
	_root.name = "CommandCenterUI"
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	# The transparent middle of the full-screen UI is a window onto the 3D
	# arena. Let drag and wheel events pass through it; the real panels and
	# buttons below still keep their normal mouse behavior.
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)

	var top_panel := PanelContainer.new()
	top_panel.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top_panel.offset_bottom = 58.0
	top_panel.add_theme_stylebox_override("panel", _panel_style(Color("08131fdd"), Color("1d4860")))
	_root.add_child(top_panel)
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 12)
	top_panel.add_child(top)
	var brand := Label.new()
	brand.text = "  FLEET COMMANDER  /  GODOT"
	brand.add_theme_color_override("font_color", Color("62efff"))
	brand.add_theme_font_size_override("font_size", 18)
	brand.custom_minimum_size.x = 270
	top.add_child(brand)
	_add_top_button(top, "LAUNCH", func() -> void: launch_requested.emit())
	_add_top_button(top, "PAUSE", func() -> void: pause_requested.emit())
	_add_top_button(top, "LAND", func() -> void: land_requested.emit())
	_add_top_button(top, "PAYLOAD [B]", func() -> void: payload_requested.emit())
	_status_label = Label.new()
	_status_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status_label.text = "BOOTING GODOT PORT…"
	top.add_child(_status_label)
	_team_label = Label.new()
	_team_label.text = "FLEET 0"
	_team_label.add_theme_color_override("font_color", Color("ffc267"))
	top.add_child(_team_label)
	_add_top_button(top, "SOUND", func() -> void: audio_requested.emit())

	var rail_panel := PanelContainer.new()
	rail_panel.anchor_bottom = 1.0
	rail_panel.offset_top = 58.0
	rail_panel.offset_right = 116.0
	rail_panel.add_theme_stylebox_override("panel", _panel_style(Color("07101be8"), Color("19364a")))
	_root.add_child(rail_panel)
	var rail_scroll := ScrollContainer.new()
	rail_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	rail_panel.add_child(rail_scroll)
	_rail = VBoxContainer.new()
	_rail.custom_minimum_size.x = 110.0
	_rail.add_theme_constant_override("separation", 3)
	rail_scroll.add_child(_rail)
	for page in PAGES:
		var button := Button.new()
		button.text = page.to_upper()
		button.tooltip_text = "Open %s controls" % page
		button.custom_minimum_size = Vector2(108, 38)
		button.pressed.connect(_show_page.bind(page))
		_rail.add_child(button)

	var inspector_panel := PanelContainer.new()
	inspector_panel.anchor_left = 1.0
	inspector_panel.anchor_right = 1.0
	inspector_panel.anchor_bottom = 1.0
	inspector_panel.offset_left = -386.0
	inspector_panel.offset_top = 58.0
	inspector_panel.add_theme_stylebox_override("panel", _panel_style(Color("08131ff2"), Color("24516a")))
	_root.add_child(inspector_panel)
	var inspector_margin := MarginContainer.new()
	inspector_margin.add_theme_constant_override("margin_left", 14)
	inspector_margin.add_theme_constant_override("margin_right", 14)
	inspector_margin.add_theme_constant_override("margin_top", 12)
	inspector_margin.add_theme_constant_override("margin_bottom", 12)
	inspector_panel.add_child(inspector_margin)
	var inspector_scroll := ScrollContainer.new()
	inspector_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	inspector_margin.add_child(inspector_scroll)
	_inspector = VBoxContainer.new()
	_inspector.custom_minimum_size.x = 340.0
	_inspector.add_theme_constant_override("separation", 9)
	inspector_scroll.add_child(_inspector)

	_page_title = Label.new()
	_page_title.add_theme_font_size_override("font_size", 23)
	_page_title.add_theme_color_override("font_color", Color("62efff"))
	_inspector.add_child(_page_title)
	_search = LineEdit.new()
	_search.placeholder_text = "Find a control…  [ / ]"
	_search.text_submitted.connect(_on_search_submitted)
	_inspector.add_child(_search)

	_camera_label_node = Label.new()
	_camera_label_node.anchor_left = 0.5
	_camera_label_node.anchor_right = 0.5
	_camera_label_node.anchor_top = 1.0
	_camera_label_node.anchor_bottom = 1.0
	_camera_label_node.offset_left = -230.0
	_camera_label_node.offset_right = 230.0
	_camera_label_node.offset_top = -40.0
	_camera_label_node.offset_bottom = -10.0
	_camera_label_node.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_camera_label_node.add_theme_color_override("font_color", Color("d8f8ff"))
	_camera_label_node.text = "Overview"
	_root.add_child(_camera_label_node)


func _show_page(page: String) -> void:
	current_page = page
	if not is_instance_valid(_inspector):
		return
	for child in _inspector.get_children():
		if child != _page_title and child != _search:
			child.queue_free()
	_page_title.text = page
	match page:
		"Arena":
			_build_arena_page()
		"Squads":
			_build_squads_page()
		"Fleet":
			_build_fleet_page()
		"Program":
			_build_program_page()
		"Art Studio":
			_build_art_page()
		"Director":
			_build_director_page()
		"Physics":
			_build_physics_page()
		"Nerd Lab":
			_build_nerd_page()
		"Replays":
			_build_replay_page()
		"Journal":
			_build_journal_page()
		"Challenges":
			_build_challenges_page()
		"Saves":
			_build_saves_page()


func _build_arena_page() -> void:
	_add_explanation("Run the large formation sandbox. Every dot is still an independently simulated aircraft.")
	var fleet_state := _dictionary(_latest_state.get("fleet", {}))
	var program := _dictionary(_latest_state.get("program", {}))
	var formation_state := _dictionary(program.get("formation", {}))
	var count := SpinBox.new()
	count.min_value = 0
	count.max_value = 10000
	count.step = 1
	count.value = int(fleet_state.get("count", _latest_state.get("count", 100)))
	count.prefix = "Aircraft  "
	_inspector.add_child(count)
	_add_button("APPLY ROSTER", func() -> void: roster_requested.emit(int(count.value)))
	var formation := _option(Array(FormationLibrary.SHAPES))
	_select_option(formation, String(formation_state.get("shape", "grid")))
	_inspector.add_child(formation)
	formation.item_selected.connect(func(index: int) -> void: formation_requested.emit(StringName(formation.get_item_text(index))))
	_add_button("LAUNCH ALL", func() -> void: launch_requested.emit())
	_add_button("LAND ALL", func() -> void: land_requested.emit())
	_add_button("FULL RECHARGE", func() -> void: recharge_requested.emit())


func _build_squads_page() -> void:
	_add_explanation("Prepare a separate game-AI dogfight. Combat is capped at 256 aircraft so collision, damage, wrecks and replay stay reliable.")
	var friendly := SpinBox.new()
	friendly.min_value = 1
	friendly.max_value = 128
	friendly.value = 12
	friendly.prefix = "Friendly  "
	_inspector.add_child(friendly)
	var enemy := SpinBox.new()
	enemy.min_value = 1
	enemy.max_value = 128
	enemy.value = 12
	enemy.prefix = "Hostile  "
	_inspector.add_child(enemy)
	_add_button("PREPARE BATTLE", func() -> void: battle_prepare_requested.emit(int(friendly.value), int(enemy.value)))
	_add_button("ENGAGE AI BATTLE", func() -> void: battle_engage_requested.emit())
	_add_button("DROP SELECTED PAYLOAD", func() -> void: payload_requested.emit())
	_add_button("RETURN TO SHOW", func() -> void: battle_exit_requested.emit())


func _build_fleet_page() -> void:
	_add_explanation("Inspect one aircraft without changing the rest of the fleet.")
	var row := HBoxContainer.new()
	_inspector.add_child(row)
	_add_button_to(row, "◀ PREVIOUS", func() -> void: next_subject_requested.emit(-1))
	_add_button_to(row, "NEXT ▶", func() -> void: next_subject_requested.emit(1))
	_add_readout("Battery behavior", "Finite charge, reserve return, emergency descent and service/relaunch are active in the show simulation.")
	_add_readout("Scale", "0–10,000 show aircraft; 2–256 combat aircraft.")


func _build_program_page() -> void:
	_add_explanation("Boids are small steering suggestions layered on top of the assigned formation. NONE really resets them.")
	var program := _dictionary(_latest_state.get("program", {}))
	var boid_state := _dictionary(program.get("boids", {}))
	var formation_state := _dictionary(program.get("formation", {}))
	var boids := CheckButton.new()
	boids.text = "Enable Boids"
	boids.button_pressed = bool(boid_state.get("enabled", false))
	boids.toggled.connect(func(value: bool) -> void: boids_requested.emit(value))
	_inspector.add_child(boids)
	for setting in [
		["separation", 1.4, 0.0, 3.0], ["alignment", 0.6, 0.0, 3.0],
		["cohesion", 0.35, 0.0, 3.0], ["avoidance", 1.5, 0.0, 3.0],
		["attraction", 0.3, 0.0, 3.0], ["matching", 0.5, 0.0, 3.0],
	]:
		var setting_key := StringName(setting[0])
		var live_value := float(boid_state.get(String(setting_key), setting[1]))
		_add_slider(String(setting[0]).capitalize(), live_value, float(setting[2]), float(setting[3]), func(value: float) -> void:
			boid_value_requested.emit(setting_key, value)
		)
	var live_layers: Array = formation_state.get("influences", [])
	for slot in FormationLibrary.MAX_INFLUENCE_LAYERS:
		var layer := _dictionary(live_layers[slot] if slot < live_layers.size() else {})
		var influence := _option(Array(FormationLibrary.INFLUENCES))
		_select_option(influence, String(layer.get("type", "none")))
		_inspector.add_child(influence)
		var strength := SpinBox.new()
		strength.min_value = 0
		strength.max_value = 1
		strength.step = 0.05
		strength.value = clampf(float(layer.get("strength", 8.0)) / 16.0, 0.0, 1.0)
		strength.prefix = "Layer %d strength  " % (slot + 1)
		_inspector.add_child(strength)
		var layer_slot := slot
		_add_button("APPLY LAYER %d" % (slot + 1), func() -> void:
			influence_requested.emit(layer_slot, StringName(influence.get_item_text(influence.selected)), float(strength.value))
		)
	_add_button("RESET ALL INFLUENCES", func() -> void: influence_requested.emit(-1, &"none", 0.0))


func _build_art_page() -> void:
	_add_explanation("Formation art is represented by the shape sampler in this first native port. Use Heart, Ring, Sphere, Helix or Scatter, then combine it with a show influence.")
	for shape in ["heart", "ring", "sphere", "helix", "scatter"]:
		var shape_name := StringName(shape)
		_add_button("FORM %s" % shape.to_upper(), func() -> void: formation_requested.emit(shape_name))
	_add_readout("Browser compatibility", "The original RGB image/drawing studio remains in /dist as the behavior reference while its native Godot image importer is translated.")


func _build_director_page() -> void:
	_add_explanation("All cameras read the same live or replay state. Camera movement never moves an aircraft.")
	var camera := _option(CAMERA_MODES)
	_select_option(camera, String(_latest_state.get("camera_mode", "orbit")))
	_inspector.add_child(camera)
	camera.item_selected.connect(func(index: int) -> void: camera_requested.emit(StringName(camera.get_item_text(index))))
	_add_button("NEXT CINEMATIC SHOT", func() -> void: next_shot_requested.emit())
	_add_button("PREVIOUS AIRCRAFT", func() -> void: next_subject_requested.emit(-1))
	_add_button("NEXT AIRCRAFT", func() -> void: next_subject_requested.emit(1))
	_add_button("TOGGLE SOUND", func() -> void: audio_requested.emit())
	_add_readout("Dedicated battle views", "Cinematic Action tracks recent action, Best Fight scores active duels, and Longest Survivor holds one endangered aircraft.")


func _build_physics_page() -> void:
	_add_explanation("Educational game inputs—not engineering predictions. Distances are metres; gravity is m/s²; mass is kg; energy is Wh.")
	var planet := _option(["earth", "moon", "mars"])
	_select_option(planet, String(_latest_state.get("planet", "earth")))
	_inspector.add_child(planet)
	var constrained := CheckButton.new()
	constrained.text = "Constrained Earth-style rotors"
	var lab := _dictionary(_latest_state.get("lab", {}))
	constrained.button_pressed = String(lab.get("rotor_mode", "arcade")) == "constrained"
	_inspector.add_child(constrained)
	_add_button("APPLY PLANET", func() -> void:
		planet_requested.emit(StringName(planet.get_item_text(planet.selected)), constrained.button_pressed)
	)
	_add_readout("Earth", "9.81 m/s² • 1.225 kg/m³ • weather enabled")
	_add_readout("Moon", "1.62 m/s² • vacuum • constrained propellers cannot lift")
	_add_readout("Mars", "3.73 m/s² • 0.016 kg/m³ • thin-air constrained flight falls")


func _build_nerd_page() -> void:
	_add_explanation("Live model inspector. These are simplified teaching models, not CFD, RF, acoustic or certified flight tools.")
	_add_readout("Controller", "position error × 1.7 − velocity × 2.6, limited to 28 m/s²")
	_add_readout("Boids", "separation + alignment + cohesion + avoidance + target attraction + velocity matching")
	_add_readout("Battery", "legacy drain or optional watts / 3600 / battery Wh")
	_add_readout("Replay", "10 pose samples per second; up to 180 frames; live state is never rewritten")


func _build_replay_page() -> void:
	_add_explanation("A replay is a pose flipbook. Watching one cannot change the real battle result.")
	_add_button("CAPTURE LAST 8 SECONDS", func() -> void: replay_capture_requested.emit())
	_add_button("PLAY LATEST HIGHLIGHT", func() -> void: replay_play_requested.emit())
	_add_button("STOP REPLAY", func() -> void: replay_stop_requested.emit())
	var speeds := _option(["0.125", "0.25", "0.5", "1.0", "2.0"])
	_select_option(speeds, str(_selected_replay_speed))
	_inspector.add_child(speeds)
	speeds.item_selected.connect(func(index: int) -> void:
		_selected_replay_speed = float(speeds.get_item_text(index))
		replay_speed_requested.emit(_selected_replay_speed)
	)
	_replay_status_label = _add_readout("Status", _replay_label)


func _build_journal_page() -> void:
	_add_explanation("Battle outcomes stay local and can be used to suggest variety. The journal does not train targeting or invent tactics.")
	_add_readout("Current session", "Completed rounds will be summarized here after the native save layer records them.")


func _build_challenges_page() -> void:
	_add_explanation("Quick drills reuse the same fleet controller.")
	for shape in ["grid", "ring", "wedge", "double_orbit", "heart"]:
		var shape_name := StringName(shape)
		_add_button("%s DRILL" % shape.to_upper(), func() -> void:
			formation_requested.emit(shape_name)
			launch_requested.emit()
		)


func _build_saves_page() -> void:
	_add_explanation("Godot saves settings as JSON under user://. It never deserializes arbitrary objects or connects to real aircraft.")
	_add_button("SAVE CURRENT SETUP", func() -> void: save_requested.emit())
	_add_button("LOAD SAVED SETUP", func() -> void: load_requested.emit())
	_add_readout("Branch safety", "This native port lives only on the godot branch. The browser game remains available as a reference under /dist.")


func _on_search_submitted(query: String) -> void:
	var needle := query.strip_edges().to_lower()
	if needle.is_empty():
		return
	var matches := {
		"launch": "Arena", "land": "Arena", "formation": "Arena", "battle": "Squads",
		"combat": "Squads", "boid": "Program", "influence": "Program", "camera": "Director",
		"fpv": "Director", "survivor": "Director", "planet": "Physics", "moon": "Physics",
		"mars": "Physics", "replay": "Replays", "slow": "Replays", "save": "Saves",
		"battery": "Nerd Lab", "math": "Nerd Lab", "art": "Art Studio",
	}
	for keyword in matches:
		if needle.contains(keyword):
			_show_page(matches[keyword])
			return


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_SLASH:
			_search.grab_focus()
		elif event.keycode == KEY_H:
			toggle_interface()


func _add_top_button(parent: Container, text: String, callback: Callable) -> void:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(90, 42)
	button.pressed.connect(callback)
	parent.add_child(button)


func _add_button(text: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size.y = 38
	button.pressed.connect(callback)
	_inspector.add_child(button)
	return button


func _add_button_to(parent: Container, text: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.pressed.connect(callback)
	parent.add_child(button)
	return button


func _add_explanation(text: String) -> void:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_color_override("font_color", Color("b4c8d3"))
	_inspector.add_child(label)


func _add_readout(title: String, text: String) -> Label:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _panel_style(Color("0d2030b8"), Color("1c4158")))
	var box := VBoxContainer.new()
	panel.add_child(box)
	var heading := Label.new()
	heading.text = title.to_upper()
	heading.add_theme_color_override("font_color", Color("62efff"))
	box.add_child(heading)
	var body := Label.new()
	body.text = text
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.add_theme_color_override("font_color", Color("b8cbd5"))
	box.add_child(body)
	_inspector.add_child(panel)
	return body


func _add_slider(title: String, value: float, minimum: float, maximum: float, callback: Callable) -> void:
	var row := VBoxContainer.new()
	var label := Label.new()
	label.text = "%s  %.2f" % [title, value]
	row.add_child(label)
	var slider := HSlider.new()
	slider.min_value = minimum
	slider.max_value = maximum
	slider.step = 0.05
	slider.value = value
	slider.value_changed.connect(func(new_value: float) -> void:
		label.text = "%s  %.2f" % [title, new_value]
		callback.call(new_value)
	)
	row.add_child(slider)
	_inspector.add_child(row)


func _option(items: Array) -> OptionButton:
	var option := OptionButton.new()
	for item in items:
		option.add_item(String(item).replace("_", " ").capitalize())
		option.set_item_metadata(option.item_count - 1, String(item))
	# Use the original machine name when a caller asks for the selected text.
	for index in option.item_count:
		option.set_item_text(index, String(items[index]))
	return option


func _select_option(option: OptionButton, wanted: String) -> void:
	for index in option.item_count:
		if String(option.get_item_metadata(index)) == wanted or option.get_item_text(index) == wanted:
			option.select(index)
			return


func _dictionary(value: Variant) -> Dictionary:
	return value if value is Dictionary else {}


func _panel_style(color: Color, border: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border
	style.set_border_width_all(1)
	style.set_corner_radius_all(4)
	style.content_margin_left = 8
	style.content_margin_right = 8
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	return style

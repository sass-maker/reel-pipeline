"""Render bounded literal lyric plates from a validated Fleet JSON manifest."""

import argparse
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector


PALETTES = {
    "midnight-gold": {
        "world": (0.015, 0.025, 0.08, 1),
        "primary": (1.0, 0.45, 0.08, 1),
        "secondary": (0.08, 0.35, 0.8, 1),
    },
    "blue-silver": {
        "world": (0.008, 0.025, 0.07, 1),
        "primary": (0.35, 0.72, 1.0, 1),
        "secondary": (0.75, 0.84, 1.0, 1),
    },
    "violet-cyan": {
        "world": (0.025, 0.01, 0.065, 1),
        "primary": (0.55, 0.18, 1.0, 1),
        "secondary": (0.05, 0.85, 0.9, 1),
    },
    "paper-ink": {
        "world": (0.72, 0.66, 0.52, 1),
        "primary": (0.55, 0.12, 0.055, 1),
        "secondary": (0.035, 0.22, 0.2, 1),
    },
}

STYLE_SETTINGS = {
    "cosmic-shrine": {"palette": "midnight-gold", "camera": "gentle-orbit"},
    "brutalist-monument": {"palette": "blue-silver", "camera": "static"},
    "glass-studio": {"palette": "violet-cyan", "camera": "slow-push"},
    "low-poly-valley": {"palette": "midnight-gold", "camera": "slow-push"},
    "organic-bloom": {"palette": "violet-cyan", "camera": "gentle-orbit"},
    "kinetic-sculpture": {"palette": "blue-silver", "camera": "gentle-orbit"},
    "neon-tunnel": {"palette": "violet-cyan", "camera": "slow-push"},
    "paper-diorama": {"palette": "paper-ink", "camera": "static"},
}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    return parser.parse_args(argv)


def material(name, color, emission=0.0, metallic=0.0, roughness=0.45):
    item = bpy.data.materials.new(name)
    item.diffuse_color = color
    item.use_nodes = True
    principled = item.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    if emission:
        principled.inputs["Emission Color"].default_value = color
        principled.inputs["Emission Strength"].default_value = emission
    return item


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for item in list(bpy.data.materials):
        bpy.data.materials.remove(item)


def point_at(item, target=(0, 1.8, 0.8)):
    item.rotation_euler = (Vector(target) - item.location).to_track_quat("-Z", "Y").to_euler()


def add_camera(camera_mode, visual_style):
    positions = {
        "cosmic-shrine": (0, -16.5, 3.2),
        "brutalist-monument": (7.2, -18.0, 6.2),
        "glass-studio": (0, -14.5, 2.8),
        "low-poly-valley": (0, -18.5, 5.8),
        "organic-bloom": (4.8, -15.0, 3.6),
        "kinetic-sculpture": (5.6, -16.0, 4.2),
        "neon-tunnel": (0, -17.5, 1.2),
        "paper-diorama": (5.8, -17.0, 5.2),
    }
    bpy.ops.object.camera_add(location=positions.get(visual_style, (0, -15.5, 2.4)))
    camera = bpy.context.object
    camera.data.lens = 58 if camera_mode == "slow-push" else 48
    point_at(camera, (0, 2.2, 0.7))
    bpy.context.scene.camera = camera


def add_light(palette, visual_style):
    bpy.ops.object.light_add(type="AREA", location=(0, -4, 8))
    key = bpy.context.object
    key.data.energy = 1450 if visual_style != "paper-diorama" else 950
    key.data.shape = "DISK"
    key.data.size = 8
    key.data.color = palette["primary"][:3]
    point_at(key, (0, 1.5, 0))
    bpy.ops.object.light_add(type="AREA", location=(5, 1, 2))
    rim = bpy.context.object
    rim.data.energy = 1050
    rim.data.color = palette["secondary"][:3]
    rim.data.size = 5
    point_at(rim, (0, 1.5, 0.5))
    bpy.ops.object.light_add(type="POINT", location=(-4, -1, 1.5))
    fill = bpy.context.object
    fill.data.energy = 450
    fill.data.color = palette["primary"][:3]


def add_star(index, palette):
    angle = (index * 2.399963) % (2 * math.pi)
    radius = 2.0 + (index % 4) * 0.8
    x = math.cos(angle) * radius
    z = 2.0 + math.sin(angle * 1.7) * 3.0
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.12 + (index % 3) * 0.05, location=(x, 1.5, z))
    star = bpy.context.object
    star.data.materials.append(material(f"star-{index}", palette["primary"], emission=7.0))


def add_world(palette):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=5.8, location=(0, 4.4, -4.2))
    globe = bpy.context.object
    globe.data.materials.append(material("world", palette["secondary"], metallic=0.15, roughness=0.55))


def add_diamond(palette):
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=1.5, radius2=0.0, depth=2.4, location=(0, 1.4, 1.4))
    top = bpy.context.object
    top.rotation_euler[2] = math.radians(45)
    top.data.materials.append(material("diamond-top", palette["secondary"], metallic=0.75, roughness=0.12))
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=1.5, radius2=0.0, depth=1.35, location=(0, 1.4, -0.46), rotation=(math.pi, 0, math.radians(45)))
    bottom = bpy.context.object
    bottom.data.materials.append(material("diamond-bottom", palette["primary"], metallic=0.7, roughness=0.13))


def add_traveller(palette):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.42, location=(0, 0.8, 1.4))
    head = bpy.context.object
    head.data.materials.append(material("traveller-head", palette["primary"], roughness=0.7))
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.52, depth=2.3, location=(0, 0.8, 0.0))
    body = bpy.context.object
    body.data.materials.append(material("traveller-body", palette["secondary"], roughness=0.65))


def add_road(palette):
    bpy.ops.mesh.primitive_plane_add(size=16, location=(0, 2.5, -1.3))
    road = bpy.context.object
    road.scale.x = 0.35
    road.data.materials.append(material("road", (0.08, 0.09, 0.12, 1), roughness=0.9))
    bpy.ops.mesh.primitive_cube_add(location=(0, 2.4, -1.15), scale=(0.035, 6, 0.015))
    line = bpy.context.object
    line.data.materials.append(material("road-line", palette["primary"], emission=1.0))


def add_heart(palette):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, location=(-0.58, 1.2, 0.8), scale=(0.8, 0.55, 1.05))
    left = bpy.context.object
    left.data.materials.append(material("heart-left", palette["primary"], roughness=0.35))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, location=(0.58, 1.2, 0.8), scale=(0.8, 0.55, 1.05))
    right = bpy.context.object
    right.data.materials.append(material("heart-right", palette["primary"], roughness=0.35))


def add_floor(palette, color=None):
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 2.5, -1.5))
    floor = bpy.context.object
    floor.data.materials.append(material("floor", color or palette["world"], metallic=0.05, roughness=0.8))


def add_cosmic_shrine(palette):
    add_floor(palette)
    add_world(palette)
    for index in range(30):
        add_star(index, palette)
    for radius, height in [(2.5, -0.8), (1.8, -0.2), (1.1, 0.4)]:
        bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=0.08, location=(0, 1.4, height), rotation=(math.radians(90), 0, 0))
        bpy.context.object.data.materials.append(material(f"shrine-ring-{radius}", palette["primary"], emission=3.0, metallic=0.4, roughness=0.18))
    add_diamond(palette)


def add_brutalist_monument(palette):
    add_floor(palette, (0.025, 0.032, 0.045, 1))
    for index, (x, y, z, sx, sy, sz) in enumerate([
        (-2.7, 2.8, 0.1, 1.1, 1.2, 1.6),
        (-0.8, 3.6, 1.0, 0.75, 1.0, 2.5),
        (1.0, 3.0, 0.45, 0.9, 1.35, 1.95),
        (2.8, 4.0, 1.5, 0.65, 0.8, 3.0),
    ]):
        bpy.ops.mesh.primitive_cube_add(location=(x, y, z), scale=(sx, sy, sz))
        block = bpy.context.object
        block.rotation_euler[2] = math.radians((-8, 5, -4, 9)[index])
        block.data.materials.append(material(f"monument-{index}", palette["secondary"] if index % 2 else (0.18, 0.2, 0.24, 1), metallic=0.12, roughness=0.72))
    bpy.ops.mesh.primitive_cube_add(location=(0, 1.2, -0.7), scale=(4.8, 1.5, 0.35))
    bpy.context.object.data.materials.append(material("monument-plinth", (0.055, 0.06, 0.075, 1), roughness=0.78))


def add_glass_studio(palette):
    add_floor(palette, (0.015, 0.025, 0.04, 1))
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=2.8, depth=0.5, location=(0, 2.2, -1.15))
    bpy.context.object.data.materials.append(material("glass-pedestal", palette["secondary"], metallic=0.75, roughness=0.08))
    add_diamond(palette)
    for index, location in enumerate([(-2.4, 2.2, 0.7), (2.3, 2.7, 1.5), (-1.2, 4.0, 2.8), (1.4, 4.5, 0.2)]):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=0.45 + index * 0.12, location=location)
        bpy.context.object.data.materials.append(material(f"glass-orb-{index}", palette["primary"] if index % 2 else palette["secondary"], emission=0.35, metallic=0.68, roughness=0.08))


def add_low_poly_valley(palette):
    add_floor(palette, (0.035, 0.06, 0.05, 1))
    random.seed(31)
    for index in range(18):
        x = -6.5 + (index % 6) * 2.6
        y = 1.5 + (index // 6) * 3.1
        height = 2.2 + random.random() * 3.4
        bpy.ops.mesh.primitive_cone_add(vertices=5 + index % 3, radius1=1.4 + random.random(), radius2=0, depth=height, location=(x, y, -1.5 + height / 2))
        bpy.context.object.data.materials.append(material(f"valley-{index}", palette["secondary"] if index % 3 else palette["primary"], roughness=0.82))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1.2, location=(3.8, 7.2, 5.4))
    bpy.context.object.data.materials.append(material("valley-sun", palette["primary"], emission=5.5, roughness=0.2))


def add_organic_bloom(palette):
    add_floor(palette, (0.025, 0.045, 0.035, 1))
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.22, depth=4.8, location=(0, 2.4, 0.8))
    bpy.context.object.data.materials.append(material("bloom-stem", (0.08, 0.45, 0.22, 1), roughness=0.58))
    for index in range(12):
        angle = index * (2 * math.pi / 12)
        location = (math.cos(angle) * 1.5, 2.4 + math.sin(angle) * 0.35, 3.2 + math.sin(angle) * 1.5)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, location=location, scale=(0.42, 0.22, 1.15), rotation=(0, angle, angle))
        bpy.context.object.data.materials.append(material(f"petal-{index}", palette["primary"] if index % 2 else palette["secondary"], emission=0.18, roughness=0.34))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=0.72, location=(0, 2.25, 3.2))
    bpy.context.object.data.materials.append(material("bloom-core", palette["primary"], emission=2.2, roughness=0.3))


def add_kinetic_sculpture(palette):
    add_floor(palette, (0.02, 0.025, 0.035, 1))
    for index in range(7):
        bpy.ops.mesh.primitive_torus_add(major_radius=1.1 + index * 0.27, minor_radius=0.075 + index * 0.012, location=(0, 2.3, 0.7 + index * 0.35), rotation=(math.radians(72 + index * 9), math.radians(index * 17), math.radians(index * 23)))
        bpy.context.object.data.materials.append(material(f"kinetic-ring-{index}", palette["primary"] if index % 2 else palette["secondary"], emission=0.4, metallic=0.82, roughness=0.12))
    for index, location in enumerate([(-2.6, 2.0, 0.0), (2.7, 2.8, 1.4), (0.6, 4.6, 3.5)]):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=0.55 + index * 0.18, location=location)
        bpy.context.object.data.materials.append(material(f"kinetic-orb-{index}", palette["secondary"], metallic=0.72, roughness=0.14))


def add_neon_tunnel(palette):
    add_floor(palette, (0.008, 0.008, 0.018, 1))
    for index in range(15):
        y = 0.2 + index * 0.72
        radius = 3.5 - index * 0.11
        bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=0.055, location=(0, y, 0.9), rotation=(math.radians(90), 0, math.radians(index * 7)))
        bpy.context.object.data.materials.append(material(f"tunnel-{index}", palette["primary"] if index % 2 else palette["secondary"], emission=6.0, metallic=0.35, roughness=0.2))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=0.75, location=(0, 8.8, 0.9))
    bpy.context.object.data.materials.append(material("tunnel-core", palette["primary"], emission=8.0, roughness=0.15))


def add_paper_diorama(palette):
    add_floor(palette, (0.48, 0.41, 0.3, 1))
    colors = [palette["secondary"], palette["primary"], (0.78, 0.64, 0.4, 1), (0.28, 0.42, 0.34, 1)]
    for layer in range(7):
        z = -1.15 + layer * 0.48
        y = 6.2 - layer * 0.7
        bpy.ops.mesh.primitive_cube_add(location=(0, y, z), scale=(5.6 - layer * 0.38, 0.22, 0.28 + layer * 0.05))
        block = bpy.context.object
        block.rotation_euler[2] = math.radians(-5 + layer * 1.7)
        block.data.materials.append(material(f"paper-layer-{layer}", colors[layer % len(colors)], roughness=0.94))
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=1.6, fill_type="NGON", location=(2.8, 6.0, 3.8), rotation=(math.radians(90), 0, 0))
    bpy.context.object.data.materials.append(material("paper-sun", palette["primary"], roughness=0.92))


def build_objects(objects, palette, visual_style):
    builders = {
        "cosmic-shrine": add_cosmic_shrine,
        "brutalist-monument": add_brutalist_monument,
        "glass-studio": add_glass_studio,
        "low-poly-valley": add_low_poly_valley,
        "organic-bloom": add_organic_bloom,
        "kinetic-sculpture": add_kinetic_sculpture,
        "neon-tunnel": add_neon_tunnel,
        "paper-diorama": add_paper_diorama,
    }
    if visual_style in builders:
        builders[visual_style](palette)
        return
    if "world" in objects:
        add_world(palette)
    if "diamond" in objects:
        add_diamond(palette)
    if "traveller" in objects:
        add_traveller(palette)
    if "road" in objects:
        add_road(palette)
    if "heart" in objects:
        add_heart(palette)
    star_count = 22 if "star" in objects else 12
    for index in range(star_count):
        add_star(index, palette)
    if not set(objects).intersection({"star", "world", "diamond", "traveller", "road", "heart"}):
        bpy.ops.mesh.primitive_torus_add(major_radius=1.7, minor_radius=0.16, location=(0, 1.6, 0.6))
        bpy.context.object.data.materials.append(material("subject", palette["secondary"], metallic=0.45, roughness=0.2))


def render_scene(scene_manifest, root, width, height, samples):
    clear_scene()
    visual_style = scene_manifest.get("visualStyle", "cosmic-shrine")
    settings = STYLE_SETTINGS.get(visual_style, STYLE_SETTINGS["cosmic-shrine"])
    palette = PALETTES[settings["palette"]]
    world = bpy.context.scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = palette["world"]
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6 if visual_style == "paper-diorama" else 0.24
    random.seed(scene_manifest["seed"])
    add_camera(scene_manifest.get("camera") or settings["camera"], visual_style)
    add_light(palette, visual_style)
    build_objects(scene_manifest["objects"], palette, visual_style)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str((root / scene_manifest["output"]).resolve())
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = str((root / scene_manifest["output"]).resolve())
    scene.render.resolution_percentage = 100
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.filepath = str((root / scene_manifest["output"]).resolve())
    bpy.ops.render.render(write_still=True)


def main():
    args = parse_args()
    manifest_path = Path(args.manifest).resolve()
    root = manifest_path.parent
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema") != "fleet.blender-literal-scenes.v1":
        raise ValueError("unsupported Blender scene manifest")
    for scene in manifest["scenes"]:
        output = (root / scene["output"]).resolve()
        if root not in output.parents:
            raise ValueError("output path escapes run directory")
        output.parent.mkdir(parents=True, exist_ok=True)
        render_scene(scene, root, manifest["width"], manifest["height"], manifest["samples"])
        print(f"FLEET_BLENDER_PROGRESS {scene['id']} {scene['output']}", flush=True)


if __name__ == "__main__":
    main()

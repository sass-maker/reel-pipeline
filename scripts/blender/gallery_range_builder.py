"""Render the eight Explore Gallery Blender motion proofs on Blender 5.2."""

import argparse
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy


STYLES = [
    "cosmic-shrine",
    "brutalist-monument",
    "glass-studio",
    "low-poly-valley",
    "organic-bloom",
    "kinetic-sculpture",
    "neon-tunnel",
    "paper-diorama",
]
FRAME_END = 30


def load_literal_builder():
    builder_path = Path(__file__).with_name("literal_scene_builder.py")
    spec = importlib.util.spec_from_file_location("fleet_literal_scene_builder", builder_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--width", type=int, default=360)
    parser.add_argument("--height", type=int, default=640)
    return parser.parse_args(argv)


def keyframe_transform(item, frame):
    item.keyframe_insert(data_path="location", frame=frame)
    item.keyframe_insert(data_path="rotation_euler", frame=frame)
    item.keyframe_insert(data_path="scale", frame=frame)


def move_camera(builder, camera, end_location, target=(0, 2.2, 0.7)):
    keyframe_transform(camera, 1)
    camera.location = end_location
    builder.point_at(camera, target)
    keyframe_transform(camera, FRAME_END)


def animate_style(builder, visual_style):
    camera = bpy.context.scene.camera
    if visual_style == "cosmic-shrine":
        move_camera(builder, camera, (3.1, -14.5, 4.0), (0, 1.5, 0.8))
        for item in bpy.data.objects:
            if item.name.startswith("Torus") or "shrine" in item.name.lower():
                item.keyframe_insert(data_path="rotation_euler", frame=1)
                item.rotation_euler[2] += math.radians(100)
                item.keyframe_insert(data_path="rotation_euler", frame=FRAME_END)
    elif visual_style == "brutalist-monument":
        move_camera(builder, camera, (4.6, -14.2, 4.7), (0, 3.0, 0.8))
        for item in bpy.data.objects:
            if item.name.startswith("Cube") and item.name != "monument-plinth":
                final_z = item.location.z
                item.location.z = final_z - 3.2
                item.keyframe_insert(data_path="location", frame=1)
                item.location.z = final_z
                item.keyframe_insert(data_path="location", frame=18)
    elif visual_style == "glass-studio":
        move_camera(builder, camera, (0.8, -10.8, 2.5), (0, 2.2, 0.5))
        for item in bpy.data.objects:
            if "diamond" in item.name.lower() or item.name.startswith("Cone"):
                item.keyframe_insert(data_path="rotation_euler", frame=1)
                item.rotation_euler[2] += math.radians(150)
                item.keyframe_insert(data_path="rotation_euler", frame=FRAME_END)
    elif visual_style == "low-poly-valley":
        move_camera(builder, camera, (0.7, -9.5, 3.6), (0, 5.6, 0.4))
    elif visual_style == "organic-bloom":
        move_camera(builder, camera, (-3.7, -12.5, 4.2), (0, 2.4, 2.0))
        for item in bpy.data.objects:
            if item.name.startswith("Sphere") and item.name != "bloom-core":
                final_scale = item.scale.copy()
                item.scale = final_scale * 0.06
                item.keyframe_insert(data_path="scale", frame=1)
                item.scale = final_scale * 1.08
                item.keyframe_insert(data_path="scale", frame=22)
                item.scale = final_scale
                item.keyframe_insert(data_path="scale", frame=FRAME_END)
    elif visual_style == "kinetic-sculpture":
        move_camera(builder, camera, (-4.6, -13.8, 3.4), (0, 2.5, 1.3))
        for index, item in enumerate(bpy.data.objects):
            if item.name.startswith("Torus"):
                item.keyframe_insert(data_path="rotation_euler", frame=1)
                item.rotation_euler[0] += math.radians(80 + index * 9)
                item.rotation_euler[2] += math.radians(150 - index * 7)
                item.keyframe_insert(data_path="rotation_euler", frame=FRAME_END)
    elif visual_style == "neon-tunnel":
        move_camera(builder, camera, (0.25, -5.5, 1.3), (0, 7.0, 0.9))
        camera.data.lens = 38
    elif visual_style == "paper-diorama":
        move_camera(builder, camera, (3.8, -14.4, 4.7), (0, 3.4, 0.7))
        for index, item in enumerate(bpy.data.objects):
            if item.name.startswith("Cube"):
                item.keyframe_insert(data_path="location", frame=1)
                item.location.x += (-1 if index % 2 else 1) * (0.35 + index * 0.05)
                item.location.z += 0.22
                item.keyframe_insert(data_path="location", frame=FRAME_END)

def configure_render(output_path, width, height):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.fps = 12
    scene.frame_start = 1
    scene.frame_end = FRAME_END
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.filepath = str(output_path)


def build_style(builder, visual_style, output_path, width, height):
    builder.clear_scene()
    settings = builder.STYLE_SETTINGS[visual_style]
    palette = builder.PALETTES[settings["palette"]]
    world = bpy.context.scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = palette["world"]
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.65 if visual_style == "paper-diorama" else 0.24
    builder.add_camera(settings["camera"], visual_style)
    builder.add_light(palette, visual_style)
    builder.build_objects(["subject"], palette, visual_style)
    animate_style(builder, visual_style)
    configure_render(output_path, width, height)
    bpy.ops.render.render(animation=True)


def main():
    args = parse_args()
    output_root = Path(args.output).resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    builder = load_literal_builder()
    rendered = []
    for visual_style in STYLES:
        frame_root = output_root / visual_style
        frame_root.mkdir(parents=True, exist_ok=True)
        output_path = frame_root / "frame_"
        build_style(builder, visual_style, output_path, args.width, args.height)
        rendered.append(str(frame_root))
        print(f"FLEET_BLENDER_RANGE {visual_style} {frame_root}", flush=True)
    print(json.dumps({"renderer": "blender-eevee-animation@1", "rendered": rendered}), flush=True)


if __name__ == "__main__":
    main()

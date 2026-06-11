#!/usr/bin/env python3
"""Slice generated atlases into normalized Phaser sprite strips and backgrounds."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


FRAME_SIZE = 64


def split_grid(image: Image.Image, columns: int, rows: int) -> list[list[Image.Image]]:
    grid: list[list[Image.Image]] = []
    for row in range(rows):
        row_images: list[Image.Image] = []
        for column in range(columns):
            left = round(column * image.width / columns)
            right = round((column + 1) * image.width / columns)
            top = round(row * image.height / rows)
            bottom = round((row + 1) * image.height / rows)
            inset_x = max(2, round((right - left) * 0.025))
            inset_y = max(2, round((bottom - top) * 0.025))
            row_images.append(
                image.crop(
                    (
                        left + inset_x,
                        top + inset_y,
                        right - inset_x,
                        bottom - inset_y,
                    )
                )
            )
        grid.append(row_images)
    return grid


def content(image: Image.Image) -> Image.Image | None:
    alpha = image.getchannel("A").point(lambda value: 255 if value > 18 else 0)
    bbox = alpha.getbbox()
    return image.crop(bbox) if bbox else None


def normalize_frames(
    images: list[Image.Image],
    count: int,
    shared_scale: float | None = None,
    padding: int = 3,
    reject_small_artifacts: bool = False,
) -> tuple[list[Image.Image], float]:
    cropped = [content(image) for image in images[:count]]
    if reject_small_artifacts:
        areas = sorted(image.width * image.height for image in cropped if image is not None)
        if areas:
            median_area = areas[len(areas) // 2]
            cropped = [
                image
                if image is not None and image.width * image.height >= median_area * 0.28
                else None
                for image in cropped
            ]
    populated = [image for image in cropped if image is not None]
    if not populated:
        raise RuntimeError("No sprite content detected in requested atlas row")

    max_width = max(image.width for image in populated)
    max_height = max(image.height for image in populated)
    scale = shared_scale or min(
        (FRAME_SIZE - padding * 2) / max_width,
        (FRAME_SIZE - padding * 2) / max_height,
    )

    normalized: list[Image.Image] = []
    fallback = populated[0]
    for image in cropped:
        source = image or (normalized[-1] if normalized else fallback)
        if source.size == (FRAME_SIZE, FRAME_SIZE):
            normalized.append(source.copy())
            continue
        width = max(1, round(source.width * scale))
        height = max(1, round(source.height * scale))
        if width > FRAME_SIZE - padding * 2 or height > FRAME_SIZE - padding * 2:
            local_scale = min(
                (FRAME_SIZE - padding * 2) / source.width,
                (FRAME_SIZE - padding * 2) / source.height,
            )
            width = max(1, round(source.width * local_scale))
            height = max(1, round(source.height * local_scale))
        resized = source.resize((width, height), Image.Resampling.NEAREST)
        frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
        x = (FRAME_SIZE - width) // 2
        y = FRAME_SIZE - height - padding
        frame.alpha_composite(resized, (x, y))
        normalized.append(frame)
    return normalized, scale


def make_strip(frames: list[Image.Image], destination: Path) -> Image.Image:
    strip = Image.new("RGBA", (FRAME_SIZE * len(frames), FRAME_SIZE), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * FRAME_SIZE, 0))
    destination.parent.mkdir(parents=True, exist_ok=True)
    strip.save(destination)
    return strip


def make_preview(strips: list[tuple[str, Image.Image]], destination: Path) -> None:
    width = max(strip.width for _, strip in strips)
    row_height = FRAME_SIZE + 24
    preview = Image.new("RGBA", (width, row_height * len(strips)), (20, 22, 24, 255))
    draw = ImageDraw.Draw(preview)
    for row, (label, strip) in enumerate(strips):
        y = row * row_height
        preview.alpha_composite(strip, (0, y + 20))
        draw.text((5, y + 3), label, fill=(244, 238, 229, 255))
    destination.parent.mkdir(parents=True, exist_ok=True)
    preview.save(destination)


def process_player(source: Path, output: Path) -> list[tuple[str, Image.Image]]:
    grid = split_grid(Image.open(source).convert("RGBA"), 8, 5)
    requested = [
        ("player-idle", 0, 4),
        ("player-run", 1, 8),
        ("player-jump", 2, 4),
        ("player-hurt", 3, 4),
        ("player-celebrate", 4, 4),
    ]

    all_content = [
        item
        for _, row, count in requested
        for item in (content(image) for image in grid[row][:count])
        if item is not None
    ]
    shared_scale = min(
        (FRAME_SIZE - 6) / max(image.width for image in all_content),
        (FRAME_SIZE - 6) / max(image.height for image in all_content),
    )

    strips: list[tuple[str, Image.Image]] = []
    for name, row, count in requested:
        frames, _ = normalize_frames(
            grid[row],
            count,
            shared_scale,
            reject_small_artifacts=True,
        )
        strips.append((name, make_strip(frames, output / f"{name}.png")))
    return strips


def process_entities(source: Path, output: Path) -> list[tuple[str, Image.Image]]:
    grid = split_grid(Image.open(source).convert("RGBA"), 8, 4)
    strips: list[tuple[str, Image.Image]] = []
    for name, row, count in [
        ("agent-run", 0, 6),
        ("drone-hover", 1, 6),
        ("objects", 2, 8),
        ("effects", 3, 8),
    ]:
        frames, _ = normalize_frames(grid[row], count)
        strips.append((name, make_strip(frames, output / f"{name}.png")))
    return strips


def process_backgrounds(source: Path, output: Path) -> None:
    image = Image.open(source).convert("RGB")
    names = ["desert", "archive", "launch"]
    output.mkdir(parents=True, exist_ok=True)
    for index, name in enumerate(names):
        left = round(index * image.width / 3)
        right = round((index + 1) * image.width / 3)
        panel = image.crop((left, 0, right, image.height))
        panel = panel.resize((512, 512), Image.Resampling.NEAREST)
        panel.save(output / f"{name}.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--player", type=Path, required=True)
    parser.add_argument("--entities", type=Path, required=True)
    parser.add_argument("--backgrounds", type=Path, required=True)
    parser.add_argument("--sprite-output", type=Path, required=True)
    parser.add_argument("--background-output", type=Path, required=True)
    parser.add_argument("--preview", type=Path, required=True)
    args = parser.parse_args()

    strips = process_player(args.player, args.sprite_output)
    strips.extend(process_entities(args.entities, args.sprite_output))
    process_backgrounds(args.backgrounds, args.background_output)
    make_preview(strips, args.preview)


if __name__ == "__main__":
    main()

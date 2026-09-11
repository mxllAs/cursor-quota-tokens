from PIL import Image, ImageDraw, ImageFont
import math

size = 256
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Background gradient rounded rect
for r in range(120, 0, -1):
    alpha = int(255 * (1 - (r / 120) * 0.3))
    color = (15 + int(15 * (1 - r/120)), 23 + int(20 * (1 - r/120)), 42 + int(40 * (1 - r/120)), 255)
    draw.rounded_rectangle([10, 10, 246, 246], radius=48, fill=(15, 23, 42, 255), outline=(56, 189, 248, 120), width=3)

# Glowing circle
cx, cy = 128, 128
for radius in range(85, 60, -2):
    glow_alpha = int(18 * (85 - radius) / 25)
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], outline=(56, 189, 248, glow_alpha), width=2)

# Central circular gauge
draw.ellipse([cx - 65, cy - 65, cx + 65, cy + 65], outline=(255, 255, 255, 25), width=10)
# Gauge fill (arc)
draw.arc([cx - 65, cy - 65, cx + 65, cy + 65], start=-90, end=190, fill=(56, 189, 248, 255), width=10)

# Lightning bolt in center
# Points for bolt
bolt = [
    (cx + 6, cy - 40),
    (cx - 28, cy + 5),
    (cx - 2, cy + 5),
    (cx - 6, cy + 42),
    (cx + 28, cy - 3),
    (cx + 2, cy - 3),
]
draw.polygon(bolt, fill=(255, 255, 255, 255))
draw.polygon([(x+1, y+1) for x, y in bolt], outline=(56, 189, 248, 255), width=2)

# Save
img.save(r'e:\agy-Plugin\cursor-quota-tokens\images\icon.png', 'PNG')
print('Icon generated successfully!')

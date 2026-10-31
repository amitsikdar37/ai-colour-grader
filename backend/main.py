import io
from PIL import Image
import numpy as np
import asyncio
import base64
import json
import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

# Always load .env relative to this file's directory
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

app = FastAPI(title="Cinematic AI Color Engine Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = genai.Client()

class ColorProfile(BaseModel):
    title: str = Field(description="Name of the look (e.g., 'Warm Narrative 35mm')")
    rationale: str = Field(description="Why this grade fits the scene composition and lighting")
    slope: list[float] = Field(description="RGB gain multipliers [0.80 to 1.20]", min_length=3, max_length=3)
    offset: list[float] = Field(description="RGB shadow shifts [-0.04 to 0.04]", min_length=3, max_length=3)
    power: list[float] = Field(description="RGB midtone exponents [0.80 to 1.22]", min_length=3, max_length=3)
    shadow_tint_rgb: list[float] = Field(description="Normalized shadow tint [0.28 to 0.72]", min_length=3, max_length=3)
    highlight_tint_rgb: list[float] = Field(description="Normalized highlight tint [0.28 to 0.72]", min_length=3, max_length=3)
    saturation: float = Field(description="Global saturation [0.75 to 1.25]", ge=0.75, le=1.25)

class GradeResponse(BaseModel):
    profiles: list[ColorProfile] = Field(description="Exactly 3 distinct cinematic looks", min_length=3, max_length=3)

class GradeRequest(BaseModel):
    image_base64: str

# Fast, stable models first so requests finish in < 2s, followed by fallbacks
FALLBACK_MODELS = [
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
]

def extract_image_scopes(image_bytes: bytes) -> str:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((256, 256))
    arr = np.asarray(img, dtype=np.float32) / 255.0

    # 1. Luminance & Dynamic Range Percentiles
    luma = 0.2126 * arr[:, :, 0] + 0.7152 * arr[:, :, 1] + 0.0722 * arr[:, :, 2]
    p2, p50, p98 = np.percentile(luma, [2, 50, 98])
    dynamic_range_span = (p98 - p2) * 100.0

    # 2. Extract Midtone RGB (Luma between 0.20 and 0.75)
    mid_mask = (luma > 0.20) & (luma < 0.75)
    if np.any(mid_mask):
        mr = float(arr[:, :, 0][mid_mask].mean())
        mg = float(arr[:, :, 1][mid_mask].mean())
        mb = float(arr[:, :, 2][mid_mask].mean())
    else:
        mr = float(arr[:, :, 0].mean())
        mg = float(arr[:, :, 1].mean())
        mb = float(arr[:, :, 2].mean())

    # 3. Continuous Chromaticity Ratios (Zero Hardcoded Cutoffs)
    # R/B ratio represents Color Temperature (Kelvin scale):
    # > 1.0 = Warm / Tungsten | < 1.0 = Cool / Daylight
    rb_ratio = mr / max(mb, 0.001)

    # Green Tint Index (Green vs Magenta balance):
    # > 1.05 = Fluorescent Green bias | < 0.95 = Magenta bias
    green_index = mg / max((mr + mb) * 0.5, 0.001)

    # 4. Deep Black & Specular White Analysis
    black_floor_status = "Crushed/Deep (keep offset >= 0.0)" if p2 < 0.03 else "Hazy/Lifted (use negative offset to anchor)"
    white_headroom = "Blown highlights" if p98 > 0.96 else "Clean highlight headroom"

    return (
        f"EXACT DIGITAL SCOPES TELEMETRY:\n"
        f"- Dynamic Range Span: {dynamic_range_span:.1f}% (P2 Black: {p2:.3f}, P50 Median: {p50:.3f}, P98 White: {p98:.3f})\n"
        f"- Midtone Absolute RGB: R={mr:.3f}, G={mg:.3f}, B={mb:.3f}\n"
        f"- Warmth Ratio (R/B): {rb_ratio:.2f} (1.00 = Neutral. Higher = Warmer ambient cast, Lower = Cooler ambient cast)\n"
        f"- Green/Magenta Tint Ratio: {green_index:.2f} (1.00 = Balanced. >1.05 = Greenish cast)\n"
        f"- Tonal Characteristics: {black_floor_status} | {white_headroom}\n\n"
        f"COLORIST DIRECTIVE:\n"
        f"Calculate `slope` inversely proportional to the Warmth Ratio (R/B): "
        f"If R/B is high (e.g. 1.35), cool down the slope (decrease Red slope, elevate Blue slope). "
        f"If R/B is low (e.g. 0.85), warm up the slope to protect natural skin tones. "
        f"If P2 < 0.03, set `offset` between -0.005 and 0.005 so night skies remain ink-black."
    )

SYSTEM_PROMPT = """You are an elite Hollywood Digital Intermediate (DI) colorist.
You are provided with an image AND its exact digital scope telemetry (Black Point, Median Luma, Midtone RGB Ratios, and Detected Color Cast).

CRITICAL COLORIST RULES:
1. PRIMARY WHITE BALANCE FIRST (Using `slope` and `power`):
   - Look at the SCOPES TELEMETRY.
   - If the image has a HEAVY WARM/YELLOW CAST (e.g. night streetlamps, festival lights), DO NOT increase Red/Green slope! Set `slope` to cool down the excess yellow (e.g. `[0.94, 0.98, 1.08]`) so whites recover and colors separate.
   - If the image has a COOL/CYAN INDOOR CAST (e.g. fluorescent walls, indoor portraits), warm up the midtones using `slope` (e.g. `[1.06, 1.00, 0.93]`) and `power` (`[0.95, 1.0, 1.04]`) so human skin looks healthy and warm, never gray or green.
    - If Dynamic Range > 85% OR (P2 < 0.04 and P98 > 0.85) (high-contrast or backlit window scene like a train, car, or direct sunlight), set `power` between [0.88, 0.95] to lift shadow detail, recover hair/fabric textures, and soften harsh side-lighting contrast.
   - If the image is hazy, milky, or flat (low contrast), set `power` between [1.02, 1.15] to snap punchy contrast into the midtones.
2. BLACK FLOOR CONTROL (Using `offset`):
   - If Black Point < 0.03, keep `offset` between `-0.005` and `0.005` so night skies stay ink-black.
   - If Black Point > 0.08 (washed-out haze), use slightly negative `offset` (`-0.02`) to anchor blacks.
3. SPLIT-TONING SUBTLETY:
   - Keep `shadow_tint_rgb` and `highlight_tint_rgb` tightly near neutral (`[0.44 to 0.56]`). Let color contrast come from clean primary balance, not heavy color overlays.

Generate 3 distinct, studio-grade looks tailored to this frame's telemetry:
1. Natural Cinema (Clean white-balanced correction, rich Kodak Vision3 contrast, natural skin).
2. Complementary Contrast (Cool teal shadow separation against warm natural subjects).
3. Soft Archival Film (Gentle contrast, subtle highlight warmth, restrained saturation)."""

OFFLINE_BACKUP_PROFILES = GradeResponse(
    profiles=[
        ColorProfile(
            title="Kodak 2383 Warm Narrative",
            rationale="Gently lifts warm amber highlights and deepens shadows for an authentic Kodak Vision3 analog film print.",
            slope=[1.08, 1.02, 0.94],
            offset=[0.015, 0.0, -0.015],
            power=[0.96, 0.98, 1.03],
            shadow_tint_rgb=[0.54, 0.49, 0.43],
            highlight_tint_rgb=[0.59, 0.53, 0.44],
            saturation=1.04,
        ),
        ColorProfile(
            title="David Fincher Neo-Noir",
            rationale="Isolates deep teal/cyan into shadows while keeping skin midtones clean and neutral for a modern thriller look.",
            slope=[0.95, 1.01, 1.07],
            offset=[-0.02, 0.01, 0.03],
            power=[1.03, 1.0, 0.97],
            shadow_tint_rgb=[0.41, 0.52, 0.58],
            highlight_tint_rgb=[0.53, 0.51, 0.49],
            saturation=0.94,
        ),
        ColorProfile(
            title="16mm Archival Indie",
            rationale="Lifts the toe/black point to soften contrast and rolls off highlights for a faded 16mm indie film print.",
            slope=[0.95, 0.95, 0.93],
            offset=[0.03, 0.02, 0.015],
            power=[0.94, 0.95, 0.96],
            shadow_tint_rgb=[0.52, 0.50, 0.46],
            highlight_tint_rgb=[0.54, 0.52, 0.48],
            saturation=0.88,
        ),
    ]
)

@app.get("/api/health")
async def health_check():
    return {"status": "online", "models": FALLBACK_MODELS}

@app.post("/api/grade")
async def grade_image(req: GradeRequest):
    async def stream_progress():
        raw_b64 = req.image_base64.split(",")[-1]
        image_bytes = base64.b64decode(raw_b64)
        scopes_report = extract_image_scopes(image_bytes)
        print(scopes_report)

        for model_name in FALLBACK_MODELS:
            yield json.dumps({
                "type": "attempting",
                "model": model_name,
                "message": f"Analyzing scene lighting with {model_name}..."
            }) + "\n"

            try:
                # Enforce a 20-second timeout to give complex models sufficient time
                response = await asyncio.wait_for(
                    client.aio.models.generate_content(
                        model=model_name,
                       contents=[
                            types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                            f"{scopes_report}\n\nBased on these exact scopes and the visual scene, output 3 bespoke cinematic color profiles."
                        ],
                        config=types.GenerateContentConfig(
                            system_instruction=SYSTEM_PROMPT,
                            response_mime_type="application/json",
                            response_schema=GradeResponse,
                            temperature=0.2,
                        )
                    ),
                    timeout=20.0
                )

                result = GradeResponse.model_validate_json(response.text)
                print(f"Successfully graded with {model_name}!")
                yield json.dumps({
                    "type": "success",
                    "model": model_name,
                    "profiles": [p.model_dump() for p in result.profiles]
                }) + "\n"
                return

            except asyncio.TimeoutError:
                print(f"Model {model_name} timed out (>20s). Falling back...")
                yield json.dumps({
                    "type": "fallback",
                    "model": model_name,
                    "message": f"{model_name} timed out (>20s). Switching to fallback..."
                }) + "\n"
                continue

            except Exception as e:
                err_str = str(e)
                print(f"Model {model_name} error: {err_str}")
                yield json.dumps({
                    "type": "fallback",
                    "model": model_name,
                    "message": f"{model_name} busy. Switching to fallback..."
                }) + "\n"
                continue

        # If all remote models fail, return offline backup profiles
        print("All models failed. Emitting offline backup profiles.")
        yield json.dumps({
            "type": "success",
            "model": "Offline DI Presets",
            "profiles": [p.model_dump() for p in OFFLINE_BACKUP_PROFILES.profiles]
        }) + "\n"

    return StreamingResponse(stream_progress(), media_type="application/x-ndjson")

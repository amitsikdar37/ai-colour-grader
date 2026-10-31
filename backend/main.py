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
    api_key: str | None = None

# Fast, reliable Flash models verified live against user API key
FALLBACK_MODELS = [
    "gemini-2.5-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
]

def extract_image_scopes(image_bytes: bytes) -> str:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((256, 256))
    arr = np.asarray(img, dtype=np.float32) / 255.0

    # 1. Luminance & Dynamic Range Percentiles
    luma = 0.2126 * arr[:, :, 0] + 0.7152 * arr[:, :, 1] + 0.0722 * arr[:, :, 2]
    p2, p50, p98 = np.percentile(luma, [2, 50, 98])

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

    return (
        f"EXACT DIGITAL SCOPES TELEMETRY:\n"
        f"- Dynamic Range Span: {(p98 - p2) * 100:.1f}% (P2 Black: {p2:.3f}, P50 Median: {p50:.3f}, P98 White: {p98:.3f})\n"
        f"- Midtone Absolute RGB: R={mr:.3f}, G={mg:.3f}, B={mb:.3f}\n"
        f"- Warmth Ratio (R/B): {mr / max(mb, 1e-4):.2f} (1.00 = Neutral)\n"
        f"- Green/Magenta Ratio: {mg / max((mr + mb) * 0.5, 1e-4):.2f} (1.00 = Balanced)\n"
    )

SYSTEM_PROMPT = """You are an elite Hollywood Digital Intermediate (DI) colorist.
You receive an image and its EXACT DIGITAL SCOPES TELEMETRY.
You must output 3 VISUALLY DISTINCT cinematic color profiles. NEVER output identical or near-identical parameters across profiles, and NEVER output [0.5, 0.5, 0.5] for split-toning.

MATHEMATICAL CONTRACT FOR EACH PROFILE:

1. PROFILE 1: "Natural 35mm Print" (Clean White Balance & Crisp Contrast)
   - `slope`: Neutralize the scene's Warmth Ratio (R/B). If R/B > 1.25 (warm cast), cool down slope (e.g. Red < 0.95, Blue > 1.06). If R/B < 0.90 (cool cast), warm up slope (Red > 1.05, Blue < 0.95).
   - `power`: Set between [1.02, 1.08] to give crisp 35mm midtone snap (unless P50 < 0.22, then use [0.94, 0.98]).
   - `offset`: Keep tight to [-0.01, 0.005] for clean black floors.
   - `shadow_tint_rgb`: Subtle cool-neutral shadow depth (e.g. [0.44, 0.49, 0.55]).
   - `highlight_tint_rgb`: Subtle warm print highlight (e.g. [0.56, 0.52, 0.45]).
   - `saturation`: [1.02 to 1.08].

2. PROFILE 2: "Complementary Teal & Amber" (High-Contrast Genre Split)
   - `slope`: Keep closer to balanced/warm highlights (do NOT over-cool the highlights—let the warmth live in the highlights while cooling the shadows).
   - `power`: MUST be high ([1.08 to 1.16]) to trigger strong S-curve contrast and deep midtone density, with per-channel color separation (e.g. [1.06, 1.10, 1.14]).
   - `offset`: Negative black crush ([-0.025 to -0.010]) to carve out dramatic shadow contrast.
   - `shadow_tint_rgb`: MUST push strong cyan/teal into shadows (Red: 0.32–0.38, Green: 0.50–0.54, Blue: 0.62–0.68).
   - `highlight_tint_rgb`: MUST push rich golden amber into highlights (Red: 0.60–0.68, Green: 0.53–0.56, Blue: 0.35–0.42).
   - `saturation`: [1.10 to 1.18].

3. PROFILE 3: "Vintage Golden Archival" (Lifted Matte Blacks, Soft Contrast, Warm Nostalgia)
   - `slope`: Lean INTO warmth—even if the scene is already warm, keep Red >= 1.02 and Blue <= 0.96 for a rich golden-hour / 1970s analog feel.
   - `power`: MUST be low ([0.85 to 0.92]) to open up shadows and create a soft, low-contrast archival curve.
   - `offset`: MUST be positive ([+0.015 to +0.030]) to lift the black floor into a soft matte film toe.
   - `shadow_tint_rgb`: Warm olive/bronze shadow base (e.g. [0.55, 0.52, 0.42]).
   - `highlight_tint_rgb`: Creamy warm highlight roll-off (e.g. [0.62, 0.56, 0.44]).
   - `saturation`: Muted archival chroma ([0.85 to 0.92])."""

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
        user_key = (req.api_key or "").strip()

        # If user did not provide an API key, protect host wallet and return offline presets immediately
        if not user_key:
            print("No user API key provided. Returning instant built-in presets (Zero host API cost).")
            yield json.dumps({
                "type": "success",
                "model": "Built-in DI Presets",
                "profiles": [p.model_dump() for p in OFFLINE_BACKUP_PROFILES.profiles]
            }) + "\n"
            return

        raw_b64 = req.image_base64.split(",")[-1]
        image_bytes = base64.b64decode(raw_b64)
        scopes_report = extract_image_scopes(image_bytes)

        # Initialize GenAI Client using the user's personal API key
        try:
            user_client = genai.Client(api_key=user_key)
        except Exception as e:
            print(f"Error creating client with user key: {e}")
            yield json.dumps({
                "type": "fallback",
                "model": "Key Error",
                "message": "Invalid API key format. Falling back to built-in presets..."
            }) + "\n"
            yield json.dumps({
                "type": "success",
                "model": "Built-in DI Presets",
                "profiles": [p.model_dump() for p in OFFLINE_BACKUP_PROFILES.profiles]
            }) + "\n"
            return

        for model_name in FALLBACK_MODELS:
            yield json.dumps({
                "type": "attempting",
                "model": model_name,
                "message": f"Analyzing scene lighting with {model_name}..."
            }) + "\n"

            try:
                # Enforce a 20-second timeout to give complex models sufficient time
                response = await asyncio.wait_for(
                    user_client.aio.models.generate_content(
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
                print(f"Successfully graded with {model_name} using user key!")
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

        # If all remote models fail with the user's key, return offline backup profiles
        print("All models failed. Emitting offline backup profiles.")
        yield json.dumps({
            "type": "success",
            "model": "Built-in DI Presets",
            "profiles": [p.model_dump() for p in OFFLINE_BACKUP_PROFILES.profiles]
        }) + "\n"

    return StreamingResponse(stream_progress(), media_type="application/x-ndjson")

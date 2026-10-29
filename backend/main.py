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
    slope: list[float] = Field(description="RGB gain multipliers [0.85 to 1.15]", min_length=3, max_length=3)
    offset: list[float] = Field(description="RGB shadow shifts [-0.04 to 0.04]", min_length=3, max_length=3)
    power: list[float] = Field(description="RGB midtone exponents [0.88 to 1.12]", min_length=3, max_length=3)
    shadow_tint_rgb: list[float] = Field(description="Normalized shadow tint [0.35 to 0.65]", min_length=3, max_length=3)
    highlight_tint_rgb: list[float] = Field(description="Normalized highlight tint [0.35 to 0.65]", min_length=3, max_length=3)
    saturation: float = Field(description="Global saturation [0.85 to 1.15]", ge=0.85, le=1.15)

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

SYSTEM_PROMPT = """You are an elite Hollywood Digital Intermediate (DI) colorist. 
Analyze the scene's key lighting, ambient color cast, dynamic range, and subject.
Generate exactly 3 diverse, filmic, and tasteful color grades tailored strictly to this specific frame:
1. Warm Narrative (Kodak 2383 / Vision3 feel, rich amber highlights, deep warm-black shadows).
2. Cool Thriller / Neo-Noir (Teal-tinted shadows, clean neutral midtones, crisp highlights, David Fincher style).
3. Low-Contrast Vintage / Indie (Lifted toe/blacks, soft highlight rolloff, muted saturation, 16mm archival feel).

STRICT RULES:
- Never output extreme adjustments that cause clipping or harsh posterization.
- Midtone values must strictly preserve natural human skin tones.
- Subtlety creates cinematic elegance; aggressive saturation looks amateurish. Keep saturation near neutral (0.85 to 1.15)."""

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
                            "Analyze scene lighting, contrast, and color balance. Output 3 bespoke cinematic color profiles."
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

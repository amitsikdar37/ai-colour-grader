import base64
import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

load_dotenv()

app = FastAPI(title="Cinematic AI Color Engine Backend")

# Allow frontend to call the backend locally
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Google Gen AI client
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

@app.get("/api/health")
async def health_check():
    return {"status": "online", "model": "gemini-3.5-flash"}

@app.post("/api/grade", response_model=GradeResponse)
async def grade_image(req: GradeRequest):
    try:
        # Strip potential data URL prefix
        raw_b64 = req.image_base64.split(",")[-1]
        image_bytes = base64.b64decode(raw_b64)

        response = client.models.generate_content(
            model="gemini-3.5-flash",
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
        )

        return GradeResponse.model_validate_json(response.text)
    except Exception as e:
        print(f"Error during grading: {e}")
        raise HTTPException(status_code=500, detail=str(e))
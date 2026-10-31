import { DEFAULT_UNIFORMS, type ColorProfileUniforms } from "../types/color";

function clamp(val: number, min: number, max: number): number {
    if (isNaN(val) || val === null || val === undefined) return (min + max) / 2;
    return Math.min(Math.max(val, min), max);
}

function clampVector3(
    vec: [number, number, number] | undefined,
    min: number,
    max: number,
    fallback: [number, number, number]
): [number, number, number] {
    if (!vec || !Array.isArray(vec) || vec.length !== 3) return fallback;
    return [
        clamp(vec[0], min, max),
        clamp(vec[1], min, max),
        clamp(vec[2], min, max),
    ];
}

export function sanitizeUniforms(raw: Partial<ColorProfileUniforms> | null | undefined): ColorProfileUniforms {
    if (!raw) return DEFAULT_UNIFORMS;

    return {
        slope: clampVector3(raw.slope, 0.80, 1.20, DEFAULT_UNIFORMS.slope),
        offset: clampVector3(raw.offset, -0.04, 0.04, DEFAULT_UNIFORMS.offset),
        power: clampVector3(raw.power, 0.80, 1.22, DEFAULT_UNIFORMS.power),
        shadow_tint_rgb: clampVector3(raw.shadow_tint_rgb, 0.28, 0.72, DEFAULT_UNIFORMS.shadow_tint_rgb),
        highlight_tint_rgb: clampVector3(raw.highlight_tint_rgb, 0.28, 0.72, DEFAULT_UNIFORMS.highlight_tint_rgb),
        saturation: clamp(raw.saturation ?? 1.0, 0.75, 1.25),
    };
}
export interface ColorProfileUniforms {
  slope: [number, number, number];
  offset: [number, number, number];
  power: [number, number, number];
  shadow_tint_rgb: [number, number, number];
  highlight_tint_rgb: [number, number, number];
  saturation: number;
}

export interface ColorProfile extends ColorProfileUniforms {
  title: string;
  rationale: string;
}

export interface GradeResponse {
  profiles: ColorProfile[];
}

export const DEFAULT_UNIFORMS: ColorProfileUniforms = {
  slope: [1.0, 1.0, 1.0],
  offset: [0.0, 0.0, 0.0],
  power: [1.0, 1.0, 1.0],
  shadow_tint_rgb: [0.5, 0.5, 0.5],
  highlight_tint_rgb: [0.5, 0.5, 0.5],
  saturation: 1.0,
};
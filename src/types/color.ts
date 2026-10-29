export interface ColorProfileUniforms {
  slope: [number, number, number];           // Gain [0.8 to 1.2]
  offset: [number, number, number];          // Lift [-0.05 to 0.05]
  power: [number, number, number];           // Gamma [0.8 to 1.2]
  shadow_tint_rgb: [number, number, number]; // Shadow bias [0.35 to 0.65]
  highlight_tint_rgb: [number, number, number]; // Highlight bias [0.35 to 0.65]
  saturation: number;                        // Global Saturation [0.7 to 1.3]
}

export const DEFAULT_UNIFORMS: ColorProfileUniforms = {
  slope: [1.0, 1.0, 1.0],
  offset: [0.0, 0.0, 0.0],
  power: [1.0, 1.0, 1.0],
  shadow_tint_rgb: [0.5, 0.5, 0.5],
  highlight_tint_rgb: [0.5, 0.5, 0.5],
  saturation: 1.0,
};
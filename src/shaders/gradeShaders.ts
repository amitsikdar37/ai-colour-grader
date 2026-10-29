export const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  void main() {
    v_texCoord = vec2((a_position.x + 1.0) * 0.5, 1.0 - (a_position.y + 1.0) * 0.5);
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

export const FRAGMENT_SHADER_SOURCE = `
  precision highp float;
  varying vec2 v_texCoord;
  uniform sampler2D u_image;

  uniform vec3 u_slope;       // Gain [0.8 to 1.2]
  uniform vec3 u_offset;      // Lift [-0.05 to 0.05]
  uniform vec3 u_power;       // Gamma [0.8 to 1.2]
  uniform vec3 u_shadowTint;  // Shadow bias RGB
  uniform vec3 u_highTint;    // Highlight bias RGB
  uniform float u_saturation; // [0.7 to 1.3]
  uniform float u_intensity;  // Master mix [0.0 to 1.0]

  // sRGB <-> Linear Conversions
  vec3 sRGBToLinear(vec3 c) { return pow(c, vec3(2.2)); }
  vec3 linearTosRGB(vec3 c) { return pow(c, vec3(1.0 / 2.2)); }

  // ACES/AgX approximation for soft highlight rolloff (prevents harsh digital clipping)
  vec3 filmicToneMap(vec3 val) {
      vec3 a = val * (val + 0.0245786) - 0.000090537;
      vec3 b = val * (0.983729 * val + 0.4329510) + 0.238081;
      return clamp(a / b, 0.0, 1.0);
  }

  void main() {
      vec4 raw = texture2D(u_image, v_texCoord);
      vec3 linear = sRGBToLinear(raw.rgb);
      
      // 1. ASC-CDL Equation
      vec3 graded = clamp(linear * u_slope + u_offset, 0.0, 2.0);
      graded = pow(graded, u_power);
      
      // 2. Rec.709 Luminance
      float luma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
      
      // 3. Midtone-Safe Split-Toning
      // Shadows isolate below 0.30 luma; Highlights isolate above 0.70 luma.
      float sMask = smoothstep(0.35, 0.05, luma);
      float hMask = smoothstep(0.65, 0.95, luma);
      
      graded += (u_shadowTint - 0.5) * 0.15 * sMask;
      graded += (u_highTint - 0.5) * 0.15 * hMask;
      
      // 4. Filmic Saturation
      graded = mix(vec3(luma), graded, u_saturation);
      
      // 5. Filmic Highlight Compression Curve (ACES/AgX shoulder)
      graded = filmicToneMap(graded);
      
      // 6. Master Intensity Blend with Raw
      vec3 finalRgb = mix(raw.rgb, linearTosRGB(graded), u_intensity);
      gl_FragColor = vec4(finalRgb, raw.a);
  }
`;
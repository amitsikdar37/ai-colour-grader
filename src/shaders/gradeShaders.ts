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

  uniform vec3 u_slope;
  uniform vec3 u_offset;
  uniform vec3 u_power;
  uniform vec3 u_shadowTint;
  uniform vec3 u_highTint;
  uniform float u_saturation;
  uniform float u_intensity;

  vec3 sRGBToLinear(vec3 c) {
    return pow(max(c, vec3(0.00001)), vec3(2.2));
  }

  vec3 linearTosRGB(vec3 c) {
    return pow(max(c, vec3(0.00001)), vec3(1.0 / 2.2));
  }

  vec3 linearToOklab(vec3 c) {
    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
    float l_ = pow(max(l, 0.000001), 0.3333333);
    float m_ = pow(max(m, 0.000001), 0.3333333);
    float s_ = pow(max(s, 0.000001), 0.3333333);
    return vec3(
      0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
      1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
      0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    );
  }

  vec3 oklabToLinear(vec3 c) {
    float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
    float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
    float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
    float l = l_ * l_ * l_;
    float m = m_ * m_ * m_;
    float s = s_ * s_ * s_;
    return max(vec3(
      +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ), vec3(0.0));
  }

  // Dynamic DI Contrast Curve: Adapts automatically to scene contrast via u_power
  float filmicContrastCurve(float L, vec3 powerVec) {
    float avgPower = (powerVec.r + powerVec.g + powerVec.b) / 3.0;
    // If Gemini sets power > 1.0 (flat scene), sStrength increases up to 0.30.
    // If Gemini sets power <= 0.98 (high-contrast/backlit scene), sStrength drops near 0.04 - 0.06
    // so shadows on hair, faces, and train interiors stay open!
    float sStrength = clamp((avgPower - 0.94) * 1.4, 0.04, 0.30);

    float pivot = 0.55;
    float radius = 0.45;
    float delta = L - pivot;
    float norm = clamp(delta / radius, -1.0, 1.0);
    float weight = 1.0 - norm * norm;
    return clamp(L + delta * sStrength * weight, 0.0, 1.0);
  }

  void main() {
    vec4 raw = texture2D(u_image, v_texCoord);
    vec3 linear = sRGBToLinear(raw.rgb);
    // 1. Optical Lens Falloff / Power Window (Simulates cinema prime lens transmission)
    vec2 centeredUV = v_texCoord - vec2(0.5);
    float distSq = dot(centeredUV, centeredUV);
    float opticalFalloff = 1.0 - smoothstep(0.10, 0.55, distSq) * 0.18;
    linear *= opticalFalloff;

    // 1. Primary ASC-CDL with Adaptive Toe Guard
    float rawLuma = dot(linear, vec3(0.2126, 0.7152, 0.0722));
    // Positive offset is gated near 0.0 so black skies stay black; negative offset can anchor hazy shadows
    vec3 safeOffset = mix(min(u_offset, vec3(0.0)), u_offset, smoothstep(0.0, 0.03, rawLuma));
    vec3 cdl = max(linear * u_slope + safeOffset, vec3(0.0));
    cdl = pow(max(cdl, vec3(0.00001)), u_power);

    // Soft highlight knee before Oklab conversion
    cdl = cdl / (1.0 + max(cdl - vec3(0.82), vec3(0.0)) * 0.65);

    // 2. Convert to Oklab & Polar Oklch
    vec3 lab = linearToOklab(cdl);
    float L = lab.x;
    float chroma = sqrt(lab.y * lab.y + lab.z * lab.z);
    float hue = atan(lab.z, lab.y);

    // 3. Human Skin Vector Protection (Centered around ~0.88 rad in Oklab)
    float isSkinHue = 1.0 - smoothstep(0.16, 0.44, abs(hue - 0.88));
    float isSkinChroma = smoothstep(0.012, 0.030, chroma) * (1.0 - smoothstep(0.14, 0.22, chroma));
    float isSkinLuma = smoothstep(0.22, 0.36, L) * (1.0 - smoothstep(0.76, 0.90, L));
    float skinMask = isSkinHue * isSkinChroma * isSkinLuma;

    // 4. Kodak 2383 Oklch Hue Convergence (3D LUT Emulation)
    // Shifts acidic digital green-yellows toward golden amber, and harsh royal blues toward cinema teal
    float yDelta = (hue - 1.75) / 0.45;
    float yellowBand = exp(-(yDelta * yDelta));
    float bDelta = (hue + 1.65) / 0.50;
    float blueBand = exp(-(bDelta * bDelta));
    float hueShift = (-0.10 * yellowBand - 0.12 * blueBand) * (1.0 - skinMask);
    float convergedHue = hue + hueShift;
    lab.y = chroma * cos(convergedHue);
    lab.z = chroma * sin(convergedHue);

    // 5. Perceptual Split-Toning (Scaled in Oklab so tints are genuinely visible)
    vec3 neutralLab = linearToOklab(vec3(0.5));
    vec3 sTintLab = linearToOklab(clamp(u_shadowTint, 0.1, 0.9)) - neutralLab;
    vec3 hTintLab = linearToOklab(clamp(u_highTint, 0.1, 0.9)) - neutralLab;

    // Shadow zone: 0.02 to 0.54 L. Pure black (<0.02) is locked.
    float sMask = smoothstep(0.02, 0.12, L) * (1.0 - smoothstep(0.34, 0.54, L));
    // Highlight zone: 0.48 to 0.96 L. Specular cores (>0.96) roll off to white.
    float hMask = smoothstep(0.48, 0.66, L) * (1.0 - smoothstep(0.86, 0.96, L));

    // Neutral White Guard: Prevents white shirts & white floor tiles (high L, very low chroma) from getting dyed
    float isNeutralWhite = (1.0 - smoothstep(0.01, 0.035, chroma)) * smoothstep(0.68, 0.85, L);
    float shadowProtect = 1.0 - (skinMask * 0.90);
    float highProtect = (1.0 - skinMask * 0.75) * (1.0 - isNeutralWhite * 0.75);

    lab.y += (sTintLab.y * sMask * shadowProtect + hTintLab.y * hMask * highProtect) * 0.95;
    lab.z += (sTintLab.z * sMask * shadowProtect + hTintLab.z * hMask * highProtect) * 0.95;

    // 6. Saturation & Soft-Knee Gamut Compression (Stops neon signs from clipping)
    float satMult = mix(u_saturation, min(u_saturation, 1.06), skinMask * 0.75);
    lab.y *= satMult;
    lab.z *= satMult;

    float newChroma = sqrt(lab.y * lab.y + lab.z * lab.z);
    if (newChroma > 0.13) {
      float compressed = 0.13 + (newChroma - 0.13) / (1.0 + (newChroma - 0.13) * 5.0);
      float scale = compressed / max(newChroma, 0.0001);
      lab.y *= scale;
      lab.z *= scale;
      newChroma = compressed;
    }

    // 7. Pivoted S-Curve + Midtone-Gated Subtractive Film Density
    float curvedL = filmicContrastCurve(L, u_power);
    // Gate density above L=0.20 so dark crowd shadows never crush into solid black blocks
    float densityGate = smoothstep(0.20, 0.42, curvedL) * (1.0 - smoothstep(0.80, 0.95, curvedL));
    float filmDensity = smoothstep(0.03, 0.16, newChroma) * 0.06 * densityGate;
    lab.x = clamp(curvedL - filmDensity, 0.0, 1.0);

    // 8. Specular Highlight & Deep Black Purity Lock
    float extremeMask = smoothstep(0.88, 0.99, lab.x) + (1.0 - smoothstep(0.005, 0.04, lab.x));
    lab.y *= (1.0 - clamp(extremeMask, 0.0, 1.0) * 0.92);
    lab.z *= (1.0 - clamp(extremeMask, 0.0, 1.0) * 0.92);

    // 9. Output Conversion with Sub-Pixel Emulsion Dither (Destroys 8-bit banding)
    vec3 gradedLinear = clamp(oklabToLinear(lab), 0.0, 1.0);
    vec3 finalRgb = mix(raw.rgb, linearTosRGB(gradedLinear), u_intensity);

    // Procedural monochrome film grain (focused on midtones, tapered off in speculars & pure black)
    float grainHash = fract(sin(dot(v_texCoord * 1000.0, vec2(12.9898, 78.233))) * 43758.5453);
    float midtoneGrainWeight = smoothstep(0.05, 0.25, lab.x) * (1.0 - smoothstep(0.75, 0.98, lab.x));
    vec3 grainOffset = vec3((grainHash - 0.5) * 0.018 * midtoneGrainWeight * u_intensity);

    gl_FragColor = vec4(clamp(finalRgb + grainOffset, 0.0, 1.0), raw.a);
  }
`;

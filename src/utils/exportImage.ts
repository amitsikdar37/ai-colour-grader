import { type ColorProfileUniforms } from "../types/color";
import { sanitizeUniforms } from "./clampUniforms";
import { VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE } from "../shaders/gradeShaders";

export async function exportHighResImage(
    image: HTMLImageElement,
    uniforms: ColorProfileUniforms | null,
    intensity: number,
    fileName: string = "cinematic_grade.jpg"
): Promise<void> {
    const safeUniforms = sanitizeUniforms(uniforms);
    const safeIntensity = Math.min(Math.max(intensity, 0.0), 1.0);

    // 1. Temporary canvas for context query
    const canvas = document.createElement("canvas");

    // 2. Initialize WebGL context with preserveDrawingBuffer enabled
    const ctxOptions: WebGLContextAttributes = {
        preserveDrawingBuffer: true,
        alpha: false,
        antialias: false,
        powerPreference: "high-performance",
    };

    const gl = (
        canvas.getContext("webgl2", ctxOptions) ||
        canvas.getContext("webgl", ctxOptions) ||
        canvas.getContext("experimental-webgl", ctxOptions)
    ) as WebGLRenderingContext | null;

    if (!gl) {
        throw new Error("Unable to initialize WebGL export pipeline on this device");
    }

    // 3. Hardware-Aware Dimension Calculation (Guards against mobile GPU VRAM crashes)
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    const maxRender = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || maxTex;
    // Cap export at 4096 (Ultra-HD 4K) to stay within mobile OS canvas memory limits and prevent black frame aborts
    const maxAllowedDim = Math.min(maxTex, maxRender, 4096);

    let exportW = image.naturalWidth || 1920;
    let exportH = image.naturalHeight || 1080;

    if (exportW > maxAllowedDim || exportH > maxAllowedDim) {
        if (exportW > exportH) {
            exportH = Math.round((exportH * maxAllowedDim) / exportW);
            exportW = maxAllowedDim;
        } else {
            exportW = Math.round((exportW * maxAllowedDim) / exportH);
            exportH = maxAllowedDim;
        }
    }

    // Set export canvas dimensions
    canvas.width = exportW;
    canvas.height = exportH;

    // 4. Compile Shaders
    const compileShader = (type: number, src: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error("Export shader error:", gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    };

    const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);

    if (!vs || !fs) {
        throw new Error("Failed to compile export shaders");
    }

    const program = gl.createProgram();
    if (!program) {
        throw new Error("Failed to create WebGL export program");
    }

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error("Export program link error: " + gl.getProgramInfoLog(program));
    }

    gl.useProgram(program);

    // 5. Setup Fullscreen Quad Buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
            -1.0, -1.0,
             1.0, -1.0,
            -1.0,  1.0,
            -1.0,  1.0,
             1.0, -1.0,
             1.0,  1.0,
        ]),
        gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // 6. Set Viewport and Ingest Texture
    gl.viewport(0, 0, exportW, exportH);
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // If downscaled from ultra-high resolution (e.g. 48MP/108MP), draw via offscreen 2D canvas
    if (exportW !== image.naturalWidth || exportH !== image.naturalHeight) {
        const offscreen = document.createElement("canvas");
        offscreen.width = exportW;
        offscreen.height = exportH;
        const ctx = offscreen.getContext("2d");
        if (ctx) {
            ctx.drawImage(image, 0, 0, exportW, exportH);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offscreen);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        }
    } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    }

    const uImg = gl.getUniformLocation(program, "u_image");
    if (uImg) gl.uniform1i(uImg, 0);

    // 7. Push Safe Uniforms
    gl.uniform3fv(gl.getUniformLocation(program, "u_slope"), safeUniforms.slope);
    gl.uniform3fv(gl.getUniformLocation(program, "u_offset"), safeUniforms.offset);
    gl.uniform3fv(gl.getUniformLocation(program, "u_power"), safeUniforms.power);
    gl.uniform3fv(gl.getUniformLocation(program, "u_shadowTint"), safeUniforms.shadow_tint_rgb);
    gl.uniform3fv(gl.getUniformLocation(program, "u_highTint"), safeUniforms.highlight_tint_rgb);
    gl.uniform1f(gl.getUniformLocation(program, "u_saturation"), safeUniforms.saturation);
    gl.uniform1f(gl.getUniformLocation(program, "u_intensity"), safeIntensity);

    // Clear and draw frame
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // CRITICAL for Mobile: Flush and wait for GPU pipeline to finish rasterizing before toBlob reads buffer
    gl.finish();

    // 8. Convert to 0.95 Quality JPEG Blob and Trigger Download
    return new Promise<void>((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                // Clean up GPU resources immediately
                if (texture) gl.deleteTexture(texture);
                if (positionBuffer) gl.deleteBuffer(positionBuffer);
                if (program) gl.deleteProgram(program);
                if (vs) gl.deleteShader(vs);
                if (fs) gl.deleteShader(fs);

                if (!blob) {
                    return reject(new Error("Failed to encode JPEG blob"));
                }

                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                // CRITICAL for Mobile Android/iOS: DO NOT revoke immediately!
                // Asynchronous mobile download managers need time to stream the blob to storage.
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                }, 60000);

                resolve();
            },
            "image/jpeg",
            0.95
        );
    });
}

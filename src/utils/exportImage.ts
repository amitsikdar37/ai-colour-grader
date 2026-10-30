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

    // 1. Create headless offscreen canvas matching full raw resolution
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    // 2. Initialize sRGB WebGL context with preserveDrawingBuffer enabled
    const gl = canvas.getContext("webgl", {
        preserveDrawingBuffer: true,
    }) as WebGLRenderingContext | null;

    if (!gl) {
        throw new Error("Unable to initialize WebGL export pipeline");
    }

    if ("drawingBufferColorSpace" in gl) {
        (gl as any).drawingBufferColorSpace = "srgb";
    }

    // 3. Compile Shaders
    const compileShader = (type: number, src: string) => {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        return shader;
    };

    const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    // 4. Setup Fullscreen Quad Buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
            -1.0, -1.0,
            1.0, -1.0,
            -1.0, 1.0,
            -1.0, 1.0,
            1.0, -1.0,
            1.0, 1.0,
        ]),
        gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // 5. Ingest Full-Resolution Texture
    gl.viewport(0, 0, image.naturalWidth, image.naturalHeight);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    // 6. Push Safe Uniforms
    gl.uniform3fv(gl.getUniformLocation(program, "u_slope"), safeUniforms.slope);
    gl.uniform3fv(gl.getUniformLocation(program, "u_offset"), safeUniforms.offset);
    gl.uniform3fv(gl.getUniformLocation(program, "u_power"), safeUniforms.power);
    gl.uniform3fv(gl.getUniformLocation(program, "u_shadowTint"), safeUniforms.shadow_tint_rgb);
    gl.uniform3fv(gl.getUniformLocation(program, "u_highTint"), safeUniforms.highlight_tint_rgb);
    gl.uniform1f(gl.getUniformLocation(program, "u_saturation"), safeUniforms.saturation);
    gl.uniform1f(gl.getUniformLocation(program, "u_intensity"), safeIntensity);

    // 7. Render Headless Frame
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // 8. Convert to 0.95 Quality JPEG Blob and Trigger Automatic Download
    return new Promise<void>((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                // Clean up GPU resources immediately
                gl.deleteTexture(texture);
                gl.deleteBuffer(positionBuffer);
                gl.deleteProgram(program);
                gl.deleteShader(vs);
                gl.deleteShader(fs);

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
                URL.revokeObjectURL(url);
                resolve();
            },
            "image/jpeg",
            0.95
        );
    });
}
import React, { useEffect, useRef } from "react";
import { type ColorProfileUniforms, DEFAULT_UNIFORMS } from "../types/color";
import { VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE } from "../shaders/gradeShaders";

interface ColorGradeCanvasProps {
    image: HTMLImageElement | null;
    uniforms: ColorProfileUniforms | null;
    intensity: number;
}

export const ColorGradeCanvas: React.FC<ColorGradeCanvasProps> = ({
    image,
    uniforms,
    intensity,
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const glRef = useRef<WebGLRenderingContext | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const textureRef = useRef<WebGLTexture | null>(null);

    // 1. Initialize WebGL Context, Shaders, and Screen Quad Buffer (ONCE)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Must enable preserveDrawingBuffer for file exports, and enforce sRGB
        const gl = canvas.getContext("webgl", {
            preserveDrawingBuffer: true,
        }) as WebGLRenderingContext | null;

        if (!gl) {
            console.error("WebGL 1.0 not supported on this browser/device.");
            return;
        }

        // Set sRGB color space if supported by browser
        if ("drawingBufferColorSpace" in gl) {
            (gl as any).drawingBufferColorSpace = "srgb";
        }
        glRef.current = gl;

        // Helper: Compile individual shader stage
        const compileShader = (type: number, source: string): WebGLShader | null => {
            const shader = gl.createShader(type);
            if (!shader) return null;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);

            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error("Shader compilation error:", gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };

        const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
        const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);

        if (!vs || !fs) return;

        const program = gl.createProgram();
        if (!program) return;

        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("Program linking error:", gl.getProgramInfoLog(program));
            return;
        }
        programRef.current = program;

        // Create 2D Fullscreen Quad Buffer (2 triangles = 6 vertices covering [-1, 1])
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

        // Create texture object
        const texture = gl.createTexture();
        textureRef.current = texture;

        // Clean up WebGL resources when component unmounts
        return () => {
            if (texture) gl.deleteTexture(texture);
            if (positionBuffer) gl.deleteBuffer(positionBuffer);
            if (program) gl.deleteProgram(program);
        };
    }, []);

    // 2. Texture Ingestion (ONLY when the image changes)
    useEffect(() => {
        const gl = glRef.current;
        const texture = textureRef.current;
        const canvas = canvasRef.current;
        if (!gl || !texture || !canvas || !image) return;

        // Match canvas buffer dimensions to original image resolution
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        gl.viewport(0, 0, image.naturalWidth, image.naturalHeight);

        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Essential NPOT (Non-Power-Of-Two) texture parameters for WebGL 1.0
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        // Upload image data to GPU VRAM
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    }, [image]);

    // 3. Render Loop: Update Uniforms and Draw (Runs at 60 FPS on slider tweak)
    useEffect(() => {
        const gl = glRef.current;
        const program = programRef.current;
        if (!gl || !program || !image) return;

        gl.useProgram(program);

        const u = uniforms || DEFAULT_UNIFORMS;

        // Push uniform vectors to GPU registers
        gl.uniform3fv(gl.getUniformLocation(program, "u_slope"), u.slope);
        gl.uniform3fv(gl.getUniformLocation(program, "u_offset"), u.offset);
        gl.uniform3fv(gl.getUniformLocation(program, "u_power"), u.power);
        gl.uniform3fv(gl.getUniformLocation(program, "u_shadowTint"), u.shadow_tint_rgb);
        gl.uniform3fv(gl.getUniformLocation(program, "u_highTint"), u.highlight_tint_rgb);
        gl.uniform1f(gl.getUniformLocation(program, "u_saturation"), u.saturation);
        gl.uniform1f(gl.getUniformLocation(program, "u_intensity"), intensity);

        // Draw the 6 vertices forming the screen quad
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }, [image, uniforms, intensity]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                display: "block",
                maxWidth: "100%",
                maxHeight: "65vh",
                width: "auto",
                height: "auto",
            }}
        />
    );
};

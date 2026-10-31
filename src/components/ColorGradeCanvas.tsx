import React, { useEffect, useRef, useCallback } from "react";
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

    // Shared draw function: Updates uniform registers and renders quad
    const draw = useCallback(() => {
        const gl = glRef.current;
        const program = programRef.current;
        const texture = textureRef.current;
        const canvas = canvasRef.current;
        if (!gl || !program || !texture || !canvas) return;

        gl.useProgram(program);
        gl.viewport(0, 0, canvas.width, canvas.height);

        // Bind active texture unit 0
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        const uImgLoc = gl.getUniformLocation(program, "u_image");
        if (uImgLoc) {
            gl.uniform1i(uImgLoc, 0);
        }

        const u = uniforms || DEFAULT_UNIFORMS;

        gl.uniform3fv(gl.getUniformLocation(program, "u_slope"), u.slope);
        gl.uniform3fv(gl.getUniformLocation(program, "u_offset"), u.offset);
        gl.uniform3fv(gl.getUniformLocation(program, "u_power"), u.power);
        gl.uniform3fv(gl.getUniformLocation(program, "u_shadowTint"), u.shadow_tint_rgb);
        gl.uniform3fv(gl.getUniformLocation(program, "u_highTint"), u.highlight_tint_rgb);
        gl.uniform1f(gl.getUniformLocation(program, "u_saturation"), u.saturation);
        gl.uniform1f(gl.getUniformLocation(program, "u_intensity"), intensity);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }, [uniforms, intensity]);

    // 1. Initialize WebGL Context and Program (ONCE on mount)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleContextLost = (e: Event) => {
            e.preventDefault();
            console.warn("WebGL context lost on device. Waiting for restoration...");
        };
        canvas.addEventListener("webglcontextlost", handleContextLost, false);

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
            console.error("WebGL is not supported on this device/browser.");
            return;
        }

        glRef.current = gl;

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

        const texture = gl.createTexture();
        textureRef.current = texture;

        return () => {
            canvas.removeEventListener("webglcontextlost", handleContextLost);
            if (texture) gl.deleteTexture(texture);
            if (positionBuffer) gl.deleteBuffer(positionBuffer);
            if (program) gl.deleteProgram(program);
        };
    }, []);

    // 2. Ingest Texture immediately whenever 'image' changes
    useEffect(() => {
        const gl = glRef.current;
        const texture = textureRef.current;
        const canvas = canvasRef.current;
        if (!gl || !texture || !canvas || !image) return;

        const maxHardwareTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
        const maxDisplayDim = Math.min(maxHardwareTex, 2048);

        let dispW = image.naturalWidth || 1920;
        let dispH = image.naturalHeight || 1080;

        if (dispW > maxDisplayDim || dispH > maxDisplayDim) {
            if (dispW > dispH) {
                dispH = Math.round((dispH * maxDisplayDim) / dispW);
                dispW = maxDisplayDim;
            } else {
                dispW = Math.round((dispW * maxDisplayDim) / dispH);
                dispH = maxDisplayDim;
            }
        }

        canvas.width = dispW;
        canvas.height = dispH;
        gl.viewport(0, 0, dispW, dispH);

        // Clear previous frame pixels immediately so stale image is removed
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        if (dispW !== image.naturalWidth || dispH !== image.naturalHeight) {
            const offscreen = document.createElement("canvas");
            offscreen.width = dispW;
            offscreen.height = dispH;
            const ctx = offscreen.getContext("2d");
            if (ctx) {
                ctx.drawImage(image, 0, 0, dispW, dispH);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offscreen);
            } else {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            }
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        }

        // Instantly render new texture to canvas
        draw();
    }, [image, draw]);

    // 3. Render Loop when uniforms or intensity tweak
    useEffect(() => {
        draw();
    }, [draw]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                width: "100%",
                height: "100%",
                display: "block",
            }}
        />
    );
};

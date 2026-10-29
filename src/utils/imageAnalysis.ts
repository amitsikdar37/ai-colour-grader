export interface ImageAnalysisResult {
  previewBase64: string;           // ~250KB JPEG base64 payload for Gemini
  originalImage: HTMLImageElement; // High-res image kept for WebGL
  payloadSizeBytes: number;        // Size in bytes
  processingTimeMs: number;        // Execution time in milliseconds
  histogram: Uint32Array;          // 256-bin luminance histogram
  blackFloor: number;              // 2nd percentile (0-255)
  whiteCeiling: number;            // 98th percentile (0-255)
  dynamicRangeRatio: number;       // (whiteCeiling - blackFloor) / 255
  isUnderexposed: boolean;
  isOverexposed: boolean;
  ambientCast: {
    rMean: number;
    gMean: number;
    bMean: number;
    dominantCast: "warm" | "cool" | "greenish" | "neutral";
  };
}

export async function prepareAndAnalyzeImage(file: File): Promise<ImageAnalysisResult> {
  const startTime = performance.now();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        // 1. Calculate downscaled dimensions preserving aspect ratio (max 1280px)
        const maxDim = 1280;
        let width = img.naturalWidth;
        let height = img.naturalHeight;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        // 2. Render onto an offscreen canvas
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        if (!ctx) {
          return reject(new Error("Unable to obtain 2D canvas context"));
        }

        ctx.drawImage(img, 0, 0, width, height);

        // 3. Extract raw pixel data for histogram analysis
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        const totalPixels = data.length / 4;

        const lumaHistogram = new Uint32Array(256);
        let midtoneRSum = 0;
        let midtoneGSum = 0;
        let midtoneBSum = 0;
        let midtoneCount = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // Rec.709 luminance calculation
          const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
          lumaHistogram[luma]++;

          // Sample midtones between 0.2 (51) and 0.8 (204) to detect color cast
          if (luma >= 51 && luma <= 204) {
            midtoneRSum += r;
            midtoneGSum += g;
            midtoneBSum += b;
            midtoneCount++;
          }
        }

        // 4. Find 2nd and 98th percentiles
        let accumulated = 0;
        let blackFloor = 0;
        let whiteCeiling = 255;
        const p2 = totalPixels * 0.02;
        const p98 = totalPixels * 0.98;

        for (let i = 0; i < 256; i++) {
          accumulated += lumaHistogram[i];
          if (blackFloor === 0 && accumulated >= p2) {
            blackFloor = i;
          }
          if (accumulated >= p98) {
            whiteCeiling = i;
            break;
          }
        }

        // 5. Ambient cast evaluation
        const rMean = midtoneCount > 0 ? midtoneRSum / midtoneCount : 128;
        const gMean = midtoneCount > 0 ? midtoneGSum / midtoneCount : 128;
        const bMean = midtoneCount > 0 ? midtoneBSum / midtoneCount : 128;

        let dominantCast: "warm" | "cool" | "greenish" | "neutral" = "neutral";
        if (gMean > rMean + 15 && gMean > bMean + 15) {
          dominantCast = "greenish";
        } else if (rMean > bMean + 15) {
          dominantCast = "warm";
        } else if (bMean > rMean + 15) {
          dominantCast = "cool";
        }

        // 6. Generate optimized 0.85 JPEG base64 payload
        const previewBase64 = canvas.toDataURL("image/jpeg", 0.85);
        // Base64 size estimation: (characters * 3/4)
        const payloadSizeBytes = Math.round((previewBase64.length - 23) * 0.75);

        const processingTimeMs = Math.round(performance.now() - startTime);

        resolve({
          previewBase64,
          originalImage: img,
          payloadSizeBytes,
          processingTimeMs,
          histogram: lumaHistogram,
          blackFloor,
          whiteCeiling,
          dynamicRangeRatio: (whiteCeiling - blackFloor) / 255,
          isUnderexposed: blackFloor < 10 && whiteCeiling < 160,
          isOverexposed: blackFloor > 60 && whiteCeiling >= 250,
          ambientCast: {
            rMean: Math.round(rMean),
            gMean: Math.round(gMean),
            bMean: Math.round(bMean),
            dominantCast,
          },
        });
      };

      img.onerror = reject;
      img.src = e.target?.result as string;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
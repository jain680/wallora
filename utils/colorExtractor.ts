/**
 * Extracts the dominant color from an image file.
 * Useful for "Sample Mood" features where the user uploads an inspiration photo.
 */
export async function extractDominantColor(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve('#E2D1C3'); // Fallback
                    return;
                }

                // Draw smaller version for faster processing
                canvas.width = 100;
                canvas.height = 100;
                ctx.drawImage(img, 0, 0, 100, 100);

                const imageData = ctx.getImageData(0, 0, 100, 100).data;
                let r = 0, g = 0, b = 0;
                let count = 0;

                // Simple average color (can be improved to median or k-means but average works well for "mood")
                for (let i = 0; i < imageData.length; i += 4) {
                    r += imageData[i];
                    g += imageData[i + 1];
                    b += imageData[i + 2];
                    count++;
                }

                r = Math.floor(r / count);
                g = Math.floor(g / count);
                b = Math.floor(b / count);

                const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
                resolve(hex);
            };
            img.onerror = reject;
            img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

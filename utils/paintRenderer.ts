export function drawImageAndApplyPaint(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  wallRegions: any[],
  currentPaintColor: string,
  opacity: number,
  showAccentWall: boolean,
  selectedWallId: string | null
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);

  if (wallRegions && image) {
    wallRegions.forEach((wall: any) => {
      const { x, y, width, height } = wall.boundingBox;
      const wallColor = wall.colorSuggestion || currentPaintColor;

      const pxX = (x / 100) * canvas.width;
      const pxY = (y / 100) * canvas.height;
      const pxWidth = (width / 100) * canvas.width;
      const pxHeight = (height / 100) * canvas.height;

      // Apply paint conditionally
      if (showAccentWall && (selectedWallId === null || selectedWallId === wall.wallName)) {
        const paintCanvas = document.createElement('canvas');
        paintCanvas.width = canvas.width;
        paintCanvas.height = canvas.height;
        const paintCtx = paintCanvas.getContext('2d');

        if (paintCtx) {
          paintCtx.fillStyle = wallColor;
          paintCtx.fillRect(pxX, pxY, pxWidth, pxHeight);

          ctx.globalCompositeOperation = 'multiply';
          ctx.globalAlpha = opacity * 0.8;
          ctx.drawImage(paintCanvas, 0, 0);

          ctx.globalCompositeOperation = 'soft-light';
          ctx.globalAlpha = opacity * 0.5;
          ctx.drawImage(paintCanvas, 0, 0);

          ctx.globalCompositeOperation = 'color';
          ctx.globalAlpha = opacity * 0.4;
          ctx.drawImage(paintCanvas, 0, 0);
        }
      }
    });
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1.0;
}

export function drawWallHighlight(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  wallRegions: any[],
  selectedWallId: string | null,
  hoveredWallId: string | null // New parameter for hover effect
) {
  wallRegions.forEach((wall: any) => {
    const { x, y, width, height } = wall.boundingBox;
    const pxX = (x / 100) * canvas.width;
    const pxY = (y / 100) * canvas.height;
    const pxWidth = (width / 100) * canvas.width;
    const pxHeight = (height / 100) * canvas.height;

    if (selectedWallId === wall.wallName || hoveredWallId === wall.wallName) {
      ctx.strokeStyle = selectedWallId === wall.wallName ? '#00BFFF' : '#ADD8E6'; // Cyan for selected, LightBlue for hovered
      ctx.lineWidth = 4;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 10;
      ctx.strokeRect(pxX, pxY, pxWidth, pxHeight);
      ctx.shadowBlur = 0; // Reset shadow
    }
  });
}

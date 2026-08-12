export function getClickedWall(event: MouseEvent | TouchEvent, canvas: HTMLCanvasElement, wallRegions: any[]): string | null {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  let clientX: number;
  let clientY: number;

  if (event instanceof MouseEvent) {
    clientX = event.clientX;
    clientY = event.clientY;
  } else {
    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  }

  const mouseX = (clientX - rect.left) * scaleX;
  const mouseY = (clientY - rect.top) * scaleY;

  for (const wall of wallRegions) {
    const { x, y, width, height } = wall.boundingBox;
    const pxX = (x / 100) * canvas.width;
    const pxY = (y / 100) * canvas.height;
    const pxWidth = (width / 100) * canvas.width;
    const pxHeight = (height / 100) * canvas.height;

    if (
      mouseX >= pxX &&
      mouseX <= pxX + pxWidth &&
      mouseY >= pxY &&
      mouseY <= pxY + pxHeight
    ) {
      return wall.wallName;
    }
  }
  return null;
}

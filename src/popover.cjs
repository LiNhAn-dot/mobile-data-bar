function popoverBounds(anchor, workArea, size) {
  const gap = 4;
  const width = Math.min(size.width, workArea.width);
  const height = Math.min(size.height, workArea.height);
  const right = workArea.x + workArea.width;
  const bottom = workArea.y + workArea.height;
  const below = anchor.y + anchor.height + gap;
  const above = anchor.y - height - gap;
  const centered = Math.round(anchor.x + (anchor.width - width) / 2);

  return {
    x: Math.max(workArea.x, Math.min(centered, right - width)),
    y: Math.max(workArea.y, Math.min(below + height <= bottom ? below : above, bottom - height)),
    width,
    height
  };
}

module.exports = { popoverBounds };

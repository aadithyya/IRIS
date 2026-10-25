(() => {
  const canvas = document.getElementById("globe-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const landPolygons = [
    [
      [-168, 70], [-151, 72], [-136, 61], [-127, 52],
      [-116, 48], [-124, 39], [-113, 29], [-98, 18],
      [-82, 8], [-78, 25], [-61, 45], [-56, 57],
      [-81, 73], [-111, 81], [-145, 76]
    ],
    [[-53, 83], [-20, 78], [-27, 60], [-45, 59], [-58, 71]],
    [
      [-81, 12], [-66, 10], [-50, 3], [-35, -8],
      [-48, -25], [-61, -46], [-70, -56], [-77, -32], [-81, -5]
    ],
    [
      [-11, 35], [-10, 48], [4, 58], [17, 71], [34, 62],
      [42, 51], [31, 39], [18, 35], [4, 40]
    ],
    [
      [-18, 36], [11, 38], [35, 30], [50, 11],
      [40, -13], [26, -35], [15, -35], [1, -17],
      [-12, 4], [-17, 19]
    ],
    [
      [31, 37], [42, 54], [63, 70], [98, 78], [133, 69],
      [170, 59], [179, 44], [150, 29], [130, 12], [112, 6],
      [98, 20], [84, 9], [71, 21], [55, 27], [45, 39]
    ],
    [[68, 25], [80, 31], [90, 21], [83, 7], [75, 5], [70, 15]],
    [[96, 8], [117, 13], [132, 4], [126, -9], [111, -7], [101, -1]],
    [[130, 34], [140, 46], [146, 42], [139, 31]],
    [[112, -11], [131, -10], [153, -25], [145, -40], [121, -35], [113, -22]],
    [[47, -13], [51, -17], [49, -26], [45, -22]],
    [
      [-180, -72], [-120, -70], [-60, -76], [0, -70],
      [75, -75], [140, -69], [180, -73], [180, -90], [-180, -90]
    ]
  ];

  function insidePolygon(lon, lat, polygon) {
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];

      const intersects =
        ((yi > lat) !== (yj > lat)) &&
        (lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 0.000001) + xi);

      if (intersects) inside = !inside;
    }

    return inside;
  }

  function isLand(lon, lat) {
    return landPolygons.some((polygon) => insidePolygon(lon, lat, polygon));
  }

  const points = [];

  for (let lat = -85, row = 0; lat <= 85; lat += 4.6, row++) {
    const rowOffset = row % 2 ? 2.3 : 0;

    for (let lon = -180; lon < 180; lon += 4.6) {
      const adjustedLon = lon + rowOffset;
      const seed = Math.abs(
        Math.sin((lat + 93.17) * 17.31 + (adjustedLon + 187.23) * 6.91) * 10000
      );

      points.push({
        lat,
        lon: adjustedLon,
        land: isLand(adjustedLon, lat),
        seed
      });
    }
  }

  let rotation = 0.35;
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let frame = 0;
  let lastFrameTime = 0;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  function resize() {
    const rect = canvas.getBoundingClientRect();

    if (!rect.width || !rect.height) return;

    width = rect.width;
    height = rect.height;

    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function render(now = 0) {
    if (!width || !height) return;

    ctx.clearRect(0, 0, width, height);

    const size = Math.min(width, height);
    const radius = size * 0.365;
    const cx = width / 2;
    const cy = height / 2;

    const cosTilt = Math.cos(0.12);
    const sinTilt = Math.sin(0.12);
    const cosRot = Math.cos(rotation);
    const sinRot = Math.sin(rotation);

    // A subtle outer contour; no green glow is painted beneath the globe.
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(80, 88, 83, 0.18)";
    ctx.lineWidth = 0.8;
    ctx.stroke();

    const projected = [];

    for (const point of points) {
      const latRad = point.lat * Math.PI / 180;
      const lonRad = point.lon * Math.PI / 180;

      const baseX = Math.cos(latRad) * Math.sin(lonRad);
      const baseY = Math.sin(latRad);
      const baseZ = Math.cos(latRad) * Math.cos(lonRad);

      const x1 = baseX * cosRot + baseZ * sinRot;
      const z1 = -baseX * sinRot + baseZ * cosRot;

      const y2 = baseY * cosTilt - z1 * sinTilt;
      const z2 = baseY * sinTilt + z1 * cosTilt;

      const depth = (z2 + 1) / 2;

      projected.push({
        x: cx + x1 * radius,
        y: cy + y2 * radius,
        z: z2,
        depth,
        land: point.land,
        seed: point.seed
      });
    }

    projected.sort((a, b) => a.z - b.z);

    const fontSize = Math.max(5.2, Math.min(9.4, size / 51));

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const point of projected) {
      const back = point.z < 0;

      if (back && point.seed % 1 > 0.30) continue;

      const glyphSet = point.land
        ? ["o", "0", "O", "@", "0", "o", "°"]
        : ["·", ".", "+", "·", ":", "∙"];

      const glyph =
        glyphSet[Math.floor(point.seed * glyphSet.length) % glyphSet.length];

      if (point.land) {
        ctx.fillStyle = `rgba(17, 21, 18, ${
          back ? 0.10 : 0.48 + point.depth * 0.48
        })`;
      } else {
        ctx.fillStyle = `rgba(78, 88, 81, ${
          back ? 0.045 : 0.12 + point.depth * 0.3
        })`;
      }

      const scale = 0.72 + point.depth * 0.28;

      ctx.font = `${point.land ? 650 : 500} ${
        fontSize * scale
      }px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

      ctx.fillText(glyph, point.x, point.y);
    }

    // Neutral equatorial guide, without a colored glow.
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius * 0.99, radius * 0.16, -0.12, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(100, 112, 103, 0.12)";
    ctx.lineWidth = 0.65;
    ctx.stroke();

    if (!reducedMotion) {
      const elapsed = lastFrameTime
        ? Math.min((now - lastFrameTime) / 16.67, 2)
        : 1;

      rotation += 0.005 * elapsed;
      lastFrameTime = now;

      frame = window.requestAnimationFrame(render);
    }
  }

  const resizeObserver = new ResizeObserver(resize);

  resizeObserver.observe(canvas);
  window.addEventListener("resize", resize, { passive: true });

  resize();

  if (!reducedMotion) {
    frame = window.requestAnimationFrame(render);
  } else {
    render(0);
  }

  window.addEventListener("pagehide", () => {
    if (frame) window.cancelAnimationFrame(frame);
    resizeObserver.disconnect();
  }, { once: true });
})();

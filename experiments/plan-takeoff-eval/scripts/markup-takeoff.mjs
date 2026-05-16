import fs from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const PX_PER_FOOT = 17.0;

function lengthPx(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    total += Math.hypot(x2 - x1, y2 - y1);
  }
  return total;
}

function summarize(segments) {
  const totals = new Map();
  for (const segment of segments) {
    const lf = lengthPx(segment.points) / PX_PER_FOOT;
    const key = `${segment.system} | ${segment.size}`;
    totals.set(key, (totals.get(key) ?? 0) + lf);
  }
  return [...totals.entries()]
    .map(([key, lf]) => {
      const [system, size] = key.split(" | ");
      return { system, size, linearFeet: Math.round(lf) };
    })
    .sort((a, b) => a.system.localeCompare(b.system) || a.size.localeCompare(b.size));
}

async function drawMarkup({ source, output, title, segments, notes }) {
  const image = await loadImage(source);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.font = "28px Arial";

  for (const segment of segments) {
    ctx.strokeStyle = segment.color;
    ctx.lineWidth = segment.width ?? 10;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    segment.points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const [labelX, labelY] = segment.points[Math.floor(segment.points.length / 2)];
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = segment.color;
    ctx.fillText(segment.label ?? segment.size, labelX + 8, labelY - 8);
  }

  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(120, 100, 900, 360);
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 3;
  ctx.strokeRect(120, 100, 900, 360);
  ctx.fillStyle = "#111827";
  ctx.font = "34px Arial";
  ctx.fillText(title, 150, 155);
  ctx.font = "26px Arial";
  notes.forEach((note, index) => ctx.fillText(note, 150, 205 + index * 38));

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, await canvas.encode("png"));
}

const mechanicalSegments = [
  { system: "Supply air", size: "16 in round fabric duct", color: "#2563eb", label: "SA fabric 16in", points: [[650, 850], [1570, 850]] },
  { system: "Supply air", size: "16 in round fabric duct", color: "#2563eb", label: "SA fabric 16in", points: [[660, 1990], [1495, 1990]] },
  { system: "Supply air", size: "Main round duct, 22 in", color: "#1d4ed8", label: "SA 22in", points: [[2250, 1460], [2250, 2240]] },
  { system: "Supply air", size: "Main round duct, 22 in", color: "#1d4ed8", label: "SA 22in", points: [[2250, 1990], [2680, 1990], [2920, 2090]] },
  { system: "Supply air", size: "Rectangular duct, 16x12 to 24x16", color: "#0ea5e9", label: "SA rect", points: [[2870, 1640], [2870, 2380], [3035, 2470], [3140, 2420]] },
  { system: "Supply air", size: "Rectangular duct, 14x10 to 16x12", color: "#0ea5e9", label: "SA rect", points: [[2050, 1160], [2470, 1160], [2670, 1225], [2750, 1465]] },
  { system: "Supply air", size: "Rectangular branch duct, 8x6 to 12x12", color: "#38bdf8", label: "SA branches", points: [[2860, 1640], [3180, 1640], [3270, 1785], [3270, 2010]] },
  { system: "Supply air", size: "Rectangular branch duct, 8x6 to 12x12", color: "#38bdf8", label: "SA branches", points: [[1600, 2380], [1825, 2380], [1960, 2300], [2070, 2300]] },
  { system: "Supply air", size: "6 in round diffuser branches", color: "#60a5fa", label: "6in branches", points: [[1730, 1210], [1730, 1020], [1710, 910]] },
  { system: "Supply air", size: "6 in round diffuser branches", color: "#60a5fa", label: "6in branches", points: [[3140, 1500], [3300, 1500], [3370, 1400]] },
  { system: "Return air", size: "Return/transfer duct, 10x10 to 14x12", color: "#16a34a", label: "RA", points: [[2380, 980], [2710, 980], [2925, 1080], [3200, 1080]] },
  { system: "Exhaust air", size: "Exhaust duct, 6x4 to 10x8", color: "#dc2626", label: "EA", points: [[2910, 1040], [3090, 940], [3290, 940], [3400, 1030]] },
  { system: "Exhaust air", size: "Exhaust duct, 6x4 to 10x8", color: "#dc2626", label: "EA", points: [[2190, 2350], [2190, 2660], [2300, 2810]] },
  { system: "Exhaust air", size: "Exhaust duct, 6x4 to 10x8", color: "#dc2626", label: "EA", points: [[2920, 2285], [3140, 2285], [3270, 2360]] },
];

const plumbingSegments = [
  { system: "Sanitary waste", size: "4 in SAN", color: "#7c3aed", label: "4in SAN", points: [[525, 1670], [1450, 1670], [1580, 1630], [1790, 1630]] },
  { system: "Sanitary waste", size: "4 in SAN", color: "#7c3aed", label: "4in SAN", points: [[1800, 1680], [1800, 2030], [2050, 2030], [2260, 2020]] },
  { system: "Sanitary waste", size: "3 in SAN", color: "#a855f7", label: "3in SAN", points: [[1940, 1270], [2250, 1270], [2620, 1260]] },
  { system: "Sanitary waste", size: "3 in SAN", color: "#a855f7", label: "3in SAN", points: [[2340, 1520], [2770, 1520], [3000, 1600]] },
  { system: "Vent", size: "2 in VTR / vent", color: "#f97316", label: "2in vent", points: [[2080, 1170], [2080, 910], [1980, 840]] },
  { system: "Vent", size: "2 in VTR / vent", color: "#f97316", label: "2in vent", points: [[2520, 1350], [2520, 1080], [2700, 1010]] },
  { system: "Domestic cold water", size: "1-1/4 to 2-1/2 in CW", color: "#0f766e", label: "CW main", points: [[1550, 2500], [1550, 2040], [1680, 1830], [2000, 1780], [2420, 1780], [2750, 1840]] },
  { system: "Domestic cold water", size: "1-1/4 to 2-1/2 in CW", color: "#0f766e", label: "CW main", points: [[2500, 1780], [2500, 1450], [2730, 1450], [2950, 1320]] },
  { system: "Domestic cold water", size: "3/4 to 1-1/2 in CW branches", color: "#14b8a6", label: "CW branch", points: [[1940, 2480], [1940, 2210], [2050, 2010]] },
  { system: "Domestic cold water", size: "3/4 to 1-1/2 in CW branches", color: "#14b8a6", label: "CW branch", points: [[3030, 1610], [3330, 1610], [3330, 1250]] },
  { system: "Domestic hot water", size: "3/4 to 1-1/2 in HW/HWR", color: "#e11d48", label: "HW/HWR", points: [[2240, 2500], [2240, 2230], [2370, 2020], [2650, 2000]] },
  { system: "Domestic hot water", size: "3/4 to 1-1/2 in HW/HWR", color: "#e11d48", label: "HW/HWR", points: [[3020, 1450], [3330, 1450], [3330, 1180]] },
];

const mechanicalSource = "experiments/plan-takeoff-eval/output/dfs-p129-m102.png";
const plumbingSource = "experiments/plan-takeoff-eval/output/dfs-p165-p102.png";

await drawMarkup({
  source: mechanicalSource,
  output: "experiments/plan-takeoff-eval/marked-up/dfs-m102-hvac-takeoff-markup.png",
  title: "GPT-5.5 takeoff markup: DFS M-102",
  notes: [
    "Blue: supply air / fabric duct",
    "Green: return or transfer duct",
    "Red: exhaust duct",
    "Scale used: 1/8 in = 1 ft, ~17 px/ft",
    "Confidence: medium-low; estimator review required",
  ],
  segments: mechanicalSegments,
});

await drawMarkup({
  source: plumbingSource,
  output: "experiments/plan-takeoff-eval/marked-up/dfs-p102-plumbing-takeoff-markup.png",
  title: "GPT-5.5 takeoff markup: DFS P-102",
  notes: [
    "Purple: sanitary waste",
    "Orange: vent",
    "Teal: domestic cold water",
    "Pink: hot water / recirc",
    "Confidence: low; dense restroom routing needs review",
  ],
  segments: plumbingSegments,
});

const report = {
  scaleAssumption: "Rendered 24x36 sheet at 4896x3168 px; sheet scale 1/8 in = 1 ft; approximate conversion 17 px/ft.",
  mechanical: summarize(mechanicalSegments),
  plumbing: summarize(plumbingSegments),
};

await fs.writeFile(
  "experiments/plan-takeoff-eval/output/dfs-takeoff-quantities.json",
  `${JSON.stringify(report, null, 2)}\n`,
);

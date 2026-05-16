import fs from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

async function loadDocument(pdfPath) {
  const data = await fs.readFile(pdfPath);
  return pdfjsLib.getDocument({
    data: new Uint8Array(data),
    disableWorker: true,
  }).promise;
}

async function pageText(page) {
  const content = await page.getTextContent();
  return content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function indexSheets(pdfPath, outPath) {
  const doc = await loadDocument(pdfPath);
  const rows = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const text = await pageText(page);
    const upper = text.toUpperCase();
    const isRelevant =
      upper.includes("MECHANICAL") ||
      upper.includes("DUCT") ||
      upper.includes("PLUMBING") ||
      upper.includes("DOMESTIC") ||
      upper.includes("SANITARY") ||
      upper.includes("HVAC") ||
      upper.includes("PIPING");

    if (isRelevant) {
      rows.push({
        pageNumber,
        snippet: text.slice(0, 900),
      });
    }
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(rows, null, 2)}\n`);
}

async function renderPage(pdfPath, pageNumber, outPath, scale = 2) {
  const doc = await loadDocument(pdfPath);
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");

  await page.render({ canvasContext: context, viewport }).promise;
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, await canvas.encode("png"));
}

const [command, pdfPath, arg1, arg2, arg3] = process.argv.slice(2);

if (!command || !pdfPath) {
  console.error("Usage: pdf-sheet-tools.mjs index <pdf> <out.json> | render <pdf> <page> <out.png> [scale]");
  process.exit(1);
}

if (command === "index") {
  await indexSheets(pdfPath, arg1);
} else if (command === "render") {
  await renderPage(pdfPath, Number(arg1), arg2, arg3 ? Number(arg3) : 2);
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

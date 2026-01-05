// ======== DOM ELEMENTS ========
const preview = document.getElementById("preview");
const upload = document.getElementById("upload");
const bgSel = document.getElementById("bg");
const bgCustom = document.getElementById("bgCustom");
const markSel = document.getElementById("markColor");
const layoutSel = document.getElementById("layout");
const dpiSel = document.getElementById("dpi");
const fitSel = document.getElementById("fitMode"); // new
const status = document.getElementById("status");
const working = document.getElementById("working");
const resetCopiesBtn = document.getElementById("resetCopies");
const makepdfBtn = document.getElementById("makepdf");

let cards = [];

// ======== EVENT HANDLERS ========
upload.addEventListener("change", (e) => {
  [...e.target.files].forEach((f) => {
    const url = URL.createObjectURL(f);
    cards.push({ src: url, copies: 1 });
  });
  renderPreview();
});

[bgSel, bgCustom, markSel, layoutSel, dpiSel, fitSel].forEach((el) =>
  el.addEventListener("change", renderPreview)
);

bgSel.addEventListener("change", () => {
  if (bgSel.value === "custom") bgCustom.style.display = "block";
  else bgCustom.style.display = "none";
  renderPreview();
});

resetCopiesBtn.addEventListener("click", () => {
  cards.forEach((c) => (c.copies = 1));
  renderPreview();
});

makepdfBtn.addEventListener("click", async () => {
  const expanded = getExpandedCards();
  if (!expanded.length) return alert("No cards uploaded!");
  working.style.display = "flex";
  try {
    await generatePDF(expanded.map((c) => c.src));
    status.textContent = "✅ PDF ready for download";
  } catch (err) {
    console.error(err);
    status.textContent = "❌ " + err.message;
  } finally {
    working.style.display = "none";
  }
});

// ======== HELPERS ========
function getExpandedCards() {
  return cards.flatMap((c) => Array(c.copies).fill(c));
}

// ======== PREVIEW ========
function renderPreview() {
  preview.innerHTML = "";

  const A4_W = 210,
    CARD_W = 63,
    CARD_H = 88,
    GAP = 3;
  const scale = preview.clientWidth / A4_W;
  const cardW = CARD_W * scale;
  const cardH = CARD_H * scale;
  const gapPx = GAP * scale;

  const cols = 3;
  const expanded = getExpandedCards();
  const rows = Math.ceil(expanded.length / cols);
  const gridWidth = cols * cardW + (cols - 1) * gapPx;
  const gridHeight = rows * cardH + (rows - 1) * gapPx;

  let bgValue = bgSel.value === "custom" ? bgCustom.value : bgSel.value;
  preview.style.background = bgValue === "black" ? "#fff" : bgValue;

  preview.style.display = "flex";
  preview.style.justifyContent = "center";
  preview.style.alignItems = "center";

  const grid = document.createElement("div");
  grid.style.position = "relative";
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = `repeat(${cols}, ${cardW}px)`;
  grid.style.gap = `${gapPx}px`;
  grid.style.width = `${gridWidth}px`;
  grid.style.height = `${gridHeight}px`;
  grid.style.margin = "auto";

  expanded.forEach((cardData) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.width = `${cardW}px`;
    card.style.height = `${cardH}px`;

    const img = document.createElement("img");
    img.src = cardData.src;
    img.style.objectFit = fitSel.value === "bleed" ? "cover" : "contain";

    const overlay = document.createElement("div");
    overlay.className = "cropmarks";
    ["tl", "tr", "bl", "br"].forEach((p) => {
      const s = document.createElement("span");
      s.className = p;
      s.style.borderColor = markSel.value;
      overlay.appendChild(s);
    });

    const del = document.createElement("button");
    del.textContent = "✕";
    del.className = "delete";
    del.onclick = () => {
      const idx = cards.indexOf(cardData);
      if (idx >= 0) cards.splice(idx, 1);
      renderPreview();
    };

    const copies = document.createElement("input");
    copies.type = "number";
    copies.min = 1;
    copies.value = cardData.copies;
    copies.className = "copyInput";
    copies.oninput = (e) => {
      cardData.copies = Math.max(1, parseInt(e.target.value) || 1);
      renderPreview();
    };

    card.append(img, overlay, del, copies);
    grid.append(card);
  });

  preview.append(grid);
}

// ======== PDF GENERATION ========
async function generatePDF(list) {
  const mmToPt = (mm) => (mm / 25.4) * 72;
  const dpi = parseInt(dpiSel.value) || 300;
  const scale = dpi / 300;

  const A4W = mmToPt(210) * scale;
  const A4H = mmToPt(297) * scale;
  const cardW = mmToPt(63) * scale;
  const cardH = mmToPt(88) * scale;
  const gap = mmToPt(3) * scale;
  const bleed = fitSel.value === "bleed" ? mmToPt(1.5) * scale : 0; // 1.5mm bleed all sides

  const layout = layoutSel.value;
  const cols = layout === "8" ? 4 : 3;
  const rows = layout === "8" ? 2 : 3;
  const perPage = cols * rows;

  const marginTopBottom =
    layout === "8" ? mmToPt(10) * scale : mmToPt(8) * scale;
  const marginLeftRight =
    layout === "8" ? mmToPt(10) * scale : mmToPt(4) * scale;

  const pdf = await PDFLib.PDFDocument.create();
  const pages = Math.ceil(list.length / perPage);
  let index = 0;

  for (let p = 0; p < pages; p++) {
    const isLandscape = layout === "8";
    const page = pdf.addPage(isLandscape ? [A4H, A4W] : [A4W, A4H]);
    const pageW = page.getWidth();
    const pageH = page.getHeight();

    // ===== BACKGROUND COLOR =====
    const bgValue = bgSel.value === "custom" ? bgCustom.value : bgSel.value;

    let bgRGB = { r: 1, g: 1, b: 1 };
    if (bgValue.startsWith("#")) {
      const n = parseInt(bgValue.slice(1), 16);
      bgRGB = {
        r: ((n >> 16) & 255) / 255,
        g: ((n >> 8) & 255) / 255,
        b: (n & 255) / 255,
      };
    } else if (bgValue === "black") {
      bgRGB = { r: 0, g: 0, b: 0 };
    }

    if (bgValue === "black") {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pageW,
        height: pageH,
        color: PDFLib.rgb(1, 1, 1),
      });
      page.drawRectangle({
        x: marginLeftRight,
        y: marginTopBottom,
        width: pageW - 2 * marginLeftRight,
        height: pageH - 2 * marginTopBottom,
        color: PDFLib.rgb(0, 0, 0),
      });
    } else {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pageW,
        height: pageH,
        color: PDFLib.rgb(bgRGB.r, bgRGB.g, bgRGB.b),
      });
    }

    // ===== GRID =====
    const totalW = cols * cardW + (cols - 1) * gap;
    const totalH = rows * cardH + (rows - 1) * gap;
    const startX = (pageW - totalW) / 2;
    const startY = (pageH + totalH) / 2 - cardH;

    let x = startX;
    let y = startY;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (index >= list.length) break;
        const imgBytes = await fetch(list[index]).then((r) => r.arrayBuffer());
        let img;
        try {
          img = await pdf.embedJpg(imgBytes);
        } catch {
          img = await pdf.embedPng(imgBytes);
        }

        page.drawImage(img, {
          x: x - bleed,
          y: y - bleed,
          width: cardW + bleed * 2,
          height: cardH + bleed * 2,
        });
        drawMarks(page, x, y, cardW, cardH, markSel.value);
        index++;
        x += cardW + gap;
      }
      x = startX;
      y -= cardH + gap;
    }
  }

  const pdfBytes = await pdf.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `TCG_Print_Sheet_${dpi}DPI.pdf`;
  link.click();
}

// ======== CROP MARKS ========
function drawMarks(page, x, y, w, h, colorHex) {
  const rgb = hexToRgb(colorHex);
  const c = PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255);
  const len = (3 / 25.4) * 72;
  const t = 0.5;
  function mark(x1, y1, dx, dy) {
    page.drawLine({
      start: { x: x1 - len * dx, y: y1 },
      end: { x: x1, y: y1 },
      thickness: t,
      color: c,
    });
    page.drawLine({
      start: { x: x1, y: y1 - len * dy },
      end: { x: x1, y: y1 },
      thickness: t,
      color: c,
    });
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x1 + len * dx, y: y1 },
      thickness: t,
      color: c,
    });
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x1, y: y1 + len * dy },
      thickness: t,
      color: c,
    });
  }
  mark(x, y + h, -1, 1);
  mark(x + w, y + h, 1, 1);
  mark(x, y, -1, -1);
  mark(x + w, y, 1, -1);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

window.addEventListener("resize", renderPreview);
renderPreview();

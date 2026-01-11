// ================= DOM =================
const preview = document.getElementById("preview");
const upload = document.getElementById("upload");

const bgSel = document.getElementById("bg");
const bgCustom = document.getElementById("bgCustom");
const markSel = document.getElementById("markColor");

const layoutSel = document.getElementById("layout");
const dpiSel = document.getElementById("dpi");
const fitSel = document.getElementById("fitMode");
const paperSel = document.getElementById("paper");

const offsetXInput = document.getElementById("offsetX");
const offsetYInput = document.getElementById("offsetY");

const resetCopiesBtn = document.getElementById("resetCopies");
const makepdfBtn = document.getElementById("makepdf");
const status = document.getElementById("status");
const working = document.getElementById("working");

let cards = [];

// ================= EVENTS =================
upload.addEventListener("change", (e) => {
  [...e.target.files].forEach((f) =>
    cards.push({ src: URL.createObjectURL(f), copies: 1 })
  );
  renderPreview();
});

bgSel.addEventListener("change", () => {
  bgCustom.style.display = bgSel.value === "custom" ? "block" : "none";
});

resetCopiesBtn.addEventListener("click", () => {
  cards.forEach((c) => (c.copies = 1));
  renderPreview();
});

makepdfBtn.addEventListener("click", async () => {
  const expanded = expandCards();
  if (!expanded.length) return alert("No cards uploaded");

  working.style.display = "flex";
  try {
    await generatePDF(expanded.map((c) => c.src));
    status.textContent = "✅ PDF generated";
  } catch (e) {
    console.error(e);
    status.textContent = "❌ PDF generation failed";
  } finally {
    working.style.display = "none";
  }
});

// ================= HELPERS =================
const expandCards = () => cards.flatMap((c) => Array(c.copies).fill(c));

// ================= PREVIEW (ALWAYS A4) =================
function renderPreview() {
  preview.innerHTML = "";

  const A4_W = 210;
  const CARD_W = 63;
  const CARD_H = 88;
  const GAP = 3;

  const scale = preview.clientWidth / A4_W;
  const cardW = CARD_W * scale;
  const cardH = CARD_H * scale;
  const gapPx = GAP * scale;

  const cols = 3;
  const expanded = expandCards();

  preview.style.display = "flex";
  preview.style.justifyContent = "center";
  preview.style.alignItems = "center";

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = `repeat(${cols}, ${cardW}px)`;
  grid.style.gap = `${gapPx}px`;

  expanded.forEach((cardData) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.width = `${cardW}px`;
    card.style.height = `${cardH}px`;

    const img = document.createElement("img");
    img.src = cardData.src;
    img.style.objectFit = fitSel.value === "bleed" ? "cover" : "contain";

    const marks = document.createElement("div");
    marks.className = "cropmarks";
    ["tl", "tr", "bl", "br"].forEach((p) => {
      const s = document.createElement("span");
      s.className = p;
      s.style.borderColor = markSel.value;
      marks.appendChild(s);
    });

    const del = document.createElement("button");
    del.className = "delete";
    del.textContent = "✕";
    del.onclick = () => {
      const i = cards.indexOf(cardData);
      if (i > -1) cards.splice(i, 1);
      renderPreview();
    };

    const copyWrap = document.createElement("div");
    copyWrap.className = "copyControl";

    const minus = document.createElement("button");
    minus.textContent = "−";
    minus.onclick = () => {
      cardData.copies = Math.max(1, cardData.copies - 1);
      renderPreview();
    };

    const count = document.createElement("span");
    count.textContent = cardData.copies;

    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.onclick = () => {
      cardData.copies += 1;
      renderPreview();
    };

    copyWrap.append(minus, count, plus);
    card.append(img, marks, del, copyWrap);
    grid.append(card);
  });

  preview.append(grid);
}

// ================= PDF GENERATION (A4 + A3) =================
async function generatePDF(list) {
  const mmToPt = (mm) => (mm / 25.4) * 72;
  const dpi = parseInt(dpiSel.value) || 300;
  const scale = dpi / 300;

  const cardW = mmToPt(63) * scale;
  const cardH = mmToPt(88) * scale;
  const gap = mmToPt(3) * scale;
  const bleed = fitSel.value === "bleed" ? mmToPt(1.5) * scale : 0;

  const offsetX = mmToPt(parseFloat(offsetXInput.value) || 0) * scale;
  const offsetY = mmToPt(parseFloat(offsetYInput.value) || 0) * scale;

  const layout = layoutSel.value;
  const cols = layout === "8" ? 4 : 3;
  const rows = layout === "8" ? 2 : 3;

  const marginTB = layout === "8" ? mmToPt(10) * scale : mmToPt(8) * scale;
  const marginLR = layout === "8" ? mmToPt(10) * scale : mmToPt(4) * scale;

  const A4_W = mmToPt(210) * scale;
  const A4_H = mmToPt(297) * scale;
  const A3_W = mmToPt(420) * scale;
  const GAP_MID = mmToPt(0.4) * scale;

  const gridsPerPage = paperSel.value === "A3" ? 2 : 1;

  const pdf = await PDFLib.PDFDocument.create();
  let index = 0;

  while (index < list.length) {
    const page = pdf.addPage(
      paperSel.value === "A3" ? [A3_W, A4_H] : [A4_W, A4_H]
    );

    const pw = page.getWidth();
    const ph = page.getHeight();

    page.drawRectangle({
      x: 0,
      y: 0,
      width: pw,
      height: ph,
      color: PDFLib.rgb(1, 1, 1),
    });

    for (let g = 0; g < gridsPerPage; g++) {
      if (index >= list.length) break;

      const gridOffsetX =
        paperSel.value === "A3" && g === 1 ? A4_W + GAP_MID : 0;

      page.drawRectangle({
        x: gridOffsetX + marginLR,
        y: marginTB,
        width: A4_W - marginLR * 2,
        height: A4_H - marginTB * 2,
        color: getBGColor(),
      });

      const totalW = cols * cardW + (cols - 1) * gap;
      const totalH = rows * cardH + (rows - 1) * gap;

      let x0 = (A4_W - totalW) / 2 + gridOffsetX + offsetX;
      let y0 = (A4_H + totalH) / 2 - cardH + offsetY;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (index >= list.length) break;

          const imgBytes = await fetch(list[index++]).then((r) =>
            r.arrayBuffer()
          );
          let img;
          try {
            img = await pdf.embedJpg(imgBytes);
          } catch {
            img = await pdf.embedPng(imgBytes);
          }

          page.drawImage(img, {
            x: x0 - bleed,
            y: y0 - bleed,
            width: cardW + bleed * 2,
            height: cardH + bleed * 2,
          });

          drawMarks(page, x0, y0, cardW, cardH, markSel.value);
          x0 += cardW + gap;
        }
        x0 = (A4_W - totalW) / 2 + gridOffsetX + offsetX;
        y0 -= cardH + gap;
      }
    }
  }

  const blob = new Blob([await pdf.save()], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `TCG_Print_${paperSel.value}_${dpi}DPI.pdf`;
  a.click();
}

// ================= UTILITIES =================
function getBGColor() {
  const v = bgSel.value === "custom" ? bgCustom.value : bgSel.value;
  if (v.startsWith("#")) {
    const n = parseInt(v.slice(1), 16);
    return PDFLib.rgb(
      ((n >> 16) & 255) / 255,
      ((n >> 8) & 255) / 255,
      (n & 255) / 255
    );
  }
  return v === "black" ? PDFLib.rgb(0, 0, 0) : PDFLib.rgb(1, 1, 1);
}

function drawMarks(page, x, y, w, h, colorHex) {
  const n = parseInt(colorHex.slice(1), 16);
  const c = PDFLib.rgb(
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255
  );
  const len = (3 / 25.4) * 72,
    t = 0.5;
  const m = (x, y, dx, dy) => {
    page.drawLine({
      start: { x: x - len * dx, y },
      end: { x, y },
      thickness: t,
      color: c,
    });
    page.drawLine({
      start: { x, y: y - len * dy },
      end: { x, y },
      thickness: t,
      color: c,
    });
    page.drawLine({
      start: { x, y },
      end: { x: x + len * dx, y },
      thickness: t,
      color: c,
    });
    page.drawLine({
      start: { x, y },
      end: { x, y: y + len * dy },
      thickness: t,
      color: c,
    });
  };
  m(x, y + h, -1, 1);
  m(x + w, y + h, 1, 1);
  m(x, y, -1, -1);
  m(x + w, y, 1, -1);
}

window.addEventListener("resize", renderPreview);
renderPreview();

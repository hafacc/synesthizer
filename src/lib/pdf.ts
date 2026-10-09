/** module for saving sheet music as a pdf */

import { renderAbc } from "abcjs";
import { jsPDF } from "jspdf";
import "svg2pdf.js";

// US letter in points, with half-inch margins
const pageWidth = 612;
const pageHeight = 792;
const margin = 36;
// width the staves are laid out at before being scaled to the page; four
// bars to a line read well at this size
const layoutWidth = 760;

/** lay abc notation out for a printed page and return it as a pdf file */
export async function abcToPdf(abc: string): Promise<Blob> {
  // abcjs measures as it draws, so the staves must be in the page while it works
  const holder = document.createElement("div");
  holder.style.position = "absolute";
  holder.style.left = "-10000px";
  holder.style.width = `${layoutWidth}px`;
  document.body.append(holder);
  try {
    renderAbc(holder, abc, {
      staffwidth: layoutWidth - 30,
      wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 },
      oneSvgPerLine: true,
      paddingleft: 0,
      paddingright: 0,
    });
    const pdf = new jsPDF({ unit: "pt", format: "letter" });
    const scale = (pageWidth - 2 * margin) / layoutWidth;
    let top = margin;
    for (const system of holder.querySelectorAll("svg")) {
      const { width, height } = system.getBoundingClientRect();
      if (top + height * scale > pageHeight - margin && top > margin) {
        pdf.addPage();
        top = margin;
      }
      await pdf.svg(system, {
        x: margin,
        y: top,
        width: width * scale,
        height: height * scale,
      });
      top += height * scale;
    }
    return pdf.output("blob");
  } finally {
    holder.remove();
  }
}

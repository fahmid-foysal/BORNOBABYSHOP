import React from "react";

const patterns = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112",
];

function encodedPatterns(value) {
  const text = String(value || "");
  if (!text || [...text].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code > 126;
  })) return null;
  const codes = [...text].map((character) => character.charCodeAt(0) - 32);
  const checksum = (104 + codes.reduce((sum, code, index) => sum + code * (index + 1), 0)) % 103;
  return [patterns[104], ...codes.map((code) => patterns[code]), patterns[checksum], patterns[106]];
}

function BarcodeSvg({ value }) {
  const encoded = encodedPatterns(value);
  if (!encoded) return <span>Unsupported barcode</span>;
  const quietZone = 10;
  let cursor = quietZone;
  const bars = [];
  encoded.forEach((pattern, codeIndex) => {
    [...pattern].forEach((width, index) => {
      const modules = Number(width);
      if (index % 2 === 0)
        bars.push(<rect key={`${codeIndex}-${index}`} x={cursor} y="0" width={modules} height="42" />);
      cursor += modules;
    });
  });
  const width = cursor + quietZone;
  return (
    <svg className="barcode-svg" viewBox={`0 0 ${width} 42`} role="img" aria-label={`Barcode ${value}`} preserveAspectRatio="none">
      {bars}
    </svg>
  );
}

export function BarcodePrintSheet({ product, copies }) {
  if (!product || !copies) return null;
  return (
    <div className="barcode-print-sheet" aria-hidden="true">
      {Array.from({ length: copies }, (_, index) => (
        <article className="barcode-label" key={index}>
          <strong>{product.name}</strong>
          <BarcodeSvg value={product.barcode} />
          <b>{product.barcode}</b>
        </article>
      ))}
    </div>
  );
}

export function printBarcodeSheet() {
  const pageStyle = document.createElement("style");
  pageStyle.id = "product-barcode-page-size";
  pageStyle.textContent = "@page { size: 2in 1in; margin: 0; }";
  document.head.appendChild(pageStyle);
  document.body.classList.add("printing-barcodes");
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("printing-barcodes");
    pageStyle.remove();
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  setTimeout(cleanup, 2000);
}

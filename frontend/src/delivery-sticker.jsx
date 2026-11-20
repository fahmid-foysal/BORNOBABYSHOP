import React from "react";
import { money } from "./api";

const value = (order, direct, nested) =>
  order[direct] ?? order.customer?.[nested] ?? "";

export function DeliverySticker({ order }) {
  const consignmentId =
    order.steadfast_consignment_id ?? order.consignment_id ?? "—";
  const cod = order.steadfast_cod_amount ?? order.due ?? 0;
  const note = String(order.notes ?? "").trim();
  const items = Array.isArray(order.items) ? order.items : [];
  const orderDate = new Date(order.created_at || Date.now());
  const printedDate = Number.isNaN(orderDate.getTime())
    ? ""
    : orderDate
        .toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
        .replaceAll(" ", "-");
  return (
    <article className="delivery-sticker">
      <header className="sticker-brand">
        <strong>BORNO BABY SHOP</strong>
        <b>{printedDate}</b>
      </header>
      <div className="sticker-rule" />
      <div className="sticker-sf-id">
        <span>SF-ID:</span>
        <strong>{consignmentId}</strong>
      </div>
      <div className="sticker-rule" />
      <div className="sticker-row">
        <span>Name:</span>
        <strong>{value(order, "cus_name", "cus_name") || "—"}</strong>
      </div>
      <div className="sticker-row">
        <span>Contact:</span>
        <strong>{value(order, "cus_phone", "cus_phone") || "—"}</strong>
      </div>
      <div className="sticker-row sticker-address">
        <span>Address:</span>
        <strong>{value(order, "cus_address", "cus_address") || "—"}</strong>
      </div>
      {note && (
        <div className="sticker-row sticker-note">
          <span>Note:</span>
          <strong>{note}</strong>
        </div>
      )}
      {items.length > 0 && (
        <div className="sticker-items">
          <span>Items:</span>
          <ul>
            {items.map((item, index) => (
              <li
                key={`${item.item_type || "item"}-${item.line_id || item.item_id || index}`}
              >
                <strong>{item.item_name || item.name || "Item"}</strong>
                <b> x {item.quantity}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
      <footer>
        <span>COD:</span>
        <strong>{money(cod)}</strong>
      </footer>
    </article>
  );
}

export function StickerSheet({ orders }) {
  if (!orders?.length) return null;
  return (
    <div className="sticker-print-sheet" aria-hidden="true">
      {orders.map((order) => (
        <DeliverySticker key={order.id} order={order} />
      ))}
    </div>
  );
}

export function printStickerSheet() {
  const pageStyle = document.createElement("style");
  pageStyle.id = "delivery-sticker-page-size";
  pageStyle.textContent = "@page { size: 2in 3in; margin: 0; }";
  document.head.appendChild(pageStyle);
  document.body.classList.add("printing-stickers");
  const printMedia = window.matchMedia("print");
  const fitSingleStickerPage = () => {
    const stickers = document.querySelectorAll(
      ".sticker-print-sheet .delivery-sticker",
    );
    if (stickers.length !== 1) return;

    const height = Math.ceil(stickers[0].getBoundingClientRect().height);
    if (height > 0) {
      // Give Chromium the content's real height so roll-paper drivers cut
      // immediately after the sticker instead of completing a 3-inch page.
      pageStyle.textContent = `@page { size: 2in ${height + 2}px; margin: 0; }`;
    }
  };
  const handlePrintMedia = (event) => {
    if (event.matches) fitSingleStickerPage();
  };
  window.addEventListener("beforeprint", fitSingleStickerPage);
  printMedia.addEventListener("change", handlePrintMedia);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener("beforeprint", fitSingleStickerPage);
    printMedia.removeEventListener("change", handlePrintMedia);
    document.body.classList.remove("printing-stickers");
    pageStyle.remove();
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  setTimeout(cleanup, 2000);
}

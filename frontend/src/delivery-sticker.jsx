import React from "react";
import { money } from "./api";

const value = (order, direct, nested) =>
  order[direct] ?? order.customer?.[nested] ?? "";

export function DeliverySticker({ order }) {
  const consignmentId =
    order.steadfast_consignment_id ?? order.consignment_id ?? "—";
  const cod = order.steadfast_cod_amount ?? order.due ?? 0;
  return (
    <article className="delivery-sticker">
      <header>
        <strong>SF-ID: {consignmentId}</strong>
        <b>INVOICE: ORD-{order.id}</b>
      </header>
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
      <div className="sticker-row sticker-note">
        <span>Note:</span>
        <strong>{order.notes || "—"}</strong>
      </div>
      <div className="sticker-items">
        <span>Items:</span>
        <ul>
          {(order.items || []).map((item, index) => (
            <li key={`${item.item_type || "item"}-${item.line_id || item.item_id || index}`}>
              <strong>{item.item_name || item.name || "Item"}</strong>
              <b> x {item.quantity}</b>
            </li>
          ))}
        </ul>
      </div>
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
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("printing-stickers");
    pageStyle.remove();
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  setTimeout(cleanup, 2000);
}

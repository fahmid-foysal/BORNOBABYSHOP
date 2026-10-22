import React from "react";
import { money } from "./api";
export function Receipt({ sale }) {
  return (
    <div className="receipt" id="pos-receipt">
      <img src="/logo.png" alt="Borno Baby Shop" />
      <h2>{import.meta.env.VITE_SHOP_NAME || "Borno Baby Shop"}</h2>
      {import.meta.env.VITE_SHOP_ADDRESS && (
        <p>{import.meta.env.VITE_SHOP_ADDRESS}</p>
      )}
      {import.meta.env.VITE_SHOP_PHONE && (
        <p>Phone: {import.meta.env.VITE_SHOP_PHONE}</p>
      )}
      <p>A little joy, every day.</p>
      <hr />
      <p>
        <strong>
          {sale.channel === "online" ? "ORD" : "POS"}-{sale.id}
        </strong>
        <br />
        {sale.created_at}
        <br />
        {sale.cus_name} · {sale.cus_phone}
        <br />
        {sale.cus_address}
      </p>
      {sale.sales_person_name && <p>Served by: {sale.sales_person_name}</p>}
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty × Rate</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((i, n) => (
            <tr key={n}>
              <td>
                {i.item_name}
                <small>{i.barcode}</small>
              </td>
              <td>
                {i.quantity} × {Number(i.rate).toFixed(2)}
              </td>
              <td>{Number(i.quantity * i.rate).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />
      {[
        ["Subtotal", sale.subtotal],
        ["Discount", sale.discount],
        ["Delivery", sale.delivery_charge],
        ["Payable", sale.payable],
        ["Paid", sale.paid],
        ["Due", sale.status === "returned" ? 0 : sale.due],
      ].map(([k, v]) => (
        <div className="receipt-line" key={k}>
          <span>{k}</span>
          <strong>{money(v)}</strong>
        </div>
      ))}
      <hr />
      {sale.payments.map((p) => (
        <p key={p.id}>
          {p.method}: {money(p.amount)}
          {p.amount < 0 ? " (refund)" : ""}
        </p>
      ))}
      {sale.notes && <p>Note: {sale.notes}</p>}
      <p className="receipt-thanks">
        Thank you for shopping with us!
        <br />
        Big smiles. Little treasures.
      </p>
    </div>
  );
}

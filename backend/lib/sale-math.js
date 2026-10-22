const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
function totals(items, discount = 0, delivery = 0, paid = 0) {
  const subtotal = round(
    items.reduce((s, i) => s + round(Number(i.quantity) * Number(i.rate)), 0),
  );
  const payable = round(subtotal - Number(discount) + Number(delivery));
  return {
    subtotal,
    discount: Number(discount),
    delivery_charge: Number(delivery),
    payable,
    paid: Number(paid),
    due: round(Math.max(0, payable - paid)),
    overpaid: round(Math.max(0, paid - payable)),
  };
}
function expandComponents(items, combos) {
  const quantities = new Map();
  for (const item of items) {
    const components =
      item.item_type === "combo"
        ? combos.get(String(item.item_id))
        : [{ product_id: item.item_id, quantity: 1 }];
    if (!components?.length) throw new Error("Combo has no products");
    for (const c of components)
      quantities.set(
        String(c.product_id),
        (quantities.get(String(c.product_id)) || 0) +
          Number(item.quantity) * Number(c.quantity),
      );
  }
  return quantities;
}
module.exports = { round, totals, expandComponents };

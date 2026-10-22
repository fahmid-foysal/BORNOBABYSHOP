const { test } = require("node:test");
const assert = require("node:assert/strict");
const { totals, expandComponents } = require("../lib/sale-math");
test("discount, delivery and advance payment yield the courier COD", () => {
  assert.deepEqual(totals([{ quantity: 2, rate: 100 }], 50, 80, 20), {
    subtotal: 200,
    discount: 50,
    delivery_charge: 80,
    payable: 230,
    paid: 20,
    due: 210,
    overpaid: 0,
  });
});
test("repeated products across combos and direct items accumulate correctly", () => {
  const items = [
    { item_type: "product", item_id: 1, quantity: 2 },
    { item_type: "combo", item_id: 7, quantity: 3 },
    { item_type: "combo", item_id: 8, quantity: 2 },
  ];
  const combos = new Map([
    [
      "7",
      [
        { product_id: 1, quantity: 2 },
        { product_id: 2, quantity: 1 },
      ],
    ],
    ["8", [{ product_id: 1, quantity: 3 }]],
  ]);
  assert.deepEqual(
    [...expandComponents(items, combos)],
    [
      ["1", 14],
      ["2", 3],
    ],
  );
});
test("decimal amounts round to cents and identify overpayment", () => {
  assert.equal(totals([{ quantity: 3, rate: 0.1 }], 0, 0, 1).overpaid, 0.7);
});
test("empty combos are rejected", () => {
  assert.throws(
    () =>
      expandComponents(
        [{ item_type: "combo", item_id: 7, quantity: 1 }],
        new Map([["7", []]]),
      ),
    /no products/,
  );
});

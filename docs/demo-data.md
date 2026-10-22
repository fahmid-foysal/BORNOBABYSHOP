# Demo data

Inserted in `bornobabyshop_db`. Records use [Demo] names and BORNO_DEMO_V1 notes. Online sales and courier tables are untouched.

30 offline sales include paid, due, returned, discounts, multiple payment methods, and follow-up collections. Dates cover the current month, including today. Existing users and their passwords are unchanged.

## Product barcodes

| Barcode | Product                         | Stock | Sale price | Status   |
| ------- | ------------------------------- | ----- | ---------- | -------- |
| 892N1   | [Demo] Magnetic Building Blocks | 76    | 650        | active   |
| YSPNK   | [Demo] Wooden Alphabet Puzzle   | 72    | 320        | active   |
| 0MLKO   | [Demo] Rainbow Stacking Rings   | 74    | 290        | active   |
| PR746   | [Demo] Counting Beads Board     | 75    | 390        | active   |
| 2KLNU   | [Demo] Soft Teddy Bear          | 73    | 480        | active   |
| 3ZO5V   | [Demo] Bunny Plush              | 72    | 350        | active   |
| 8GFP1   | [Demo] Mini Racing Car          | 73    | 220        | active   |
| DTABU   | [Demo] Pull Back School Bus     | 74    | 330        | active   |
| AI9CB   | [Demo] Dinosaur Figure Set      | 77    | 550        | active   |
| WDZSF   | [Demo] Farm Animal Set          | 78    | 420        | active   |
| QNYC4   | [Demo] Kids Watercolor Kit      | 76    | 280        | active   |
| RU30N   | [Demo] Washable Crayon Box      | 74    | 170        | active   |
| QRK4R   | [Demo] Junior Doctor Kit        | 77    | 520        | active   |
| GE3OM   | [Demo] Mini Kitchen Play Set    | 76    | 790        | active   |
| I75IC   | [Demo] Bubble Wand              | 78    | 100        | active   |
| ZELU6   | [Demo] Soft Football            | 77    | 300        | active   |
| IJZ0E   | [Demo] Shape Sorting Cube       | 79    | 450        | active   |
| X2FHC   | [Demo] Wooden Train Set         | 77    | 850        | active   |
| 9Y2HM   | [Demo] Space Jigsaw Puzzle      | 77    | 260        | active   |
| SM8S5   | [Demo] Number Flash Cards       | 76    | 140        | active   |
| DZDWE   | [Demo] Large Building Brick Box | 78    | 990        | active   |
| 9INZO   | [Demo] Princess Doll            | 77    | 440        | active   |
| 6IARJ   | [Demo] Sensory Squeeze Ball     | 3     | 150        | active   |
| 121NI   | [Demo] Classic Robot (Inactive) | 20    | 600        | inactive |

## Combo barcodes

| Barcode | Combo                            | Sale price |
| ------- | -------------------------------- | ---------- |
| TNOOV   | [Demo] Learning Starter Bundle   | 1584       |
| CVA2D   | [Demo] Cuddle and Play Bundle    | 1008       |
| 90STV   | [Demo] Little Racer Bundle       | 693        |
| JX2XA   | [Demo] Creative Afternoon Bundle | 792        |

Run `npm run seed:demo` in backend to insert this dataset once; reruns skip it. This command does not reset edited demo records.

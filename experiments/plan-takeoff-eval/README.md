# Plan Takeoff Capability Spike

Branch: `experiment/plan-takeoff-eval`

This is a contained experiment to test whether GPT-5.5 can import public construction plans, mark up mechanical/HVAC/plumbing routing, and produce a material takeoff that an estimator could review.

## Public Plan Sources

Downloaded into `source/` for local inspection only:

| Source | URL | Used for |
| --- | --- | --- |
| Airport Terminal and Hangar Development, Defuniak Springs Municipal Airport | https://dominguezdesign-build.com/wp-content/uploads/2022/05/Release-for-Bid-Drawings-DFS-Terminal-and-Hangar-Development-11-1-2021-1.pdf | Primary HVAC/plumbing takeoff attempt |
| Brazos Transit District Lufkin Maintenance Facility | https://btd.org/wp-content/uploads/2025/05/BTD-Lufkin-ProjectDrawings.pdf | Candidate plan set; confirmed mechanical sheets exist |
| City of Roswell WWTP Dewatering Facility contract drawings | https://roswell-nm.gov/DocumentCenter/View/16150 | Candidate process/mechanical plan set; less useful for HVAC duct takeoff |

## Generated Artifacts

| Artifact | Purpose |
| --- | --- |
| `output/dfs-p129-m102.png` | Rendered source sheet `M-102 Mechanical 1st Floor Plan - Area A` |
| `output/dfs-p165-p102.png` | Rendered source sheet `P-102 Plumbing 1st Floor Plan - Area A` |
| `marked-up/dfs-m102-hvac-takeoff-markup.png` | GPT-created HVAC color markup |
| `marked-up/dfs-p102-plumbing-takeoff-markup.png` | GPT-created plumbing color markup |
| `output/dfs-takeoff-quantities.json` | Segment-based quantity summary |

## Takeoff Attempt

Scale assumption: rendered 24x36 sheet at `4896x3168` px; plan scale is `1/8" = 1'-0"`, so the rough conversion used was `17 px = 1 LF`.

### HVAC, DFS M-102

| System | Size/category | First-pass quantity |
| --- | --- | ---: |
| Supply air | 16 in round fabric duct | 103 LF |
| Supply air | Main round duct, 22 in | 86 LF |
| Supply air | Rectangular duct, 16x12 to 24x16 | 61 LF |
| Supply air | Rectangular duct, 14x10 to 16x12 | 52 LF |
| Supply air | Rectangular branch duct, 8x6 to 12x12 | 71 LF |
| Supply air | 6 in round diffuser branches | 34 LF |
| Return air | Return/transfer duct, 10x10 to 14x12 | 50 LF |
| Exhaust air | Exhaust duct, 6x4 to 10x8 | 83 LF |

### Plumbing, DFS P-102

| System | Size/category | First-pass quantity |
| --- | --- | ---: |
| Sanitary waste | 4 in SAN | 122 LF |
| Sanitary waste | 3 in SAN | 80 LF |
| Vent | 2 in VTR / vent | 50 LF |
| Domestic cold water | 1-1/4 to 2-1/2 in CW | 153 LF |
| Domestic cold water | 3/4 to 1-1/2 in CW branches | 68 LF |
| Domestic hot water | 3/4 to 1-1/2 in HW/HWR | 81 LF |

## Verification Notes

What worked:

- Found real public construction plan PDFs without relying on synthetic examples.
- Indexed PDFs and located relevant sheets using text extraction.
- Rendered sheets locally without Poppler/ImageMagick by using the repo's existing `pdfjs-dist` and `@napi-rs/canvas`.
- Produced reviewable colored markups and a reproducible JSON quantity rollup.

What failed or is not estimator-grade:

- The visual trace is approximate. Several dense restroom/ceiling areas need a human pass to separate overlapping pipe/duct systems.
- The linework is centerline-based and does not account for fittings, elbows, takeoffs, transitions, dampers, hangers, insulation, waste factors, or vertical offsets.
- Some systems were grouped into size ranges instead of exact size-by-size bins because labels are sparse or overlap the routed lines.
- Scale was inferred from sheet size and printed scale, not calibrated against a known dimension line.
- The plumbing plan explicitly says routing is schematic; exact field offsets are not represented.

## Verdict

GPT-5.5 can create a useful first-pass markup and rough takeoff on real plans, but this is not reliable enough as a one-shot estimator replacement. The likely product shape is an assisted takeoff workflow:

1. Auto-detect sheets and legends.
2. Ask the estimator to confirm scale and target scope.
3. Produce colored system traces and quantity tables.
4. Let the estimator correct missed/extra runs directly on the plan.
5. Recompute takeoff from the reviewed trace geometry.

The capability is promising as a review accelerator, not yet as an autonomous final takeoff.

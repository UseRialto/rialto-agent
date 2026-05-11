# Spec RAG Vendor Test Quotes

Use the same RFQ twice: submit one "good" vendor quote and one "bad" vendor quote.

Put the important product text in **Quoted product details**. That is the field the Spec RAG compares against the uploaded project spec manual.

## Good Vendor Quote

Expected result: mostly `compliant`.

```csv
requested_sku,vendor_sku,quoted_quantity,unit_price,lead_time_days,quoted_product_details,substitution_notes
MB-PORC-8LCS,CL-8LCS-PE-2448,24,420,21,"Claridge Series 8 LCS porcelain enamel steel markerboard. Magnetic 24 gauge steel facing, Type A acid-resistant porcelain enamel, low gloss white, 3/8 in particleboard core, 0.002 in aluminum foil backing. Concealed fasteners included.","Basis of design product."
MB-MUSIC-STAVE,CL-8LCS-MUSIC,6,565,28,"Claridge Series 8 LCS markerboard with factory-applied permanent music staff markings. Same porcelain enamel magnetic steel construction as markerboard base item.","Factory-applied permanent markings."
TB-CORK-1100,CL-1100-CORK,18,310,21,"Claridge Series 1100 cork bulletin board. 1/4 in self-healing cork composite bonded to jute backing, 1/4 in tempered hardboard backing, washable cork surface, factory frame trim. Up to 4 architect-selected colors from full range.","Basis of design product."
TB-ADH-VOC,CL-ADH-LOWVOC,18,38,14,"Manufacturer-recommended tackboard adhesive for permanent full-surface adhesion. VOC content 35 g/L by EPA Method 24. Compatible with quoted cork tackboards.","Low-VOC adhesive quoted separately."
TRIM-MAPRAIL,CL-MAPRAIL-CORK,24,92,21,"Integral head trim map rail for markerboards with cork insert color matched to tackboard selection. Includes end stops.","Claridge standard maprail equal."
TRAY-MARKER,CL-BLADE-TRAY,24,44,21,"Solid ribbed blade-type marker tray with narrow profile and injection molded end closures.","Claridge blade-type marker trough equal."
HOOK-MAP-51M,CL-51M,96,7,14,"Aluminum spring-clip map hooks designed for specified map rail. Four hooks provided per map rail.","Claridge No. 51M equal."
FLAG-HOLDER-51FH,CL-51FH,24,18,14,"Aluminum flag holder designed for specified map rail. One flag holder provided per map rail.","Claridge No. 51FH equal."
```

## Bad Vendor Quote

Expected result: clear `violation` findings.

```csv
requested_sku,vendor_sku,quoted_quantity,unit_price,lead_time_days,quoted_product_details,substitution_notes
MB-PORC-8LCS,ECON-WB-MEL-2448,24,145,10,"Economy non-magnetic melamine whiteboard over 1/8 in MDF core. Gloss white surface. No porcelain enamel steel facing and no aluminum foil backing.","Substitute for cost savings."
MB-MUSIC-STAVE,ECON-WB-TAPE-MUSIC,6,175,10,"Melamine whiteboard with removable vinyl music staff tape applied in field. Non-magnetic surface.","Field-applied markings."
TB-CORK-1100,FOAM-TACK-125,18,95,7,"1/8 in foam-backed cork-look tack panel. No jute backing, no hardboard backing, not washable. Available in tan only.","Alternate tack surface."
TB-ADH-VOC,STD-CONTACT-210VOC,18,22,5,"Standard contact adhesive with VOC content 210 g/L. Not tested under EPA Method 24 for this application.","General-purpose adhesive."
TRIM-MAPRAIL,SNAP-RAIL-NOCORK,24,55,10,"Surface-mounted aluminum map rail without cork insert and without color matching to tackboard. End stops not included.","Alternate rail."
TRAY-MARKER,PLASTIC-SHELF-2IN,24,19,7,"Flat plastic marker shelf, 2 in deep, with open ends. Not blade-type and no injection molded end closures.","Generic tray."
HOOK-MAP-51M,STEEL-SHOOK,96,2,5,"Steel S-hooks not designed for the specified map rail.","Generic hook substitute."
FLAG-HOLDER-51FH,PLASTIC-FLAG-CLIP,24,6,5,"Plastic clip-on flag holder, not aluminum and not designed for specified map rail.","Generic holder substitute."
```

## What The Bad Quote Should Trigger

- `MB-PORC-8LCS`: violates porcelain enamel steel, magnetic facing, minimum steel gauge, core, and foil backing requirements.
- `MB-MUSIC-STAVE`: violates permanent/factory-applied staff marking requirement and base markerboard construction.
- `TB-CORK-1100`: violates cork thickness, jute backing, hardboard backing, washable surface, color range, and factory trim requirements.
- `TB-ADH-VOC`: violates 50 g/L VOC maximum and EPA Method 24 requirement.
- `TRIM-MAPRAIL`: violates integral map rail, cork insert, color matching, and end stop requirements.
- `TRAY-MARKER`: violates blade-type tray and injection molded end closure requirements.
- `HOOK-MAP-51M`: violates aluminum spring-clip map rail hook requirement.
- `FLAG-HOLDER-51FH`: violates aluminum flag holder designed for map rail requirement.

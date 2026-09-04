# Design QA — Inventory redesign

final result: passed

## Evidence

- Source visual truth: `C:/Users/Nicole/AppData/Local/Temp/codex-clipboard-dce69119-cde2-4676-a0cf-b58dc0fd95b1.png`
- Preserved normalized source: `C:/Users/Nicole/Desktop/Pruebas nicole/PRUEBAS/App de la compra/qa/source-normalized-final.png`
- Final wide implementation: `C:/Users/Nicole/Desktop/Pruebas nicole/PRUEBAS/App de la compra/qa/implementation-942x1678-final2.png`
- Final mobile implementation: `C:/Users/Nicole/Desktop/Pruebas nicole/PRUEBAS/App de la compra/qa/implementation-mobile-390x844-final2.png`
- Full-view comparison: `C:/Users/Nicole/Desktop/Pruebas nicole/PRUEBAS/App de la compra/qa/comparison-final.png`
- Focused product-card comparison: `C:/Users/Nicole/Desktop/Pruebas nicole/PRUEBAS/App de la compra/qa/comparison-products-final.png`
- State: inventory, “Todo” selected, demo household populated with eight realistic products. The source uses different dynamic inventory data (17 lots), so copy differences in product names and counts were not treated as visual drift.

## Viewport and normalization

- Source pixels: 941 × 1672.
- Requested comparison CSS viewport: 942 × 1678 at deviceScaleFactor 1.
- Browser-rendered wide evidence: 927 × 1044 pixels. The Codex in-app browser kept the requested CSS viewport but captured its visible panel surface at 927 × 1044.
- Normalization: the source was resized to 927 pixels wide and cropped to the same 927 × 1044 visible region. The two equal-size images were then combined horizontally in `comparison-final.png`.
- Mobile resilience viewport: 390 × 844 CSS pixels at deviceScaleFactor 1; captured app surface: 375 × 812 pixels after browser chrome/scrollbar exclusion.

## Final comparison

- Fonts and typography: DM Serif Display now provides the reference’s editorial display treatment for the inventory title and product names; Geist remains the established app body face. Weight, line height, and wrapping remain readable at both tested widths.
- Spacing and layout rhythm: the cream hero, search/filter surface, two-column wide grid, rounded product cards, circular imagery, and segmented action footer reproduce the source hierarchy. At 390 px the grid intentionally becomes one column to keep the real “Abrir / Usar / Terminar” controls usable.
- Colors and tokens: the existing warm ivory and forest-green product palette already matched the source. Status pills add restrained red, amber, and green semantic color with sufficient text contrast.
- Image quality: all active Supabase product names map to centered 640 × 640 WebP product imagery. The grocery-crate hero has separate wide and mobile crops. No emoji, CSS art, stretched screenshot, or sprite-sheet crop is used by the redesigned cards.
- Copy and content: permanent UI copy matches the Spanish family-inventory context. Dynamic dates, counts, locations, opening guidance, and expiry states remain data-driven.
- Icons: the existing Lucide family is retained consistently because it is the established icon system in this product. Edit, storage, status, action, search, and navigation icons are optically aligned and have accessible labels where the icon is the only visible content.
- Accessibility and resilience: buttons remain semantic and keyboard reachable; decorative images use empty alt text; icon-only discard buttons include item-specific labels; mobile controls remain visible above the safe-area bottom navigation; no overlap or clipped persistent control remains at 390 px.

## Primary interactions tested

- Nevera filter: returned five demo products.
- Search for “Leche”: returned only “Leche fresca”.
- Otro filter: displayed the empty-result state.
- Returning to Todo: restored all eight demo products.
- “Añadir manualmente”: opened the complete product dialog without saving or mutating inventory data.
- Production console at `127.0.0.1:8787`: zero current-origin errors. Earlier `localhost:3000/@vite/client` messages were isolated to the development HMR overlay and were not present in the production build.

## Comparison history

### Pass 1 — blocked

- P1 mobile hero overlap: the crate covered “Inventario”, the lot count, and part of the primary button.
- P2 mobile filters: the filter strip exposed a scrollbar and clipped “Otro”.
- P2 asset shape: product imagery used rounded squares rather than the source’s circular presentation.

Fixes: introduced a dedicated mobile hero crop and breakpoint treatment, converted the filters to five responsive equal tracks, and changed large product imagery to circular masks.

Post-fix evidence: `qa/implementation-mobile-390x844-pass3b.png`.

### Pass 2 — blocked

- P2 mobile hero integration: the first mobile crop had a visible rectangular cream edge against the hero surface.

Fix: placed the dedicated mobile crop in a circular, overflow-hidden image field with matching cream background and adjusted its position away from all text and controls.

Post-fix evidence: `qa/implementation-mobile-390x844-final2.png`.

### Final pass — passed

No actionable P0, P1, or P2 findings remain. The source’s simulated iOS status bar is device chrome rather than app content, and the existing PWA safe-area header continues to handle it in installed mode.

## Follow-up polish

- P3: future unknown product names use the generated generic grocery image until a product-specific mapping is added.

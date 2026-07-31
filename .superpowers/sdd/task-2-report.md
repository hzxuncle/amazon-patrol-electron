# Task 2 Report: 站点目录 — us/ca/au/mx

## Status: DONE

## Changes Made

Created 6 new files across 4 site directories under `renderer/sites/`:

- `renderer/sites/us/selectors.js` — US-specific selectors (acBadge: 1 selector)
- `renderer/sites/ca/selectors.js` — CA-specific selectors (acBadge: 2 selectors)
- `renderer/sites/au/selectors.js` — AU-specific selectors (acBadge: 2 selectors)
- `renderer/sites/mx/selectors.js` — MX-specific selectors (acBadge: 1 selector)
- `renderer/sites/mx/parsers.js` — MX extractRating supporting "X de 5 estrellas" Spanish format
- `renderer/sites/mx/normalizers.js` — MX normalizeStock supporting Disponible/No disponible/Agotado

All files follow the no-require-inside-functions constraint and use the module.exports guard pattern.

## Commits made
- `b296d84` - feat: add per-site scraper configs (us/ca/au/mx)

## One-line test summary
17/17 assertions passed: selectors load correctly, MX extractRating handles EN/ES/null, MX normalizeStock handles Disponible→In Stock, No disponible→Out of Stock, Agotado→Out of Stock, limited stock, and null.

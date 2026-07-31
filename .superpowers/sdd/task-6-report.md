# Task 6 Report: fullpage.js — 渲染层全面改用 code

## Status: DONE

## Commits Made
- `0a5da12` refactor: fullpage.js uses site code throughout - dropdowns, getSiteLabel, findRef, buildTasks

## Changes Made

### renderer/fullpage.js

1. **renderGroupCard()** — `val = s.code` (was `` `www.${s.domain}` ``); option values are now two-letter codes (CA, US, etc.)
2. **refreshAllGroupOptions()** — same `val = s.code` change
3. **initSiteGroups()** — default site = `enabledSites[0].code` (was `` `www.${enabledSites[0].domain}` ``); fallback `'CA'` (was `'www.amazon.ca'`)
4. **btnAddGroup handler** — `usedSites.has(s.code)` lookup and `renderGroupCard(next.code, '')` call
5. **buildTasks()** — both `siteFound` lookups changed from `` `www.${s.domain}` === site `` to `s.code === site`
6. **autoFillAsinGroups()** — `siteFound` lookup changed from `` `www.${s.domain}` === g.site `` to `s.code === g.site`
7. **getSiteLabel()** — renamed param to `siteCode`; code-first (returns code directly if no dot); falls back to domain match for legacy data
8. **findRef()** — simplified to direct `r.site === site` match; removed domain-conversion compatibility code
9. **processFile()** — changed normalization block: now converts imported site values to code (not to `www.domain`); handles both domain-format and short-code inputs

## Test Summary
`node --check renderer/fullpage.js` passes (exit 0, no output). No automated tests; manual test path: open app → site-group dropdowns show codes (CA, US…) as values; import Excel → site normalized to code in referenceData; autoFillAsinGroups matches by code.

## Concerns
None.

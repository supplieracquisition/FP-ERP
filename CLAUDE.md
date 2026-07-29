@AGENTS.md


## In progress
- Pulling fabric details per style (New Exclusives sheet) and supplier details per style (FPE Database sheet) into the ERP.
- Not finished yet.
## Fabric/supplier sync — WORKING
- Endpoint: POST /api/po-builder/sync-fabric-data
- Syncs MTO sheet + HJA Content sheet → fabric_details, fabric_colors, fpe_suppliers tables
- Both CSV parsers use header-mapping + relax_column_count (handle the sheets' quirks)
- To re-sync after updating a sheet: re-run the curl (paths in po builder data/)
- Gotcha: if code changes seem ignored, a stale dev server may be holding port 3000.
  Ctrl+C only kills the terminal you press it in — check for zombies, kill the PID.
GeoHistory Audit (FULL INLINE v3)
Root: C:\GeoHistory
RepoRoot (git): C:/GeoHistory
Generated: 2025-10-25 16:50:37
Files scanned: 251

Outputs:
- inventory.csv
- inventory_frontend.csv / inventory_backend.csv (se cartelle esistono)
- presence_frontend_backend.csv
- supabase_scan.csv
- summary_by_extension.csv
- summary_by_topfolder.csv
- duplicates_by_hash.csv
- git_status_counts.csv

Interpretazione:
1) Se 'presence_frontend_backend.csv' mostra 'Missing' per layout/middleware/client/server/provider =>
   quei file vanno creati (ti fornirò la sostituzione completa).
2) Se 'supabase_scan.csv' mostra 'window.supabase' o molte istanze 'createClient' nei componenti =>
   probabile causa di perdita sessione; passiamo a auth-helpers con cookie + middleware.

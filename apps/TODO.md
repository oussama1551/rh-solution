# Plan de correction - Synchronisation initiale BioTime

## Étapes

- [x] Plan approuvé
- [x] 1. `biotime.types.ts` - Ajouter le type `ProgressCallback`
- [x] 2. `biotime-client.service.ts` - Ajouter callback de progression à `paginatedGet()` et `listTransactions()`
- [x] 3. `sync.service.ts` - Ajouter `BIOTIME_INITIAL_PUNCH_LOOKBACK_DAYS`, modifier `pullAll()`, ajouter logs progression, ajouter `backfillPunches()`
- [x] 4. `sync.controller.ts` - Ajouter endpoint `POST /backfill-punches`
- [x] 5. Vérification finale ✓


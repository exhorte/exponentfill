| engine | document | kind | s | recall (accents kept) | recall (folded) | order | tables | note |
|---|---|---|---|---|---|---|---|---|
| pypdf | cv_fr_simple.pdf | text | 0.933 | 1.0 | 1.0 | 1.0 | 0 |  |
| pypdf | cv_fr_two_columns.pdf | text | 0.01 | 1.0 | 1.0 | 1.0 | 0 |  |
| pypdf | cv_fr_interleaved.pdf | layout-hard | 0.005 | 0.875 | 0.875 | — | 0 |  |
| pypdf | cv_en_simple.pdf | text | 0.007 | 1.0 | 1.0 | 1.0 | 0 |  |
| pypdf | diplome_fr.pdf | certificate | 0.004 | 1.0 | 1.0 | — | 0 |  |
| pypdf | releve_notes_fr.pdf | table | 0.008 | 1.0 | 1.0 | — | 0 |  |
| pypdf | facture_domicile_fr.pdf | bill | 0.006 | 1.0 | 1.0 | — | 0 |  |
| pypdf | cv_fr_long.pdf | long | 0.036 | 1.0 | 1.0 | — | 0 |  |
| pypdf | cv_fr_scanned.pdf | scanned | 0.003 | 0.0 | 0.0 | — | 0 | no text layer (scanned document?) — OCR needed |
| pdfminer.six | cv_fr_simple.pdf | text | 1.047 | 1.0 | 1.0 | 1.0 | 0 |  |
| pdfminer.six | cv_fr_two_columns.pdf | text | 0.016 | 1.0 | 1.0 | 1.0 | 0 |  |
| pdfminer.six | cv_fr_interleaved.pdf | layout-hard | 0.01 | 0.875 | 0.875 | — | 0 |  |
| pdfminer.six | cv_en_simple.pdf | text | 0.014 | 1.0 | 1.0 | 1.0 | 0 |  |
| pdfminer.six | diplome_fr.pdf | certificate | 0.01 | 1.0 | 1.0 | — | 0 |  |
| pdfminer.six | releve_notes_fr.pdf | table | 0.017 | 1.0 | 1.0 | — | 0 |  |
| pdfminer.six | facture_domicile_fr.pdf | bill | 0.014 | 1.0 | 1.0 | — | 0 |  |
| pdfminer.six | cv_fr_long.pdf | long | 0.079 | 1.0 | 1.0 | — | 0 |  |
| pdfminer.six | cv_fr_scanned.pdf | scanned | 0.003 | 0.0 | 0.0 | — | 0 | no text layer (scanned document?) — OCR needed |
| pypdfium2 | cv_fr_simple.pdf | text | 0.889 | 1.0 | 1.0 | 1.0 | 0 |  |
| pypdfium2 | cv_fr_two_columns.pdf | text | 0.004 | 1.0 | 1.0 | 1.0 | 0 |  |
| pypdfium2 | cv_fr_interleaved.pdf | layout-hard | 0.004 | 0.875 | 0.875 | — | 0 |  |
| pypdfium2 | cv_en_simple.pdf | text | 0.005 | 1.0 | 1.0 | 1.0 | 0 |  |
| pypdfium2 | diplome_fr.pdf | certificate | 0.004 | 1.0 | 1.0 | — | 0 |  |
| pypdfium2 | releve_notes_fr.pdf | table | 0.005 | 1.0 | 1.0 | — | 0 |  |
| pypdfium2 | facture_domicile_fr.pdf | bill | 0.004 | 1.0 | 1.0 | — | 0 |  |
| pypdfium2 | cv_fr_long.pdf | long | 0.011 | 1.0 | 1.0 | — | 0 |  |
| pypdfium2 | cv_fr_scanned.pdf | scanned | 0.003 | 0.0 | 0.0 | — | 0 | no text layer (scanned document?) — OCR needed |
| docling | cv_fr_simple.pdf | text | 189.607 | 1.0 | 1.0 | 1.0 | 0 |  |
| docling | cv_fr_two_columns.pdf | text | 3.647 | 1.0 | 1.0 | 1.0 | 0 |  |
| docling | cv_fr_interleaved.pdf | layout-hard | 3.174 | 0.875 | 0.875 | — | 0 |  |
| docling | cv_en_simple.pdf | text | 3.27 | 1.0 | 1.0 | 1.0 | 0 |  |
| docling | diplome_fr.pdf | certificate | 3.278 | 1.0 | 1.0 | — | 0 |  |
| docling | releve_notes_fr.pdf | table | 8.335 | 1.0 | 1.0 | — | 1 |  |
| docling | facture_domicile_fr.pdf | bill | 6.915 | 1.0 | 1.0 | — | 1 |  |
| docling | cv_fr_long.pdf | long | 6.374 | 1.0 | 1.0 | — | 0 |  |
| docling | cv_fr_scanned.pdf | scanned | 16.368 | 0.643 | 0.643 | — | 0 |  |
| liteparse-wasm | cv_fr_simple.pdf | text | 0.15 | 1 | 1 | 1 | — | needsOcr: sparse-text |
| liteparse-wasm | cv_fr_two_columns.pdf | text | 0.011 | 1 | 1 | 1 | — | needsOcr: sparse-text |
| liteparse-wasm | cv_fr_interleaved.pdf | layout-hard | 0.012 | 0.875 | 0.875 | — | — | needsOcr: sparse-text |
| liteparse-wasm | cv_en_simple.pdf | text | 0.012 | 1 | 1 | 1 | — | needsOcr: sparse-text |
| liteparse-wasm | diplome_fr.pdf | certificate | 0.023 | 1 | 1 | — | — | needsOcr: sparse-text |
| liteparse-wasm | releve_notes_fr.pdf | table | 0.017 | 0.7 | 0.7 | — | — | needsOcr: sparse-text |
| liteparse-wasm | facture_domicile_fr.pdf | bill | 0.008 | 1 | 1 | — | — | needsOcr: sparse-text |
| liteparse-wasm | cv_fr_long.pdf | long | 0.026 | 1 | 1 | — | — |  |
| liteparse-wasm | cv_fr_scanned.pdf | scanned | 0.004 | 0 | 0 | — | — | needsOcr: scanned |

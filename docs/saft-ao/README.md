# SAF-T (AO) reference files

Source: https://github.com/assoft-portugal/SAF-T-AO (commit ed86c7d, 2026-04-27).
The XSD names AGT (Administração Geral Tributária) as author; ASSOFT maintains the repo, and certified Angolan software vendors use it.

- xsd/SAFTAO1.01_01.xsd: SAF-T (AO) schema v1.01_01, namespace urn:OECD:StandardAuditFile-Tax:AO_1.01_01.
  Use it for the invoicing file (TaxAccountingBasis "F" = Facturação). Validate every generated file against it in tests.
- examples/TaxExemptions.json|xml: exemption codes with reasons (cross-check against the AGT e-invoicing spec table).
- examples/SAF-T AO (PurchaseInvoices).xml: sample file for purchases.
- legislation/: Decreto Presidencial 312/18, Decreto Executivo 317/20 (SAF-T data structure, with field-by-field rules),
  Decreto Presidencial 71/25 (Regime Jurídico das Facturas), Decreto Executivo 683/25 (e-invoicing data structure/model).
  Only 317/20 has extractable text; the others are scans.

NOT included: the SAF-T de Inventários structure. It is separate from this XSD and is defined by
Circular n.º 05/GACA/GJ/DSF/AGT/2026 (XML, JSON or CSV/Excel, submitted via Portal do Contribuinte).
Required fields per public summaries: product code, description, product type, quantity at 31 Dec, unit of measure,
total book value, costing method. Do not finalize the inventory export until we have the circular.

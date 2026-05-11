# Workbook handoff between Quote Request and Quote Comparison

Rialto v1 is organized around two product modules: Quote Request and Quote Comparison. Quote Request may collect vendor responses and produce a Vendor Response Workbook, while Quote Comparison consumes that workbook and can also start from a client-provided workbook when the client already has a request workflow. This keeps the modules independently valuable, makes the spreadsheet handoff explicit, and prevents older MVP scope from defining the core architecture.

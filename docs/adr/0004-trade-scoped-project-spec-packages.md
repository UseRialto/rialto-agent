# Trade-scoped project spec packages for substitution checks

Uploaded project specification manuals can be 1000+ pages, while a contractor organization usually works in one configured trade. Rialto will create a Project Spec Package after project spec indexing: a persisted, trade-scoped subset of relevant spec chunks plus common product requirement, approved-equal, submittal, and substitution-control language. Quote-time Substitution Spec Verdicts prefer this package instead of retrieving from the entire project manual.

This keeps expensive manual parsing and broad section filtering at project setup time, makes the subset reviewable with corpus tests, and gives the quote comparison workflow a small evidence interface: each verdict stores only the relevant cited lines used for the decision. The original uploaded manuals and full chunk index remain preserved for reindexing, future trades, and debugging.

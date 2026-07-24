# Zhili UI Foundation Builder

Local Figma development plugin that materializes the approved UI0 specification into the existing design file without network access.

## Run

1. Open the target file in Figma Desktop.
2. Choose **Plugins → Development → Import plugin from manifest…**.
3. Select this directory's `manifest.json`.
4. Run **Plugins → Development → Zhili UI Foundation Builder**.

The plugin is idempotent for pages prefixed `Zhili /`: it removes and recreates only nodes marked with plugin data `zhili-run-id=zhili-ds-v1`. It never reads local business data or calls the network.

Created evidence:

- four local variable collections;
- eight text styles and two effect styles;
- editable shared component specimens;
- five product surfaces and eight baseline screens;
- 10 flow rows with five states each and clickable prototype links.

The raster concepts remain visual references only; implementation must use editable nodes and real components.

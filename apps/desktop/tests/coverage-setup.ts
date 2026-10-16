/** Native Electron bundles have source maps. Node's direct TS stripping does not
 * preserve V8 offsets, so only native tests opt into subprocess collection. */
export const nativeCoverageDirectory = process.env.NODE_V8_COVERAGE;
delete process.env.NODE_V8_COVERAGE;

// Keep native quality checks off the user’s desktop too.
process.env.VOIDRA_TEST_BACKGROUND ??= "1";

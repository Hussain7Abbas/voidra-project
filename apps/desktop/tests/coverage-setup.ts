/** Native Electron bundles have source maps. Node's direct TS stripping does not
 * preserve V8 offsets, so only native tests opt into subprocess collection. */
export const nativeCoverageDirectory = process.env.NODE_V8_COVERAGE;
delete process.env.NODE_V8_COVERAGE;

/** Renderer files are loaded by Electron's app protocol, with no HTTP server. */
export default {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
};

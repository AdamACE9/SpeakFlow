// Empty stub for pdfjs-dist's optional canvas dependency.
// pdfjs-dist tries to require('canvas') for server-side Node.js rendering,
// but SpeakFlow runs pdfjs entirely in the browser. This replaces that import.
module.exports = {};

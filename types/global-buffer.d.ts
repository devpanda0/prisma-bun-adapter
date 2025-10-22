// Minimal Buffer declaration for TypeScript builds without @types/node
// This avoids adding a hard dependency on Node types for Bun environments.
declare const Buffer: {
  isBuffer(obj: any): boolean;
};


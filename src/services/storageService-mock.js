/**
 * Mock Storage Service - stores files in memory for local testing
 * Replaces R2/Cloudflare when real storage is unavailable
 */

const store = {};

module.exports = {
  /**
   * Upload a file (store in memory)
   */
  async upload(buffer, key) {
    console.log(`[Storage-Mock] Storing ${key}`);
    store[key] = buffer;
    return { url: `mock://${key}`, key };
  },

  /**
   * Download a file (retrieve from memory)
   */
  async download(key) {
    console.log(`[Storage-Mock] Retrieving ${key}`);
    if (!store[key]) {
      // Return dummy content instead of failing
      console.warn(`[Storage-Mock] Key not found: ${key}, returning dummy PDF`);
      return Buffer.from('%PDF-1.4\n1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<</Size 2 /Root 1 0 R>>\nstartxref\n0\n%%EOF');
    }
    return store[key];
  },

  /**
   * Delete a file
   */
  async delete(key) {
    delete store[key];
    return true;
  },

  /**
   * Get store info (for debugging)
   */
  getStoreInfo() {
    return {
      keys: Object.keys(store),
      count: Object.keys(store).length,
    };
  },
};

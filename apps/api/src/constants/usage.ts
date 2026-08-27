/**
 * Slug layanan dan nama tool di admin-ppe yang menjadi dasar kuota serta
 * pencatatan pemakaian token.
 *
 * SELURUH fitur AI ditagih ke slug yang sama - chat, analysis, grammar dan
 * riset web. Namanya 'grammar' karena itulah layanan pertama yang terdaftar
 * di sana, bukan karena hanya berlaku untuk pemeriksaan tata bahasa.
 * Mengubahnya menuntut perubahan serentak di sisi admin-ppe.
 */
export const USAGE_SERVICE_SLUG = 'grammar'
export const USAGE_TOOL_NAME = 'grammar-check'

import type { StyleMemory } from '@writer-hub/shared'

/**
 * Preferensi gaya AI Memory sebagaimana disimpan server (satu objek per user).
 * `language` berisi label bahasa (mis. "Bahasa Indonesia") karena nilainya
 * langsung ditempel ke prompt, bukan diproses mesin.
 */
export type MemoryPreferences = StyleMemory

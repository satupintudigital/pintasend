// Smart filters webhook — lapisan pre-filter OPSIONAL di PintaSend sebelum event
// diteruskan ke URL client. Skema & semantik selaras dengan OpenWA
// (docs/06-api-specification.md §webhook smart filters): semua kondisi digabung
// dengan AND, filter kosong/absent = selalu lolos, field tidak dikenal di-skip.
//
// Hanya event yang MEMBAWA KONTEN PESAN (sender/body/type) yang bisa difilter:
// `message.received` dan `message.edited`. Event lain (session.status,
// message.ack, message.failed) tidak punya field konten → selalu lolos, agar
// filter "sender = X" tidak diam-diam menahan ack/status.

export type FilterOperator = "is" | "isNot" | "contains" | "equals";

export interface WebhookFilterCondition {
  field: string;
  operator: FilterOperator;
  value: string | string[] | boolean;
  /** Hanya berlaku untuk field `text` (body). Default false (case-insensitive). */
  caseSensitive?: boolean;
}

export interface WebhookFilters {
  conditions: WebhookFilterCondition[];
}

type FieldKind = "id" | "text" | "enum" | "boolean";

interface FieldDefinition {
  field: string;
  kind: FieldKind;
  operators: FilterOperator[];
  resolve: (data: Record<string, unknown>) => unknown;
  enumValues?: readonly string[];
}

export const MESSAGE_TYPES = [
  "text",
  "image",
  "video",
  "audio",
  "voice",
  "document",
  "sticker",
  "location",
  "contact",
  "poll",
  "call",
  "revoked",
  "masked",
  "unknown",
] as const;

// Batas konfigurasi — membatasi ukuran tersimpan & biaya evaluasi per event.
export const MAX_CONDITIONS = 20;
export const MAX_VALUES_PER_CONDITION = 100;
export const MAX_TEXT_VALUE_LENGTH = 1000;

const ID_OPERATORS: FilterOperator[] = ["is", "isNot"];
const TEXT_OPERATORS: FilterOperator[] = ["contains", "equals"];
const ENUM_OPERATORS: FilterOperator[] = ["is", "isNot"];
const BOOLEAN_OPERATORS: FilterOperator[] = ["is"];

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

// Registry field (keluarga message) — sama dengan OpenWA FILTER_FIELDS.message.
export const FILTER_FIELDS: FieldDefinition[] = [
  {
    field: "sender",
    kind: "id",
    operators: ID_OPERATORS,
    // Di grup `from` = JID grup; `author` = peserta sebenarnya.
    resolve: (d) => str(d.author) ?? str(d.from),
  },
  { field: "recipient", kind: "id", operators: ID_OPERATORS, resolve: (d) => str(d.to) },
  { field: "body", kind: "text", operators: TEXT_OPERATORS, resolve: (d) => str(d.body) ?? "" },
  {
    field: "type",
    kind: "enum",
    operators: ENUM_OPERATORS,
    enumValues: MESSAGE_TYPES,
    resolve: (d) => str(d.type),
  },
  {
    field: "isGroup",
    kind: "boolean",
    operators: BOOLEAN_OPERATORS,
    resolve: (d) => d.isGroup === true,
  },
  {
    field: "fromMe",
    kind: "boolean",
    operators: BOOLEAN_OPERATORS,
    resolve: (d) => d.fromMe === true,
  },
  {
    field: "hasMedia",
    kind: "boolean",
    operators: BOOLEAN_OPERATORS,
    // Edited membawa `hasMedia` eksplisit; received membawa objek `media`.
    resolve: (d) => d.hasMedia === true || d.media != null,
  },
  // v0.23: kind filter — individu, grup, channel, status, broadcast, unknown.
  // Membedakan channel (newsletter) dari chat 1:1 yang `isGroup` tidak bisa.
  {
    field: "kind",
    kind: "enum",
    operators: ENUM_OPERATORS,
    enumValues: ["individual", "group", "channel", "status", "broadcast", "unknown"] as const,
    resolve: (d) => str(d.kind),
  },
];

// Event yang membawa konten pesan — satu-satunya yang dikenai filter.
const CONTENT_EVENTS = new Set(["message.received", "message.edited"]);

// Normalisasi id: bare digits → <digits>@c.us; JID dibiarkan. Case-insensitive.
const canonicalId = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed && !trimmed.includes("@")) {
    return `${trimmed.replace(/\D/g, "") || trimmed}@c.us`.toLowerCase();
  }
  return trimmed.toLowerCase();
};

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function evaluateCondition(
  def: FieldDefinition,
  cond: WebhookFilterCondition,
  data: Record<string, unknown>,
): boolean {
  const { operator, value, caseSensitive = false } = cond;
  const resolved = def.resolve(data);

  switch (def.kind) {
    case "id": {
      const candidates = new Set(toStringArray(value).map(canonicalId));
      const actual = typeof resolved === "string" ? resolved : undefined;
      const isMatch = actual != null && candidates.has(canonicalId(actual));
      return operator === "isNot" ? !isMatch : isMatch;
    }
    case "enum": {
      const candidates = new Set(toStringArray(value));
      const actual = typeof resolved === "string" ? resolved : undefined;
      const isMatch = actual != null && candidates.has(actual);
      return operator === "isNot" ? !isMatch : isMatch;
    }
    case "boolean":
      return resolved === (value === true);
    case "text": {
      if (typeof value !== "string") return true; // malformed; sudah divalidasi saat simpan
      const haystackRaw = typeof resolved === "string" ? resolved : "";
      const haystack = caseSensitive ? haystackRaw : haystackRaw.toLowerCase();
      const needle = caseSensitive ? value : value.toLowerCase();
      if (operator === "equals") return haystack === needle;
      return haystack.includes(needle); // contains
    }
    default:
      return true;
  }
}

/**
 * True bila event boleh diteruskan. Filter kosong/absent selalu lolos. Semua
 * kondisi AND; field tidak dikenal di-skip (forward-compatible).
 */
export function evaluateFilters(
  filters: WebhookFilters | null | undefined,
  event: string,
  data: Record<string, unknown>,
): boolean {
  if (!filters || !Array.isArray(filters.conditions) || filters.conditions.length === 0) {
    return true;
  }
  if (!CONTENT_EVENTS.has(event)) return true;
  for (const condition of filters.conditions) {
    const def = FILTER_FIELDS.find((f) => f.field === condition.field);
    if (!def) continue;
    if (!evaluateCondition(def, condition, data)) return false;
  }
  return true;
}

// ── Validasi (pure; mirror OpenWA collectFilterErrors) ───────────────────────
export function collectFilterErrors(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object" || Array.isArray(value)) return ["filters harus berupa objek"];
  const conditions = (value as Record<string, unknown>).conditions;
  if (!Array.isArray(conditions)) return ["filters.conditions harus berupa array"];
  if (conditions.length > MAX_CONDITIONS) return [`filters.conditions maksimal ${MAX_CONDITIONS} entri`];
  const errors: string[] = [];
  conditions.forEach((condition, index) => {
    const err = validateCondition(condition, index);
    if (err) errors.push(err);
  });
  return errors;
}

function validateCondition(condition: unknown, index: number): string | null {
  const where = `conditions[${index}]`;
  if (typeof condition !== "object" || condition === null) return `${where} harus berupa objek`;
  const { field, operator, value, caseSensitive } = condition as Record<string, unknown>;
  if (typeof field !== "string") return `${where}.field harus string`;
  const def = FILTER_FIELDS.find((f) => f.field === field);
  if (!def) {
    return `${where}.field "${field}" tidak dikenal (pilihan: ${FILTER_FIELDS.map((f) => f.field).join(", ")})`;
  }
  if (typeof operator !== "string" || !["is", "isNot", "contains", "equals"].includes(operator)) {
    return `${where}.operator "${String(operator)}" tidak valid`;
  }
  if (!def.operators.includes(operator as FilterOperator)) {
    return `${where}.operator "${operator}" tidak diizinkan untuk field "${field}"`;
  }
  if (caseSensitive !== undefined && typeof caseSensitive !== "boolean") {
    return `${where}.caseSensitive harus boolean`;
  }
  switch (def.kind) {
    case "boolean":
      if (typeof value !== "boolean") return `${where}.value harus boolean untuk "${field}"`;
      return null;
    case "text": {
      if (typeof value !== "string") return `${where}.value harus string untuk "${field}"`;
      if (value.length > MAX_TEXT_VALUE_LENGTH) {
        return `${where}.value melebihi ${MAX_TEXT_VALUE_LENGTH} karakter`;
      }
      return null;
    }
    case "id":
    case "enum": {
      if (!Array.isArray(value) || value.length === 0) {
        return `${where}.value harus array non-kosong untuk "${field}"`;
      }
      if (value.length > MAX_VALUES_PER_CONDITION) {
        return `${where}.value melebihi ${MAX_VALUES_PER_CONDITION} entri`;
      }
      for (const v of value) {
        if (typeof v !== "string" || v.length === 0) return `${where}.value harus berisi string non-kosong`;
        if (def.kind === "enum" && def.enumValues && !def.enumValues.includes(v)) {
          return `${where}.value "${v}" bukan tipe valid untuk "${field}"`;
        }
      }
      return null;
    }
    default:
      return `${where} punya field kind tidak didukung`;
  }
}

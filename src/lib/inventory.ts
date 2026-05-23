import * as XLSX from 'xlsx';

export type PosType = 'food' | 'pharmacy' | 'electronics' | 'general';

export interface ImportedProductRow {
  name: string;
  categoryName?: string;
  description?: string;
  sellingPrice: number;
  purchasePrice: number;
  stockQuantity: number;
  unit: string;
  barcode?: string;
  isActive: boolean;
}

const POS_KEYWORDS: Record<PosType, string[]> = {
  food: ['restaurant', 'food', 'drink', 'cafe', 'hotel'],
  pharmacy: ['pharmacy', 'medicine', 'health', 'clinic', 'drug'],
  electronics: ['electronics', 'electronic', 'gadget', 'phone', 'computer'],
  general: [],
};

const POS_CATEGORY_TEMPLATES: Record<PosType, string[]> = {
  food: ['Main Dishes', 'Snacks', 'Beverages', 'Breakfast', 'Desserts'],
  pharmacy: ['Prescription Drugs', 'OTC Medicine', 'Vitamins', 'First Aid', 'Personal Care'],
  electronics: ['Phones', 'Accessories', 'Computers', 'Audio', 'Networking'],
  general: ['General'],
};

export function getPosType(businessCategory?: string): PosType {
  const category = (businessCategory ?? '').toLowerCase();

  if (POS_KEYWORDS.food.some((k) => category.includes(k))) return 'food';
  if (POS_KEYWORDS.pharmacy.some((k) => category.includes(k))) return 'pharmacy';
  if (POS_KEYWORDS.electronics.some((k) => category.includes(k))) return 'electronics';
  return 'general';
}

export function getPosCategoryTemplates(posType: PosType): string[] {
  return POS_CATEGORY_TEMPLATES[posType] ?? POS_CATEGORY_TEMPLATES.general;
}

export function getPosLabel(posType: PosType): string {
  if (posType === 'food') return 'Food & Restaurant POS';
  if (posType === 'pharmacy') return 'Pharmacy POS';
  if (posType === 'electronics') return 'Electronics POS';
  return 'General POS';
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'active'].includes(normalized)) return true;
    if (['false', 'no', 'n', '0', 'inactive'].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeRow(raw: Record<string, unknown>): ImportedProductRow | null {
  const name = String(raw.name ?? raw.product_name ?? raw.product ?? '').trim();
  if (!name) return null;

  const categoryName = String(raw.category ?? raw.category_name ?? '').trim() || undefined;
  const description = String(raw.description ?? raw.desc ?? '').trim() || undefined;
  const unit = String(raw.unit ?? raw.measurement_unit ?? 'piece').trim() || 'piece';
  const barcode = String(raw.barcode ?? raw.sku ?? '').trim() || undefined;

  return {
    name,
    categoryName,
    description,
    sellingPrice: toNumber(raw.selling_price ?? raw.price ?? raw.sell_price, 0),
    purchasePrice: toNumber(raw.purchase_price ?? raw.buy_price ?? raw.cost, 0),
    stockQuantity: Math.max(0, Math.trunc(toNumber(raw.stock_quantity ?? raw.stock ?? raw.qty, 0))),
    unit,
    barcode,
    isActive: toBoolean(raw.is_active ?? raw.active, true),
  };
}

function parseCsv(text: string): ImportedProductRow[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length < 2) return [];

  const headers = rows[0].split(',').map((h) => h.trim().toLowerCase());
  const parsed: ImportedProductRow[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const values = rows[i].split(',').map((v) => v.trim());
    const raw: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      raw[header] = values[idx] ?? '';
    });
    const normalized = normalizeRow(raw);
    if (normalized) parsed.push(normalized);
  }

  return parsed;
}

export function parseSpreadsheet(input: string | ArrayBuffer, fileName: string, isCsvText = false): ImportedProductRow[] {
  if (isCsvText || fileName.toLowerCase().endsWith('.csv')) {
    return parseCsv(typeof input === 'string' ? input : new TextDecoder().decode(input));
  }

  const workbook = typeof input === 'string'
    ? XLSX.read(input, { type: 'base64' })
    : XLSX.read(input, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const firstSheet = workbook.Sheets[firstSheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: '',
    raw: false,
  });

  const parsed: ImportedProductRow[] = [];
  for (const row of jsonRows) {
    const normalized = normalizeRow(row);
    if (normalized) parsed.push(normalized);
  }
  return parsed;
}

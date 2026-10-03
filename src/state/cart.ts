import type { LicenceId } from '../config';
import { productById, type Product } from '../data/catalog';

export interface CartLine {
  productId: string;
  licence: LicenceId;
}

type Listener = (lines: CartLine[]) => void;

const KEY = 'basedinbattle.cart.v1';

function load(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    return parsed.filter((line) => productById(line.productId) && (line.licence === 'personal' || line.licence === 'merchant'));
  } catch {
    return [];
  }
}

function save(lines: CartLine[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* storage unavailable — cart lives for this visit only */
  }
}

/** Digital patterns: at most one line per product, holding the chosen licence. */
class CartStore {
  private lines: CartLine[] = load();
  private listeners = new Set<Listener>();

  get items(): readonly CartLine[] {
    return this.lines;
  }

  get count(): number {
    return this.lines.length;
  }

  get total(): number {
    return this.lines.reduce((sum, line) => sum + (productById(line.productId)?.price[line.licence] ?? 0), 0);
  }

  licenceOf(productId: string): LicenceId | undefined {
    return this.lines.find((l) => l.productId === productId)?.licence;
  }

  set(product: Product, licence: LicenceId): void {
    const existing = this.lines.find((l) => l.productId === product.id);
    if (existing) existing.licence = licence;
    else this.lines.push({ productId: product.id, licence });
    this.commit();
  }

  remove(productId: string): void {
    this.lines = this.lines.filter((l) => l.productId !== productId);
    this.commit();
  }

  clear(): void {
    this.lines = [];
    this.commit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private commit(): void {
    save(this.lines);
    this.listeners.forEach((fn) => fn(this.lines));
  }
}

export const cart = new CartStore();

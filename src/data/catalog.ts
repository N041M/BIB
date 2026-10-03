import type { LicenceId } from '../config';

export type CategoryId = 'armour' | 'terrain' | 'relics' | 'characters';

export interface Category {
  id: CategoryId;
  label: string;
}

export const CATEGORIES: Category[] = [
  { id: 'armour', label: 'ARMOUR' },
  { id: 'terrain', label: 'TERRAIN' },
  { id: 'relics', label: 'RELICS' },
  { id: 'characters', label: 'CHARACTERS' },
];

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: CategoryId;
  /** Path relative to `public/models/`. */
  file: string;
  short: string;
  description: string;
  price: Record<LicenceId, number>;
  parts: number;
  presupported: boolean;
  scale: string;
  tag?: 'NEW' | 'FREE' | 'SANCTIONED' | 'RARE';
  featured?: boolean;
}

export const PRODUCTS: Product[] = [
  {
    id: 'PTN-0117',
    slug: 'castellan-battle-tank',
    name: 'Castellan-Pattern Battle Tank',
    category: 'armour',
    file: 'castellan-battle-tank.stl',
    short: 'Siege-grade heavy armour with a faceted turret and full track runs.',
    description:
      'A slab-sided siege tank built to grind through cathedral rubble. Split for printing into hull, track units, turret and gun, with a keyed turret ring and a magnet socket so the main armament can be swapped.',
    price: { personal: 19, merchant: 59 },
    parts: 14,
    presupported: true,
    scale: '32 MM',
    tag: 'NEW',
    featured: true,
  },
  {
    id: 'PTN-0122',
    slug: 'orbital-descent-pod',
    name: 'Orbital Descent Pod',
    category: 'armour',
    file: 'orbital-descent-pod.stl',
    short: 'Assault lander with armoured petals deployed. A table centrepiece.',
    description:
      'Fired from orbit and opened on impact. Each armoured petal is a separate part with a pinned hinge, so the pod can be printed sealed for transit or blown open for the drop.',
    price: { personal: 16, merchant: 48 },
    parts: 12,
    presupported: true,
    scale: '32 MM',
  },
  {
    id: 'PTN-0204',
    slug: 'basilica-ruin',
    name: 'Basilica Ruin — Nave Section',
    category: 'terrain',
    file: 'basilica-ruin.stl',
    short: 'Shattered cathedral wall with a pointed arch and rose windows.',
    description:
      'A full-height section of a fallen nave. Lancet window, buttresses and a tiled floor plinth, with fallen masonry modelled separately so the rubble can be arranged around it.',
    price: { personal: 14, merchant: 42 },
    parts: 6,
    presupported: false,
    scale: '28–32 MM',
    tag: 'SANCTIONED',
  },
  {
    id: 'PTN-0209',
    slug: 'siege-barricade-kit',
    name: 'Siege-Line Barricade Kit',
    category: 'terrain',
    file: 'siege-barricade-kit.stl',
    short: 'Tank traps, sandbags, barrels, crates and razor wire.',
    description:
      'Everything a front line needs to dig in. Eleven separate pieces that print support-free on FDM, pre-arranged on a display base for the archive render.',
    price: { personal: 9, merchant: 27 },
    parts: 11,
    presupported: false,
    scale: '28–32 MM',
  },
  {
    id: 'PTN-0213',
    slug: 'reliquary-shrine',
    name: 'Reliquary Shrine',
    category: 'terrain',
    file: 'reliquary-shrine.stl',
    short: 'Arched shrine with a sealed urn, banner and candle clusters.',
    description:
      'A wayside shrine of turned columns and a pointed canopy. Objective marker, scatter terrain or a painting showpiece, with a hanging banner sized for freehand.',
    price: { personal: 12, merchant: 36 },
    parts: 8,
    presupported: true,
    scale: '32 MM',
  },
  {
    id: 'PTN-0301',
    slug: 'oathbreaker-relic-blade',
    name: 'Oathbreaker Relic Blade',
    category: 'relics',
    file: 'oathbreaker-relic-blade.stl',
    short: 'Ornate blade driven into a rock plinth, with chains and a wax seal.',
    description:
      'A display relic: a winged-guard sword driven point-first into stone. Prints upright at 150 mm, or scale it down to 30% as an objective marker.',
    price: { personal: 8, merchant: 24 },
    parts: 5,
    presupported: true,
    scale: 'DISPLAY',
    tag: 'RARE',
  },
  {
    id: 'PTN-0307',
    slug: 'cogitator-terminal',
    name: 'Cogitator Terminal',
    category: 'relics',
    file: 'cogitator-terminal.stl',
    short: 'Gothic data-lectern with keycaps, cabling and a skull finial.',
    description:
      'The machine you are reading this on. A data-lectern with individually modelled keys and a cable harness, ready to scatter across a command bunker.',
    price: { personal: 10, merchant: 30 },
    parts: 9,
    presupported: true,
    scale: '32 MM',
  },
  {
    id: 'PTN-0402',
    slug: 'void-knight-helm-bust',
    name: 'Void-Knight Helm Bust',
    category: 'characters',
    file: 'void-knight-helm-bust.stl',
    short: 'Armoured helm bust on a turned plinth. Painting showpiece.',
    description:
      'A sealed void-helm with a slatted grille, rebreather lines and heavy pauldrons, on a turned plinth. Sized for a 75 mm display, with helm and shoulders split for painting.',
    price: { personal: 15, merchant: 45 },
    parts: 4,
    presupported: true,
    scale: '75 MM BUST',
  },
  {
    id: 'PTN-0415',
    slug: 'servo-skull-drone',
    name: 'Servo-Skull Drone',
    category: 'characters',
    file: 'servo-skull-drone.stl',
    short: 'Hovering skull drone with a bionic lens and a manipulator arm.',
    description:
      'A free sample pattern so you can test our supports on your printer. Flight stand included, with an optional magnet socket in the cranium.',
    price: { personal: 0, merchant: 12 },
    parts: 6,
    presupported: true,
    scale: '32 MM',
    tag: 'FREE',
  },
];

export const productBySlug = (slug: string): Product | undefined => PRODUCTS.find((p) => p.slug === slug);
export const productById = (id: string): Product | undefined => PRODUCTS.find((p) => p.id === id);

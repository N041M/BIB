/** Brand + commerce settings. Change these to re-skin the store. */
export const BRAND = {
  /** Shown on the ordinary landing page. */
  name: 'Plinth',
  /** Shown once the cogitator wakes. */
  terminalName: 'PLINTH//PATTERN ARCHIVE',
  nodeId: 'PLN-01',
  locale: 'en-IE',
  currency: 'EUR',
} as const;

export type LicenceId = 'personal' | 'merchant';

export interface Licence {
  id: LicenceId;
  label: string;
  terminalLabel: string;
  summary: string;
  terms: string[];
}

export const LICENCES: Record<LicenceId, Licence> = {
  personal: {
    id: 'personal',
    label: 'Personal',
    terminalLabel: 'PERSONAL',
    summary: 'Print for your own collection and games.',
    terms: ['Unlimited prints for personal use', 'Free file updates', 'No resale of prints or files'],
  },
  merchant: {
    id: 'merchant',
    label: 'Merchant',
    terminalLabel: 'MERCHANT',
    summary: 'Sell physical prints of this model.',
    terms: ['Sell up to 250 prints per month', 'Free file updates', 'Digital redistribution prohibited'],
  },
};

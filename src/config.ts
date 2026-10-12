/** Brand + commerce settings. Change these to re-skin the store. */
export const BRAND = {
  /** Shown on the page. */
  name: 'Based in Battle',
  domain: 'basedinbattle.com',
  /** Shown on the screen. */
  terminalName: 'BASED IN BATTLE',
  terminalSub: 'PATTERN ARCHIVE',
  nodeId: 'CGT-07',
  locale: 'en-IE',
  currency: 'EUR',
} as const;

/**
 * The painter who runs the store, for the About panel on the page.
 * Empty fields are left out of the panel.
 */
export const CREATOR = {
  name: 'Rude_Raccoon',
  tagline: 'Equal opportunity hitting machine',
  bio: 'Based in Battle is run by Rude_Raccoon, who paints miniatures live on Twitch. Each time the channel reaches a follower or sub goal, a free 3D-printed model is given away. The winner of the sub raffle gets a fully painted model.',
  /** Short label and value pairs shown under the bio. */
  facts: [
    ['Category', 'Miniatures & Models'],
    ['Giveaways', 'Announced a week ahead'],
  ] as [string, string][],
  /** For example 'Twitch' or 'YouTube'. */
  platform: 'Twitch',
  /** Link to the channel. */
  url: 'https://www.twitch.tv/rude_raccoon',
};

/**
 * Colours for each part of the site. The palettes are in src/styles/base.css.
 * The hero images are rendered with the `page` background and the `scene`
 * glass, so render them again after changing either (see the README).
 */
export const THEME: {
  /** The archive screen and its 3D models. */
  screen: 'red' | 'green';
  /** The page around the screen. `candle` is bone and warm black with a candle-gold accent. */
  page: 'candle' | 'red' | 'green';
  /** The votive cups and the servitor's optic behind the hero, and the print head's windows on the blog. */
  scene: 'red' | 'green';
} = { screen: 'green', page: 'candle', scene: 'red' };

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

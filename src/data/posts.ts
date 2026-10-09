/** One piece of a post's body, in reading order. */
export type Block =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'list'; items: string[] }
  /**
   * A photo. `src` is relative to `public/`, and `aspect` is width divided by height.
   * `print` (the default) has the machine print it in ink as a halftone.
   * `plate` pastes a colour print onto the sheet with dabs of wax.
   */
  | { type: 'image'; src: string; alt: string; aspect: number; caption?: string; style?: 'print' | 'plate' }
  /** A pattern from the archive, printed as a shaded line drawing of its STL. `file` is in `public/models/`. */
  | { type: 'drawing'; file: string; alt: string; caption?: string };

/**
 * Paragraphs, headings, list items and captions can hold links, written
 * `[the words](address)`. An address starting with `#/` stays on the site,
 * such as `#/archive/<slug>` for a pattern; any other opens in a new tab.
 */
export interface Post {
  slug: string;
  title: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** One or two sentences for the list of posts. */
  summary: string;
  blocks: Block[];
}

export const postBySlug = (slug: string): Post | undefined => POSTS.find((p) => p.slug === slug);

/**
 * Blog posts, newest first. These are placeholders for trying out the page.
 * The photos in the Castellan post are the hero image, standing in for real ones.
 */
export const POSTS: Post[] = [
  {
    slug: 'october-stream-schedule',
    title: 'Stream schedule for October',
    date: '2026-09-30',
    summary: 'Four painting streams this month, with the Castellan tank on the desk for the first two.',
    blocks: [
      { type: 'p', text: 'October has four painting streams. They all start at 19:00 Central European Time and run for about three hours.' },
      {
        type: 'list',
        items: [
          'Thursday 2 October: priming and base coats on the Castellan battle tank.',
          'Thursday 9 October: weathering, chipping and pigments on the same tank.',
          'Thursday 16 October: a viewer pick from the archive, voted on in Discord.',
          'Thursday 23 October: the sub goal giveaway draw, followed by an open painting session.',
        ],
      },
      { type: 'p', text: 'If a stream moves, the change goes up on [the Twitch channel](https://www.twitch.tv/rude_raccoon) and in Discord at least a day ahead.' },
    ],
  },
  {
    slug: 'castellan-tank-in-the-archive',
    title: 'The Castellan battle tank is in the archive',
    date: '2026-09-28',
    summary: 'The first armour pattern is out. It comes in fourteen parts, with a magnet socket for the main gun.',
    blocks: [
      {
        type: 'p',
        text: 'The Castellan-pattern battle tank is the first armour kit in [the archive](#/archive/castellan-battle-tank). It took four test prints on resin and two on FDM before the parts fitted without filing, and every file in the ZIP is the version from the last test.',
      },
      {
        type: 'drawing',
        file: 'castellan-battle-tank.stl',
        alt: 'Line drawing of the Castellan battle tank, seen from the front right',
        caption: 'The tank as it comes out of the ZIP, assembled.',
      },
      { type: 'h', text: 'What is in the ZIP' },
      {
        type: 'list',
        items: [
          'Hull, two track units and the turret, each split so they print without supports inside the hull.',
          'A keyed turret ring, so the turret only sits one way round and stays put on the table.',
          'Two main guns and a magnet socket sized for 3 by 2 mm magnets.',
          'Supported and unsupported files for every part, plus slicer profiles for Chitubox and Lychee.',
        ],
      },
      {
        type: 'image',
        style: 'plate',
        src: 'backdrop/wide.webp',
        alt: 'Placeholder photo of the painted tank on the painting desk',
        aspect: 16 / 10,
        caption: 'Placeholder photo. The painted tank goes here after the stream on 9 October.',
      },
      { type: 'h', text: 'Printing it' },
      {
        type: 'p',
        text: 'On resin, print the hull at a 30 degree angle with the front facing the build plate. The supports in the supported file are placed for that angle. Printing it flat makes the rear plate cup and the track units will not sit square.',
      },
      {
        type: 'image',
        src: 'backdrop/wide-base.webp',
        alt: 'Placeholder photo of the hull on the build plate',
        aspect: 16 / 9,
        caption: 'Placeholder photo of the hull on the build plate at 30 degrees.',
      },
      {
        type: 'p',
        text: 'On FDM, use a 0.2 mm nozzle and a layer height of 0.12 mm. The tracks print best on their side with a brim. The turret and the guns are small enough that resin is the better choice if you have both printers.',
      },
      {
        type: 'p',
        text: 'The magnet socket is a tight fit by design. If your printer runs slightly large, drill it out with a 3 mm bit instead of forcing the magnet in, because the socket wall is thin on the side facing the gun.',
      },
      { type: 'h', text: 'Licences' },
      {
        type: 'p',
        text: 'The personal licence covers prints for your own collection. If you sell painted or unpainted prints, the merchant licence covers up to 250 prints a month. Both include every update to the files for as long as the tank stays in the archive.',
      },
      {
        type: 'p',
        text: 'The tank goes on the painting desk on the stream on 2 October, and the finished model will be photographed for this post the week after.',
      },
    ],
  },
  {
    slug: 'september-giveaway-winner',
    title: 'September giveaway: the winner',
    date: '2026-09-14',
    summary: 'The sub goal was reached on 12 September, and the painted reliquary shrine goes to its winner this week.',
    blocks: [
      {
        type: 'p',
        text: 'The channel reached its September sub goal on 12 September, two days before the end of the month. Thank you to everyone who subscribed or gifted a sub.',
      },
      {
        type: 'p',
        text: 'The draw ran live on stream. The winner has been contacted on [Twitch](https://www.twitch.tv/rude_raccoon) and has sent a shipping address, and the fully painted reliquary shrine goes out this week.',
      },
      {
        type: 'p',
        text: 'The follower goal giveaway is still open. When the channel reaches the next follower goal, one follower wins a printed and primed model of their choice from the archive.',
      },
    ],
  },
  {
    slug: 'basilica-ruin-on-fdm',
    title: 'Printing the basilica ruin on FDM',
    date: '2026-08-30',
    summary: 'Settings that worked for the nave section on a standard FDM printer, and the one part that needs resin.',
    blocks: [
      {
        type: 'p',
        text: 'The basilica ruin is the one terrain piece in the archive that prints well on FDM from start to finish. The wall is flat on the back, so it prints lying down with no supports at all.',
      },
      {
        type: 'list',
        items: [
          'Nozzle 0.4 mm, layer height 0.12 mm.',
          'Three walls and 15 percent gyroid infill.',
          'Print the rose window separately and glue it in after painting.',
        ],
      },
      {
        type: 'p',
        text: 'The fallen masonry pieces are small and full of sharp edges. They come out much better on resin, so if you only have FDM, print them at 0.08 mm and expect to clean them up.',
      },
    ],
  },
];

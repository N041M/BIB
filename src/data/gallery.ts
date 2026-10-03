export interface GalleryItem {
  title: string;
  /** A short line under the title, such as the army, the scheme or the date. */
  meta?: string;
  /** File name in `public/gallery/`. Without one the tile shows an empty frame. */
  image?: string;
  /** What the photo shows, for screen readers. Defaults to the title. */
  alt?: string;
  /** Link to the stream or post the model was painted in. */
  link?: string;
}

/**
 * Painted models shown in the gallery on the page, newest first.
 * The six entries below are placeholders. Replace them with real photos.
 */
export const GALLERY: GalleryItem[] = [
  { title: 'Model 01' },
  { title: 'Model 02' },
  { title: 'Model 03' },
  { title: 'Model 04' },
  { title: 'Model 05' },
  { title: 'Model 06' },
];

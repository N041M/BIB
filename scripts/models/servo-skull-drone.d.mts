import type { BufferGeometry } from 'three';

/**
 * Builds the Servo-Skull Drone pattern as separate parts, in millimetres with
 * y up and the base on y = 0. Each part's `userData.tag` names it, and a
 * mirrored copy's tag ends in `~m`.
 */
export default function build(): { parts: BufferGeometry[] };

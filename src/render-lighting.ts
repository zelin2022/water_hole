export type Rgb = readonly [number, number, number];

export const DARKNESS: Rgb = [8, 12, 16];
const MOON: Rgb = [220 / 255, 230 / 255, 240 / 255];
const LAMP: Rgb = [1, 220 / 255, 160 / 255];
const unit = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Independent source contributions add energy; a warm lamp never removes blue moonlight. */
export function lightTransmission(moonlight: number, lamplight: number, output: [number, number, number] = [0, 0, 0]): Rgb {
  const moon = unit(moonlight); const lamp = unit(lamplight);
  for (let channel = 0; channel < 3; channel++) output[channel] = unit(moon * MOON[channel] + lamp * LAMP[channel]);
  return output;
}

/** Canvas uses the same multiply-then-screen composition. Zero light erases all geometry. */
export function compositeEnvironmentColor(base: Rgb, moonlight: number, lamplight: number): Rgb {
  const transmission = lightTransmission(moonlight, lamplight);
  return base.map((value, channel) => Math.round(DARKNESS[channel] + value * transmission[channel] * (1 - DARKNESS[channel] / 255))) as unknown as Rgb;
}

/** Only transient scan echoes add outlines over unlit terrain. */
export function caveOutlineOpacity(sonar: number): number {
  return sonar * 0.75;
}

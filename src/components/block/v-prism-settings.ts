export interface SceneSettings {
  ambientLight: number;
  pointLights: number;
  spotIntensity: number;
  rainbowGlow: number;
  bloom: number;
  roughness: number;
  ior: number;
  thickness: number;
  background: string;
  prismTint: string;
}

export const DARK_PRESET: SceneSettings = {
  ambientLight: 0.015,
  pointLights: 0.05,
  spotIntensity: 1.0,
  rainbowGlow: 2.5,
  bloom: 0.5,
  roughness: 0,
  ior: 1.5,
  thickness: 0.9,
  background: "#000000",
  prismTint: "#ffffff",
};

export const LIGHT_PRESET: SceneSettings = {
  ...DARK_PRESET,
  bloom: 0.5,
  background: "#ffffff",
};

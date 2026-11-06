import { campusMeshPreset } from "../../packages/ui/src/tailwind-preset";

/** @type {import('tailwindcss').Config} */
export default {
  presets: [campusMeshPreset],
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
    "../../packages/ui/src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

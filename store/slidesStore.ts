import { create } from "zustand";

interface SlidesStore {
  slides: string[];
  setSlides: (s: string[]) => void;
  currentSlide: number;
  setCurrentSlide: (n: number) => void;
}

export const useSlidesStore = create<SlidesStore>((set) => ({
  slides: [],
  setSlides: (slides) => set({ slides }),
  currentSlide: 0,
  setCurrentSlide: (n) => set({ currentSlide: n }),
}));

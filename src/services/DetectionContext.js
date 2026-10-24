import { createContext, useContext } from "react";
export const DetectionContext = createContext(null);
export function useDetections() {
  const value = useContext(DetectionContext);
  if (!value) throw new Error("DetectionProvider is missing.");
  return value;
}

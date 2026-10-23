import { createContext, useContext } from "react";
export const FarmContext = createContext(null);
export function useFarm() {
  const value = useContext(FarmContext);
  if (!value) throw new Error("FarmProvider is missing.");
  return value;
}

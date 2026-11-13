// Production opens on server records; demos remain an explicit, labelled choice.
export function defaultDataSource(production = import.meta.env?.PROD === true) {
  return production ? "backend" : "simulation";
}

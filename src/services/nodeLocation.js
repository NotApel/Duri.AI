export function nodeLocation(latitude, longitude) {
  const coordinate = (value, limit) =>
    ["number", "string"].includes(typeof value) &&
    String(value).trim() !== "" &&
    Number.isFinite(Number(value)) &&
    Math.abs(Number(value)) <= limit;
  return coordinate(latitude, 90) && coordinate(longitude, 180)
    ? [Number(latitude), Number(longitude)]
    : null;
}

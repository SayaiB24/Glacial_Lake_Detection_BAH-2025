// In custom.d.ts

declare module '@google/earthengine';

declare module "*.geojson" {
  const value: GeoJSON.FeatureCollection;
  export default value;
}
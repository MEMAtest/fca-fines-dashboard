/**
 * Type declarations for external packages without built-in types
 */

declare module 'react-globe.gl' {
  import { ComponentType } from 'react';

  const Globe: ComponentType<any>;
  export default Globe;
}

declare module 'topojson-client' {
  export function feature(topology: any, object: any): any;
}

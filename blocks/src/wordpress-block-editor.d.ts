declare module '@wordpress/block-editor' {
  import type { ComponentType } from 'react';
  export const InspectorControls: ComponentType<any>;
  export const useBlockProps: { (props?: Record<string, unknown>): Record<string, unknown>; save(props?: Record<string, unknown>): Record<string, unknown> };
}

declare module '*.css';

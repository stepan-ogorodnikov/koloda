import { type VariantProps, type ClassProp } from 'tailwind-variants';

export type TWVProp<T extends (...args: never) => unknown> = VariantProps<T> &
  ClassProp;

export type TWVProps<T extends (...args: never) => unknown> = {
  variants?: TWVProp<T>;
};

export const apply_styles = (
  el: HTMLElement | SVGElement,
  styles: Partial<CSSStyleDeclaration>,
): void => {
  // for (const key in styles) {
  //   const value = styles[key];
  //   if (value !== undefined) {
  //     (el.style as any)[key] = value;
  //   }
  // }
  Object.assign(el.style, styles);
};

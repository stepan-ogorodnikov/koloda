export type UserAgentBrand = { brand: string; version?: string };

export type NavigatorLike = {
  userAgent: string;
  userAgentData?: { brands?: UserAgentBrand[] };
};

export type DemoBrowserSupport = {
  canRun: boolean;
  hasIndexedDb: boolean;
  hasWasm: boolean;
  isChromiumBased: boolean;
};

const IOS_NON_CHROMIUM_UA = /CriOS|FxiOS|EdgiOS|OPiOS/i;
const CHROMIUM_UA = /Chrome\/|Chromium\/|Edg\/|OPR\/|SamsungBrowser\//i;

export function isChromiumBased(nav: NavigatorLike): boolean {
  const brands = nav.userAgentData?.brands;
  if (brands && brands.length > 0) return brands.some((item) => item.brand.toLowerCase() === "chromium");

  const ua = nav.userAgent;
  if (IOS_NON_CHROMIUM_UA.test(ua)) return false;

  return CHROMIUM_UA.test(ua);
}

export function getDemoBrowserSupport(
  nav: NavigatorLike = navigator,
  globals: { indexedDB?: unknown; WebAssembly?: unknown } = globalThis,
): DemoBrowserSupport {
  const hasIndexedDb = typeof globals.indexedDB !== "undefined";
  const wasm = globals.WebAssembly as typeof WebAssembly | undefined;
  const hasWasm = typeof wasm === "object" && typeof wasm.instantiate === "function";

  return {
    hasIndexedDb,
    hasWasm,
    canRun: hasIndexedDb && hasWasm,
    isChromiumBased: isChromiumBased(nav),
  };
}

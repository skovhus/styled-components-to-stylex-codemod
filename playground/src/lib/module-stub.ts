interface BrowserRequire {
  (specifier: string): never;
  resolve(specifier: string): never;
}

export function createRequire(_filename: string | URL): BrowserRequire {
  return Object.assign(
    (_specifier: string): never => {
      throw new Error("CommonJS require is unavailable in the playground.");
    },
    {
      resolve(_specifier: string): never {
        throw new Error(
          "Module resolution through createRequire is unavailable in the playground.",
        );
      },
    },
  );
}

export default {
  createRequire,
};

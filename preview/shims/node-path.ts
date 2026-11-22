const join = (...p: string[]) => p.join("/").replace(/\/+/g, "/");
const path = { join, resolve: (...p: string[]) => join("/", ...p), basename: (p: string) => p.split("/").pop() ?? "", dirname: (p: string) => p.split("/").slice(0, -1).join("/") || "/" };
export default path;

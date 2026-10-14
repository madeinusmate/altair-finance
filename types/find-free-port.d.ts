declare module "find-free-port" {
  const findFreePort: (from?: number, to?: number) => Promise<number | number[]>;
  export default findFreePort;
}

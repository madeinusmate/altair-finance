declare module "find-free-port" {
  const findFreePort: (from?: number, to?: number) => Promise<number>;
  export default findFreePort;
}

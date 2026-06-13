export {};

declare global {
  interface Env {
    METALS_DEV_KEY: string;
    GOLDAPI_KEY: string;
    ADMIN_KEY: string;
  }
}

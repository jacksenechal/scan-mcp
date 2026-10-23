import type { Backend } from "./services/backends/backend.js";
import type { AppConfig } from "./config.js";
import type { Logger } from "pino";

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  backend: Backend;
}

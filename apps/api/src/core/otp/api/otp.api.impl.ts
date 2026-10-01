import type { IOtpApi } from "./otp.api.js";

/**
 * Facade implementation — currently a no-op wrapper. The service is passed
 * so a future method can delegate without touching the composition root.
 */
export class OtpApi implements IOtpApi {
  // The parameter is retained for future methods; suppress unused-locals by
  // marking it optional and unused explicitly.
  constructor() {
    /* no-op */
  }
}

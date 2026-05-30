const LOG_PREFIX = "[observability/xray]";

type XRaySegment = {
  addNewSubsegment: (name: string) => XRaySubsegment;
  addAnnotation?: (key: string, value: string | number | boolean) => void;
};

type XRaySubsegment = {
  close: () => void;
  addError?: (error: unknown) => void;
  addAnnotation?: (key: string, value: string | number | boolean) => void;
};

type XRaySdk = {
  getSegment: () => XRaySegment | undefined;
  captureAsyncFunc?: <T>(
    name: string,
    fn: (subsegment?: XRaySubsegment) => Promise<T>,
  ) => Promise<T>;
};

let xraySdk: XRaySdk | null | undefined;

function loadXRaySdk(): XRaySdk | null {
  if (xraySdk !== undefined) return xraySdk;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    xraySdk = require("aws-xray-sdk-core") as XRaySdk;
  } catch (error) {
    console.error(LOG_PREFIX, "failed to load aws-xray-sdk-core", error);
    xraySdk = null;
  }
  return xraySdk;
}

export function isXRayEnabled(): boolean {
  return process.env.AWS_XRAY_SDK_ENABLED === "true";
}

export async function captureAsyncSegment<T>(
  name: string,
  fn: () => Promise<T>,
  annotations: Record<string, string | number | boolean> = {},
): Promise<T> {
  if (!isXRayEnabled()) {
    return fn();
  }

  try {
    const sdk = loadXRaySdk();
    if (!sdk) return fn();

    if (typeof sdk.captureAsyncFunc === "function") {
      return sdk.captureAsyncFunc(name, async (subsegment) => {
        for (const [key, value] of Object.entries(annotations)) {
          subsegment?.addAnnotation?.(key, value);
        }
        return fn();
      });
    }

    const segment = sdk.getSegment();
    if (!segment) return fn();

    const subsegment = segment.addNewSubsegment(name);
    for (const [key, value] of Object.entries(annotations)) {
      subsegment.addAnnotation?.(key, value);
    }

    try {
      const result = await fn();
      subsegment.close();
      return result;
    } catch (error) {
      subsegment.addError?.(error);
      subsegment.close();
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message !== "Failed to get the current sub/segment.") {
      console.error(LOG_PREFIX, "captureAsyncSegment failed", { name, error });
    }
    return fn();
  }
}

export function annotateSegment(
  annotations: Record<string, string | number | boolean>,
): void {
  if (!isXRayEnabled()) return;

  try {
    const sdk = loadXRaySdk();
    if (!sdk) return;

    const segment = sdk.getSegment();
    if (!segment?.addAnnotation) return;

    for (const [key, value] of Object.entries(annotations)) {
      segment.addAnnotation(key, value);
    }
  } catch (error) {
    console.error(LOG_PREFIX, "annotateSegment failed", error);
  }
}

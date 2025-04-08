declare global {
  interface proceees {
    env: {
      OPENAPI_SPEC_URL: string;
      OPENAPI_SPEC_BASE_URL: string;
      OPENAPI_SPEC_HEADERS: string;
    };
  }
}

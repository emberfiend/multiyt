declare global {
  interface Window {
    gapi: typeof gapi;
  }
}

declare namespace gapi.client {
  function init(config: {
      apiKey: string;
      discoveryDocs: string[];
  }): Promise<void>;
  function load(apiName: string, apiVersion: string): Promise<void>;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let youtube: any; // Use a more specific type if you can find one
}

declare const gapi: {
  load: (client: string, callback: () => void) => void;
  client: typeof gapi.client;
};
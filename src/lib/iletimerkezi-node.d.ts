declare module '@iletimerkezi/iletimerkezi-node' {
  export class IletiMerkeziClient {
    constructor(apiKey: string, apiHash: string, sender: string);
    [key: string]: any;
  }
}
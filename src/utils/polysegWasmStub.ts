export default class ICRPolySeg {
  get instance(): never {
    throw new Error('PolySeg WASM is not available in this build.')
  }

  async initialize(): Promise<void> {
    throw new Error('PolySeg WASM is not available in this build.')
  }
}

export interface HakuScript {
  onStart?(): void
  onUpdate?(dt: number): void
}

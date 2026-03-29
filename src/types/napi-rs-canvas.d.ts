declare module '@napi-rs/canvas' {
  type TextAlign = 'left' | 'right' | 'center' | 'start' | 'end';

  interface Canvas2DContext {
    fillStyle: string;
    font: string;
    textAlign: TextAlign;
    fillRect(x: number, y: number, width: number, height: number): void;
    fillText(text: string, x: number, y: number): void;
  }

  interface Canvas {
    getContext(type: '2d'): Canvas2DContext;
    toBuffer(mimeType?: string): Buffer;
  }

  export function createCanvas(width: number, height: number): Canvas;
}

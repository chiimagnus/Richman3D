export const PAGES_ORIGIN = "https://chiimagnus.github.io";
export const CLOUD_ROOM_ORIGIN = "https://richman3d-multiplayer.chiimagnus.workers.dev";

export function roomServerOrigin(pageOrigin: string): string {
  return pageOrigin === PAGES_ORIGIN ? CLOUD_ROOM_ORIGIN : pageOrigin;
}

import type { Command } from "../domain/types";
import type { PresentationSpeed } from "../settings/preferences";
import type { GameView } from "./GameSession";
import type { PresentationPort } from "./PresentationQueue";

export interface PlaySession {
  readonly kind: "local" | "online";
  readonly matchId: string;
  getSnapshot(): GameView;
  subscribe(listener: () => void): () => void;
  bind(port: PresentationPort): () => void;
  dispatch(command: Command): Promise<void>;
  pause(): void;
  resume(): Promise<void>;
  skipPresentation(): void;
  failPresentation(): void;
  setPresentationSpeed(speed: PresentationSpeed): void;
  claimAnnouncement(id: number): boolean;
  claimDiceAnnouncement(revision: number): boolean;
  dispose(): void;
}

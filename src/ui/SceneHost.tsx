import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { GameApp } from "../app/GameApp";
import type { GameSession } from "../app/GameSession";
import { World } from "../rendering/World";
import { lookSensitivityScale, type GamePreferences } from "../settings/preferences";
import { messages } from "../i18n";
import { useGameView } from "./useGameView";
import styles from "./App.module.css";
import { playerConfig } from "../domain/config";
import type { CameraView } from "../rendering/CameraRig";

export type SceneControls = { lookAround(): void; centerCurrent(): void };

export function SceneHost({ app, session, preferences, cameraView, interactive, selectedTileId, onInspect, ref }: { app: GameApp; session: GameSession; preferences: GamePreferences; cameraView: CameraView; interactive: boolean; selectedTileId: string | null; onInspect: (tileId: string) => void; ref: Ref<SceneControls> }) {
  const host = useRef<HTMLDivElement>(null);
  const resources = useRef<{ world: World } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pointerError, setPointerError] = useState(false);
  const view = useGameView(session);
  useImperativeHandle(ref, () => ({ lookAround() {
    const world = resources.current?.world;
    if (!world) return;
    if (document.pointerLockElement === world.canvas) { world.unlockFirstPerson(); return; }
    world.setInteractive(true);
    setPointerError(false);
    world.lockFirstPerson(() => setPointerError(true));
  }, centerCurrent() { resources.current?.world.centerCurrent(session.getSnapshot().displayed); } }), [session]);
  useEffect(() => {
    let world: World | null = null;
    let unbind = () => {};
    const settings = app.getSnapshot().preferences;
    const audio = app.audio;
    const fail = () => { session.failPresentation(); setFailed(true); };
    try {
      const snapshot = session.getSnapshot().committed;
      world = new World(host.current!, settings.language, snapshot.config, snapshot.map, snapshot.rules, fail, onInspect);
      world.setObserver(session.getSnapshot().viewPlayerId, snapshot);
      world.setView(session.getSnapshot().viewPlayerId === null ? "overview" : cameraView);
      world.setInteractive(interactive && session.getSnapshot().mode === "running");
      const activeWorld = world;
      resources.current = { world };
      world.setSelectedTile(selectedTileId);
      world.setLookSensitivity(lookSensitivityScale(settings.lookSensitivity));
      unbind = session.bind({
        sync: (snapshot) => activeWorld.sync(snapshot),
        stop: () => { activeWorld.cancelPresentation(); audio.stop(); },
        present: async (events, signal, settle, show, settleDice) => {
          let settled = false;
          const feedback = async () => {
            if (settled || signal.aborted) return;
            settled = true;
            const duration = settle();
            if (duration > 0) await activeWorld.wait(duration, signal);
          };
          for (const event of events) {
            if (event.kind === "turn" || event.kind === "ended") await feedback();
            if (signal.aborted) return;
            switch (event.kind) {
              case "rolled": {
                if (!event.result.controlledBy) audio.playRoll();
                if (!await activeWorld.rollDice(event.result.dice, signal, settleDice)) return;
                await activeWorld.movePlayer(event.result.playerId, event.result.path, () => audio.playStep(), signal);
                if (signal.aborted) return;
                activeWorld.hideDice();
                activeWorld.landOnTile(event.result.to, event.result.landing);
                audio.playLanding(event.result.landing);
                if (event.result.landing.kind === "movement_card" || event.result.landing.kind === "item_received") {
                  show(event);
                  if (!await activeWorld.wait(900, signal)) return;
                }
                break;
              }
              case "card_moved": {
                show(event);
                if (event.result.direction === "teleport") activeWorld.teleportPlayer(event.result.playerId, event.result.to);
                else await activeWorld.movePlayer(event.result.playerId, event.result.path, () => audio.playStep(), signal);
                if (signal.aborted) return;
                activeWorld.landOnTile(event.result.to, event.result.landing);
                audio.playLanding(event.result.landing);
                break;
              }
              case "purchased":
              case "building_sold":
              case "mortgaged":
              case "redeemed": audio.playPurchase(); break;
              case "upgraded":
                activeWorld.sync(session.getSnapshot().committed);
                audio.playPurchase();
                if (!await activeWorld.growProperty(event.propertyId, signal)) return;
                break;
              case "trade_accepted": audio.playPurchase(); break;
              case "item_used":
                show(event);
                activeWorld.sync(session.getSnapshot().committed);
                audio.playPurchase();
                break;
              case "item_discarded": break;
              case "trade_proposed":
              case "trade_rejected": break;
              case "skipped": break;
              case "auction_started":
              case "auction_bid":
              case "auction_passed":
              case "auction_ended": break;
              case "paid":
              case "liquidated": break;
              case "turn": audio.playTurn(playerConfig(snapshot.config, event.actor).controller === "human"); break;
              case "ended": activeWorld.unlockFirstPerson(); audio.playGameOver(event.result.winnerIds.some((id) => playerConfig(snapshot.config, id).controller === "human")); break;
            }
          }
          await feedback();
        },
      });
    } catch { fail(); }
    const pointerFailure = () => setPointerError(true);
    document.addEventListener("pointerlockerror", pointerFailure);
    return () => {
      document.removeEventListener("pointerlockerror", pointerFailure);
      unbind();
      resources.current = null;
      audio.stop();
      world?.dispose();
    };
  }, [app, session]);
  useEffect(() => {
    const resource = resources.current;
    if (!resource) return;
    resource.world.setLanguage(preferences.language);
    resource.world.setLookSensitivity(lookSensitivityScale(preferences.lookSensitivity));
  }, [preferences]);
  useEffect(() => {
    const world = resources.current?.world;
    if (!world) return;
    world.setObserver(view.viewPlayerId, view.committed);
    world.setView(view.viewPlayerId === null ? "overview" : cameraView);
    if (view.mode !== "running") world.unlockFirstPerson();
  }, [view.viewPlayerId, view.mode, cameraView]);
  useEffect(() => { resources.current?.world.setInteractive(interactive && view.mode === "running"); }, [interactive, view.mode]);
  useEffect(() => { resources.current?.world.setSelectedTile(selectedTileId); }, [selectedTileId]);
  useEffect(() => {
    const world = resources.current?.world;
    if (!world) return;
    const look = (event: MouseEvent) => {
      if (!interactive || view.mode !== "running" || view.viewPlayerId === null || cameraView !== "first_person") return;
      event.preventDefault();
      if (document.pointerLockElement === world.canvas) world.unlockFirstPerson();
      else { setPointerError(false); world.lockFirstPerson(() => setPointerError(true)); }
    };
    world.canvas.addEventListener("dblclick", look);
    return () => world.canvas.removeEventListener("dblclick", look);
  }, [interactive, view.mode, view.viewPlayerId, cameraView]);
  const copy = messages(preferences.language).runtime;
  return <>
    <div ref={host} className={styles.scene} />
    {!failed && pointerError && <span className={styles.cameraError} role="status">{copy.pointerLockFailed}</span>}
  </>;
}

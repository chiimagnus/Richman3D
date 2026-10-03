import { useEffect, useRef, useState } from "react";
import type { GameApp } from "../app/GameApp";
import type { GameSession } from "../app/GameSession";
import { World } from "../rendering/World";
import { lookSensitivityScale, type GamePreferences } from "../settings/preferences";
import { messages } from "../i18n";
import { useGameView } from "./useGameView";
import styles from "./App.module.css";
import { playerConfig } from "../domain/config";
import type { CameraView } from "../rendering/CameraRig";

export function SceneHost({ app, session, preferences }: { app: GameApp; session: GameSession; preferences: GamePreferences }) {
  const host = useRef<HTMLDivElement>(null);
  const resources = useRef<{ world: World } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pointerError, setPointerError] = useState(false);
  const [locked, setLocked] = useState(false);
  const [cameraView, setCameraView] = useState<CameraView>(() => window.matchMedia("(pointer: coarse)").matches ? "overview" : "first_person");
  const view = useGameView(session);
  useEffect(() => {
    let world: World | null = null;
    let unbind = () => {};
    let unsubscribe = () => {};
    const settings = app.getSnapshot().preferences;
    const audio = app.audio;
    const fail = () => { session.failPresentation(); setFailed(true); };
    try {
      const snapshot = session.getSnapshot().committed;
      world = new World(host.current!, settings.language, snapshot.config, snapshot.map, snapshot.rules, fail);
      world.setObserver(session.getSnapshot().viewPlayerId, snapshot);
      const activeWorld = world;
      resources.current = { world };
      world.setLookSensitivity(lookSensitivityScale(settings.lookSensitivity));
      unsubscribe = world.onPointerLockChange(setLocked);
      unbind = session.bind({
        sync: (snapshot) => activeWorld.sync(snapshot),
        stop: () => { activeWorld.cancelPresentation(); audio.stop(); },
        present: async (events, signal, settle) => {
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
                audio.playRoll();
                if (!await activeWorld.wait(520, signal)) return;
                await activeWorld.movePlayer(event.result.playerId, event.result.path, () => audio.playStep(), signal);
                if (signal.aborted) return;
                activeWorld.landOnTile(event.result.to, event.result.landing);
                audio.playLanding(event.result.landing);
                break;
              }
              case "purchased": audio.playPurchase(); break;
              case "skipped": break;
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
      unsubscribe();
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
  const copy = messages(preferences.language).runtime;
  return <>
    <div ref={host} className={styles.scene} />
    {!failed && <div className={styles.camera}>
      <button disabled={!view.attached || view.mode !== "running" || view.viewPlayerId === null} onClick={() => setCameraView(cameraView === "overview" ? "first_person" : "overview")}>{cameraView === "overview" ? messages(preferences.language).setup.firstPerson : messages(preferences.language).setup.overview}</button>
      {cameraView === "first_person" && <button disabled={!view.attached || view.mode !== "running" || view.viewPlayerId === null} onClick={() => {
        const world = resources.current?.world;
        if (locked) world?.unlockFirstPerson();
        else { setPointerError(false); world?.lockFirstPerson(() => setPointerError(true)); }
      }}>{locked ? copy.exitFirstPerson : copy.firstPerson}</button>}
      {pointerError && <span role="status">{copy.pointerLockFailed}</span>}
    </div>}
  </>;
}

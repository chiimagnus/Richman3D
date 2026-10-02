import { useEffect, useRef, useState } from "react";
import type { GameApp } from "../app/GameApp";
import type { GameSession } from "../app/GameSession";
import { GameAudio } from "../audio/GameAudio";
import { World } from "../rendering/World";
import { lookSensitivityScale, type GamePreferences } from "../settings/preferences";
import { messages } from "../i18n";
import { useGameView } from "./useGameView";
import styles from "./App.module.css";

export function SceneHost({ app, session, preferences }: { app: GameApp; session: GameSession; preferences: GamePreferences }) {
  const host = useRef<HTMLDivElement>(null);
  const resources = useRef<{ world: World; audio: GameAudio } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pointerError, setPointerError] = useState(false);
  const [locked, setLocked] = useState(false);
  const view = useGameView(session);
  useEffect(() => {
    let world: World | null = null;
    let unbind = () => {};
    let unsubscribe = () => {};
    const settings = app.getSnapshot().preferences;
    const audio = new GameAudio(settings.soundEnabled);
    const fail = () => { session.failPresentation(); setFailed(true); };
    try {
      world = new World(host.current!, settings.language, fail);
      const activeWorld = world;
      resources.current = { world, audio };
      world.setLookSensitivity(lookSensitivityScale(settings.lookSensitivity));
      unsubscribe = world.onPointerLockChange(setLocked);
      unbind = session.bind({
        sync: (snapshot) => activeWorld.sync(snapshot),
        stop: () => { activeWorld.cancelPresentation(); audio.stop(); },
        present: async (events, signal) => {
          for (const event of events) {
            if (signal.aborted) return;
            switch (event.kind) {
              case "rolled": {
                audio.playRoll();
                if (!await activeWorld.wait(520, signal)) return;
                const move = event.result.playerId === "human" ? activeWorld.moveHuman.bind(activeWorld) : activeWorld.moveBot.bind(activeWorld);
                await move(event.result.path, () => audio.playStep(), signal);
                if (signal.aborted) return;
                activeWorld.landOnTile(event.result.to, event.result.landing);
                audio.playLanding(event.result.landing);
                break;
              }
              case "purchased": audio.playPurchase(); break;
              case "skipped": break;
              case "turn": audio.playTurn(event.actor); break;
              case "ended": activeWorld.unlockFirstPerson(); audio.playGameOver(event.winnerId); break;
            }
          }
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
      audio.dispose();
      world?.dispose();
    };
  }, [app, session]);
  useEffect(() => {
    const resource = resources.current;
    if (!resource) return;
    resource.world.setLanguage(preferences.language);
    resource.world.setLookSensitivity(lookSensitivityScale(preferences.lookSensitivity));
    resource.audio.setEnabled(preferences.soundEnabled);
  }, [preferences]);
  useEffect(() => {
    if (view.mode !== "running") resources.current?.world.unlockFirstPerson();
  }, [view.mode]);
  const copy = messages(preferences.language).runtime;
  return <>
    <div ref={host} className={styles.scene} />
    {failed ? <div className={styles.failure} role="alert"><p>{copy.presentation_failed}</p><button onClick={() => app.leave()}>{copy.leave}</button></div> : <div className={styles.camera}>
      <button disabled={!view.attached || view.mode !== "running"} onClick={() => {
        const world = resources.current?.world;
        if (locked) world?.unlockFirstPerson();
        else { setPointerError(false); world?.lockFirstPerson(() => setPointerError(true)); }
      }}>{locked ? copy.exitFirstPerson : copy.firstPerson}</button>
      {pointerError && <span role="status">{copy.pointerLockFailed}</span>}
    </div>}
  </>;
}

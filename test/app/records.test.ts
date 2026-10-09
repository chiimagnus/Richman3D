import { expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { GameSession } from "../../src/app/GameSession";
import { GameStore } from "../../src/storage/GameStore";
import { SaveError } from "../../src/storage/snapshot";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { legalCommands } from "../../src/domain/selectors";

it("real session events survive a failed save/retry, while denied commands and restored matches cannot duplicate achievements", async () => {
  const factory = new IDBFactory(); const store = new GameStore(() => factory);
  const game = new Game(createMatchConfig(940)); const matchId = crypto.randomUUID();
  let session = new GameSession(game, matchId, { store, expected: null, source: "local" });
  await session.initializeSave(); session.bind({ sync() {}, stop() {}, async present() {} });
  try {
    const before = await store.readProfile();
    await session.dispatch({ kind: "buy", actor: "p1", expectedRevision: 0 });
    expect(await store.readProfile()).toEqual(before);
    for (let count = 0; game.snapshot.decision.kind !== "awaiting_purchase" && count < 20; count += 1) {
      const command = legalCommands(game.snapshot, "p1").find((entry) => entry.kind === "roll")!;
      await session.dispatch(command);
    }
    expect(game.snapshot.decision).toMatchObject({ kind: "awaiting_purchase", actorId: "p1" });
    const buy = legalCommands(game.snapshot, "p1").find((entry) => entry.kind === "buy")!;
    const fail = vi.spyOn(store, "save").mockRejectedValueOnce(new SaveError("unavailable"));
    await session.dispatch(buy); fail.mockRestore();
    expect(session.getSnapshot().save.kind).toBe("unsaved");
    expect((await store.readProfile()).records.achievements).not.toContain("first-purchase");
    const committed = game.snapshot;
    await session.retrySave(); expect(game.snapshot).toBe(committed);
    expect((await store.readProfile()).records.achievements).toContain("first-purchase");
    const stored = (await store.read())!.record;
    session.dispose();
    session = new GameSession(Game.restore(stored.state), matchId, { store, expected: stored, source: "local" });
    await session.initializeSave(); session.bind({ sync() {}, stop() {}, async present() {} });
    await session.activate();
    await store.clearRecords();
    const commands = legalCommands(session.getSnapshot().committed, "p1");
    await session.dispatch(commands.find((entry) => entry.kind === "roll") ?? commands[0]!);
    expect((await store.readProfile()).records.achievements).not.toContain("first-purchase");
  } finally { session.dispose(); }
});

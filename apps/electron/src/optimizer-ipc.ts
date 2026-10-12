import type { IpcArgs, OptimizerProgressEvent } from "@koloda/native-ipc";
import { OPTIMIZER_PROGRESS_CHANNEL } from "@koloda/native-ipc";
import { ipcMain } from "electron";
import { assertAppSender } from "./app-sender";
import type { KolodaDb } from "./koloda-db";

type OptimizerDb = Pick<KolodaDb, "optimizeAlgorithm" | "cancelAlgorithmOptimization">;

export function registerOptimizerIpc(db: OptimizerDb) {
  ipcMain.handle("cmd_optimize_algorithm", async (event, args: IpcArgs<"cmd_optimize_algorithm">) => {
    assertAppSender(event);
    const sender = event.sender;
    // WHY: training runs for seconds on its own thread; a closed window can no longer show or apply the result.
    const cancel = () => db.cancelAlgorithmOptimization({ requestId: args.requestId });
    sender.once("destroyed", cancel);
    try {
      return await db.optimizeAlgorithm(args, (progress: OptimizerProgressEvent) => {
        if (!sender.isDestroyed()) sender.send(OPTIMIZER_PROGRESS_CHANNEL, progress);
      });
    } finally {
      sender.removeListener("destroyed", cancel);
    }
  });
  ipcMain.handle("cmd_cancel_algorithm_optimization", (event, args: IpcArgs<"cmd_cancel_algorithm_optimization">) => {
    assertAppSender(event);
    db.cancelAlgorithmOptimization(args);
  });
}

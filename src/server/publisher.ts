import type { Account } from "./db";
import { runXUseJob, xuseCapability } from "./xuse";

export type PublishInput = { account: Account; text: string; mediaPath?: string; existingQueueId?: string };
export type PublishReceipt = { ok: boolean; receipt: string; remoteUrl?: string; queueId?: string; reason?: string; transport: "xuse" };

export interface XPublisher {
  publishPost(input: PublishInput): Promise<PublishReceipt>;
  health(account: Account): { ok: boolean; reason: string };
  capabilities(account: Account): { post: boolean; media: boolean; reconciliation: "required" };
}

export class XUsePublisher implements XPublisher {
  health(account: Account): { ok: boolean; reason: string } {
    const capability = xuseCapability();
    if (!account.xuseAccountId) return { ok: false, reason: "x-use account id eksik" };
    return { ok: capability.available, reason: capability.available ? "" : `${capability.bin} kullanılamıyor` };
  }

  capabilities(account: Account): { post: boolean; media: boolean; reconciliation: "required" } {
    const ok = this.health(account).ok;
    return { post: ok, media: ok, reconciliation: "required" };
  }

  async publishPost(input: PublishInput): Promise<PublishReceipt> {
    const health = this.health(input.account);
    if (!health.ok) return { ok: false, receipt: "", reason: health.reason, transport: "xuse" };
    const result = await runXUseJob({
      action: "post",
      account: input.account.xuseAccountId,
      profileHandle: input.account.handle,
      text: input.text,
      mediaPath: input.mediaPath,
      existingQueueId: input.existingQueueId,
    });
    return { ...result, transport: "xuse" };
  }
}

const publisher = new XUsePublisher();

export function publish(input: PublishInput): Promise<PublishReceipt> {
  return publisher.publishPost(input);
}

export function publisherHealth(account: Account): ReturnType<XPublisher["health"]> {
  return publisher.health(account);
}

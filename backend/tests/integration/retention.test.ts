import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getStorage } from "../../src/providers/index.js";
import { runRetention } from "../../src/services/retention.service.js";
import { newSessionId } from "../../src/utils/ids.js";
import { prisma } from "../../src/utils/prisma.js";
import { redis } from "../../src/utils/redis.js";

const NOW = new Date("2026-09-18T00:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

async function resetDb(): Promise<void> {
  await prisma.$transaction([
    prisma.report.deleteMany(),
    prisma.transcriptSegment.deleteMany(),
    prisma.evidenceManifest.deleteMany(),
    prisma.recording.deleteMany(),
    prisma.observation.deleteMany(),
    prisma.interviewSession.deleteMany(),
    prisma.orgMember.deleteMany(),
    prisma.user.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.auditLog.deleteMany(),
  ]);
}

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
  await redis.quit();
});

async function makeOrgAndSession(endedAt: Date) {
  const org = await prisma.organization.create({ data: { name: "Acme", slug: `acme-${Date.now()}-${Math.random()}` } });
  const user = await prisma.user.create({ data: { email: `u-${Date.now()}-${Math.random()}@example.com`, name: "Owner", passwordHash: "x" } });
  const sessionId = newSessionId();
  await prisma.interviewSession.create({
    data: { id: sessionId, orgId: org.id, createdById: user.id, mode: "DIRECT_LINK", status: "COMPLETE", startedAt: endedAt, endedAt },
  });
  return { orgId: org.id, sessionId };
}

describe("retention (Phase 11)", () => {
  it("purges media past the retention window but keeps the recording row", async () => {
    const { orgId, sessionId } = await makeOrgAndSession(days(91));
    await getStorage().put(`orgs/${orgId}/sessions/${sessionId}/recordings/composite.mp4`, Buffer.from("video"));
    await prisma.recording.create({
      data: { sessionId, status: "READY", compositeUri: `orgs/${orgId}/sessions/${sessionId}/recordings/composite.mp4`, endedAt: days(91) },
    });

    const summary = await runRetention(NOW);
    expect(summary.mediaSessionsPurged).toBe(1);

    const recording = await prisma.recording.findUniqueOrThrow({ where: { sessionId } });
    expect(recording.compositeUri).toBeNull();
    expect(await getStorage().exists(`orgs/${orgId}/sessions/${sessionId}/recordings/composite.mp4`)).toBe(false);

    const audit = await prisma.auditLog.findFirst({ where: { sessionId, action: "retention.deleted" } });
    expect(audit?.metadata).toMatchObject({ category: "media" });
  });

  it("does not touch media inside the retention window", async () => {
    const { sessionId } = await makeOrgAndSession(days(89));
    await prisma.recording.create({ data: { sessionId, status: "READY", compositeUri: "some/key.mp4", endedAt: days(89) } });

    const summary = await runRetention(NOW);
    expect(summary.mediaSessionsPurged).toBe(0);
    const recording = await prisma.recording.findUniqueOrThrow({ where: { sessionId } });
    expect(recording.compositeUri).toBe("some/key.mp4");
  });

  it("hard-deletes raw observations past 180 days", async () => {
    const { sessionId } = await makeOrgAndSession(days(181));
    await prisma.observation.create({
      data: { sessionId, seq: 1, source: "CLIENT", channel: "FOCUS", type: "focus_loss", ts: days(181), payload: {}, prevHash: "0", hash: "1" },
    });

    const summary = await runRetention(NOW);
    expect(summary.observationsDeleted).toBe(1);
    expect(await prisma.observation.count({ where: { sessionId } })).toBe(0);
  });

  it("purges the raw event log but keeps the signed manifest", async () => {
    const { orgId, sessionId } = await makeOrgAndSession(days(181));
    const eventLogUri = `orgs/${orgId}/sessions/${sessionId}/evidence/events.ndjson.gz`;
    const manifestUri = `orgs/${orgId}/sessions/${sessionId}/evidence/manifest.json`;
    await getStorage().put(eventLogUri, Buffer.from("events"));
    await getStorage().put(manifestUri, Buffer.from("manifest"));
    await prisma.evidenceManifest.create({
      data: {
        sessionId,
        chainHead: "deadbeef",
        lastSeq: 1,
        eventLogUri,
        manifestUri,
        signature: "sig",
        signingKeyId: "k1",
        detectorVersions: {},
        weightsVersion: "v1",
        sealedAt: days(181),
      },
    });

    const summary = await runRetention(NOW);
    expect(summary.eventLogsPurged).toBe(1);
    expect(await getStorage().exists(eventLogUri)).toBe(false);
    expect(await getStorage().exists(manifestUri)).toBe(true);

    const manifest = await prisma.evidenceManifest.findUniqueOrThrow({ where: { sessionId } });
    expect(manifest.chainHead).toBe("deadbeef"); // row/verification metadata untouched
  });

  it("never purges the event log before the 30-day floor even with a short observations window", async () => {
    const { sessionId } = await makeOrgAndSession(days(181));
    const eventLogUri = `orgs/x/sessions/${sessionId}/evidence/events.ndjson.gz`;
    await getStorage().put(eventLogUri, Buffer.from("events"));
    await prisma.evidenceManifest.create({
      data: {
        sessionId,
        chainHead: "abc",
        lastSeq: 1,
        eventLogUri,
        manifestUri: "orgs/x/manifest.json",
        signature: "sig",
        signingKeyId: "k1",
        detectorVersions: {},
        weightsVersion: "v1",
        sealedAt: days(10), // sealed 10 days ago — inside the 30-day floor
      },
    });

    await runRetention(NOW);
    expect(await getStorage().exists(eventLogUri)).toBe(true);
  });

  it("hard-deletes the report and transcript past 3 years", async () => {
    const { orgId, sessionId } = await makeOrgAndSession(days(1096));
    const htmlUri = `orgs/${orgId}/sessions/${sessionId}/reports/report.html`;
    await getStorage().put(htmlUri, Buffer.from("<html></html>"));
    await prisma.report.create({
      data: { sessionId, model: {}, methodology: {}, htmlUri },
    });
    await prisma.transcriptSegment.create({ data: { sessionId, text: "hello", startMs: 0, endMs: 100 } });

    const summary = await runRetention(NOW);
    expect(summary.reportsDeleted).toBe(1);
    expect(summary.transcriptSegmentsDeleted).toBe(1);
    expect(await prisma.report.findUnique({ where: { sessionId } })).toBeNull();
    expect(await prisma.transcriptSegment.count({ where: { sessionId } })).toBe(0);
    expect(await getStorage().exists(htmlUri)).toBe(false);
  });

  it("is idempotent: a second run finds nothing left to purge", async () => {
    const { orgId, sessionId } = await makeOrgAndSession(days(91));
    await prisma.recording.create({
      data: { sessionId, status: "READY", compositeUri: `orgs/${orgId}/sessions/${sessionId}/recordings/composite.mp4`, endedAt: days(91) },
    });

    await runRetention(NOW);
    const second = await runRetention(NOW);
    expect(second.mediaSessionsPurged).toBe(0);
  });
});

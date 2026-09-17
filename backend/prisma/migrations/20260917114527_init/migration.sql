-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'INTERVIEWER', 'REVIEWER');

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('SCHEDULED', 'DIRECT_LINK');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'CONFIGURED', 'ARMED', 'ADMITTED', 'LIVE', 'SEALING', 'PROCESSING', 'COMPLETE', 'ABORTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('TECHNICAL', 'CODING', 'SYSTEM_DESIGN', 'BEHAVIORAL', 'MIXED');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "Sensitivity" AS ENUM ('LOW', 'STANDARD', 'HIGH');

-- CreateEnum
CREATE TYPE "MonitoringChannel" AS ENUM ('GAZE', 'FACE', 'IDENTITY', 'SCENE', 'AUDIO', 'SCREEN', 'FOCUS', 'PASTE', 'RHYTHM', 'POINTER', 'ENVIRONMENT');

-- CreateEnum
CREATE TYPE "JdSourceType" AS ENUM ('TEXT', 'PDF', 'DOCX');

-- CreateEnum
CREATE TYPE "ParseStatus" AS ENUM ('PENDING', 'PROCESSING', 'PARSED', 'FAILED');

-- CreateEnum
CREATE TYPE "JoinLinkKind" AS ENUM ('ONE_TIME', 'REUSABLE');

-- CreateEnum
CREATE TYPE "ObservationSource" AS ENUM ('CLIENT', 'EDITOR', 'CV', 'ASR', 'GATEWAY');

-- CreateEnum
CREATE TYPE "FlagSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "FlagStatus" AS ENUM ('OPEN', 'CONFIRMED', 'DISMISSED', 'DOWNGRADED');

-- CreateEnum
CREATE TYPE "FlagOrigin" AS ENUM ('LIVE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "AdjudicationAction" AS ENUM ('CONFIRM', 'DISMISS', 'DOWNGRADE');

-- CreateEnum
CREATE TYPE "WarningTier" AS ENUM ('NOTICE', 'WARNING', 'INTERRUPT');

-- CreateEnum
CREATE TYPE "UnscoredReason" AS ENUM ('CALIBRATION', 'SIGNAL_LOSS', 'QC_GATE', 'SEQUENCE_GAP', 'DETECTOR_DOWN');

-- CreateEnum
CREATE TYPE "Speaker" AS ENUM ('INTERVIEWER', 'CANDIDATE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SuggestionSource" AS ENUM ('MODEL', 'QUESTION_BANK');

-- CreateEnum
CREATE TYPE "EditChangeType" AS ENUM ('TYPE', 'PASTE', 'AUTOCOMPLETE', 'UNDO');

-- CreateEnum
CREATE TYPE "SnapshotReason" AS ENUM ('INTERVAL', 'RUN', 'SUBMIT');

-- CreateEnum
CREATE TYPE "ExecutionKind" AS ENUM ('RUN', 'SUBMIT');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'ERROR', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('PENDING', 'RECORDING', 'FINALIZING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'DEGRADED', 'FAILED');

-- CreateEnum
CREATE TYPE "PipelineStep" AS ENUM ('SEAL_VERIFY', 'TRANSCRIPT_FINALIZE', 'INTEGRITY_RESCORE', 'CODE_EVALUATE', 'MEDIA_INDEX', 'ANSWER_GRADING', 'COMPOSITE_SCORE', 'RENDER_REPORT');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'CANDIDATE', 'SYSTEM');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_members" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'INTERVIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_sessions" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "candidateId" TEXT,
    "mode" "InterviewMode" NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "interviewType" "InterviewType",
    "difficulty" "Difficulty",
    "recordVideo" BOOLEAN NOT NULL DEFAULT true,
    "recordAudio" BOOLEAN NOT NULL DEFAULT true,
    "recordScreen" BOOLEAN NOT NULL DEFAULT true,
    "channels" "MonitoringChannel"[],
    "sensitivity" "Sensitivity" NOT NULL DEFAULT 'STANDARD',
    "topicBudgets" JSONB,
    "configVersion" INTEGER NOT NULL DEFAULT 0,
    "needsReconsent" BOOLEAN NOT NULL DEFAULT false,
    "armedAt" TIMESTAMP(3),
    "admittedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "sealedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_interviewers" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_interviewers_pkey" PRIMARY KEY ("sessionId","userId")
);

-- CreateTable
CREATE TABLE "job_descriptions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sourceType" "JdSourceType" NOT NULL,
    "rawText" TEXT,
    "rawUri" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "parseStatus" "ParseStatus" NOT NULL DEFAULT 'PENDING',
    "parseError" TEXT,
    "parsed" JSONB,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "parsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coding_tasks" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "languages" TEXT[],
    "starterCode" JSONB,
    "visibleTests" JSONB NOT NULL,
    "hiddenTests" JSONB NOT NULL,
    "timeLimitMs" INTEGER NOT NULL DEFAULT 5000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coding_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_coding_tasks" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "session_coding_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_bank_items" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "skills" TEXT[],
    "difficulty" "Difficulty" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_bank_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "join_tokens" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" "JoinLinkKind" NOT NULL,
    "notBefore" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "join_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preflight_checks" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "joinTokenId" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "failures" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "probe" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preflight_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "joinTokenId" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "channels" "MonitoringChannel"[],
    "scopeDisplayed" JSONB NOT NULL,
    "policyHash" TEXT NOT NULL,
    "configVersion" INTEGER NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "ipHash" TEXT NOT NULL,
    "uaHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observations" (
    "id" BIGSERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "source" "ObservationSource" NOT NULL,
    "channel" "MonitoringChannel" NOT NULL,
    "type" TEXT NOT NULL,
    "clientTs" TIMESTAMP(3),
    "ts" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "llr" DOUBLE PRECISION,
    "payload" JSONB NOT NULL,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flags" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "origin" "FlagOrigin" NOT NULL DEFAULT 'LIVE',
    "type" TEXT NOT NULL,
    "channel" "MonitoringChannel" NOT NULL,
    "corroboratingChannels" "MonitoringChannel"[],
    "severity" "FlagSeverity" NOT NULL,
    "status" "FlagStatus" NOT NULL DEFAULT 'OPEN',
    "narrative" TEXT NOT NULL,
    "startTs" TIMESTAMP(3) NOT NULL,
    "endTs" TIMESTAMP(3),
    "mediaOffsetMs" INTEGER,
    "scoreDelta" DOUBLE PRECISION NOT NULL,
    "mergedCount" INTEGER NOT NULL DEFAULT 1,
    "evidenceFrameUris" TEXT[],
    "supersededByReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flag_observations" (
    "flagId" TEXT NOT NULL,
    "observationId" BIGINT NOT NULL,

    CONSTRAINT "flag_observations_pkey" PRIMARY KEY ("flagId","observationId")
);

-- CreateTable
CREATE TABLE "flag_adjudications" (
    "id" TEXT NOT NULL,
    "flagId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "action" "AdjudicationAction" NOT NULL,
    "fromSeverity" "FlagSeverity" NOT NULL,
    "toSeverity" "FlagSeverity",
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flag_adjudications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warnings" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "flagId" TEXT,
    "type" TEXT NOT NULL,
    "tier" "WarningTier" NOT NULL,
    "message" TEXT NOT NULL,
    "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "ackLatencyMs" INTEGER,

    CONSTRAINT "warnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unscored_windows" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "channel" "MonitoringChannel" NOT NULL,
    "reason" "UnscoredReason" NOT NULL,
    "startTs" TIMESTAMP(3) NOT NULL,
    "endTs" TIMESTAMP(3),
    "detail" TEXT,

    CONSTRAINT "unscored_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrity_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "channels" JSONB NOT NULL,

    CONSTRAINT "integrity_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_segments" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "speaker" "Speaker" NOT NULL DEFAULT 'UNKNOWN',
    "speakerLabel" TEXT,
    "text" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "words" JSONB,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcript_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_suggestions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "rationale" TEXT,
    "topic" TEXT,
    "source" "SuggestionSource" NOT NULL DEFAULT 'MODEL',
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mediaOffsetMs" INTEGER,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editor_deltas" (
    "id" BIGSERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sessionTaskId" TEXT NOT NULL,
    "changeType" "EditChangeType" NOT NULL,
    "rangeOffset" INTEGER NOT NULL,
    "insertedChars" INTEGER NOT NULL,
    "deletedChars" INTEGER NOT NULL,
    "text" TEXT,
    "keystrokeStats" JSONB,
    "ts" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "editor_deltas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_snapshots" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sessionTaskId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "reason" "SnapshotReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_executions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sessionTaskId" TEXT NOT NULL,
    "kind" "ExecutionKind" NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "visibleResults" JSONB,
    "hiddenResults" JSONB,
    "stdout" TEXT,
    "stderr" TEXT,
    "exitCode" INTEGER,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "code_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "egressId" TEXT,
    "status" "RecordingStatus" NOT NULL DEFAULT 'PENDING',
    "compositeUri" TEXT,
    "hlsUri" TEXT,
    "egressStartedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "checksum" TEXT,
    "mediaIndex" JSONB,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_manifests" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "chainHead" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL,
    "eventLogUri" TEXT NOT NULL,
    "manifestUri" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "signingKeyId" TEXT NOT NULL,
    "detectorVersions" JSONB NOT NULL,
    "weightsVersion" TEXT NOT NULL,
    "artifactChecksums" JSONB,
    "sealedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "evidence_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_runs" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "PipelineStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_step_runs" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "step" "PipelineStep" NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "output" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "pipeline_step_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_pairs" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "answerText" TEXT NOT NULL,
    "topic" TEXT,
    "questionStartMs" INTEGER NOT NULL,
    "answerEndMs" INTEGER NOT NULL,

    CONSTRAINT "qa_pairs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_grades" (
    "id" TEXT NOT NULL,
    "qaPairId" TEXT NOT NULL,
    "correctness" DOUBLE PRECISION NOT NULL,
    "depth" DOUBLE PRECISION NOT NULL,
    "specificity" DOUBLE PRECISION NOT NULL,
    "structure" DOUBLE PRECISION NOT NULL,
    "handsOn" DOUBLE PRECISION NOT NULL,
    "strengths" JSONB NOT NULL,
    "concerns" JSONB NOT NULL,
    "positiveSignals" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answer_grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_evaluations" (
    "id" TEXT NOT NULL,
    "sessionTaskId" TEXT NOT NULL,
    "hiddenPassed" INTEGER NOT NULL,
    "hiddenTotal" INTEGER NOT NULL,
    "staticAnalysis" JSONB,
    "complexity" TEXT,
    "typedRatio" DOUBLE PRECISION,
    "burstRate" DOUBLE PRECISION,
    "pasteMap" JSONB,
    "editTimeline" JSONB,
    "approachNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "technicalScore" DOUBLE PRECISION,
    "communicationScore" DOUBLE PRECISION,
    "integrityScore" DOUBLE PRECISION,
    "compositeScore" DOUBLE PRECISION,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "lostSteps" "PipelineStep"[],
    "model" JSONB NOT NULL,
    "methodology" JSONB NOT NULL,
    "htmlUri" TEXT,
    "pdfUri" TEXT,
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "orgId" TEXT,
    "sessionId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" "SessionStatus",
    "toStatus" "SessionStatus",
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "org_members_orgId_userId_key" ON "org_members"("orgId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_orgId_email_key" ON "candidates"("orgId", "email");

-- CreateIndex
CREATE INDEX "interview_sessions_orgId_status_idx" ON "interview_sessions"("orgId", "status");

-- CreateIndex
CREATE INDEX "interview_sessions_scheduledAt_idx" ON "interview_sessions"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_descriptions_sessionId_key" ON "job_descriptions"("sessionId");

-- CreateIndex
CREATE INDEX "coding_tasks_orgId_idx" ON "coding_tasks"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "session_coding_tasks_sessionId_taskId_key" ON "session_coding_tasks"("sessionId", "taskId");

-- CreateIndex
CREATE INDEX "question_bank_items_orgId_topic_idx" ON "question_bank_items"("orgId", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "join_tokens_jti_key" ON "join_tokens"("jti");

-- CreateIndex
CREATE INDEX "join_tokens_sessionId_idx" ON "join_tokens"("sessionId");

-- CreateIndex
CREATE INDEX "preflight_checks_sessionId_idx" ON "preflight_checks"("sessionId");

-- CreateIndex
CREATE INDEX "consents_sessionId_idx" ON "consents"("sessionId");

-- CreateIndex
CREATE INDEX "observations_sessionId_channel_ts_idx" ON "observations"("sessionId", "channel", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "observations_sessionId_seq_key" ON "observations"("sessionId", "seq");

-- CreateIndex
CREATE INDEX "flags_sessionId_status_idx" ON "flags"("sessionId", "status");

-- CreateIndex
CREATE INDEX "flag_adjudications_flagId_idx" ON "flag_adjudications"("flagId");

-- CreateIndex
CREATE INDEX "warnings_sessionId_type_idx" ON "warnings"("sessionId", "type");

-- CreateIndex
CREATE INDEX "unscored_windows_sessionId_idx" ON "unscored_windows"("sessionId");

-- CreateIndex
CREATE INDEX "integrity_snapshots_sessionId_ts_idx" ON "integrity_snapshots"("sessionId", "ts");

-- CreateIndex
CREATE INDEX "transcript_segments_sessionId_startMs_idx" ON "transcript_segments"("sessionId", "startMs");

-- CreateIndex
CREATE INDEX "question_suggestions_sessionId_batchId_idx" ON "question_suggestions"("sessionId", "batchId");

-- CreateIndex
CREATE INDEX "notes_sessionId_ts_idx" ON "notes"("sessionId", "ts");

-- CreateIndex
CREATE INDEX "editor_deltas_sessionTaskId_ts_idx" ON "editor_deltas"("sessionTaskId", "ts");

-- CreateIndex
CREATE INDEX "code_snapshots_sessionTaskId_createdAt_idx" ON "code_snapshots"("sessionTaskId", "createdAt");

-- CreateIndex
CREATE INDEX "code_executions_sessionTaskId_createdAt_idx" ON "code_executions"("sessionTaskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "recordings_sessionId_key" ON "recordings"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_manifests_sessionId_key" ON "evidence_manifests"("sessionId");

-- CreateIndex
CREATE INDEX "pipeline_runs_sessionId_idx" ON "pipeline_runs"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_step_runs_runId_step_key" ON "pipeline_step_runs"("runId", "step");

-- CreateIndex
CREATE UNIQUE INDEX "qa_pairs_sessionId_position_key" ON "qa_pairs"("sessionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "answer_grades_qaPairId_key" ON "answer_grades"("qaPairId");

-- CreateIndex
CREATE UNIQUE INDEX "code_evaluations_sessionTaskId_key" ON "code_evaluations"("sessionTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "reports_sessionId_key" ON "reports"("sessionId");

-- CreateIndex
CREATE INDEX "audit_logs_sessionId_createdAt_idx" ON "audit_logs"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_orgId_createdAt_idx" ON "audit_logs"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_interviewers" ADD CONSTRAINT "session_interviewers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_interviewers" ADD CONSTRAINT "session_interviewers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_descriptions" ADD CONSTRAINT "job_descriptions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coding_tasks" ADD CONSTRAINT "coding_tasks_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_coding_tasks" ADD CONSTRAINT "session_coding_tasks_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_coding_tasks" ADD CONSTRAINT "session_coding_tasks_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "coding_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank_items" ADD CONSTRAINT "question_bank_items_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_tokens" ADD CONSTRAINT "join_tokens_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_tokens" ADD CONSTRAINT "join_tokens_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preflight_checks" ADD CONSTRAINT "preflight_checks_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preflight_checks" ADD CONSTRAINT "preflight_checks_joinTokenId_fkey" FOREIGN KEY ("joinTokenId") REFERENCES "join_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_joinTokenId_fkey" FOREIGN KEY ("joinTokenId") REFERENCES "join_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flags" ADD CONSTRAINT "flags_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flag_observations" ADD CONSTRAINT "flag_observations_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "flags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flag_observations" ADD CONSTRAINT "flag_observations_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "observations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flag_adjudications" ADD CONSTRAINT "flag_adjudications_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "flags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flag_adjudications" ADD CONSTRAINT "flag_adjudications_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "flags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unscored_windows" ADD CONSTRAINT "unscored_windows_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrity_snapshots" ADD CONSTRAINT "integrity_snapshots_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_suggestions" ADD CONSTRAINT "question_suggestions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_suggestions" ADD CONSTRAINT "question_suggestions_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_deltas" ADD CONSTRAINT "editor_deltas_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_deltas" ADD CONSTRAINT "editor_deltas_sessionTaskId_fkey" FOREIGN KEY ("sessionTaskId") REFERENCES "session_coding_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_snapshots" ADD CONSTRAINT "code_snapshots_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_snapshots" ADD CONSTRAINT "code_snapshots_sessionTaskId_fkey" FOREIGN KEY ("sessionTaskId") REFERENCES "session_coding_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_executions" ADD CONSTRAINT "code_executions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_executions" ADD CONSTRAINT "code_executions_sessionTaskId_fkey" FOREIGN KEY ("sessionTaskId") REFERENCES "session_coding_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_manifests" ADD CONSTRAINT "evidence_manifests_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_step_runs" ADD CONSTRAINT "pipeline_step_runs_runId_fkey" FOREIGN KEY ("runId") REFERENCES "pipeline_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_pairs" ADD CONSTRAINT "qa_pairs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_grades" ADD CONSTRAINT "answer_grades_qaPairId_fkey" FOREIGN KEY ("qaPairId") REFERENCES "qa_pairs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_evaluations" ADD CONSTRAINT "code_evaluations_sessionTaskId_fkey" FOREIGN KEY ("sessionTaskId") REFERENCES "session_coding_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

import {
  Span,
  TraceAPI,
  Tracer,
  Context,
  SpanStatusCode,
} from "@opentelemetry/api";

import {
  WorkflowRunJobStep,
  WorkflowRunJob,
  WorkflowArtifactLookup,
} from "../github";
import { traceJunitArtifact } from "./trace-junit";

export type TraceWorkflowRunStepParams = {
  job: WorkflowRunJob;
  trace: TraceAPI;
  parentSpan: Span;
  parentContext: Context;
  tracer: Tracer;
  workflowArtifacts: WorkflowArtifactLookup;
  step?: WorkflowRunJobStep;
};
export async function traceWorkflowRunStep({
  job,
  parentContext,
  parentSpan,
  trace,
  tracer,
  workflowArtifacts,
  step,
}: TraceWorkflowRunStepParams) {
  if (!step || !step.completed_at || !step.started_at) {
    const stepName = step?.name || "UNDEFINED";
    console.warn(`Step ${stepName} is not completed yet`);
    return;
  }
  console.log(`Trace Step ${step.name}`);
  const ctx = trace.setSpan(parentContext, parentSpan);
  const startTime = new Date(step.started_at);
  const span = tracer.startSpan(
    step.name,
    {
      attributes: {
        "github.job.step.name": step.name,
        "github.job.step.number": step.number,
        error: step.conclusion === "failure",
      },
      startTime,
    },
    ctx
  );
  try {
    span.setStatus({ code: SpanStatusCode.ERROR });
    if (step.conclusion !== "failure") {
      span.setStatus({ code: SpanStatusCode.OK });
    }
    console.log(`Job Span: ${span.spanContext().spanId}: ${step.started_at}`);
    if (step.conclusion) {
      span.setAttribute("github.job.step.conclusion", step.conclusion);
    }
    await traceArtifact({
      trace,
      tracer,
      parentSpan: span,
      parentContext: ctx,
      job,
      step,
      startTime,
      workflowArtifacts,
    });
  } finally {
    span.end(new Date(step.completed_at));
  }
}

type TraceArtifactParams = {
  trace: TraceAPI;
  tracer: Tracer;
  parentContext: Context;
  parentSpan: Span;
  job: WorkflowRunJob;
  step: WorkflowRunJobStep;
  startTime: Date;
  workflowArtifacts: WorkflowArtifactLookup;
};

async function traceArtifact({
  trace,
  tracer,
  parentSpan,
  parentContext,
  job,
  step,
  startTime,
  workflowArtifacts,
}: TraceArtifactParams) {
  const artifact = workflowArtifacts(job.name, step.name);
  if (artifact) {
    await traceJunitArtifact({
      trace,
      tracer,
      parentContext,
      parentSpan,
      startTime,
      path: artifact.path,
    });
  } else {
    console.log(`No Artifact to trace for Job<${job.name}> Step<${step.name}>`);
  }
}
